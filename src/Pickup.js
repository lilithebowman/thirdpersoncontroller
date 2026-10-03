/**
 * Pickup.js
 *
 * Class: Pickup
 * Purpose: Tracks a carry state for scene objects so they can be grabbed by the player,
 *          held in front of the camera, and released with a second click.
 */

import * as THREE from 'three';

export class Pickup {
  constructor({
    target = null,
    scene = null,
    playerRoot = null,
    anchorBone = null,
    anchorOffset = new THREE.Vector3(0, 1.1, 0.7),
    dropOffset = new THREE.Vector3(1.2, 0.9, 0.8),
    onPickup = null,
    onDrop = null,
  } = {}) {
    this.target = target;
    this.scene = scene;
    this.playerRoot = playerRoot;
    this.anchorBone = anchorBone && anchorBone.isObject3D ? anchorBone : null;
    this.anchorOffset = anchorOffset.clone();
    this.dropOffset = dropOffset.clone();
    this.isPickedUp = false;
    this.onPickup = typeof onPickup === 'function' ? onPickup : null;
    this.onDrop = typeof onDrop === 'function' ? onDrop : null;
  }

  toggle(playerRoot = this.playerRoot, scene = this.scene) {
    if (!this.target) {
      return false;
    }

    if (this.isPickedUp) {
      return this.drop(playerRoot, scene);
    }

    return this.pickup(playerRoot, scene);
  }

  getHeldParent(playerRoot = this.playerRoot) {
    if (this.anchorBone && this.anchorBone.isObject3D) {
      return this.anchorBone;
    }
    return playerRoot ?? this.playerRoot ?? null;
  }

  pickup(playerRoot = this.playerRoot, scene = this.scene) {
    if (!this.target) {
      return false;
    }

    const targetPlayerRoot = playerRoot ?? this.playerRoot ?? null;
    const heldParent = this.getHeldParent(targetPlayerRoot);
    if (!heldParent) {
      return false;
    }

    this.playerRoot = targetPlayerRoot;
    this.scene = scene ?? this.scene ?? targetPlayerRoot?.parent ?? null;

    const rigidbody = this.target.userData?.rigidbody ?? null;
    if (rigidbody) {
      rigidbody.velocity.set(0, 0, 0);
      rigidbody.clearForces();
      rigidbody.useGravity = false;
    }

    if (this.target.parent) {
      this.target.parent.remove(this.target);
    }

    heldParent.add(this.target);
    this.target.position.copy(this.anchorOffset);
    this.target.rotation.set(0, 0, 0);
    this.isPickedUp = true;

    this.onPickup?.(this.target);
    return true;
  }

  drop(playerRoot = this.playerRoot, scene = this.scene) {
    if (!this.target) {
      return false;
    }

    const referenceRoot = playerRoot ?? this.playerRoot ?? null;
    const targetScene = scene ?? this.scene ?? this.target.parent ?? null;
    const worldPosition = this.target.getWorldPosition(new THREE.Vector3());
    const worldQuaternion = this.target.getWorldQuaternion(new THREE.Quaternion());

    const rigidbody = this.target.userData?.rigidbody ?? null;
    if (rigidbody) {
      rigidbody.useGravity = true;
      rigidbody.velocity.set(0, 0, 0);
      rigidbody.clearForces();
    }

    if (this.target.parent) {
      this.target.parent.remove(this.target);
    }

    if (targetScene) {
      targetScene.add(this.target);
    }

    if (referenceRoot) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(referenceRoot.getWorldQuaternion(new THREE.Quaternion()));
      const dropPosition = referenceRoot.getWorldPosition(new THREE.Vector3())
        .add(forward.clone().multiplyScalar(this.dropOffset.z))
        .add(new THREE.Vector3(this.dropOffset.x, this.dropOffset.y, 0));

      if (worldPosition.lengthSq() > 0) {
        this.target.position.copy(worldPosition);
        this.target.quaternion.copy(worldQuaternion);
      } else {
        this.target.position.copy(dropPosition);
      }
    }

    this.isPickedUp = false;

    this.onDrop?.(this.target);
    return true;
  }

  update(playerRoot = this.playerRoot, scene = this.scene) {
    if (!this.target || !this.isPickedUp) {
      return;
    }

    const targetPlayerRoot = playerRoot ?? this.playerRoot ?? null;
    const heldParent = this.getHeldParent(targetPlayerRoot);
    if (!heldParent) {
      return;
    }

    this.playerRoot = targetPlayerRoot;
    this.scene = scene ?? this.scene ?? targetPlayerRoot?.parent ?? null;

    if (this.target.parent !== heldParent) {
      if (this.target.parent) {
        this.target.parent.remove(this.target);
      }
      heldParent.add(this.target);
    }

    if (this.anchorBone && this.anchorBone.isObject3D) {
      this.target.position.copy(this.anchorOffset);
      this.target.rotation.set(0, 0, 0);
      return;
    }

    this.target.position.lerp(this.anchorOffset, 0.24);
    this.target.rotation.set(0, 0, 0);
  }
}
