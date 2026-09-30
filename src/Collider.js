/**
 * Collider.js
 *
 * Class: Collider
 * Purpose: Abstract base class for collision volumes, providing AABB bounds calculation
 *          and broad-phase overlap testing logic.
 * Public API:
 * - getBounds(position, target): Computes world-space bounding box.
 * - intersectsBounds(bounds, position): Tests intersection against an AABB.
 */

import * as THREE from 'three';

export class Collider {
  /**
   * Creates a Collider instance.
   * @param {Object} options - Configuration options
   * @param {string} [options.type='Collider'] - Collider type identifier
   * @param {THREE.Vector3} [options.offset=new THREE.Vector3()] - Positional offset
   * @param {boolean} [options.physicsCollision=true] - Whether collider participates in physics resolution
   */
  constructor({ type = 'Collider', offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    this.type = type;
    this.offset = offset.clone();
    this.physicsCollision = physicsCollision === true;
    this._tmpBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  }

  /**
   * Abstract method to compute world-space bounding box. Must be implemented by subclasses.
   * @param {THREE.Vector3} _position - Object world position
   * @param {THREE.Box3} _target - Target box to populate
   * @throws {Error} If not implemented by subclass
   */
  getBounds(_position, _target) {
    throw new Error('Collider.getBounds must be implemented by subclasses.');
  }

  /**
   * Tests whether this collider intersects a given world AABB bounds.
   * Performs an axis-separated bounding box intersection test.
   * @param {THREE.Box3} bounds - Target AABB bounds to test against
   * @param {THREE.Vector3} position - World position of this collider
   * @returns {boolean} True if intersecting, false otherwise
   */
  intersectsBounds(bounds, position) {
    this.getBounds(position, this._tmpBounds);

    return !(
      bounds.max.x <= this._tmpBounds.min.x ||
      bounds.min.x >= this._tmpBounds.max.x ||
      bounds.max.y <= this._tmpBounds.min.y ||
      bounds.min.y >= this._tmpBounds.max.y ||
      bounds.max.z <= this._tmpBounds.min.z ||
      bounds.min.z >= this._tmpBounds.max.z
    );
  }
}