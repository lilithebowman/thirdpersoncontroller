/**
 * sceneManifest.test.js
 * 
 * Unit tests for scene manifest normalization and conversion.
 */

import test from 'node:test';
import assert from 'node:assert';
import { normalizeSceneManifest, legacyItemToGameObject, gameObjectsToLegacyObjects, toExportManifest } from './sceneManifest.js';

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

test('normalizeSceneManifest preserves collider on primitive gameObjects correctly', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [
      {
        id: 'floor-1',
        name: 'Basic Floor',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          {
            type: 'primitive',
            primitiveType: 'cube',
            size: [120, 0.1, 120]
          },
          {
            type: 'collider',
            collider: {
              type: 'box',
              size: [120, 0.1, 120],
              offset: [0, 0.1, 0],
              physicsCollision: true
            }
          }
        ]
      }
    ]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.ok(Array.isArray(normalized.objects));
  assert.strictEqual(normalized.objects.length, 1);
  assert.strictEqual(normalized.objects[0].type, 'cube');
  assert.ok(normalized.objects[0].collider);
  assert.strictEqual(normalized.objects[0].collider.type, 'box');
  assert.deepStrictEqual(normalized.objects[0].collider.size, [120, 0.1, 120]);
});

test('normalizeSceneManifest prefers gameObjects over stale legacy objects', () => {
  const sampleManifest = {
    version: 2,
    objects: [
      { type: 'box', name: 'Old Box', position: [0, 0, 0] }
    ],
    gameObjects: [
      {
        id: 'new-cube',
        name: 'New Cube',
        transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [{ type: 'primitive', primitiveType: 'cube', size: [2, 2, 2] }]
      }
    ]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects.length, 1);
  assert.strictEqual(normalized.gameObjects[0].name, 'New Cube');
  assert.strictEqual(normalized.objects.length, 1);
  assert.strictEqual(normalized.objects[0].type, 'cube');
  assert.strictEqual(normalized.objects[0].name, 'New Cube');
});

test('toExportManifest emits GameObject-first JSON without legacy object entries', () => {
  const sampleManifest = {
    version: 2,
    objects: [{ type: 'box', name: 'Legacy Box', position: [0, 0, 0] }],
    gameObjects: [{
      id: 'export-cube',
      name: 'Export Cube',
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{ type: 'primitive', primitiveType: 'box', size: [1, 1, 1], color: '#8ecae6' }],
      children: []
    }]
  };

  const exported = toExportManifest(sampleManifest);
  assert.ok(Array.isArray(exported.gameObjects));
  assert.strictEqual(exported.gameObjects.length, 1);
  assert.strictEqual(exported.gameObjects[0].name, 'Export Cube');
  assert.strictEqual(exported.objects, undefined);
});
