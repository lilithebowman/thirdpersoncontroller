/**
 * ThirdPersonControllerApp.js
 *
 * Builds the Three.js scene, loads world assets, and coordinates input,
 * camera, physics, and debug UI for the third-person controller.
 */

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Animator } from './Animator.js';
import { KeyboardInput } from './KeyboardInput.js';
import { MouseInput } from './MouseInput.js';
import { DebugDisplay } from './DebugDisplay.js';
import { Rigidbody } from './Rigidbody.js';
import { Force } from './Force.js';
import { BoxCollider } from './BoxCollider.js';
import { SphereCollider } from './SphereCollider.js';
import { MeshCollider } from './MeshCollider.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';

export class ThirdPersonControllerApp {
  constructor({ mountSelector = '#app', manifestPath = '/scene-manifest.json' } = {}) {
    this.mountSelector = mountSelector;
    this.manifestPath = manifestPath;
    this.minFPS = 5;
    this.fogNearDistance = 140;
    this.fogFarDistance = 900;

    this.app = document.querySelector(this.mountSelector);
    if (!this.app) {
      throw new Error(`Mount element not found for selector: ${this.mountSelector}`);
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ecae6);
    this.scene.fog = new THREE.Fog(0x8ecae6, this.fogNearDistance, this.fogFarDistance);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.rotation.order = 'YXZ';
    this.camera.position.set(0, 4.5, 8.5);
    this.minimumAdaptiveCameraFar = 10;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.app.appendChild(this.renderer.domElement);

    this.player = null;
    this.playerModelTemplate = null;
    this.playerWalkAnimationClip = null;
    this.playerIdleAnimationClip = null;
    this.playerJumpAnimationClip = null;
    this.playerAnimationMixer = null;
    this.playerWalkAction = null;
    this.playerIdleAction = null;
    this.playerJumpAction = null;
    this.playerManifestConfig = {
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
    };

    this.clock = new THREE.Clock();
    this.keyboardInput = new KeyboardInput();
    this.mouseInput = new MouseInput({ domElement: this.renderer.domElement });
    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
    this.headWorldPosition = new THREE.Vector3();
    this.cameraLookDirection = new THREE.Vector3(0, 0, -1);
    this.headLookLocalAxisUp = new THREE.Vector3(0, 1, 0);
    this.headLookLocalAxisRight = new THREE.Vector3(1, 0, 0);
    this.headLookQuaternionYaw = new THREE.Quaternion();
    this.headLookQuaternionPitch = new THREE.Quaternion();
    this.headLookQuaternionResult = new THREE.Quaternion();
    this.playerHeadBoneBaseLocalQuaternion = new THREE.Quaternion();
    this.firstPersonHeadOverrideActive = false;
    this.playerRotationQuaternion = new THREE.Quaternion();
    this.playerRotationAxis = new THREE.Vector3(0, 1, 0);
    this.playerLookNormal = new THREE.Vector3(0, 0, 1);
    this.cameraForwardNormal = new THREE.Vector3(0, 0, -1);
    this.rotationEuler = new THREE.Euler(0, 0, 0, 'XYZ');
    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.hasMoveInput = false;
    this.isGrounded = true;
    this.force = new Force();
    this.playerRigidbody = new Rigidbody({
      mass: 1,
      gravity: new THREE.Vector3(0, -26, 0),
      linearDamping: 0,
      enablePhysicsCollision: true,
    });
    this.playerCollider = new BoxCollider({
      size: new THREE.Vector3(0.9, 1.9, 0.9),
      offset: new THREE.Vector3(0, 0.95, 0),
      physicsCollision: true,
    });
    this.worldColliders = [];
    this.loadedSubScenePaths = new Set();
    this.sceneStreams = [];
    this.activeSceneStreamLoads = new Map();
    this.jumpImpulseVector = new THREE.Vector3();

    this.playerState = {
      speed: 10,
      sprintSpeed: 18,
      rotationSpeed: 8,
      jumpImpulse: 8.8,
      groundY: 0,
      gravityY: -26,
    };

    this.cameraState = {
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

    this.materialCache = new Map();
    this.textureLoader = new THREE.TextureLoader();
    this.performanceMonitor = new PerformanceMonitor({ smoothing: 0.9, initialFPS: 60 });
    this.isReducingFrustum = false;
    this.frustumShrinkRatePerSecond = 160;
    this.distanceCullingEnabled = true;
    this.distanceCullingMaxDistance = 140;
    this.distanceCullingHysteresis = 12;
    this.distanceCullables = [];
    this.debugDisplay = new DebugDisplay({ parentElement: this.app, enabled: false });
    this.animator = new Animator({
      resolveScenePath: this.resolveScenePath.bind(this),
      configureMeshCulling: this.configureMeshCulling.bind(this),
      debugDisplay: this.debugDisplay,
    });
    this.respawnY = -1000;
    this.isPointerLocked = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 60;
    this.rayDirection = new THREE.Vector3();
    this.mouseBeamStart = new THREE.Vector3();
    this.mouseBeamEnd = new THREE.Vector3();
    this.mouseBeamGeometry = new THREE.BufferGeometry();
    this.mouseBeamMaterial = new THREE.LineBasicMaterial({
      color: 0x00f5ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.mouseBeam = new THREE.Line(this.mouseBeamGeometry, this.mouseBeamMaterial);
    this.mouseBeam.visible = false;
    this.hitMarker = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshBasicMaterial({
        color: 0x00f5ff,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    this.hitMarker.visible = false;
    this.scene.add(this.mouseBeam);
    this.scene.add(this.hitMarker);
    this.playerHeadBone = null;
    this.firstPersonFallbackHeadHeight = 1.6;
    this.isRunning = false;
    this.inputEnabledAt = 0;

    this.onResize = this.onResize.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.tick = this.tick.bind(this);

    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);

    this.keyboardInput.attach();
    this.mouseInput.attach();
    this.attachEvents();
  }

  createFallbackPlayerVisual() {
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

  createPlayer() {
    const player = new THREE.Group();
    const visual = this.animator.createPlayerVisual(() => {
      const fallback = this.playerModelTemplate
        ? cloneSkinned(this.playerModelTemplate)
        : this.createFallbackPlayerVisual();

      const { modelScale, modelRotationDegrees, modelOffset } = this.playerManifestConfig;
      fallback.scale.copy(modelScale);
      fallback.rotation.set(
        THREE.MathUtils.degToRad(modelRotationDegrees.x),
        THREE.MathUtils.degToRad(modelRotationDegrees.y),
        THREE.MathUtils.degToRad(modelRotationDegrees.z)
      );
      fallback.position.copy(modelOffset);
      return fallback;
    });
    player.add(visual);
    this.playerHeadBone = this.findHeadBone(player);
    this.firstPersonHeadOverrideActive = false;

    if (this.playerHeadBone) {
      this.playerHeadBoneBaseLocalQuaternion.copy(this.playerHeadBone.quaternion);
    }

    return player;
  }

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
      if (!canonical) {
        return;
      }

      if (canonical.includes('head')) {
        bestMatch = child;
      }
    });

    return bestMatch;
  }

  isFirstPersonView() {
    return this.cameraState.distance <= this.cameraState.firstPersonDistanceThreshold;
  }

  resolveFirstPersonHeadPosition(target = new THREE.Vector3()) {
    if (this.playerHeadBone) {
      this.playerHeadBone.getWorldPosition(target);
      return target;
    }

    if (this.player) {
      target.set(
        this.player.position.x,
        this.player.position.y + this.firstPersonFallbackHeadHeight,
        this.player.position.z
      );
      return target;
    }

    return target.set(0, this.firstPersonFallbackHeadHeight, 0);
  }

  applyFirstPersonHeadLookOverride() {
    if (!this.playerHeadBone) {
      return;
    }

    const relativeYaw = THREE.MathUtils.clamp(
      this.shortestAngleDelta(this.playerYaw, this.cameraState.yaw),
      -this.cameraState.headLookYawLimit,
      this.cameraState.headLookYawLimit
    );
    const clampedPitch = THREE.MathUtils.clamp(
      this.cameraState.pitch,
      -this.cameraState.headLookPitchLimit,
      this.cameraState.headLookPitchLimit
    );

    this.headLookQuaternionYaw.setFromAxisAngle(this.headLookLocalAxisUp, relativeYaw);
    this.headLookQuaternionPitch.setFromAxisAngle(this.headLookLocalAxisRight, clampedPitch);

    this.headLookQuaternionResult.copy(this.playerHeadBoneBaseLocalQuaternion);
    this.headLookQuaternionResult.multiply(this.headLookQuaternionYaw);
    this.headLookQuaternionResult.multiply(this.headLookQuaternionPitch);
    this.playerHeadBone.quaternion.copy(this.headLookQuaternionResult);
    this.firstPersonHeadOverrideActive = true;
  }

  clearFirstPersonHeadLookOverride() {
    if (!this.firstPersonHeadOverrideActive || !this.playerHeadBone) {
      return;
    }

    this.playerHeadBone.quaternion.copy(this.playerHeadBoneBaseLocalQuaternion);
    this.firstPersonHeadOverrideActive = false;
  }

  setCameraNearPlane(nextNear) {
    if (!Number.isFinite(nextNear) || nextNear <= 0) {
      return;
    }

    if (Math.abs(this.camera.near - nextNear) < 1e-4) {
      return;
    }

    this.camera.near = nextNear;
    this.camera.updateProjectionMatrix();
  }

  attachEvents() {
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('wheel', this.onMouseWheel, { passive: false });
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
  }

  onPointerLockChange() {
    this.isPointerLocked = document.pointerLockElement === this.renderer.domElement;
    if (!this.isPointerLocked) {
      this.mouseInput.clear();
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onMouseWheel(event) {
    event.preventDefault();

    const zoomDelta = event.deltaY * this.cameraState.zoomStep;
    this.cameraState.distance = THREE.MathUtils.clamp(
      this.cameraState.distance + zoomDelta,
      this.cameraState.minDistance,
      this.cameraState.maxDistance
    );
  }

  normalizeAngle(angle) {
    return THREE.MathUtils.euclideanModulo(angle + Math.PI, Math.PI * 2) - Math.PI;
  }

  shortestAngleDelta(fromAngle, toAngle) {
    return this.normalizeAngle(toAngle - fromAngle);
  }

  resolveScenePath(referencePath, basePath = this.manifestPath) {
    const baseURL = new URL(basePath, window.location.origin);
    return new URL(referencePath, baseURL).toString();
  }

  async fetchManifest(manifestPath, basePath = this.manifestPath) {
    const resolvedPath = this.resolveScenePath(manifestPath, basePath);
    const response = await fetch(resolvedPath);

    if (!response.ok) {
      throw new Error(`Failed to fetch manifest ${resolvedPath}: ${response.status} ${response.statusText}`);
    }

    const manifest = await response.json();
    return { manifest, resolvedPath };
  }

  isSceneReferenceItem(item) {
    return item?.type === 'scene';
  }

  getSceneReferencePath(item) {
    return item?.manifestPath ?? item?.path ?? null;
  }

  registerSceneStream(item, basePath, parentGroup = null) {
    const referencePath = this.getSceneReferencePath(item);
    if (!referencePath) {
      this.debugDisplay.LogWarning('Scene reference object is missing manifestPath/path.');
      return;
    }

    const streamConfig = item.stream ?? {};
    const center = this.toVector3(streamConfig.center ?? item.position, new THREE.Vector3());
    const loadDistance = Number.isFinite(streamConfig.loadDistance) ? streamConfig.loadDistance : 45;
    const unloadDistance = Number.isFinite(streamConfig.unloadDistance)
      ? streamConfig.unloadDistance
      : loadDistance * 1.35;

    const streamEntry = {
      key: this.resolveScenePath(referencePath, basePath),
      referencePath,
      basePath,
      center,
      loadDistance,
      unloadDistance: Math.max(unloadDistance, loadDistance + 0.01),
      loaded: false,
      loading: false,
      sceneGroup: null,
      parentGroup,
    };

    this.sceneStreams.push(streamEntry);
    this.debugDisplay.Log(`Registered streamed scene ${streamEntry.key}`);
  }

  async loadSubScene(referencePath, basePath, {
    allowReload = false,
    sceneKey = null,
    parentGroup = null,
    ancestry = new Set(),
  } = {}) {
    const resolvedPath = this.resolveScenePath(referencePath, basePath);

    if (ancestry.has(resolvedPath)) {
      this.debugDisplay.LogWarning(`Detected cyclic sub-scene reference at ${resolvedPath}. Skipping.`);
      return;
    }

    if (!allowReload && this.loadedSubScenePaths.has(resolvedPath)) {
      return;
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(resolvedPath);

    const { manifest } = await this.fetchManifest(resolvedPath, basePath);
    if (!allowReload) {
      this.loadedSubScenePaths.add(resolvedPath);
    }

    const items = manifest.objects ?? [];
    await this.processManifestObjects(items, {
      basePath: resolvedPath,
      parentGroup,
      sceneKey,
      ancestry: nextAncestry,
    });
  }

  async loadStreamedScene(streamEntry) {
    if (!streamEntry || streamEntry.loading || streamEntry.loaded) {
      return;
    }

    streamEntry.loading = true;

    const sceneGroup = new THREE.Group();
    sceneGroup.name = `StreamedScene:${streamEntry.key}`;
    if (streamEntry.parentGroup) {
      streamEntry.parentGroup.add(sceneGroup);
    } else {
      this.scene.add(sceneGroup);
    }
    streamEntry.sceneGroup = sceneGroup;

    try {
      await this.loadSubScene(streamEntry.referencePath, streamEntry.basePath, {
        allowReload: true,
        sceneKey: streamEntry.key,
        parentGroup: sceneGroup,
      });

      streamEntry.loaded = true;
      this.debugDisplay.Log(`Loaded streamed scene ${streamEntry.key}`);
    } catch (error) {
      if (sceneGroup.parent) {
        sceneGroup.parent.remove(sceneGroup);
      }

      streamEntry.sceneGroup = null;
      this.debugDisplay.LogError(`Failed to load streamed scene ${streamEntry.key}: ${error?.message ?? error}`);
    } finally {
      streamEntry.loading = false;
    }
  }

  unloadStreamedScene(streamEntry) {
    if (!streamEntry?.loaded) {
      return;
    }

    if (streamEntry.sceneGroup?.parent) {
      streamEntry.sceneGroup.parent.remove(streamEntry.sceneGroup);
    }

    this.worldColliders = this.worldColliders.filter((entry) => entry.sceneKey !== streamEntry.key);
    this.distanceCullables = this.distanceCullables.filter((entry) => entry.sceneKey !== streamEntry.key);

    streamEntry.sceneGroup = null;
    streamEntry.loaded = false;
    this.debugDisplay.Log(`Unloaded streamed scene ${streamEntry.key}`);
  }

  updateSceneStreams() {
    if (!this.player || this.sceneStreams.length === 0) {
      return;
    }

    for (const streamEntry of this.sceneStreams) {
      const distanceToPlayer = this.player.position.distanceTo(streamEntry.center);

      if (!streamEntry.loaded && !streamEntry.loading && distanceToPlayer <= streamEntry.loadDistance) {
        this.loadStreamedScene(streamEntry);
        continue;
      }

      if (streamEntry.loaded && distanceToPlayer > streamEntry.unloadDistance) {
        this.unloadStreamedScene(streamEntry);
      }
    }
  }

  resolvePlayerSpawnFromManifest(manifest) {
    const spawns = manifest.playerSpawns;

    if (!Array.isArray(spawns) || spawns.length === 0) {
      return null;
    }

    for (const spawn of spawns) {
      if (!Array.isArray(spawn) || spawn.length < 3) {
        continue;
      }

      const [x, y, z] = spawn;
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        return new THREE.Vector3(x, y, z);
      }
    }

    return null;
  }

  applyPlayerConfig(manifest, basePath) {
    const playerConfig = manifest.player ?? {};
    const modelConfig = playerConfig.model ?? {};
    const colliderConfig = playerConfig.collider ?? {};
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
    const colliderSize = this.toVector3(colliderConfig.size, new THREE.Vector3(0.9, 1.9, 0.9));
    const colliderOffset = this.toVector3(colliderConfig.offset, new THREE.Vector3(0, 0.95, 0));

    this.playerManifestConfig = {
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

    this.playerCollider.setSize(colliderSize);
    this.playerCollider.offset.copy(colliderOffset);

    this.animator.applyModelConfig(modelConfig, basePath);

    if (typeof colliderConfig.physicsCollision === 'boolean') {
      this.playerCollider.physicsCollision = colliderConfig.physicsCollision;
    }

    this.debugDisplay.Log(
      `Player collider: size=(${colliderSize.x.toFixed(2)}, ${colliderSize.y.toFixed(2)}, ${colliderSize.z.toFixed(2)}), offset=(${colliderOffset.x.toFixed(2)}, ${colliderOffset.y.toFixed(2)}, ${colliderOffset.z.toFixed(2)}), collision=${this.playerCollider.physicsCollision}`
    );
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

    this.debugDisplay.LogWarning(`Stripped root motion from ${clipLabel} clip ${clip.name}.`);
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
      this.debugDisplay.LogWarning(`Rejected ${clipLabel} clip ${clip.name}: no tracks target the player rig.`);
      return null;
    }

    const compatibilityRatio = preparedTracks.length / clip.tracks.length;
    if (compatibilityRatio < 0.1) {
      this.debugDisplay.LogWarning(
        `Rejected ${clipLabel} clip ${clip.name}: only ${(compatibilityRatio * 100).toFixed(1)}% of tracks match the player rig.`
      );
      return null;
    }

    const quaternionTrackCount = preparedTracks.filter((track) =>
      typeof track?.name === 'string' && track.name.includes('.quaternion')
    ).length;

    if (minQuaternionTracks > 0 && quaternionTrackCount < minQuaternionTracks) {
      this.debugDisplay.LogWarning(
        `Rejected ${clipLabel} clip ${clip.name}: only ${quaternionTrackCount} quaternion track(s), need at least ${minQuaternionTracks}.`
      );
      return null;
    }

    let preparedClip = null;
    if (preparedTracks.length === clip.tracks.length) {
      preparedClip = clip;
    } else {
      this.debugDisplay.LogWarning(
        `Using filtered ${clipLabel} clip ${clip.name}: ${preparedTracks.length}/${clip.tracks.length} tracks match the player rig.`
      );
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
    const resolvedPath = this.resolveScenePath(assetPath, basePath ?? this.manifestPath);
    const asset = await loader.loadAsync(resolvedPath);
    return { asset, resolvedPath };
  }

  async preloadPlayerModel() {
    this.playerModelTemplate = null;
    this.playerWalkAnimationClip = null;
    this.playerIdleAnimationClip = null;
    this.playerJumpAnimationClip = null;

    const {
      rigPath,
      walkPath,
      idlePath,
      jumpPath,
      resolvedBasePath,
      walkClipName,
      idleClipName,
      jumpClipName,
    } = this.playerManifestConfig;
    if (!rigPath) {
      return;
    }

    try {
      const loader = new FBXLoader();
      const defaultRigPath = '/animations/Action%20Adventure%20Pack/X%20Bot.fbx';

      let { asset: rigAsset } = await this.loadFbxAsset(loader, rigPath, resolvedBasePath);
      if (!this.hasRenderableGeometry(rigAsset)) {
        this.debugDisplay.LogWarning(`Rig asset ${rigPath} has no renderable meshes. Trying fallback rig ${defaultRigPath}.`);
        const fallbackLoad = await this.loadFbxAsset(loader, defaultRigPath, resolvedBasePath);
        rigAsset = fallbackLoad.asset;
      }

      if (this.hasRenderableGeometry(rigAsset)) {
        this.applyPlayerMeshSettings(rigAsset);
        this.configureMeshCulling(rigAsset);
        this.playerModelTemplate = rigAsset;
      }

      const rigNodeNames = this.collectRigNodeNames(rigAsset);
      const rigNodeNameMap = this.collectRigNodeNameMap(rigAsset);
      const rigBoneNames = this.collectRigBoneNames(rigAsset);
      const rigCanonicalBoneNames = this.collectCanonicalBoneNames(rigAsset);

      const rigClips = Array.isArray(rigAsset.animations) ? rigAsset.animations : [];
      const rigWalkClip = this.findAnimationClip(rigClips, walkClipName, /walk/i);
      const rigIdleClip = this.findAnimationClip(rigClips, idleClipName, /idle/i);
      const rigJumpClip = this.findAnimationClip(rigClips, jumpClipName, /jump/i);
      this.playerWalkAnimationClip = this.prepareClipForRig(rigWalkClip, rigNodeNames, rigNodeNameMap, 'rig walk', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });
      this.playerIdleAnimationClip = this.prepareClipForRig(rigIdleClip, rigNodeNames, rigNodeNameMap, 'rig idle', {
        preferBoneTracks: true,
        rigBoneNames,
        stripRootPosition: true,
      });
      this.playerJumpAnimationClip = this.prepareClipForRig(rigJumpClip, rigNodeNames, rigNodeNameMap, 'rig jump', {
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
            this.playerWalkAnimationClip = preparedWalkClip;
          }
        } catch (walkError) {
          this.debugDisplay.LogWarning(`Failed to load walking animation ${walkPath}. ${walkError?.message ?? walkError}`);
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
            this.playerIdleAnimationClip = preparedIdleClip;
          }
        } catch (idleError) {
          this.debugDisplay.LogWarning(`Failed to load idle animation ${idlePath}. ${idleError?.message ?? idleError}`);
        }
      }

      if (jumpPath) {
        try {
          const jumpAsset = await this.loadFbxAsset(loader, jumpPath, resolvedBasePath);
          const jumpCanonicalBoneNames = this.collectCanonicalBoneNames(jumpAsset.asset);
          const jumpBoneOverlap = this.computeSetOverlapRatio(jumpCanonicalBoneNames, rigCanonicalBoneNames);

          if (jumpBoneOverlap < 0.45) {
            this.debugDisplay.LogWarning(
              `Rejected jump asset ${jumpPath}: skeleton overlap ${(jumpBoneOverlap * 100).toFixed(1)}% is below 45%.`
            );
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
              this.playerJumpAnimationClip = preparedJumpClip;
            }
          }
        } catch (jumpError) {
          this.debugDisplay.LogWarning(`Failed to load jump animation ${jumpPath}. ${jumpError?.message ?? jumpError}`);
        }
      }

      if (!this.playerWalkAnimationClip && this.playerIdleAnimationClip) {
        this.playerWalkAnimationClip = this.playerIdleAnimationClip;
      }

      if (!this.playerIdleAnimationClip && this.playerWalkAnimationClip) {
        this.playerIdleAnimationClip = this.playerWalkAnimationClip;
      }

      if (!this.playerJumpAnimationClip && this.playerWalkAnimationClip) {
        this.playerJumpAnimationClip = this.playerWalkAnimationClip;
      }

      this.debugDisplay.Log(
        `Player clips: walk=${this.playerWalkAnimationClip?.name ?? 'none'}, idle=${this.playerIdleAnimationClip?.name ?? 'none'}, jump=${this.playerJumpAnimationClip?.name ?? 'none'}`
      );

      if (!this.playerModelTemplate) {
        this.debugDisplay.LogWarning('No renderable meshes found for player rig. Falling back to primitive avatar.');
      } else {
        this.debugDisplay.Log(`Loaded player rig ${rigPath}.`);
      }
    } catch (error) {
      this.debugDisplay.LogWarning(`Failed to load player rig ${rigPath}. Falling back to primitive avatar. ${error?.message ?? error}`);
    }
  }

  spawnPlayerAt(spawnPosition, { recreate = false } = {}) {
    if (!this.player || recreate) {
      if (this.player) {
        this.scene.remove(this.player);
      }

      this.player = this.createPlayer();
      this.scene.add(this.player);
    }

    this.player.position.copy(spawnPosition);
    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    this.player.quaternion.copy(this.playerRotationQuaternion);
    this.playerRigidbody.velocity.set(0, 0, 0);

    if (this.playerAnimationMixer) {
      this.playerAnimationMixer.setTime(0);
    }

    if (this.playerWalkAction) {
      this.playerWalkAction.setEffectiveWeight(0);
      this.playerWalkAction.time = 0;
    }

    if (this.playerIdleAction) {
      this.playerIdleAction.setEffectiveWeight(1);
      this.playerIdleAction.time = 0;
    }

    if (this.playerJumpAction) {
      this.playerJumpAction.setEffectiveWeight(0);
      this.playerJumpAction.time = 0;
    }

    this.animator.resetActions();
  }

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

  buildManifestCollider(colliderConfig, fallbackPosition, fallbackSize, context = {}) {
    if (!colliderConfig || !colliderConfig.type) {
      return null;
    }

    const offset = this.toVector3(colliderConfig.offset, new THREE.Vector3(0, 0, 0));
    const position = this.toVector3(colliderConfig.position, fallbackPosition);
    const physicsCollision = colliderConfig.physicsCollision !== false;

    if (colliderConfig.type === 'box') {
      const size = this.toVector3(colliderConfig.size, fallbackSize);

      return {
        position,
        collider: new BoxCollider({
          size,
          offset,
          physicsCollision,
        }),
        source: colliderConfig.source ?? 'manifest',
      };
    }

    if (colliderConfig.type === 'sphere') {
      const fallbackRadius = Math.max(fallbackSize.x, fallbackSize.y, fallbackSize.z) * 0.5;
      const radius = Number.isFinite(colliderConfig.radius) ? colliderConfig.radius : fallbackRadius;

      return {
        position,
        collider: new SphereCollider({
          radius,
          offset,
          physicsCollision,
        }),
        source: colliderConfig.source ?? 'manifest',
      };
    }

    if (colliderConfig.type === 'mesh') {
      if (!context.mesh) {
        return null;
      }

      return {
        position,
        collider: new MeshCollider({
          mesh: context.mesh,
          offset,
          physicsCollision,
        }),
        source: colliderConfig.source ?? 'manifest',
      };
    }

    return null;
  }

  registerColliderFromManifestItem(item, fallbackSize, context = {}) {
    if (!item.collider) {
      return;
    }

    const fallbackPosition = this.toVector3(item.position, new THREE.Vector3());
    const built = this.buildManifestCollider(item.collider, fallbackPosition, fallbackSize, context);

    if (!built) {
      this.debugDisplay.LogWarning(`Unsupported collider type on ${item.name ?? item.type}. Supported collider types are box, sphere, and mesh.`);
      return;
    }

    this.worldColliders.push({
      position: built.position,
      physicsCollision: built.collider.physicsCollision,
      collider: built.collider,
      sceneKey: context.sceneKey ?? null,
      getBounds: (position, target) => built.collider.getBounds(position, target),
    });

    this.debugDisplay.Log(`Registered ${built.collider.type} for ${item.name ?? item.type}.`);
  }

  updateMouseLook() {
    if (!this.isPointerLocked) {
      return;
    }

    const { deltaX, deltaY } = this.mouseInput.consumeLookDelta();
    if (Math.abs(deltaX) > 0) {
      this.cameraState.yaw -= deltaX * 0.0025;
      this.cameraState.yaw = this.normalizeAngle(this.cameraState.yaw);
    }

    if (Math.abs(deltaY) > 0 && this.isFirstPersonView()) {
      this.cameraState.pitch = THREE.MathUtils.clamp(
        this.cameraState.pitch + deltaY * 0.0022,
        this.cameraState.minPitch,
        this.cameraState.maxPitch
      );
    } else if (Math.abs(deltaY) > 0) {
      this.cameraState.height = THREE.MathUtils.clamp(
        this.cameraState.height - deltaY * 0.01,
        2.4,
        10
      );
    }
  }

  updateAimBeam() {
    if (!this.player || !this.camera) {
      return;
    }

    if (!this.mouseInput.consumeClick()) {
      return;
    }

    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection);
    this.mouseBeamStart.copy(this.camera.position).addScaledVector(cameraDirection, 0.05);

    this.raycaster.set(this.mouseBeamStart, cameraDirection);
    this.raycaster.far = 60;

    const raycastTargets = [];
    this.scene.traverse((object) => {
      if (
        object === this.mouseBeam ||
        object === this.hitMarker ||
        object === this.camera ||
        object === this.renderer?.domElement
      ) {
        return;
      }

      const isPlayerDescendant = this.player && this.player.children.includes(object)
        ? true
        : this.player && object.isObject3D && this.player === object;

      if (isPlayerDescendant) {
        return;
      }

      if (object.isMesh || object.isLine || object.isPoints) {
        raycastTargets.push(object);
      }
    });

    const intersections = this.raycaster.intersectObjects(raycastTargets, true);
    const hitPoint = intersections.length > 0 ? intersections[0].point : null;

    if (hitPoint) {
      this.mouseBeamEnd.copy(hitPoint);
      this.hitMarker.position.copy(hitPoint);
      this.hitMarker.visible = true;
    } else {
      this.mouseBeamEnd.copy(this.mouseBeamStart).addScaledVector(cameraDirection, this.raycaster.far);
      this.hitMarker.visible = false;
    }

    this.mouseBeamGeometry.setFromPoints([this.mouseBeamStart, this.mouseBeamEnd]);
    this.mouseBeam.visible = true;
  }

