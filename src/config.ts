/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import { ProviderError, SurfError } from './errors.ts';
import type { CustomSource, FactSource, PublicConfig, ScholarSource, SearchProvider, SearchZone, SurfConfig } from './types.ts';
import { isScholarSource } from './scholar.ts';
import { isFactSource } from './facts.ts';
export const MAX_PROVIDERS = 6;
export const defaults: SurfConfig = {
  searchProviders: ['anysearch'], searchMode: 'aggregate', braveApiKey: '', tavilyApiKey: '', exaApiKey: '', anysearchApiKey: '', anysearchZone: 'cn',
  proxyUrl: '', apiToken: '', timeoutMs: 20_000, sourceTimeouts: {}, providerFallbacks: {},
  aggregateConcurrency: 2, providerWeights: {}, providerTiers: {},
  maxPageBytes: 2 * 1024 * 1024, maxImageBytes: 8 * 1024 * 1024,
  maxTextChars: 60_000, resultsLimit: 5, structuredRead: true, resultsMaxChars: 8000, referenceTtlSeconds: 600, concurrency: 3, cacheSeconds: 300, sourceFailThreshold: 2, sourceCooldownSeconds: 60,
  scholarEnabled: false, scholarSources: ['arxiv', 'openalex', 'crossref'], scholarMailto: '', semanticScholarApiKey: '',
  factsEnabled: false, factsSources: ['wikipedia', 'wikidata', 'openlibrary', 'oeis'], factsLang: 'zh',
  customSources: [], scholarCustomSources: [], factsCustomSources: [],
};
export function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new SurfError('invalid_input');
  return input as Record<string, unknown>;
}
const limits = {
  timeoutMs: [1000, 60_000], maxPageBytes: [65536, 4 * 1024 * 1024],
  maxImageBytes: [65536, 16 * 1024 * 1024], maxTextChars: [1000, 100_000],
  resultsLimit: [1, 10], resultsMaxChars: [0, 40_000], referenceTtlSeconds: [30, 1800], concurrency: [1, 8], aggregateConcurrency: [1, 5], cacheSeconds: [0, 3600], sourceFailThreshold: [1, 10], sourceCooldownSeconds: [0, 600],
} as const;
const secrets = [
  ['braveApiKey', 'clearBraveApiKey', 512],
  ['anysearchApiKey', 'clearAnySearchApiKey', 512],
  ['tavilyApiKey', 'clearTavilyApiKey', 512],
  ['exaApiKey', 'clearExaApiKey', 512],
  ['semanticScholarApiKey', 'clearSemanticScholarApiKey', 512],
  ['proxyUrl', 'clearProxy', 2048],
] as const;
function isBuiltinProvider(value: unknown): value is Exclude<SearchProvider, `custom:${string}`> {
  return value === 'duckduckgo' || value === 'brave' || value === 'anysearch'
    || value === 'tavily' || value === 'exa';
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
    if (Object.keys(item).some(key => !['name', 'url', 'method', 'items', 'title', 'link', 'snippet', 'key', 'authors', 'year'].includes(key)))
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
    const authors = item.authors ?? '', year = item.year ?? '';
    for (const path of [authors, year]) {
      if (path !== '' && (typeof path !== 'string' || !CUSTOM_PATH.test(path))) throw new SurfError('config_invalid');
    }
    seen.add(name);
    output.push({ name, url, method, items, title, link, snippet: snippet as string, key,
      ...(authors ? { authors: authors as string } : {}), ...(year ? { year: year as string } : {}) });
  }
  return output;
}
function isZone(value: unknown): value is SearchZone {
  return value === 'cn' || value === 'intl';
}
export function parseConfig(value: unknown): SurfConfig {
  let field = '';
  try {
    const input = object(value), result = { ...defaults };
    const unknownKey = Object.keys(input).find(key => key !== 'searchProvider' && !Object.hasOwn(defaults, key));
    if (unknownKey !== undefined) throw new ProviderError('config_invalid', `未知字段「${unknownKey}」。`);
    field = 'customSources';
    if (input.customSources !== undefined) result.customSources = parseCustomSources(input.customSources);
    field = 'scholarCustomSources';
    if (input.scholarCustomSources !== undefined) result.scholarCustomSources = parseCustomSources(input.scholarCustomSources);
    field = 'factsCustomSources';
    if (input.factsCustomSources !== undefined) result.factsCustomSources = parseCustomSources(input.factsCustomSources);
    // 三个列表的名字共用一个命名空间：custom:名字 出现在哪条链上必须没有歧义。
    const everyName = [...result.customSources, ...result.scholarCustomSources, ...result.factsCustomSources].map(source => source.name);
    if (new Set(everyName).size !== everyName.length) throw new ProviderError('config_invalid', '三个自定义来源列表里有重名。');
    const customs = result.customSources;
    const scholarCustom = result.scholarCustomSources;
    const factsCustom = result.factsCustomSources;
    field = 'searchProvider';
    if (input.searchProvider !== undefined && !isProvider(input.searchProvider, customs)) throw new SurfError('config_invalid');
    field = 'searchProviders';
    const providers = input.searchProviders ?? (input.searchProvider === undefined ? defaults.searchProviders : [input.searchProvider]);
    if (!Array.isArray(providers) || providers.length === 0 || providers.length > MAX_PROVIDERS ||
        !providers.every(item => isProvider(item, customs)) || new Set(providers).size !== providers.length || input.searchProviders === null)
      throw new SurfError('config_invalid');
    result.searchProviders = [...providers];
    field = 'anysearchZone';
    if (input.anysearchZone !== undefined) {
      if (!isZone(input.anysearchZone)) throw new SurfError('config_invalid');
      result.anysearchZone = input.anysearchZone;
    }
    for (const [key, , max] of secrets) {
      if (input[key] === undefined) continue;
      field = key;
      const raw = input[key];
      if (typeof raw !== 'string' || raw.length > max || /[\x00-\x20\x7f]/.test(raw)) throw new SurfError('config_invalid');
      result[key] = raw;
    }
    field = 'apiToken';
    if (input.apiToken !== undefined) {
      const token = input.apiToken;
      if (typeof token !== 'string' || token.length > 128 || (token !== '' && !/^[A-Za-z0-9_-]{16,128}$/.test(token)))
        throw new SurfError('config_invalid');
      result.apiToken = token;
    }
    field = 'proxyUrl';
    if (result.proxyUrl) {
      const proxy = new URL(result.proxyUrl);
      if (!['http:', 'https:'].includes(proxy.protocol) || proxy.pathname !== '/' || proxy.search || proxy.hash || !proxy.hostname)
        throw new SurfError('config_invalid');
      result.proxyUrl = proxy.href;
    }
    field = 'sourceTimeouts';
    if (input.sourceTimeouts !== undefined) {
      const raw = input.sourceTimeouts;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > 8) throw new SurfError('config_invalid');
      const map: Record<string, number> = {};
      for (const [name, value] of entries) {
        if (!isProvider(name, customs) && !isScholarSource(name, scholarCustom) && !isFactSource(name, factsCustom)) throw new SurfError('config_invalid');
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1000 || value > 60_000) throw new SurfError('config_invalid');
        map[name] = value;
      }
      result.sourceTimeouts = map;
    }
    // 级别与权重：tier 决定“一级 / 二级”，weight 只决定分多少字。二级自己不再挂回退。
    field = 'providerTiers';
    if (input.providerTiers !== undefined) {
      const raw = input.providerTiers;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > MAX_PROVIDERS) throw new SurfError('config_invalid');
      const map: Record<string, 1 | 2> = {};
      for (const [name, value] of entries) {
        if (!isProvider(name, customs)) throw new SurfError('config_invalid');
        if (value !== 1 && value !== 2) throw new SurfError('config_invalid');
        map[name] = value;
      }
      result.providerTiers = map;
    }
    field = 'providerWeights';
    if (input.providerWeights !== undefined) {
      const raw = input.providerWeights;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > MAX_PROVIDERS) throw new SurfError('config_invalid');
      const map: Record<string, number> = {};
      for (const [name, value] of entries) {
        if (!isProvider(name, customs)) throw new SurfError('config_invalid');
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 5) throw new SurfError('config_invalid');
        map[name] = value;
      }
      result.providerWeights = map;
    }
    field = 'providerFallbacks';
    if (input.providerFallbacks !== undefined) {
      const raw = input.providerFallbacks;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new SurfError('config_invalid');
      const entries = Object.entries(raw as Record<string, unknown>);
      if (entries.length > MAX_PROVIDERS) throw new SurfError('config_invalid');
      const map: Record<string, string> = {};
      for (const [from, to] of entries) {
        if (typeof to !== 'string' || !isProvider(to, customs)) throw new SurfError('config_invalid');
        if (!isProvider(from, customs) || from === to) throw new SurfError('config_invalid');
        if (result.providerTiers[from] === 2) throw new SurfError('config_invalid');
        map[from] = to;
      }
      result.providerFallbacks = map;
    }
    for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
      if (input[key] === undefined) continue;
      field = key;
      const value = input[key], [low, high] = limits[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < low || value > high) throw new SurfError('config_invalid');
      result[key] = value;
    }
    field = 'searchMode';
    if (input.searchMode !== undefined) {
      if (input.searchMode !== 'fallback' && input.searchMode !== 'aggregate' && input.searchMode !== 'hybrid') throw new SurfError('config_invalid');
      result.searchMode = input.searchMode;
    }
    field = 'structuredRead';
    if (input.structuredRead !== undefined) {
      if (typeof input.structuredRead !== 'boolean') throw new SurfError('config_invalid');
      result.structuredRead = input.structuredRead;
    }
    field = 'scholarEnabled';
    if (input.scholarEnabled !== undefined) {
      if (typeof input.scholarEnabled !== 'boolean') throw new SurfError('config_invalid');
      result.scholarEnabled = input.scholarEnabled;
    }
    field = 'scholarSources';
    if (input.scholarSources !== undefined) {
      const list = input.scholarSources;
      if (!Array.isArray(list) || list.length === 0 || list.length > 5 || !list.every(item => isScholarSource(item, scholarCustom)) ||
          new Set(list).size !== list.length) throw new SurfError('config_invalid');
      result.scholarSources = [...(list as ScholarSource[])];
    }
    field = 'scholarMailto';
    if (input.scholarMailto !== undefined) {
      const mail = input.scholarMailto;
      if (typeof mail !== 'string' || mail.length > 200 || /[\x00-\x20\x7f]/.test(mail) ||
          (mail !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)))
        throw new SurfError('config_invalid');
      result.scholarMailto = mail;
    }
    field = 'factsEnabled';
    if (input.factsEnabled !== undefined) {
      if (typeof input.factsEnabled !== 'boolean') throw new SurfError('config_invalid');
      result.factsEnabled = input.factsEnabled;
    }
    field = 'factsSources';
    if (input.factsSources !== undefined) {
      const list = input.factsSources;
      if (!Array.isArray(list) || list.length === 0 || list.length > 4 || !list.every(item => isFactSource(item, factsCustom)) ||
          new Set(list).size !== list.length) throw new SurfError('config_invalid');
      result.factsSources = [...(list as FactSource[])];
    }
    field = 'factsLang';
    if (input.factsLang !== undefined) {
      if (input.factsLang !== 'zh' && input.factsLang !== 'en') throw new SurfError('config_invalid');
      result.factsLang = input.factsLang;
    }
    return result;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('config_invalid', field ? `字段「${field}」的值不合法。` : '');
  }
}
export function publicConfig(config: SurfConfig): PublicConfig {
  const { braveApiKey, anysearchApiKey, tavilyApiKey, exaApiKey, proxyUrl, semanticScholarApiKey, apiToken, ...rest } = config;
  return { ...rest, searchProviders: [...rest.searchProviders], searchProvider: rest.searchProviders[0],
    customSources: config.customSources.map(({ key, ...rest2 }) => ({ ...rest2, hasKey: Boolean(key) })),
    scholarCustomSources: config.scholarCustomSources.map(({ key, ...rest2 }) => ({ ...rest2, hasKey: Boolean(key) })),
    factsCustomSources: config.factsCustomSources.map(({ key, ...rest2 }) => ({ ...rest2, hasKey: Boolean(key) })),
    hasBraveApiKey: Boolean(braveApiKey), hasAnySearchApiKey: Boolean(anysearchApiKey),
    hasTavilyApiKey: Boolean(tavilyApiKey), hasExaApiKey: Boolean(exaApiKey), hasProxy: Boolean(proxyUrl),
    hasSemanticScholarApiKey: Boolean(semanticScholarApiKey), hasApiToken: Boolean(apiToken) };
}
export function updateConfig(value: unknown, current: SurfConfig): SurfConfig {
  const input = { ...object(value) };
  // 自定义来源的 Key 不回传页面：留空表示沿用同名旧值，要换才写新的。
  for (const field of ['customSources', 'scholarCustomSources', 'factsCustomSources'] as const) {
    if (!Array.isArray(input[field])) continue;
    const old = current[field];
    input[field] = (input[field] as unknown[]).map(raw => {
      if (!raw || typeof raw !== 'object') return raw;
      const item = raw as Record<string, unknown>;
      if (item.key === undefined || item.key === '') {
        const previous = old.find(source => source.name === item.name);
        if (previous) return { ...item, key: previous.key };
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
