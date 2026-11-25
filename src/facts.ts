/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import type { CustomSource, FactItem, FactSource } from './types.ts';
import { buildCustomRequest, parseCustomFact } from './custom.ts';
import { SurfError } from './errors.ts';

/** 请求只需要 URL 和头；抓取、超时、DNS 校验一律走宿主网络层，这里不自己发请求。 */
export interface FactRequest {
  url: string; headers: Record<string, string>;
  /** 自定义来源可能是 POST。 */
  method?: 'GET' | 'POST'; body?: string; allowRedirects?: boolean;
}

export const factSources: FactSource[] = ['wikipedia', 'wikidata', 'openlibrary', 'oeis'];

/** 自定义事实来源同样挂 custom: 前缀；名字在不在由配置里的列表说了算。 */
export function isFactSource(value: unknown, customs: CustomSource[] = []): value is FactSource {
  if (typeof value !== 'string') return false;
  if ((factSources as string[]).includes(value)) return true;
  return value.startsWith('custom:') && customs.some(source => 'custom:' + source.name === value);
}

/**
 * 四家全是公开 API，不要 Key。
 * 事实源和网页搜索不是一回事：它返回的是「条目」，查询语义是「这个东西叫什么」，
 * 所以不并进 searchProviders 的回退链——连上零条在那里算应答，会把后面的源全挡死。
 */
export function buildFactRequest(source: FactSource, query: string, limit: number, lang: string, customs: CustomSource[] = []): FactRequest {
  const q = query.trim();
  const rows = Math.min(20, Math.max(1, Math.trunc(limit)));
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (source.startsWith('custom:')) {
    const found = customs.find(item => 'custom:' + item.name === source);
    if (!found) throw new SurfError('search_unconfigured');
    const request = buildCustomRequest(found, q, rows);
    return { url: request.url, headers: request.headers, method: request.method,
      ...(request.body ? { body: request.body } : {}), allowRedirects: false };
  }
  if (source === 'wikipedia') {
    const code = lang === 'zh' ? 'zh' : 'en';
    const url = new URL(`https://${code}.wikipedia.org/w/api.php`);
    url.searchParams.set('action', 'query');
    url.searchParams.set('list', 'search');
    url.searchParams.set('srsearch', q);
    url.searchParams.set('srlimit', String(rows));
    // snippet 里的高亮靠 <span class="searchmatch">，要带这个参数才干净
    url.searchParams.set('srprop', 'snippet');
    url.searchParams.set('format', 'json');
    url.searchParams.set('utf8', '1');
    return { url: url.href, headers };
  }
  if (source === 'wikidata') {
    const url = new URL('https://www.wikidata.org/w/api.php');
    url.searchParams.set('action', 'wbsearchentities');
    url.searchParams.set('search', q);
    url.searchParams.set('language', lang === 'zh' ? 'zh' : 'en');
    url.searchParams.set('uselang', lang === 'zh' ? 'zh' : 'en');
    url.searchParams.set('limit', String(rows));
    url.searchParams.set('format', 'json');
    url.searchParams.set('utf8', '1');
    return { url: url.href, headers };
  }
  if (source === 'openlibrary') {
    const url = new URL('https://openlibrary.org/search.json');
    url.searchParams.set('q', q);
    url.searchParams.set('limit', String(rows));
    // 不带 fields 时整份响应能到几百 KB，机器可读但没必要
    url.searchParams.set('fields', 'title,author_name,first_publish_year,key,edition_count');
    return { url: url.href, headers };
  }
  const url = new URL('https://oeis.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('fmt', 'json');
  return { url: url.href, headers };
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      try { return String.fromCodePoint(code); } catch { return whole; }
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? whole : named;
  });
}

/** 抓下来的摘要有 HTML 高亮标签和实体，先剥再压空白，最后按字数截。 */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const text = decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function wikiUrl(lang: string, title: string): string {
  const code = lang === 'zh' ? 'zh' : 'en';
  return `https://${code}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`;
}

/**
 * 解析成统一的 items。四家字段差别大，但对外只给 title / url / snippet / meta 四样，
 * 免得调用方为了读结果先学四套结构。
 */
export function parseFact(source: FactSource, body: Buffer | string, limit: number, lang: string, customs: CustomSource[] = []): FactItem[] {
  const text = typeof body === 'string' ? body : body.toString('utf8');
  if (source.startsWith('custom:')) {
    const found = customs.find(item => 'custom:' + item.name === source);
    if (!found) throw new SurfError('search_unconfigured');
    return parseCustomFact(found.name, found, Buffer.from(text, 'utf8'), limit);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('parse_failed');
  }
  const rows = Math.min(20, Math.max(1, Math.trunc(limit)));
  const items: FactItem[] = [];

  if (source === 'wikipedia') {
    const query = asObject(asObject(parsed)?.query);
    for (const raw of asArray(query?.search)) {
      const item = asObject(raw);
      const title = cleanText(item?.title, 120);
      if (!title) continue;
      items.push({ title, url: wikiUrl(lang, title), snippet: cleanText(item?.snippet, 240), source });
      if (items.length >= rows) break;
    }
    return items;
  }

  if (source === 'wikidata') {
    for (const raw of asArray(asObject(parsed)?.search)) {
      const item = asObject(raw);
      const id = cleanText(item?.id, 32);
      if (!id) continue;
      const display = asObject(item?.display);
      const label = cleanText(asObject(display?.label)?.value, 120) || cleanText(item?.title, 120) || id;
      const description = cleanText(asObject(display?.description)?.value, 200);
      items.push({
        title: label,
        url: `https://www.wikidata.org/wiki/${encodeURIComponent(id)}`,
        snippet: description,
        meta: id,
        source,
      });
      if (items.length >= rows) break;
    }
    return items;
  }

  if (source === 'openlibrary') {
    for (const raw of asArray(asObject(parsed)?.docs)) {
      const item = asObject(raw);
      const title = cleanText(item?.title, 160);
      if (!title) continue;
      const authors = asArray(item?.author_name).filter(a => typeof a === 'string').slice(0, 3).join(' / ');
      const year = typeof item?.first_publish_year === 'number' ? String(item.first_publish_year) : '';
      const key = cleanText(item?.key, 80);
      const bits = [authors, year].filter(Boolean).join(' · ');
      items.push({
        title,
        url: key ? `https://openlibrary.org${key}` : 'https://openlibrary.org/',
        snippet: bits,
        meta: key || undefined,
        source,
      });
      if (items.length >= rows) break;
    }
    return items;
  }

  // OEIS：fmt=json 时顶层就是数组；q 没命中会回一个空数组，不会报错
  for (const raw of asArray(parsed)) {
    const item = asObject(raw);
    const number = typeof item?.number === 'number' ? item.number : Number(item?.number);
    if (!Number.isFinite(number)) continue;
    const name = cleanText(item?.name, 200);
    const data = cleanText(item?.data, 120);
    items.push({
      title: `A${String(number).padStart(6, '0')} · ${name}`.trim(),
      url: `https://oeis.org/A${String(number).padStart(6, '0')}`,
      snippet: data,
      source,
    });
    if (items.length >= rows) break;
  }
  return items;
}
