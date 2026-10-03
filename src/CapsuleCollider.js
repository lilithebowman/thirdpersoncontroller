/**
 * CapsuleCollider.js
 *
 * Class: CapsuleCollider
 * Purpose: Implements a capsule-shaped physics volume for grounded movement and broad-phase collision checks.
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class CapsuleCollider extends Collider {
  constructor({ radius = 0.45, height = 1.6, offset = new THREE.Vector3(), physicsCollision = true, maxWalkableSlope = 0.2 } = {}) {
    super({ type: 'CapsuleCollider', offset, physicsCollision, maxWalkableSlope });
    this.radius = Math.max(0, radius);
    this.height = Math.max(this.radius * 2, height);
  }

  setRadius(radius) {
    this.radius = Math.max(0, radius);
    this.height = Math.max(this.height, this.radius * 2);
  }

  setHeight(height) {
    this.height = Math.max(this.radius * 2, height);
  }

  getBounds(position, target) {
    const centerX = position.x + this.offset.x;
    const centerY = position.y + this.offset.y;
    const centerZ = position.z + this.offset.z;
    const halfHeight = this.height * 0.5;

    target.min.set(centerX - this.radius, centerY - halfHeight, centerZ - this.radius);
    target.max.set(centerX + this.radius, centerY + halfHeight, centerZ + this.radius);

    return target;
  }

  intersectsBounds(bounds, position) {
    const center = position.clone().add(this.offset);
    const halfHeight = this.height * 0.5;
    const closestX = THREE.MathUtils.clamp(center.x, bounds.min.x, bounds.max.x);
    const closestY = THREE.MathUtils.clamp(center.y, bounds.min.y, bounds.max.y);
    const closestZ = THREE.MathUtils.clamp(center.z, bounds.min.z, bounds.max.z);
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    const dz = center.z - closestZ;

    const radiusSq = this.radius * this.radius;
    const yWithinCylinder = Math.abs(center.y - closestY) <= halfHeight;
    return (dx * dx + dy * dy + dz * dz <= radiusSq) || (yWithinCylinder && Math.abs(center.y - closestY) <= halfHeight);
  }

  getGroundHeightAt(playerPosition, worldPosition) {
    const centerX = worldPosition.x + this.offset.x;
    const centerZ = worldPosition.z + this.offset.z;
    const dx = playerPosition.x - centerX;
    const dz = playerPosition.z - centerZ;

    if (dx * dx + dz * dz <= this.radius * this.radius * 1.2) {
      const topY = worldPosition.y + this.offset.y + this.height * 0.5;
      if (playerPosition.y >= topY - 1.2 && playerPosition.y <= topY + 1.2) {
        return topY;
      }
    }

    return null;
  }
}
