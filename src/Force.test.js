/**
 * Force.test.js
 *
 * Unit tests for Force helper impulse application.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { Force } from './Force.js';
import { Rigidbody } from './Rigidbody.js';

test('Force applies vector and array impulses correctly', () => {
  const rb = new Rigidbody({ mass: 2 });
  Force.Impulse(rb, new THREE.Vector3(4, 6, 8));
  assert.strictEqual(rb.velocity.x, 2);
  assert.strictEqual(rb.velocity.y, 3);
  assert.strictEqual(rb.velocity.z, 4);

  Force.Impulse(rb, [2, 4, 6]);
  assert.strictEqual(rb.velocity.x, 3);
  assert.strictEqual(rb.velocity.y, 5);
  assert.strictEqual(rb.velocity.z, 7);
});