  updatePlayer(delta) {
    if (!this.player) {
      return;
    }

    if (performance.now() < this.inputEnabledAt) {
      // Ignore transient key states right after startup to avoid boot-time spin.
      this.keyboardInput.clear();
      return;
    }

    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    const respawnThreshold = Number.isFinite(this.respawnY) ? this.respawnY : -1000;
    if (this.player.position.y < respawnThreshold) {
      const spawnPosition = this.resolvePlayerSpawnFromManifest(this.currentManifest ?? {});
      if (spawnPosition) {
        this.spawnPlayerAt(spawnPosition);
        this.debugDisplay.Log(`Player fell below ${respawnThreshold} and respawned at the configured spawn point.`);
      }
    }

    const viewForward = new THREE.Vector3(-Math.sin(this.cameraState.yaw), 0, -Math.cos(this.cameraState.yaw));
    const viewRight = new THREE.Vector3(Math.cos(this.cameraState.yaw), 0, -Math.sin(this.cameraState.yaw));
    const move = new THREE.Vector3();

    if (this.keyboardInput.isDown('KeyW') || this.keyboardInput.isDown('ArrowUp')) move.add(viewForward);
    if (this.keyboardInput.isDown('KeyS') || this.keyboardInput.isDown('ArrowDown')) move.sub(viewForward);
    if (this.keyboardInput.isDown('KeyA') || this.keyboardInput.isDown('ArrowLeft')) move.sub(viewRight);
    if (this.keyboardInput.isDown('KeyD') || this.keyboardInput.isDown('ArrowRight')) move.add(viewRight);

    if (this.keyboardInput.consumePress('Space') && this.isGrounded) {
      this.jumpImpulseVector.set(0, this.playerState.jumpImpulse, 0);
      this.force.Impulse(this.playerRigidbody, this.jumpImpulseVector);
      this.isGrounded = false;
      this.debugDisplay.Log('Jump impulse applied.');
    }

    this.hasMoveInput = move.lengthSq() > 1e-8;
    if (this.hasMoveInput) {
      move.normalize();
      const speed = this.keyboardInput.isDown('ShiftLeft') || this.keyboardInput.isDown('ShiftRight')
        ? this.playerState.sprintSpeed
        : this.playerState.speed;
      this.player.position.addScaledVector(move, speed * delta);

      this.playerTargetYaw = this.normalizeAngle(Math.atan2(move.x, move.z));
    }

    const yawDelta = this.shortestAngleDelta(this.playerYaw, this.playerTargetYaw);
    const yawStep = yawDelta * Math.min(1, delta * this.playerState.rotationSpeed);
    this.playerYaw = this.normalizeAngle(this.playerYaw + yawStep);
    this.playerTargetYaw = this.normalizeAngle(this.playerTargetYaw);

    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    this.player.quaternion.copy(this.playerRotationQuaternion);

    this.isGrounded = this.playerRigidbody.integrate(this.player.position, delta, {
      groundY: this.playerState.groundY,
      collider: this.playerCollider,
      colliders: this.worldColliders,
    });
  }

