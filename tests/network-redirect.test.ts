/*! Copyright (c) 2026 iinukami and contributors.
 * SPDX-License-Identifier: AGPL-3.0-only
 * Additional terms under AGPLv3 Section 7: see LICENSE-ADDITIONAL.
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { test } from 'node:test';
import { createPublicFetcher } from '../src/network.ts';

test('GET redirects retain credentials only within the original origin', async t => {
  for (const target of ['//other.example.org/', 'https://search.example.org:8443/', 'http://search.example.org/']) {
    await t.test(target, async () => {
      const start = 'https://search.example.org/start';
      const sameOrigin = 'https://search.example.org/next';
      const locations = ['//search.example.org/next', target, start];
      const visited: string[] = [];
      const sentHeaders: Record<string, string>[] = [];
      const fetcher = createPublicFetcher({
        lookup: async () => [{ address: '93.184.216.34', family: 4 }],
        request(url, options, callback) {
          visited.push(url.href);
          const headers = { ...options.headers } as Record<string, string>;
          sentHeaders.push(headers);
          const location = locations.shift();
          const statusCode = location ? 302 : headers.authorization === 'mock-auth' ? 200 : 401;
          const response = Object.assign(Readable.from(['ok']), {
            statusCode,
            headers: location ? { location } : {},
          });
          return Object.assign(new EventEmitter(), {
            end() { callback?.(response as IncomingMessage); },
          }) as ClientRequest;
        },
      });
      const response = await fetcher.get(start, {
        maxBytes: 1024, timeoutMs: 1000,
        headers: { Authorization: 'mock-auth', 'X-API-Key': 'mock-key', 'X-Subscription-Token': 'mock-token', Accept: 'application/json' },
      });
      assert.equal(response.status, 401);
      assert.deepEqual(visited, [start, sameOrigin, new URL(target, start).href, start]);
      assert.deepEqual(sentHeaders.map(headers => headers.authorization), ['mock-auth', 'mock-auth', undefined, undefined]);
      assert.deepEqual(sentHeaders.map(headers => headers['x-api-key']), ['mock-key', 'mock-key', undefined, undefined]);
      assert.deepEqual(sentHeaders.map(headers => headers['x-subscription-token']), ['mock-token', undefined, undefined, undefined]);
      assert.ok(sentHeaders.every(headers => headers.accept === 'application/json'));
    });
  }
});

test('a malformed redirect after a relative redirect stops before another request', async () => {
  const visited: string[] = [];
  const fetcher = createPublicFetcher({
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
    request(url, options, callback) {
      visited.push(url.href);
      assert.equal((options.headers as Record<string, string>).authorization, 'mock-auth');
      const response = Object.assign(Readable.from([]), {
        statusCode: 302,
        headers: { location: visited.length === 1 ? '../next' : 'https://[invalid/' },
      });
      return Object.assign(new EventEmitter(), {
        end() { callback?.(response as IncomingMessage); },
      }) as ClientRequest;
    },
  });
  await assert.rejects(fetcher.get('https://search.example.org/path/start', {
    maxBytes: 1024, timeoutMs: 1000, headers: { authorization: 'mock-auth' },
  }), { code: 'unsafe_url' });
  assert.deepEqual(visited, ['https://search.example.org/path/start', 'https://search.example.org/next']);
});
