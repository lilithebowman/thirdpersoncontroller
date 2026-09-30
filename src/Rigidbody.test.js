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
import { MeshCollider } from './MeshCollider.js';

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

test('Rigidbody resolves collisions against MeshCollider walls', () => {
  const rb = new Rigidbody({ mass: 1, gravity: new THREE.Vector3(0, 0, 0), enablePhysicsCollision: true });
  const playerCollider = new BoxCollider({ size: new THREE.Vector3(1, 1, 1), offset: new THREE.Vector3(0, 0.5, 0) });
  const position = new THREE.Vector3(0, 0, 2);

  const geometry = new THREE.BoxGeometry(10, 10, 2);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh });
  const worldColliders = [{ position: new THREE.Vector3(0, 0, 0), physicsCollision: true, collider: meshCollider }];

  rb.velocity.set(0, 0, -10);
  rb.integrate(position, 0.05, { groundY: -10, collider: playerCollider, colliders: worldColliders });

  assert.ok(position.z > 0.5);
});
