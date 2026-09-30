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
      this.scene.background = new THREE.Color(0x8ecae6);
      return;
    }

    const type = (config.type ?? config.skyboxType ?? '').toLowerCase();
    const texturePath = config.textures ? null : (config.texture ?? config.path ?? config.url);

    try {
      if (
        type === 'cubemap' ||
        type === 'cube' ||
        type === 'multi-texture' ||
        type === 'multitexture' ||
        config.textures ||
        Array.isArray(config.paths) ||
        Array.isArray(config.urls)
      ) {
        await this.loadCubeTexture(config.textures ?? config.paths ?? config.urls ?? []);
      } else if (type === 'texture' || type === 'hdr' || type === 'equirectangular' || type === 'image' || texturePath) {
        try {
          await this.loadTextureSkybox(texturePath, config);
        } catch (textureError) {
          const warnMsg = `Failed to load skybox texture ${texturePath}: ${textureError?.message ?? textureError}. Falling back to default background color.`;
          if (this.debugDisplay && typeof this.debugDisplay.LogError === 'function') {
            this.debugDisplay.LogError(warnMsg);
          } else {
            console.warn(warnMsg);
          }
          const fallbackColor = config.fallbackColor ?? config.color ?? config.background ?? 0x8ecae6;
          this.scene.background = new THREE.Color(fallbackColor);
        }
      } else if (type === 'color' || type === 'solid' || config.color !== undefined || config.background !== undefined) {
        const colorValue = config.color ?? config.background ?? 0x8ecae6;
        this.scene.background = new THREE.Color(colorValue);
      } else if (type === 'mesh' || type === 'geometry') {
        this.createSkyboxMesh(config);
      } else {
        if (config.color) {
          this.scene.background = new THREE.Color(config.color);
        } else if (config.paths) {
          await this.loadCubeTexture(config.paths);
        } else if (texturePath) {
          try {
            await this.loadTextureSkybox(texturePath, config);
          } catch {
            this.scene.background = new THREE.Color(0x8ecae6);
          }
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
      this.scene.background = new THREE.Color(0x8ecae6);
    }
  }

  /**
   * Loads a cubemap texture from 6 face image paths or a multi-texture configuration and sets it as scene background.
   * Supports optional per-face rotation (in degrees).
   * @param {Array<string|Object>|Object} pathsOrTextures - Array of 6 image paths/configs or textures object mapping face names to paths/configs
   * @returns {Promise<THREE.CubeTexture|null>}
   */
  async loadCubeTexture(pathsOrTextures) {
    if (!pathsOrTextures) {
      return null;
    }

    const extractFaceConfig = (entry) => {
      if (!entry) return { path: '', rotation: 0 };
      if (typeof entry === 'string') return { path: entry, rotation: 0 };
      if (typeof entry === 'object') {
        return {
          path: entry.texture ?? entry.path ?? entry.url ?? entry.file ?? '',
          rotation: Number(entry.rotation ?? entry.rot ?? 0),
        };
      }
      return { path: '', rotation: 0 };
    };

    let faceConfigs = [];
    if (Array.isArray(pathsOrTextures)) {
      faceConfigs = pathsOrTextures.map(extractFaceConfig);
    } else if (typeof pathsOrTextures === 'object') {
      const right = extractFaceConfig(pathsOrTextures.right ?? pathsOrTextures.px ?? pathsOrTextures.posx);
      const left = extractFaceConfig(pathsOrTextures.left ?? pathsOrTextures.nx ?? pathsOrTextures.negx);
      const up = extractFaceConfig(pathsOrTextures.up ?? pathsOrTextures.top ?? pathsOrTextures.py ?? pathsOrTextures.posy);
      const down = extractFaceConfig(pathsOrTextures.down ?? pathsOrTextures.bottom ?? pathsOrTextures.ny ?? pathsOrTextures.negy);
      const front = extractFaceConfig(pathsOrTextures.front ?? pathsOrTextures.pz ?? pathsOrTextures.posz);
      const back = extractFaceConfig(pathsOrTextures.back ?? pathsOrTextures.nz ?? pathsOrTextures.negz);
      faceConfigs = [right, left, up, down, front, back];
    }

    if (faceConfigs.length === 0 || faceConfigs.every((f) => !f.path)) {
      return null;
    }

    const resolvedFaceConfigs = faceConfigs.map((f) => ({
      ...f,
      path: f.path && typeof this.resolveScenePath === 'function' ? this.resolveScenePath(f.path) : f.path,
    }));

    const hasRotations = resolvedFaceConfigs.some((f) => f.rotation !== 0);

    if (!hasRotations && typeof document !== 'undefined') {
      const resolvedPaths = resolvedFaceConfigs.map((f) => f.path);
      const loader = new THREE.CubeTextureLoader();
      const cubeTexture = await loader.loadAsync(resolvedPaths);
      this.scene.background = cubeTexture;
      this.scene.environment = cubeTexture;
      return cubeTexture;
    }

    const loadFace = (faceConfig) => {
      return new Promise((resolve, reject) => {
        if (!faceConfig.path) {
          reject(new Error('Missing face path'));
          return;
        }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const rot = (faceConfig.rotation % 360 + 360) % 360;
          if (rot === 0 || typeof document === 'undefined') {
            resolve(img);
            return;
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (rot === 90 || rot === 270) {
            canvas.width = img.height;
            canvas.height = img.width;
          } else {
            canvas.width = img.width;
            canvas.height = img.height;
          }

          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rot * Math.PI) / 180);
          ctx.drawImage(img, -img.width / 2, -img.height / 2);

          resolve(canvas);
        };
        img.onerror = (err) => reject(err);
        img.src = faceConfig.path;
      });
    };

    const loadedImages = await Promise.all(resolvedFaceConfigs.map(loadFace));
    const cubeTexture = new THREE.CubeTexture(loadedImages);
    cubeTexture.needsUpdate = true;
    this.scene.background = cubeTexture;
    this.scene.environment = cubeTexture;
    return cubeTexture;
  }

  /**
   * Loads a single 2D or HDR equirectangular texture skybox.
   * @param {string} texturePath - Path to texture image or .hdr file
   * @param {Object} [config={}] - Additional texture configuration options
   * @returns {Promise<THREE.Texture|null>}
   */
  async loadTextureSkybox(texturePath, config = {}) {
    if (!texturePath) {
      return null;
    }

    const resolvedPath = typeof this.resolveScenePath === 'function'
      ? this.resolveScenePath(texturePath)
      : texturePath;

    const lowerPath = resolvedPath.toLowerCase();
    const isHdr = lowerPath.endsWith('.hdr') || lowerPath.endsWith('.exr') || config.type === 'hdr';

    let texture = null;
    if (isHdr) {
      const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
      const loader = new HDRLoader();
      texture = await loader.loadAsync(resolvedPath);
    } else {
      const loader = new THREE.TextureLoader();
      texture = await loader.loadAsync(resolvedPath);
    }

    texture.mapping = THREE.EquirectangularReflectionMapping;
    if (config.colorSpace && THREE[config.colorSpace]) {
      texture.colorSpace = THREE[config.colorSpace];
    } else if (isHdr) {
      texture.colorSpace = THREE.SRGBColorSpace;
    }

    this.scene.background = texture;
    if (config.setEnvironment !== false) {
      this.scene.environment = texture;
    }
    return texture;
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
    mesh.renderOrder = -999;
    this.scene.add(mesh);
    this.currentMesh = mesh;
    return mesh;
  }
}
