/**
 * Force.js
 *
 * Class: Force
 * Purpose: Provides helper methods for applying impulse vectors to rigidbodies
 *          from either a THREE.Vector3 or an [x, y, z] array.
 */

import * as THREE from 'three';

export class Force {
  /**
   * Applies an impulse to a Rigidbody instance.
   * @param {Rigidbody} rigidbody - Target Rigidbody instance
   * @param {THREE.Vector3|number[]} impulse - Impulse force vector or array
   */
  Impulse(rigidbody, impulse) {
    if (!rigidbody || typeof rigidbody.addImpulse !== 'function') {
      throw new Error('Force.Impulse requires a Rigidbody instance.');
    }

    let impulseVector = impulse;
    if (Array.isArray(impulse)) {
      impulseVector = new THREE.Vector3(
        impulse[0] ?? 0,
        impulse[1] ?? 0,
        impulse[2] ?? 0
      );
    }

    if (!(impulseVector instanceof THREE.Vector3)) {
      throw new Error('Force.Impulse expects a THREE.Vector3 or [x, y, z] array.');
    }

    rigidbody.addImpulse(impulseVector);
  }

  /**
   * Static helper to apply an impulse to a rigidbody.
   * @param {Rigidbody} rigidbody - Target Rigidbody instance
   * @param {THREE.Vector3|number[]} impulse - Impulse vector or array
   */
  static Impulse(rigidbody, impulse) {
    new Force().Impulse(rigidbody, impulse);
  }
}