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
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { assetMetaService } from './AssetMetaService.js';
import { MaterialRenderService } from './MaterialRenderService.js';
import { Mirror } from './Mirror.js';

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
    MaterialRenderService.configureModelMaterials(model, subMeshOverrides, materialRenderType);

    this.assetCache.set(cacheKey, model);
    return model.clone(true);
  }

  /**
   * Loads a GLB/GLTF binary model and applies a consistent material render profile.
   * @param {Object} options - Load options
   * @returns {Promise<THREE.Object3D>} Loaded and configured model scene
   */
  async loadGLBModel({ glbPath, materialRenderType = 'cutout' }) {
    const cacheKey = `${glbPath}|${materialRenderType}`;
    if (this.assetCache.has(cacheKey)) {
      return this.assetCache.get(cacheKey).clone(true);
    }

    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(glbPath);
    const model = gltf.scene || gltf.scenes?.[0];
    if (!model) {
      throw new Error(`GLB model did not contain a scene: ${glbPath}`);
    }

    MaterialRenderService.configureModelMaterials(model, {}, materialRenderType);
    this.assetCache.set(cacheKey, model);
    return model.clone(true);
  }

  /**
   * Loads an FBX model and applies the same material/render configuration as other asset types.
   * @param {Object} options - Load options
   * @returns {Promise<THREE.Object3D>} Loaded and configured FBX scene
   */
  async loadFBXModel({ fbxPath, materialRenderType = 'cutout' }) {
    const cacheKey = `${fbxPath}|${materialRenderType}`;
    if (this.assetCache.has(cacheKey)) {
      return this.assetCache.get(cacheKey).clone(true);
    }

    const loader = new FBXLoader();
    const model = await loader.loadAsync(fbxPath);
    MaterialRenderService.configureModelMaterials(model, {}, materialRenderType);
    this.assetCache.set(cacheKey, model);
    return model.clone(true);
  }

  createPrimitiveMaterial(item, defaultColor = '#8ecae6', defaultRoughness = 0.75, defaultMetalness = 0.15) {
    const materialConfig = item.material && typeof item.material === 'object' ? item.material : null;
    const hasTextureMap = !!(materialConfig && (materialConfig.map || materialConfig.albedoMap || materialConfig.baseColorMap));

    if (!materialConfig) {
      return new THREE.MeshStandardMaterial({
        color: item.color ? new THREE.Color(item.color).getHex() : new THREE.Color(defaultColor).getHex(),
        roughness: item.roughness ?? defaultRoughness,
        metalness: item.metalness ?? defaultMetalness,
      });
    }

    const material = new THREE.MeshStandardMaterial({
      color: hasTextureMap ? 0xffffff : (materialConfig.color ? new THREE.Color(materialConfig.color).getHex() : new THREE.Color(defaultColor).getHex()),
      roughness: materialConfig.roughness ?? item.roughness ?? defaultRoughness,
      metalness: materialConfig.metalness ?? item.metalness ?? defaultMetalness,
    });

    const textureEntries = [
      ['map', materialConfig.map ?? materialConfig.albedoMap ?? materialConfig.baseColorMap],
      ['normalMap', materialConfig.normalMap],
      ['roughnessMap', materialConfig.roughnessMap],
      ['metalnessMap', materialConfig.metalnessMap],
      ['aoMap', materialConfig.aoMap],
      ['displacementMap', materialConfig.displacementMap ?? materialConfig.heightMap],
    ];

    const repeat = Array.isArray(materialConfig.repeat) && materialConfig.repeat.length >= 2
      ? [Number(materialConfig.repeat[0]) || 1, Number(materialConfig.repeat[1]) || 1]
      : [1, 1];

    const loader = new THREE.TextureLoader();
    for (const [mapKey, texturePath] of textureEntries) {
      if (!texturePath) continue;

      const resolvedPath = typeof this.resolveScenePath === 'function'
        ? this.resolveScenePath(texturePath)
        : new URL(texturePath, window.location.origin).toString();

      const texture = loader.load(resolvedPath);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeat[0], repeat[1]);
      material[mapKey] = texture;
    }

    if (hasTextureMap) {
      material.color.setHex(0xffffff);
    }

    if (materialConfig.normalScale) {
      material.normalScale = new THREE.Vector2(
        Array.isArray(materialConfig.normalScale) ? materialConfig.normalScale[0] ?? 1 : materialConfig.normalScale,
        Array.isArray(materialConfig.normalScale) ? materialConfig.normalScale[1] ?? 1 : materialConfig.normalScale
      );
    }

    return material;
  }

  /**
   * Creates a primitive mesh object (floor, box, cube, cylinder, sphere).
   * @param {Object} item - Manifest object item
   * @returns {THREE.Mesh|null} Created mesh
   */
  createPrimitiveMesh(item) {
    const primitiveType = item?.primitiveType ?? item?.type ?? 'box';
    let geometry = null;

    if (primitiveType === 'floor') {
      const size = Array.isArray(item.size) ? item.size : [120, 120];
      geometry = new THREE.PlaneGeometry(size[0] ?? 120, size[1] ?? 120);
    } else if (primitiveType === 'cylinder') {
      geometry = new THREE.CylinderGeometry(
        item.radiusTop ?? 0.2,
        item.radiusBottom ?? 0.2,
        item.height ?? 0.8,
        item.radialSegments ?? 12
      );
    } else if (primitiveType === 'sphere') {
      const radius = Number.isFinite(item.radius)
        ? item.radius
        : Array.isArray(item.size)
          ? Math.max(item.size[0] ?? 1, item.size[1] ?? 1, item.size[2] ?? 1) / 2
          : 0.5;
      const segments = Number.isFinite(item.radialSegments)
        ? item.radialSegments
        : Number.isFinite(item.segments)
          ? item.segments
          : 32;
      geometry = new THREE.SphereGeometry(radius, segments, segments);
    } else {
      const size = Array.isArray(item.size) ? item.size : [1, 1, 1];
      geometry = new THREE.BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
    }

    const materialType = item.materialType ?? item.material;
    const isMirror = Mirror.isMirrorMaterialType(materialType);
    const mesh = isMirror
      ? new Mirror().createReflector(geometry, { color: item.mirrorColor ?? item.color ?? '#9fb7c0' })
      : new THREE.Mesh(geometry, this.createPrimitiveMaterial(item));

    mesh.castShadow = !isMirror;
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

    if (item.shadow && light.shadow) {
      if (Array.isArray(item.shadow.mapSize)) {
        light.shadow.mapSize.set(item.shadow.mapSize[0] ?? 1024, item.shadow.mapSize[1] ?? 1024);
      }

      if (item.shadow.camera) {
        Object.assign(light.shadow.camera, item.shadow.camera);
        light.shadow.camera.updateProjectionMatrix?.();
      }
    }

    return light;
  }
}
