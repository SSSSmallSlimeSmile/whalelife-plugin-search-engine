import assert from 'node:assert/strict';
import { SurfRuntime } from './src/runtime.ts';
import { parseConfig, defaults } from './src/config.ts';
import { parseAnySearch } from './src/content.ts';

let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; console.log('PASS', name); }
  catch (error) { fail++; console.log('FAIL', name, '-', error.message); }
}
async function checkAsync(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); }
  catch (error) { fail++; console.log('FAIL', name, '-', error.message); }
}

const anyBody = (results) => Buffer.from(JSON.stringify({ code: 0, data: { results } }), 'utf8');

// ---- 纯解析 ----
check('解析 data.results，snippet 与 content 都认', () => {
  const items = parseAnySearch(anyBody([
    { title: 'A <b>标题</b>', url: 'https://a.example.com/x', snippet: '摘要一' },
    { title: 'B', url: 'https://b.example.com/y', content: '正文当作摘要' },
  ]), 5);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'A 标题');
  assert.equal(items[1].snippet, '正文当作摘要');
});

check('insecure / 非法链接被丢弃', () => {
  const items = parseAnySearch(anyBody([
    { title: 'bad', url: 'http://localhost/x' },
    { title: 'good', url: 'https://c.example.com/z' },
  ]), 5);
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://c.example.com/z');
});

check('完全解析不出来算失败，不当空结果', () => {
  assert.throws(() => parseAnySearch(Buffer.from('{oops', 'utf8'), 5));
  assert.throws(() => parseAnySearch(Buffer.from('{"code":0,"data":{}}', 'utf8'), 5));
});

check('业务错误码映射：额度/鉴权类算未配置', () => {
  assert.throws(() => parseAnySearch(Buffer.from(JSON.stringify({ code: 401, message: 'invalid api key' }), 'utf8'), 5),
    (e) => e.code === 'search_unconfigured');
  assert.throws(() => parseAnySearch(Buffer.from(JSON.stringify({ code: 500, message: 'upstream boom' }), 'utf8'), 5),
    (e) => e.code === 'access_blocked');
});

check('真空结果就是空数组', () => {
  assert.deepEqual(parseAnySearch(anyBody([]), 5), []);
});

// ---- 配置 ----
check('anysearch 可以进来源链，zone 白名单', () => {
  const c = parseConfig({ searchProviders: ['anysearch', 'bing'], anysearchZone: 'intl' });
  assert.deepEqual(c.searchProviders, ['anysearch', 'bing']);
  assert.equal(c.anysearchZone, 'intl');
  assert.throws(() => parseConfig({ anysearchZone: 'us' }));
  assert.throws(() => parseConfig({ searchProviders: ['anysearch', 'anysearch'] }));
});

// ---- 整链 ----
function makeRuntime(pairs, config) {
  const seen = [];
  const fetcher = {
    async get(url, options) {
      seen.push({ url, options });
      for (const [match, response] of pairs) {
        if (url.includes(match)) return typeof response === 'function' ? response(url, options) : response;
      }
      throw new Error('no stub for ' + url);
    },
    dispose() {},
  };
  const runtime = new SurfRuntime({ ...defaults, ...config }, fetcher,
    { signal: new AbortController().signal, transient: true, configValid: true });
  return { runtime, seen };
}

await checkAsync('垂直参数进请求体，zone 缺省用配置', async () => {
  const { runtime, seen } = makeRuntime([['api.anysearch.com', {
    url: 'https://api.anysearch.com/v1/search', status: 200, headers: { 'content-type': 'application/json' },
    body: anyBody([{ title: 'T', url: 'https://t.example.com/a', snippet: 'S' }]),
  }]], { searchProviders: ['anysearch'], anysearchZone: 'intl' });
  const out = await runtime.search({ query: '量子', tag: 'academic.search', language: 'zh-CN', sessionId: 's1' });
  assert.equal(out.status, 'ok');
  assert.equal(out.data.provider, 'anysearch');
  assert.equal(out.data.results.length, 1);
  const call = seen.find((x) => x.url.includes('anysearch'));
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.allowRedirects, false);
  const body = JSON.parse(call.options.body);
  assert.deepEqual(body, { query: '量子', max_results: 5, format: 'json', zone: 'intl', tag: 'academic.search', language: 'zh-CN' });
});

