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
import { Time } from './Time.js';

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

test('Force calculates a collision impulse from mass and relative collision velocity', () => {
  const a = new Rigidbody({ mass: 2, restitution: 0.85 });
  const b = new Rigidbody({ mass: 4, restitution: 0.65 });
  a.velocity.set(1, 0, 0);
  b.velocity.set(-2, 0, 0);

  const impulse = Force.calculateCollisionImpulse({
    bodyA: a,
    bodyB: b,
    normal: new THREE.Vector3(1, 0, 0),
    relativeVelocity: b.velocity.clone().sub(a.velocity),
    restitution: 0.85,
  });

  assert.ok(impulse.x > 0);
  assert.ok(Number.isFinite(impulse.x));
  assert.ok(impulse.x < 10);
});

test('Force scales impulse application by Time.deltaTime', () => {
  const rb = new Rigidbody({ mass: 2 });
  const dt = new Time({ deltaTime: 0.5 });

  Force.Impulse(rb, new THREE.Vector3(10, 0, 0), dt);

  assert.ok(Math.abs(rb.velocity.x - 2.5) < 1e-6);
});
