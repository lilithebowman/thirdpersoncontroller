/**
 * CameraController.test.js
 *
 * Unit tests for CameraController view state, distance clamping, and first-person checks.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { CameraController } from './CameraController.js';

test('CameraController initializes and detects first person view', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new CameraController({ camera });

  assert.strictEqual(controller.isFirstPerson(), false);
  controller.state.distance = 0.3;
  assert.strictEqual(controller.isFirstPerson(), true);
});

test('CameraController uses eyePosition as camera position in first person mode', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new CameraController({ camera, eyePosition: new THREE.Vector3(0, 1.8, 0) });

  controller.state.distance = 0.3; // first person mode
  const player = new THREE.Group();
  player.position.set(10, 0, 20);
  player.updateMatrixWorld(true);

  controller.update(player);

  assert.strictEqual(camera.position.x, 10);
  assert.strictEqual(camera.position.y, 1.8);
  assert.strictEqual(camera.position.z, 20);
});

test('CameraController adjusts near plane ahead of player model bounding box in first person mode', () => {
  const camera = new THREE.PerspectiveCamera();
  const controller = new CameraController({ camera, eyePosition: new THREE.Vector3(0, 1.6, 0) });

  controller.state.distance = 0.3; // first person mode
  const player = new THREE.Group();
  player.position.set(0, 0, 0);

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 1, 0);
  player.add(mesh);
  player.updateMatrixWorld(true);

  controller.update(player);

  assert.ok(camera.near > 0.02);
});
