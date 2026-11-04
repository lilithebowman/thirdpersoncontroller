/**
 * MultiplayerService.test.js
 *
 * Unit tests for MultiplayerService.
 */

import test from 'node:test';
import assert from 'node:assert';
import { MultiplayerService } from './MultiplayerService.js';

test('MultiplayerService initializes with default options', () => {
  const service = new MultiplayerService();
  assert.strictEqual(service.apiEndpoint, '/api/players');
  assert.strictEqual(service.submitIntervalMs, 100);
  assert.strictEqual(service.pollIntervalMs, 100);
  assert.strictEqual(service.isRegistered, false);
  assert.strictEqual(service.isRunning, false);
});

test('MultiplayerService updates local transform correctly', () => {
  const service = new MultiplayerService();
  service.updateLocalTransform({
    position: { x: 10, y: 2, z: -5 },
    yaw: 1.57,
    direction: { x: 1, y: 0, z: 0 },
    animationState: 'run',
    isSpeaking: true,
  });

  assert.deepStrictEqual(service.latestLocalTransform.position, { x: 10, y: 2, z: -5 });
  assert.strictEqual(service.latestLocalTransform.yaw, 1.57);
  assert.deepStrictEqual(service.latestLocalTransform.direction, { x: 1, y: 0, z: 0 });
  assert.strictEqual(service.latestLocalTransform.animationState, 'run');
  assert.strictEqual(service.latestLocalTransform.isSpeaking, true);
});

test('MultiplayerService starts and stops loops correctly', () => {
  const service = new MultiplayerService({ submitIntervalMs: 50, pollIntervalMs: 50 });
  service.start();
  assert.strictEqual(service.isRunning, true);
  assert.ok(service._submitTimer);
  assert.ok(service._pollTimer);

  service.stop();
  assert.strictEqual(service.isRunning, false);
  assert.strictEqual(service._submitTimer, null);
  assert.strictEqual(service._pollTimer, null);
});

test('MultiplayerService deduplicates concurrent registrations', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };

  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return {
      ok: true,
      status: 201,
      json: async () => ({ success: true, guid: `guid-${requestCount}`, sessionToken: `token-${requestCount}` }),
    };
  };

  try {
    const service = new MultiplayerService();
    const [firstResult, secondResult] = await Promise.all([
      service.ensureGuid(),
      service.ensureGuid(),
    ]);

    assert.strictEqual(requestCount, 1);
    assert.strictEqual(firstResult, secondResult);
    assert.strictEqual(service.guid, 'guid-1');
    assert.strictEqual(service.sessionToken, 'token-1');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = originalStorage;
    }
  }
});
