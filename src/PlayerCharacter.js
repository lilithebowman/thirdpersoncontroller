/**
 * PlayerCharacter.js
 *
 * Class: PlayerCharacter
 * Purpose: Encapsulates player avatar creation, fallback geometry, skeletal bone discovery
 *          (head/eye bones), and animation state synchronization via Animator.
 * SOLID Principles:
 * - Single Responsibility: Solely responsible for the player visual representation and avatar setup.
 */

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export class PlayerCharacter {
  /**
   * Creates a PlayerCharacter instance.
   * @param {Object} options - Configuration options
   * @param {Animator} options.animator - Animator instance
   */
  constructor({ animator } = {}) {
    if (!animator) {
      throw new Error('PlayerCharacter requires an Animator instance.');
    }

    this.animator = animator;
    this.root = null;
    this.visual = null;
    this.headBone = null;
    this.eyeBones = [];
    this.modelTemplate = null;
    this.manifestConfig = {
      modelScale: new THREE.Vector3(0.01, 0.01, 0.01),
      modelRotationDegrees: new THREE.Vector3(0, 0, 0),
      modelOffset: new THREE.Vector3(0, 0, 0),
    };
  }

  /**
   * Creates fallback box visual when FBX model template is missing.
   * @returns {THREE.Group} Fallback character group
   */
  createFallbackVisual() {
    const visual = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.65, metalness: 0.15 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    visual.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 })
    );
    head.position.y = 1.3;
    head.castShadow = true;
    visual.add(head);

    return visual;
  }

  /**
   * Spawns or recreates the player avatar.
   * @param {THREE.Scene} scene - Three.js scene
   * @param {THREE.Vector3} spawnPosition - World spawn position
   */
  spawn(scene, spawnPosition) {
    if (this.root) {
      scene.remove(this.root);
    }

    this.root = new THREE.Group();
    this.visual = this.animator.createPlayerVisual(() => {
      const fallback = this.modelTemplate
        ? cloneSkinned(this.modelTemplate)
        : this.createFallbackVisual();

      const { modelScale, modelRotationDegrees, modelOffset } = this.manifestConfig;
      fallback.scale.copy(modelScale);
      fallback.rotation.set(
        THREE.MathUtils.degToRad(modelRotationDegrees.x),
        THREE.MathUtils.degToRad(modelRotationDegrees.y),
        THREE.MathUtils.degToRad(modelRotationDegrees.z)
      );
      fallback.position.copy(modelOffset);
      return fallback;
    });

    this.root.add(this.visual);
    this.root.position.copy(spawnPosition);

    this.headBone = this.findHeadBone(this.root);
    this.eyeBones = this.findEyeBones(this.root);
    this.root.userData.headBone = this.headBone;
    this.root.userData.eyeBones = this.eyeBones;

    scene.add(this.root);
  }

  /**
   * Canonicalizes node names for robust skeleton bone matching.
   * @param {string} name - Bone node name
   * @returns {string|null} Canonical lowercased name
   */
  canonicalizeNodeName(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const segments = trimmed.split(/[:|/\\]/).filter(Boolean);
    const base = segments.length > 0 ? segments[segments.length - 1] : trimmed;
    return base.toLowerCase().replace(/[^a-z0-9]/g, '') || null;
  }

  /**
   * Finds the head bone in the rig hierarchy.
   * @param {THREE.Object3D} root - Rig root object
   * @returns {THREE.Object3D|null} Head bone or null
   */
  findHeadBone(root) {
    if (!root || typeof root.traverse !== 'function') {
      return null;
    }

    let bestMatch = null;
    root.traverse((child) => {
      if (bestMatch || !child?.isBone || !child?.name) {
        return;
      }
      const canonical = this.canonicalizeNodeName(child.name);
      if (canonical && canonical.includes('head')) {
        bestMatch = child;
      }
    });

    return bestMatch;
  }

  /**
   * Finds eye bones in the rig hierarchy for precise first-person eye positioning.
   * @param {THREE.Object3D} root - Rig root object
   * @returns {THREE.Object3D[]} Array of eye bones
   */
  findEyeBones(root) {
    if (!root || typeof root.traverse !== 'function') {
      return [];
    }

    const eyeBones = [];
    root.traverse((child) => {
      if (!child?.isBone || !child?.name) {
        return;
      }
      const canonical = this.canonicalizeNodeName(child.name);
      if (canonical && canonical.includes('eye') && !canonical.includes('eyelid') && !canonical.includes('eyebrow')) {
        eyeBones.push(child);
      }
    });

    return eyeBones;
  }
}
