/**
 * Skybox.test.js
 *
 * Unit tests for Skybox background application, mesh creation, and error handling.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { Skybox } from './Skybox.js';

test('Skybox throws error when initialized without scene', () => {
  assert.throws(() => {
    new Skybox({});
  }, /Skybox requires a THREE.Scene/);
});

test('Skybox applies solid color background correctly', async () => {
  const scene = new THREE.Scene();
  const skybox = new Skybox({ scene });

  await skybox.apply({ type: 'color', color: '#ff0000' });
  assert.strictEqual(scene.background.getHexString(), 'ff0000');
});

test('Skybox creates skybox mesh with BackSide material correctly', () => {
  const scene = new THREE.Scene();
  const skybox = new Skybox({ scene });

  const mesh = skybox.createSkyboxMesh({ size: 500, color: '#123456' });
  assert.ok(mesh instanceof THREE.Mesh);
  assert.strictEqual(scene.children.includes(mesh), true);
  assert.strictEqual(mesh.material.side, THREE.BackSide);
  assert.strictEqual(mesh.geometry.parameters.width, 500);
});

test('Skybox handles missing or empty config gracefully', async () => {
  const scene = new THREE.Scene();
  const skybox = new Skybox({ scene });

  await skybox.apply(null);
  await skybox.apply({});
  assert.ok(true); // Should not throw
});

test('Skybox handles texture config gracefully', async () => {
  const scene = new THREE.Scene();
  const skybox = new Skybox({ scene, resolveScenePath: (p) => p });

  await skybox.apply({ type: 'texture', texture: 'models/2026-CozyCon-Cafe/PlanetaryEarth4k.hdr' });
  assert.ok(true);
});
