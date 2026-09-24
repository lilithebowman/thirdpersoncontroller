/**
 * Collider.js
 *
 * Provides the abstract collider base used by box, sphere, and mesh collider
 * implementations.
 */

import * as THREE from 'three';

export class Collider {
  constructor({ type = 'Collider', offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    this.type = type;
    this.offset = offset.clone();
    this.physicsCollision = physicsCollision === true;
    this._tmpAABB = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  }

  getAABB(_position, _target) {
    throw new Error('Collider.getAABB must be implemented by subclasses.');
  }

  intersectsAABB(aabb, position) {
    this.getAABB(position, this._tmpAABB);

    return !(
      aabb.max.x <= this._tmpAABB.min.x ||
      aabb.min.x >= this._tmpAABB.max.x ||
      aabb.max.y <= this._tmpAABB.min.y ||
      aabb.min.y >= this._tmpAABB.max.y ||
      aabb.max.z <= this._tmpAABB.min.z ||
      aabb.min.z >= this._tmpAABB.max.z
    );
  }
}