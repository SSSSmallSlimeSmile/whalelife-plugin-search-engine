/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { randomUUID } from 'node:crypto';
import type { OptionalService } from 'whalelife';
import { publicConfig, object } from './config.ts';
import { SurfError, SearchExhaustedError, ProviderError, safeError } from './errors.ts';
import { parsePage, parseDuckDuckGo, parseBrave, parseAnySearch } from './content.ts';
import { isJsonSource, buildJsonRequest, parseJsonSearch } from './jsonsources.ts';
import { buildCustomRequest, parseCustom, guessJsonShape } from './custom.ts';
import type { JsonShapeGuess } from './custom.ts';
import { buildRequest, parseScholar, isScholarSource } from './scholar.ts';
import { buildFactRequest, parseFact, isFactSource } from './facts.ts';
import { detectStructured, fetchStructured } from './structured.ts';
import type { PublicFetcher, SurfConfig, SurfService, SurfStatus, OperationResult, ParsedPage,
  SearchData, SearchFailure, SearchItem, AggregateGroup, SearchProvider, SearchZone, SourceKind, PageData, ImageData, GalleryImageData, SearchInput, ReadInput, ImageInput, CallOptions, VisionService, GalleryService,
  ScholarData, ScholarInput, ScholarItem, ScholarGroup, ScholarSource,
  FactData, FactInput, FactFailure, FactItem } from './types.ts';

type StoredPage = ParsedPage & { sessionId: string; url: string; expires: number };
type StoredOffer = { sessionId: string; binding: OptionalService<VisionService>; media: ImageData; expires: number };
type StoredCollectionOffer = { sessionId: string; binding: OptionalService<GalleryService>; media: GalleryImageData; expires: number };
const PAGE_CHUNK = 6000;
/**
 * 这条结果是怎么来的。官方 JSON 接口回来的字段是可预期的；解析对方页面回来的，人家改一次版就变形；
 * 自定义来源由使用者自己填的映射决定，出错只有自己知道。这层标记让读结果的人能分出轻重，
 * 而不是靠标题猜。
 */
function kindOf(provider: SearchProvider): SourceKind {
  if (provider.startsWith('custom:')) return 'custom';
  return provider === 'duckduckgo' ? 'html' : 'api';
}
/** 给每条结果盖上 via 与 domain。域名叫不出名字就只盖 via，不编一个。 */
function annotate(results: SearchItem[], provider: SearchProvider): SearchItem[] {
  const via = kindOf(provider);
  return results.map(item => {
    let domain: string | undefined;
    try {
      const host = new URL(item.url).hostname.replace(/^www\./i, '').toLowerCase();
      if (host) domain = host;
    } catch { /* 相对地址或坏 URL：不盖 domain */ }
    return domain ? { ...item, via, domain } : { ...item, via };
  });
}
/**
 * 结果总量上限：按序列化后的长度算（JSON.stringify），不是字数。
 * 十条各带一千字摘要，就是一万字进上下文，之后每轮重发——这里给它一个刹车。
 * 超出时先截断最后一条的摘要，再超出就丢掉后面的条目；至少保留一条，不让结果变成“零条”。
 */
function trimResults(results: SearchItem[], maxChars: number): { results: SearchItem[]; truncated: number } {
  if (maxChars <= 0 || results.length === 0) return { results, truncated: 0 };
  const kept: SearchItem[] = [];
  let used = 2; // JSON array brackets
  for (const item of results) {
    const separator = kept.length ? 1 : 0;
    const room = maxChars - used - separator;
    const size = JSON.stringify(item).length;
    if (size <= room) {
      used += separator + size;
      kept.push(item);
      continue;
    }
    const skeleton = { ...item, snippet: '' };
    let space = room - JSON.stringify(skeleton).length;
    if (space >= 0 || kept.length === 0) {
      let snippet = '';
      for (const char of item.snippet) {
        space -= JSON.stringify(char).length - 2;
        if (space < 0) break;
        snippet += char;
      }
      kept.push({ ...skeleton, snippet });
    }
    break;
  }
  return { results: kept, truncated: results.length - kept.length };
}
/** 垂直搜索参数只对 anysearch 有意义；其余来源会在回执里说明被忽略。 */
type Vertical = { tag?: string; zone?: SearchZone; language?: string; params?: Record<string, string> };
/**
 * 同一篇的判据：DOI 和归一后的标题各算一个键，任一相同就算同一篇。
 *
 * 只按一种算会漏：arXiv 的解析器不填 DOI、OpenAlex 填了，同一篇在两段里就是两个不同的键，
 * 实测那次 KV-Repurpose 两边都出现了、overlap 却是 0。
 */
function scholarKeysOf(item: ScholarItem): string[] {
  const keys: string[] = [];
  const doi = item.doi?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
  if (doi) keys.push('doi:' + doi);
  const title = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  if (title) keys.push('title:' + title);
  return keys;
}

function verticalOf(input: SearchInput): Vertical {
  const result: Vertical = {};
  if (input.tag !== undefined) {
    if (typeof input.tag !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(input.tag)) throw new SurfError('invalid_input');
    result.tag = input.tag;
  }
  if (input.zone !== undefined) {
    if (input.zone !== 'cn' && input.zone !== 'intl') throw new SurfError('invalid_input');
    result.zone = input.zone;
  }
  if (input.language !== undefined) {
    if (typeof input.language !== 'string' || !/^[A-Za-z0-9-]{1,35}$/.test(input.language)) throw new SurfError('invalid_input');
    result.language = input.language;
  }
  if (input.params !== undefined) {
    if (!input.params || typeof input.params !== 'object' || Array.isArray(input.params)) throw new SurfError('invalid_input');
    const entries = Object.entries(input.params);
    if (entries.length === 0 || entries.length > 8) throw new SurfError('invalid_input');
    const clean: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!/^[A-Za-z0-9_]{1,32}$/.test(key)) throw new SurfError('invalid_input');
      if (typeof value !== 'string' || value.length > 200 || /[\x00-\x1f\x7f]/.test(value)) throw new SurfError('invalid_input');
      clean[key] = value;
    }
    result.params = clean;
  }
  return result;
}
/** 取来源 JSON 里的 message，过滤成可安全显示的一小段；取不到就返回空串。 */
function upstreamDetail(body: Buffer): string {
  try {
    const parsed = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    const raw = typeof parsed?.message === 'string' ? parsed.message : typeof parsed?.error === 'string' ? parsed.error : '';
    return raw.replace(/[^\x20-\x7e\u4e00-\u9fff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  } catch { return ''; }
}
function identity(input: unknown): string {
  if (typeof input !== 'string' || !input.trim() || input.length > 200 || /[\x00-\x1f\x7f]/.test(input)) throw new SurfError('session_required');
  return input;
}
function checkResponse(status: number) {
  if ([401, 403, 429, 503].includes(status)) throw new SurfError('access_blocked');
  if (status < 200 || status > 299) throw new SurfError('http_error');
}
function untilCancelled<T>(signal: AbortSignal, task: () => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new SurfError('cancelled'));
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener('abort', abort); reject(new SurfError('cancelled')); };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      if (signal.aborted) throw new SurfError('cancelled');
      return task();
    }).then(value => { signal.removeEventListener('abort', abort); resolve(value); },
      error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}


/** 条数预算：limit 是这一轮总共要几条，不是每家几条。先每家垫 1，剩下的按权重分。 */
function quotaFor(limit: number, weights: number[], available: number[]): number[] {
  const taken = available.map(() => 0);
  const indexes = available.map((count, index) => index).filter(index => available[index] > 0);
  let left = Math.max(0, limit);
  for (const index of indexes) {
    if (left <= 0) break;
    taken[index] = 1;
    left -= 1;
  }
  while (left > 0) {
    const hungry = indexes.filter(index => taken[index] < available[index]);
    if (hungry.length === 0) break;
    const sum = hungry.reduce((total, index) => total + Math.max(1, weights[index] ?? 1), 0);
    let moved = false;
    for (const index of hungry) {
      if (left <= 0) break;
      const weight = Math.max(1, weights[index] ?? 1);
      const add = Math.max(1, Math.floor(left * weight / sum));
      const cap = Math.min(add, available[index] - taken[index], left);
      if (cap > 0) { taken[index] += cap; left -= cap; moved = true; }
    }
    if (!moved) break;
  }
  return taken;
}

/** 段内按配额取，重复的排后面——同一条在别家已经出现过，就不该挤掉独有内容。 */
function takeCapped<T extends { dupOf?: string }>(items: T[], quota: number): { kept: T[]; dropped: number } {
  if (items.length <= quota) return { kept: items, dropped: 0 };
  const order = new Map<T, number>(items.map((item, index) => [item, index]));
  const kept = [...items.filter(item => !item.dupOf), ...items.filter(item => item.dupOf)].slice(0, quota);
  kept.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  return { kept, dropped: items.length - kept.length };
}