  updatePlayerAnimation(delta) {
    this.animator.update(delta, {
      isGrounded: this.isGrounded,
      hasMoveInput: this.hasMoveInput,
      isSprinting: this.keyboardInput.isDown('ShiftLeft') || this.keyboardInput.isDown('ShiftRight'),
      walkSpeed: this.playerState.speed,
      sprintSpeed: this.playerState.sprintSpeed,
    });
  }

  updateCamera() {
    if (!this.player) {
      return;
    }

    this.cameraState.distance = THREE.MathUtils.clamp(
      this.cameraState.distance,
      this.cameraState.minDistance,
      this.cameraState.maxDistance
    );

    if (this.isFirstPersonView()) {
      this.setCameraNearPlane(this.cameraState.firstPersonNear);
      this.applyFirstPersonHeadLookOverride();
      this.resolveFirstPersonHeadPosition(this.headWorldPosition);
      this.camera.position.copy(this.headWorldPosition);
      this.camera.rotation.set(this.cameraState.pitch, this.cameraState.yaw, 0, 'YXZ');
      return;
    }

    this.clearFirstPersonHeadLookOverride();
    this.setCameraNearPlane(this.cameraState.thirdPersonNear);

    this.cameraPosition.set(
      Math.sin(this.cameraState.yaw) * this.cameraState.distance,
      this.cameraState.height,
      Math.cos(this.cameraState.yaw) * this.cameraState.distance
    );
    this.cameraPosition.add(this.player.position);
    this.camera.position.lerp(this.cameraPosition, 0.12);

    this.cameraTarget.set(this.player.position.x, this.player.position.y + 1.5, this.player.position.z);
    this.camera.lookAt(this.cameraTarget);
  }

