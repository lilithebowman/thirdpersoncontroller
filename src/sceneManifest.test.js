/**
 * sceneManifest.test.js
 * 
 * Unit tests for scene manifest normalization and conversion.
 */

import test from 'node:test';
import assert from 'node:assert';
import { normalizeSceneManifest, legacyItemToGameObject, gameObjectsToLegacyObjects } from './sceneManifest.js';

test('normalizeSceneManifest handles legacy objects correctly', () => {
  const sampleLegacy = {
    scene: { background: '#8ecae6', fog: '#8ecae6' },
    objects: [
      { type: 'box', name: 'TestBox', position: [1, 2, 3] }
    ]
  };

  const normalized = normalizeSceneManifest(sampleLegacy);
  assert.strictEqual(normalized.version, 2);
  assert.ok(Array.isArray(normalized.gameObjects));
  assert.strictEqual(normalized.gameObjects.length, 1);
  assert.strictEqual(normalized.gameObjects[0].name, 'TestBox');
  assert.deepStrictEqual(normalized.gameObjects[0].transform.position, [1, 2, 3]);

  const legacyRoundtrip = gameObjectsToLegacyObjects(normalized.gameObjects);
  assert.strictEqual(legacyRoundtrip.length, 1);
  assert.strictEqual(legacyRoundtrip[0].type, 'box');
});
