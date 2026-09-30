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

    /**
     * Runtime animation state for a spawned player visual.
     */
    this.mixer = null;
    this.walkAction = null;
    this.idleAction = null;
    this.jumpAction = null;

    /**
     * Default player animation/model configuration.
     * Can be overridden through applyModelConfig().
     */
    this.modelConfig = {
      rigPath: '/animations/Action%20Adventure%20Pack/X%20Bot.fbx',
      walkPath: '/animations/Action%20Adventure%20Pack/walking.fbx',
      idlePath: '/animations/Action%20Adventure%20Pack/idle.fbx',
      jumpPath: '/animations/Action%20Adventure%20Pack/jumping up.fbx',
      modelScale: new THREE.Vector3(0.01, 0.01, 0.01),
      modelRotationDegrees: new THREE.Vector3(0, 0, 0),
      modelOffset: new THREE.Vector3(0, 0, 0),
      walkClipName: null,
      idleClipName: null,
      jumpClipName: null,
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

    /* Apply the resolved model configuration to the animator. */
    this.modelConfig = {
      rigPath: configuredRigPath,
      walkPath: configuredWalkPath,
      idlePath: configuredIdlePath,
      jumpPath: configuredJumpPath,
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
   * Create the visual representation of the player character, using the model template if available, or falling back to a provided factory function.
   * @param {Function} fallbackFactory - A factory function to create a fallback visual if the model template is not available.
   * @returns {THREE.Object3D} The created player visual.
   */
  createPlayerVisual(fallbackFactory) {
    const visual = this.modelTemplate
      ? cloneSkinned(this.modelTemplate)
      : (typeof fallbackFactory === 'function' ? fallbackFactory() : new THREE.Group());

    const { modelScale, modelRotationDegrees, modelOffset } = this.modelConfig;
    visual.scale.copy(modelScale);
    visual.rotation.set(
      THREE.MathUtils.degToRad(modelRotationDegrees.x),
      THREE.MathUtils.degToRad(modelRotationDegrees.y),
      THREE.MathUtils.degToRad(modelRotationDegrees.z)
    );
    visual.position.copy(modelOffset);

    this.mixer = null;
    this.walkAction = null;
    this.idleAction = null;
    this.jumpAction = null;

    if (this.walkClip || this.idleClip || this.jumpClip) {
      this.mixer = new THREE.AnimationMixer(visual);

      if (this.walkClip) {
        this.walkAction = this.mixer.clipAction(this.walkClip);
        this.walkAction.play();
        this.walkAction.enabled = true;
        this.walkAction.setEffectiveWeight(0);
      }

      if (this.idleClip) {
        this.idleAction = this.mixer.clipAction(this.idleClip);
        this.idleAction.play();
        this.idleAction.enabled = true;
        this.idleAction.setEffectiveWeight(1);
      }

      if (this.jumpClip) {
        this.jumpAction = this.mixer.clipAction(this.jumpClip);
        this.jumpAction.play();
        this.jumpAction.enabled = true;
        this.jumpAction.setEffectiveWeight(0);
        this.jumpAction.clampWhenFinished = false;
      }
    }

    return visual;
  }

  resetActions() {
    if (this.mixer) {
      this.mixer.setTime(0);
    }

    if (this.walkAction) {
      this.walkAction.setEffectiveWeight(0);
      this.walkAction.time = 0;
    }

    if (this.idleAction) {
      this.idleAction.setEffectiveWeight(1);
      this.idleAction.time = 0;
    }

    if (this.jumpAction) {
      this.jumpAction.setEffectiveWeight(0);
      this.jumpAction.time = 0;
    }
  }

  update(delta, {
    isGrounded,
    hasMoveInput,
    isSprinting,
    walkSpeed,
    sprintSpeed,
  }) {
    if (!this.mixer) {
      return;
    }

    const airborneBlendTarget = isGrounded ? 0 : 1;
    let currentJumpWeight = 0;
    if (this.jumpAction) {
      currentJumpWeight = this.jumpAction.getEffectiveWeight();
      const jumpBlendFactor = Math.min(1, delta * 12);
      const nextJumpWeight = THREE.MathUtils.lerp(currentJumpWeight, airborneBlendTarget, jumpBlendFactor);
      this.jumpAction.setEffectiveWeight(nextJumpWeight);
      currentJumpWeight = nextJumpWeight;
    }

    if (this.walkAction) {
      const safeWalkSpeed = Math.max(walkSpeed, 0.01);
      const sprintMultiplier = sprintSpeed / safeWalkSpeed;
      this.walkAction.setEffectiveTimeScale(isSprinting ? sprintMultiplier : 1);

      const targetWalkWeight = hasMoveInput ? 1 : 0;
      const currentWalkWeight = this.walkAction.getEffectiveWeight();
      const blendFactor = Math.min(1, delta * 10);
      const nextWalkWeight = THREE.MathUtils.lerp(currentWalkWeight, targetWalkWeight, blendFactor);

      const groundedWeightScale = 1 - currentJumpWeight;
      this.walkAction.setEffectiveWeight(nextWalkWeight * groundedWeightScale);
      if (this.idleAction) {
        this.idleAction.setEffectiveWeight((1 - nextWalkWeight) * groundedWeightScale);
      }
    } else if (this.idleAction) {
      this.idleAction.setEffectiveWeight(1 - currentJumpWeight);
    }

    this.mixer.update(delta);
  }

  async preload() {
    this.modelTemplate = null;
    this.walkClip = null;
    this.idleClip = null;
    this.jumpClip = null;

    const {
      rigPath,
      walkPath,
      idlePath,
      jumpPath,
      resolvedBasePath,
      walkClipName,
      idleClipName,
      jumpClipName,
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

      if (!this.walkClip && this.idleClip) {
        this.walkClip = this.idleClip;
      }

      if (!this.idleClip && this.walkClip) {
        this.idleClip = this.walkClip;
      }

      if (!this.jumpClip && this.walkClip) {
        this.jumpClip = this.walkClip;
      }

      this.log(`Player clips: walk=${this.walkClip?.name ?? 'none'}, idle=${this.idleClip?.name ?? 'none'}, jump=${this.jumpClip?.name ?? 'none'}`);

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

  prepareClipForRig(clip, rigNodeNames, rigNodeNameMap, clipLabel, {
    preferBoneTracks = false,
    rigBoneNames = null,
    stripRootPosition = false,
    minQuaternionTracks = 0,
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

      let resolvedTargetName = null;
      if (rigNodeNames.has(targetName)) {
        resolvedTargetName = targetName;
      } else {
        const canonicalTrackTarget = this.canonicalizeNodeName(targetName);
        if (canonicalTrackTarget && rigNodeNameMap.has(canonicalTrackTarget)) {
          resolvedTargetName = rigNodeNameMap.get(canonicalTrackTarget);
        }
      }

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

    let preparedClip = null;
    if (preparedTracks.length === clip.tracks.length) {
      preparedClip = clip;
    } else {
      this.warn(`Using filtered ${clipLabel} clip ${clip.name}: ${preparedTracks.length}/${clip.tracks.length} tracks match the player rig.`);
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
