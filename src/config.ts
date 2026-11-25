/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { SurfError } from './errors.ts';
import type { CustomSource, FactSource, PublicConfig, ScholarSource, SearchProvider, SearchZone, SurfConfig } from './types.ts';
import { isScholarSource } from './scholar.ts';
import { isFactSource } from './facts.ts';
export const MAX_PROVIDERS = 6;
export const defaults: SurfConfig = {
  searchProviders: ['bing'], braveApiKey: '', tavilyApiKey: '', exaApiKey: '', anysearchApiKey: '', anysearchZone: 'cn',
  proxyUrl: '', timeoutMs: 20_000, sourceTimeouts: {},
  maxPageBytes: 2 * 1024 * 1024, maxImageBytes: 8 * 1024 * 1024,
  maxTextChars: 60_000, resultsLimit: 5, referenceTtlSeconds: 600, concurrency: 3, cacheSeconds: 300,
  scholarEnabled: false, scholarSources: ['arxiv', 'openalex', 'crossref'], scholarMailto: '',
  factsEnabled: false, factsSources: ['wikipedia', 'wikidata', 'openlibrary', 'oeis'], factsLang: 'zh',
  customSources: [],
};
export function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SurfError('invalid_input');
  return input as Record<string, unknown>;
}
const limits = {
  timeoutMs: [1000, 60_000], maxPageBytes: [65536, 4 * 1024 * 1024],
  maxImageBytes: [65536, 16 * 1024 * 1024], maxTextChars: [1000, 100_000],
  resultsLimit: [1, 10], referenceTtlSeconds: [30, 1800], concurrency: [1, 8], cacheSeconds: [0, 3600],
} as const;
const secrets = [
  ['braveApiKey', 'clearBraveApiKey', 512],
  ['anysearchApiKey', 'clearAnySearchApiKey', 512],
  ['tavilyApiKey', 'clearTavilyApiKey', 512],
  ['exaApiKey', 'clearExaApiKey', 512],
  ['proxyUrl', 'clearProxy', 2048],
] as const;
function isBuiltinProvider(value: unknown): value is Exclude<SearchProvider, `custom:${string}`> {
  return value === 'bing' || value === 'duckduckgo' || value === 'brave' || value === 'anysearch'
    || value === 'tavily' || value === 'exa' || value === 'github' || value === 'huggingface';
}
function isProvider(value: unknown, customs: CustomSource[]): value is SearchProvider {
  if (isBuiltinProvider(value)) return true;
  if (typeof value !== 'string' || !value.startsWith('custom:')) return false;
  const name = value.slice(7);
  return customs.some(source => source.name === name);
}
export const CUSTOM_NAME = /^[a-z0-9][a-z0-9_-]{0,23}$/;
const CUSTOM_PATH = /^(\$|[A-Za-z0-9_.-]{1,64})$/;
/** 自定义来源只吃点路径的 JSON：不认 HTML、不认数组下标，字段路径写错当场拒。 */
function parseCustomSources(input: unknown): CustomSource[] {
  if (!Array.isArray(input) || input.length > 8) throw new SurfError('config_invalid');
  const seen = new Set<string>();
  const output: CustomSource[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
    const item = raw as Record<string, unknown>;
    if (Object.keys(item).some(key => !['name', 'url', 'method', 'items', 'title', 'link', 'snippet', 'key'].includes(key)))
      throw new SurfError('config_invalid');
    const name = item.name, url = item.url;
    if (typeof name !== 'string' || !CUSTOM_NAME.test(name) || seen.has(name)) throw new SurfError('config_invalid');
    if (typeof url !== 'string' || url.length > 2048 || !url.includes('{query}') || /[\x00-\x20\x7f]/.test(url))
      throw new SurfError('config_invalid');
    let probe: URL;
    try { probe = new URL(url.split('{query}').join('x')); } catch { throw new SurfError('config_invalid'); }
    if (!['http:', 'https:'].includes(probe.protocol) || probe.username || probe.password) throw new SurfError('config_invalid');
    const method = item.method === undefined || item.method === 'GET' ? 'GET' : item.method === 'POST' ? 'POST' : null;
    if (method === null) throw new SurfError('config_invalid');
    const items = item.items, title = item.title, link = item.link, snippet = item.snippet ?? '';
    if (typeof items !== 'string' || !CUSTOM_PATH.test(items)) throw new SurfError('config_invalid');
    if (typeof title !== 'string' || !CUSTOM_PATH.test(title)) throw new SurfError('config_invalid');
    if (typeof link !== 'string' || !CUSTOM_PATH.test(link)) throw new SurfError('config_invalid');
    if (snippet !== '' && (typeof snippet !== 'string' || !CUSTOM_PATH.test(snippet))) throw new SurfError('config_invalid');
    const key = item.key ?? '';
    if (typeof key !== 'string' || key.length > 512 || /[\x00-\x20\x7f]/.test(key)) throw new SurfError('config_invalid');
    seen.add(name);
    output.push({ name, url, method, items, title, link, snippet: snippet as string, key });
  }
  return output;
}
function isZone(value: unknown): value is SearchZone {
  return value === 'cn' || value === 'intl';
}
export function parseConfig(value: unknown): SurfConfig {
  try {
    const input = object(value), result = { ...defaults };
    if (Object.keys(input).some(key => key !== 'searchProvider' && !Object.hasOwn(defaults, key))) throw new SurfError('config_invalid');
    if (input.customSources !== undefined) result.customSources = parseCustomSources(input.customSources);
    const customs = result.customSources;
    if (input.searchProvider !== undefined && !isProvider(input.searchProvider, customs)) throw new SurfError('config_invalid');
    const providers = input.searchProviders ?? (input.searchProvider === undefined ? defaults.searchProviders : [input.searchProvider]);
    if (!Array.isArray(providers) || providers.length === 0 || providers.length > MAX_PROVIDERS ||
        !providers.every(item => isProvider(item, customs)) || new Set(providers).size !== providers.length || input.searchProviders === null)
      throw new SurfError('config_invalid');
    result.searchProviders = [...providers];
    if (input.anysearchZone !== undefined) {
      if (!isZone(input.anysearchZone)) throw new SurfError('config_invalid');
      result.anysearchZone = input.anysearchZone;
    }
    for (const [key, , max] of secrets) {
      if (input[key] === undefined) continue;
      const raw = input[key];
      if (typeof raw !== 'string' || raw.length > max || /[\x00-\x20\x7f]/.test(raw)) throw new SurfError('config_invalid');
      result[key] = raw;
    }
    if (result.proxyUrl) {
      const proxy = new URL(result.proxyUrl);
      if (!['http:', 'https:'].includes(proxy.protocol) || proxy.pathname !== '/' || proxy.search || proxy.hash || !proxy.hostname)
        throw new SurfError('config_invalid');
      result.proxyUrl = proxy.href;
    }
    if (input.sourceTimeouts !== undefined) {
      const raw = input.sourceTimeouts;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > 8) throw new SurfError('config_invalid');
      const map: Record<string, number> = {};
      for (const [name, value] of entries) {
        if (!isProvider(name, customs)) throw new SurfError('config_invalid');
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1000 || value > 60_000) throw new SurfError('config_invalid');
        map[name] = value;
      }
      result.sourceTimeouts = map;
    }
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      if (input[key] === undefined) continue;
      const value = input[key], [low, high] = limits[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) throw new SurfError('config_invalid');
      result[key] = value;
    }
    if (input.scholarEnabled !== undefined) {
      if (typeof input.scholarEnabled !== 'boolean') throw new SurfError('config_invalid');
      result.scholarEnabled = input.scholarEnabled;
    }
    if (input.scholarSources !== undefined) {
      const list = input.scholarSources;
      if (!Array.isArray(list) || list.length === 0 || list.length > 4 || !list.every(isScholarSource) ||
          new Set(list).size !== list.length) throw new SurfError('config_invalid');
      result.scholarSources = [...(list as ScholarSource[])];
    }
    if (input.scholarMailto !== undefined) {
      const mail = input.scholarMailto;
      if (typeof mail !== 'string' || mail.length > 200 || /[\x00-\x20\x7f]/.test(mail) ||
          (mail !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)))
        throw new SurfError('config_invalid');
      result.scholarMailto = mail;
    }
    if (input.factsEnabled !== undefined) {
      if (typeof input.factsEnabled !== 'boolean') throw new SurfError('config_invalid');
      result.factsEnabled = input.factsEnabled;
    }
    if (input.factsSources !== undefined) {
      const list = input.factsSources;
      if (!Array.isArray(list) || list.length === 0 || list.length > 4 || !list.every(isFactSource) ||
          new Set(list).size !== list.length) throw new SurfError('config_invalid');
      result.factsSources = [...(list as FactSource[])];
    }
    if (input.factsLang !== undefined) {
      if (input.factsLang !== 'zh' && input.factsLang !== 'en') throw new SurfError('config_invalid');
      result.factsLang = input.factsLang;
    }
    return result;
  } catch { throw new SurfError('config_invalid'); }
}
export function publicConfig(config: SurfConfig): PublicConfig {
  const { braveApiKey, anysearchApiKey, tavilyApiKey, exaApiKey, proxyUrl, ...rest } = config;
  return { ...rest, searchProviders: [...rest.searchProviders], searchProvider: rest.searchProviders[0],
    customSources: config.customSources.map(({ key, ...rest2 }) => ({ ...rest2, hasKey: Boolean(key) })),
    hasBraveApiKey: Boolean(braveApiKey), hasAnySearchApiKey: Boolean(anysearchApiKey),
    hasTavilyApiKey: Boolean(tavilyApiKey), hasExaApiKey: Boolean(exaApiKey), hasProxy: Boolean(proxyUrl) };
}
export function updateConfig(value: unknown, current: SurfConfig): SurfConfig {
  const input = { ...object(value) };
  // 自定义来源的 Key 不回传页面：留空表示沿用同名旧值，要换才写新的。
  if (Array.isArray(input.customSources)) {
    input.customSources = (input.customSources as unknown[]).map(raw => {
      if (!raw || typeof raw !== 'object') return raw;
      const item = raw as Record<string, unknown>;
      if (item.key === undefined || item.key === '') {
        const old = current.customSources.find(source => source.name === item.name);
        if (old) return { ...item, key: old.key };
      }
      return raw;
    });
  }
  for (const [key, clear] of secrets) {
    if (input[clear] !== undefined && typeof input[clear] !== 'boolean') throw new SurfError('config_invalid');
    if (input[clear] === true && input[key] !== undefined && input[key] !== '') throw new SurfError('config_invalid');
    input[key] = input[clear] === true ? '' : (input[key] === '' || input[key] === undefined ? current[key] : input[key]);
    delete input[clear];
  }
  return parseConfig({ ...current, ...input,
    searchProviders: Object.hasOwn(input, 'searchProvider') && !Object.hasOwn(input, 'searchProviders')
      ? undefined : input.searchProviders === undefined ? current.searchProviders : input.searchProviders });
}
