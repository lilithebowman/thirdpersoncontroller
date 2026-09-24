/**
 * BoxCollider.js
 * 
 * Defines a box-shaped collider for use in a physics or collision detection system.
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class BoxCollider extends Collider {
  constructor({ size = new THREE.Vector3(1, 1, 1), offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    super({ type: 'BoxCollider', offset, physicsCollision });
    this.size = size.clone();
    this.halfSize = this.size.clone().multiplyScalar(0.5);
  }

  setSize(size) {
    this.size.copy(size);
    this.halfSize.copy(size).multiplyScalar(0.5);
  }

  getAABB(position, target) {
    const center = target.min;
    center.copy(position).add(this.offset);

    target.min.set(
      center.x - this.halfSize.x,
      center.y - this.halfSize.y,
      center.z - this.halfSize.z
    );

    target.max.set(
      center.x + this.halfSize.x,
      center.y + this.halfSize.y,
      center.z + this.halfSize.z
    );

    return target;
  }
}