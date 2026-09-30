/**
 * CameraController.js
 *
 * Class: CameraController
 * Purpose: Manages the perspective camera for the third-person controller, handling
 *          third-person follow positioning, first-person head attachment, zoom limits,
 *          pitch/yaw mouse look, and head bone rotation overrides.
 * SOLID Principles:
 * - Single Responsibility: Encapsulates all camera math, view states, and head-look overrides.
 */

import * as THREE from 'three';

export class CameraController {
  /**
   * Creates a CameraController instance.
   * @param {Object} options - Configuration options
   * @param {THREE.PerspectiveCamera} options.camera - Three.js perspective camera
   */
  constructor({ camera } = {}) {
    if (!camera) {
      throw new Error('CameraController requires a THREE.PerspectiveCamera.');
    }

    this.camera = camera;
    this.camera.rotation.order = 'YXZ';

    this.state = {
      yaw: 0,
      pitch: 0,
      distance: 7.5,
      height: 4.5,
      minDistance: 0.35,
      maxDistance: 24,
      zoomStep: 0.01,
      firstPersonDistanceThreshold: 0.5,
      minPitch: THREE.MathUtils.degToRad(-85),
      maxPitch: THREE.MathUtils.degToRad(85),
      headLookYawLimit: THREE.MathUtils.degToRad(85),
      headLookPitchLimit: THREE.MathUtils.degToRad(70),
      firstPersonNear: 0.02,
      thirdPersonNear: 0.1,
    };

    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.cameraLookDirection = new THREE.Vector3(0, 0, -1);
    this.headWorldPosition = new THREE.Vector3();
    this.headLookLocalAxisUp = new THREE.Vector3(0, 1, 0);
    this.headLookLocalAxisRight = new THREE.Vector3(1, 0, 0);
    this.headLookQuaternionYaw = new THREE.Quaternion();
    this.headLookQuaternionPitch = new THREE.Quaternion();
    this.headLookQuaternionResult = new THREE.Quaternion();
    this.playerHeadBoneBaseLocalQuaternion = new THREE.Quaternion();
    this.firstPersonHeadOverrideActive = false;
  }

  /**
   * Checks whether the camera is currently in first-person view mode.
   * @returns {boolean} True if distance is within first-person threshold
   */
  isFirstPerson() {
    return this.state.distance <= this.state.firstPersonDistanceThreshold;
  }

