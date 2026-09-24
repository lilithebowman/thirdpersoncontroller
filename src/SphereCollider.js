/**
 * SphereCollider.js
 * 
 * Defines a sphere-shaped collider for use in a physics or collision detection system.
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class SphereCollider extends Collider {
  constructor({ radius = 0.5, offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    super({ type: 'SphereCollider', offset, physicsCollision });
    this.radius = Math.max(0, radius);
  }

  setRadius(radius) {
    this.radius = Math.max(0, radius);
  }

  getAABB(position, target) {
    const center = target.min;
    center.copy(position).add(this.offset);

    target.min.set(
      center.x - this.radius,
      center.y - this.radius,
      center.z - this.radius
    );

    target.max.set(
      center.x + this.radius,
      center.y + this.radius,
      center.z + this.radius
    );

    return target;
  }
}