/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, publicConfig, updateConfig } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const result = (name: string, url: string) => ({ name, url, desc: name + ' 摘要' });
function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function custom(name: string) {
  return { name, url: 'https://' + name + '.example/s?q={query}', method: 'GET' as const,
    items: 'data', title: 'name', link: 'url', snippet: 'desc', key: '' };
}
/** 两家各给四条，去重后结果集八条；缓存开着，专门用来验命中之后翻页句柄归谁。 */
function runtime() {
  const get: PublicFetcher['get'] = async url => url.includes('one.example')
    ? reply(url, { data: [result('A1', 'https://a.example/1'), result('A2', 'https://a.example/2'),
      result('A3', 'https://a.example/3'), result('A4', 'https://a.example/4')] })
    : reply(url, { data: [result('B1', 'https://b.example/1'), result('B2', 'https://b.example/2'),
      result('B3', 'https://b.example/3'), result('B4', 'https://b.example/4')] });
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', resultsLimit: 3,
    searchProviders: ['custom:one', 'custom:two'], customSources: [custom('one'), custom('two')],
    cacheSeconds: 300, resultsMaxChars: 0, aggregateConcurrency: 2, providerWeights: {}, providerTiers: {} };
  return new SurfRuntime(base, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}
type Paged = {
  results: { url: string }[]; setId?: string; shown?: number; available?: number;
  hasMore?: boolean; cached?: boolean; notes?: string[];
};
function data(value: unknown) {
  const out = value as { status: 'ok'; data: Paged } | { status: 'error'; error: { code: string } };
  if (out.status === 'error') assert.fail(JSON.stringify(out.error));
  return out.data;
}

test('缓存命中：不递翻页句柄，免得给一个翻不动的', async () => {
  const surf = runtime();
  const first = data(await surf.search({ sessionId: 'api:alice', query: '同一句话', limit: 3 }));
  assert.ok(first.setId, '第一次是真打，得有 setId');
  const second = data(await surf.search({ sessionId: 'api:alice', query: '同一句话', limit: 3 }));
  assert.equal(second.cached, true, '这一发应该走缓存，不打网络');
  assert.equal(second.setId, undefined, '缓存里那份 setId 属于上一轮的会话与进度，不能原样递出去');
  assert.equal(second.hasMore, undefined);
  const shown = (second as unknown as { groups: { results: unknown[] }[] }).groups
    .reduce((sum, group) => sum + group.results.length, 0);
  assert.equal(shown, 3, '条目照给，聚合模式下它们在各段里');
});

test('跨会话：别人的 setId 拿不到', async () => {
  const surf = runtime();
  const alice = data(await surf.search({ sessionId: 'api:alice', query: '翻页缓存', limit: 3 }));
  const stolen = await surf.search({ sessionId: 'api:bob', query: '翻页缓存', more: alice.setId, limit: 3 });
  assert.equal(stolen.status, 'error');
  assert.equal((stolen as { error: { code: string } }).error.code, 'page_unavailable',
    '拿别人的 setId 必须报 page_unavailable');
});

test('同一会话：第一次的 setId 还能翻第二页', async () => {
  const surf = runtime();
  const first = data(await surf.search({ sessionId: 'api:alice', query: '真翻页', limit: 3 }));
  const next = data(await surf.search({ sessionId: 'api:alice', query: '真翻页', more: first.setId, limit: 3 }));
  assert.equal(next.results.length, 3);
});

test('缓存命中：回执说清没有句柄', async () => {
  const surf = runtime();
  await surf.search({ sessionId: 'api:alice', query: '说明', limit: 3 });
  const hit = data(await surf.search({ sessionId: 'api:alice', query: '说明', limit: 3 }));
  assert.equal(hit.cached, true);
  assert.ok((hit.notes ?? []).some(note => note.includes('这份来自缓存')), '得写明，别让人以为还能翻');
});

test('publicConfig 不回传令牌明文，只给有没有', () => {
  const config: SurfConfig = { ...defaults, apiToken: 'abcdefghijklmnop' };
  const pub = publicConfig(config) as unknown as Record<string, unknown>;
  assert.equal(pub.apiToken, undefined, '明文不能跟着配置回传');
  assert.equal(pub.hasApiToken, true);
  assert.equal((publicConfig({ ...defaults, apiToken: '' }) as unknown as Record<string, unknown>).hasApiToken, false);
});

test('保存时留空表示沿用，空串才清掉', () => {
  const current: SurfConfig = { ...defaults, apiToken: 'abcdefghijklmnop' };
  assert.equal(updateConfig({}, current).apiToken, 'abcdefghijklmnop', '不带这个字段就不动');
  assert.equal(updateConfig({ apiToken: '' }, current).apiToken, '', '空串是明确要清');
  assert.equal(updateConfig({ apiToken: 'Zx9_-abcdefghijklmn' }, current).apiToken, 'Zx9_-abcdefghijklmn');
  assert.throws(() => updateConfig({ apiToken: 'short' }, current));
});
