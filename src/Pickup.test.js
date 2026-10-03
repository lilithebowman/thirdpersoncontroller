/**
 * Pickup.test.js
 *
 * Unit tests for the carry / drop interaction used by pickupable objects.
 */

import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import { Pickup } from './Pickup.js';

test('Pickup toggles an object between the player root and the scene', () => {
  const scene = new THREE.Scene();
  const playerRoot = new THREE.Group();
  playerRoot.position.set(0, 0, 0);
  scene.add(playerRoot);

  const target = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffee88 })
  );
  target.position.set(2, 1, -3);
  scene.add(target);

  const pickup = new Pickup({
    target,
    scene,
    playerRoot,
    anchorOffset: new THREE.Vector3(0, 1.1, 0.7),
    dropOffset: new THREE.Vector3(1.4, 0.9, 0.8),
  });

  assert.strictEqual(pickup.pickup(playerRoot, scene), true);
  assert.strictEqual(pickup.isPickedUp, true);
  assert.strictEqual(target.parent, playerRoot);
  assert.ok(target.position.distanceTo(new THREE.Vector3(0, 1.1, 0.7)) < 0.001);

  assert.strictEqual(pickup.drop(playerRoot, scene), true);
  assert.strictEqual(pickup.isPickedUp, false);
  assert.strictEqual(target.parent, scene);
  assert.ok(target.position.length() > 0);
});

test('Pickup attaches to the player right hand bone and preserves world position when dropped', () => {
  const scene = new THREE.Scene();
  const playerRoot = new THREE.Group();
  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  playerRoot.add(rightHand);
  scene.add(playerRoot);

  const target = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0x88eeff })
  );
  target.position.set(5, 2, 1);
  scene.add(target);

  const pickup = new Pickup({
    target,
    scene,
    playerRoot,
    anchorBone: rightHand,
    anchorOffset: new THREE.Vector3(0.15, 0, 0.1),
    dropOffset: new THREE.Vector3(1.2, 0.9, 0.8),
  });

  assert.strictEqual(pickup.pickup(playerRoot, scene), true);
  assert.strictEqual(target.parent, rightHand);
  assert.ok(target.position.distanceTo(new THREE.Vector3(0.15, 0, 0.1)) < 0.0001);

  const worldBeforeDrop = target.getWorldPosition(new THREE.Vector3());
  assert.strictEqual(pickup.drop(playerRoot, scene), true);
  assert.strictEqual(target.parent, scene);
  assert.ok(target.position.distanceTo(worldBeforeDrop) < 0.0001);
});
