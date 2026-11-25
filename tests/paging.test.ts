/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
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
/** 两家各给四条互不相同的 URL，去重后结果集里应该有 8 条。 */
function runtime() {
  const get: PublicFetcher['get'] = async url => url.includes('one.example')
    ? reply(url, { data: [result('A1', 'https://a.example/1'), result('A2', 'https://a.example/2'),
      result('A3', 'https://a.example/3'), result('A4', 'https://a.example/4')] })
    : reply(url, { data: [result('B1', 'https://b.example/1'), result('B2', 'https://b.example/2'),
      result('B3', 'https://b.example/3'), result('B4', 'https://b.example/4')] });
  const base: SurfConfig = { ...defaults, searchMode: 'aggregate', resultsLimit: 3,
    searchProviders: ['custom:one', 'custom:two'], customSources: [custom('one'), custom('two')],
    cacheSeconds: 0, resultsMaxChars: 0, aggregateConcurrency: 2, providerWeights: {}, providerTiers: {} };
  return new SurfRuntime(base, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}
type Paged = {
  results: { url: string }[]; setId?: string; shown?: number; available?: number;
  hasMore?: boolean; pageStart?: number; notes?: string[];
};
function data(value: unknown) {
  const out = value as { status: 'ok'; data: Paged } | { status: 'error'; error: { code: string } };
  if (out.status === 'error') assert.fail(JSON.stringify(out.error));
  return out.data;
}

test('翻页：首次回执带 setId / shown / available / hasMore', async () => {
  const surf = runtime();
  const first = data(await surf.search({ sessionId: 'test', query: '翻页', limit: 3 }));
  assert.ok(first.setId, '要给出 setId，否则无从翻页');
  assert.equal(first.shown, 3);
  assert.equal(first.available, 8, '结果集里是裁之前那份完整的');
  assert.equal(first.hasMore, true);
});

test('翻页：传 more 取下一批，跟已经给过的 URL 不重复', async () => {
  const surf = runtime();
  const first = data(await surf.search({ sessionId: 'test', query: '翻页', limit: 3 }));
  const seen = new Set((first as unknown as { groups: { results: { url: string }[] }[] }).groups
    .flatMap(group => group.results.map(item => item.url)));
  assert.equal(seen.size, 3);

  const second = data(await surf.search({ sessionId: 'test', query: '翻页', more: first.setId, limit: 3 }));
  assert.equal(second.results.length, 3);
  for (const item of second.results) assert.ok(!seen.has(item.url), '翻页不该把已给过的再给一遍');
  assert.equal(second.setId, first.setId);
  assert.equal(second.hasMore, true);

  const third = data(await surf.search({ sessionId: 'test', query: '翻页', more: first.setId, limit: 3 }));
  assert.equal(third.results.length, 2, '8 条分两批 3+3 之后剩 2 条');
  assert.equal(third.hasMore, false);
  assert.match(third.notes?.join('') ?? '', /给完/);

  const fourth = data(await surf.search({ sessionId: 'test', query: '翻页', more: first.setId, limit: 3 }));
  assert.equal(fourth.results.length, 0, '给完之后再翻应该是空，不是重头再来');
  assert.equal(fourth.hasMore, false);
});

test('翻页：别的会话拿着 setId 取不到', async () => {
  const surf = runtime();
  const first = data(await surf.search({ sessionId: 'test', query: '翻页', limit: 3 }));
  const other = await surf.search({ sessionId: 'someone-else', query: '翻页', more: first.setId, limit: 3 });
  assert.equal(other.status, 'error');
  if (other.status === 'error') assert.equal(other.error.code, 'page_unavailable');
});

test('翻页：不存在的 setId 报 page_unavailable，不静默重新搜一次', async () => {
  const surf = runtime();
  const out = await surf.search({ sessionId: 'test', query: '翻页', more: 'set_nope', limit: 3 });
  assert.equal(out.status, 'error');
  if (out.status === 'error') assert.equal(out.error.code, 'page_unavailable');
});
