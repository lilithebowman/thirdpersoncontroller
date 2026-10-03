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

test('normalizeSceneManifest preserves playOnAwake on animation components', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'animated-cube',
      name: 'Animated Cube',
      transform: { position: [0, 5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'animation',
        animationPath: '/animations/primitive-cube-y-bob-animation.anim',
        animationName: 'primitive-cube-y-bob-animation',
        loop: true,
        playOnAwake: true,
        tracks: [{
          gameObjectId: 'animated-cube',
          propertyPath: 'transform.position.y',
          keyframes: [{ time: 0, value: 5 }, { time: 2.5, value: 6 }, { time: 5.5, value: 5 }],
        }],
      }],
    }],
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].playOnAwake, true);
  assert.strictEqual(normalized.gameObjects[0].components[0].loop, true);
  assert.strictEqual(normalized.objects[0].playOnAwake, true);
  assert.strictEqual(normalized.objects[0].loop, true);
  assert.strictEqual(normalized.objects[0].gameObjectId, 'animated-cube');
});

test('normalizeSceneManifest preserves sceneFloor metadata on the root manifest', () => {
  const normalized = normalizeSceneManifest({ sceneFloor: -42, gameObjects: [] });
  assert.strictEqual(normalized.sceneFloor, -42);
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

test('normalizeSceneManifest preserves sphere primitive data through legacy conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [
      {
        id: 'beachball',
        name: 'Beachball',
        transform: { position: [4, 4, -2], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          {
            type: 'primitive',
            primitiveType: 'sphere',
            radius: 0.9,
            segments: 32,
            color: '#f7f0d4'
          },
          {
            type: 'collider',
            collider: {
              type: 'sphere',
              radius: 0.9,
              offset: [0, 0, 0],
              physicsCollision: true,
              physicsMaterial: 'bouncy'
            }
          }
        ]
      }
    ]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].primitiveType, 'sphere');
  assert.strictEqual(normalized.gameObjects[0].components[0].radius, 0.9);
  assert.strictEqual(normalized.objects[0].type, 'sphere');
  assert.strictEqual(normalized.objects[0].radius, 0.9);
  assert.strictEqual(normalized.objects[0].collider.type, 'sphere');
  assert.strictEqual(normalized.objects[0].collider.physicsMaterial, 'bouncy');
});

test('normalizeSceneManifest preserves primitive materialType through legacy conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [
      {
        id: 'mirror-cube',
        name: 'Mirror Cube',
        transform: { position: [2, 1, -6], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          {
            type: 'primitive',
            primitiveType: 'cube',
            size: [1, 1, 1],
            materialType: 'Mirror'
          }
        ]
      }
    ]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].materialType, 'Mirror');
  assert.strictEqual(normalized.objects[0].materialType, 'Mirror');
});

test('normalizeSceneManifest preserves primitive material objects through legacy conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [
      {
        id: 'tile-floor',
        name: 'Tile Floor',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          {
            type: 'primitive',
            primitiveType: 'cube',
            size: [120, 0.1, 120],
            color: '#ffffff',
            material: {
              type: 'standard',
              roughness: 0.95,
              metalness: 0.2,
              albedoMap: '/models/base-white-tile-bl/base-white-tile_albedo.png',
              normalMap: '/models/base-white-tile-bl/base-white-tile_normal-ogl.png',
              repeat: [18, 18],
            }
          }
        ]
      }
    ]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.deepStrictEqual(normalized.objects[0].material, {
    type: 'standard',
    roughness: 0.95,
    metalness: 0.2,
    albedoMap: '/models/base-white-tile-bl/base-white-tile_albedo.png',
    normalMap: '/models/base-white-tile-bl/base-white-tile_normal-ogl.png',
    repeat: [18, 18],
  });
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
  assert.strictEqual(normalizedTeleport.distance, 2);

  const normalizedLink = clickable.normalizeData({
    action: 'link',
    url: '/scenes/OtherScene.json',
    distance: 5,
  });
  assert.strictEqual(normalizedLink.action, 'link');
  assert.strictEqual(normalizedLink.url, '/scenes/OtherScene.json');
  assert.strictEqual(normalizedLink.distance, 5);

  clickable.performAction(normalizedTeleport);
  clickable.performAction(normalizedLink);
});