  updateDebugDisplay() {
    if (!this.debugDisplay.enabled || !this.player) {
      return;
    }

    this.playerLookNormal.set(0, 0, 1).applyQuaternion(this.player.quaternion).normalize();
    this.camera.getWorldDirection(this.cameraForwardNormal).normalize();
    this.rotationEuler.setFromQuaternion(this.player.quaternion, 'XYZ');

    this.debugDisplay.update({
      position: this.player.position,
      rotationEulerRadians: this.rotationEuler,
      quaternion: this.player.quaternion,
      lookNormal: this.playerLookNormal,
      cameraForward: this.cameraForwardNormal,
      playerYawRadians: this.playerYaw,
      playerTargetYawRadians: this.playerTargetYaw,
      cameraYawRadians: this.cameraState.yaw,
      hasMoveInput: this.hasMoveInput,
      velocity: this.playerRigidbody.velocity,
      isGrounded: this.isGrounded,
      fps: this.performanceMonitor.FPS,
      cameraFar: this.camera.far,
    });
  }

  updateAdaptiveFrustum(delta) {
    const fps = this.performanceMonitor.update(delta);

    if (!this.isReducingFrustum && fps < this.minFPS) {
      this.isReducingFrustum = true;
      this.debugDisplay.LogWarning(`FPS dropped below ${this.minFPS}. Starting adaptive frustum reduction.`);
    }

    if (!this.isReducingFrustum) {
      return;
    }

    const targetFar = Math.max(
      this.minimumAdaptiveCameraFar,
      this.camera.far - this.frustumShrinkRatePerSecond * delta
    );

    if (targetFar !== this.camera.far) {
      this.camera.far = targetFar;
      this.camera.updateProjectionMatrix();
    }

    if (fps > 40) {
      this.isReducingFrustum = false;
      this.debugDisplay.Log('FPS rose above 40. Adaptive frustum reduction paused.');
    }
  }

