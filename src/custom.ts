/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { SurfError } from './errors.ts';
import type { CustomSource, SearchItem } from './types.ts';

/** 用户自己填的 JSON 来源：只解析点路径，不去认别人的 HTML 类名。 */
const MAX_URL = 4096;

function clipped(value: string, maximum: number): string {
  let text = value.slice(0, maximum);
  if (text.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text;
}

function flat(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return clipped(value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim(), maximum);
}

/** 来源给的链接同样要过一遍：只留 http(s)、没有凭据、不是本机。 */
function safeUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL || /[\x00-\x20\x7F]/.test(raw.trim())) return;
  try {
    const url = new URL(raw.trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    const host = url.hostname.toLowerCase();
    if (!host || host === 'localhost') return;
    url.hash = '';
    return url.href;
  } catch { return; }
}

function pick(root: unknown, path: string): unknown {
  if (path === '$') return root;
  let node = root;
  for (const part of path.split('.')) {
    if (!part) continue;
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

export interface CustomRequest {
  url: string; method: 'GET' | 'POST';
  headers: Record<string, string>; body?: string; allowRedirects: boolean;
}

export function buildCustomRequest(source: CustomSource, query: string, limit: number): CustomRequest {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (source.key) headers.Authorization = 'Bearer ' + source.key;
  if (source.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    return { url: source.url.split('{query}').join(encodeURIComponent(query)), method: 'POST',
      allowRedirects: false, headers, body: JSON.stringify({ query, limit }) };
  }
  return { url: source.url.split('{query}').join(encodeURIComponent(query)), method: 'GET',
    allowRedirects: false, headers };
}

export function parseCustom(source: CustomSource, body: Buffer, limit: number): SearchItem[] {
  let payload: unknown;
  try { payload = JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
  const list = pick(payload, source.items);
  if (!Array.isArray(list)) throw new SurfError('search_parse');
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const url = safeUrl(pick(raw, source.link));
    const title = flat(pick(raw, source.title), 300) || url || '';
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const snippet = source.snippet ? flat(pick(raw, source.snippet), 1200) : '';
    results.push({ title, url, snippet });
    if (results.length >= limit) break;
  }
  return results;
}
/** 「探一下」用：从一份 JSON 里猜数组位置和字段名，猜错也不拦，页面上能改。 */
export interface JsonShapeGuess {
  items: string; title: string; link: string; snippet: string;
  fields: string[]; count: number;
}
export function guessJsonShape(body: Buffer): JsonShapeGuess {
  let payload: unknown;
  try { payload = JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
  let hit: { path: string; item: Record<string, unknown> } | undefined;
  const walk = (node: unknown, path: string, depth: number) => {
    if (hit || depth > 4 || !node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      const first = node.find(value => value && typeof value === 'object' && !Array.isArray(value));
      if (first) hit = { path: path || '$', item: first as Record<string, unknown> };
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) walk(value, path ? path + '.' + key : key, depth + 1);
  };
  walk(payload, '', 0);
  if (!hit) throw new SurfError('search_parse');
  const found = hit as { path: string; item: Record<string, unknown> };
  const fields = Object.keys(found.item);
  const pickOf = (candidates: string[]) => candidates.find(name => typeof found.item[name] === 'string') ?? '';
  return {
    items: found.path,
    title: pickOf(['title', 'full_name', 'headline', 'label', 'question', 'name']),
    link: pickOf(['html_url', 'web_url', 'permalink', 'href', 'url', 'link']),
    snippet: pickOf(['content', 'description', 'desc', 'snippet', 'summary', 'text', 'abstract']),
    fields, count: fields.length,
  };
}
