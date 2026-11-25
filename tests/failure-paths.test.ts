/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import type { Context, PluginHandler } from 'whalelife';
import { defaults, parseConfig } from '../src/config.ts';
import { buildFactRequest } from '../src/facts.ts';
import { applyWithDependencies } from '../src/index.ts';
import { settingsPage } from '../src/page.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig, SurfService } from '../src/types.ts';

const input = { sessionId: 'test', query: 'test' };
const base = { ...defaults, searchProviders: ['anysearch'] } satisfies SurfConfig;
const results = [
  { title: 'First', url: 'https://example.org/a', snippet: 'A😀' + '"'.repeat(120) },
  { title: 'Second', url: 'https://example.org/b', snippet: 'Second result' },
];
function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}
function runtime(get: PublicFetcher['get'], config: Partial<SurfConfig> = {}) {
  return new SurfRuntime({ ...base, ...config }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true });
}
function success<T>(value: { status: 'ok'; data: T } | { status: 'error'; error: unknown }): T {
  if (value.status === 'error') assert.fail(JSON.stringify(value.error));
  return value.data;
}
function errorCode(value: { status: 'ok' } | { status: 'error'; error: { code: string } }) {
  assert.equal(value.status, 'error');
  return value.error.code;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('web result budget keeps an intact prefix and caches the drop count', async () => {
  let calls = 0;
  const skeleton = JSON.stringify([{ ...results[0], snippet: '' }]).length;
  const surf = runtime(async url => { calls++; return reply(url, { results }); });
  for (const [budget, expected] of [[1, ''], [skeleton + 2, 'A'], [skeleton + 5, 'A😀"']] as const) {
    surf.setConfig({ ...base, resultsMaxChars: budget });
    const first = success(await surf.search(input));
    assert.equal(first.results.length, 1);
    assert.equal(first.results[0].snippet, expected);
    assert.equal(first.truncated, 1);
    if (budget >= skeleton) assert.ok(JSON.stringify(first.results).length <= budget);
    const cached = success(await surf.search(input));
    assert.equal(cached.cached, true);
    assert.equal(cached.truncated, first.truncated);
    assert.deepEqual(cached.results, first.results);
  }
  assert.equal(calls, 3);
});

test('cache distinguishes web, scholar, facts and their query parameters', async () => {
  let calls = 0;
  const surf = runtime(async url => {
    calls++;
    if (url.includes('wikidata.org')) return reply(url, { search: [{ id: 'Q1' }] });
    if (url.includes('arxiv.org')) return { ...reply(url, {}), body: Buffer.from('<entry><title>Test</title><published>2020</published></entry>') };
    return reply(url, { results });
  }, { scholarEnabled: true, scholarSources: ['arxiv'], factsEnabled: true, factsSources: ['wikidata'] });
  for (const options of [{}, { zone: 'cn' }, { zone: 'intl' }, { language: 'en' }, { tag: 'sample' }, { limit: 1 }] as const) {
    assert.equal(success(await surf.search({ ...input, ...options })).cached, undefined);
    assert.equal(success(await surf.search({ ...input, ...options })).cached, true);
  }
  for (const yearMin of [2019, 2020]) {
    assert.equal(success(await surf.scholar({ ...input, yearMin })).cached, undefined);
    assert.equal(success(await surf.scholar({ ...input, yearMin })).cached, true);
  }
  for (const lang of ['en', 'zh'] as const) {
    assert.equal(success(await surf.facts({ ...input, lang })).cached, undefined);
    assert.equal(success(await surf.facts({ ...input, lang })).cached, true);
  }
  assert.equal(calls, 10);
});

test('saving configuration clears cached results and excludes an older in-flight result', async () => {
  const requests: Parameters<PublicFetcher['get']>[1][] = [];
  const entered = deferred<void>();
  const finish = deferred<Awaited<ReturnType<PublicFetcher['get']>>>();
  const surf = runtime(async (url, options) => {
    requests.push(options);
    if (requests.length === 2) { entered.resolve(); return finish.promise; }
    return reply(url, { results });
  });
  success(await surf.search({ ...input, query: 'warm' }));
  const old = surf.search(input);
  await entered.promise;
  surf.setConfig({ ...base, anysearchApiKey: 'new', proxyUrl: 'http://example.org/',
    timeoutMs: 1000, resultsMaxChars: 1 });
  finish.resolve(reply('https://example.org/', { results }));
  assert.equal(success(await old).results.length, 2);
  assert.equal(success(await surf.search(input)).results.length, 1);
  assert.equal(success(await surf.search({ ...input, query: 'warm' })).cached, undefined);
  assert.equal(requests.length, 4);
  assert.equal(requests[2].headers?.Authorization, 'Bearer new');
  assert.equal(requests[2].proxyUrl, 'http://example.org/');
  assert.ok(requests[2].timeoutMs <= 1000);
});

test('single-source timeout, HTTP failure and empty response are never cached', async () => {
  const attempts = new Map<string, number[]>();
  const surf = runtime(async (url, options) => {
    const key = new URL(url).hostname;
    const budgets = attempts.get(key) ?? [];
    attempts.set(key, budgets);
    budgets.push(options.timeoutMs);
    if (budgets.length === 1) await new Promise(resolve => setTimeout(resolve, 55));
    if (budgets.length === 2) return reply(url, {}, 500);
    if (key.includes('arxiv')) return { ...reply(url, {}), body: Buffer.from('<feed/>') };
    return reply(url, key.includes('wikidata') ? { search: [] } : { results: [] });
  }, { timeoutMs: 30, sourceTimeouts: { anysearch: 5000, wikidata: 5000, arxiv: 5000, bing: 5000 },
    scholarEnabled: true, scholarSources: ['arxiv'], factsEnabled: true, factsSources: ['wikidata'] });
  for (const method of ['search', 'scholar', 'facts'] as const) {
    for (const code of ['timeout', 'http_error', 'search_empty', 'search_empty']) {
      assert.equal(errorCode(await surf[method](input)), code);
    }
  }
  assert.equal(attempts.size, 3);
  for (const budgets of attempts.values()) {
    assert.equal(budgets.length, 4);
    assert.ok(budgets.every(budget => budget > 0 && budget <= 30));
  }
  assert.deepEqual(parseConfig({ sourceTimeouts: { wikidata: 1000, arxiv: 1000 } }).sourceTimeouts,
    { wikidata: 1000, arxiv: 1000 });
  assert.throws(() => parseConfig({ sourceTimeouts: { typo: 1000 } }), { code: 'config_invalid' });
});

test('fact language changes only Wikipedia and Wikidata requests', () => {
  const url = (source: Parameters<typeof buildFactRequest>[0], lang: string) =>
    new URL(buildFactRequest(source, 'test', 3, lang).url);
  for (const lang of ['zh', 'en']) {
    assert.equal(url('wikipedia', lang).hostname, lang + '.wikipedia.org');
    assert.equal(url('wikidata', lang).searchParams.get('language'), lang);
    assert.equal(url('wikidata', lang).searchParams.get('uselang'), lang);
  }
  for (const source of ['openlibrary', 'oeis'] as const) assert.equal(url(source, 'zh').href, url(source, 'en').href);
});

test('fallback reports its first timeout and gives the next source only the remaining budget', async () => {
  const budgets: number[] = [];
  const surf = runtime(async (url, options) => {
    budgets.push(options.timeoutMs);
    if (budgets.length === 1) await new Promise(resolve => setTimeout(resolve, 50));
    return reply(url, { results });
  }, { searchProviders: ['brave', 'anysearch'], braveApiKey: 'test-key',
    timeoutMs: 150, sourceTimeouts: { brave: 25, anysearch: 5000 } });
  const result = success(await surf.search(input));
  assert.equal(result.provider, 'anysearch');
  assert.equal(result.fallback?.[0].code, 'timeout');
  assert.deepEqual(budgets.slice(0, 1), [25]);
  assert.ok(budgets[1] > 0 && budgets[1] <= 125);
});

test('settings restore both the checked cards and their saved order', () => {
  const script = settingsPage.slice(settingsPage.indexOf('function restoreSourceOrder('), settingsPage.indexOf('function syncSrcCards('));
  const grid = { append(card: string) { order.splice(order.indexOf(card), 1); order.push(card); } };
  const order = ['first', 'second', 'third'];
  const boxes = order.map(value => ({ value, checked: value === 'second', closest: () => ({ parentElement: {
    append() { grid.append(value); },
  } }) }));
  runInNewContext(script + '\nrestoreSourceOrder(".source", ["third", "first", "unknown"]);',
    { document: { querySelectorAll: () => boxes } });
  assert.deepEqual(order.filter(name => boxes.find(box => box.value === name)?.checked), ['third', 'first']);
  assert.equal(boxes[1].checked, false);
});

test('saving and recreating the plugin reconciles both tools and reports registration failures', async () => {
  let saved: unknown = { scholarEnabled: true };
  let failure = '';
  let factOrigin = '';
  let service: SurfService | undefined;
  const fetcher: PublicFetcher = { async get(url) {
    factOrigin = new URL(url).hostname;
    return reply(url, { docs: [{ title: 'Book' }] });
  }, dispose() {} };
  async function start() {
    const tools = new Map();
    let handler: PluginHandler | undefined;
    function register(tool: { name: string }) {
      if (failure === 'register:' + tool.name) throw new Error('private test exception');
      tools.set(tool.name, tool);
      return () => {
        if (failure === 'unregister:' + tool.name) throw new Error('private test exception');
        tools.delete(tool.name);
      };
    }
    const ctx = {
      signal: new AbortController().signal, effect() {}, provide(_name: string, value: SurfService) { service = value; },
      config: { read: () => saved, save(_name: string, value: unknown) { saved = value; } },
      tools: { register, registerTransient: register },
      web: { page() {}, api(path: string, fn: PluginHandler) { if (path.endsWith('/config')) handler = fn; } },
    };
    await applyWithDependencies(ctx as unknown as Context, { fetcher });
    async function request(payload?: unknown) {
      const req = Object.assign(Readable.from(payload ? [JSON.stringify(payload)] : []), {
        method: payload ? 'POST' : 'GET', headers: { 'content-type': 'application/json' },
      });
      let body: { ok?: boolean; revision: string; registrationErrors: { tool: string; action: string }[] } | undefined;
      const res = { statusCode: 200, setHeader() {}, end(value: string) { body = JSON.parse(value); } };
      assert.ok(handler);
      await handler(req as unknown as Parameters<PluginHandler>[0], res as unknown as Parameters<PluginHandler>[1],
        { signal: ctx.signal } as Parameters<PluginHandler>[2]);
      assert.equal(res.statusCode, 200);
      assert.ok(body);
      return body;
    }
    return { tools, request, async save(config: Partial<SurfConfig>) {
      return request({ revision: (await request()).revision, config });
    } };
  }
  const first = await start();
  assert.equal(first.tools.has('search_scholar'), true);
  failure = 'unregister:search_scholar';
  const disabled = await first.save({ scholarEnabled: false, factsEnabled: true, factsSources: ['openlibrary', 'wikipedia'] });
  assert.equal(disabled.ok, true);
  assert.deepEqual(disabled.registrationErrors.map(({ tool, action }) => ({ tool, action })),
    [{ tool: 'search_scholar', action: 'unregister' }]);
  assert.doesNotMatch(JSON.stringify(disabled), /private test exception/);
  assert.equal(first.tools.has('search_facts'), true);
  assert.ok(service);
  assert.equal((await service.facts(input)).status, 'ok');
  assert.equal(factOrigin, 'openlibrary.org');
  failure = '';
  assert.deepEqual((await first.save({ scholarEnabled: false })).registrationErrors, []);
  assert.equal(first.tools.has('search_scholar'), false);
  const restarted = await start();
  assert.equal(restarted.tools.has('search_scholar'), false);
  assert.equal(restarted.tools.has('search_facts'), true);
  failure = 'register:search_scholar';
  const enabled = await restarted.save({ scholarEnabled: true, factsEnabled: false });
  assert.equal(enabled.registrationErrors[0].action, 'register');
  assert.equal(restarted.tools.has('search_facts'), false);
  assert.equal(restarted.tools.has('search_scholar'), false);
  const startupFailure = await start();
  assert.equal((await startupFailure.request()).registrationErrors[0].tool, 'search_scholar');
  failure = '';
  assert.equal((await start()).tools.has('search_scholar'), true);
});
