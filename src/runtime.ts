/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { randomUUID } from 'node:crypto';
import type { OptionalService } from 'whalelife';
import { publicConfig, object } from './config.ts';
import { SurfError, SearchExhaustedError, ProviderError, safeError } from './errors.ts';
import { parsePage, parseBing, parseDuckDuckGo, parseBrave, parseAnySearch } from './content.ts';
import { isJsonSource, buildJsonRequest, parseJsonSearch } from './jsonsources.ts';
import { buildCustomRequest, parseCustom, guessJsonShape } from './custom.ts';
import type { JsonShapeGuess } from './custom.ts';
import { buildRequest, parseScholar, isScholarSource } from './scholar.ts';
import { buildFactRequest, parseFact, isFactSource } from './facts.ts';
import type { PublicFetcher, SurfConfig, SurfService, SurfStatus, OperationResult, ParsedPage,
  SearchData, SearchFailure, SearchItem, SearchProvider, SearchZone, PageData, ImageData, GalleryImageData, SearchInput, ReadInput, ImageInput, CallOptions, VisionService, GalleryService,
  ScholarData, ScholarInput, ScholarItem,
  FactData, FactInput, FactFailure, FactItem } from './types.ts';

type StoredPage = ParsedPage & { sessionId: string; url: string; expires: number };
type StoredOffer = { sessionId: string; binding: OptionalService<VisionService>; media: ImageData; expires: number };
type StoredCollectionOffer = { sessionId: string; binding: OptionalService<GalleryService>; media: GalleryImageData; expires: number };
const PAGE_CHUNK = 6000;
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
      for (const [index, provider] of providers.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
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
          const trimmed = trimResults(results, config.resultsMaxChars);
          const found: SearchData = { provider, results: trimmed.results, untrusted: true, elapsedMs: Math.round(performance.now() - started),
            ...(trimmed.truncated ? { truncated: trimmed.truncated } : {}),
            ...(fallback.length ? { fallback } : {}), ...(notes.length ? { notes } : {}) };
          this.cachePut(config, signal, cacheKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
          fallback.push({ provider, elapsedMs: Math.round(performance.now() - started), code: failure.code, reason: failure.message });
        }
      }
      throw new SearchExhaustedError(answered && answeredCode ? answeredCode : providers.length === 1 ? lastCode : 'search_exhausted',
        fallback.map(item => item.provider + ' (' + item.elapsedMs + ' ms): ' + item.reason).join(' '));
    });
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
        if (!Array.isArray(list) || list.length === 0 || list.length > 4 || !list.every(isScholarSource) ||
            new Set(list).size !== list.length) throw new SurfError('invalid_input');
        sources = [...list];
      }
      const scholarKey = this.cacheKey('scholar', [query, limit, sources, yearMin ?? null]);
      const scholarHit = this.cacheGet<ScholarData>(scholarKey);
      if (scholarHit) return { ...scholarHit.data, cached: true, cachedAgoMs: scholarHit.agoMs };
      const deadline = performance.now() + config.timeoutMs;
      const fallback: SearchFailure[] = [];
      let lastCode: ReturnType<typeof safeError>['code'] = 'search_exhausted';
      let answeredCode: 'search_empty' | undefined;
      let answered = false;
      for (const [index, source] of sources.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
          const timeoutMs = this.sourceBudget(config, source, index, sources.length, remaining);
          limitSignal = AbortSignal.timeout(timeoutMs);
          const attemptSignal = AbortSignal.any([signal, limitSignal]);
          const request = buildRequest(source, query, limit, config.scholarMailto);
          const items: ScholarItem[] = await untilCancelled(attemptSignal, async () => {
            const response = await this.fetcher.get(request.url, { signal: attemptSignal, timeoutMs,
              maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl, allowRedirects: true,
              headers: request.headers });
            checkResponse(response.status);
            return parseScholar(source, response.body, limit);
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
          const found: ScholarData = { source, items: kept, untrusted: true as const, elapsedMs: Math.round(performance.now() - started),
            ...(fallback.length ? { fallback } : {}), ...(notes.length ? { notes } : {}) };
          this.cachePut(config, signal, scholarKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
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
        if (!Array.isArray(list) || list.length === 0 || list.length > 4 || !list.every(isFactSource) ||
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
      for (const [index, source] of sources.entries()) {
        if (signal.aborted) throw new SurfError('cancelled');
        const started = performance.now();
        const remaining = deadline - started;
        let limitSignal: AbortSignal | undefined;
        try {
          if (remaining < 1) throw new SurfError('timeout');
          const timeoutMs = this.sourceBudget(config, source, index, sources.length, remaining);
          limitSignal = AbortSignal.timeout(timeoutMs);
          const attemptSignal = AbortSignal.any([signal, limitSignal]);
          const request = buildFactRequest(source, query, limit, lang);
          const items: FactItem[] = await untilCancelled(attemptSignal, async () => {
            const response = await this.fetcher.get(request.url, { signal: attemptSignal, timeoutMs,
              maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl, allowRedirects: true,
              headers: request.headers });
            checkResponse(response.status);
            return parseFact(source, response.body, limit, lang);
          });
          if (limitSignal.aborted || performance.now() - started >= timeoutMs) throw new SurfError('timeout');
          answered = true;
          if (items.length === 0) {
            answeredCode = 'search_empty';
            fallback.push({ source, elapsedMs: Math.round(performance.now() - started), code: 'search_empty',
              reason: '来源返回零条结果。' });
            continue;
          }
          const found: FactData = { source, items, untrusted: true as const, elapsedMs: Math.round(performance.now() - started),
            ...(fallback.length ? { fallback } : {}) };
          this.cachePut(config, signal, factKey, found);
          return found;
        } catch (error) {
          if (signal.aborted) throw new SurfError('cancelled');
          const failure = safeError(limitSignal?.aborted || performance.now() >= deadline || remaining < 1
            ? new SurfError('timeout') : error);
          lastCode = failure.code;
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
      const source = isFactSource(input.source) ? input.source : this.config.factsSources[0];
      const lang = input.lang === 'en' ? 'en' : this.config.factsLang;
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 200) : 'Brisbane';
      const request = buildFactRequest(source, query, 3, lang);
      const items = await untilCancelled(signal, async () => {
        const response = await this.fetcher.get(request.url, { signal, timeoutMs: budget,
          maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl, allowRedirects: true, headers: request.headers });
        checkResponse(response.status);
        return parseFact(source, response.body, 3, lang);
      });
      const sample = items[0]?.title ? ' 首条：' + items[0].title.slice(0, 60) : '';
      return { ok: true, ms: Math.round(performance.now() - started), detail: items.length + ' 条结果' + sample };
    } catch (error) {
      const safe = safeError(error);
      return { ok: false, ms: Math.round(performance.now() - started), detail: safe.message || safe.code };
    }
  }
  /** 设置页「试一下」用：只打一个学术来源，不写配置、不进回执。 */
  async probeScholar(input: { source?: string; query?: string }): Promise<{ ok: boolean; ms: number; detail: string }> {
    const started = performance.now();
    try {
      if (this.stopped || this.signal.aborted) throw new SurfError('stopped');
      const source = isScholarSource(input.source) ? input.source : this.config.scholarSources[0];
      const budget = Math.min(this.config.timeoutMs, 15_000);
      const signal = AbortSignal.any([this.signal, AbortSignal.timeout(budget)]);
      const query = typeof input.query === 'string' && input.query.trim() ? input.query.trim().slice(0, 200) : 'transformer';
      const request = buildRequest(source, query, 3, this.config.scholarMailto);
      const items = await untilCancelled(signal, async () => {
        const response = await this.fetcher.get(request.url, { signal, timeoutMs: budget,
          maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl, allowRedirects: true, headers: request.headers });
        if (response.status < 200 || response.status > 299)
          throw new ProviderError([401, 403, 429, 503].includes(response.status) ? 'access_blocked' : 'http_error', upstreamDetail(response.body));
        return parseScholar(source, response.body, 3);
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
      : provider === 'bing' ? 'https://cn.bing.com/search' : 'https://html.duckduckgo.com/html/');
    url.searchParams.set('q', query);
    if (provider === 'brave') url.searchParams.set('count', String(limit));
    const response = await this.fetcher.get(url.href, { signal, timeoutMs,
      maxBytes: config.maxPageBytes, proxyUrl: config.proxyUrl, allowRedirects: provider !== 'brave',
      headers: provider === 'brave' ? { 'X-Subscription-Token': config.braveApiKey, Accept: 'application/json' } : { Accept: 'text/html' } });
    checkResponse(response.status);
    return provider === 'brave' ? parseBrave(response.body, limit)
      : provider === 'bing' ? parseBing(response.body, response.url, limit) : parseDuckDuckGo(response.body, response.url, limit);
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
        const response = await this.fetcher.get(input.url, { signal, timeoutMs: this.config.timeoutMs,
          maxBytes: this.config.maxPageBytes, proxyUrl: this.config.proxyUrl, headers: { Accept: 'text/html,application/xhtml+xml,text/plain' } });
        checkResponse(response.status);
        const parsed = parsePage(response.body, response.url, response.headers['content-type'] ?? '', this.config.maxTextChars);
        if (signal.aborted) throw new SurfError('cancelled');
        // Recheck after I/O: parallel callers must not exceed the cache capacity.
        this.prune();
        if (this.pages.size >= 32 || [...this.pages.values()].filter(p => p.sessionId === session).length >= 8) throw new SurfError('busy');
        ref = `page_${randomUUID()}`;
        page = { ...parsed, sessionId: session, url: response.url, expires: this.now() + this.config.referenceTtlSeconds * 1000 };
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
