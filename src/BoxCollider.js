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
   * @param {number} [options.maxWalkableSlope=0.2] - Maximum walkable incline slope
   */
  constructor({ size = new THREE.Vector3(1, 1, 1), offset = new THREE.Vector3(), physicsCollision = true, maxWalkableSlope = 0.2, physicsMaterial = 'default', restitution, mass = 1 } = {}) {
    super({ type: 'BoxCollider', offset, physicsCollision, maxWalkableSlope, physicsMaterial, restitution, mass });
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

  /**
   * Samples the ground height (top surface Y coordinate) of this box collider.
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {THREE.Vector3} worldPosition - World position of this box collider
   * @returns {number|null} Top surface Y coordinate or null if out of bounds
   */
  getGroundHeightAt(playerPosition, worldPosition) {
    const centerX = worldPosition.x + this.offset.x;
    const centerY = worldPosition.y + this.offset.y;
    const centerZ = worldPosition.z + this.offset.z;
    const halfX = this.halfSize.x;
    const halfZ = this.halfSize.z;

    const minX = centerX - halfX;
    const maxX = centerX + halfX;
    const minZ = centerZ - halfZ;
    const maxZ = centerZ + halfZ;

    if (playerPosition.x >= minX - 0.1 && playerPosition.x <= maxX + 0.1 &&
        playerPosition.z >= minZ - 0.1 && playerPosition.z <= maxZ + 0.1) {
      const topY = centerY + this.halfSize.y;
      if (playerPosition.y >= topY - 1.2 && playerPosition.y <= topY + 1.2) {
        return topY;
      }
    }
    return null;
  }
}