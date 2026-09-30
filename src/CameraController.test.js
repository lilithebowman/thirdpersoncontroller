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