const KNOWN_PROVIDERS = new Set<string>(['anysearch', 'duckduckgo', 'brave', 'tavily', 'exa']);

export class SurfRuntime implements SurfService {
  config: SurfConfig;
  private fetcher: PublicFetcher;
  private aborter = new AbortController();
  private signal: AbortSignal;
  private now: () => number;
  private transient: boolean;
  private configValid: boolean;
  private stopped = false;
  private active = 0;
  private pages = new Map<string, StoredPage>();
  private offers = new Map<string, StoredOffer>();
  private imageRequests = new Set<string>();
  private cache = new Map<string, { expires: number; at: number; value: unknown }>();
  private vision?: OptionalService<VisionService>;
  private gallery?: OptionalService<GalleryService>;
  private galleryAborter = new AbortController();
  private collectionOffers = new Map<string, StoredCollectionOffer>();
  private collectionRequests = new Set<string>();
  constructor(config: SurfConfig, fetcher: PublicFetcher, options: { signal: AbortSignal; transient: boolean; configValid: boolean; now?: () => number }) {
    this.config = structuredClone(config); this.fetcher = fetcher; this.now = options.now ?? Date.now;
    this.signal = AbortSignal.any([options.signal, this.aborter.signal]);
    this.transient = options.transient; this.configValid = options.configValid;
  }
  /** 保存设置后立刻把新配置交给运行时，不用重载插件。 */
  setConfig(next: SurfConfig) {
    this.config = structuredClone(next);
    this.configValid = true;
    this.cache.clear();
    this.health.clear();
  }
  setVision(binding: OptionalService<VisionService> | undefined) {
    if (this.vision !== binding) this.offers.clear();
    this.vision = binding;
  }
  setGallery(binding: OptionalService<GalleryService> | undefined) {
    if (this.gallery === binding) return;
    this.galleryAborter.abort(); this.galleryAborter = new AbortController();
    this.collectionOffers.clear(); this.gallery = binding;
  }
  status(): SurfStatus {
    return { version: '1.0.0', ready: !this.stopped && !this.signal.aborted && this.transient && this.configValid,
      configValid: this.configValid, vision: this.visionAvailable(), gallery: this.galleryAvailable(),
      searchProvider: this.config.searchProviders[0], searchProviders: [...this.config.searchProviders], activeRequests: this.active };
  }
  settings() { return publicConfig(this.config); }
  private visionAvailable() { return !this.stopped && !this.signal.aborted && Boolean(this.vision && !this.vision.signal.aborted); }
  private galleryAvailable() { return !this.stopped && !this.signal.aborted && Boolean(this.gallery && !this.gallery.signal.aborted); }
  private async execute<T>(sessionId: unknown, options: CallOptions | undefined, task: (session: string, signal: AbortSignal) => Promise<T>): Promise<OperationResult<T>> {
    let entered = false;
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      if (!this.transient) throw new SurfError('host_required');
      if (!this.configValid) throw new SurfError('config_invalid');
      const session = identity(sessionId);
      const signal = options?.signal ? AbortSignal.any([this.signal, options.signal]) : this.signal;
      if (signal.aborted) throw new SurfError('cancelled');
      if (this.active >= this.config.concurrency) throw new SurfError('busy');
      this.active++; entered = true; this.prune();
      const data = await task(session, signal);
      if (signal.aborted) throw new SurfError(this.signal.aborted ? 'stopped' : 'cancelled');
      return { status: 'ok', data };
    } catch (error) {
      const safe = this.signal.aborted ? safeError(new SurfError('stopped')) : options?.signal?.aborted ? safeError(new SurfError('cancelled')) : safeError(error);
      return { status: 'error', error: safe };
    } finally { if (entered) this.active--; }
  }
  /** 缓存键：种类 + 决定结果的入参。配置一变就整表清掉，所以键里不用带来源链以外的设置。 */
  private cacheKey(kind: string, parts: unknown[]): string {
    return kind + '\u0000' + JSON.stringify(parts);
  }
  private cacheGet<T>(key: string): { data: T; agoMs: number } | undefined {
    const hit = this.cache.get(key);
    if (!hit) return undefined;
    if (hit.expires <= this.now()) { this.cache.delete(key); return undefined; }
    return { data: JSON.parse(JSON.stringify(hit.value)) as T, agoMs: Math.max(0, this.now() - hit.at) };
  }
  /** 只缓存成功且非空的结果：失败和零条都让下一次重新去问。 */
  private cachePut(config: SurfConfig, signal: AbortSignal, key: string, value: unknown) {
    if (config !== this.config || signal.aborted) return;
    const ttl = config.cacheSeconds;
    if (!ttl || ttl <= 0) return;
    while (this.cache.size >= 64) {
      const oldest = this.cache.keys().next();
      if (oldest.done) break;
      this.cache.delete(oldest.value);
    }
    const now = this.now();
    this.cache.set(key, { expires: now + ttl * 1000, at: now, value: JSON.parse(JSON.stringify(value)) });
  }
  private prune() {
    for (const [ref, page] of this.pages) if (page.expires <= this.now()) this.pages.delete(ref);
    for (const [key, offer] of this.offers) if (offer.expires <= this.now() || offer.binding.signal.aborted) this.offers.delete(key);
    for (const [key, offer] of this.collectionOffers) if (offer.expires <= this.now() || offer.binding.signal.aborted) this.collectionOffers.delete(key);
    for (const [key, hit] of this.cache) if (hit.expires <= this.now()) this.cache.delete(key);
  }
  private async releaseOffer(binding: OptionalService<VisionService>, sessionId: string, mediaRef: string) {
    if (binding.signal.aborted) return;
    const aborter = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(() => binding.service.release({ sessionId, mediaRef }, { signal: aborter.signal })).catch(() => {}),
        new Promise<void>(resolve => { timer = setTimeout(() => { aborter.abort(); resolve(); }, 500); timer.unref(); }),
      ]);
    } finally { if (timer) clearTimeout(timer); aborter.abort(); }
  }
  /** 设置页自定义来源「探一下」：打一发真请求，猜出数组位置和字段名。不写配置。 */
  async probeJson(input: { url?: string; method?: string; key?: string; query?: string }):
    Promise<{ ok: boolean; ms: number; detail: string } & Partial<JsonShapeGuess>> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      if (!this.configValid) throw new SurfError('config_invalid');
      const raw = typeof input.url === 'string' ? input.url.trim() : '';
      if (!raw || raw.length > 2048 || !raw.includes('{query}') || /[\x00-\x20\x7f]/.test(raw)) throw new SurfError('invalid_input');
      let probe: URL;
      try { probe = new URL(raw.split('{query}').join('x')); } catch { throw new SurfError('invalid_input'); }
      if (!['http:', 'https:'].includes(probe.protocol) || probe.username || probe.password) throw new SurfError('invalid_input');
      const method = input.method === 'POST' ? 'POST' : 'GET';
      const key = typeof input.key === 'string' ? input.key.trim().slice(0, 512) : '';
      if (/[\x00-\x20\x7f]/.test(key)) throw new SurfError('invalid_input');
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 80) : 'whalelife';
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (key) headers.Authorization = 'Bearer ' + key;
      let body: string | undefined;
      if (method === 'POST') { headers['Content-Type'] = 'application/json'; body = JSON.stringify({ query, limit: 3 }); }
      const response = await this.fetcher.get(raw.split('{query}').join(encodeURIComponent(query)), {
        method, body, signal, timeoutMs: budget, maxBytes: this.config.maxPageBytes,
        proxyUrl: this.config.proxyUrl, allowRedirects: false, headers });
      if (response.status < 200 || response.status > 299)
        throw new ProviderError([401, 403, 429].includes(response.status) ? 'access_blocked' : 'http_error', upstreamDetail(response.body));
      const guess = guessJsonShape(response.body);
      return { ok: true, ms: Math.round(performance.now() - started),
        detail: 'HTTP ' + response.status + ' · 数组在 ' + guess.items + ' · ' + guess.count + ' 个字段', ...guess };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code };
    }
  }
  /** 来源健康度：连续失败到阈值就进冷却，免得每次都拿预算去撞同一堵墙。 */
  private health = new Map<string, { fails: number; until: number; lastCode: string }>();
  private coolingLeft(name: string): number {
    const item = this.health.get(name);
    if (!item || item.until <= this.now()) return 0;
    return Math.max(1, Math.ceil((item.until - this.now()) / 1000));
  }
  private noteSourceFailure(config: SurfConfig, name: string, code: string): void {
    if (config.sourceCooldownSeconds <= 0) return;
    const item = this.health.get(name) ?? { fails: 0, until: 0, lastCode: '' };
    item.fails += 1;
    item.lastCode = code;
    if (item.fails >= config.sourceFailThreshold) item.until = this.now() + config.sourceCooldownSeconds * 1000;
    this.health.set(name, item);
  }
  private noteSourceSuccess(name: string): void {
    this.health.delete(name);
  }
  /** 每个来源最多等多久：用户给了就按它，但不超过这次剩下的预算。 */
  private sourceBudget(config: SurfConfig, name: string, index: number, count: number, remaining: number): number {
    const fixed = config.sourceTimeouts?.[name];
    if (typeof fixed === 'number' && fixed > 0) return Math.max(1, Math.min(fixed, Math.floor(remaining)));
    // 没有单独设过：首个来源最可能成，给剩余预算的 70%；其后的按剩余来源数均分。
    return count === 1 ? Math.floor(remaining)
      : Math.max(1, Math.floor(index === 0 ? remaining * 0.7 : remaining / (count - index)));
  }
  private page(session: string, ref: unknown): StoredPage {
    const page = typeof ref === 'string' ? this.pages.get(ref) : undefined;
    if (!page || page.sessionId !== session || page.expires <= this.now()) throw new SurfError('page_unavailable');
    return page;
  }
  /** 设置页「试一下」用：只打一个来源，不写配置、不进回执。 */
  async probe(input: { provider?: string; tag?: string; params?: unknown; query?: string }): Promise<{ ok: boolean; ms: number; detail: string }> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      if (!this.configValid) throw new SurfError('config_invalid');
      const vertical = verticalOf({ tag: input.tag, params: input.params as Record<string, string> | undefined } as SearchInput);
      const provider = (input.provider ?? (vertical.tag ? 'anysearch' : this.config.searchProviders[0])) as SearchProvider;
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 80) : 'whalelife';
      const results = await untilCancelled(signal, () => this.searchSource(provider, query, 3, signal, budget, vertical));
      return { ok: true, ms: Math.round(performance.now() - started), detail: results.length + ' 条结果' };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code };
    }
  }
  search(input: SearchInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<SearchData>> {
    return this.execute(input?.sessionId, options, async (_session, signal) => {
      const config = this.config;
      object(input);
      if (typeof input.query !== 'string' || !input.query.trim() || input.query.length > 600 || /[\x00-\x1f\x7f]/.test(input.query)) throw new SurfError('invalid_input');
      const limit = input.limit ?? config.resultsLimit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new SurfError('invalid_input');
      const providers = config.searchProviders;
      const vertical = verticalOf(input);
      // 聚合 / 混合：并发打全链，分段列出，不排序。见 searchAggregated。
      if (config.searchMode === 'aggregate' || config.searchMode === 'hybrid')
        return this.searchAggregated(input.query.trim(), limit, vertical, signal, config, config.searchMode === 'hybrid');
      const cacheKey = this.cacheKey('search', [input.query.trim(), limit, providers, vertical]);
      const cached = this.cacheGet<SearchData>(cacheKey);
      if (cached) return { ...cached.data, cached: true, cachedAgoMs: cached.agoMs };
      const notes: string[] = [];
      const wantsVertical = vertical.tag !== undefined || vertical.zone !== undefined || vertical.language !== undefined;
      if (wantsVertical) {
        if (!providers.includes('anysearch')) notes.push('这次带了 tag/zone/language，但搜索来源里没有 anysearch，这几个参数没有生效。');
        else for (const provider of providers) if (provider !== 'anysearch') notes.push(provider + ' 不支持垂直搜索，tag/zone/language 只交给 anysearch。');
      }
      const deadline = performance.now() + config.timeoutMs;
      const fallback: SearchFailure[] = [];
      let lastCode: ReturnType<typeof safeError>['code'] = 'search_exhausted';
      let answered = false;
      let answeredCode: 'search_empty' | undefined;
      const forceAll = providers.every(name => this.coolingLeft(name) > 0);
      for (const [index, provider] of providers.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
          const cooling = forceAll ? 0 : this.coolingLeft(provider);
          if (cooling > 0) {
            fallback.push({ provider, elapsedMs: 0, code: 'source_cooling', reason: '上次连续失败，冷却中，还剩 ' + cooling + ' 秒，这次跳过。' });
            continue;
          }
          const timeoutMs = this.sourceBudget(config, provider, index, providers.length, remaining);
          limitSignal = AbortSignal.timeout(timeoutMs);
          const attemptSignal = AbortSignal.any([signal, limitSignal]);
          const results = await untilCancelled(attemptSignal, () => this.searchSource(provider, input.query.trim(), limit, attemptSignal, timeoutMs, vertical, config));
          if (limitSignal.aborted || performance.now() - started >= timeoutMs) throw new SurfError('timeout');
          answered = true;
          if (results.length === 0) {
            // 连上了、返回零条：这是答案不是故障。记下原因，继续试下一个来源。
            answeredCode = 'search_empty';
            fallback.push({ provider, elapsedMs: Math.round(performance.now() - started), code: 'search_empty', reason: '来源返回零条结果。' });
            continue;
          }
          this.noteSourceSuccess(provider);
          const trimmed = trimResults(annotate(results, provider), config.resultsMaxChars);
          const found: SearchData = { provider, sourceKind: kindOf(provider), results: trimmed.results, untrusted: true, elapsedMs: Math.round(performance.now() - started),
            ...(trimmed.truncated ? { truncated: trimmed.truncated } : {}),
            ...(fallback.length ? { fallback } : {}), ...(notes.length ? { notes } : {}) };
          this.cachePut(config, signal, cacheKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
          this.noteSourceFailure(config, provider, failure.code);
          fallback.push({ provider, elapsedMs: Math.round(performance.now() - started), code: failure.code, reason: failure.message });
        }
      }
      throw new SearchExhaustedError(answered && answeredCode ? answeredCode : providers.length === 1 ? lastCode : 'search_exhausted',
        fallback.map(item => item.provider + ' (' + item.elapsedMs + ' ms): ' + item.reason).join(' '));
    });
  }
  /**
   * 聚合：分批并发出链上的来源，各自成段原样列出。不排序、不合并——三家谁更相关我们判不了，
   * 按出现次数排出来的顺序只是看着像评测。
   *
   * 批次：先并发打前 aggregateConcurrency 家（默认 2），去重后的条目还不够 limit 时再补下一家，
   * 直到够或打完。链序就是主次——一级在前，二级在后。
   *
   * 预算：resultsMaxChars 按各家的权重切成份额，权重高的拿得多；一级缺省 3，二级缺省 1。
   * 唯一做的是标重复：同一条 URL 被两家给出时，后来的那条带 dupOf，顶层给 overlap。
   * 条目都在 groups 里，顶层 results 留空，免得同一批内容在回执里出现两遍。
   */
  private async searchAggregated(query: string, limit: number, vertical: ReturnType<typeof verticalOf>, signal: AbortSignal, config: SurfConfig, hybrid = false): Promise<SearchData> {
    const providers = config.searchProviders;
    const mode = hybrid ? 'hybrid' as const : 'aggregate' as const;
    const cacheKey = this.cacheKey('search-agg', [query, limit, providers, vertical, mode, config.aggregateConcurrency]);
    const cached = this.cacheGet<SearchData>(cacheKey);
    if (cached) return { ...cached.data, cached: true, cachedAgoMs: cached.agoMs };
    const notes: string[] = [];
    if (vertical.tag !== undefined || vertical.zone !== undefined || vertical.language !== undefined)
      notes.push('聚合模式下 tag/zone/language 只对 anysearch 生效，其它来源会忽略。');
    const started = performance.now();
    const forceAll = providers.every(name => this.coolingLeft(name) > 0);
    // 打一次；失败不抛，交给调用方决定要不要用二级顶上。
    const attempt = async (name: SearchProvider, budgetMs: number): Promise<{ results: SearchItem[]; elapsedMs: number; error?: { code: string; reason: string } }> => {
      const at = performance.now();
      const limitSignal = AbortSignal.timeout(Math.max(1, budgetMs));
      const attemptSignal = AbortSignal.any([signal, limitSignal]);
      try {
        const results = await untilCancelled(attemptSignal, () => this.searchSource(name, query, limit, attemptSignal, budgetMs, vertical, config));
        if (limitSignal.aborted) throw new SurfError('timeout');
        return { results, elapsedMs: Math.round(performance.now() - at) };
      } catch (error) {
        if (signal.aborted) throw new SurfError('cancelled');
        const failure = safeError(limitSignal.aborted || performance.now() - at >= budgetMs ? new SurfError('timeout') : error);
        return { results: [], elapsedMs: Math.round(performance.now() - at), error: { code: failure.code, reason: failure.message } };
      }
    };
    const raw: (AggregateGroup | undefined)[] = new Array(providers.length).fill(undefined);
    const runOne = async (index: number): Promise<void> => {
      const provider = providers[index];
      const cooling = forceAll ? 0 : this.coolingLeft(provider);
      if (cooling > 0) {
        raw[index] = { provider, elapsedMs: 0, results: [], skipped: '上次连续失败，冷却中，还剩 ' + cooling + ' 秒' };
        return;
      }
      const budget = Math.min(config.sourceTimeouts[provider] ?? config.timeoutMs, config.timeoutMs);
      const main = await attempt(provider, budget);
      if (!main.error && main.results.length > 0) {
        this.noteSourceSuccess(provider);
        raw[index] = { provider, sourceKind: kindOf(provider), elapsedMs: main.elapsedMs, results: annotate(main.results, provider) };
        return;
      }
      // 没拿到结果。失败要记健康；零条算应答，不记账。
      if (main.error) this.noteSourceFailure(config, provider, main.error.code);
      const why = main.error ?? { code: 'search_empty', reason: '来源返回零条结果。' };
      // 二级来源自己不再挂二级，免得绕成一条链。
      const secondary = config.providerTiers[provider] === 2 ? '' : config.providerFallbacks[provider];
      if (!secondary) { raw[index] = { provider, elapsedMs: main.elapsedMs, results: [], error: why }; return; }
      if (providers.includes(secondary as SearchProvider) && !(forceAll && this.coolingLeft(secondary) > 0)) {
        notes.push(provider + ' 没拿到结果，二级来源 ' + secondary + ' 已经在链上并发打过，这次不重打，看它那一段。');
        raw[index] = { provider, elapsedMs: main.elapsedMs, results: [], error: why,
          standby: { provider: secondary, elapsedMs: 0, reason: why.reason + '（二级已在链上，没有重打）' } };
        return;
      }
      const backupBudget = Math.min(config.sourceTimeouts[secondary] ?? config.timeoutMs, config.timeoutMs);
      const backup = await attempt(secondary as SearchProvider, backupBudget);
      const total = main.elapsedMs + backup.elapsedMs;
      if (backup.error) {
        this.noteSourceFailure(config, secondary, backup.error.code);
        raw[index] = { provider, elapsedMs: total, results: [], error: why,
          standby: { provider: secondary, elapsedMs: backup.elapsedMs, reason: why.reason, error: backup.error } };
        return;
      }
      if (backup.results.length === 0) {
        raw[index] = { provider, elapsedMs: total, results: [], error: why,
          standby: { provider: secondary, elapsedMs: backup.elapsedMs, reason: why.reason, error: { code: 'search_empty', reason: '二级来源也返回零条。' } } };
        return;
      }
      this.noteSourceSuccess(secondary);
      raw[index] = { provider, sourceKind: kindOf(secondary as SearchProvider), elapsedMs: total, results: annotate(backup.results, secondary as SearchProvider), error: why,
        standby: { provider: secondary, elapsedMs: backup.elapsedMs, reason: why.reason } };
    };
    // 跨组去重后的条数：补下一家的判据。
    const uniqueCount = (): number => {
      const seen = new Set<string>();
      for (const group of raw) {
        if (!group) continue;
        for (const item of group.results) seen.add(item.url.trim().replace(/#.*$/, ''));
      }
      return seen.size;
    };
    const parallel = Math.max(1, Math.min(config.aggregateConcurrency, providers.length));
    await Promise.all(Array.from({ length: parallel }, (_, index) => runOne(index)));
    let cursor = parallel;
    while (cursor < providers.length && uniqueCount() < limit) {
      await runOne(cursor);
      cursor += 1;
    }
    if (signal.aborted) throw new SurfError('cancelled');
    const groups = raw.filter((group): group is AggregateGroup => group !== undefined);
    if (cursor < providers.length && uniqueCount() >= limit)
      notes.push('前 ' + cursor + ' 家去重后已经有 ' + uniqueCount() + ' 条，够 limit，剩下的 ' + (providers.length - cursor) + ' 家这次没打。');
    // 重复：同一 URL 先出现的算主，后面几家里的标 dupOf。
    const first = new Map<string, string>();
    let overlap = 0;
    for (const group of groups) {
      for (const item of group.results) {
        const key = item.url.trim().replace(/#.*$/, '');
        const owner = first.get(key);
        if (owner === undefined) { first.set(key, group.provider); continue; }
        if (owner !== group.provider && !item.dupOf) { item.dupOf = owner; overlap += 1; }
      }
    }
    // 条数预算是全局的：limit 是这一轮要几条，不是每家几条。先去重，再分名额。
    {
      const valid = groups.filter(group => group.results.length > 0);
      if (valid.length > 0) {
        const weights = valid.map(group => this.weightOf(group.provider, config));
        const quotas = quotaFor(limit, weights, valid.map(group => group.results.length));
        valid.forEach((group, index) => {
          const { kept, dropped } = takeCapped(group.results, quotas[index]);
          if (dropped > 0) group.truncated = (group.truncated ?? 0) + dropped;
          group.results = kept;
        });
      }
    }
    // 权重切预算：先算份额再裁，不让排在前面的先到先得吃掉整份。
    const totalChars = config.resultsMaxChars;
    if (totalChars > 0) {
      // 空段（超时、零条、被条数预算取空）不参与分预算，否则它那份白扔。
      const pool = groups.filter(group => group.results.length > 0);
      const weights = pool.map(group => this.weightOf(group.provider, config));
      const sum = weights.reduce((left, right) => left + right, 0) || pool.length;
      for (const group of groups) group.weight = this.weightOf(group.provider, config);
      pool.forEach((group, index) => {
        const share = Math.max(1, Math.floor(totalChars * weights[index] / sum));
        group.budgetChars = share;
        const trimmed = trimResults(group.results, share);
        if (trimmed.truncated) group.truncated = (group.truncated ?? 0) + trimmed.truncated;
        group.results = trimmed.results;
      });
    }
    if (!groups.some(group => group.results.length > 0)) {
      // 二级也失败时，它的原因同样要带出来，否则读的人只看到原来那家为什么挂。
      const why = groups.map(group => {
        const head = group.provider + (group.error ? ' (' + group.elapsedMs + ' ms): ' + group.error.reason
          : group.skipped ? '：' + group.skipped : '：零条');
        return group.standby?.error ? head + '；二级 ' + group.standby.provider + '：' + group.standby.error.reason : head;
      }).join(' ');
      throw new SearchExhaustedError('search_exhausted', why);
    }
    const data: SearchData = { provider: 'aggregate', mode, groups, results: [], overlap: overlap, untrusted: true,
      elapsedMs: Math.round(performance.now() - started),
      ...(notes.length ? { notes } : {}) };
    // 混合：链上顺序就是主次顺序。第一个给出结果的当主，前面的几家记下为什么没顶上。
    if (hybrid) {
      const index = groups.findIndex(group => group.results.length > 0);
      const pick = index >= 0 ? groups[index] : undefined;
      if (pick) {
        data.primary = pick.provider;
        const ahead: SearchFailure[] = groups.slice(0, index).map(group => ({
          provider: group.provider as SearchProvider,
          elapsedMs: group.elapsedMs,
          code: group.error?.code ?? (group.skipped ? 'source_cooling' : 'search_empty'),
          reason: group.error?.reason ?? group.skipped ?? '来源返回零条结果。',
        }));
        if (ahead.length) data.primaryFallback = ahead;
      }
    }
    this.cachePut(config, signal, cacheKey, data);
    return data;
  }
  /** 权重：配过就用配置的；没配过，一级缺省 3、二级缺省 1。只决定分多少字，不决定谁排前面。 */
  private weightOf(provider: string, config: SurfConfig): number {
    const explicit = config.providerWeights[provider];
    if (typeof explicit === 'number' && Number.isInteger(explicit)) return explicit;
    return config.providerTiers[provider] === 2 ? 1 : 3;
  }

  /**
   * 学术聚合：并发出链上的学术来源，各自成段原样列出，不排序。
   *
   * 四家覆盖的不一样：arXiv 只有预印本，Crossref 只有注册了 DOI 的，OpenAlex 带被引数，
   * Semantic Scholar 常限流。顺序回退下第一家一有结果后面就永不上场——网页那边实测十次十次停在第一家，
   * 这里是同一个毛病。零条同样算应答：连上了、没这篇，不是故障。
   *
   * 预算按家数均分，不套网页那套一级/二级权重：那边的键是网页来源名，学术这边没有对应的配置。
   */
  private async scholarAggregated(query: string, limit: number, yearMin: number | undefined,
    sources: ScholarSource[], signal: AbortSignal, config: SurfConfig): Promise<ScholarData> {
    const cacheKey = this.cacheKey('scholar-agg', [query, limit, sources, yearMin ?? null, config.aggregateConcurrency]);
    const cached = this.cacheGet<ScholarData>(cacheKey);
    if (cached) return { ...cached.data, cached: true, cachedAgoMs: cached.agoMs };
    const started = performance.now();
    const notes: string[] = [];
    const forceAll = sources.every(name => this.coolingLeft(name) > 0);
    // 打一次；失败不抛，交给整次调用决定要不要报全挂。
    const attempt = async (source: ScholarSource, budgetMs: number):
      Promise<{ items: ScholarItem[]; elapsedMs: number; error?: { code: string; reason: string } }> => {
      const at = performance.now();
      const limitSignal = AbortSignal.timeout(Math.max(1, budgetMs));
      const attemptSignal = AbortSignal.any([signal, limitSignal]);
      try {
        const request = buildRequest(source, query, limit, config.scholarMailto, config.scholarCustomSources, config.semanticScholarApiKey);
        const items = await untilCancelled(attemptSignal, async () => {
          const response = await this.fetcher.get(request.url, { signal: attemptSignal, timeoutMs: budgetMs,
            maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl,
            allowRedirects: request.allowRedirects ?? true, headers: request.headers,
            ...(request.method ? { method: request.method } : {}), ...(request.body ? { body: request.body } : {}) });
          checkResponse(response.status);
          return parseScholar(source, response.body, limit, config.scholarCustomSources);
        });
        if (limitSignal.aborted) throw new SurfError('timeout');
        return { items, elapsedMs: Math.round(performance.now() - at) };
      } catch (error) {
        if (signal.aborted) throw new SurfError('cancelled');
        const failure = safeError(limitSignal.aborted || performance.now() - at >= budgetMs ? new SurfError('timeout') : error);
        return { items: [], elapsedMs: Math.round(performance.now() - at), error: { code: failure.code, reason: failure.message } };
      }
    };
    const raw: (ScholarGroup | undefined)[] = new Array(sources.length).fill(undefined);
    const runOne = async (index: number): Promise<void> => {
      const source = sources[index];
      const cooling = forceAll ? 0 : this.coolingLeft(source);
      if (cooling > 0) {
        raw[index] = { source, elapsedMs: 0, items: [], skipped: '上次连续失败，冷却中，还剩 ' + cooling + ' 秒' };
        return;
      }
      const budget = Math.min(config.sourceTimeouts[source] ?? config.timeoutMs, config.timeoutMs);
      const one = await attempt(source, budget);
      if (!one.error && one.items.length > 0) {
        const kept = yearMin === undefined ? one.items : one.items.filter(item => item.year === undefined || item.year >= yearMin);
        if (kept.length === 0) {
          raw[index] = { source, elapsedMs: one.elapsedMs, items: [],
            error: { code: 'search_empty', reason: '按 yearMin 过滤掉 ' + (one.items.length - kept.length) + ' 条之后没有剩下的。' } };
          return;
        }
        this.noteSourceSuccess(source);
        raw[index] = { source, elapsedMs: one.elapsedMs, items: kept };
        return;
      }
      // 零条算应答，不记健康账；真失败才记。
      if (one.error) this.noteSourceFailure(config, source, one.error.code);
      raw[index] = { source, elapsedMs: one.elapsedMs, items: [],
        error: one.error ?? { code: 'search_empty', reason: '来源返回零条结果。' } };
    };
    // 按篇计数，不按键计数：一篇同时有 DOI 和标题两个键，算两条会把“够不够 limit”算高。
    const uniqueCount = (): number => {
      const seen = new Set<string>();
      let count = 0;
      for (const group of raw) for (const item of group?.items ?? []) {
        const keys = scholarKeysOf(item);
        if (keys.some(key => seen.has(key))) continue;
        count += 1;
        for (const key of keys) seen.add(key);
      }
      return count;
    };
    const parallel = Math.max(1, Math.min(config.aggregateConcurrency, sources.length));
    await Promise.all(Array.from({ length: parallel }, (_, index) => runOne(index)));
    let cursor = parallel;
    while (cursor < sources.length && uniqueCount() < limit) {
      await runOne(cursor);
      cursor += 1;
    }
    if (signal.aborted) throw new SurfError('cancelled');
    const groups = raw.filter((group): group is ScholarGroup => group !== undefined);
    if (cursor < sources.length && uniqueCount() >= limit)
      notes.push('前 ' + cursor + ' 家去重后已经有 ' + uniqueCount() + ' 条，够 limit，剩下的 ' + (sources.length - cursor) + ' 家这次没打。');
    // 同一篇被两家给出：DOI 相同、或标题归一后相同。后来那条标 dupOf，条目仍留在它自己那一段里。
    const first = new Map<string, string>();
    let overlap = 0;
    for (const group of groups) {
      for (const item of group.items) {
        const keys = scholarKeysOf(item);
        const owner = keys.map(key => first.get(key)).find(value => value !== undefined);
        if (owner === undefined) {
          for (const key of keys) if (!first.has(key)) first.set(key, group.source);
          continue;
        }
        if (owner !== group.source) { item.dupOf = owner; overlap += 1; }
        // 同一篇后来又贡献了新键（比如这家填了 DOI，前面那家没填），补登记，后面的来源才认得。
        for (const key of keys) if (!first.has(key)) first.set(key, group.source);
      }
    }
    // 条数预算同样是全局的：limit 是这一轮要几篇，不是每家几篇。
    {
      const valid = groups.filter(group => group.items.length > 0);
      if (valid.length > 0) {
        const quotas = quotaFor(limit, valid.map(() => 1), valid.map(group => group.items.length));
        valid.forEach((group, index) => {
          const { kept, dropped } = takeCapped(group.items, quotas[index]);
          if (dropped > 0) group.truncated = (group.truncated ?? 0) + dropped;
          group.items = kept;
        });
      }
    }
    // 预算按家数均分再裁；摘要按整条序列化后的长度算，不按字数——中文一个字符三个字节，字数会低估。
    const total = config.resultsMaxChars;
    if (total > 0 && groups.length > 0) {
      const share = Math.max(200, Math.floor(total / groups.length));
      groups.forEach(group => {
        group.budgetChars = share;
        if (group.items.length === 0) return;
        const kept: ScholarItem[] = [];
        let used = 0;
        for (const item of group.items) {
          const size = JSON.stringify(item).length;
          if (kept.length > 0 && used + size > share) { group.truncated = (group.truncated ?? 0) + 1; continue; }
          kept.push(item);
          used += size;
        }
        group.items = kept;
      });
    }
    if (!groups.some(group => group.items.length > 0)) {
      const why = groups.map(group => group.source + (group.error ? ' (' + group.elapsedMs + ' ms): ' + group.error.reason
        : group.skipped ? '：' + group.skipped : '：零条')).join(' ');
      throw new SearchExhaustedError('search_exhausted', why);
    }
    const data: ScholarData = { source: 'aggregate', mode: 'aggregate', groups, items: [], overlap,
      untrusted: true, elapsedMs: Math.round(performance.now() - started),
      ...(notes.length ? { notes } : {}) };
    this.cachePut(config, signal, cacheKey, data);
    return data;
  }
  /** 学术搜索：四个公开来源顺序回退；连上但零条算应答，不一路试到“全挂”。 */
  scholar(input: ScholarInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<ScholarData>> {
    return this.execute(input?.sessionId, options, async (_session, signal) => {
      const config = this.config;
      object(input);
      if (!config.scholarEnabled) throw new SurfError('search_unconfigured');
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query || query.length > 300 || /[\x00-\x1f\x7f]/.test(query)) throw new SurfError('invalid_input');
      const limit = input.limit ?? config.resultsLimit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new SurfError('invalid_input');
      let yearMin: number | undefined;
      if (input.yearMin !== undefined) {
        if (!Number.isInteger(input.yearMin) || input.yearMin < 1900 || input.yearMin > 2100) throw new SurfError('invalid_input');
        yearMin = input.yearMin;
      }
      let sources = config.scholarSources;
      if (input.sources !== undefined) {
        const list = input.sources;
        if (!Array.isArray(list) || list.length === 0 || list.length > 4 ||
            !list.every(item => isScholarSource(item, config.scholarCustomSources)) ||
            new Set(list).size !== list.length) throw new SurfError('invalid_input');
        sources = [...list];
      }
      // 聚合模式：并发出链上的学术来源，各自成段列出。事实查询不走这条，仍按顺序回退。
      if (config.searchMode === 'aggregate')
        return this.scholarAggregated(query, limit, yearMin, sources, signal, config);
      const scholarKey = this.cacheKey('scholar', [query, limit, sources, yearMin ?? null]);
      const scholarHit = this.cacheGet<ScholarData>(scholarKey);
      if (scholarHit) return { ...scholarHit.data, cached: true, cachedAgoMs: scholarHit.agoMs };
      const deadline = performance.now() + config.timeoutMs;
      const fallback: SearchFailure[] = [];
      let lastCode: ReturnType<typeof safeError>['code'] = 'search_exhausted';
      let answeredCode: 'search_empty' | undefined;
      let answered = false;
      const forceAll = sources.every(name => this.coolingLeft(name) > 0);
      for (const [index, source] of sources.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
          const cooling = forceAll ? 0 : this.coolingLeft(source);
          if (cooling > 0) {
            fallback.push({ provider: source as unknown as SearchProvider, elapsedMs: 0, code: 'source_cooling', reason: '上次连续失败，冷却中，还剩 ' + cooling + ' 秒，这次跳过。' });
            continue;
          }
          const timeoutMs = this.sourceBudget(config, source, index, sources.length, remaining);
          limitSignal = AbortSignal.timeout(timeoutMs);
          const attemptSignal = AbortSignal.any([signal, limitSignal]);
          const request = buildRequest(source, query, limit, config.scholarMailto, config.scholarCustomSources, config.semanticScholarApiKey);
          const items: ScholarItem[] = await untilCancelled(attemptSignal, async () => {
            const response = await this.fetcher.get(request.url, { signal: attemptSignal, timeoutMs,
              maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl,
              allowRedirects: request.allowRedirects ?? true, headers: request.headers,
              ...(request.method ? { method: request.method } : {}), ...(request.body ? { body: request.body } : {}) });
            checkResponse(response.status);
            return parseScholar(source, response.body, limit, config.scholarCustomSources);
          });
          if (limitSignal.aborted || performance.now() - started >= timeoutMs) throw new SurfError('timeout');
          answered = true;
          const kept = yearMin === undefined ? items : items.filter(item => item.year === undefined || item.year >= yearMin);
          const notes: string[] = [];
          if (kept.length === 0) {
            answeredCode = 'search_empty';
            fallback.push({ provider: source as unknown as SearchProvider, elapsedMs: Math.round(performance.now() - started),
              code: 'search_empty', reason: '来源返回零条结果。' });
            continue;
          }
          if (kept.length < items.length) notes.push('按 yearMin 过滤掉 ' + (items.length - kept.length) + ' 条早于 ' + yearMin + ' 年的记录。');
          this.noteSourceSuccess(source);
          const found: ScholarData = { source, items: kept, untrusted: true as const, elapsedMs: Math.round(performance.now() - started),
            ...(fallback.length ? { fallback } : {}), ...(notes.length ? { notes } : {}) };
          this.cachePut(config, signal, scholarKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
          this.noteSourceFailure(config, source, failure.code);
          fallback.push({ provider: source as unknown as SearchProvider, elapsedMs: Math.round(performance.now() - started),
            code: failure.code, reason: failure.message });
        }
      }
      throw new SearchExhaustedError(answered && answeredCode ? answeredCode : sources.length === 1 ? lastCode : 'search_exhausted',
        fallback.map(item => item.provider + ' (' + item.elapsedMs + ' ms): ' + item.reason).join(' '));
    });
  }
  /** 事实查询：维基/维基数据/OpenLibrary/OEIS，顺序回退，零条算应答。 */
  facts(input: FactInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<FactData>> {
    return this.execute(input?.sessionId, options, async (_session, signal) => {
      const config = this.config;
      object(input);
      if (!config.factsEnabled) throw new SurfError('search_unconfigured');
      const query = typeof input.query === 'string' ? input.query.trim() : '';
      if (!query || query.length > 300 || /[\x00-\x1f\x7f]/.test(query)) throw new SurfError('invalid_input');
      const limit = input.limit ?? config.resultsLimit;
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new SurfError('invalid_input');
      const lang = input.lang === 'zh' || input.lang === 'en' ? input.lang : config.factsLang;
      let sources = config.factsSources;
      if (input.sources !== undefined) {
        const list = input.sources;
        if (!Array.isArray(list) || list.length === 0 || list.length > 4 ||
            !list.every(item => isFactSource(item, config.factsCustomSources)) ||
            new Set(list).size !== list.length) throw new SurfError('invalid_input');
        sources = [...list];
      }
      const factKey = this.cacheKey('facts', [query, limit, sources, lang]);
      const factHit = this.cacheGet<FactData>(factKey);
      if (factHit) return { ...factHit.data, cached: true, cachedAgoMs: factHit.agoMs };
      const deadline = performance.now() + config.timeoutMs;
      const fallback: FactFailure[] = [];
      let lastCode: ReturnType<typeof safeError>['code'] = 'search_exhausted';
      let answered = false;
      let answeredCode: 'search_empty' | undefined;
      const forceAll = sources.every(name => this.coolingLeft(name) > 0);
      for (const [index, source] of sources.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
          const cooling = forceAll ? 0 : this.coolingLeft(source);
          if (cooling > 0) {
            fallback.push({ source, elapsedMs: 0, code: 'source_cooling', reason: '上次连续失败，冷却中，还剩 ' + cooling + ' 秒，这次跳过。' });
            continue;
          }
          const timeoutMs = this.sourceBudget(config, source, index, sources.length, remaining);
          limitSignal = AbortSignal.timeout(timeoutMs);
          const attemptSignal = AbortSignal.any([signal, limitSignal]);
          const request = buildFactRequest(source, query, limit, lang, config.factsCustomSources);
          const items: FactItem[] = await untilCancelled(attemptSignal, async () => {
            const response = await this.fetcher.get(request.url, { signal: attemptSignal, timeoutMs,
              maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl,
              allowRedirects: request.allowRedirects ?? true, headers: request.headers,
              ...(request.method ? { method: request.method } : {}), ...(request.body ? { body: request.body } : {}) });
            checkResponse(response.status);
            return parseFact(source, response.body, limit, lang, config.factsCustomSources);
          });
          if (limitSignal.aborted || performance.now() - started >= timeoutMs) throw new SurfError('timeout');
          answered = true;
          if (items.length === 0) {
            answeredCode = 'search_empty';
            fallback.push({ source, elapsedMs: Math.round(performance.now() - started), code: 'search_empty',
              reason: '来源返回零条结果。' });
            continue;
          }
          this.noteSourceSuccess(source);
          const found: FactData = { source, items, untrusted: true as const, elapsedMs: Math.round(performance.now() - started),
            ...(fallback.length ? { fallback } : {}) };
          this.cachePut(config, signal, factKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
          this.noteSourceFailure(config, source, failure.code);
          fallback.push({ source, elapsedMs: Math.round(performance.now() - started), code: failure.code, reason: failure.message });
        }
      }
      throw new SearchExhaustedError(answered && answeredCode ? answeredCode : sources.length === 1 ? lastCode : 'search_exhausted',
        fallback.map(item => item.source + ' (' + item.elapsedMs + ' ms): ' + item.reason).join(' '));
    });
  }
  /** 设置页「试一下」用：只打一个事实源，不写配置、不进回执。 */
  async probeFact(input: { source?: string; query?: string; lang?: string }): Promise<{ ok: boolean; ms: number; detail: string }> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      const source = isFactSource(input.source, this.config.factsCustomSources) ? input.source : this.config.factsSources[0];
      const lang = input.lang === 'en' ? 'en' : this.config.factsLang;
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 200) : 'Brisbane';
      const request = buildFactRequest(source, query, 3, lang, this.config.factsCustomSources);
      const items = await untilCancelled(signal, async () => {
        const response = await this.fetcher.get(request.url, { signal, timeoutMs: budget,
          maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl,
          allowRedirects: request.allowRedirects ?? true, headers: request.headers,
          ...(request.method ? { method: request.method } : {}), ...(request.body ? { body: request.body } : {}) });
        checkResponse(response.status);
        return parseFact(source, response.body, 3, lang, this.config.factsCustomSources);
      });
      const sample = items[0]?.title ? ' 首条：' + items[0].title.slice(0, 60) : '';
      return { ok: true, ms: Math.round(performance.now() - started), detail: items.length + ' 条结果' + sample };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code };
    }
  }
  /** 设置页「四家一起」用：按当前链并发打一轮，各自成段返回，不写配置、不进回执。 */
  async probeScholarAll(input: { query?: string }): Promise<{ ok: boolean; ms: number; detail?: string;
    sources: { source: string; ok: boolean; ms: number; count: number; titles: string[]; reason?: string }[] }> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      const config = this.config;
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 200) : 'transformer';
      const budget = Math.min(config.timeoutMs, 20_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const data = await this.scholarAggregated(query, 3, undefined, config.scholarSources, signal, config);
      const sources = (data.groups ?? []).map(group => ({
        source: group.source,
        ok: group.items.length > 0,
        ms: group.elapsedMs,
        count: group.items.length,
        titles: group.items.slice(0, 3).map(item => String(item.title || '').slice(0, 100)),
        ...(group.error ? { reason: group.error.reason } : {}),
        ...(!group.error && group.items.length === 0 ? { reason: group.skipped || '零条' } : {}),
      }));
      return { ok: sources.some(item => item.ok), ms: Math.round(performance.now() - started), sources };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code, sources: [] };
    }
  }
  /** 设置页「试一下」用：只打一个学术来源，不写配置、不进回执。 */
  async probeScholar(input: { source?: string; query?: string }): Promise<{ ok: boolean; ms: number; detail: string }> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      const source = isScholarSource(input.source, this.config.scholarCustomSources) ? input.source : this.config.scholarSources[0];
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 200) : 'transformer';
      const request = buildRequest(source, query, 3, this.config.scholarMailto, this.config.scholarCustomSources, this.config.semanticScholarApiKey);
      const items = await untilCancelled(signal, async () => {
        const response = await this.fetcher.get(request.url, { signal, timeoutMs: budget,
          maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl,
          allowRedirects: request.allowRedirects ?? true, headers: request.headers,
          ...(request.method ? { method: request.method } : {}), ...(request.body ? { body: request.body } : {}) });
        if (response.status < 200 || response.status > 299)
          throw new ProviderError([401, 403, 429, 503].includes(response.status) ? 'access_blocked' : 'http_error', upstreamDetail(response.body));
        return parseScholar(source, response.body, 3, this.config.scholarCustomSources);
      });
      const sample = items[0]?.title ? ' 首条：' + items[0].title.slice(0, 60) : '';
      return { ok: true, ms: Math.round(performance.now() - started), detail: items.length + ' 条结果' + sample };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code };
    }
  }
  private async searchSource(provider: SearchProvider, query: string, limit: number, signal: AbortSignal, timeoutMs: number,
    vertical: Vertical, config = this.config) {
    // 名字必须先落在已知集合里。以前漏了这一道，传个 github/拼错的名字会静默落到 duckduckgo 那条分支上，
    // 回执看着"通"，其实打的是另一家（探活接口尤其容易撞上）。
    if (!KNOWN_PROVIDERS.has(provider) && !provider.startsWith('custom:')) throw new SurfError('search_unconfigured');
    if (provider === 'brave' && !config.braveApiKey) throw new SurfError('search_unconfigured');
    if (provider === 'anysearch') return this.searchAnySearch(query, limit, signal, timeoutMs, vertical, config);
    // 自定义来源：名字对不上配置就当场拒，不静默跳过（跳过等于链上少一环还看不出来）。
    if (provider.startsWith('custom:')) {
      const source = config.customSources.find(item => 'custom:' + item.name === provider);
      if (!source) throw new SurfError('search_unconfigured');
      const request = buildCustomRequest(source, query, limit);
      const response = await this.fetcher.get(request.url, { method: request.method, body: request.body,
        signal, timeoutMs, maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl,
        allowRedirects: request.allowRedirects, headers: request.headers });
      if (response.status < 200 || response.status > 299) {
        const code = [401, 403, 429].includes(response.status) ? 'access_blocked'
          : response.status === 408 ? 'timeout'
          : response.status >= 500 ? 'http_error' : 'search_unconfigured';
        throw new ProviderError(code, upstreamDetail(response.body));
      }
      return parseCustom(source, response.body, limit);
    }
    // 只吃公开 JSON 接口的四个来源：请求和解析都在 jsonsources 里，这里只管发和分级报错。
    if (isJsonSource(provider)) {
      const request = buildJsonRequest(provider, query, limit, config);
      const response = await this.fetcher.get(request.url, { method: request.method, body: request.body,
        signal, timeoutMs, maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl,
        allowRedirects: request.allowRedirects, headers: request.headers });
      if (response.status < 200 || response.status > 299) {
        const code = [401, 403, 429].includes(response.status) ? 'access_blocked'
          : response.status === 408 ? 'timeout'
          : response.status >= 500 ? 'http_error' : 'search_unconfigured';
        throw new ProviderError(code, upstreamDetail(response.body));
      }
      return parseJsonSearch(provider, response.body, limit);
    }
    const url = new URL(provider === 'brave' ? 'https://api.search.brave.com/res/v1/web/search'
      : 'https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    if (provider === 'brave') url.searchParams.set('count', String(limit));
    const response = await this.fetcher.get(url.href, { signal, timeoutMs,
      maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl, allowRedirects: provider !== 'brave',
      headers: provider === 'brave' ? { 'X-Subscription-Token': config.braveApiKey, Accept: 'application/json' } : { Accept: 'text/html' } });
    checkResponse(response.status);
    return provider === 'brave' ? parseBrave(response.body, limit)
      : parseDuckDuckGo(response.body, response.url, limit);
  }
  /** AnySearch 走 POST JSON；没配 Key 时用它的匿名额度。跳转一律不跟，正文不外发。 */
  private async searchAnySearch(query: string, limit: number, signal: AbortSignal, timeoutMs: number, vertical: Vertical, config: SurfConfig) {
    const payload: Record<string, unknown> = { query, max_results: limit, format: 'json',
      zone: vertical.zone ?? config.anysearchZone };
    if (vertical.tag) payload.tag = vertical.tag;
    if (vertical.language) payload.language = vertical.language;
    // 垂直搜索的必填项由来源自己校验（如 finance.quote 要 type、security.vuln 要 type+value）。
    if (vertical.params) payload.params = vertical.params;
    const response = await this.fetcher.get('https://api.anysearch.com/v1/search', {
      method: 'POST', body: JSON.stringify(payload), signal, timeoutMs,
      maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl, allowRedirects: false,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json',
        ...(config.anysearchApiKey ? { Authorization: 'Bearer ' + config.anysearchApiKey } : {}) },
    });
    // 4xx 时来源通常会说清缺什么（缺哪个参数、tag 是否有效），这比笼统的 http_error 有用。
    if (response.status < 200 || response.status > 299) {
      const code = [401, 403, 429].includes(response.status) ? 'access_blocked'
        : response.status === 408 ? 'timeout'
        : response.status >= 500 ? 'http_error' : 'search_unconfigured';
      throw new ProviderError(code, upstreamDetail(response.body));
    }
    return parseAnySearch(response.body, limit);
  }
  /** 命中 GitHub / Stack Exchange / arXiv / 维基百科就先打公开 API；没成回落页面抓取，原因写进回执。 */
  private async readPage(url: string, signal: AbortSignal): Promise<{ page: ParsedPage; url: string }> {
    const target = this.config.structuredRead ? detectStructured(url) : undefined;
    if (!target) return this.fetchHtmlPage(url, signal);
    try {
      const page = await fetchStructured(this.fetcher, target, url, { timeoutMs: this.config.timeoutMs,
        maxBytes: this.config.maxPageBytes, maxTextChars: this.config.maxTextChars, proxyUrl: this.config.proxyUrl, signal });
      return { page, url };
    } catch (error) {
      if (signal.aborted) throw new SurfError('cancelled');
      const reason = error instanceof SurfError ? error.code : 'unexpected_error';
      const fallback = await this.fetchHtmlPage(url, signal);
      const note = `结构化读取（${target.label}）没成，回落到页面抓取：${reason}。`;
      return { page: { ...fallback.page, notice: fallback.page.notice ? `${note} ${fallback.page.notice}` : note }, url: fallback.url };
    }
  }
  private async fetchHtmlPage(url: string, signal: AbortSignal): Promise<{ page: ParsedPage; url: string }> {
    const response = await this.fetcher.get(url, { signal, timeoutMs: this.config.timeoutMs,
      maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl, headers: { Accept: 'text/html,application/xhtml+xml,text/plain' } });
    checkResponse(response.status);
    return { page: parsePage(response.body, response.url, response.headers['content-type'] ?? '', this.config.maxTextChars), url: response.url };
  }
  read(input: ReadInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<PageData>> {
    return this.execute(input?.sessionId, options, async (session, signal) => {
      object(input);
      const offset = input.offset ?? 0;
      if (!Number.isInteger(offset) || offset < 0 || offset > this.config.maxTextChars || (input.url !== undefined && input.pageRef !== undefined)) throw new SurfError('invalid_input');
      let ref: string, page: StoredPage;
      if (input.pageRef !== undefined) {
        page = this.page(session, input.pageRef); ref = input.pageRef;
      } else {
        if (typeof input.url !== 'string' || !input.url || offset !== 0) throw new SurfError('invalid_input');
        if (this.pages.size >= 32 || [...this.pages.values()].filter(p => p.sessionId === session).length >= 8) throw new SurfError('busy');
        const fetched = await this.readPage(input.url, signal);
        const parsed = fetched.page;
        if (signal.aborted) throw new SurfError('cancelled');
        // Recheck after I/O: parallel callers must not exceed the cache capacity.
        this.prune();
        if (this.pages.size >= 32 || [...this.pages.values()].filter(p => p.sessionId === session).length >= 8) throw new SurfError('busy');
        ref = `page_${randomUUID()}`;
        page = { ...parsed, sessionId: session, url: fetched.url, expires: this.now() + this.config.referenceTtlSeconds * 1000 };
        this.pages.set(ref, page);
      }
      if (offset > page.text.length) throw new SurfError('invalid_input');
      if (offset > 0 && /[\uDC00-\uDFFF]/.test(page.text.charAt(offset)) && /[\uD800-\uDBFF]/.test(page.text.charAt(offset - 1))) throw new SurfError('invalid_input');
      let end = Math.min(page.text.length, offset + PAGE_CHUNK);
      if (end < page.text.length && /[\uD800-\uDBFF]/.test(page.text.charAt(end - 1))) end--;
      return { pageRef: ref, url: page.url, title: page.title, text: page.text.slice(offset, end), offset,
        ...(end < page.text.length ? { nextOffset: end } : {}), truncated: page.truncated, remainingChars: page.totalTextChars - end,
        expiresAt: new Date(page.expires).toISOString(), links: page.links,
        images: page.images.map((item, index) => ({ index, alt: item.alt })),
        imageToolAvailable: this.visionAvailable(), collectionToolAvailable: this.galleryAvailable(),
        untrusted: true, ...(page.notice ? { notice: page.notice } : {}) };
    });
  }
  image(input: ImageInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<ImageData>> {
    return this.execute(input?.sessionId, options, async (session, signal) => {
      object(input);
      const page = this.page(session, input.pageRef), binding = this.vision;
      if (!binding || binding.signal.aborted) throw new SurfError('vision_unavailable');
      if (!Number.isInteger(input.imageIndex) || input.imageIndex < 0 || input.imageIndex >= page.images.length) throw new SurfError('invalid_input');
      const key = `${input.pageRef}:${input.imageIndex}`;
      const cached = this.offers.get(key);
      if (cached && cached.binding === binding && cached.sessionId === session && cached.expires > this.now()) return cached.media;
      if (this.imageRequests.has(key) || this.offers.size + this.imageRequests.size >= 32) throw new SurfError('busy');
      this.imageRequests.add(key);
      try {
        const combined = AbortSignal.any([signal, binding.signal]);
        const response = await this.fetcher.get(page.images[input.imageIndex].url, { signal: combined,
          timeoutMs: this.config.timeoutMs, maxBytes: this.config.maxImageBytes, proxyUrl: this.config.proxyUrl,
          headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' } });
        checkResponse(response.status);
        const mime = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw new SurfError('unsupported_content');
        this.page(session, input.pageRef);
        if (combined.aborted) throw new SurfError('cancelled');
        let offered: Awaited<ReturnType<VisionService['offerMedia']>>;
        try {
          offered = await binding.service.offerMedia({ sessionId: session, mime, base64: response.body.toString('base64') }, { signal: combined });
        } catch { throw new SurfError(binding.signal.aborted ? 'vision_unavailable' : combined.aborted ? 'cancelled' : 'image_unavailable'); }
        if (combined.aborted || this.vision !== binding || page.expires <= this.now()) {
          // Only our confirmed offer is released; the provider's own TTL is the bounded fallback.
          await this.releaseOffer(binding, session, offered.mediaRef);
          throw new SurfError(combined.aborted ? 'cancelled' : 'page_unavailable');
        }
        const expires = Date.parse(offered.expiresAt);
        if (typeof offered.mediaRef !== 'string' || offered.mediaRef.length > 200 || !Number.isFinite(expires) || expires <= this.now()) throw new SurfError('image_unavailable');
        const media: ImageData = { mediaRef: offered.mediaRef, expiresAt: offered.expiresAt, nextTool: 'vision_view', state: 'offered' };
        this.offers.set(key, { sessionId: session, binding, media, expires: Math.min(expires, page.expires) });
        return media;
      } finally { this.imageRequests.delete(key); }
    });
  }
  prepareCollection(input: ImageInput & { sessionId: string }, options?: CallOptions): Promise<OperationResult<GalleryImageData>> {
    return this.execute(input?.sessionId, options, async (session, signal) => {
      object(input);
      const page = this.page(session, input.pageRef), binding = this.gallery;
      if (!binding || binding.signal.aborted) throw new SurfError('gallery_unavailable');
      if (!Number.isInteger(input.imageIndex) || input.imageIndex < 0 || input.imageIndex >= page.images.length) throw new SurfError('invalid_input');
      const key = `${input.pageRef}:${input.imageIndex}`;
      const cached = this.collectionOffers.get(key);
      if (cached && cached.binding === binding && cached.sessionId === session && cached.expires > this.now()) return cached.media;
      if (this.collectionRequests.has(key) || this.collectionOffers.size + this.collectionRequests.size >= 32) throw new SurfError('busy');
      this.collectionRequests.add(key);
      const bindingSignal = this.galleryAborter.signal;
      const combined = AbortSignal.any([signal, binding.signal, bindingSignal]);
      try {
        const response = await untilCancelled(combined, () => this.fetcher.get(page.images[input.imageIndex].url, { signal: combined,
          timeoutMs: this.config.timeoutMs, maxBytes: this.config.maxImageBytes, proxyUrl: this.config.proxyUrl,
          headers: { Accept: 'image/png,image/jpeg,image/webp,image/gif' } }));
        checkResponse(response.status);
        const mime = (response.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw new SurfError('unsupported_content');
        this.page(session, input.pageRef);
        if (combined.aborted) throw new SurfError('cancelled');
        const offeredAt = this.now();
        let offered: Awaited<ReturnType<GalleryService['offerMedia']>>;
        try {
          offered = await untilCancelled(combined, () => binding.service.offerMedia({
            sessionId: session, base64: response.body.toString('base64'), source: 'search-engine',
          }, { signal: combined }));
        } catch { throw new SurfError(combined.aborted ? 'cancelled' : 'image_unavailable'); }
        if (combined.aborted) throw new SurfError('cancelled');
        this.page(session, input.pageRef);
        if (!offered || typeof offered.mediaRef !== 'string' || !offered.mediaRef.trim() || offered.mediaRef.length > 80
          || /[\x00-\x1f\x7f]/.test(offered.mediaRef) || typeof offered.expiresInSeconds !== 'number'
          || !Number.isFinite(offered.expiresInSeconds) || offered.expiresInSeconds <= 0) throw new SurfError('image_unavailable');
        // Start at the call, so transport latency never extends the provider's declared lifetime.
        const expires = offeredAt + offered.expiresInSeconds * 1000;
        if (!Number.isFinite(expires) || expires > 8.64e15 || expires <= this.now()) throw new SurfError('image_unavailable');
        const media: GalleryImageData = { mediaRef: offered.mediaRef, expiresAt: new Date(expires).toISOString(), nextTool: 'gallery_collect', state: 'offered' };
        this.collectionOffers.set(key, { sessionId: session, binding, media, expires: Math.min(expires, page.expires) });
        return media;
      } catch (error) {
        if (binding.signal.aborted || bindingSignal.aborted || this.gallery !== binding) throw new SurfError('gallery_unavailable');
        throw error;
      } finally { this.collectionRequests.delete(key); }
    });
  }
  async dispose() {
    if (this.stopped) return;
    this.stopped = true; this.aborter.abort(); this.pages.clear(); this.vision = undefined;
    this.galleryAborter.abort(); this.gallery = undefined; this.collectionOffers.clear(); this.collectionRequests.clear();
    const offers = [...this.offers.values()]; this.offers.clear(); this.imageRequests.clear();
    await this.fetcher.dispose();
    await Promise.all(offers.map(offer => this.releaseOffer(offer.binding, offer.sessionId, offer.media.mediaRef)));
  }
}
