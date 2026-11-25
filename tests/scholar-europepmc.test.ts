/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaults, publicConfig, updateConfig } from '../src/config.ts';
import { SurfRuntime } from '../src/runtime.ts';
import { buildRequest, parseScholar } from '../src/scholar.ts';
import type { PublicFetcher, SurfConfig } from '../src/types.ts';

const epmcBody = {
  hitCount: 431,
  resultList: {
    result: [
      {
        id: 'PPR1364571', source: 'PPR', doi: '10.21203/rs.3.rs-11684582/v1',
        title: 'Break Later or Never: Prefix-Preserving Context Compaction',
        authorString: 'Cim M, Topcu B, Kandemir M.',
        pubYear: '2026', journalTitle: '', citedByCount: 0,
        abstractText: 'We study prefix reuse in long sessions.',
      },
      {
        id: '31958998', source: 'MED', title: 'A paper without a DOI',
        authorString: 'Doe J.', pubYear: '2019', journalTitle: 'Journal of Tests', citedByCount: 7,
        abstractText: '<p>Body with <b>markup</b>.</p>',
      },
    ],
  },
};

const input = { sessionId: 'test', query: 'prefix caching' };

function reply(url: string, body: unknown, status = 200) {
  return { url, status, headers: {}, body: Buffer.from(JSON.stringify(body)) };
}

test('Semantic Scholar：填了 Key 就放进 x-api-key 头，不填就不带这个头', () => {
  const withKey = buildRequest('semanticscholar', 'prompt', 3, '', [], 'ak_TEST');
  assert.equal(withKey.headers['x-api-key'], 'ak_TEST');
  assert.equal(withKey.headers.Accept, 'application/json');
  const noKey = buildRequest('semanticscholar', 'prompt', 3, '', []);
  assert.equal(noKey.headers['x-api-key'], undefined, '匿名时不发空头');
});

test('Europe PMC：打公开 REST 接口，要 json 和 core，条数跟着 limit', () => {
  const req = buildRequest('europepmc', 'crispr base editing', 4, '');
  const url = new URL(req.url);
  assert.equal(url.origin + url.pathname, 'https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  assert.equal(url.searchParams.get('format'), 'json');
  assert.equal(url.searchParams.get('resultType'), 'core');
  assert.equal(url.searchParams.get('pageSize'), '4');
  assert.equal(url.searchParams.get('query'), 'crispr base editing');
});

test('Europe PMC：解析出作者、年份、DOI、被引数；没 DOI 时退回文章页', () => {
  const items = parseScholar('europepmc', Buffer.from(JSON.stringify(epmcBody)), 5);
  assert.equal(items.length, 2);
  const first = items[0];
  assert.equal(first.source, 'europepmc');
  assert.deepEqual(first.authors, ['Cim M', 'Topcu B', 'Kandemir M'], '作者串按逗号拆，去掉句末的点');
  assert.equal(first.year, 2026);
  assert.equal(first.doi, '10.21203/rs.3.rs-11684582/v1');
  assert.equal(first.url, 'https://doi.org/10.21203/rs.3.rs-11684582/v1');
  assert.match(first.abstract, /prefix reuse/);

  const second = items[1];
  assert.equal(second.doi, undefined);
  assert.equal(second.url, 'https://europepmc.org/article/MED/31958998');
  assert.equal(second.venue, 'Journal of Tests');
  assert.equal(second.citations, 7);
  assert.equal(second.abstract, 'Body with markup.', '摘要里的标记要剥掉');
});

test('Europe PMC：resultList 结构不对时报 search_parse，不静默返回空数组', () => {
  assert.throws(() => parseScholar('europepmc', Buffer.from(JSON.stringify({ hitCount: 0 })), 5));
});

test('配置：学术来源允许五家，六家照旧被拒', () => {
  const five = updateConfig({ scholarSources: ['arxiv', 'crossref', 'openalex', 'semanticscholar', 'europepmc'] }, { ...defaults });
  assert.equal(five.scholarSources.length, 5);
  assert.throws(() => updateConfig({ scholarSources: ['arxiv', 'crossref', 'openalex', 'semanticscholar', 'europepmc', 'custom:none'] }, { ...defaults }));
});

test('配置：Semantic Scholar 的 Key 不回传页面，只给 has 标记', () => {
  const saved = updateConfig({ semanticScholarApiKey: 'ak_SECRET' }, { ...defaults });
  assert.equal(saved.semanticScholarApiKey, 'ak_SECRET');
  const pub = publicConfig(saved) as Record<string, unknown>;
  assert.equal(pub.semanticScholarApiKey, undefined, '明文不出插件外');
  assert.equal(pub.hasSemanticScholarApiKey, true);
  // 留空 = 沿用旧值；勾清除才清掉
  assert.equal(updateConfig({ semanticScholarApiKey: '' }, saved).semanticScholarApiKey, 'ak_SECRET');
  assert.equal(updateConfig({ clearSemanticScholarApiKey: true }, saved).semanticScholarApiKey, '');
});

test('学术检索：Key 真的传到网络层，不带 Key 时不出现这个头', async () => {
  const seen: Record<string, string>[] = [];
  const fetcher: PublicFetcher = {
    get: async (url, options) => {
      seen.push((options?.headers ?? {}) as Record<string, string>);
      return reply(url, { data: [{ title: 'A Paper', authors: [], year: 2020 }] });
    },
    dispose() {},
  };
  const base: SurfConfig = { ...defaults, scholarEnabled: true, scholarSources: ['semanticscholar'],
    semanticScholarApiKey: 'ak_RUNTIME', cacheSeconds: 0 };
  const surf = new SurfRuntime(base, fetcher, { signal: new AbortController().signal, transient: true, configValid: true });
  await surf.scholar(input);
  assert.equal(seen[0]['x-api-key'], 'ak_RUNTIME');

  seen.length = 0;
  const anon = new SurfRuntime({ ...base, semanticScholarApiKey: '' }, fetcher,
    { signal: new AbortController().signal, transient: true, configValid: true });
  await anon.scholar(input);
  assert.equal(seen[0]['x-api-key'], undefined);
});
