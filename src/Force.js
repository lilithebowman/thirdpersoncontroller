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
   * Calculates the impulse for a collision using the relative collision velocity,
   * the effective mass of both bodies, and the configured restitution.
   */
  calculateCollisionImpulse({
    bodyA = null,
    bodyB = null,
    normal = null,
    relativeVelocity = null,
    restitution = 0,
  } = {}) {
    if (!bodyA || !bodyB || !normal) {
      return new THREE.Vector3();
    }

    const normalVector = normal instanceof THREE.Vector3 ? normal.clone().normalize() : new THREE.Vector3(0, 0, 0);
    if (normalVector.lengthSq() === 0) {
      return new THREE.Vector3();
    }

    const massA = Number.isFinite(bodyA.mass) ? bodyA.mass : 1;
    const massB = Number.isFinite(bodyB.mass) ? bodyB.mass : 1;
    const velocityA = relativeVelocity && relativeVelocity instanceof THREE.Vector3 ? relativeVelocity.clone() : bodyB.velocity && bodyA.velocity ? bodyB.velocity.clone().sub(bodyA.velocity) : new THREE.Vector3();
    const closingVelocity = velocityA.dot(normalVector);
    if (closingVelocity >= 0) {
      return new THREE.Vector3();
    }

    const effectiveMass = 1 / (1 / massA + 1 / massB);
    const impulseScalar = (-(1 + Math.min(1, Math.max(0, restitution))) * closingVelocity) / (1 / massA + 1 / massB || 1e-6);
    return normalVector.multiplyScalar(impulseScalar * effectiveMass);
  }

  applyCollisionImpulse({
    bodyA = null,
    bodyB = null,
    normal = null,
    relativeVelocity = null,
    restitution = 0,
  } = {}) {
    const impulse = this.calculateCollisionImpulse({
      bodyA,
      bodyB,
      normal,
      relativeVelocity,
      restitution,
    });

    if (impulse.lengthSq() === 0) {
      return { impulse, applied: false };
    }

    const massA = Number.isFinite(bodyA?.mass) ? bodyA.mass : 1;
    const massB = Number.isFinite(bodyB?.mass) ? bodyB.mass : 1;

    if (bodyA && typeof bodyA.addImpulse === 'function') {
      bodyA.addImpulse(impulse.clone().multiplyScalar(-1 / massA));
    }

    if (bodyB && typeof bodyB.addImpulse === 'function') {
      bodyB.addImpulse(impulse.clone().multiplyScalar(1 / massB));
    }

    return { impulse, applied: true };
  }

  /**
   * Static helper to apply an impulse to a rigidbody.
   * @param {Rigidbody} rigidbody - Target Rigidbody instance
   * @param {THREE.Vector3|number[]} impulse - Impulse vector or array
   */
  static Impulse(rigidbody, impulse) {
    new Force().Impulse(rigidbody, impulse);
  }

  static calculateCollisionImpulse(options) {
    return new Force().calculateCollisionImpulse(options);
  }

  static applyCollisionImpulse(options) {
    return new Force().applyCollisionImpulse(options);
  }
}