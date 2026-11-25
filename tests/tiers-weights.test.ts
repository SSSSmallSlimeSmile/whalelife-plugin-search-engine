/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, parseConfig } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SearchProvider, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: '层级测试' };
const hit = (title: string, url: string) => ({ name: title, url, desc: title + ' 的摘要' });
const reply = (url: string, body: unknown) => ({ url, status: 200, headers: {}, body: Buffer.from(JSON.stringify(body)) });
const custom = (name: string) => ({ name, url: 'https://' + name + '.example/s?q={query}', method: 'GET' as const,
  items: 'data', title: 'name', link: 'url', snippet: 'desc', key: '' });

function runtime(get: PublicFetcher['get'], config: Partial<SurfConfig> = {}) {
  const names = ['one', 'two', 'three'];
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', cacheSeconds: 0,
    searchProviders: names.map(name => 'custom:' + name) as SearchProvider[],
    customSources: names.map(custom) };
  return new SurfRuntime({ ...base, ...config }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}

function data(value: { status: 'ok'; data: unknown } | { status: 'error'; error: unknown }) {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data as { groups?: { provider: string; results: unknown[]; weight?: number; budgetChars?: number }[] };
}

const three = (url: string) => {
  for (const name of ['one', 'two', 'three']) if (url.includes(name + '.example')) return reply(url, { data: [hit(name, 'https://' + name + '.example/a')] });
  return reply(url, { data: [] });
};

test('默认并发两家：去重后条目已经够 limit，第三家这次不打', async () => {
  const seen: string[] = [];
  const surf = runtime(async url => { seen.push(url); return three(url); });
  const out = data(await surf.search({ ...input, limit: 1 }));
  assert.deepEqual(seen.map(url => url.split('.')[0].replace('https://', '')), ['one', 'two']);
  assert.deepEqual(out.groups?.map(group => group.provider), ['custom:one', 'custom:two']);
});

test('并发数调到 3 就打满三家', async () => {
  const seen: string[] = [];
  const surf = runtime(async url => { seen.push(url); return three(url); }, { aggregateConcurrency: 3 });
  const out = data(await surf.search({ ...input, limit: 1 }));
  assert.equal(seen.length, 3);
  assert.equal(out.groups?.length, 3);
});

test('前两家给的条数不够，就按链序补下一家', async () => {
  const seen: string[] = [];
  const surf = runtime(async url => {
    seen.push(url);
    if (url.includes('three.example')) return reply(url, { data: [hit('三', 'https://three.example/a'), hit('四', 'https://four.example/b')] });
    return reply(url, { data: [hit('一', 'https://one.example/a')] });
  });
  const out = data(await surf.search({ ...input, limit: 3 }));
  assert.equal(seen.length, 3, '两家共 2 条（重复一条），不够 3 条才补第三家');
  assert.equal(out.groups?.length, 3);
});

test('预算按权重切：没配过一级 3、二级 1', async () => {
  const surf = runtime(three, { resultsMaxChars: 4000, providerTiers: { 'custom:two': 2 }, aggregateConcurrency: 3 });
  const out = data(await surf.search({ ...input, limit: 3 }));
  assert.deepEqual(out.groups?.map(group => group.weight), [3, 1, 3]);
  assert.deepEqual(out.groups?.map(group => group.budgetChars), [1714, 571, 1714]);
});

test('显式权重压过缺省，份额跟着变', async () => {
  const surf = runtime(three, { resultsMaxChars: 1200, providerWeights: { 'custom:one': 5, 'custom:two': 2 }, aggregateConcurrency: 2 });
  const out = data(await surf.search({ ...input, limit: 2 }));
  assert.deepEqual(out.groups?.map(group => group.weight), [5, 2]);
  assert.deepEqual(out.groups?.map(group => group.budgetChars), [857, 342]);
});

test('配置校验：二级来源不许挂回退，权重只收 1–5', () => {
  const base = { searchProviders: ['anysearch', 'duckduckgo'], customSources: [] };
  assert.throws(() => parseConfig({ ...base, providerTiers: { duckduckgo: 2 }, providerFallbacks: { duckduckgo: 'anysearch' } }));
  assert.throws(() => parseConfig({ ...base, providerWeights: { anysearch: 6 } }));
  assert.throws(() => parseConfig({ ...base, providerWeights: { anysearch: 0 } }));
  assert.throws(() => parseConfig({ ...base, providerTiers: { anysearch: 3 } }));
  assert.throws(() => parseConfig({ ...base, aggregateConcurrency: 6 }));
  const ok = parseConfig({ ...base, providerTiers: { duckduckgo: 2 }, providerWeights: { anysearch: 5 }, providerFallbacks: { anysearch: 'duckduckgo' }, aggregateConcurrency: 3 });
  assert.deepEqual(ok.providerTiers, { duckduckgo: 2 });
  assert.deepEqual(ok.providerWeights, { anysearch: 5 });
  assert.equal(ok.aggregateConcurrency, 3);
});

test('limit 是这一轮总共几条，不是每家几条', async () => {
  const many = (url: string) => {
    const name = ['one', 'two', 'three'].find(item => url.includes(item + '.example')) ?? 'one';
    return reply(url, { data: Array.from({ length: 5 }, (_, index) => hit(name + index, 'https://' + name + '.example/' + index)) });
  };
  const surf = runtime(many, { aggregateConcurrency: 2, providerWeights: { 'custom:one': 5, 'custom:two': 3 } });
  const out = data(await surf.search({ ...input, limit: 5 }));
  const total = (out.groups ?? []).reduce((sum, group) => sum + group.results.length, 0);
  assert.equal(total, 5, '两家各 5 条，总数也得是 5');
  assert.deepEqual(out.groups?.map(group => group.results.length), [3, 2], '按权重 5:3 分到 3 条和 2 条');
});

test('空段不参与分预算，那份不白扔', async () => {
  const half = (url: string) => url.includes('one.example') ? reply(url, { data: [] }) : three(url);
  const surf = runtime(half, { resultsMaxChars: 4000, aggregateConcurrency: 2 });
  const out = data(await surf.search({ ...input, limit: 3 }));
  const budgets = out.groups?.map(group => group.budgetChars);
  assert.equal(budgets?.[0], undefined, '零条那家不占预算');
  assert.ok((budgets?.[1] ?? 0) > 1000, '剩下的份额给有结果的段');
});
