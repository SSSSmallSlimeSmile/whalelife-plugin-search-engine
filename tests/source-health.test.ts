/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const input = { sessionId: 'test', query: 'health' };
// 这一组测的是回退语义与冷却，跟“默认用哪种搜索方式”无关，所以把模式钉死。
const base = {
  ...defaults, searchMode: 'fallback', searchProviders: ['anysearch', 'tavily'], cacheSeconds: 0,
  sourceFailThreshold: 2, sourceCooldownSeconds: 60, tavilyApiKey: 'k',
} satisfies SurfConfig;
const results = [{ title: 'First', url: 'https://example.org/a', snippet: 'A' }];
const tvly = { results: [{ title: 'T', url: 'https://example.org/g', content: 'C' }] };
function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function clock(start = 1_000_000) {
  let value = start;
  return { now: () => value, advance(ms: number) { value += ms; } };
}
type Clock = ReturnType<typeof clock>;
function runtime(get: PublicFetcher['get'], over: Partial<SurfConfig>, tick: Clock) {
  return new SurfRuntime({ ...base, ...over }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true, now: tick.now });
}
function success<T>(value: { status: 'ok'; data: T } | { status: 'error'; error: unknown }): T {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data;
}
/** 只区分两个来源：tavily 一定成功，其余当 anysearch。 */
function fetcher(hits: string[], shouldFail: () => boolean): PublicFetcher['get'] {
  return async url => {
    hits.push(url);
    if (url.includes('tavily')) return reply(url, tvly);
    return shouldFail() ? reply(url, {}, 500) : reply(url, { results });
  };
}

test('consecutive failures put a source on cooldown and it gets skipped', async () => {
  const tick = clock();
  const hits: string[] = [];
  let failing = true;
  const surf = runtime(fetcher(hits, () => failing), {}, tick);

  const first = success(await surf.search({ ...input, query: 'q1' }));
  assert.equal(first.provider, 'tavily');
  assert.equal(first.fallback?.[0].code, 'http_error');

  const second = success(await surf.search({ ...input, query: 'q2' }));
  assert.equal(second.fallback?.[0].code, 'http_error');

  const before = hits.length;
  const third = success(await surf.search({ ...input, query: 'q3' }));
  assert.equal(third.provider, 'tavily');
  assert.equal(third.fallback?.[0].code, 'source_cooling');
  assert.match(third.fallback?.[0].reason ?? '', /还剩 \d+ 秒/);
  assert.equal(hits.length - before, 1, '冷却中的来源不该再被请求');
});

test('cooldown expires on its own and the source is tried again', async () => {
  const tick = clock();
  const hits: string[] = [];
  let failing = true;
  const surf = runtime(fetcher(hits, () => failing), {}, tick);
  for (const query of ['q1', 'q2', 'q3']) await surf.search({ ...input, query });
  assert.equal(success(await surf.search({ ...input, query: 'q4' })).fallback?.[0].code, 'source_cooling');

  tick.advance(61_000);
  failing = false;
  const recovered = success(await surf.search({ ...input, query: 'q5' }));
  assert.equal(recovered.provider, 'anysearch');
  assert.equal(recovered.fallback, undefined);
});

test('one success clears the failure count, so failures must be consecutive', async () => {
  const tick = clock();
  const hits: string[] = [];
  const script = [true, false, true, true, true];
  let index = 0;
  const surf = runtime(fetcher(hits, () => script[Math.min(index++, script.length - 1)]), {}, tick);

  await surf.search({ ...input, query: 'a' });   // 失败 1 次
  await surf.search({ ...input, query: 'b' });   // 成功，清零
  await surf.search({ ...input, query: 'c' });   // 失败 1 次
  const fourth = success(await surf.search({ ...input, query: 'd' }));  // 失败 2 次 → 这次之后才冷却
  assert.equal(fourth.fallback?.[0].code, 'http_error');
  const fifth = success(await surf.search({ ...input, query: 'e' }));
  assert.equal(fifth.fallback?.[0].code, 'source_cooling');
});

test('zero results count as an answer, not a failure', async () => {
  const tick = clock();
  const hits: string[] = [];
  const surf = runtime(async url => {
    hits.push(url);
    if (url.includes('tavily')) return reply(url, tvly);
    return reply(url, { results: [] });
  }, {}, tick);
  for (const query of ['q1', 'q2', 'q3', 'q4']) {
    const data = success(await surf.search({ ...input, query }));
    assert.equal(data.provider, 'tavily');
    assert.equal(data.fallback?.[0].code, 'search_empty');
  }
  assert.equal(hits.filter(url => !url.includes('tavily')).length, 4, '零条结果不该把来源关进冷却');
});

test('cooldown can be turned off with sourceCooldownSeconds: 0', async () => {
  const tick = clock();
  const hits: string[] = [];
  const surf = runtime(fetcher(hits, () => true), { sourceCooldownSeconds: 0 }, tick);
  for (const query of ['q1', 'q2', 'q3', 'q4']) {
    const data = success(await surf.search({ ...input, query }));
    assert.equal(data.fallback?.[0].code, 'http_error');
  }
  assert.equal(hits.filter(url => !url.includes('tavily')).length, 4);
});

test('when every source is cooling, all are still tried instead of returning nothing', async () => {
  const tick = clock();
  const hits: string[] = [];
  const surf = runtime(async url => { hits.push(url); return reply(url, {}, 500); }, {}, tick);
  for (const query of ['q1', 'q2']) {
    const value = await surf.search({ ...input, query });
    assert.equal(value.status, 'error');
  }
  const before = hits.length;
  const third = await surf.search({ ...input, query: 'q3' });
  assert.equal(third.status, 'error');
  assert.equal(hits.length - before, 2, '全部冷却时必须硬打，不能空手而归');
  const codes = (third as unknown as { error: { message: string } }).error.message;
  assert.ok(!codes.includes('冷却中'), '强制重试时不该再报冷却');
});

test('scholar shares the same cooldown rule', async () => {
  const tick = clock();
  const hits: string[] = [];
  let failing = true;
  const surf = runtime(async url => {
    hits.push(url);
    if (url.includes('crossref')) return reply(url, { message: { items: [] } });
    return failing ? reply(url, {}, 503)
      : { ...reply(url, {}), body: Buffer.from('<feed><entry><title>T</title><published>2020</published></entry></feed>') };
  }, { scholarEnabled: true, scholarSources: ['arxiv', 'crossref'] }, tick);

  for (const query of ['s1', 's2']) await surf.scholar({ ...input, query });
  const before = hits.filter(url => url.includes('arxiv')).length;
  const third = await surf.scholar({ ...input, query: 's3' });
  if (third.status === 'ok') {
    assert.equal(third.data.fallback?.[0].code, 'source_cooling');
  } else {
    assert.match(JSON.stringify(third.error), /冷却中/);
  }
  assert.equal(hits.filter(url => url.includes('arxiv')).length - before, 0, '冷却中的学术来源不该再被请求');
});
