/**
 * Collider.test.js
 *
 * Unit tests for BoxCollider and SphereCollider bounds and intersection logic.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { BoxCollider } from './BoxCollider.js';
import { SphereCollider } from './SphereCollider.js';

test('BoxCollider computes bounds correctly', () => {
  const box = new BoxCollider({ size: new THREE.Vector3(2, 4, 6), offset: new THREE.Vector3(0, 1, 0) });
  const target = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  const position = new THREE.Vector3(10, 0, 5);

  box.getBounds(position, target);

  assert.strictEqual(target.min.x, 9);
  assert.strictEqual(target.max.x, 11);
  assert.strictEqual(target.min.y, -1);
  assert.strictEqual(target.max.y, 3);
  assert.strictEqual(target.min.z, 2);
  assert.strictEqual(target.max.z, 8);
});

test('SphereCollider computes bounds and intersection correctly', () => {
  const sphere = new SphereCollider({ radius: 3, offset: new THREE.Vector3(0, 0, 0) });
  const target = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  const position = new THREE.Vector3(0, 0, 0);

  sphere.getBounds(position, target);
  assert.strictEqual(target.min.x, -3);
  assert.strictEqual(target.max.x, 3);

  const testBox = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 2, 2));
  assert.strictEqual(sphere.intersectsBounds(testBox, position), true);
});
