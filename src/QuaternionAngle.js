/**
 * QuaternionAngle.js
 *
 * Class: QuaternionAngle
 * Purpose: Wraps quaternion rotation values and provides conversion helpers for Euler angles
 *          and spherical linear interpolation (slerp).
 */

import * as THREE from 'three';
import { EulerAngle } from './EulerAngle.js';

export class QuaternionAngle {
  /**
   * Creates a QuaternionAngle instance.
   * @param {number} [x=0] - X component
   * @param {number} [y=0] - Y component
   * @param {number} [z=0] - Z component
   * @param {number} [w=1] - W component
   */
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  /**
   * Clones this quaternion angle.
   * @returns {QuaternionAngle} A new cloned instance
   */
  clone() {
    return new QuaternionAngle(this.x, this.y, this.z, this.w);
  }

  /**
   * Sets quaternion components.
   * @param {number} x - X component
   * @param {number} y - Y component
   * @param {number} z - Z component
   * @param {number} w - W component
   * @returns {QuaternionAngle} This instance for chaining
   */
  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  /**
   * Populates this quaternion from an EulerAngle.
   * @param {EulerAngle} euler - Source Euler angle
   * @returns {QuaternionAngle} This instance for chaining
   */
  fromEuler(euler) {
    const quaternion = new THREE.Quaternion().setFromEuler(euler.toTHREE());
    this.x = quaternion.x;
    this.y = quaternion.y;
    this.z = quaternion.z;
    this.w = quaternion.w;
    return this;
  }

  /**
   * Converts this quaternion to an EulerAngle.
   * @returns {EulerAngle} Converted Euler angle representation
   */
  toEuler() {
    const quaternion = this.toTHREE();
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    return new EulerAngle(euler.x, euler.y, euler.z);
  }

  /**
   * Creates a QuaternionAngle from an EulerAngle.
   * @param {EulerAngle} euler - Source Euler angle
   * @returns {QuaternionAngle} New QuaternionAngle instance
   */
  static fromEuler(euler) {
    return new QuaternionAngle().fromEuler(euler);
  }

  /**
   * Creates a QuaternionAngle from a native THREE.Quaternion.
   * @param {THREE.Quaternion} quaternion - Source THREE.Quaternion
   * @returns {QuaternionAngle} New QuaternionAngle instance
   */
  static fromQuaternion(quaternion) {
    return new QuaternionAngle(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }

  /**
   * Converts to a native Three.js Quaternion object.
   * @returns {THREE.Quaternion} Three.js Quaternion instance
   */
  toTHREE() {
    return new THREE.Quaternion(this.x, this.y, this.z, this.w);
  }

  /**
   * Performs spherical linear interpolation towards a target quaternion.
   * @param {QuaternionAngle} target - Target quaternion
   * @param {number} alpha - Interpolation factor [0, 1]
   * @returns {QuaternionAngle} This instance for chaining
   */
  slerp(target, alpha) {
    const result = this.toTHREE().slerp(target.toTHREE(), alpha);
    this.x = result.x;
    this.y = result.y;
    this.z = result.z;
    this.w = result.w;
    return this;
  }
}
