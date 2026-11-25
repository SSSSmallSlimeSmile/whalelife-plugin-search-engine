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
const base = {
  ...defaults, searchMode: 'fallback', searchProviders: ['anysearch', 'tavily'], cacheSeconds: 0,
  sourceFailThreshold: 1, sourceCooldownSeconds: 60, tavilyApiKey: 'k',
} satisfies SurfConfig;
const results = [{ title: 'First', url: 'https://example.org/a', snippet: 'A' }];
const tvly = { results: [{ title: 'T', url: 'https://example.org/t', content: 'C' }] };
function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function runtime(get: PublicFetcher['get'], over: Partial<SurfConfig>) {
  let value = 1_000_000;
  return new SurfRuntime({ ...base, ...over }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true, now: () => value++ });
}
function success<T>(value: { status: 'ok'; data: T } | { status: 'error'; error: unknown }): T {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data;
}
function failure(value: { status: 'ok'; data: unknown } | { status: 'error'; error: { code: string; message: string } }) {
  if (value.status === 'ok') assert.fail('这一次本该失败');
  return (value as { error: { code: string; message: string } }).error;
}
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 零条结果算“应答”，要把它之前的失败账清掉：不然两次失败里夹一次空结果，阈值还是会被凑满。
test('an empty answer clears the source failure count', async () => {
  const plan: Array<'fail' | 'empty'> = ['fail', 'empty', 'fail', 'fail'];
  const surf = runtime(async url => {
    if (!url.includes('anysearch')) return reply(url, tvly);
    const step = plan.shift();
    if (step === 'fail') return reply(url, {}, 500);
    if (step === 'empty') return reply(url, { results: [] });
    return reply(url, { results });
  }, { sourceFailThreshold: 2 });

  // 第一次真失败：anysearch 记 1 次。
  assert.equal(success(await surf.search({ ...input, query: 'q1' })).fallback?.[0].code, 'http_error');
  // 第二次连上但零条：这是应答，旧账清掉。
  assert.equal(success(await surf.search({ ...input, query: 'q2' })).fallback?.[0].code, 'search_empty');
  // 第三次再失败：清过账，所以只算第 1 次。
  assert.equal(success(await surf.search({ ...input, query: 'q3' })).fallback?.[0].code, 'http_error');
  // 第四次失败：这才是第 2 次，冷却从下一次才生效——所以这次仍是 http_error。
  // 旧账没清的话，这一条会变成 source_cooling。
  assert.equal(success(await surf.search({ ...input, query: 'q4' })).fallback?.[0].code, 'http_error');
});

// 前一家把总预算吃光、后一家根本没打出去——这条不能算成后一家的失败，否则它会被冷却掉。
test('a source that never got a request is not counted as a failure', async () => {
  const surf = runtime(async url => {
    // anysearch 慢到吃光整份预算；tavily 很快，只要被请求就成功。
    if (url.includes('tavily')) return reply(url, tvly);
    await sleep(120);
    return reply(url, { results });
  }, { sourceFailThreshold: 1, timeoutMs: 40, sourceTimeouts: { anysearch: 40 } });

  // 第一轮：anysearch 用掉 30ms（它自己的失败，记 1 次 → 冷却）；
  // tavily 只剩不到一个完整预算，根本没打出去，回执里记的是“总预算用尽”，不是它的失败。
  const first = failure(await surf.search({ ...input, query: 'q1' }));
  assert.equal(first.code, 'search_exhausted');
  assert.match(first.message, /budget|总预算用尽/);

  // 第二轮：anysearch 在冷却，tavily 必须还在场上。
  // 如果上一轮把它误记了一次失败（阈值 1），这一轮它也会被跳过，结果仍是 search_exhausted。
  const second = success(await surf.search({ ...input, query: 'q2' }));
  assert.equal(second.provider, 'tavily');
  assert.equal(second.fallback?.[0].code, 'source_cooling');
});

// 只分到平时一小部分时间（被前一家吃掉预算）的那一条，也不该算成它自己的失败。
test('a source squeezed into a fraction of its budget is not counted as a failure', async () => {
  const surf = runtime(async url => {
    // anysearch 吃掉 250ms；tavily 只剩几十毫秒，根本不够它跑完 60ms 的响应。
    if (url.includes('tavily')) { await sleep(60); return reply(url, tvly); }
    await sleep(400);
    return reply(url, { results });
  }, { timeoutMs: 300, sourceTimeouts: { anysearch: 250, tavily: 300 } });

  const first = failure(await surf.search({ ...input, query: 'q1' }));
  // 回执里要说清这一条是“预算不够”，不是它自己超时。
  assert.match(first.message, /tavily \(0 ms\): 总预算用尽/);
  assert.doesNotMatch(first.message, /tavily \(\d+ ms\): 请求超时/);

  // 它没被记失败（阈值 1），所以第二轮仍在场上，拿到完整预算就成功了。
  const second = success(await surf.search({ ...input, query: 'q2' }));
  assert.equal(second.provider, 'tavily');
  assert.equal(second.fallback?.[0].code, 'source_cooling');
});
// 402 是额度耗尽：单列一个错误码，并且不把上游正文带进回执（那里可能有账号或 key）。
test('a 402 from anysearch is reported as quota exhaustion without the upstream body', async () => {
  const surf = runtime(async url => reply(url, { message: 'quota exhausted for as_sk_deadbeef', account: 'u-1' }, 402),
    { searchProviders: ['anysearch'] });
  const error = failure(await surf.search(input));
  assert.equal(error.code, 'search_quota');
  assert.doesNotMatch(error.message, /as_sk_deadbeef|quota exhausted for/);
});