test('normalizeSceneManifest supports configurable clickable distance with a 2m default', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [
      {
        id: 'near-portal',
        name: 'Near Portal',
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          { type: 'primitive', primitiveType: 'box', size: [1, 1, 1] },
          { type: 'clickable', action: 'teleport', target: [1, 0, 0] },
        ],
      },
      {
        id: 'far-portal',
        name: 'Far Portal',
        transform: { position: [3, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        components: [
          { type: 'primitive', primitiveType: 'box', size: [1, 1, 1] },
          { type: 'clickable', action: 'teleport', target: [2, 0, 0], distance: 7 },
        ],
      },
    ],
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  const [nearClickable, farClickable] = normalized.gameObjects.map((entry) =>
    entry.components.find((component) => component.type === 'clickable')
  );

  assert.strictEqual(nearClickable.distance, 2);
  assert.strictEqual(farClickable.distance, 7);

  const nearLegacy = normalized.objects.find((entry) => entry.name === 'Near Portal');
  const farLegacy = normalized.objects.find((entry) => entry.name === 'Far Portal');

  assert.strictEqual(nearLegacy.clickable.distance, 2);
  assert.strictEqual(farLegacy.clickable.distance, 7);
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

test('normalizeSceneManifest attaches clickable data to model entries for mixed GameObjects', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'portal-model',
      name: 'Portal Model',
      transform: { position: [0, 0.3, -22], rotation: [0, 0, 0], scale: [0.3, 0.3, 0.3] },
      components: [
        {
          type: 'model',
          modelType: 'glb',
          glbPath: '/models/SocialWorldPortal.glb',
          materialRenderType: 'cutout'
        },
        {
          type: 'clickable',
          onClick: 'teleport',
          destination: [0, 0, 0],
          hoverText: 'Click to teleport to spawn'
        }
      ],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  const modelEntries = normalized.objects.filter((entry) => entry.type === 'glb');
  const clickableEntries = normalized.objects.filter((entry) => entry.type === 'clickable');

  assert.strictEqual(modelEntries.length, 1);
  assert.strictEqual(clickableEntries.length, 0);
  assert.strictEqual(modelEntries[0].clickable.action, 'teleport');
  assert.deepStrictEqual(modelEntries[0].clickable.target, [0, 0, 0]);
  assert.strictEqual(modelEntries[0].clickable.label, 'Click to teleport to spawn');
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

test('normalizeSceneManifest supports animation components and keeps them in export output', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'anim-root',
      name: 'Hero',
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [{
        type: 'animation',
        animationPath: '/animations/hero-idle.anim',
        animationName: 'hero-idle',
        loop: true,
        speed: 1.25,
      }],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[0].type, 'animation');
  assert.strictEqual(normalized.gameObjects[0].components[0].animationPath, '/animations/hero-idle.anim');
  assert.strictEqual(normalized.objects[0].type, 'animation');
  assert.strictEqual(normalized.objects[0].animationPath, '/animations/hero-idle.anim');

  const exported = toExportManifest(sampleManifest);
  assert.strictEqual(exported.gameObjects[0].components[0].type, 'animation');
  assert.strictEqual(exported.gameObjects[0].components[0].animationPath, '/animations/hero-idle.anim');
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

test('normalizeSceneManifest preserves pickup components through GameObject conversion', () => {
  const sampleManifest = {
    version: 2,
    gameObjects: [{
      id: 'beachball',
      name: 'Beachball',
      transform: { position: [2, 0.9, -5], rotation: [0, 0, 0], scale: [1, 1, 1] },
      components: [
        { type: 'primitive', primitiveType: 'sphere', radius: 0.9, segments: 32 },
        { type: 'pickup', label: 'Pick up beachball', distance: 2.5, outlineColor: '#00f5ff' },
      ],
      children: []
    }]
  };

  const normalized = normalizeSceneManifest(sampleManifest);
  assert.strictEqual(normalized.gameObjects[0].components[1].type, 'pickup');
  assert.strictEqual(normalized.objects[0].type, 'sphere');
  assert.strictEqual(normalized.objects[0].clickable.action, 'pickup');
  assert.strictEqual(normalized.objects[0].clickable.label, 'Pick up beachball');
});

test('Clickable normalizes pickup actions and invokes the pickup callback', () => {
  const clickable = new Clickable({
    onPickup: (data) => {
      assert.strictEqual(data.action, 'pickup');
      assert.deepStrictEqual(data.target, [4, 1, 2]);
    },
  });

  const normalized = clickable.normalizeData({
    action: 'pickup',
    target: [4, 1, 2],
    distance: 5,
    label: 'Pick up beachball',
  });

  assert.strictEqual(normalized.action, 'pickup');
  assert.deepStrictEqual(normalized.target, [4, 1, 2]);
  clickable.performAction(normalized);
});
