/**
 * sceneManifest.test.js
 * 
 * Unit tests for scene manifest normalization and conversion.
 */

import test from 'node:test';
import assert from 'node:assert';
import { Clickable } from './Clickable.js';
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

test('normalizeSceneManifest preserves GLB models through legacy conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'portal',
      name: 'Portal',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'model',
        modelType: 'glb',
        glbPath: '/models/SocialWorldPortal.glb',
        materialRenderType: 'cutout'
      }],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].modelType, 'glb');
  assert.strictEqual(normalized.objects.length, 1);
  assert.strictEqual(normalized.objects[0].type, 'glb');
  assert.strictEqual(normalized.objects[0].glbPath, '/models/SocialWorldPortal.glb');
});

test('normalizeSceneManifest accepts legacy GLB items and converts them to GameObjects', () => {
  const sampleLegacy = {
    version: 2,
    objects: [{
      type: 'glb',
      name: 'Legacy Portal',
      glbPath: '/models/SocialWorldPortal.glb',
      position: [2, 0, 1],
      rotation: [0, 90, 0],
      scale: [1, 1, 1]
    }]
  };

  const normalized = normalizeSceneManifest(sampleLegacy);
  assert.strictEqual(normalized.gameObjects.length, 1);
  assert.strictEqual(normalized.gameObjects[0].components[0].modelType, 'glb');
  assert.strictEqual(normalized.gameObjects[0].components[0].glbPath, '/models/SocialWorldPortal.glb');
});

test('normalizeSceneManifest preserves FBX models through legacy conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'character',
      name: 'Character Rig',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'model',
        modelType: 'fbx',
        fbxPath: '/animations/Action%20Adventure%20Pack/X%20Bot.fbx',
        materialRenderType: 'cutout'
      }],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].modelType, 'fbx');
  assert.strictEqual(normalized.objects.length, 1);
  assert.strictEqual(normalized.objects[0].type, 'fbx');
  assert.strictEqual(normalized.objects[0].fbxPath, '/animations/Action%20Adventure%20Pack/X%20Bot.fbx');
});

test('normalizeSceneManifest accepts legacy FBX items and converts them to GameObjects', () => {
  const sampleLegacy = {
    version: 2,
    objects: [{
      type: 'fbx',
      name: 'Legacy Character',
      fbxPath: '/animations/Action%20Adventure%20Pack/X%20Bot.fbx',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }]
  };

  const normalized = normalizeSceneManifest(sampleLegacy);
  assert.strictEqual(normalized.gameObjects.length, 1);
  assert.strictEqual(normalized.gameObjects[0].components[0].modelType, 'fbx');
  assert.strictEqual(normalized.gameObjects[0].components[0].fbxPath, '/animations/Action%20Adventure%20Pack/X%20Bot.fbx');
});

test('Clickable normalizes teleport and link actions for scene objects', () => {
  const clickable = new Clickable({
    onTeleport: (destination) => {
      assert.deepStrictEqual(destination.toArray(), [12, 3, -8]);
    },
  });

  const normalizedTeleport = clickable.normalizeData({
    action: 'teleport',
    target: [12, 3, -8],
    outlineColor: '#00f5ff',
  });
  assert.strictEqual(normalizedTeleport.action, 'teleport');
  assert.deepStrictEqual(normalizedTeleport.target, [12, 3, -8]);

  const normalizedLink = clickable.normalizeData({
    action: 'link',
    url: '/scenes/OtherScene.json',
  });
  assert.strictEqual(normalizedLink.action, 'link');
  assert.strictEqual(normalizedLink.url, '/scenes/OtherScene.json');

  clickable.performAction(normalizedTeleport);
  clickable.performAction(normalizedLink);
});

test('normalizeSceneManifest supports legacy clickable aliases like onClick and destination', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'portal-trigger',
      name: 'Portal Trigger',
      transform: { position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'clickable',
        onClick: 'teleport',
        destination: [9, 2, -4],
        hoverText: 'Teleport to the plaza',
        outlineColor: '#00f5ff'
      }],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].type, 'clickable');
  assert.strictEqual(normalized.gameObjects[0].components[0].action, 'teleport');
  assert.deepStrictEqual(normalized.gameObjects[0].components[0].target, [9, 2, -4]);
  assert.strictEqual(normalized.objects[0].action, 'teleport');
  assert.deepStrictEqual(normalized.objects[0].target, [9, 2, -4]);
});

test('normalizeSceneManifest preserves Clickable actions through GameObject conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'portal-trigger',
      name: 'Portal Trigger',
      transform: { position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'clickable',
        action: 'teleport',
        target: [12, 3, -8],
        label: 'Teleport to the plaza',
        outlineColor: '#00f5ff'
      }],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].type, 'clickable');
  assert.strictEqual(normalized.gameObjects[0].components[0].action, 'teleport');
  assert.deepStrictEqual(normalized.gameObjects[0].components[0].target, [12, 3, -8]);
  assert.strictEqual(normalized.objects.length, 1);
  assert.strictEqual(normalized.objects[0].type, 'clickable');
  assert.strictEqual(normalized.objects[0].action, 'teleport');
});

test('normalizeSceneManifest accepts legacy clickable items and converts them to GameObjects', () => {
  const sampleLegacy = {
    version: 2,
    objects: [{
      type: 'clickable',
      name: 'Legacy Link',
      action: 'link',
      url: '/scenes/OtherScene.json',
      position: [3, 0, 6],
      rotation: [0, 0, 0],
      scale: [1, 1, 1]
    }]
  };

  const normalized = normalizeSceneManifest(sampleLegacy);
  assert.strictEqual(normalized.gameObjects.length, 1);
  assert.strictEqual(normalized.gameObjects[0].components[0].type, 'clickable');
  assert.strictEqual(normalized.gameObjects[0].components[0].action, 'link');
  assert.strictEqual(normalized.gameObjects[0].components[0].url, '/scenes/OtherScene.json');
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
