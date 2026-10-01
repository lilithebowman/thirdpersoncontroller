/**
 * ThirdPersonControllerApp.js
 *
 * Class: ThirdPersonControllerApp
 * Purpose: Acts as the core composition root and orchestrator for the third-person controller app.
 *          Coordinates SceneLoader, CameraController, PlayerCharacter, GameMenu, physics,
 *          input handling, raycasting, and the main animation render tick loop.
 * SOLID Principles:
 * - Single Responsibility: Coordinates subsystems and drives the game loop without bloated monolith logic.
 * - Dependency Inversion: Delegates domain responsibilities to specialized service classes.
 */

import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
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
import { GameMenu } from './GameMenu.js';
import { CameraController } from './CameraController.js';
import { PlayerCharacter } from './PlayerCharacter.js';
import { SceneLoader } from './SceneLoader.js';
import { Skybox } from './Skybox.js';
import { Loader } from './Loader.js';
import { MultiplayerService } from './MultiplayerService.js';
import { VoiceChatService } from './VoiceChatService.js';
import { normalizeSceneManifest } from './sceneManifest.js';

export class ThirdPersonControllerApp {
  /**
   * Creates a ThirdPersonControllerApp instance.
   * @param {Object} options - Configuration options
   * @param {string} [options.mountSelector='#app'] - DOM selector for mounting canvas
   * @param {string} [options.manifestPath='/scene-manifest.json'] - Path to scene JSON manifest
   */
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
    this.camera.position.set(0, 4.5, 8.5);
    this.audioListener = new THREE.AudioListener();
    this.camera.add(this.audioListener);
    this.minimumAdaptiveCameraFar = 10;

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.app.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.keyboardInput = new KeyboardInput();
    this.mouseInput = new MouseInput({ domElement: this.renderer.domElement });
    this.debugDisplay = new DebugDisplay({ parentElement: this.app, enabled: false });

    this.animator = new Animator({
      resolveScenePath: this.resolveScenePath.bind(this),
      configureMeshCulling: this.configureMeshCulling.bind(this),
      debugDisplay: this.debugDisplay,
    });

    this.cameraController = new CameraController({ camera: this.camera });
    this.playerCharacter = new PlayerCharacter({ animator: this.animator });
    this.sceneLoader = new SceneLoader({
      scene: this.scene,
      resolveScenePath: this.resolveScenePath.bind(this),
      configureMeshCulling: this.configureMeshCulling.bind(this),
      registerCollider: this.registerCollider.bind(this),
      registerDistanceCullable: this.registerDistanceCullable.bind(this),
      debugDisplay: this.debugDisplay,
    });

    this.voiceChatService = new VoiceChatService({
      onSpeakingChange: (isSpeaking) => {
        if (this.localSpeakerSprite) {
          this.localSpeakerSprite.visible = isSpeaking;
        }
      },
    });

    this.gameMenu = new GameMenu({
      mountElement: this.app,
      onRespawn: () => this.respawnPlayer(),
      onLog: (msg) => this.debugDisplay.Log(msg),
      onThresholdChange: (val) => this.voiceChatService.setThreshold(val),
    });

    this.localSpeakerSprite = null;

    this.loader = new Loader({
      mountElement: this.app,
      message: 'Loading 3D assets & scene...',
      type: 'spinner',
      visible: false,
    });

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
    this.directionalLights = [];
    this.jumpImpulseVector = new THREE.Vector3();

    this.playerState = {
      speed: 10,
      sprintSpeed: 18,
      rotationSpeed: 8,
      jumpImpulse: 8.8,
      gravityY: -26,
    };

    this.performanceMonitor = new PerformanceMonitor({ smoothing: 0.9, initialFPS: 60 });
    this.isReducingFrustum = false;
    this.frustumShrinkRatePerSecond = 160;
    this.distanceCullingEnabled = true;
    this.distanceCullingMaxDistance = 140;
    this.distanceCullingHysteresis = 12;
    this.distanceCullables = [];

    this.respawnY = -1000;
    this.isPointerLocked = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 60;
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

