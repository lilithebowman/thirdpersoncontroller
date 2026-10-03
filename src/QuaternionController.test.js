/**
 * QuaternionController.test.js
 *
 * Unit tests for QuaternionController yaw tracking and updates.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { QuaternionController } from './QuaternionController.js';

test('QuaternionController tracks and updates yaw correctly', () => {
  const controller = new QuaternionController({ yaw: 0 });
  assert.strictEqual(controller.yaw, 0);

  controller.rotateBy(Math.PI / 2);
  controller.update(0.1);
  assert.ok(controller.yaw > 0);

  const group = new THREE.Group();
  controller.applyTo(group);
  assert.ok(group.quaternion instanceof THREE.Quaternion);
});

test('QuaternionController chooses the shortest yaw path across the 0/360 boundary', () => {
  const controller = new QuaternionController({ yaw: 0 });
  controller.targetYaw = Math.PI * 2 - 0.05;
  controller.update(1);

  assert.ok(Math.abs(controller.yaw) < 0.1);
});