  updateDistanceCulling() {
    if (!this.distanceCullingEnabled || this.distanceCullables.length === 0) {
      return;
    }

    const hideMargin = this.distanceCullingHysteresis;
    const showMargin = Math.max(0, this.distanceCullingHysteresis * 0.5);

    for (const entry of this.distanceCullables) {
      if (!entry?.root) {
        continue;
      }

      if (entry.ignoreCulling) {
        entry.root.visible = true;
        continue;
      }

      const hideDistance = this.distanceCullingMaxDistance + entry.radius + hideMargin;
      const showDistance = this.distanceCullingMaxDistance + entry.radius + showMargin;
      const distanceToCamera = this.camera.position.distanceTo(entry.center);

      if (entry.root.visible) {
        if (distanceToCamera > hideDistance) {
          entry.root.visible = false;
        }
        continue;
      }

      if (distanceToCamera < showDistance) {
        entry.root.visible = true;
      }
    }
  }

  resolveGroundYFromManifest(items) {
    const floorItem = (items ?? []).find((item) => item && item.type === 'floor');

    if (!floorItem) {
      return 0;
    }

    return floorItem.position?.[1] ?? 0;
  }

  applyPerformanceConfig(manifest) {
    const performanceConfig = manifest.performance ?? manifest.scene?.performance ?? {};
    const distanceCullingConfig = performanceConfig.distanceCulling ?? {};

    if (typeof distanceCullingConfig.enabled === 'boolean') {
      this.distanceCullingEnabled = distanceCullingConfig.enabled;
    }

    if (Number.isFinite(distanceCullingConfig.maxDistance) && distanceCullingConfig.maxDistance > 0) {
      this.distanceCullingMaxDistance = distanceCullingConfig.maxDistance;
    }

    if (Number.isFinite(distanceCullingConfig.hysteresis) && distanceCullingConfig.hysteresis >= 0) {
      this.distanceCullingHysteresis = distanceCullingConfig.hysteresis;
    }

    this.debugDisplay.Log(
      `Distance culling: enabled=${this.distanceCullingEnabled}, maxDistance=${this.distanceCullingMaxDistance.toFixed(1)}, hysteresis=${this.distanceCullingHysteresis.toFixed(1)}`
    );
  }

