/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { AggregateGroup, PublicFetcher, SearchData, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: 'standby' };
// 这一组只关心“某一家没拿到结果时怎么办”，模式与默认值无关，钉死。
const base = {
  ...defaults, searchMode: 'aggregate', searchProviders: ['anysearch'], cacheSeconds: 0,
  sourceFailThreshold: 10, sourceCooldownSeconds: 60,
} satisfies SurfConfig;
const results = [{ title: 'Second', url: 'https://example.org/s', snippet: 'S' }];
const repo = { items: [{ full_name: 'a/b', html_url: 'https://github.com/a/b', stargazers_count: 1, description: 'd' }] };
function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function runtime(get: PublicFetcher['get'], over: Partial<SurfConfig>) {
  return new SurfRuntime({ ...base, ...over }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true, now: () => 1_000_000 });
}
function group(data: SearchData, provider: string): AggregateGroup {
  const found = data.groups?.find(item => item.provider === provider);
  assert.ok(found, '没有 ' + provider + ' 这一段');
  return found;
}
/** anysearch 一律按 primary 给的答复回；github 永远成功。 */
function fetcher(hits: string[], primary: () => { status?: number; body: unknown }) {
  return async (url: string) => {
    hits.push(url);
    if (url.includes('github')) return reply(url, repo);
    const answer = primary();
    return reply(url, answer.body, answer.status ?? 200);
  };
}

test('primary fails, its standby answers and the reason is kept', async () => {
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => ({ body: {}, status: 500 })),
    { providerFallbacks: { anysearch: 'github' } });
  const data = (await surf.search(input)).data as SearchData;
  const any = group(data, 'anysearch');
  assert.equal(any.results.length, 1, '二级的结果应当落在这家名下');
  assert.equal(any.results[0].url, 'https://github.com/a/b');
  assert.equal(any.error?.code, 'http_error', '原来那家为什么没顶上要留着');
  assert.equal(any.standby?.provider, 'github');
  assert.ok((any.standby?.elapsedMs ?? -1) >= 0);
  assert.equal(any.standby?.error, undefined, '二级成功时不该带二级的错误');
});

test('zero results also counts as “did not get there”', async () => {
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => ({ body: { results: [] } })),
    { providerFallbacks: { anysearch: 'github' } });
  const data = (await surf.search(input)).data as SearchData;
  const any = group(data, 'anysearch');
  assert.equal(any.error?.code, 'search_empty');
  assert.equal(any.standby?.provider, 'github');
  assert.equal(any.results.length, 1);
});

test('standby fails too: nothing faked, both reasons kept', async () => {
  const hits: string[] = [];
  const surf = runtime(async (url: string) => { hits.push(url); return reply(url, {}, 500); },
    { providerFallbacks: { anysearch: 'github' } });
  const value = await surf.search(input);
  assert.equal(value.status, 'error', '两家全挂时不该给出成功');
  const why = JSON.stringify(value.error);
  assert.match(why, /anysearch/, '原来那家的原因要在');
  assert.match(why, /二级 github/, '二级自己的原因也要带出来');
});

test('a standby that is already on the chain is not requested twice', async () => {
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => ({ body: {}, status: 500 })),
    { searchProviders: ['anysearch', 'github'], providerFallbacks: { anysearch: 'github' } });
  const data = (await surf.search(input)).data as SearchData;
  assert.equal(hits.filter(url => url.includes('github')).length, 1, '同一个来源不该被打两遍');
  assert.equal(group(data, 'anysearch').results.length, 0);
  assert.match(String(group(data, 'anysearch').standby?.reason), /没有重打/);
  assert.equal(data.notes?.some(note => note.includes('不重打')), true, '不重打要说出来');
});

test('no standby configured: same as before — no result, just the reason', async () => {
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => ({ body: {}, status: 500 })), { providerFallbacks: {} });
  const value = await surf.search(input);
  assert.equal(value.status, 'error', '没有二级时，唯一一段也空，就是全挂');
  assert.match(JSON.stringify(value.error), /anysearch/);
  assert.equal(hits.length, 1, '没有二级就不该再多打一家');
});

test('hybrid: the primary slot slides down the chain and says why', async () => {
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => ({ body: {}, status: 500 })),
    { searchMode: 'hybrid', searchProviders: ['anysearch', 'github'], providerFallbacks: {} });
  const data = (await surf.search(input)).data as SearchData;
  assert.equal(data.mode, 'hybrid');
  assert.equal(data.primary, 'github', '首位没拿到结果时，主位顺延到下一个有结果的');
  assert.equal(data.primaryFallback?.length, 1);
  assert.equal(data.primaryFallback?.[0].provider, 'anysearch');
  assert.equal(data.primaryFallback?.[0].code, 'http_error');
});

test('hybrid: when the first source answers, nothing is marked as slid', async () => {
  const hits: string[] = [];
  const surf = runtime(async (url: string) => { hits.push(url); return reply(url, { results }); },
    { searchMode: 'hybrid', searchProviders: ['anysearch', 'github'], providerFallbacks: {} });
  const data = (await surf.search(input)).data as SearchData;
  assert.equal(data.primary, 'anysearch');
  assert.equal(data.primaryFallback, undefined);
});
