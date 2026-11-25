/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import type { Context, PluginHandler } from 'whalelife';
import { defaults, parseConfig } from '../src/config.ts';
import { applyWithDependencies } from '../src/index.ts';
import { SurfRuntime } from '../src/runtime.ts';
import type { PublicFetcher, SurfConfig, SurfService } from '../src/types.ts';

function code(fn: () => unknown): string {
  try { fn(); } catch (error) { return (error as { message?: string }).message ?? ''; }
  assert.fail('本该抛错');
}

const fetcher: PublicFetcher = { async get() { throw new Error('这条测试不该打网络'); }, dispose() {} };

test('读盘配置坏在哪一项：说出字段名，不是只有「配置无效」', () => {
  // 真正的来路：页面填了 14 位令牌，整份配置校验失败，运行时回退到默认值。
  assert.match(code(() => parseConfig({ ...defaults, apiToken: 'abc123abc123ab' })), /字段「apiToken」/);
  assert.match(code(() => parseConfig({ ...defaults, sourceFailThreshold: 99 })), /字段「sourceFailThreshold」/);
  assert.match(code(() => parseConfig({ ...defaults, searchProviders: ['bing'] })), /字段「searchProviders」/);
});

test('未知字段说出是哪一个', () => {
  assert.match(code(() => parseConfig({ ...defaults, apitoken: 'x' })), /未知字段「apitoken」/);
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

test('端到端：坏配置时页面拿到原因，对外接口明说是配置回退导致令牌为空', async () => {
  let saved: Record<string, unknown> = { ...defaults, apiToken: 'abc123abc123ab' };
  let service: SurfService | undefined;
  const routes = new Map<string, PluginHandler>();
  const ctx = {
    signal: new AbortController().signal, effect() {},
    provide(_name: string, value: SurfService) { service = value; },
    config: { read: () => saved, save(_name: string, value: unknown) { saved = value as Record<string, unknown>; } },
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

  const config = await call('/plugins/search-engine/config');
  assert.equal(config.status, 200);
  assert.match(String(config.body.status.configError), /apiToken/);
  assert.equal(service.status().ready, false);

  const api = await call('/plugins/search-engine/api', { tool: 'status' });
  assert.equal(api.status, 403);
  assert.equal(api.body.error.code, 'api_disabled');
  assert.match(api.body.error.message, /apiToken/, '得说明白为什么令牌是空的，不能只说没填');

  const fixed = { ...defaults, apiToken: 'abcdef0123456789' };
  const saved2 = await call('/plugins/search-engine/config', { revision: config.body.revision, config: fixed });
  assert.equal(saved2.status, 200);
  assert.equal(saved2.body.status.configError, undefined);

  const after = await call('/plugins/search-engine/api', { tool: 'status' });
  assert.equal(after.status, 401, '配置好了，没带令牌就是普通 401，不再说是配置问题');
});

const configBase: SurfConfig = { ...defaults };
void configBase;
