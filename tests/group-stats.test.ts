/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: '分段自报家底' };

function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

function custom(name: string) {
  return { name, url: 'https://' + name + '.example/s?q={query}', method: 'GET' as const,
    items: 'data', title: 'name', link: 'url', snippet: 'desc', key: '',
    authors: 'auth', year: 'year' };
}

const result = (title: string, url: string) => ({ name: title, url, desc: title + ' 的摘要' });
const paper = (name: string, title: string) =>
  ({ name: title, url: 'https://doi.example/' + name, desc: title + ' 的摘要', auth: ['A. Author'], year: 2019 });

function webRuntime(get: PublicFetcher['get'], config: Partial<SurfConfig> = {}) {
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', resultsMaxChars: 0,
    searchProviders: ['custom:one', 'custom:two'], customSources: [custom('one'), custom('two')], cacheSeconds: 0 };
  return new SurfRuntime({ ...base, ...config }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}

test('聚合：每段自报 returned / shown / shared / viaMix', async () => {
  const surf = webRuntime(async url => {
    if (url.includes('one.example')) return reply(url, { data: [
      result('A', 'https://a.example/1'), result('B', 'https://b.example/2'), result('C', 'https://c.example/3')] });
    return reply(url, { data: [
      result('A2', 'https://a.example/1#top'), result('D', 'https://d.example/4'), result('E', 'https://e.example/5')] });
  });
  const out = await surf.search({ ...input, limit: 2 });
  if (out.status === 'error') assert.fail(JSON.stringify(out.error));
  const groups = (out.data as { groups: {
    provider: string; results: { url: string }[]; returned?: number; shown?: number;
    shared?: number; viaMix?: Record<string, number>; truncated?: number }[] }).groups;

  assert.equal(groups[0].returned, 3, 'returned 是裁剪之前的原始条数');
  assert.equal(groups[0].viaMix?.custom, 3, '自定义来源的通道是 custom');
  assert.equal(groups[1].shared, 1, '#top 归一后跟第一家撞了，这一段要记一条');
  for (const group of groups) {
    assert.equal(group.shown, group.results.length, 'shown 就是这一段最后展示的条数');
    assert.ok((group.shown ?? 0) <= (group.returned ?? 0), '展示的不会多于返回的');
  }
  assert.ok(groups.some(group => (group.shown ?? 0) < (group.returned ?? 0)), 'limit 压着小，至少一段被裁过');
  assert.ok(groups.some(group => (group.truncated ?? 0) > 0), '被裁的条数记在 truncated 上');
});

test('聚合：失败的那一段 returned/shown 都是 0，不谎报 viaMix', async () => {
  const surf = webRuntime(async url => {
    if (url.includes('one.example')) return reply(url, { message: 'boom' }, 500);
    return reply(url, { data: [result('D', 'https://d.example/4')] });
  });
  const out = await surf.search({ ...input, limit: 2 });
  if (out.status === 'error') assert.fail(JSON.stringify(out.error));
  const groups = (out.data as { groups: {
    results: unknown[]; returned?: number; shown?: number; shared?: number;
    viaMix?: Record<string, number>; error?: { code: string } }[] }).groups;
  assert.ok(groups[0].error, '失败原因留在自己那一段');
  assert.equal(groups[0].returned, 0);
  assert.equal(groups[0].shown, 0);
  assert.equal(groups[0].shared, undefined, '没东西可分，不写 0 装作统计过');
  assert.deepEqual(groups[0].viaMix, {}, '零条就没有通道构成');
  assert.equal(groups[1].shown, 1);
});

test('学术聚合：同样带回 returned / shown / shared', async () => {
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', scholarEnabled: true, resultsMaxChars: 0,
    scholarSources: ['custom:aaa', 'custom:bbb'], scholarCustomSources: [custom('aaa'), custom('bbb')], cacheSeconds: 0 };
  const surf = new SurfRuntime(base, { get: async url => {
    if (url.includes('aaa.example')) return reply(url, { data: [
      paper('1', 'Attention Is All You Need'), paper('2', 'Paged Attention')] });
    return reply(url, { data: [paper('3', 'attention is all you need!'), paper('4', 'Other Paper')] });
  }, dispose() {} }, { signal: new AbortController().signal, transient: true, configValid: true });

  const out = await surf.scholar({ sessionId: 'test', query: 'x', limit: 2 });
  if (out.status === 'error') assert.fail(JSON.stringify(out.error));
  const groups = (out.data as { groups: {
    source: string; items: unknown[]; returned?: number; shown?: number; shared?: number }[] }).groups;
  assert.equal(groups[0].returned, 2);
  assert.equal(groups[1].shared, 1, '标题归一后相同的那篇记一条');
  for (const group of groups) assert.equal(group.shown, group.items.length);
});
