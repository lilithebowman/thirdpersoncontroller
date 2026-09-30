/**
 * Skybox.js
 *
 * Class: Skybox
 * Purpose: Manages rendering and configuring the skybox in a Three.js scene.
 *          Supports solid background colors, gradient/mesh skyboxes, and cubemap textures
 *          loaded via CubeTextureLoader with robust path resolution and fallback handling.
 * SOLID Principles:
 * - Single Responsibility: Solely responsible for skybox creation, texture loading, and scene background configuration.
 * - Open/Closed Principle: Open for extension (e.g. cubemap, color, mesh skyboxes) without modifying core orchestration.
 * - Dependency Inversion: Depends on abstractions (scene, resolveScenePath callback) rather than hardcoded global loaders.
 */

import * as THREE from 'three';

export class Skybox {
  /**
   * Creates a Skybox instance.
   * @param {Object} options - Configuration options
   * @param {THREE.Scene} options.scene - Three.js scene instance
   * @param {Function} [options.resolveScenePath] - Path resolution callback for asset loading
   * @param {Object} [options.debugDisplay] - Optional debug logging interface
   */
  constructor({ scene, resolveScenePath = null, debugDisplay = null } = {}) {
    if (!scene) {
      throw new Error('Skybox requires a THREE.Scene.');
    }

    this.scene = scene;
    this.resolveScenePath = resolveScenePath;
    this.debugDisplay = debugDisplay;
    this.currentMesh = null;
  }

  /**
   * Applies skybox configuration to the scene.
   * @param {Object} [config={}] - Skybox configuration object
   * @returns {Promise<void>}
   */
  async apply(config = {}) {
    if (!config || typeof config !== 'object') {
      return;
    }

    const type = (config.type ?? config.skyboxType ?? 'color').toLowerCase();

    try {
      if (type === 'cubemap' || type === 'cube') {
        await this.loadCubeTexture(config.paths ?? config.urls ?? []);
      } else if (type === 'color' || type === 'solid') {
        const colorValue = config.color ?? config.background ?? 0x8ecae6;
        this.scene.background = new THREE.Color(colorValue);
      } else if (type === 'mesh' || type === 'geometry') {
        this.createSkyboxMesh(config);
      } else {
        if (config.color) {
          this.scene.background = new THREE.Color(config.color);
        } else if (config.paths) {
          await this.loadCubeTexture(config.paths);
        } else {
          this.scene.background = new THREE.Color(0x8ecae6);
        }
      }
    } catch (error) {
      const message = `Failed to apply skybox configuration: ${error?.message ?? error}`;
      if (this.debugDisplay && typeof this.debugDisplay.LogError === 'function') {
        this.debugDisplay.LogError(message);
      } else {
        console.warn(message);
      }
    }
  }

  /**
   * Loads a cubemap texture from 6 face image paths and sets it as scene background.
   * @param {Array<string>} paths - Array of 6 image paths [px, nx, py, ny, pz, nz]
   * @returns {Promise<THREE.CubeTexture|null>}
   */
  async loadCubeTexture(paths) {
    if (!Array.isArray(paths) || paths.length === 0) {
      return null;
    }

    const resolvedPaths = paths.map((p) => {
      if (typeof this.resolveScenePath === 'function') {
        return this.resolveScenePath(p);
      }
      return p;
    });

    const loader = new THREE.CubeTextureLoader();
    const cubeTexture = await loader.loadAsync(resolvedPaths);
    this.scene.background = cubeTexture;
    this.scene.environment = cubeTexture;
    return cubeTexture;
  }

  /**
   * Creates a skybox mesh (e.g. large box with back-side rendering).
   * @param {Object} [config={}] - Mesh configuration options
   * @returns {THREE.Mesh} Created skybox mesh
   */
  createSkyboxMesh(config = {}) {
    if (this.currentMesh) {
      this.scene.remove(this.currentMesh);
      this.currentMesh = null;
    }

    const size = config.size ?? 1000;
    const geometry = new THREE.BoxGeometry(size, size, size);
    const material = new THREE.MeshBasicMaterial({
      color: config.color ? new THREE.Color(config.color) : 0x8ecae6,
      side: THREE.BackSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = config.name ?? 'SkyboxMesh';
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.currentMesh = mesh;
    return mesh;
  }
}
