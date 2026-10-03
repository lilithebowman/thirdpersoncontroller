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

test('Rigidbody applies the configured physics material restitution', () => {
  const rb = new Rigidbody({ physicsMaterial: 'bouncy' });
  assert.ok(rb.physicsMaterial === 'bouncy');
  assert.ok(rb.restitution >= 0.8);
});

test('Rigidbody supports numeric gravity and kinetic collision force registration', () => {
  const rb = new Rigidbody({ gravity: -9.8, kinetic: true, mass: 2 });
  assert.strictEqual(rb.gravity, -9.8);
  assert.strictEqual(rb.kinetic, true);
  assert.ok(rb.getGravityVector().y < 0);

  const point = new THREE.Vector3(1, 0, 0);
  const impulse = new THREE.Vector3(10, 0, 0);
  rb.registerCollisionPoint(point, impulse);
  assert.strictEqual(rb.collisionPoints.length, 1);
  assert.ok(rb.velocity.x > 0);
});

test('Rigidbody disables gravity when gravity is explicitly zero and still moves with kinetic forces', () => {
  const rb = new Rigidbody({ gravity: new THREE.Vector3(0, 0, 0), kinetic: true, mass: 2 });
  const position = new THREE.Vector3(0, 0, 0);

  assert.strictEqual(rb.useGravity, false);

  rb.addForce(new THREE.Vector3(12, 0, 0));
  rb.integrate(position, 0.5, { groundY: -Infinity });

  assert.ok(position.x > 0);
  assert.ok(rb.velocity.x > 0);
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

test('Rigidbody marks the player grounded when resting on a box floor', () => {
  const rb = new Rigidbody({ gravity: new THREE.Vector3(0, -20, 0) });
  const playerCollider = new BoxCollider({ size: new THREE.Vector3(1, 1, 1), offset: new THREE.Vector3(0, 0.5, 0) });
  const floor = new BoxCollider({ size: new THREE.Vector3(10, 0.2, 10), offset: new THREE.Vector3(0, 0, 0) });
  const colliders = [{ position: new THREE.Vector3(0, 0, 0), physicsCollision: true, collider: floor }];
  const position = new THREE.Vector3(0, 0.1, 0);

  rb.velocity.set(0, 0, 0);

  assert.strictEqual(rb.isGroundedAgainstWorld(position, position.clone(), playerCollider, colliders), true);
});

test('Rigidbody marks the player grounded when resting on a mesh surface', () => {
  const rb = new Rigidbody({ gravity: new THREE.Vector3(0, -20, 0) });
  const playerCollider = new BoxCollider({ size: new THREE.Vector3(1, 1, 1), offset: new THREE.Vector3(0, 0.5, 0) });
  const geometry = new THREE.BoxGeometry(10, 0.2, 10);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const colliders = [{ position: new THREE.Vector3(0, 0, 0), physicsCollision: true, collider: new MeshCollider({ mesh }) }];
  const position = new THREE.Vector3(0, 0.1, 0);

  rb.velocity.set(0, 0, 0);

  assert.strictEqual(rb.isGroundedAgainstWorld(position, position.clone(), playerCollider, colliders), true);
});

test('Rigidbody does not snap back to the ground while the player is jumping upward', () => {
  const rb = new Rigidbody({ gravity: new THREE.Vector3(0, -20, 0) });
  const playerCollider = new BoxCollider({ size: new THREE.Vector3(1, 1, 1), offset: new THREE.Vector3(0, 0.5, 0) });
  const floor = new BoxCollider({ size: new THREE.Vector3(10, 0.2, 10), offset: new THREE.Vector3(0, 0, 0) });
  const colliders = [{ position: new THREE.Vector3(0, 0, 0), physicsCollision: true, collider: floor }];
  const position = new THREE.Vector3(0, 0.1, 0);

  rb.velocity.set(0, 8.8, 0);
  const isGrounded = rb.integrate(position, 0.016, { collider: playerCollider, colliders });

  assert.strictEqual(isGrounded, false);
  assert.ok(rb.velocity.y > 0);
  assert.ok(position.y > 0.1);
});
