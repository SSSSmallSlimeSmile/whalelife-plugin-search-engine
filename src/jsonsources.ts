/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { SurfError } from './errors.ts';
import type { SearchItem } from './types.ts';

/** 只吃公开 JSON 接口的来源：不解析别人的 HTML，改版也不会把解析器弄坏。 */
export type JsonProvider = 'tavily' | 'exa' | 'github' | 'huggingface';

export interface JsonKeys { tavilyApiKey: string; exaApiKey: string }

export interface JsonRequest {
  url: string; method: 'GET' | 'POST';
  headers: Record<string, string>; body?: string; allowRedirects: boolean;
}

const MAX_URL = 4096;

export function isJsonSource(value: string): value is JsonProvider {
  return value === 'tavily' || value === 'exa' || value === 'github' || value === 'huggingface';
}

function clipped(value: string, maximum: number): string {
  let text = value.slice(0, maximum);
  if (text.length && /[\uD800-\uDBFF]$/.test(text)) text = text.slice(0, -1);
  return text;
}

function flat(value: unknown, maximum: number): string {
  if (typeof value !== 'string') return '';
  return clipped(value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim(), maximum);
}

/** 来源自己给的链接也要过一遍：只留 http(s)、没有凭据、不是内网。 */
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

function parsed(body: Buffer): unknown {
  try { return JSON.parse(body.toString('utf8')); } catch { throw new SurfError('search_parse'); }
}

function itemsOf(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') throw new SurfError('search_parse');
  const results = (payload as Record<string, unknown>).results;
  if (!Array.isArray(results)) throw new SurfError('search_parse');
  return results;
}

export function buildJsonRequest(provider: JsonProvider, query: string, limit: number, keys: JsonKeys): JsonRequest {
  if (provider === 'tavily') {
    if (!keys.tavilyApiKey) throw new SurfError('search_unconfigured');
    return { url: 'https://api.tavily.com/search', method: 'POST', allowRedirects: false,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json',
        Authorization: 'Bearer ' + keys.tavilyApiKey },
      body: JSON.stringify({ query, max_results: limit, search_depth: 'basic' }) };
  }
  if (provider === 'exa') {
    if (!keys.exaApiKey) throw new SurfError('search_unconfigured');
    return { url: 'https://api.exa.ai/search', method: 'POST', allowRedirects: false,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'x-api-key': keys.exaApiKey },
      body: JSON.stringify({ query, numResults: limit, contents: { text: { maxCharacters: 800 } } }) };
  }
  if (provider === 'github') {
    const url = new URL('https://api.github.com/search/repositories');
    url.searchParams.set('q', query);
    url.searchParams.set('per_page', String(limit));
    // 默认头已经带 user-agent（GitHub 不带会 403），这里不再重复加——额外的头只认固定白名单。
    return { url: url.href, method: 'GET', allowRedirects: true,
      headers: { Accept: 'application/vnd.github+json' } };
  }
  const url = new URL('https://huggingface.co/api/models');
  url.searchParams.set('search', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('sort', 'downloads');
  url.searchParams.set('direction', '-1');
  return { url: url.href, method: 'GET', allowRedirects: true, headers: { Accept: 'application/json' } };
}

export function parseJsonSearch(provider: JsonProvider, body: Buffer, limit: number): SearchItem[] {
  if (provider === 'github') {
    const payload = parsed(body);
    if (!payload || typeof payload !== 'object') throw new SurfError('search_parse');
    const list = (payload as Record<string, unknown>).items;
    if (!Array.isArray(list)) throw new SurfError('search_parse');
    const results: SearchItem[] = [];
    const seen = new Set<string>();
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const url = safeUrl(item.html_url);
      const title = flat(item.full_name, 300);
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      const extras: string[] = [];
      const stars = item.stargazers_count;
      if (typeof stars === 'number') extras.push('★' + stars);
      const language = flat(item.language, 40);
      if (language) extras.push(language);
      const description = flat(item.description, 600);
      results.push({ title, url, snippet: clipped([extras.join(' · '), description].filter(Boolean).join(' — '), 1200) });
      if (results.length >= limit) break;
    }
    return results;
  }
  if (provider === 'huggingface') {
    const payload = parsed(body);
    if (!Array.isArray(payload)) throw new SurfError('search_parse');
    const results: SearchItem[] = [];
    const seen = new Set<string>();
    for (const raw of payload) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const id = flat(item.id, 200) || flat(item.modelId, 200);
      if (!id) continue;
      const url = safeUrl('https://huggingface.co/' + id);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const extras: string[] = [];
      const pipeline = flat(item.pipeline_tag, 60);
      if (pipeline) extras.push(pipeline);
      if (typeof item.downloads === 'number') extras.push(item.downloads + ' downloads');
      if (typeof item.likes === 'number') extras.push(item.likes + ' likes');
      results.push({ title: id, url, snippet: clipped(extras.join(' · '), 1200) });
      if (results.length >= limit) break;
    }
    return results;
  }
  if (provider === 'tavily') {
    const results: SearchItem[] = [];
    const seen = new Set<string>();
    for (const raw of itemsOf(parsed(body))) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const url = safeUrl(item.url);
      const title = flat(item.title, 300);
      if (!url || !title || seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url, snippet: flat(item.content, 1200) });
      if (results.length >= limit) break;
    }
    return results;
  }
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  for (const raw of itemsOf(parsed(body))) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const url = safeUrl(item.url);
    const title = flat(item.title, 300) || url || '';
    if (!url || !title || seen.has(url)) continue;
    seen.add(url);
    const summary = flat(item.text, 1200) || flat(item.summary, 1200);
    results.push({ title, url, snippet: summary });
    if (results.length >= limit) break;
  }
  return results;
}
