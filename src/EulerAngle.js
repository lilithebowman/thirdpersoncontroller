/**
 * EulerAngle.js
 *
 * Class: EulerAngle
 * Purpose: Wraps Euler rotation values and provides yaw normalization plus conversion
 *          helpers for Three.js quaternions and Euler objects.
 */

import * as THREE from 'three';
import { QuaternionAngle } from './QuaternionAngle.js';

export class EulerAngle {
  /**
   * Creates an EulerAngle instance.
   * @param {number} [x=0] - X rotation angle in radians
   * @param {number} [y=0] - Y rotation (yaw) angle in radians
   * @param {number} [z=0] - Z rotation angle in radians
   */
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  /**
   * Clones this EulerAngle.
   * @returns {EulerAngle} A new cloned instance
   */
  clone() {
    return new EulerAngle(this.x, this.y, this.z);
  }

  /**
   * Sets the Euler rotation angles.
   * @param {number} x - X angle
   * @param {number} y - Y angle
   * @param {number} z - Z angle
   * @returns {EulerAngle} This instance for chaining
   */
  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  /**
   * Normalizes the yaw angle (y) into the range [-PI, PI].
   * @returns {EulerAngle} This instance for chaining
   */
  normalizeYaw() {
    this.y = THREE.MathUtils.euclideanModulo(this.y + Math.PI * 2, Math.PI * 2) - Math.PI;
    return this;
  }

  /**
   * Computes the shortest angular delta to a target yaw.
   * @param {number} targetYaw - Target yaw in radians
   * @returns {number} Shortest delta angle
   */
  shortestDelta(targetYaw) {
    const difference = targetYaw - this.y;
    return ((difference + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  /**
   * Rotates this Euler angle by a delta yaw and normalizes.
   * @param {number} deltaYaw - Delta yaw in radians
   * @returns {EulerAngle} This instance for chaining
   */
  rotateBy(deltaYaw) {
    this.y += deltaYaw;
    this.normalizeYaw();
    return this;
  }

  /**
   * Converts this Euler angle to a QuaternionAngle.
   * @returns {QuaternionAngle} Converted quaternion representation
   */
  toQuaternion() {
    return QuaternionAngle.fromEuler(this);
  }

  /**
   * Creates an EulerAngle from a QuaternionAngle.
   * @param {QuaternionAngle} quaternion - Source quaternion
   * @returns {EulerAngle} Converted Euler angle
   */
  static fromQuaternion(quaternion) {
    return quaternion.toEuler();
  }

  /**
   * Converts to a native Three.js Euler object.
   * @returns {THREE.Euler} Three.js Euler instance
   */
  toTHREE() {
    return new THREE.Euler(this.x, this.y, this.z, 'XYZ');
  }
}
