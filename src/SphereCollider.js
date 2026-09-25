/**
 * SphereCollider.js
 *
 * Implements a sphere collider with configurable radius, offset, and AABB
 * generation for the physics system.
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

  getBounds(position, target) {
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

  intersectsBounds(bounds, position) {
    const center = position.clone().add(this.offset);
    const closestX = THREE.MathUtils.clamp(center.x, bounds.min.x, bounds.max.x);
    const closestY = THREE.MathUtils.clamp(center.y, bounds.min.y, bounds.max.y);
    const closestZ = THREE.MathUtils.clamp(center.z, bounds.min.z, bounds.max.z);

    const dx = center.x - closestX;
    const dy = center.y - closestY;
    const dz = center.z - closestZ;

    return dx * dx + dy * dy + dz * dz <= this.radius * this.radius;
  }
}