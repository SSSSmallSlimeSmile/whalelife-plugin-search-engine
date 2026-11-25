/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: '聚合测试' };
const result = (title: string, url: string) => ({ name: title, url, desc: title + ' 的摘要' });

function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

function custom(name: string) {
  return { name, url: 'https://' + name + '.example/s?q={query}', method: 'GET' as const,
    items: 'data', title: 'name', link: 'url', snippet: 'desc', key: '' };
}

function runtime(get: PublicFetcher['get'], config: Partial<SurfConfig> = {}) {
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate',
    searchProviders: ['custom:one', 'custom:two'], customSources: [custom('one'), custom('two')], cacheSeconds: 0 };
  return new SurfRuntime({ ...base, ...config }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}

function data(value: { status: 'ok'; data: unknown } | { status: 'error'; error: unknown }) {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data as {
    provider: string; mode?: string; results: unknown[];
    groups?: { provider: string; elapsedMs: number; results: { url: string; dupOf?: string }[]; truncated?: number;
      error?: { code: string; reason: string }; skipped?: string }[];
    overlap?: number; untrusted: true;
  };
}

test('aggregate: 两家各成一段、顶层 results 为空、重复的带 dupOf', async () => {
  const surf = runtime(async url => {
    if (url.includes('one.example')) return reply(url, { data: [
      result('A', 'https://a.example/1'), result('B', 'https://b.example/2')] });
    return reply(url, { data: [
      result('A2', 'https://a.example/1#top'), result('C', 'https://c.example/3')] });
  });
  const out = data(await surf.search(input));
  assert.equal(out.mode, 'aggregate');
  assert.equal(out.provider, 'aggregate');
  assert.deepEqual(out.results, [], '顶层 results 留空，免得同一批内容出现两遍');
  assert.equal(out.groups?.length, 2);
  assert.deepEqual(out.groups?.map(g => g.provider), ['custom:one', 'custom:two']);
  assert.deepEqual(out.groups?.[0].results.map(r => r.url), ['https://a.example/1', 'https://b.example/2']);
  // #top 归一化后与第一条相同，应标 dupOf 指向先给出的那家
  assert.equal(out.groups?.[1].results[0].dupOf, 'custom:one');
  assert.equal(out.groups?.[1].results[1].dupOf, undefined);
  assert.equal(out.overlap, 1);
});

test('aggregate: 一家挂了不拖累另一家，挂的那家原因留在自己的组里', async () => {
  const surf = runtime(async url => {
    if (url.includes('one.example')) return reply(url, { message: 'boom' }, 500);
    return reply(url, { data: [result('C', 'https://c.example/3')] });
  });
  const out = data(await surf.search(input));
  assert.equal(out.groups?.[0].results.length, 0);
  assert.ok(out.groups?.[0].error, '失败原因要留在那一段上');
  assert.equal(out.groups?.[1].results.length, 1);
});

test('aggregate: 全部挂掉才报 search_exhausted，不是一家没结果就报', async () => {
  const surf = runtime(async url => reply(url, { message: 'down' }, 503));
  const out = await surf.search(input);
  assert.equal(out.status, 'error');
  if (out.status === 'error') assert.equal((out.error as { code: string }).code, 'search_exhausted');
});

test('aggregate: 连上但零条也算没结果，和失败一样不产出内容', async () => {
  const surf = runtime(async url => reply(url, { data: [] }));
  const out = await surf.search(input);
  assert.equal(out.status, 'error');
});

test('aggregate: 总量预算按组顺序分配，被丢的条数记在那一段的 truncated 上', async () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => result('T' + i, `https://a.example/${i}`));
  let seen = 0;
  const surf = runtime(async url => {
    if (url.includes('one.example')) { seen++; return reply(url, { data: items(3) }); }
    return reply(url, { data: items(3) });
  }, { resultsMaxChars: 400 });
  const out = data(await surf.search(input));
  assert.ok(seen >= 1);
  const kept = out.groups?.reduce((sum, g) => sum + g.results.length, 0) ?? 0;
  assert.ok(kept < 6, '预算是真在拦，不是全放行');
  const dropped = out.groups?.reduce((sum, g) => sum + (g.truncated ?? 0), 0) ?? 0;
  assert.equal(kept + dropped, 6, '丢掉多少要数得清');
});

test('fallback 模式不受聚合影响：拿到第一家结果就停，不打第二家', async () => {
  const calls: string[] = [];
  const surf = runtime(async url => {
    calls.push(url);
    if (url.includes('one.example')) return reply(url, { data: [result('A', 'https://a.example/1')] });
    return reply(url, { data: [result('C', 'https://c.example/3')] });
  }, { searchMode: 'fallback' });
  const out = data(await surf.search(input));
  assert.equal(out.provider, 'custom:one');
  assert.equal(out.groups, undefined);
  assert.equal(out.results.length, 1);
  assert.equal(calls.length, 1, '第二家不该被请求');
});

test('缓存键把聚合和回退分开：切模式不会拿到另一种模式的结果', async () => {
  const surf = runtime(async url => reply(url, { data: [result('A', 'https://a.example/1')] }), { cacheSeconds: 300 });
  const agg = data(await surf.search(input));
  assert.equal(agg.mode, 'aggregate');
  surf.setConfig({ ...defaults, searchMode: 'fallback', cacheSeconds: 300,
    searchProviders: ['custom:one', 'custom:two'], customSources: [custom('one'), custom('two')] });
  const flat = data(await surf.search(input));
  assert.equal(flat.mode, undefined);
  assert.equal(flat.results.length, 1);
});
