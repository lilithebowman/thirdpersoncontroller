/**
 * MeshCollider.test.js
 *
 * Unit tests for MeshCollider bounds calculation, triangle intersection testing, and ground height raycasting.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { MeshCollider } from './MeshCollider.js';

test('MeshCollider computes bounds correctly from multi-mesh geometry', () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(5, 5, 5);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh, offset: new THREE.Vector3(0, 1, 0) });
  const target = { min: new THREE.Vector3(), max: new THREE.Vector3() };

  meshCollider.getBounds(new THREE.Vector3(5, 5, 5), target);

  assert.strictEqual(target.min.x, 4);
  assert.strictEqual(target.max.x, 6);
  assert.strictEqual(target.min.y, 5); // 4 + 1 offset
  assert.strictEqual(target.max.y, 7); // 6 + 1 offset
  assert.strictEqual(target.min.z, 4);
  assert.strictEqual(target.max.z, 6);
});

test('MeshCollider tests triangle intersection correctly against dynamic AABB', () => {
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh });

  // Box intersecting the mesh
  const intersectingBox = new THREE.Box3(new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Vector3(2, 2, 2));
  assert.strictEqual(meshCollider.intersectsBounds(intersectingBox, new THREE.Vector3(0, 0, 0)), true);

  // Box not intersecting the mesh
  const nonIntersectingBox = new THREE.Box3(new THREE.Vector3(5, 5, 5), new THREE.Vector3(6, 6, 6));
  assert.strictEqual(meshCollider.intersectsBounds(nonIntersectingBox, new THREE.Vector3(0, 0, 0)), false);
});

test('MeshCollider samples ground height correctly using raycasting', () => {
  const geometry = new THREE.PlaneGeometry(10, 10);
  geometry.rotateX(-Math.PI / 2); // Horizontal plane at Y = 0
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh });

  const playerPosition = new THREE.Vector3(0, 10, 0);
  const groundY = meshCollider.getGroundHeightAt(playerPosition, new THREE.Vector3(0, 0, 0));

  assert.strictEqual(groundY !== null, true);
  assert.strictEqual(Math.abs(groundY - 0) < 0.001, true);
});

test('MeshCollider rejects ground height on surfaces steeper than maxWalkableSlope', () => {
  const geometry = new THREE.PlaneGeometry(10, 10);
  geometry.rotateX(-Math.PI / 4); // 45 degree incline (slope = 1.0 > 0.2)
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh, maxWalkableSlope: 0.2 });

  const playerPosition = new THREE.Vector3(0, 5, 0);
  const groundY = meshCollider.getGroundHeightAt(playerPosition, new THREE.Vector3(0, 0, 0), 0.2);

  assert.strictEqual(groundY, null);
});

test('MeshCollider ignores walkable flat ground triangles in intersectsBounds so player does not get stuck', () => {
  const geometry = new THREE.PlaneGeometry(10, 10);
  geometry.rotateX(-Math.PI / 2); // Horizontal plane at Y = 0
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  mesh.updateMatrixWorld(true);

  const meshCollider = new MeshCollider({ mesh, maxWalkableSlope: 0.2 });

  // Box resting on/intersecting the flat floor
  const floorBox = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 1, 1));
  const intersects = meshCollider.intersectsBounds(floorBox, new THREE.Vector3(0, 0, 0), 0.2);

  assert.strictEqual(intersects, false);
});
