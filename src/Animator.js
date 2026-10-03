/**
* Animator.js
*
* Responsibilities:
* - Owns player model and animation configuration.
* - Loads FBX rigs and animation clips.
* - Validates animation compatibility against the player skeleton.
* - Removes root motion from imported clips when desired.
* - Creates animation mixers/actions for runtime player instances.
* - Performs smooth state blending between idle, walk, and jump states.
*/

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

export class Animator {
  /**
   * @param {Object} options
   * @param {Function} options.resolveScenePath
   * Converts asset-relative paths into loadable URLs.
   * @param {Function} options.configureMeshCulling
   * Optional callback used to apply mesh-culling configuration.
   * @param {Object|null} options.debugDisplay
   * Optional logging surface supporting Log() and LogWarning().
   */
  constructor({ resolveScenePath, configureMeshCulling, debugDisplay = null } = {}) {
    if (typeof resolveScenePath !== 'function') {
      throw new Error('Animator requires resolveScenePath callback.');
    }

    this.resolveScenePath = resolveScenePath;
    this.configureMeshCulling = typeof configureMeshCulling === 'function' ? configureMeshCulling : () => {};
    this.debugDisplay = debugDisplay;

    /**
     * Template rig used as the source model.
     * Each player instance receives a cloned copy.
     */
    this.modelTemplate = null;

    /**
     * Prepared animation clips that have already been
     * mapped and validated against the player rig.
     */
    this.walkClip = null;
    this.idleClip = null;
    this.jumpClip = null;
    this.runClip = null;
    this.fallClip = null;
    this.landClip = null;
    this.sceneAnimationClips = {
      walkClip: null,
      idleClip: null,
      jumpClip: null,
      runClip: null,
      fallClip: null,
      landClip: null,
    };

    /**
     * Runtime animation state for a spawned player visual.
     */
    this.mixer = null;
    this.walkAction = null;
    this.idleAction = null;
    this.jumpAction = null;
    this.runAction = null;
    this.fallAction = null;
    this.landAction = null;

    /**
     * Default player animation/model configuration.
     * Can be overridden through applyModelConfig().
     */
    this.modelConfig = {
      rigPath: '/animations/Action%20Adventure%20Pack/X%20Bot.fbx',
      walkPath: '/animations/Action%20Adventure%20Pack/walking.fbx',
      idlePath: '/animations/Action%20Adventure%20Pack/idle.fbx',
      jumpPath: '/animations/Action%20Adventure%20Pack/jumping up.fbx',
      runPath: '/animations/Action%20Adventure%20Pack/running.fbx',
      fallPath: '/animations/Action%20Adventure%20Pack/falling idle.fbx',
      landPath: '/animations/Action%20Adventure%20Pack/hard landing.fbx',
      modelScale: new THREE.Vector3(0.01, 0.01, 0.01),
      modelRotationDegrees: new THREE.Vector3(0, 0, 0),
      modelOffset: new THREE.Vector3(0, 0, 0),
      walkClipName: null,
      idleClipName: null,
      jumpClipName: null,
      runClipName: null,
      fallClipName: null,
      landClipName: null,
      resolvedBasePath: '/scene-manifest.json',
    };
  }

  /**
   * Write an informational message to the debug display.
   */
  setDebugDisplay(debugDisplay) {
    this.debugDisplay = debugDisplay;
  }

  /**
   * Log an informational message to the debug display.
   */
  log(message) {
    if (this.debugDisplay && typeof this.debugDisplay.Log === 'function') {
      this.debugDisplay.Log(message);
    }
  }

  /**
   * Log a warning message to the debug display.
   */
  warn(message) {
    if (this.debugDisplay && typeof this.debugDisplay.LogWarning === 'function') {
      this.debugDisplay.LogWarning(message);
    }
  }

