/**
 * SphereCollider.js
 *
 * Class: SphereCollider
 * Purpose: Implements a sphere collider with configurable radius, offset, and
 *          AABB bounding generation and sphere-box intersection logic.
 * Inherits: Collider
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class SphereCollider extends Collider {
  /**
   * Creates a SphereCollider instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.radius=0.5] - Radius of the sphere
   * @param {THREE.Vector3} [options.offset=new THREE.Vector3()] - Center offset relative to parent transform
   * @param {boolean} [options.physicsCollision=true] - Whether collider resolves physical overlaps
   * @param {number} [options.maxWalkableSlope=0.2] - Maximum walkable incline slope
   */
  constructor({ radius = 0.5, offset = new THREE.Vector3(), physicsCollision = true, maxWalkableSlope = 0.2 } = {}) {
    super({ type: 'SphereCollider', offset, physicsCollision, maxWalkableSlope });
    this.radius = Math.max(0, radius);
  }

  /**
   * Sets the sphere radius.
   * @param {number} radius - New radius value (clamped >= 0)
   */
  setRadius(radius) {
    this.radius = Math.max(0, radius);
  }

  /**
   * Computes the axis-aligned bounding box (AABB) enclosing the sphere in world space.
   * @param {THREE.Vector3} position - World position of the object
   * @param {THREE.Box3} target - Target box to populate with min and max
   * @returns {THREE.Box3} The populated target bounds object
   */
  getBounds(position, target) {
    const centerX = position.x + this.offset.x;
    const centerY = position.y + this.offset.y;
    const centerZ = position.z + this.offset.z;

    target.min.set(
      centerX - this.radius,
      centerY - this.radius,
      centerZ - this.radius
    );

    target.max.set(
      centerX + this.radius,
      centerY + this.radius,
      centerZ + this.radius
    );

    return target;
  }

  /**
   * Tests intersection between this sphere and a target AABB bounds.
   * Logic: Finds the closest point on the AABB to the sphere center and checks
   * if the squared distance is less than or equal to the squared radius.
   * @param {THREE.Box3} bounds - Target AABB bounds
   * @param {THREE.Vector3} position - World position of this sphere collider
   * @returns {boolean} True if intersecting, false otherwise
   */
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