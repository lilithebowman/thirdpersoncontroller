/**
 * BoxCollider.js
 *
 * Class: BoxCollider
 * Purpose: Implements an axis-aligned box collider with configurable size, offset, and
 *          AABB generation for the physics system.
 * Inherits: Collider
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class BoxCollider extends Collider {
  /**
   * Creates a BoxCollider instance.
   * @param {Object} options - Configuration options
   * @param {THREE.Vector3} [options.size=new THREE.Vector3(1,1,1)] - Dimensions along X, Y, Z axes
   * @param {THREE.Vector3} [options.offset=new THREE.Vector3()] - Center offset relative to parent transform
   * @param {boolean} [options.physicsCollision=true] - Whether collider resolves physical overlaps
   */
  constructor({ size = new THREE.Vector3(1, 1, 1), offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    super({ type: 'BoxCollider', offset, physicsCollision });
    this.size = size.clone();
    this.halfSize = this.size.clone().multiplyScalar(0.5);
  }

  /**
   * Updates the box dimensions and recalculates half-extents.
   * @param {THREE.Vector3} size - New box size dimensions
   */
  setSize(size) {
    this.size.copy(size);
    this.halfSize.copy(size).multiplyScalar(0.5);
  }

  /**
   * Computes the axis-aligned bounding box (AABB) in world space.
   * @param {THREE.Vector3} position - World position of the object
   * @param {Object} target - Target object containing min and max THREE.Vector3 instances
   * @returns {Object} The populated target bounds object
   */
  getBounds(position, target) {
    const centerX = position.x + this.offset.x;
    const centerY = position.y + this.offset.y;
    const centerZ = position.z + this.offset.z;

    target.min.set(
      centerX - this.halfSize.x,
      centerY - this.halfSize.y,
      centerZ - this.halfSize.z
    );

    target.max.set(
      centerX + this.halfSize.x,
      centerY + this.halfSize.y,
      centerZ + this.halfSize.z
    );

    return target;
  }
}