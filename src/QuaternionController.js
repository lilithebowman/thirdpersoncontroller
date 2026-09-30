/**
 * QuaternionController.js
 *
 * Class: QuaternionController
 * Purpose: Manages quaternion-based rotations with yaw tracking, shortest-angle delta calculation,
 *          and smooth interpolation for character facing direction.
 */

import * as THREE from 'three';

export class QuaternionController {
  /**
   * Creates a QuaternionController instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.yaw=0] - Initial yaw angle in radians
   * @param {number} [options.lerpFactor=0.14] - Interpolation damping factor
   */
  constructor({ yaw = 0, lerpFactor = 0.14 } = {}) {
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.lerpFactor = lerpFactor;
    this.quaternion = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.setYaw(yaw);
  }

  /**
   * Immediately sets the current and target yaw angles.
   * @param {number} yaw - Yaw angle in radians
   */
  setYaw(yaw) {
    this.targetYaw = yaw;
    this.yaw = yaw;
    this.quaternion.setFromAxisAngle(this.up, yaw);
  }

  /**
   * Queues a rotation delta to the target yaw.
   * @param {number} deltaYaw - Delta yaw in radians
   */
  rotateBy(deltaYaw) {
    this.targetYaw += deltaYaw;
  }

  /**
   * Updates yaw interpolation towards targetYaw using shortest angular distance.
   * @param {number} delta - Frame delta time in seconds
   */
  update(delta) {
    const turnDelta = this.targetYaw - this.yaw;
    const shortest = ((turnDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.yaw += shortest * Math.min(1, delta * 12);
    this.quaternion.setFromAxisAngle(this.up, this.yaw);
  }

  /**
   * Applies the controller's quaternion to a target 3D object.
   * @param {THREE.Object3D} object - Target object to update
   */
  applyTo(object) {
    object.quaternion.slerp(this.quaternion, 1);
  }
}