  applyControllerConfig(manifest) {
    const controllerConfig = manifest.controller ?? {};
    const physicsConfig = controllerConfig.physics ?? {};

    if (Number.isFinite(controllerConfig.jumpImpulse)) {
      this.playerState.jumpImpulse = controllerConfig.jumpImpulse;
    }

    if (Number.isFinite(physicsConfig.gravityY)) {
      this.playerState.gravityY = physicsConfig.gravityY;
    }

    if (Number.isFinite(physicsConfig.mass) && physicsConfig.mass > 0) {
      this.playerRigidbody.mass = physicsConfig.mass;
    }

    if (Number.isFinite(physicsConfig.linearDamping) && physicsConfig.linearDamping >= 0) {
      this.playerRigidbody.linearDamping = physicsConfig.linearDamping;
    }

    if (typeof physicsConfig.enableCollision === 'boolean') {
      this.playerRigidbody.enablePhysicsCollision = physicsConfig.enableCollision;
    }

    this.playerRigidbody.gravity.set(0, this.playerState.gravityY, 0);
    this.debugDisplay.Log(
      `Controller config: jumpImpulse=${this.playerState.jumpImpulse.toFixed(2)}, gravityY=${this.playerState.gravityY.toFixed(2)}, groundY=${this.playerState.groundY.toFixed(2)}, collision=${this.playerRigidbody.enablePhysicsCollision}`
    );
  }

  configureMeshCulling(root) {
    if (!root || typeof root.traverse !== 'function') {
      return;
    }

    root.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }

      child.frustumCulled = true;