    this.isRunning = false;
    this.inputEnabledAt = 0;
    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion = new THREE.Quaternion();
    this.playerRotationAxis = new THREE.Vector3(0, 1, 0);
    this.hasMoveInput = false;
    this.isGrounded = true;

    this.multiplayerService = new MultiplayerService({
      onRemotePlayersUpdate: (players) => this.handleRemotePlayersUpdate(players),
    });
    this.remotePlayerMeshes = new Map();

    this.onResize = this.onResize.bind(this);
    this.onMouseWheel = this.onMouseWheel.bind(this);
    this.tick = this.tick.bind(this);

    this.keyboardInput.attach();
    this.mouseInput.attach();
    this.attachEvents();
  }

  /**
   * Resolves relative asset paths against manifest base URL.
   */
  resolveScenePath(referencePath, basePath = this.manifestPath) {
    const baseURL = new URL(basePath, window.location.origin);
    return new URL(referencePath, baseURL).toString();
  }

  /**
   * Attaches window resize, wheel, and pointer lock events.
   */
  attachEvents() {
    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('wheel', this.onMouseWheel, { passive: false });
    this.renderer.domElement.addEventListener('click', () => {
      if (!this.gameMenu.isOpen && !this.isPointerLocked) {
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
    if (this.renderer.xr.isPresenting) {
      return;
    }
    const zoomDelta = event.deltaY * this.cameraController.state.zoomStep;
    this.cameraController.state.distance = THREE.MathUtils.clamp(
      this.cameraController.state.distance + zoomDelta,
      this.cameraController.state.minDistance,
      this.cameraController.state.maxDistance
    );
  }

  /**
   * Respawns the player at the configured spawn position.
   */
  respawnPlayer() {
    const spawnPosition = this.resolvePlayerSpawnFromManifest(this.currentManifest ?? {}) || new THREE.Vector3(0, 0, 0);
    this.spawnPlayerAt(spawnPosition);
  }

  spawnPlayerAt(spawnPosition) {
    this.playerCharacter.spawn(this.scene, spawnPosition);
    this.playerYaw = 0;
    this.playerTargetYaw = 0;
    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    this.playerCharacter.root.quaternion.copy(this.playerRotationQuaternion);
    this.playerRigidbody.velocity.set(0, 0, 0);
    this.animator.resetActions();

    if (!this.localSpeakerSprite) {
      this.localSpeakerSprite = this.createSpeakerSprite();
      this.localSpeakerSprite.position.set(0, 2.2, 0);
    }
    if (this.playerCharacter.root && !this.localSpeakerSprite.parent) {
      this.playerCharacter.root.add(this.localSpeakerSprite);
    }

    if (this.multiplayerService.guid) {
      this.voiceChatService.init(this.multiplayerService.guid);
    } else {
      this.multiplayerService.register().then((guid) => {
        this.voiceChatService.init(guid);
      });
    }
  }

  createSpeakerSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔊', 32, 32);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(0.6, 0.6, 0.6);
    sprite.visible = false;
    return sprite;
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

  registerCollider(colliderEntry) {
    this.worldColliders.push(colliderEntry);
  }

  registerDistanceCullable(cullableEntry) {
    this.distanceCullables.push(cullableEntry);
  }

  registerDistanceCullablesForObj(root, sceneKey = null, { ignoreCulling = false } = {}) {
    if (!this.distanceCullingEnabled || !root || typeof root.traverse !== 'function' || ignoreCulling) {
      return;
    }
    root.traverse((child) => {
      if (!child?.isMesh) {
        return;
      }
      const boundingBox = new THREE.Box3().setFromObject(child);
      if (!boundingBox.isEmpty()) {
        const boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
        if (Number.isFinite(boundingSphere.radius) && boundingSphere.radius > 0) {
          this.distanceCullables.push({
            root: child,
            center: boundingSphere.center.clone(),
            radius: boundingSphere.radius,
            sceneKey,
          });
        }
      }
    });
  }

  buildManifestCollider(colliderConfig, fallbackPosition, fallbackSize, context = {}) {
    if (!colliderConfig || !colliderConfig.type) {
      return null;
    }
    const offset = this.sceneLoader.toVector3(colliderConfig.offset, new THREE.Vector3(0, 0, 0));
    const position = this.sceneLoader.toVector3(colliderConfig.position, fallbackPosition);
    const physicsCollision = colliderConfig.physicsCollision !== false;

    if (colliderConfig.type === 'box') {
      const size = this.sceneLoader.toVector3(colliderConfig.size, fallbackSize);
      return {
        position,
        collider: new BoxCollider({ size, offset, physicsCollision }),
      };
    }
    if (colliderConfig.type === 'sphere') {
      const radius = colliderConfig.radius ?? 0.5;
      return {
        position,
        collider: new SphereCollider({ radius, offset, physicsCollision }),
      };
    }
    if (colliderConfig.type === 'mesh') {
      const mesh = context.mesh ?? null;
      return {
        position,
        collider: new MeshCollider({ mesh, offset, physicsCollision }),
      };
    }
    return null;
  }

  registerColliderFromManifestItem(item, fallbackSize, context = {}) {
    if (!item.collider) {
      return;
    }
    const fallbackPosition = this.sceneLoader.toVector3(item.position, new THREE.Vector3());
    const built = this.buildManifestCollider(item.collider, fallbackPosition, fallbackSize, context);
    if (!built) {
      return;
    }
    this.worldColliders.push({
      position: built.position,
      physicsCollision: built.collider.physicsCollision,
      collider: built.collider,
      sceneKey: context.sceneKey ?? null,
      getBounds: (position, target) => built.collider.getBounds(position, target),
    });
  }

  async processManifestObjects(items) {
    for (const item of items) {
      if (!item || !item.type) {
        continue;
      }

      if (item.type === 'light') {
        const light = this.sceneLoader.createManifestLight(item);
        if (light) {
          light.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
          if (light.isDirectionalLight && light.castShadow) {
            light.userData.offset = light.position.clone();
            this.directionalLights.push(light);
          }
          this.scene.add(light);
        }
        continue;
      }

      if (item.type === 'skybox') {
        const skyboxHandler = new Skybox({
          scene: this.scene,
          resolveScenePath: this.resolveScenePath.bind(this),
          debugDisplay: this.debugDisplay,
        });
        await skyboxHandler.apply(item);
        continue;
      }

      if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder') {
        const mesh = this.sceneLoader.createPrimitiveMesh(item);
        if (mesh) {
          mesh.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
          mesh.rotation.set(
            THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
          );
          mesh.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);
          this.scene.add(mesh);
          this.registerDistanceCullablesForObj(mesh, null, { ignoreCulling: item.ignoreCulling === true });
          const fallbackSize = item.type === 'floor'
            ? new THREE.Vector3(120, 0.2, 120)
            : this.sceneLoader.toVector3(item.size, new THREE.Vector3(1, 1, 1));
          this.registerColliderFromManifestItem(item, fallbackSize);
        }
        continue;
      }

      if (item.type === 'obj') {
        const objPath = item.objPath ?? item.path;
        if (!objPath) {
          continue;
        }
        try {
          const model = await this.sceneLoader.loadObjModel({
            objPath,
            mtlPath: item.mtlPath,
            materialRenderType: item.materialRenderType ?? 'cutout',
          });
          model.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
          model.rotation.set(
            THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
          );
          model.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);
          this.scene.add(model);
          this.registerDistanceCullablesForObj(model, null, { ignoreCulling: item.ignoreCulling === true });
          this.registerColliderFromManifestItem(item, this.sceneLoader.toVector3(item.scale, new THREE.Vector3(1, 1, 1)), { mesh: model });
        } catch (error) {
          this.debugDisplay.LogError(`Failed to load OBJ model ${objPath}: ${error?.message ?? error}`);
        }
      }
    }
  }

  async loadManifestScene() {
    const { manifest, resolvedPath } = await this.sceneLoader.fetchManifest(this.manifestPath, this.manifestPath);
    this.currentManifest = normalizeSceneManifest(manifest);
    const spawnPosition = this.resolvePlayerSpawnFromManifest(this.currentManifest);

    const sceneConfig = this.currentManifest.scene ?? {};
    const debugConfig = this.currentManifest.debug ?? sceneConfig.debug ?? {};
    const respawnConfig = this.currentManifest.respawn ?? {};
    const items = this.currentManifest.objects ?? [];

    this.respawnY = Number.isFinite(respawnConfig.fallBelowY) ? respawnConfig.fallBelowY : -1000;
    this.debugDisplay.setEnabled(debugConfig.enabled === true);

    this.renderer.xr.enabled = true;
    const existingVrButton = document.getElementById('VRButton');
    if (!existingVrButton) {
      const vrButton = VRButton.createButton(this.renderer);
      if (vrButton) {
        const isDebugEnabled = debugConfig.enabled === true;
        if ('xr' in navigator && navigator.xr?.isSessionSupported) {
          navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported || isDebugEnabled) {
              if (!document.getElementById('VRButton')) {
                document.body.appendChild(vrButton);
              }
            }
          }).catch(() => {
            if (isDebugEnabled) {
              if (!document.getElementById('VRButton')) {
                document.body.appendChild(vrButton);
              }
            }
          });
        } else {
          if (isDebugEnabled) {
            document.body.appendChild(vrButton);
          }
        }
      }
    }

    const playerConfig = manifest.player ?? {};
    this.animator.applyModelConfig(playerConfig.model ?? {}, resolvedPath);
    const eyePosition = this.sceneLoader.toVector3(playerConfig.eyePosition, new THREE.Vector3(0, 1.6, 0));
    this.cameraController.setEyePosition(eyePosition);
    await this.animator.preload();

    if (spawnPosition) {
      this.spawnPlayerAt(spawnPosition);
    }

    if (sceneConfig.background) {
      this.scene.background = new THREE.Color(sceneConfig.background);
      if (this.scene.fog) {
        this.scene.fog.color = new THREE.Color(sceneConfig.background);
      }
    }

    this.skybox = new Skybox({
      scene: this.scene,
      resolveScenePath: this.resolveScenePath.bind(this),
      debugDisplay: this.debugDisplay,
    });
    const skyboxConfig = sceneConfig.skybox ?? manifest.skybox;
    if (skyboxConfig && (typeof skyboxConfig === 'object' && Object.keys(skyboxConfig).length > 0)) {
      await this.skybox.apply(skyboxConfig);
    }

    await this.processManifestObjects(items);
  }

  updateMouseLook() {
    if (!this.isPointerLocked) {
      return;
    }

    const { deltaX, deltaY } = this.mouseInput.consumeLookDelta();
    if (Math.abs(deltaX) > 0) {
      this.cameraController.state.yaw -= deltaX * 0.0025;
      this.cameraController.state.yaw = THREE.MathUtils.euclideanModulo(this.cameraController.state.yaw + Math.PI, Math.PI * 2) - Math.PI;
    }

    if (Math.abs(deltaY) > 0 && this.cameraController.isFirstPerson()) {
      this.cameraController.state.pitch = THREE.MathUtils.clamp(
        this.cameraController.state.pitch + deltaY * 0.0022,
        this.cameraController.state.minPitch,
        this.cameraController.state.maxPitch
      );
    } else if (Math.abs(deltaY) > 0) {
      this.cameraController.state.height = THREE.MathUtils.clamp(
        this.cameraController.state.height - deltaY * 0.01,
        2.4,
        10
      );
    }
  }

  updatePlayer(delta) {
    const playerRoot = this.playerCharacter.root;
    if (!playerRoot) {
      return;
    }

    if (performance.now() < this.inputEnabledAt) {
      this.keyboardInput.clear();
      return;
    }

    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    if (playerRoot.position.y < this.respawnY) {
      this.respawnPlayer();
    }

    const viewForward = new THREE.Vector3(-Math.sin(this.cameraController.state.yaw), 0, -Math.cos(this.cameraController.state.yaw));
    const viewRight = new THREE.Vector3(Math.cos(this.cameraController.state.yaw), 0, -Math.sin(this.cameraController.state.yaw));
    const move = new THREE.Vector3();

    if (this.keyboardInput.isDown('KeyW') || this.keyboardInput.isDown('ArrowUp')) move.add(viewForward);
    if (this.keyboardInput.isDown('KeyS') || this.keyboardInput.isDown('ArrowDown')) move.sub(viewForward);
    if (this.keyboardInput.isDown('KeyA') || this.keyboardInput.isDown('ArrowLeft')) move.sub(viewRight);
    if (this.keyboardInput.isDown('KeyD') || this.keyboardInput.isDown('ArrowRight')) move.add(viewRight);

    if (this.keyboardInput.consumePress('Space') && this.isGrounded) {
      this.jumpImpulseVector.set(0, this.playerState.jumpImpulse, 0);
      this.force.Impulse(this.playerRigidbody, this.jumpImpulseVector);
      this.isGrounded = false;
    }

    this.hasMoveInput = move.lengthSq() > 1e-8;
    if (this.hasMoveInput) {
      move.normalize();
      const speed = this.keyboardInput.isDown('ShiftLeft') || this.keyboardInput.isDown('ShiftRight')
        ? this.playerState.sprintSpeed
        : this.playerState.speed;
      this.playerRigidbody.velocity.x = move.x * speed;
      this.playerRigidbody.velocity.z = move.z * speed;
      this.playerTargetYaw = THREE.MathUtils.euclideanModulo(Math.atan2(move.x, move.z) + Math.PI, Math.PI * 2) - Math.PI;
    } else {
      this.playerRigidbody.velocity.x = 0;
      this.playerRigidbody.velocity.z = 0;
    }

    if (this.cameraController.isFirstPerson()) {
      this.playerYaw = THREE.MathUtils.euclideanModulo(this.cameraController.state.yaw + Math.PI + Math.PI, Math.PI * 2) - Math.PI;
      this.playerTargetYaw = this.playerYaw;
    } else {
      const yawDelta = this.playerTargetYaw - this.playerYaw;
      const shortestDelta = ((yawDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
      const yawStep = shortestDelta * Math.min(1, delta * this.playerState.rotationSpeed);
      this.playerYaw = THREE.MathUtils.euclideanModulo(this.playerYaw + yawStep + Math.PI, Math.PI * 2) - Math.PI;
    }

    this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    playerRoot.quaternion.copy(this.playerRotationQuaternion);

    this.isGrounded = this.playerRigidbody.integrate(playerRoot.position, delta, {
      collider: this.playerCollider,
      colliders: this.worldColliders,
    });

    const playerPos = playerRoot.position;
    for (const light of this.directionalLights) {
      const offset = light.userData.offset;
      if (offset) {
        light.position.copy(playerPos).add(offset);
        light.target.position.copy(playerPos);
        light.target.updateMatrixWorld();
      }
    }

    this.multiplayerService.updateLocalTransform({
      position: playerRoot.position,
      rotation: playerRoot.quaternion,
      yaw: this.playerYaw,
      animationState: this.hasMoveInput ? (this.keyboardInput.isDown('ShiftLeft') ? 'sprint' : 'walk') : 'idle',
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

  updateAdaptiveFrustum(delta) {
    const fps = this.performanceMonitor.update(delta);
    if (!this.isReducingFrustum && fps < this.minFPS) {
      this.isReducingFrustum = true;
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
    }
  }

  start() {
    if (this.isRunning) {
      return;
    }
    this.keyboardInput.clear();
    this.inputEnabledAt = performance.now() + 150;
    this.isRunning = true;
    this.multiplayerService.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  tick() {
    if (!this.isRunning) {
      return;
    }

    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.keyboardInput.consumePress('Escape')) {
      this.gameMenu.toggle();
    }

    if (this.gameMenu.isOpen) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.isPointerLocked && document.pointerLockElement === this.renderer.domElement) {
      this.isPointerLocked = true;
    }

    if (this.renderer.xr.isPresenting) {
      this.cameraController.state.distance = this.cameraController.state.firstPersonDistanceThreshold;
    }

    this.updateMouseLook();
    this.updateAdaptiveFrustum(delta);
    this.updatePlayer(delta);
    this.updatePlayerAnimation(delta);
    this.updateRemotePlayerMeshes(delta);
    this.cameraController.update(this.playerCharacter.root, { isPresenting: this.renderer.xr.isPresenting });

    if (this.cameraController.isFirstPerson() || this.renderer.xr.isPresenting) {
      this.cameraController.headLookBaseLocalQuaternion?.copy?.(this.playerCharacter.headBone?.quaternion ?? new THREE.Quaternion());
      this.cameraController.applyHeadLookOverride(this.playerCharacter.headBone, this.playerYaw);
    } else {
      this.cameraController.clearHeadLookOverride(this.playerCharacter.headBone);
    }

    this.renderer.render(this.scene, this.camera);
  }

  handleRemotePlayersUpdate(players) {
    const activeGuids = new Set(players.map((p) => p.guid));

    for (const [guid, meshGroup] of this.remotePlayerMeshes.entries()) {
      if (!activeGuids.has(guid)) {
        this.scene.remove(meshGroup);
        meshGroup.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
        this.remotePlayerMeshes.delete(guid);
      }
    }

    for (const p of players) {
      let meshGroup = this.remotePlayerMeshes.get(p.guid);
      if (!meshGroup) {
        meshGroup = this.createRemotePlayerVisual();
        this.scene.add(meshGroup);
        this.remotePlayerMeshes.set(p.guid, meshGroup);
      }

      meshGroup.userData.targetPosition = new THREE.Vector3(p.position.x, p.position.y, p.position.z);
      if (p.rotation) {
        meshGroup.userData.targetQuaternion = new THREE.Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
      }

      if (p.voiceData && p.voiceData.timestamp > meshGroup.userData.lastAudioTimestamp) {
        meshGroup.userData.lastAudioTimestamp = p.voiceData.timestamp;
        try {
          const positionalAudio = meshGroup.userData.positionalAudio;
          const audio = new Audio(p.voiceData.audioBase64);
          audio.volume = 1.0;
          if (positionalAudio) {
            positionalAudio.setMediaElementSource(audio);
          }
          audio.play().catch(() => {});
          if (meshGroup.userData.speakerSprite) {
            meshGroup.userData.speakerSprite.visible = true;
            audio.onended = () => {
              if (meshGroup.userData.speakerSprite) {
                meshGroup.userData.speakerSprite.visible = false;
              }
            };
          }
        } catch (err) {
          // ignore
        }
      }
    }
  }

  createRemotePlayerVisual() {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.6, metalness: 0.2 })
    );
    body.position.y = 0.55;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.8 })
    );
    head.position.y = 1.3;
    head.castShadow = true;
    group.add(head);

    const speakerSprite = this.createSpeakerSprite();
    speakerSprite.position.set(0, 2.2, 0);
    group.add(speakerSprite);
    group.userData.speakerSprite = speakerSprite;
    group.userData.lastAudioTimestamp = 0;

    if (this.audioListener) {
      const positionalAudio = new THREE.PositionalAudio(this.audioListener);
      positionalAudio.setRefDistance(1);
      positionalAudio.setMaxDistance(50);
      positionalAudio.setRolloffFactor(1);
      group.add(positionalAudio);
      group.userData.positionalAudio = positionalAudio;
    }

    return group;
  }

  updateRemotePlayerMeshes(delta) {
    const lerpFactor = Math.min(1, delta * 12);
    for (const [guid, meshGroup] of this.remotePlayerMeshes.entries()) {
      if (meshGroup.userData.targetPosition) {
        meshGroup.position.lerp(meshGroup.userData.targetPosition, lerpFactor);
      }
      if (meshGroup.userData.targetQuaternion) {
        meshGroup.quaternion.slerp(meshGroup.userData.targetQuaternion, lerpFactor);
      }
    }
  }

  async init() {
    this.loader.show('Loading 3D assets & scene...');
    try {
      await this.loadManifestScene();
      this.start();
    } finally {
      this.loader.hide();
    }
  }
}