  /**
   * toVector3 converts an array of values to a THREE.Vector3 instance.
   * If the input is invalid, it returns a clone of the provided fallback vector.
   * @param {Array<number>} values - The array of values to convert.
   * @param {THREE.Vector3} [fallback=new THREE.Vector3()] - The fallback vector to use if the input is invalid.
   * @returns {THREE.Vector3} The resulting THREE.Vector3 instance.
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

  /**
   * Apply the provided model configuration to the animator, resolving paths and setting default values as needed.
   * @param {Object} modelConfig - The configuration object for the model.
   * @param {string} basePath - The base path for resolving model assets.
   */
  applyModelConfig(modelConfig = {}, basePath = '/scene-manifest.json') {
    const configuredPath = typeof modelConfig.path === 'string' && modelConfig.path.trim()
      ? modelConfig.path.trim()
      : '/animations/Action%20Adventure%20Pack/X%20Bot.fbx';

    const configuredRigPath = typeof modelConfig.rigPath === 'string' && modelConfig.rigPath.trim()
      ? modelConfig.rigPath.trim()
      : configuredPath;

    const configuredWalkPath = typeof modelConfig.walkPath === 'string' && modelConfig.walkPath.trim()
      ? modelConfig.walkPath.trim()
      : '/animations/Action%20Adventure%20Pack/walking.fbx';

    const configuredIdlePath = typeof modelConfig.idlePath === 'string' && modelConfig.idlePath.trim()
      ? modelConfig.idlePath.trim()
      : '/animations/Action%20Adventure%20Pack/idle.fbx';

    const configuredJumpPath = typeof modelConfig.jumpPath === 'string' && modelConfig.jumpPath.trim()
      ? modelConfig.jumpPath.trim()
      : '/animations/Action%20Adventure%20Pack/jumping up.fbx';
    const configuredRunPath = typeof modelConfig.runPath === 'string' && modelConfig.runPath.trim()
      ? modelConfig.runPath.trim()
      : '/animations/Action%20Adventure%20Pack/running.fbx';
    const configuredFallPath = typeof modelConfig.fallPath === 'string' && modelConfig.fallPath.trim()
      ? modelConfig.fallPath.trim()
      : '/animations/Action%20Adventure%20Pack/falling idle.fbx';
    const configuredLandPath = typeof modelConfig.landPath === 'string' && modelConfig.landPath.trim()
      ? modelConfig.landPath.trim()
      : '/animations/Action%20Adventure%20Pack/hard landing.fbx';

    /* Apply the resolved model configuration to the animator. */
    this.modelConfig = {
      rigPath: configuredRigPath,
      walkPath: configuredWalkPath,
      idlePath: configuredIdlePath,
      jumpPath: configuredJumpPath,
      runPath: configuredRunPath,
      fallPath: configuredFallPath,
      landPath: configuredLandPath,
      modelScale: this.toVector3(modelConfig.scale, new THREE.Vector3(0.01, 0.01, 0.01)),
      modelRotationDegrees: this.toVector3(modelConfig.rotation, new THREE.Vector3(0, 0, 0)),
      modelOffset: this.toVector3(modelConfig.offset, new THREE.Vector3(0, 0, 0)),
      walkClipName: typeof modelConfig.walkClipName === 'string' && modelConfig.walkClipName.trim()
        ? modelConfig.walkClipName.trim()
        : null,
      idleClipName: typeof modelConfig.idleClipName === 'string' && modelConfig.idleClipName.trim()
        ? modelConfig.idleClipName.trim()
        : null,
      jumpClipName: typeof modelConfig.jumpClipName === 'string' && modelConfig.jumpClipName.trim()
        ? modelConfig.jumpClipName.trim()
        : null,
      runClipName: typeof modelConfig.runClipName === 'string' && modelConfig.runClipName.trim()
        ? modelConfig.runClipName.trim()
        : null,
      fallClipName: typeof modelConfig.fallClipName === 'string' && modelConfig.fallClipName.trim()
        ? modelConfig.fallClipName.trim()
        : null,
      landClipName: typeof modelConfig.landClipName === 'string' && modelConfig.landClipName.trim()
        ? modelConfig.landClipName.trim()
        : null,
      resolvedBasePath: basePath,
    };
  }

  /**
   * Get the resolved model configuration for this animator instance.
   * @returns {Object} The resolved model configuration.
   */
  getModelConfig() {
    return this.modelConfig;
  }