      if (child.geometry) {
        if (!child.geometry.boundingSphere) {
          child.geometry.computeBoundingSphere();
        }

        if (!child.geometry.boundingBox) {
          child.geometry.computeBoundingBox();
        }
      }
    });
  }

  registerDistanceCullable(root, sceneKey = null, { ignoreCulling = false } = {}) {
    if (!this.distanceCullingEnabled || !root) {
      return;
    }

    if (ignoreCulling) {
      return;
    }

    const boundingBox = new THREE.Box3().setFromObject(root);
    if (boundingBox.isEmpty()) {
      return;
    }

    const boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
    if (!Number.isFinite(boundingSphere.radius) || boundingSphere.radius <= 0) {
      return;
    }

    this.distanceCullables.push({
      root,
      center: boundingSphere.center.clone(),
      radius: boundingSphere.radius,
      sceneKey,
      ignoreCulling,
    });
  }

  registerDistanceCullablesForObj(root, sceneKey = null, { ignoreCulling = false } = {}) {
    if (!this.distanceCullingEnabled || !root || typeof root.traverse !== 'function') {
      return;
    }

    if (ignoreCulling) {
      return;
    }

    root.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }

      this.registerDistanceCullable(child, sceneKey, { ignoreCulling });
    });
  }

  async processManifestObjects(items, {
    basePath,
    parentGroup = null,
    sceneKey = null,
    ancestry = new Set(),
  } = {}) {
    for (const item of items) {
      if (!item || !item.type) continue;

      if (this.isSceneReferenceItem(item)) {
        const referencePath = this.getSceneReferencePath(item);
        if (!referencePath) {
          this.debugDisplay.LogWarning('Scene reference object is missing manifestPath/path.');
          continue;
        }

        const streamEnabled = item.stream?.enabled === true;
        if (streamEnabled) {
          this.registerSceneStream(item, basePath, parentGroup);
          continue;
        }

        try {
          await this.loadSubScene(referencePath, basePath, {
            allowReload: false,
            sceneKey,
            parentGroup,
            ancestry,
          });
          this.debugDisplay.Log(`Loaded sub-scene ${this.resolveScenePath(referencePath, basePath)}`);
        } catch (error) {
          this.debugDisplay.LogError(`Failed to load sub-scene ${referencePath}: ${error?.message ?? error}`);
        }

        continue;
      }

      if (item.type === 'light') {
        const light = this.createManifestLight(item);
        if (light) {
          if (parentGroup) {
            parentGroup.add(light);
          } else {
            this.scene.add(light);
          }
        }
        continue;
      }

      if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder') {
        const mesh = this.createManifestObject(item);
        if (mesh) {
          if (parentGroup) {
            parentGroup.add(mesh);
          } else {
            this.scene.add(mesh);
          }

          if (item.type !== 'floor') {
            this.registerDistanceCullable(mesh, sceneKey, { ignoreCulling: item.ignoreCulling === true });
          }

          if (item.type === 'floor') {
            const floorSize = this.toVector3(item.size, new THREE.Vector3(120, 0.2, 120));
            this.registerColliderFromManifestItem(item, new THREE.Vector3(floorSize.x, 0.2, floorSize.y), { sceneKey });
          }

          if (item.type === 'box' || item.type === 'cube') {
            this.registerColliderFromManifestItem(item, this.toVector3(item.size, new THREE.Vector3(1, 1, 1)), { sceneKey });
          }

          if (item.type === 'cylinder') {
            const radius = item.radiusTop ?? item.radiusBottom ?? 0.2;
            this.registerColliderFromManifestItem(item, new THREE.Vector3(radius * 2, item.height ?? 0.8, radius * 2), { sceneKey });
          }
        }
        continue;
      }

      if (item.type !== 'obj') continue;

      const objPath = item.objPath ?? item.path;
      if (!objPath) continue;

      let model = null;
      try {
        model = await this.loadObjModel({
          objPath: this.resolveScenePath(objPath, basePath),
          mtlPath: item.mtlPath ? this.resolveScenePath(item.mtlPath, basePath) : undefined,
          materialName: item.material,
          materialRenderType: item.materialRenderType,
        });
      } catch (error) {
        this.debugDisplay.LogError(`Failed to load object ${objPath}: ${error?.message ?? error}`);
        continue;
      }

      if (!model) continue;

      model.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
      model.rotation.set(
        THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
      );
      model.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);

      model.traverse((child) => {
        if (child.isMesh) {
          child.frustumCulled = true;
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.configureMeshCulling(model);

      if (parentGroup) {
        parentGroup.add(model);
      } else {
        this.scene.add(model);
      }

      this.registerDistanceCullablesForObj(model, sceneKey, { ignoreCulling: item.ignoreCulling === true });
      this.registerColliderFromManifestItem(item, this.toVector3(item.scale, new THREE.Vector3(1, 1, 1)), {
        mesh: model,
        sceneKey,
      });
      this.debugDisplay.Log(`Loaded object ${item.name ?? objPath}`);
    }
  }

  createManifestObject(item) {
    if (item.type === 'floor') {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(item.size?.[0] ?? 120, item.size?.[1] ?? 120),
        new THREE.MeshStandardMaterial({
          color: item.color ? new THREE.Color(item.color).getHex() : 0x7fb069,
          roughness: item.roughness ?? 0.96,
          metalness: item.metalness ?? 0.08,
        })
      );
      mesh.receiveShadow = true;
      mesh.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(item.rotation?.[0] ?? -90),
        THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
      );
      this.configureMeshCulling(mesh);
      return mesh;
    }

    if (item.type === 'box' || item.type === 'cube') {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(
          item.size?.[0] ?? 1,
          item.size?.[1] ?? 1,
          item.size?.[2] ?? 1
        ),
        new THREE.MeshStandardMaterial({
          color: item.color ? new THREE.Color(item.color).getHex() : 0x8ecae6,
          roughness: item.roughness ?? 0.75,
          metalness: item.metalness ?? 0.15,
        })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
      );
      this.configureMeshCulling(mesh);
      return mesh;
    }

    if (item.type === 'cylinder') {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(
          item.radiusTop ?? 0.2,
          item.radiusBottom ?? 0.2,
          item.height ?? 0.8,
          item.radialSegments ?? 12
        ),
        new THREE.MeshStandardMaterial({
          color: item.color ? new THREE.Color(item.color).getHex() : 0x7bc9d9,
          roughness: item.roughness ?? 0.7,
          metalness: item.metalness ?? 0.15,
        })
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
      mesh.rotation.set(
        THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
        THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
      );
      this.configureMeshCulling(mesh);
      return mesh;
    }

    return null;
  }

  createManifestLight(item) {
    if (item.lightType === 'hemisphere') {
      const light = new THREE.HemisphereLight(
        item.color ? new THREE.Color(item.color).getHex() : 0xffffff,
        item.groundColor ? new THREE.Color(item.groundColor).getHex() : 0x243b3a,
        item.intensity ?? 1.5
      );
      light.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
      return light;
    }

    if (item.lightType === 'directional') {
      const light = new THREE.DirectionalLight(
        item.color ? new THREE.Color(item.color).getHex() : 0xffffff,
        item.intensity ?? 1.15
      );
      light.position.set(item.position?.[0] ?? 12, item.position?.[1] ?? 18, item.position?.[2] ?? 8);
      light.castShadow = item.castShadow ?? true;

      if (item.shadow) {
        const shadowConfig = item.shadow;
        light.shadow.mapSize.set(
          shadowConfig.mapSize?.[0] ?? 2048,
          shadowConfig.mapSize?.[1] ?? 2048
        );
        const cameraConfig = shadowConfig.camera ?? {};
        light.shadow.camera.left = cameraConfig.left ?? -25;
        light.shadow.camera.right = cameraConfig.right ?? 25;
        light.shadow.camera.top = cameraConfig.top ?? 25;
        light.shadow.camera.bottom = cameraConfig.bottom ?? -25;
        light.shadow.camera.near = cameraConfig.near ?? 0.5;
        light.shadow.camera.far = cameraConfig.far ?? 60;
      }

      return light;
    }

    return null;
  }

  async loadManifestScene() {
    const { manifest, resolvedPath } = await this.fetchManifest(this.manifestPath, this.manifestPath);
    this.currentManifest = manifest;
    const spawnPosition = this.resolvePlayerSpawnFromManifest(manifest);

    const sceneConfig = manifest.scene ?? {};
    const debugConfig = manifest.debug ?? sceneConfig.debug ?? {};
    const respawnConfig = manifest.respawn ?? {};
    const items = manifest.objects ?? [];

    this.respawnY = Number.isFinite(respawnConfig.fallBelowY) ? respawnConfig.fallBelowY : -1000;
    this.debugDisplay.setEnabled(debugConfig.enabled === true);
    this.debugDisplay.Log(`Debug display ${this.debugDisplay.enabled ? 'enabled' : 'disabled'} from manifest.`);
    this.worldColliders = [];
    this.distanceCullables = [];
    this.sceneStreams = [];
    this.loadedSubScenePaths.clear();

    this.applyPerformanceConfig(manifest);
    this.applyPlayerConfig(manifest, resolvedPath);
    await this.animator.preload();

    if (!spawnPosition) {
      const message = 'No valid player spawns were defined in scene-manifest.json under playerSpawns.';
      console.error(message);
      this.debugDisplay.LogError(message);
    } else {
      this.spawnPlayerAt(spawnPosition, { recreate: true });
      this.debugDisplay.Log(`Spawned player at (${spawnPosition.x.toFixed(2)}, ${spawnPosition.y.toFixed(2)}, ${spawnPosition.z.toFixed(2)}).`);
    }

    this.playerState.groundY = this.resolveGroundYFromManifest(items);
    this.applyControllerConfig(manifest);

    if (sceneConfig.background) {
      this.scene.background = new THREE.Color(sceneConfig.background);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(sceneConfig.background);
      }
    }

    await this.processManifestObjects(items, {
      basePath: resolvedPath,
      parentGroup: null,
      sceneKey: null,
      ancestry: new Set([resolvedPath]),
    });

    this.debugDisplay.Log(`Registered ${this.worldColliders.length} world collider(s).`);
  }

  isWindowMaterial(material) {
    const materialName = material?.name ?? '';
    return typeof materialName === 'string' && /window/i.test(materialName);
  }

  applyMaterialRenderType(material, renderType) {
    if (!material || this.isWindowMaterial(material)) {
      return;
    }

    const normalizedRenderType = (typeof renderType === 'string' ? renderType : 'cutout').toLowerCase();

    if (normalizedRenderType === 'transparent') {
      material.transparent = true;
      material.alphaTest = 0;
      material.depthWrite = false;
      material.needsUpdate = true;
      return;
    }

    if (normalizedRenderType === 'opaque') {
      material.transparent = false;
      material.alphaTest = 0;
      material.depthWrite = true;
      material.needsUpdate = true;
      return;
    }

    material.transparent = false;
    material.alphaTest = 0.5;
    material.depthWrite = true;
    material.needsUpdate = true;
  }

  async loadObjModel({ objPath, mtlPath, materialName, materialRenderType = 'cutout' }) {
    const loader = new OBJLoader();

    if (mtlPath) {
      const mtlLoader = new MTLLoader();
      const mtlMaterial = await mtlLoader.loadAsync(mtlPath);
      mtlMaterial.preload();
      loader.setMaterials(mtlMaterial);
    }

    const model = await loader.loadAsync(objPath);

    if (materialName) {
      const fallbackMaterial = this.materialCache.get(materialName) ?? new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.75,
        metalness: 0.15,
      });

      this.materialCache.set(materialName, fallbackMaterial);

      model.traverse((child) => {
        if (child.isMesh && child.material) {
          const materialArray = Array.isArray(child.material) ? child.material : [child.material];
          materialArray.forEach((entry) => {
            if (entry) {
              entry.color.copy(fallbackMaterial.color);
              entry.roughness = fallbackMaterial.roughness;
              entry.metalness = fallbackMaterial.metalness;
            }
          });
        }
      });
    }

    model.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }

      const materialArray = Array.isArray(child.material) ? child.material : [child.material];
      materialArray.forEach((entry) => {
        if (entry) {
          this.applyMaterialRenderType(entry, materialRenderType);
        }
      });
    });

    return model;
  }

  start() {
    if (this.isRunning) return;
    this.keyboardInput.clear();
    this.inputEnabledAt = performance.now() + 150;
    this.isRunning = true;
    if (!this.player) {
      this.debugDisplay.LogWarning('Controller loop started without a spawned player. Define playerSpawns in scene-manifest.json.');
    }
    this.debugDisplay.Log('Controller loop started.');
    this.tick();
  }

  tick() {
    if (!this.isRunning) return;

    requestAnimationFrame(this.tick);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.keyboardInput.consumePress('Escape') && this.isPointerLocked) {
      document.exitPointerLock();
    }

    this.updateMouseLook();
    this.updateAdaptiveFrustum(delta);
    this.updatePlayer(delta);
    this.updatePlayerAnimation(delta);
    this.updateCamera();
    this.updateSceneStreams();
    this.updateDistanceCulling();
    this.updateDebugDisplay();
    this.updateAimBeam();
    this.renderer.render(this.scene, this.camera);
  }

  async init() {
    await this.loadManifestScene();
    this.start();
  }
}