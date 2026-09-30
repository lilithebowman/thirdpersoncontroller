/**
 * SceneLoader.js
 *
 * Class: SceneLoader
 * Purpose: Handles fetching scene manifests, parsing object configurations, loading
 *          OBJ/MTL models with asset caching, setting up lights and primitive meshes,
 *          and managing streamed sub-scenes.
 * SOLID Principles:
 * - Single Responsibility: Solely responsible for manifest parsing and scene asset loading.
 */

import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { assetMetaService } from './AssetMetaService.js';

export class SceneLoader {
  /**
   * Creates a SceneLoader instance.
   * @param {Object} options - Configuration options
   * @param {THREE.Scene} options.scene - Three.js scene
   * @param {Function} options.resolveScenePath - Path resolution callback
   * @param {Function} options.configureMeshCulling - Mesh culling configuration callback
   * @param {Function} options.registerCollider - Collider registration callback
   * @param {Function} options.registerDistanceCullable - Distance culling registration callback
   * @param {Object} [options.debugDisplay] - Debug logging surface
   */
  constructor({
    scene,
    resolveScenePath,
    configureMeshCulling,
    registerCollider,
    registerDistanceCullable,
    debugDisplay = null,
  } = {}) {
    if (!scene) {
      throw new Error('SceneLoader requires a THREE.Scene.');
    }

    this.scene = scene;
    this.resolveScenePath = resolveScenePath;
    this.configureMeshCulling = configureMeshCulling;
    this.registerCollider = registerCollider;
    this.registerDistanceCullable = registerDistanceCullable;
    this.debugDisplay = debugDisplay;

    this.assetCache = new Map();
    this.loadedSubScenePaths = new Set();
    this.sceneStreams = [];
  }

  /**
   * Fetches and parses a scene manifest JSON file.
   * @param {string} manifestPath - Path to manifest
   * @param {string} basePath - Base path for URL resolution
   * @returns {Promise<{manifest: Object, resolvedPath: string}>} Fetched manifest object and resolved path
   */
  async fetchManifest(manifestPath, basePath) {
    const resolvedPath = typeof this.resolveScenePath === 'function'
      ? this.resolveScenePath(manifestPath, basePath)
      : new URL(manifestPath, window.location.origin).toString();

    const response = await fetch(resolvedPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest ${resolvedPath}: ${response.status} ${response.statusText}`);
    }

    const manifest = await response.json();
    return { manifest, resolvedPath };
  }

  /**
   * Converts array to THREE.Vector3 with fallback.
   * @param {Array<number>} values - Input array
   * @param {THREE.Vector3} [fallback=new THREE.Vector3()] - Fallback vector
   * @returns {THREE.Vector3} Resulting Vector3
   */
  toVector3(values, fallback = new THREE.Vector3()) {
    if (!Array.isArray(values) || values.length < 3) {
      return fallback.clone();
    }
    const [x, y, z] = values;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      return fallback.clone();
    }
    return new THREE.Vector3(x, y, z);
  }

  async loadAssetMeta(objPath) {
    if (!objPath) {
      return null;
    }
    const status = await assetMetaService.checkMetaStatus(objPath);
    return status.meta;
  }

  /**
   * Loads an OBJ model with optional MTL materials and caching.
   * @param {Object} options - Load options
   * @returns {Promise<THREE.Object3D>} Loaded and configured model group
   */
  async loadObjModel({ objPath, mtlPath, materialRenderType = 'cutout' }) {
    const cacheKey = `${objPath}|${mtlPath ?? ''}|${materialRenderType}`;
    if (this.assetCache.has(cacheKey)) {
      return this.assetCache.get(cacheKey).clone(true);
    }

    const metaStatus = await assetMetaService.checkMetaStatus(objPath);
    let meta = metaStatus.meta;

    const loader = new OBJLoader();
    if (mtlPath) {
      const mtlLoader = new MTLLoader();
      const mtlMaterial = await mtlLoader.loadAsync(mtlPath);
      mtlMaterial.preload();
      loader.setMaterials(mtlMaterial);
    }

    const model = await loader.loadAsync(objPath);

    // If meta is missing or dirty, collect sub-mesh names and generate meta via service
    if (!metaStatus.exists || metaStatus.dirty) {
      const subMeshNames = [];
      model.traverse((child) => {
        if (child.isMesh && child.name) {
          subMeshNames.push(child.name);
        }
      });
      meta = await assetMetaService.generateMeta(objPath, subMeshNames);
    }

    const subMeshOverrides = meta?.subMeshOverrides ?? {};

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const override = subMeshOverrides[child.name] ?? {};
      child.frustumCulled = false;
      child.castShadow = override.castShadow ?? true;
      child.receiveShadow = override.receiveShadow ?? true;
      if (override.visible !== undefined) {
        child.visible = override.visible;
      }

      const renderType = override.materialRenderType ?? materialRenderType;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material) {
            if (renderType === 'transparent') {
              material.transparent = true;
              material.depthWrite = false;
            } else {
                material.alphaTest = 0.5;
            }
          }
        });
      }
    });

    this.assetCache.set(cacheKey, model);
    return model.clone(true);
  }

  /**
   * Creates a primitive mesh object (floor, box, cube, cylinder).
   * @param {Object} item - Manifest object item
   * @returns {THREE.Mesh|null} Created mesh
   */
  createPrimitiveMesh(item) {
    const material = new THREE.MeshStandardMaterial({
      color: item.color ? new THREE.Color(item.color).getHex() : 0x8ecae6,
      roughness: item.roughness ?? 0.75,
      metalness: item.metalness ?? 0.15,
    });
    let geometry = null;

    if (item.type === 'floor') {
      const size = Array.isArray(item.size) ? item.size : [120, 120];
      geometry = new THREE.PlaneGeometry(size[0] ?? 120, size[1] ?? 120);
    } else if (item.type === 'cylinder') {
      geometry = new THREE.CylinderGeometry(
        item.radiusTop ?? 0.2,
        item.radiusBottom ?? 0.2,
        item.height ?? 0.8,
        item.radialSegments ?? 12
      );
    } else {
      const size = Array.isArray(item.size) ? item.size : [1, 1, 1];
      geometry = new THREE.BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (item.type === 'floor') {
      mesh.rotation.x = -Math.PI / 2;
    }

    return mesh;
  }

  /**
   * Creates a light object from manifest configuration.
   * @param {Object} item - Manifest light item
   * @returns {THREE.Light|null} Created light
   */
  createManifestLight(item) {
    const lightType = (item.lightType ?? 'directional').toLowerCase();
    let light = null;

    if (lightType === 'hemisphere') {
      light = new THREE.HemisphereLight(item.color ?? '#ffffff', item.groundColor ?? '#243b3a', item.intensity ?? 1);
    } else if (lightType === 'ambient') {
      light = new THREE.AmbientLight(item.color ?? '#ffffff', item.intensity ?? 1);
    } else {
      light = new THREE.DirectionalLight(item.color ?? '#ffffff', item.intensity ?? 1);
      light.castShadow = item.castShadow === true;
    }

    return light;
  }
}
