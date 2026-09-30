/**
 * Rigidbody.test.js
 *
 * Unit tests for Rigidbody integration, forces, impulses, and ground checks.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { Rigidbody } from './Rigidbody.js';
import { BoxCollider } from './BoxCollider.js';

test('Rigidbody integrates velocity and gravity', () => {
  const rb = new Rigidbody({ mass: 2, gravity: new THREE.Vector3(0, -10, 0), linearDamping: 0.1 });
  const position = new THREE.Vector3(0, 10, 0);

  rb.addImpulse(new THREE.Vector3(0, 20, 0)); // upward impulse -> velocity.y = 10
  const isGrounded = rb.integrate(position, 0.5, { groundY: 0 });

  assert.strictEqual(isGrounded, false);
  assert.ok(position.y > 10); // moved up due to initial impulse before gravity
});

test('Rigidbody respects ground plane and clamping', () => {
  const rb = new Rigidbody({ mass: 1, gravity: new THREE.Vector3(0, -50, 0) });
  const position = new THREE.Vector3(0, 2, 0);

  // Integrate over enough time to drop below groundY = 0
  const isGrounded = rb.integrate(position, 0.5, { groundY: 0 });

  assert.strictEqual(isGrounded, true);
  assert.strictEqual(position.y, 0);
  assert.strictEqual(rb.velocity.y, 0);
});
