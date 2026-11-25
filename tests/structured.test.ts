/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import { detectStructured } from '../src/structured.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const config = { ...defaults, searchProviders: ['bing'], cacheSeconds: 0 } satisfies SurfConfig;
const html = '<html><head><title>页面标题</title></head><body><article>'
  + '<p>这里是页面正文，长度足够让解析器认为这是一篇普通文章。</p></article></body></html>';

function reply(url: string, body: string, status = 200, contentType = 'text/html') {
  return { url, status, headers: { 'content-type': contentType }, body: Buffer.from(body, 'utf8') };
}
function json(url: string, value: unknown, status = 200) {
  return reply(url, JSON.stringify(value), status, 'application/json');
}
function runtime(get: PublicFetcher['get'], over: Partial<SurfConfig> = {}) {
  return new SurfRuntime({ ...config, ...over }, { get, dispose() {} },
    { signal: new AbortController().signal, transient: true, configValid: true, now: () => 1_000_000 });
}
async function read(get: PublicFetcher['get'], url: string, over: Partial<SurfConfig> = {}) {
  const result = await runtime(get, over).read({ url, sessionId: 'test' });
  return result;
}

test('detect: 认得出四类页面，别的返回 undefined', () => {
  assert.equal(detectStructured('https://github.com/nodejs/node/issues/1')?.kind, 'github-issue');
  assert.equal(detectStructured('https://github.com/nodejs/node/pull/39')?.kind, 'github-pr');
  const release = detectStructured('https://github.com/a/b/releases/tag/v1.0.0');
  assert.equal(release?.kind, 'github-release');
  assert.equal(release?.tag, 'v1.0.0');
  assert.equal(detectStructured('https://github.com/a/b')?.kind, undefined);
  assert.equal(detectStructured('https://stackoverflow.com/questions/11227809/slug')?.site, 'stackoverflow');
  assert.equal(detectStructured('https://math.stackexchange.com/questions/42')?.site, 'math');
  assert.equal(detectStructured('https://arxiv.org/abs/1706.03762')?.arxivId, '1706.03762');
  assert.equal(detectStructured('https://arxiv.org/pdf/1706.03762.pdf')?.arxivId, '1706.03762');
  assert.equal(detectStructured('https://zh.wikipedia.org/wiki/%E6%B3%A8%E6%84%8F')?.lang, 'zh');
  assert.equal(detectStructured('https://example.org/questions/1'), undefined);
  assert.equal(detectStructured('not a url'), undefined);
});

test('github issue：走 API，带状态、标签、评论，notice 说明不是页面快照', async () => {
  const hits: string[] = [];
  const get: PublicFetcher['get'] = async url => {
    hits.push(url);
    if (url.endsWith('/issues/7/comments?per_page=30')) {
      return json(url, [{ user: { login: 'alice' }, created_at: '2026-01-02', body: '第二条评论' }]);
    }
    if (url.endsWith('/issues/7')) {
      return json(url, { title: '标题七', state: 'open', user: { login: 'bob' }, labels: [{ name: 'bug' }, { name: 'help wanted' }],
        created_at: '2026-01-01', updated_at: '2026-01-03', html_url: 'https://github.com/a/b/issues/7',
        body: '这是正文', comments: 11 });
    }
    return reply(url, html);
  };
  const result = await read(get, 'https://github.com/a/b/issues/7');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  const data = result.data;
  assert.equal(data.title, '标题七');
  assert.match(data.text, /状态：open/);
  assert.match(data.text, /标签：bug、help wanted/);
  assert.match(data.text, /@alice（2026-01-02）：/);
  assert.match(data.text, /还有 10 条评论没取/);
  assert.match(data.notice ?? '', /公开 API/);
  assert.ok(hits.every(url => !url.endsWith('github.com/a/b/issues/7')), '不该再去抓页面');
});