  /**
   * Create a fallback visual representation when model template is unavailable.
   * @returns {THREE.Group} Fallback character group
   */
  createFallbackVisual() {
    const visual = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.65, metalness: 0.15 })
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
   * Create a character visual and animation mixer for remote or secondary instances.
   * @param {Function} fallbackFactory - Fallback factory if modelTemplate is missing
   * @returns {Object} Object containing visual, mixer, walkAction, idleAction, jumpAction
   */
  createRemoteVisual(fallbackFactory) {
    return this.createRemoteVisualFromRoot(
      this.modelTemplate,
      fallbackFactory,
      { useCustomRigAnimations: true }
    );
  }

  createRemoteVisualFromRoot(root, fallbackFactory, { useCustomRigAnimations = true } = {}) {
    const visual = root
      ? cloneSkinned(root)
      : (typeof fallbackFactory === 'function' ? fallbackFactory() : this.createFallbackVisual());

    const { modelScale, modelRotationDegrees, modelOffset } = this.modelConfig;
    visual.scale.copy(modelScale);
    visual.rotation.set(
      THREE.MathUtils.degToRad(modelRotationDegrees.x),
      THREE.MathUtils.degToRad(modelRotationDegrees.y),
      THREE.MathUtils.degToRad(modelRotationDegrees.z)
    );
    visual.position.copy(modelOffset);

    let mixer = null;
    let walkAction = null;
    let idleAction = null;
    let jumpAction = null;
    let runAction = null;
    let fallAction = null;
    let landAction = null;

    const clips = useCustomRigAnimations
      ? {
          walkClip: this.walkClip,
          idleClip: this.idleClip,
          jumpClip: this.jumpClip,
          runClip: this.runClip,
          fallClip: this.fallClip,
          landClip: this.landClip,
        }
      : { walkClip: null, idleClip: null, jumpClip: null, runClip: null, fallClip: null, landClip: null };

    if (clips.walkClip || clips.idleClip || clips.jumpClip || clips.runClip || clips.fallClip || clips.landClip) {
      mixer = new THREE.AnimationMixer(visual);

      if (clips.walkClip) {
        walkAction = mixer.clipAction(clips.walkClip);
        walkAction.play();
        walkAction.enabled = true;
        walkAction.setEffectiveWeight(0);
      }

      if (clips.idleClip) {
        idleAction = mixer.clipAction(clips.idleClip);
        idleAction.play();
        idleAction.enabled = true;
        idleAction.setEffectiveWeight(1);
      }

      if (clips.jumpClip) {
        jumpAction = mixer.clipAction(clips.jumpClip);
        jumpAction.play();
        jumpAction.enabled = true;
        jumpAction.setEffectiveWeight(0);
        jumpAction.clampWhenFinished = false;
      }

      if (clips.runClip) {
        runAction = mixer.clipAction(clips.runClip);
        runAction.play();
        runAction.enabled = true;
        runAction.setEffectiveWeight(0);
      }

      if (clips.fallClip) {
        fallAction = mixer.clipAction(clips.fallClip);
        fallAction.play();
        fallAction.enabled = true;
        fallAction.setEffectiveWeight(0);
      }

      if (clips.landClip) {
        landAction = mixer.clipAction(clips.landClip);
        landAction.play();
        landAction.enabled = true;
        landAction.setEffectiveWeight(0);
      }
    }

    return { visual, mixer, walkAction, idleAction, jumpAction, runAction, fallAction, landAction };
  }

  resolveAnimationClips(asset) {
    if (!asset || typeof asset !== 'object') {
      return [];
    }

    if (Array.isArray(asset.animations)) {
      return asset.animations;
    }

    if (asset.scene && Array.isArray(asset.scene.animations)) {
      return asset.scene.animations;
    }

    return [];
  }

  prepareSceneAnimationClips(root, fallbackClips = this.sceneAnimationClips) {
    if (!root || typeof root.traverse !== 'function') {
      return { walkClip: null, idleClip: null, jumpClip: null };
    }

    const rigNodeNames = this.collectRigNodeNames(root);
    const rigNodeNameMap = this.collectRigNodeNameMap(root);
    const rigBoneNames = this.collectRigBoneNames(root);

    return {
      walkClip: this.prepareClipForRig(fallbackClips?.walkClip ?? null, rigNodeNames, rigNodeNameMap, 'scene walk fallback', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
        root,
      }),
      idleClip: this.prepareClipForRig(fallbackClips?.idleClip ?? null, rigNodeNames, rigNodeNameMap, 'scene idle fallback', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
        root,
      }),
      jumpClip: this.prepareClipForRig(fallbackClips?.jumpClip ?? null, rigNodeNames, rigNodeNameMap, 'scene jump fallback', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
        minQuaternionTracks: 8,
        root,
      }),
    };
  }

  detectHumanoidRig(root) {
    if (!root || typeof root.traverse !== 'function') {
      return false;
    }

    const boneNames = [];
    root.traverse((child) => {
      if (!child?.isBone || !child.name) {
        return;
      }
      const canonical = this.canonicalizeNodeName(child.name);
      if (canonical) {
        boneNames.push(canonical);
      }
    });

    const humanoidKeywords = ['head', 'neck', 'spine', 'pelvis', 'hip', 'chest', 'shoulder', 'arm', 'forearm', 'hand', 'thigh', 'shin', 'calf', 'foot'];
    const matches = new Set();
    for (const boneName of boneNames) {
      for (const keyword of humanoidKeywords) {
        if (boneName.includes(keyword)) {
          matches.add(keyword);
        }
      }
    }

    return matches.size >= 3;
  }

  canonicalizeNodeName(name) {
    if (typeof name !== 'string' || name.length === 0) {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const segments = trimmed.split(/[:/\\]/).filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? trimmed;
    return lastSegment.toLowerCase().replace(/[^a-z0-9]/g, '') || null;
  }

  async applyCustomPlayerModel(playerModel) {
    if (!playerModel || !playerModel.dataUrl) {
      return null;
    }

    const extension = playerModel.extension.toLowerCase();
    let modelAsset = null;

    try {
      const response = await fetch(playerModel.dataUrl);
      const arrayBuffer = await response.arrayBuffer();

      if (extension === '.fbx') {
        const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
        const loader = new FBXLoader();
        modelAsset = loader.parse(arrayBuffer);
      } else if (extension === '.glb' || extension === '.gltf') {
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
        const loader = new GLTFLoader();
        const gltf = await loader.parseAsync(arrayBuffer, '');
        modelAsset = gltf.scene || gltf.scenes?.[0] || gltf;
        if (modelAsset && Array.isArray(gltf.animations)) {
          modelAsset.animations = gltf.animations;
        }
      } else if (extension === '.obj') {
        const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
        const loader = new OBJLoader();
        modelAsset = loader.parse(new TextDecoder().decode(arrayBuffer));
      }
    } catch (error) {
      this.warn(`Failed to load custom player model ${playerModel.fileName}: ${error?.message ?? error}`);
      return null;
    }

    const root = modelAsset && typeof modelAsset.traverse === 'function' ? modelAsset : null;
    if (!root) {
      return null;
    }

    this.modelTemplate = root;
    this.modelConfig.rigPath = playerModel.dataUrl;
    this.modelConfig.customPlayerModel = playerModel.toJSON();
    this.walkClip = null;
    this.idleClip = null;
    this.jumpClip = null;

    if (!Array.isArray(root.animations)) {
      const animationClips = this.resolveAnimationClips(root);
      if (animationClips.length > 0) {
        root.animations = animationClips;
      }
    }

    this.applyPlayerMeshSettings(root);
    this.configureMeshCulling(root);

    const hasHumanoidRig = this.detectHumanoidRig(root);
    playerModel.hasHumanoidRig = hasHumanoidRig;
    playerModel.isRigged = hasHumanoidRig;

    if (!hasHumanoidRig) {
      this.log(`Loaded custom player model ${playerModel.fileName} without a humanoid rig; animation will remain disabled.`);
      return root;
    }

    const rigNodeNames = this.collectRigNodeNames(root);
    const rigNodeNameMap = this.collectRigNodeNameMap(root);
    const rigBoneNames = this.collectRigBoneNames(root);
    const rigCanonicals = this.collectCanonicalBoneNames(root);
    const clips = this.resolveAnimationClips(root);

    this.walkClip = this.prepareClipForRig(this.findAnimationClip(clips, null, /walk/i), rigNodeNames, rigNodeNameMap, 'custom walk', {
      preferBoneTracks: true,
      rigBoneNames,
      stripRootPosition: true,
      root,
    });
    this.idleClip = this.prepareClipForRig(this.findAnimationClip(clips, null, /idle/i), rigNodeNames, rigNodeNameMap, 'custom idle', {
      preferBoneTracks: true,
      rigBoneNames,
      stripRootPosition: true,
      root,
    });
    this.jumpClip = this.prepareClipForRig(this.findAnimationClip(clips, null, /jump/i), rigNodeNames, rigNodeNameMap, 'custom jump', {
      preferBoneTracks: true,
      rigBoneNames,
      stripRootPosition: true,
      minQuaternionTracks: 8,
      root,
    });

    const sceneFallbacks = this.prepareSceneAnimationClips(root, this.sceneAnimationClips);
    if (!this.walkClip && sceneFallbacks.walkClip) {
      this.walkClip = sceneFallbacks.walkClip;
    }
    if (!this.idleClip && sceneFallbacks.idleClip) {
      this.idleClip = sceneFallbacks.idleClip;
    }
    if (!this.jumpClip && sceneFallbacks.jumpClip) {
      this.jumpClip = sceneFallbacks.jumpClip;
    }

    if (!this.walkClip && this.idleClip) {
      this.walkClip = this.idleClip;
    }
    if (!this.idleClip && this.walkClip) {
      this.idleClip = this.walkClip;
    }
    if (!this.jumpClip && this.walkClip) {
      this.jumpClip = this.walkClip;
    }

    this.log(`Custom player rig ${playerModel.fileName} loaded with ${this.walkClip ? 'walk' : 'no-walk'} / ${this.idleClip ? 'idle' : 'no-idle'} / ${this.jumpClip ? 'jump' : 'no-jump'} clips.`);
    return root;
  }

  /**
   * Create the visual representation of the player character, using the model template if available, or falling back to a provided factory function.
   * @param {Function} fallbackFactory - A factory function to create a fallback visual if the model template is not available.
   * @returns {THREE.Object3D} The created player visual.
   */
  createPlayerVisual(fallbackFactory) {
    const res = this.createRemoteVisual(fallbackFactory);
    this.mixer = res.mixer;
    this.walkAction = res.walkAction;
    this.idleAction = res.idleAction;
    this.jumpAction = res.jumpAction;
    this.runAction = res.runAction;
    this.fallAction = res.fallAction;
    this.landAction = res.landAction;
    return res.visual;
  }

  async preload() {
    this.modelTemplate = null;
    this.walkClip = null;
    this.idleClip = null;
    this.jumpClip = null;
    this.runClip = null;
    this.fallClip = null;
    this.landClip = null;

    const {
      rigPath,
      walkPath,
      idlePath,
      jumpPath,
      runPath,
      fallPath,
      landPath,
      resolvedBasePath,
      walkClipName,
      idleClipName,
      jumpClipName,
      runClipName,
      fallClipName,
      landClipName,
    } = this.modelConfig;

    if (!rigPath) {
      return;
    }

    try {
      const loader = new FBXLoader();
      const defaultRigPath = '/animations/Action%20Adventure%20Pack/X%20Bot.fbx';

      let { asset: rigAsset } = await this.loadFbxAsset(loader, rigPath, resolvedBasePath);
      if (!this.hasRenderableGeometry(rigAsset)) {
        this.warn(`Rig asset ${rigPath} has no renderable meshes. Trying fallback rig ${defaultRigPath}.`);
        const fallbackLoad = await this.loadFbxAsset(loader, defaultRigPath, resolvedBasePath);
        rigAsset = fallbackLoad.asset;
      }

      if (this.hasRenderableGeometry(rigAsset)) {
        this.applyPlayerMeshSettings(rigAsset);
        this.configureMeshCulling(rigAsset);
        this.modelTemplate = rigAsset;
      }

      const rigNodeNames = this.collectRigNodeNames(rigAsset);
      const rigNodeNameMap = this.collectRigNodeNameMap(rigAsset);
      const rigBoneNames = this.collectRigBoneNames(rigAsset);
      const rigCanonicalBoneNames = this.collectCanonicalBoneNames(rigAsset);

      const rigClips = Array.isArray(rigAsset.animations) ? rigAsset.animations : [];
      const rigWalkClip = this.findAnimationClip(rigClips, walkClipName, /walk/i);
      const rigIdleClip = this.findAnimationClip(rigClips, idleClipName, /idle/i);
      const rigJumpClip = this.findAnimationClip(rigClips, jumpClipName, /jump/i);
      const rigRunClip = this.findAnimationClip(rigClips, runClipName, /run|sprint/i);
      const rigFallClip = this.findAnimationClip(rigClips, fallClipName, /fall|drop/i);
      const rigLandClip = this.findAnimationClip(rigClips, landClipName, /land|landing|hard/i);

      this.walkClip = this.prepareClipForRig(rigWalkClip, rigNodeNames, rigNodeNameMap, 'rig walk', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });

      this.idleClip = this.prepareClipForRig(rigIdleClip, rigNodeNames, rigNodeNameMap, 'rig idle', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });

      this.jumpClip = this.prepareClipForRig(rigJumpClip, rigNodeNames, rigNodeNameMap, 'rig jump', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
        minQuaternionTracks: 8,
      });

      this.runClip = this.prepareClipForRig(rigRunClip, rigNodeNames, rigNodeNameMap, 'rig run', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });

      this.fallClip = this.prepareClipForRig(rigFallClip, rigNodeNames, rigNodeNameMap, 'rig fall', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });

      this.landClip = this.prepareClipForRig(rigLandClip, rigNodeNames, rigNodeNameMap, 'rig land', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });

      if (walkPath) {
        try {
          const walkAsset = await this.loadFbxAsset(loader, walkPath, resolvedBasePath);
          const walkClips = Array.isArray(walkAsset.asset.animations) ? walkAsset.asset.animations : [];
          const externalWalkClip = this.findAnimationClip(walkClips, walkClipName, /walk/i);
          const preparedWalkClip = this.prepareClipForRig(externalWalkClip, rigNodeNames, rigNodeNameMap, 'external walk', {
            preferBoneTracks: true,
            rigBoneNames,
            stripRootPosition: true,
          });
          if (preparedWalkClip) {
            this.walkClip = preparedWalkClip;
          }
        } catch (walkError) {
          this.warn(`Failed to load walking animation ${walkPath}. ${walkError?.message ?? walkError}`);
        }
      }

      if (idlePath) {
        try {
          const idleAsset = await this.loadFbxAsset(loader, idlePath, resolvedBasePath);
          const idleClips = Array.isArray(idleAsset.asset.animations) ? idleAsset.asset.animations : [];
          const externalIdleClip = this.findAnimationClip(idleClips, idleClipName, /idle/i);
          const preparedIdleClip = this.prepareClipForRig(externalIdleClip, rigNodeNames, rigNodeNameMap, 'external idle', {
            preferBoneTracks: true,
            rigBoneNames,
            stripRootPosition: true,
          });
          if (preparedIdleClip) {
            this.idleClip = preparedIdleClip;
          }
        } catch (idleError) {
          this.warn(`Failed to load idle animation ${idlePath}. ${idleError?.message ?? idleError}`);
        }
      }

      if (jumpPath) {
        try {
          const jumpAsset = await this.loadFbxAsset(loader, jumpPath, resolvedBasePath);
          const jumpCanonicalBoneNames = this.collectCanonicalBoneNames(jumpAsset.asset);
          const jumpBoneOverlap = this.computeSetOverlapRatio(jumpCanonicalBoneNames, rigCanonicalBoneNames);

          if (jumpBoneOverlap < 0.45) {
            this.warn(`Rejected jump asset ${jumpPath}: skeleton overlap ${(jumpBoneOverlap * 100).toFixed(1)}% is below 45%.`);
          }

          const jumpClips = Array.isArray(jumpAsset.asset.animations) ? jumpAsset.asset.animations : [];
          const externalJumpClip = this.findAnimationClip(jumpClips, jumpClipName, /jump/i);
          if (jumpBoneOverlap >= 0.45) {
            const preparedJumpClip = this.prepareClipForRig(externalJumpClip, rigNodeNames, rigNodeNameMap, 'external jump', {
              preferBoneTracks: true,
              rigBoneNames,
              stripRootPosition: true,
              minQuaternionTracks: 8,
            });
            if (preparedJumpClip) {
              this.jumpClip = preparedJumpClip;
            }
          }
        } catch (jumpError) {
          this.warn(`Failed to load jump animation ${jumpPath}. ${jumpError?.message ?? jumpError}`);
        }
      }

      const externalStateLoads = [
        { key: 'runClip', path: runPath, name: runClipName, pattern: /run|sprint/i, warning: `run animation ${runPath}` },
        { key: 'fallClip', path: fallPath, name: fallClipName, pattern: /fall|drop/i, warning: `fall animation ${fallPath}` },
        { key: 'landClip', path: landPath, name: landClipName, pattern: /land|landing|hard/i, warning: `landing animation ${landPath}` },
      ];

      for (const stateLoad of externalStateLoads) {
        if (!stateLoad.path) {
          continue;
        }
        try {
          const stateAsset = await this.loadFbxAsset(loader, stateLoad.path, resolvedBasePath);
          const clips = Array.isArray(stateAsset.asset.animations) ? stateAsset.asset.animations : [];
          const externalClip = this.findAnimationClip(clips, stateLoad.name, stateLoad.pattern);
          const preparedClip = this.prepareClipForRig(externalClip, rigNodeNames, rigNodeNameMap, `external ${stateLoad.key}`, {
            preferBoneTracks: true,
            rigBoneNames,
            stripRootPosition: true,
            minQuaternionTracks: 8,
          });
          if (preparedClip) {
            this[stateLoad.key] = preparedClip;
          }
        } catch (error) {
          this.warn(`Failed to load ${stateLoad.warning}. ${error?.message ?? error}`);
        }
      }

      if (!this.walkClip && this.idleClip) {
        this.walkClip = this.idleClip;
      }

      if (!this.idleClip && this.walkClip) {
        this.idleClip = this.walkClip;
      }

      if (!this.jumpClip && this.walkClip) {
        this.jumpClip = this.walkClip;
      }

      if (!this.runClip && this.walkClip) {
        this.runClip = this.walkClip;
      }

      if (!this.fallClip && this.jumpClip) {
        this.fallClip = this.jumpClip;
      }

      if (!this.landClip && this.jumpClip) {
        this.landClip = this.jumpClip;
      }

      this.log(`Player clips: walk=${this.walkClip?.name ?? 'none'}, idle=${this.idleClip?.name ?? 'none'}, jump=${this.jumpClip?.name ?? 'none'}, run=${this.runClip?.name ?? 'none'}, fall=${this.fallClip?.name ?? 'none'}, land=${this.landClip?.name ?? 'none'}`);

      this.sceneAnimationClips = {
        walkClip: this.walkClip,
        idleClip: this.idleClip,
        jumpClip: this.jumpClip,
        runClip: this.runClip,
        fallClip: this.fallClip,
        landClip: this.landClip,
      };

      if (!this.modelTemplate) {
        this.warn('No renderable meshes found for player rig. Falling back to primitive avatar.');
      } else {
        this.log(`Loaded player rig ${rigPath}.`);
      }
    } catch (error) {
      this.warn(`Failed to load player rig ${rigPath}. Falling back to primitive avatar. ${error?.message ?? error}`);
    }
  }

  findAnimationClip(clips, preferredName, fallbackNamePattern) {
    if (!Array.isArray(clips) || clips.length === 0) {
      return null;
    }

    if (preferredName) {
      const namedClip = THREE.AnimationClip.findByName(clips, preferredName);
      if (namedClip) {
        return namedClip;
      }
    }

    if (fallbackNamePattern) {
      const patternClip = clips.find((clip) => fallbackNamePattern.test(clip?.name ?? ''));
      if (patternClip) {
        return patternClip;
      }
    }

    return clips[0];
  }

  extractTrackTargetName(trackName) {
    if (typeof trackName !== 'string' || trackName.length === 0) {
      return null;
    }

    const firstDot = trackName.indexOf('.');
    if (firstDot <= 0) {
      return null;
    }

    return trackName.slice(0, firstDot);
  }

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
    const canonical = base.toLowerCase().replace(/[^a-z0-9]/g, '');
    return canonical || null;
  }

  inferBoneRole(name) {
    const canonical = this.canonicalizeNodeName(name);
    if (!canonical) {
      return null;
    }

    const normalized = canonical.replace(/_/g, '');
    const roleMap = [
      { role: 'hips', keywords: ['hips', 'hip', 'pelvis', 'root', 'rootbone'] },
      { role: 'spine', keywords: ['spine', 'vertebra', 'waist'] },
      { role: 'chest', keywords: ['chest', 'breast', 'torso', 'upperchest', 'rib'] },
      { role: 'neck', keywords: ['neck', 'cervical'] },
      { role: 'head', keywords: ['head', 'skull', 'face', 'jaw'] },
      { role: 'upperarm', keywords: ['upperarm', 'shoulder', 'clavicle', 'humerus', 'arm'] },
      { role: 'lowerarm', keywords: ['lowerarm', 'forearm', 'elbow', 'ulna', 'radius'] },
      { role: 'hand', keywords: ['hand', 'wrist', 'palm'] },
      { role: 'upperleg', keywords: ['upperleg', 'upperthigh', 'thigh', 'femur', 'leg'] },
      { role: 'lowerleg', keywords: ['lowerleg', 'shin', 'calf', 'tibia', 'fibula', 'knee'] },
      { role: 'foot', keywords: ['foot', 'feet', 'toe', 'ankle'] },
      { role: 'finger', keywords: ['index', 'middle', 'ring', 'pinky', 'thumb', 'finger'] },
    ];

    let bestRole = null;
    let bestScore = 0;

    for (const entry of roleMap) {
      const score = entry.keywords.reduce((total, keyword) => {
        if (!normalized.includes(keyword)) {
          return total;
        }
        return total + keyword.length;
      }, 0);
      if (score > bestScore) {
        bestRole = entry.role;
        bestScore = score;
      }
    }

    return bestScore > 0 ? bestRole : null;
  }

  inferBoneSide(name) {
    const canonical = this.canonicalizeNodeName(name);
    if (!canonical) {
      return 'center';
    }

    const normalized = canonical.replace(/_/g, '');

    if (normalized.includes('left')) {
      return 'left';
    }
    if (normalized.includes('right')) {
      return 'right';
    }

    const sideSuffix = normalized.match(/(?:^|[a-z])([lr])$/);
    if (sideSuffix) {
      return sideSuffix[1] === 'l' ? 'left' : 'right';
    }

    return 'center';
  }

  findRootBone(root) {
    if (!root || typeof root.traverse !== 'function') {
      return null;
    }

    let bestCandidate = null;
    let bestDepth = Number.POSITIVE_INFINITY;
    let bestScore = -1;

    root.traverse((child) => {
      if (!child?.isBone || !child.name) {
        return;
      }

      const role = this.inferBoneRole(child.name);
      const depth = this.computeBoneDepth(root, child);
      const score = role === 'hips' ? 10 : role === 'chest' ? 6 : role === 'head' ? 2 : 0;

      if (score > bestScore || (score === bestScore && depth < bestDepth)) {
        bestScore = score;
        bestDepth = depth;
        bestCandidate = child;
      }
    });

    return bestCandidate;
  }

  computeBoneDepth(root, bone) {
    if (!root || !bone || !bone.parent) {
      return 0;
    }

    let depth = 0;
    let current = bone;
    while (current && current !== root) {
      depth += 1;
      current = current.parent;
    }
    return depth;
  }

  collectRigNodeNames(root) {
    const names = new Set();
    if (!root || typeof root.traverse !== 'function') {
      return names;
    }

    root.traverse((child) => {
      if (child?.name) {
        names.add(child.name);
      }
    });

    return names;
  }

  collectRigNodeNameMap(root) {
    const canonicalMap = new Map();
    if (!root || typeof root.traverse !== 'function') {
      return canonicalMap;
    }

    root.traverse((child) => {
      const canonical = this.canonicalizeNodeName(child?.name);
      if (!canonical || canonicalMap.has(canonical) || !child?.name) {
        return;
      }

      canonicalMap.set(canonical, child.name);
    });

    return canonicalMap;
  }

  collectRigBoneNames(root) {
    const boneNames = new Set();
    if (!root || typeof root.traverse !== 'function') {
      return boneNames;
    }

    root.traverse((child) => {
      if (child?.isBone && child?.name) {
        boneNames.add(child.name);
      }
    });

    return boneNames;
  }

  collectCanonicalBoneNames(root) {
    const names = new Set();
    if (!root || typeof root.traverse !== 'function') {
      return names;
    }

    root.traverse((child) => {
      if (!child?.isBone || !child?.name) {
        return;
      }

      const canonical = this.canonicalizeNodeName(child.name);
      if (canonical) {
        names.add(canonical);
      }
    });

    return names;
  }

  computeSetOverlapRatio(sourceSet, targetSet) {
    if (!(sourceSet instanceof Set) || sourceSet.size === 0 || !(targetSet instanceof Set) || targetSet.size === 0) {
      return 0;
    }

    let intersection = 0;
    for (const entry of sourceSet) {
      if (targetSet.has(entry)) {
        intersection += 1;
      }
    }

    return intersection / Math.max(sourceSet.size, 1);
  }

  getRootMotionTrackNames(clip) {
    if (!clip || !Array.isArray(clip.tracks)) {
      return new Set();
    }

    const positionTracks = clip.tracks.filter((track) => {
      if (!track?.name || typeof track.name !== 'string') {
        return false;
      }

      return track.name.includes('.position');
    });

    if (positionTracks.length === 0) {
      return new Set();
    }

    const preferredRootTargets = ['root', 'hips', 'pelvis', 'armature'];
    const rootedTargets = new Set();
    for (const track of positionTracks) {
      const targetName = this.extractTrackTargetName(track.name);
      const canonical = this.canonicalizeNodeName(targetName);
      if (!canonical) {
        continue;
      }

      const isPreferred = preferredRootTargets.some((entry) => canonical.includes(entry));
      if (isPreferred) {
        rootedTargets.add(targetName);
      }
    }

    if (rootedTargets.size === 0) {
      const fallbackTarget = this.extractTrackTargetName(positionTracks[0].name);
      if (fallbackTarget) {
        rootedTargets.add(fallbackTarget);
      }
    }

    const rootTrackNames = new Set();
    for (const track of positionTracks) {
      const targetName = this.extractTrackTargetName(track.name);
      if (targetName && rootedTargets.has(targetName)) {
        rootTrackNames.add(track.name);
      }
    }

    return rootTrackNames;
  }

  stripRootPositionFromClip(clip, clipLabel) {
    if (!clip || !Array.isArray(clip.tracks) || clip.tracks.length === 0) {
      return clip;
    }

    const rootMotionTrackNames = this.getRootMotionTrackNames(clip);
    if (rootMotionTrackNames.size === 0) {
      return clip;
    }

    const sanitizedTracks = clip.tracks.map((track) => {
      if (!track || !rootMotionTrackNames.has(track.name) || !track.name.includes('.position')) {
        return track;
      }

      const clonedTrack = track.clone();
      const values = Array.from(clonedTrack.values ?? []);
      if (values.length < 3) {
        return clonedTrack;
      }

      const baseX = values[0];
      const baseY = values[1];
      const baseZ = values[2];

      for (let index = 0; index < values.length - 2; index += 3) {
        values[index] = baseX;
        values[index + 1] = baseY;
        values[index + 2] = baseZ;
      }

      clonedTrack.values = Float32Array.from(values);
      return clonedTrack;
    });

    this.warn(`Stripped root motion from ${clipLabel} clip ${clip.name}.`);
    return new THREE.AnimationClip(clip.name, clip.duration, sanitizedTracks);
  }

  resolveRigTargetName(targetName, rigNodeNames, rigNodeNameMap, root = null) {
    if (!targetName) {
      return null;
    }

    if (rigNodeNames instanceof Set && rigNodeNames.has(targetName)) {
      return targetName;
    }

    const canonical = this.canonicalizeNodeName(targetName);
    if (canonical && rigNodeNameMap instanceof Map && rigNodeNameMap.has(canonical)) {
      return rigNodeNameMap.get(canonical);
    }

    const targetRole = this.inferBoneRole(targetName);
    if (!targetRole || !(rigNodeNames instanceof Set)) {
      return null;
    }

    const boneCandidates = [...rigNodeNames].filter((name) => {
      const nameRole = this.inferBoneRole(name);
      if (!nameRole || nameRole !== targetRole) {
        return false;
      }

      const targetSide = this.inferBoneSide(targetName);
      const candidateSide = this.inferBoneSide(name);
      if (targetSide !== 'center' && candidateSide !== 'center' && targetSide !== candidateSide) {
        return false;
      }

      return true;
    });

    if (boneCandidates.length === 0) {
      return null;
    }

    if (root) {
      const boneRoot = this.findRootBone(root) || root;
      boneCandidates.sort((a, b) => {
        const aDepth = this.computeBoneDepth(root, this.findBoneByName(root, a));
        const bDepth = this.computeBoneDepth(root, this.findBoneByName(root, b));
        return aDepth - bDepth;
      });

      if (boneRoot && this.findBoneByName(root, boneCandidates[0])) {
        return boneCandidates[0];
      }
    }

    return boneCandidates[0];
  }

  findBoneByName(root, boneName) {
    if (!root || !boneName || typeof root.traverse !== 'function') {
      return null;
    }

    let found = null;
    root.traverse((child) => {
      if (found || !child?.isBone || !child.name) {
        return;
      }
      if (child.name === boneName) {
        found = child;
      }
    });
    return found;
  }

  prepareClipForRig(clip, rigNodeNames, rigNodeNameMap, clipLabel, {
    preferBoneTracks = false,
    rigBoneNames = null,
    stripRootPosition = false,
    minQuaternionTracks = 0,
    root = null,
  } = {}) {
    if (
      !clip ||
      !Array.isArray(clip.tracks) ||
      clip.tracks.length === 0 ||
      !(rigNodeNames instanceof Set) ||
      rigNodeNames.size === 0 ||
      !(rigNodeNameMap instanceof Map)
    ) {
      return null;
    }

    const mappedTracks = clip.tracks.map((track) => {
      const targetName = this.extractTrackTargetName(track?.name ?? '');
      if (!targetName) {
        return null;
      }

      const resolvedTargetName = this.resolveRigTargetName(targetName, rigNodeNames, rigNodeNameMap, root);
      if (!resolvedTargetName) {
        return null;
      }

      if (resolvedTargetName === targetName) {
        return {
          track,
          isBone: rigBoneNames instanceof Set ? rigBoneNames.has(resolvedTargetName) : false,
        };
      }

      const clonedTrack = track.clone();
      clonedTrack.name = `${resolvedTargetName}${track.name.slice(targetName.length)}`;
      return {
        track: clonedTrack,
        isBone: rigBoneNames instanceof Set ? rigBoneNames.has(resolvedTargetName) : false,
      };
    }).filter(Boolean);

    let compatibleTracks = mappedTracks;
    if (preferBoneTracks) {
      const boneTracks = mappedTracks.filter((entry) => entry.isBone);
      if (boneTracks.length > 0) {
        compatibleTracks = boneTracks;
      }
    }

    const preparedTracks = compatibleTracks.map((entry) => entry.track);

    if (preparedTracks.length === 0) {
      this.warn(`Rejected ${clipLabel} clip ${clip.name}: no tracks target the player rig.`);
      return null;
    }

    const compatibilityRatio = preparedTracks.length / clip.tracks.length;
    if (compatibilityRatio < 0.1) {
      this.warn(`Rejected ${clipLabel} clip ${clip.name}: only ${(compatibilityRatio * 100).toFixed(1)}% of tracks match the player rig.`);
      return null;
    }

    const quaternionTrackCount = preparedTracks.filter((track) =>
      typeof track?.name === 'string' && track.name.includes('.quaternion')
    ).length;

    if (minQuaternionTracks > 0 && quaternionTrackCount < minQuaternionTracks) {
      this.warn(`Rejected ${clipLabel} clip ${clip.name}: only ${quaternionTrackCount} quaternion track(s), need at least ${minQuaternionTracks}.`);
      return null;
    }

    const tracksWereRemapped = mappedTracks.some((entry, index) => {
      const originalTrack = clip.tracks[index];
      return !originalTrack || entry.track !== originalTrack || entry.track.name !== originalTrack.name;
    });

    let preparedClip = null;
    if (preparedTracks.length === clip.tracks.length && !tracksWereRemapped) {
      preparedClip = clip;
    } else {
      if (preparedTracks.length !== clip.tracks.length) {
        this.warn(`Using filtered ${clipLabel} clip ${clip.name}: ${preparedTracks.length}/${clip.tracks.length} tracks match the player rig.`);
      }
      preparedClip = new THREE.AnimationClip(clip.name, clip.duration, preparedTracks);
    }

    if (stripRootPosition) {
      preparedClip = this.stripRootPositionFromClip(preparedClip, clipLabel);
    }

    return preparedClip;
  }

  hasRenderableGeometry(root) {
    if (!root || typeof root.traverse !== 'function') {
      return false;
    }

    let foundRenderable = false;
    root.traverse((child) => {
      if (foundRenderable) {
        return;
      }

      if ((child?.isMesh || child?.isSkinnedMesh) && child.geometry) {
        foundRenderable = true;
      }
    });

    return foundRenderable;
  }

  applyPlayerMeshSettings(root) {
    if (!root || typeof root.traverse !== 'function') {
      return;
    }

    root.traverse((child) => {
      if (!child?.isMesh && !child?.isSkinnedMesh) {
        return;
      }

      child.castShadow = true;
      child.receiveShadow = true;
    });
  }

  async loadFbxAsset(loader, assetPath, basePath) {
    const resolvedPath = this.resolveScenePath(assetPath, basePath ?? '/scene-manifest.json');
    const asset = await loader.loadAsync(resolvedPath);
    return { asset, resolvedPath };
  }
}
