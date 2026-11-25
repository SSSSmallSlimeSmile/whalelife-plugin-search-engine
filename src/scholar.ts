/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { SurfError } from './errors.ts';
import type { ScholarItem, ScholarSource } from './types.ts';

/** 请求只需要 URL 和头；抓取、超时、回退一律走宿主那套 netwrok 层，这里不自己发请求。 */
export interface ScholarRequest { url: string; headers: Record<string, string> }

export const scholarSources: ScholarSource[] = ['arxiv', 'crossref', 'openalex', 'semanticscholar'];

export function isScholarSource(value: unknown): value is ScholarSource {
  return typeof value === 'string' && (scholarSources as string[]).includes(value);
}

/**
 * 四个来源全是公开 API，不要 Key。Crossref 和 OpenAlex 只有填了联系邮箱才进 polite pool，
 * 拿不到就照常请求，只是配额低一点——不因为缺邮箱就拒绝。
 */
export function buildRequest(source: ScholarSource, query: string, limit: number, mailto: string): ScholarRequest {
  const q = query.trim();
  const rows = Math.min(20, Math.max(1, Math.trunc(limit)));
  if (source === 'arxiv') {
    const url = new URL('https://export.arxiv.org/api/query');
    url.searchParams.set('search_query', 'all:' + q.replace(/"/g, ' '));
    url.searchParams.set('start', '0');
    url.searchParams.set('max_results', String(rows));
    return { url: url.href, headers: { Accept: 'application/atom+xml' } };
  }
  if (source === 'crossref') {
    const url = new URL('https://api.crossref.org/works');
    url.searchParams.set('query.bibliographic', q);
    url.searchParams.set('rows', String(rows));
    url.searchParams.set('select', 'title,author,issued,container-title,DOI,URL,is-referenced-by-count,abstract');
    // 不加类型过滤时，图表说明（type=component）会占满前排：标题长得像论文，其实只是一张图的图注。
    url.searchParams.set('filter', 'type:journal-article,type:proceedings-article,type:posted-content');
    if (mailto) url.searchParams.set('mailto', mailto);
    return { url: url.href, headers: { Accept: 'application/json' } };
  }
  if (source === 'openalex') {
    const url = new URL('https://api.openalex.org/works');
    url.searchParams.set('search', q);
    url.searchParams.set('per-page', String(rows));
    if (mailto) url.searchParams.set('mailto', mailto);
    return { url: url.href, headers: { Accept: 'application/json' } };
  }
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', q);
  url.searchParams.set('limit', String(rows));
  url.searchParams.set('fields', 'title,authors,year,venue,externalIds,url,citationCount,abstract');
  return { url: url.href, headers: { Accept: 'application/json' } };
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

/** 摘要里常带 JATS / HTML 标记；先剥标签再压空白，最后按字符上限截断。 */
function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const text = decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function firstString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    const found = value.find(item => typeof item === 'string' && item.trim());
    return typeof found === 'string' ? found : '';
  }
  return '';
}

function positiveInt(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? Math.trunc(number) : undefined;
}

function yearOf(value: unknown): number | undefined {
  const number = positiveInt(value);
  return number !== undefined && number >= 1000 && number <= 3000 ? number : undefined;
}

function uniqueAuthors(list: unknown, pick: (item: unknown) => string): string[] {
  if (!Array.isArray(list)) return [];
  const names: string[] = [];
  for (const item of list) {
    const name = cleanText(pick(item), 80);
    if (name && !names.includes(name)) names.push(name);
    if (names.length >= 6) break;
  }
  return names;
}

/** OpenAlex 的摘要存成倒排索引（词 → 出现位置），要按位置拼回去。 */
function fromInvertedIndex(value: unknown, max: number): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const slots: string[] = [];
  for (const [word, positions] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const position of positions) {
      const index = positiveInt(position);
      if (index === undefined || index > 2000) continue;
      slots[index] = word;
    }
  }
  const text = slots.filter(word => typeof word === 'string').join(' ').replace(/\s+/g, ' ').trim();
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

function arxivDoi(raw: string): string {
  const match = /(10\.\d{4,9}\/[^\s<]+)/.exec(raw);
  return match ? match[1] : '';
}

