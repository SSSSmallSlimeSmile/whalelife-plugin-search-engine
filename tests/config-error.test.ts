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
import { applyWithDependencies } from '../src/index.ts';
import { settingsPage } from '../src/page.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfService } from '../src/types.ts';

function code(fn: () => unknown): string {
  try { fn(); } catch (error) { return (error as { message?: string }).message ?? ''; }
  assert.fail('本该抛错');
}

const fetcher: PublicFetcher = { async get() { throw new Error('这条测试不该打网络'); }, dispose() {} };

test('读盘配置坏在哪一项：说出字段名，不是只有「配置无效」', () => {
  // 真正的来路：页面填了 14 位令牌，整份配置校验失败，运行时回退到默认值。
  const token = 'abc123abc123ab';
  const message = code(() => parseConfig({ ...defaults, apiToken: token }));
  assert.match(message, /字段「apiToken」/);
  assert.ok(!message.includes(token));
  assert.match(code(() => parseConfig({ ...defaults, sourceFailThreshold: 99 })), /字段「sourceFailThreshold」/);
  assert.match(code(() => parseConfig({ ...defaults, searchProviders: ['bing'] })), /字段「searchProviders」/);
});

test('未知字段在解析、状态和未鉴权的 403 中都不回显键名或值', async () => {
  const key = '<sample>C:\\private\\config.json</sample>';
  const value = 'private-value-fixture';
  const message = code(() => parseConfig({ [key]: value }));
  assert.match(message, /未知字段/);
  assert.ok(!message.includes(key));
  assert.ok(!message.includes(value));
  const { call } = await setup(() => ({ [key]: value }));
  const status = await call(configPath);
  const forbidden = await call(apiPath, {});
  assert.equal(status.status, 200);
  assert.equal(forbidden.status, 403);
  assert.match(status.body.status.configError, /未知字段/);
  assert.ok(!status.body.status.configError.includes(key));
  assert.ok(!status.body.status.configError.includes(value));
  const forbiddenDetail = forbidden.body.error.message;
  assert.ok(!forbiddenDetail.includes(key));
  assert.ok(!forbiddenDetail.includes(value));
  assert.ok(!forbiddenDetail.includes('未知字段'), '未鉴权的 403 不该带配置细节');
});

test('合法的配置不会被这套报错挂上', () => {
  const good = parseConfig({ ...defaults, apiToken: 'abcdef0123456789' });
  assert.equal(good.apiToken, 'abcdef0123456789');
  assert.equal(parseConfig({ ...defaults }).apiToken, '');
});

test('运行时把读盘失败的原因带在 status 里，保存一次合格配置就清掉', () => {
  const bad = new SurfRuntime({ ...defaults }, fetcher, {
    signal: new AbortController().signal, transient: true, configValid: false,
    configError: '配置无效。 字段「apiToken」的值不合法。',
  });
  assert.equal(bad.status().configValid, false);
  assert.match(String(bad.status().configError), /apiToken/);
  bad.setConfig({ ...defaults, apiToken: 'abcdef0123456789' });
  assert.equal(bad.status().configValid, true);
  assert.equal(bad.status().configError, undefined, '存盘成功后不该还挂着旧原因');

  const fine = new SurfRuntime({ ...defaults }, fetcher, { signal: new AbortController().signal, transient: true, configValid: true });
  assert.equal('configError' in fine.status(), false, '一切正常时不多这个键');
});

async function setup(read: () => unknown, save: (value: unknown) => void = () => assert.fail('unexpected save')) {
  let service: SurfService | undefined;
  const routes = new Map<string, PluginHandler>();
  const ctx = {
    signal: new AbortController().signal, effect() {},
    provide(_name: string, value: SurfService) { service = value; },
    config: { read, async save(file: string, value: unknown) { assert.equal(file, 'config.json'); save(value); } },
    tools: { register() { return () => {}; }, registerTransient() { return () => {}; } },
    web: { page(path: string, fn: PluginHandler) { routes.set(path, fn); }, api(path: string, fn: PluginHandler) { routes.set(path, fn); } },
  };
  await applyWithDependencies(ctx as unknown as Context, { fetcher });
  assert.ok(service);

  async function call(path: string, payload?: unknown) {
    const handler = routes.get(path);
    assert.ok(handler, '路由没注册：' + path);
    const req = Object.assign(Readable.from(payload === undefined ? [] : [JSON.stringify(payload)]), {
      method: payload === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json' },
    });
    let body: Record<string, any> | undefined;
    const res = { statusCode: 200, setHeader() {}, end(value: string) { body = JSON.parse(value); } };
    await handler(req as never, res as never, { signal: ctx.signal } as never);
    return { status: res.statusCode, body: body as Record<string, any> };
  }
  return { call, service };
}