test('结构化失败就回落页面抓取，回执里写明原因', async () => {
  const hits: string[] = [];
  const get: PublicFetcher['get'] = async url => {
    hits.push(url);
    if (url.includes('api.github.com')) return json(url, { message: 'Not Found' }, 404);
    return reply(url, html);
  };
  const result = await read(get, 'https://github.com/a/b/issues/9');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.match(result.data.notice ?? '', /结构化读取（GitHub issue）没成，回落到页面抓取：http_error/);
  assert.match(result.data.text, /这里是页面正文/);
});

test('structuredRead 关掉时不打 API', async () => {
  const hits: string[] = [];
  const get: PublicFetcher['get'] = async url => { hits.push(url); return reply(url, html); };
  const result = await read(get, 'https://github.com/a/b/issues/9', { structuredRead: false });
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.ok(hits.every(url => !url.includes('api.github.com')));
  assert.equal(result.data.notice, undefined);
});

test('维基条目不存在就回落，不把 missing 当正文', async () => {
  const get: PublicFetcher['get'] = async url => {
    if (url.includes('w/api.php')) return json(url, { query: { pages: { '-1': { title: 'KanTest', missing: '' } } } });
    return reply(url, html);
  };
  const result = await read(get, 'https://zh.wikipedia.org/wiki/KanTest');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.match(result.data.notice ?? '', /unsupported_content/);
  assert.match(result.data.text, /这里是页面正文/);
});

test('Stack Exchange：正文里的裸尖括号不被当成标签吃掉', async () => {
  const get: PublicFetcher['get'] = async url => {
    if (url.includes('/answers?')) {
      return json(url, { items: [{ score: 9, is_accepted: true, owner: { display_name: 'dave' },
        body: '<p>答案正文</p><pre><code>#include &lt;vector&gt;</code></pre>' }] });
    }
    if (url.includes('/questions/1?')) {
      return json(url, { items: [{ title: '问题一', score: 3, answer_count: 2, view_count: 10, accepted_answer_id: 5,
        owner: { display_name: 'erin' }, creation_date: 1_300_000_000, link: 'https://stackoverflow.com/questions/1',
        body: '<p>问题正文</p>' }] });
    }
    return reply(url, html);
  };
  const result = await read(get, 'https://stackoverflow.com/questions/1');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.match(result.data.text, /#include <vector>/);
  assert.match(result.data.text, /【已采纳】/);
  assert.match(result.data.notice ?? '', /按票数排序/);
});

test('arXiv：Atom 接口解析出作者、摘要与备注', async () => {
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:arxiv="http://arxiv.org/schemas/atom">
  <entry>
    <id>http://arxiv.org/abs/1706.03762v1</id>
    <title>Attention Is All You Need</title>
    <summary>We propose a new simple network architecture.</summary>
    <published>2017-06-12T17:57:34Z</published>
    <author><name>Ashish Vaswani</name></author>
    <author><name>Noam Shazeer</name></author>
    <arxiv:comment>15 pages, 5 figures</arxiv:comment>
  </entry>
</feed>`;
  const get: PublicFetcher['get'] = async url => {
    if (url.includes('export.arxiv.org')) return reply(url, atom, 200, 'application/atom+xml');
    return reply(url, html);
  };
  const result = await read(get, 'https://arxiv.org/abs/1706.03762');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.equal(result.data.title, 'Attention Is All You Need');
  assert.match(result.data.text, /Ashish Vaswani、Noam Shazeer/);
  assert.match(result.data.text, /15 pages, 5 figures/);
  assert.match(result.data.text, /We propose a new simple network architecture/);
});

test('正文仍按条截断：超长正文带 nextOffset 和 remainingChars', async () => {
  const long = 'x'.repeat(7000);
  const get: PublicFetcher['get'] = async url => json(url, { title: 't', state: 'open', user: { login: 'a' },
    created_at: '2026-01-01', updated_at: '2026-01-01', html_url: 'https://github.com/a/b/issues/1', body: long, comments: 0 });
  const result = await read(get, 'https://github.com/a/b/issues/1');
  if (result.status !== 'ok') assert.fail(JSON.stringify(result.error));
  assert.equal(result.data.text.length, 6000);
  assert.equal(typeof result.data.nextOffset, 'number');
  assert.ok(result.data.remainingChars > 0);
});
