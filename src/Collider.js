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
    this._tmpBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
  }

  getBounds(_position, _target) {
    throw new Error('Collider.getBounds must be implemented by subclasses.');
  }

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