import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { KeyboardInput } from './KeyboardInput.js';
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

    this.app = document.querySelector(this.mountSelector);
    if (!this.app) {
      throw new Error(`Mount element not found for selector: ${this.mountSelector}`);
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8ecae6);
    this.scene.fog = new THREE.Fog(0x8ecae6, 12, 70);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(0, 4.5, 8.5);
    this.minimumAdaptiveCameraFar = 10;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.app.appendChild(this.renderer.domElement);

    this.player = null;

    this.clock = new THREE.Clock();
    this.keyboardInput = new KeyboardInput();
    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = new THREE.Vector3();
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
      distance: 7.5,
      height: 4.5,
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
    this.isRunning = false;
    this.inputEnabledAt = 0;

    this.onResize = this.onResize.bind(this);
    this.tick = this.tick.bind(this);

    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);

    this.keyboardInput.attach();
    this.attachEvents();
  }

  createPlayer() {
    const player = new THREE.Group();

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0xff6b6b, roughness: 0.65, metalness: 0.15 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    player.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 })
    );
    head.position.y = 1.3;
    head.castShadow = true;
    player.add(head);

    return player;
  }

  attachEvents() {
    window.addEventListener('resize', this.onResize);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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

  spawnPlayerAt(spawnPosition) {
    if (this.player) {
      this.scene.remove(this.player);
    }

    this.player = this.createPlayer();
    this.player.position.copy(spawnPosition);
    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    this.player.quaternion.copy(this.playerRotationQuaternion);
    this.playerRigidbody.velocity.set(0, 0, 0);
    this.scene.add(this.player);
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
      getAABB: (position, target) => built.collider.getAABB(position, target),
    });

    this.debugDisplay.Log(`Registered ${built.collider.type} for ${item.name ?? item.type}.`);
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

    const viewForward = new THREE.Vector3(-Math.sin(this.cameraState.yaw), 0, -Math.cos(this.cameraState.yaw));
    const viewRight = new THREE.Vector3(Math.cos(this.cameraState.yaw), 0, -Math.sin(this.cameraState.yaw));
    const move = new THREE.Vector3();

    if (this.keyboardInput.isDown('KeyA') || this.keyboardInput.isDown('ArrowLeft')) {
      this.cameraState.yaw += delta * 2.2;
    }
    if (this.keyboardInput.isDown('KeyD') || this.keyboardInput.isDown('ArrowRight')) {
      this.cameraState.yaw -= delta * 2.2;
    }

    this.cameraState.yaw = this.normalizeAngle(this.cameraState.yaw);

    if (this.keyboardInput.isDown('KeyW') || this.keyboardInput.isDown('ArrowUp')) move.add(viewForward);
    if (this.keyboardInput.isDown('KeyS') || this.keyboardInput.isDown('ArrowDown')) move.sub(viewForward);

    if (this.keyboardInput.isDown('KeyQ')) move.sub(viewRight);
    if (this.keyboardInput.isDown('KeyE')) move.add(viewRight);

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

    if (this.isGrounded) {
      this.player.position.y = this.playerState.groundY;
    }
  }

  updateCamera() {
    if (!this.player) {
      return;
    }

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

    if (!this.isReducingFrustum && fps < 15) {
      this.isReducingFrustum = true;
      this.debugDisplay.LogWarning('FPS dropped below 15. Starting adaptive frustum reduction.');
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
      this.debugDisplay.LogWarning('No floor object found in manifest. Falling back to groundY=0.');
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

  registerDistanceCullable(root, sceneKey = null) {
    if (!this.distanceCullingEnabled || !root) {
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
    });
  }

  registerDistanceCullablesForObj(root, sceneKey = null) {
    if (!this.distanceCullingEnabled || !root || typeof root.traverse !== 'function') {
      return;
    }

    root.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }

      this.registerDistanceCullable(child, sceneKey);
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
            this.registerDistanceCullable(mesh, sceneKey);
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

      this.registerDistanceCullablesForObj(model, sceneKey);
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
    const spawnPosition = this.resolvePlayerSpawnFromManifest(manifest);

    const sceneConfig = manifest.scene ?? {};
    const debugConfig = manifest.debug ?? sceneConfig.debug ?? {};
    const items = manifest.objects ?? [];

    this.debugDisplay.setEnabled(debugConfig.enabled === true);
    this.debugDisplay.Log(`Debug display ${this.debugDisplay.enabled ? 'enabled' : 'disabled'} from manifest.`);
    this.worldColliders = [];
    this.distanceCullables = [];
    this.sceneStreams = [];
    this.loadedSubScenePaths.clear();

    this.applyPerformanceConfig(manifest);

    if (!spawnPosition) {
      const message = 'No valid player spawns were defined in scene-manifest.json under playerSpawns.';
      console.error(message);
      this.debugDisplay.LogError(message);
    } else {
      this.spawnPlayerAt(spawnPosition);
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

  async loadObjModel({ objPath, mtlPath, materialName }) {
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
    this.updateAdaptiveFrustum(delta);
    this.updatePlayer(delta);
    this.updateCamera();
    this.updateSceneStreams();
    this.updateDistanceCulling();
    this.updateDebugDisplay();
    this.renderer.render(this.scene, this.camera);
  }

  async init() {
    await this.loadManifestScene();
    this.start();
  }
}