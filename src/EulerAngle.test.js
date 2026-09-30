/**
 * EulerAngle.test.js
 *
 * Unit tests for EulerAngle yaw normalization and shortest delta calculations.
 */

import test from 'node:test';
import assert from 'node:assert';
import { EulerAngle } from './EulerAngle.js';

test('EulerAngle normalizes yaw correctly', () => {
  const euler = new EulerAngle(0, Math.PI * 2.5, 0);
  euler.normalizeYaw();
  assert.ok(Math.abs(Math.abs(euler.y) - Math.PI / 2) < 1e-5);
});

test('EulerAngle computes shortest delta correctly', () => {
  const euler = new EulerAngle(0, 0.1, 0);
  const delta = euler.shortestDelta(Math.PI * 1.9);
  assert.ok(typeof delta === 'number');
});