function parseArxiv(body: Buffer, limit: number): ScholarItem[] {
  const xml = body.toString('utf8');
  const items: ScholarItem[] = [];
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  for (const entry of entries) {
    const pick = (tag: string) => {
      const match = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>').exec(entry);
      return match ? match[1] : '';
    };
    const title = cleanText(pick('title'), 300);
    if (!title) continue;
    const id = pick('id').trim();
    const authorBlocks = entry.match(/<author>[\s\S]*?<\/author>/g) ?? [];
    const authors = uniqueAuthors(authorBlocks, item => {
      const name = /<name>([\s\S]*?)<\/name>/.exec(String(item));
      return name ? name[1] : '';
    });
    const doi = arxivDoi(pick('arxiv:doi')) || arxivDoi(entry);
    items.push({
      source: 'arxiv',
      title,
      authors,
      year: yearOf(pick('published').slice(0, 4)),
      venue: cleanText(pick('arxiv:journal_ref'), 120) || 'arXiv',
      ...(doi ? { doi } : {}),
      ...(id.startsWith('http') ? { url: id } : {}),
      abstract: cleanText(pick('summary'), 500),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function parseCrossref(body: Buffer, limit: number): ScholarItem[] {
  const json = parseJson(body);
  const list = (json as any)?.message?.items;
  if (!Array.isArray(list)) throw new SurfError('search_parse');
  const items: ScholarItem[] = [];
  for (const row of list) {
    const title = cleanText(firstString(row?.title), 300);
    if (!title) continue;
    const parts = (row as any)?.issued?.['date-parts'] ?? (row as any)?.published?.['date-parts'];
    const doi = typeof row?.DOI === 'string' ? row.DOI : '';
    const url = typeof row?.URL === 'string' ? row.URL : doi ? 'https://doi.org/' + doi : '';
    items.push({
      source: 'crossref',
      title,
      authors: uniqueAuthors(row?.author, item => {
        const record = item as Record<string, unknown>;
        return [record?.given, record?.family].filter(part => typeof part === 'string' && part.trim()).join(' ');
      }),
      year: yearOf(Array.isArray(parts) && Array.isArray(parts[0]) ? parts[0][0] : undefined),
      venue: cleanText(firstString(row?.['container-title']), 120),
      ...(doi ? { doi } : {}),
      ...(url ? { url } : {}),
      ...(positiveInt(row?.['is-referenced-by-count']) !== undefined ? { citations: positiveInt(row?.['is-referenced-by-count']) } : {}),
      abstract: cleanText(row?.abstract, 500),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function parseOpenAlex(body: Buffer, limit: number): ScholarItem[] {
  const json = parseJson(body);
  const list = (json as any)?.results;
  if (!Array.isArray(list)) throw new SurfError('search_parse');
  const items: ScholarItem[] = [];
  for (const row of list) {
    const title = cleanText(row?.title ?? row?.display_name, 300);
    if (!title) continue;
    const doi = typeof row?.doi === 'string' ? row.doi.replace(/^https?:\/\/doi\.org\//, '') : '';
    const landing = typeof row?.doi === 'string' ? row.doi : typeof row?.id === 'string' ? row.id : '';
    items.push({
      source: 'openalex',
      title,
      authors: uniqueAuthors(row?.authorships, item => String((item as any)?.author?.display_name ?? '')),
      year: yearOf(row?.publication_year),
      venue: cleanText((row as any)?.primary_location?.source?.display_name ?? '', 120),
      ...(doi ? { doi } : {}),
      ...(landing ? { url: landing } : {}),
      ...(positiveInt(row?.cited_by_count) !== undefined ? { citations: positiveInt(row?.cited_by_count) } : {}),
      abstract: fromInvertedIndex(row?.abstract_inverted_index, 500),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function parseSemanticScholar(body: Buffer, limit: number): ScholarItem[] {
  const json = parseJson(body);
  const list = (json as any)?.data;
  if (!Array.isArray(list)) throw new SurfError('search_parse');
  const items: ScholarItem[] = [];
  for (const row of list) {
    const title = cleanText(row?.title, 300);
    if (!title) continue;
    const doi = typeof (row as any)?.externalIds?.DOI === 'string' ? (row as any).externalIds.DOI : '';
    const url = typeof row?.url === 'string' ? row.url : '';
    items.push({
      source: 'semanticscholar',
      title,
      authors: uniqueAuthors(row?.authors, item => String((item as any)?.name ?? '')),
      year: yearOf(row?.year),
      venue: cleanText(row?.venue, 120),
      ...(doi ? { doi } : {}),
      ...(url ? { url } : {}),
      ...(positiveInt(row?.citationCount) !== undefined ? { citations: positiveInt(row?.citationCount) } : {}),
      abstract: cleanText(row?.abstract, 500),
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** 4xx/5xx 的正文有时会说明原因（配额、参数），带一小段进错误里，比笼统的 http_error 有用。 */
function parseJson(body: Buffer): unknown {
  try { return JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
}

export function parseScholar(source: ScholarSource, body: Buffer, limit: number): ScholarItem[] {
  if (source === 'arxiv') return parseArxiv(body, limit);
  if (source === 'crossref') return parseCrossref(body, limit);
  if (source === 'openalex') return parseOpenAlex(body, limit);
  return parseSemanticScholar(body, limit);
}