await checkAsync('前一源失败回退，notes 说明谁忽略了垂直参数', async () => {
  const { runtime, seen } = makeRuntime([
    ['cn.bing.com', { url: 'https://cn.bing.com/search', status: 503, headers: {}, body: Buffer.alloc(0) }],
    ['api.anysearch.com', {
      url: 'https://api.anysearch.com/v1/search', status: 200, headers: {},
      body: anyBody([{ title: 'T', url: 'https://t.example.com/a', snippet: 'S' }]),
    }],
  ], { searchProviders: ['bing', 'anysearch'] });
  const out = await runtime.search({ query: 'x', tag: 'finance.quote', sessionId: 's1' });
  assert.equal(out.status, 'ok');
  assert.equal(out.data.provider, 'anysearch');
  assert.equal(out.data.fallback.length, 1);
  assert.equal(out.data.fallback[0].provider, 'bing');
  assert.ok(out.data.notes.some((n) => n.includes('bing') && n.includes('垂直搜索')));
  assert.ok(seen.some((x) => x.url.includes('anysearch')));
});

await checkAsync('链里没有 anysearch 时，垂直参数被明确标为没生效', async () => {
  const { runtime } = makeRuntime([['html.duckduckgo.com', {
    url: 'https://html.duckduckgo.com/html/', status: 200, headers: {},
    body: Buffer.from('<html><body><div class="result"><a class="result__a" href="https://r.example.com/a">R</a><a class="result__snippet">S</a></div></body></html>', 'utf8'),
  }]], { searchProviders: ['duckduckgo'] });
  const out = await runtime.search({ query: 'x', zone: 'cn', sessionId: 's1' });
  assert.equal(out.status, 'ok');
  assert.ok(out.data.notes.some((n) => n.includes('没有 anysearch')));
});

await checkAsync('非法垂直参数直接拒绝', async () => {
  const { runtime } = makeRuntime([], { searchProviders: ['anysearch'] });
  for (const bad of [{ tag: 'has space' }, { zone: 'us' }, { language: 'zh CN' }]) {
    const out = await runtime.search({ query: 'x', sessionId: 's1', ...bad });
    assert.equal(out.status, 'error');
    assert.equal(out.error.code, 'invalid_input');
  }
});


await checkAsync('params 只随 tag 一起进请求体', async () => {
  const { runtime, seen } = makeRuntime([['api.anysearch.com', {
    url: 'https://api.anysearch.com/v1/search', status: 200, headers: {},
    body: anyBody([{ title: 'CVE', url: 'https://osv.dev/vulnerability/CVE-2024-3094', snippet: 'S' }]),
  }]], { searchProviders: ['anysearch'] });
  const out = await runtime.search({ query: 'CVE', tag: 'security.vuln', params: { type: 'cve', value: 'CVE-2024-3094' }, sessionId: 's1' });
  assert.equal(out.status, 'ok');
  const body = JSON.parse(seen.find((x) => x.url.includes('anysearch')).options.body);
  assert.deepEqual(body.params, { type: 'cve', value: 'CVE-2024-3094' });
});

await checkAsync('params 非法形状被拒', async () => {
  const { runtime } = makeRuntime([], { searchProviders: ['anysearch'] });
  for (const bad of [{}, { a: 1 }, { 'bad key': 'x' }, { a: 'x'.repeat(201) }, Object.fromEntries('abcdefghi'.split('').map((k) => [k, 'v']))]) {
    const out = await runtime.search({ query: 'x', sessionId: 's1', params: bad });
    assert.equal(out.status, 'error');
    assert.equal(out.error.code, 'invalid_input');
  }
});

await checkAsync('4xx 带出来源原话（回退链里能看出缺什么）', async () => {
  const { runtime } = makeRuntime([['api.anysearch.com', {
    url: 'https://api.anysearch.com/v1/search', status: 400, headers: {},
    body: Buffer.from(JSON.stringify({ code: -1, message: "Missing required params for tag 'security.vuln': type, value." }), 'utf8'),
  }]], { searchProviders: ['anysearch'] });
  const out = await runtime.search({ query: 'x', tag: 'security.vuln', sessionId: 's1' });
  assert.equal(out.status, 'error');
  assert.equal(out.error.code, 'search_unconfigured');
  assert.ok(out.error.message.includes('Missing required params'), out.error.message);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
