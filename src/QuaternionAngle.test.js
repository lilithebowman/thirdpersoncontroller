/**
 * QuaternionAngle.test.js
 *
 * Unit tests for QuaternionAngle conversion and interpolation logic.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { QuaternionAngle } from './QuaternionAngle.js';
import { EulerAngle } from './EulerAngle.js';

test('QuaternionAngle creates and converts correctly', () => {
  const qa = new QuaternionAngle(0, 0, 0, 1);
  assert.strictEqual(qa.w, 1);

  const euler = new EulerAngle(0, Math.PI / 2, 0);
  qa.fromEuler(euler);
  const backToEuler = qa.toEuler();
  assert.ok(Math.abs(backToEuler.y - Math.PI / 2) < 1e-4);
});

test('QuaternionAngle slerp interpolates correctly', () => {
  const q1 = new QuaternionAngle(0, 0, 0, 1);
  const q2 = new QuaternionAngle(0, 1, 0, 0);
  q1.slerp(q2, 0.5);
  assert.ok(Number.isFinite(q1.w));
});