const configPath = '/plugins/search-engine/config';
const apiPath = '/plugins/search-engine/api';

test('坏配置、保存失败、保存成功和后续 GET 使用同一份状态', async () => {
  const token = 'abc123abc123ab';
  const initial = { ...defaults, apiToken: token };
  let saved: unknown;
  let failSave = true;
  const { call, service } = await setup(() => initial, value => {
    if (failSave) throw new Error('C:\\private\\config.json');
    saved = value;
  });
  const config = await call(configPath);
  assert.equal(config.status, 200);
  assert.match(String(config.body.status.configError), /apiToken/);
  assert.ok(!JSON.stringify(config.body).includes(token));
  assert.equal(service.status().ready, false);

  const api = await call(apiPath, { tool: 'status' });
  assert.equal(api.status, 403);
  assert.equal(api.body.error.code, 'api_disabled');
  // 页面（已登录）看得到具体字段；未鉴权的调用方只拿默认文案。
  assert.equal(api.body.error.message, '对外接口没开：先在设置页填一个令牌。');
  assert.ok(!api.body.error.message.includes('apiToken'), '未鉴权的 403 不该带配置细节');
  assert.ok(!JSON.stringify(api.body).includes(token));

  const fixed = { ...defaults, apiToken: 'abcdef0123456789' };
  const request = { revision: config.body.revision, config: fixed };
  const failed = await call(configPath, request);
  assert.equal(failed.status, 400);
  assert.ok(!JSON.stringify(failed.body).includes('private'));
  assert.deepEqual((await call(configPath)).body, config.body);
  failSave = false;
  const saved2 = await call(configPath, request);
  assert.equal(saved2.status, 200);
  assert.equal(saved2.body.status.configError, undefined);
  assert.deepEqual(saved, fixed);
  const refreshed = await call(configPath);
  assert.equal(refreshed.body.status.configError, undefined);
  assert.equal(refreshed.body.status.ready, true);

  const after = await call(apiPath, { tool: 'status' });
  assert.equal(after.status, 401, '配置好了，没带令牌就是普通 401，不再说是配置问题');
});

test('设置保存非法值、只读字段或未知字段返回 400，且不回显输入', async () => {
  const { call } = await setup(() => ({}));
  const initial = await call(configPath);
  const secret = 'secret value fixture';
  for (const config of [
    { apiToken: secret }, { hasApiToken: secret }, { customSources: [{ hasKey: secret }] },
    { '<sample>private-field</sample>': secret },
    { customSources: [{ name: 'test', url: 'https://example.test/?q={query}', items: 'items', title: 'title', link: 'url', key: secret }] },
  ]) {
    const result = await call(configPath, { revision: initial.body.revision, config });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, 'config_invalid');
    assert.ok(!JSON.stringify(result.body).includes(secret));
    assert.ok(!JSON.stringify(result.body).includes('private-field'));
  }
  assert.deepEqual((await call(configPath)).body, initial.body);
});

test('区分宿主返回空对象、返回非法根值和读取抛错，不回显读取异常', async () => {
  const empty = await setup(() => ({}));
  const invalid = await setup(() => null);
  const failed = await setup(() => { throw new Error('private-file-fixture'); });
  assert.equal(empty.service.status().configValid, true);
  assert.equal(empty.service.status().configError, undefined);
  assert.equal((await empty.call(apiPath, {})).status, 403);
  assert.match(invalid.service.status().configError ?? '', /配置无效/);
  assert.match(failed.service.status().configError ?? '', /无法读取插件配置/);
  const result = await failed.call(apiPath, {});
  assert.equal(result.status, 403);
  assert.equal(result.body.error.message, '对外接口没开：先在设置页填一个令牌。');
  assert.ok(!result.body.error.message.includes('无法读取插件配置'), '未鉴权的 403 不该带配置细节');
  assert.ok(!JSON.stringify(result.body).includes('private-file-fixture'));
});

test('设置横幅按纯文本显示，收到正常状态后隐藏并清空', () => {
  const script = settingsPage.match(/\nfunction show\(data\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(script);
  const elements = new Map<string, { hidden?: boolean; textContent?: string }>();
  const sandbox = {
    byId(id: string) {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    },
    renderKindCustoms() {}, renderChain() {}, restoreSourceOrder() {}, syncSrcCards() {},
  };
  const show = runInNewContext(script + '\nshow', sandbox);
  const message = '<sample>warning</sample>';
  show({ config: defaults, status: { configError: message } });
  const banner = elements.get('cfgWarn');
  assert.equal(banner?.hidden, false);
  assert.ok(banner?.textContent?.includes(message));
  show({ config: defaults, status: {} });
  assert.equal(banner?.hidden, true);
  assert.equal(banner?.textContent, '');
});
