/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: 'scholar aggregate' };

function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

function custom(name: string) {
  return { name, url: 'https://' + name + '.example/s?q={query}', method: 'GET' as const,
    items: 'data', title: 'name', link: 'url', snippet: 'desc', key: '',
    authors: 'auth', year: 'year' };
}

const paper = (name: string, title: string, year = 2019) =>
  ({ name: title, url: 'https://doi.example/' + name, desc: title + ' 的摘要', auth: ['A. Author'], year });

function runtime(get: PublicFetcher['get'], config: Partial<SurfConfig> = {}) {
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', scholarEnabled: true,
    scholarSources: ['custom:aaa', 'custom:bbb'], scholarCustomSources: [custom('aaa'), custom('bbb')],
    cacheSeconds: 0 };
  return new SurfRuntime({ ...base, ...config }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}

function data(value: { status: 'ok'; data: unknown } | { status: 'error'; error: unknown }) {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data as {
    source: string; mode?: string; items: unknown[];
    groups?: { source: string; elapsedMs: number; items: { title: string; dupOf?: string }[];
      truncated?: number; error?: { code: string; reason: string }; skipped?: string }[];
    overlap?: number; untrusted: true; notes?: string[];
  };
}

test('学术聚合：两家各成一段、顶层 items 为空、同一篇带 dupOf', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [
      paper('1', 'Attention Is All You Need'), paper('2', 'Paged Attention')] });
    return reply(url, { data: [paper('3', 'attention is all you need!'), paper('4', 'Other Paper')] });
  });
  const out = data(await surf.scholar(input));
  assert.equal(out.mode, 'aggregate');
  assert.equal(out.source, 'aggregate');
  assert.deepEqual(out.items, [], '顶层 items 留空，免得同一批文献出现两遍');
  assert.deepEqual(out.groups?.map(g => g.source), ['custom:aaa', 'custom:bbb']);
  // 标题归一后相同：第二家那条标 dupOf 指向先给出的那家
  assert.equal(out.groups?.[1].items[0].dupOf, 'custom:aaa');
  assert.equal(out.groups?.[1].items[1].dupOf, undefined);
  assert.equal(out.overlap, 1);
});

test('学术聚合：一家填了 DOI、一家没填，同一篇标题也要认出来', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [
      { ...paper('1', 'KV-Repurpose: A Testbed'), doi: '10.48550/arxiv.2610.13060' }] });
    // arXiv 那边不填 DOI，只有标题
    return reply(url, { data: [paper('2', 'KV-Repurpose: A Testbed')] });
  });
  const out = data(await surf.scholar(input));
  assert.equal(out.groups?.[1].items[0].dupOf, 'custom:aaa', 'DOI 与标题任一相同即同一篇');
  assert.equal(out.overlap, 1);
});

test('学术聚合：一篇两个键只算一条，不把条数算高', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [
      { ...paper('1', 'Same Title'), doi: '10.1/x' }] });
    return reply(url, { data: [paper('2', 'Other')] });
  }, { aggregateConcurrency: 1, resultsLimit: 2 });
  const out = data(await surf.scholar({ ...input, limit: 2 }));
  // 去重后只有 2 篇；若按“键”计数会算成 3，误以为够了而不去打第二家
  assert.equal(out.groups?.length, 2, '两篇要算两篇，不该因为一篇有两个键就提前收手');
});

test('学术聚合：一家挂了不拖累另一家，原因留在自己那一段', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { message: 'boom' }, 500);
    return reply(url, { data: [paper('3', 'Other Paper')] });
  });
  const out = data(await surf.scholar(input));
  assert.equal(out.groups?.[0].items.length, 0);
  assert.ok(out.groups?.[0].error, '失败原因要留在那一段上');
  assert.equal(out.groups?.[1].items.length, 1);
});

test('学术聚合：全部挂掉才报 search_exhausted', async () => {
  const surf = runtime(async url => reply(url, { message: 'down' }, 503));
  const out = await surf.scholar(input);
  assert.equal(out.status, 'error');
  if (out.status === 'error') assert.equal((out.error as { code: string }).code, 'search_exhausted');
});

test('学术聚合：零条算应答、不算失败，另一家照常出结果', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [] });
    return reply(url, { data: [paper('1', 'Attention Is All You Need')] });
  });
  const out = data(await surf.scholar(input));
  assert.equal(out.groups?.[0].items.length, 0);
  assert.equal(out.groups?.[0].error?.code, 'search_empty');
  assert.equal(out.groups?.[1].items.length, 1);
});

test('学术聚合：并发 1 家、条数不够就一路补下去，全打完时不写“没打”', async () => {
  const calls: string[] = [];
  const surf = runtime(async url => {
    calls.push(url);
    const name = url.includes('aaa') ? 'A' : url.includes('bbb') ? 'B' : 'C';
    return reply(url, { data: [paper(name, 'Paper ' + name)] });
  }, { aggregateConcurrency: 1,
    scholarSources: ['custom:aaa', 'custom:bbb', 'custom:ccc'],
    scholarCustomSources: [custom('aaa'), custom('bbb'), custom('ccc')] });
  const out = data(await surf.scholar({ ...input, limit: 5 }));
  assert.equal(out.groups?.length, 3);
  assert.equal(calls.length, 3);
  assert.ok(!out.notes?.some((note: string) => note.includes('没打')), '全打完了就别写剩下没打');
});

test('学术聚合：并发 1 家、第一家就够 limit 时，后面的不打', async () => {
  const calls: string[] = [];
  const surf = runtime(async url => {
    calls.push(url);
    const name = url.includes('aaa') ? 'A' : url.includes('bbb') ? 'B' : 'C';
    return reply(url, { data: [paper(name + '1', 'Paper ' + name + '1'), paper(name + '2', 'Paper ' + name + '2')] });
  }, { aggregateConcurrency: 1,
    scholarSources: ['custom:aaa', 'custom:bbb', 'custom:ccc'],
    scholarCustomSources: [custom('aaa'), custom('bbb'), custom('ccc')] });
  const out = data(await surf.scholar({ ...input, limit: 2 }));
  assert.equal(calls.length, 1, '第一家就够 limit，不该再打');
  assert.equal(out.groups?.length, 1);
  assert.ok(out.notes?.some((note: string) => note.includes('没打') && note.includes('2 家')), '要写明剩下的没打');
});

test('学术聚合：yearMin 在这一段里过滤，全被滤掉时记成那一段没结果', async () => {
  const surf = runtime(async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [paper('1', 'Old Paper', 1999)] });
    return reply(url, { data: [paper('2', 'New Paper', 2023)] });
  });
  const out = data(await surf.scholar({ ...input, yearMin: 2020 }));
  assert.equal(out.groups?.[0].items.length, 0);
  assert.match(out.groups?.[0].error?.reason ?? '', /yearMin/);
  assert.deepEqual(out.groups?.[1].items.map(item => item.title), ['New Paper']);
});

test('学术回退模式不受影响：mode=fallback 时仍是单来源', async () => {
  const surf = runtime(async url => reply(url, { data: [paper('1', 'Only One')] }), { searchMode: 'fallback' });
  const out = data(await surf.scholar(input));
  assert.equal(out.source, 'custom:aaa');
  assert.equal(out.mode, undefined);
  assert.equal(out.groups, undefined);
});
