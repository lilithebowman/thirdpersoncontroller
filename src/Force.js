/**
 * Force.js
 *
 * Class: Force
 * Purpose: Provides helper methods for applying impulse vectors to rigidbodies
 *          from either a THREE.Vector3 or an [x, y, z] array.
 */

import * as THREE from 'three';
import { Time } from './Time.js';

export class Force {
  /**
   * Applies an impulse to a Rigidbody instance.
   * @param {Rigidbody} rigidbody - Target Rigidbody instance
   * @param {THREE.Vector3|number[]} impulse - Impulse force vector or array
   */
  Impulse(rigidbody, impulse, time = null) {
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

    const effectiveTime = time instanceof Time ? time : new Time(1);
    rigidbody.addImpulse(impulseVector, effectiveTime);
  }

  /**
   * Calculates the impulse for a collision using the relative collision velocity,
   * the effective mass of both bodies, and the configured restitution.
   *
   * The returned vector is scaled by the active delta time so a contact at 30 FPS and
   * 60 FPS produces equivalent physical behavior rather than frame-rate-dependent spikes.
   */
  calculateCollisionImpulse({
    bodyA = null,
    bodyB = null,
    normal = null,
    relativeVelocity = null,
    restitution = 0,
    time = null,
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
    const effectiveTime = time instanceof Time ? time.deltaTime : 1;
    return normalVector.multiplyScalar(impulseScalar * effectiveMass * effectiveTime);
  }

  applyCollisionImpulse({
    bodyA = null,
    bodyB = null,
    normal = null,
    relativeVelocity = null,
    restitution = 0,
    time = null,
  } = {}) {
    const impulse = this.calculateCollisionImpulse({
      bodyA,
      bodyB,
      normal,
      relativeVelocity,
      restitution,
      time,
    });

    if (impulse.lengthSq() === 0) {
      return { impulse, applied: false };
    }

    const massA = Number.isFinite(bodyA?.mass) ? bodyA.mass : 1;
    const massB = Number.isFinite(bodyB?.mass) ? bodyB.mass : 1;

    const effectiveTime = time instanceof Time ? time : new Time(1);
    if (bodyA && typeof bodyA.addImpulse === 'function') {
      bodyA.addImpulse(impulse.clone().multiplyScalar(-1 / massA), effectiveTime);
    }

    if (bodyB && typeof bodyB.addImpulse === 'function') {
      bodyB.addImpulse(impulse.clone().multiplyScalar(1 / massB), effectiveTime);
    }

    return { impulse, applied: true };
  }

  /**
   * Static helper to apply an impulse to a rigidbody.
   * @param {Rigidbody} rigidbody - Target Rigidbody instance
   * @param {THREE.Vector3|number[]} impulse - Impulse vector or array
   */
  static Impulse(rigidbody, impulse, time = null) {
    new Force().Impulse(rigidbody, impulse, time);
  }

  static calculateCollisionImpulse(options = {}) {
    return new Force().calculateCollisionImpulse(options);
  }

  static applyCollisionImpulse(options = {}) {
    return new Force().applyCollisionImpulse(options);
  }
}