  /**
   * Updates the camera near clipping plane safely.
   * @param {number} nextNear - Target near plane distance
   */
  setNearPlane(nextNear) {
    if (!Number.isFinite(nextNear) || nextNear <= 0) {
      return;
    }

    if (Math.abs(this.camera.near - nextNear) < 1e-4) {
      return;
    }

    this.camera.near = nextNear;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Computes the first-person look direction vector based on pitch and yaw.
   * @param {THREE.Vector3} [target=new THREE.Vector3()] - Output vector
   * @returns {THREE.Vector3} The computed look direction
   */
  computeFirstPersonLookDirection(target = new THREE.Vector3()) {
    const pitch = this.state.pitch;
    const yaw = this.state.yaw;
    const pitchCos = Math.cos(pitch);

    target.set(
      -Math.sin(yaw) * pitchCos,
      Math.sin(pitch),
      -Math.cos(yaw) * pitchCos
    ).normalize();

    return target;
  }

  /**
   * Resolves the world position of the player's head or eyes for first-person view.
   * @param {THREE.Vector3} [target=new THREE.Vector3()] - Output position vector
   * @param {THREE.Object3D|null} playerHeadBone - Head bone reference
   * @param {THREE.Object3D[]} eyeBones - Array of eye bone references
   * @param {THREE.Group|null} player - Player root object
   * @returns {THREE.Vector3} The resolved head position
   */
  resolveHeadPosition(target = new THREE.Vector3(), playerHeadBone = null, eyeBones = [], player = null) {
    if (Array.isArray(eyeBones) && eyeBones.length > 0) {
      target.set(0, 0, 0);
      for (const eyeBone of eyeBones) {
        eyeBone.getWorldPosition(this.headWorldPosition);
        target.add(this.headWorldPosition);
      }
      target.multiplyScalar(1 / eyeBones.length);
      return target;
    }

    if (playerHeadBone) {
      playerHeadBone.getWorldPosition(target);
      return target;
    }

    if (player) {
      target.set(player.position.x, player.position.y + 1.6, player.position.z);
      return target;
    }

    return target.set(0, 1.6, 0);
  }

  /**
   * Applies head rotation override during first-person view to align with camera pitch/yaw.
   * @param {THREE.Object3D|null} playerHeadBone - Head bone reference
   * @param {number} playerYaw - Current player body yaw
   */
  applyHeadLookOverride(playerHeadBone, playerYaw) {
    if (!playerHeadBone) {
      return;
    }

    const firstPersonFacingYaw = THREE.MathUtils.euclideanModulo(this.state.yaw + Math.PI + Math.PI, Math.PI * 2) - Math.PI;
    const angleDiff = firstPersonFacingYaw - playerYaw;
    const shortestDelta = ((angleDiff + Math.PI) % (Math.PI * 2)) - Math.PI;

    const relativeYaw = THREE.MathUtils.clamp(
      shortestDelta,
      -this.state.headLookYawLimit,
      this.state.headLookYawLimit
    );
    const clampedPitch = THREE.MathUtils.clamp(
      this.state.pitch,
      -this.state.headLookPitchLimit,
      this.state.headLookPitchLimit
    );

    this.headLookQuaternionYaw.setFromAxisAngle(this.headLookLocalAxisUp, relativeYaw);
    this.headLookQuaternionPitch.setFromAxisAngle(this.headLookLocalAxisRight, clampedPitch);

    this.headLookQuaternionResult.copy(this.playerHeadBoneBaseLocalQuaternion);
    this.headLookQuaternionResult.multiply(this.headLookQuaternionYaw);
    this.headLookQuaternionResult.multiply(this.headLookQuaternionPitch);
    playerHeadBone.quaternion.copy(this.headLookQuaternionResult);
    this.firstPersonHeadOverrideActive = true;
  }

  /**
   * Clears head look override when exiting first-person view.
   * @param {THREE.Object3D|null} playerHeadBone - Head bone reference
   */
  clearHeadLookOverride(playerHeadBone) {
    if (!this.firstPersonHeadOverrideActive || !playerHeadBone) {
      return;
    }

    playerHeadBone.quaternion.copy(this.playerHeadBoneBaseLocalQuaternion);
    this.firstPersonHeadOverrideActive = false;
  }

  /**
   * Updates camera position and orientation relative to the player.
   * @param {THREE.Group} player - Player object
   */
  update(player) {
    if (!player) {
      return;
    }

    this.state.distance = THREE.MathUtils.clamp(
      this.state.distance,
      this.state.minDistance,
      this.state.maxDistance
    );

    if (this.isFirstPerson()) {
      this.setNearPlane(this.state.firstPersonNear);
      this.computeFirstPersonLookDirection(this.cameraLookDirection);
      this.resolveHeadPosition(this.headWorldPosition, player.userData.headBone, player.userData.eyeBones, player);
      this.camera.position.copy(this.headWorldPosition);
      this.camera.rotation.set(this.state.pitch, this.state.yaw, 0, 'YXZ');
      return;
    }

    this.setNearPlane(this.state.thirdPersonNear);

    this.cameraPosition.set(
      Math.sin(this.state.yaw) * this.state.distance,
      this.state.height,
      Math.cos(this.state.yaw) * this.state.distance
    );
    this.cameraPosition.add(player.position);
    this.camera.position.lerp(this.cameraPosition, 0.12);

    this.cameraTarget.set(player.position.x, player.position.y + 1.5, player.position.z);
    this.camera.lookAt(this.cameraTarget);
  }
}
