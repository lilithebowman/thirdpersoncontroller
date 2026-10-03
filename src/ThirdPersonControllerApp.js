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
import { PlayerAnimationController } from './PlayerAnimationController.js';
import { QuaternionController } from './QuaternionController.js';
import { KeyboardInput } from './KeyboardInput.js';
import { MouseInput } from './MouseInput.js';
import { DebugDisplay } from './DebugDisplay.js';
import { Rigidbody } from './Rigidbody.js';
import { Force } from './Force.js';
import { BoxCollider } from './BoxCollider.js';
import { SphereCollider } from './SphereCollider.js';
import { CapsuleCollider } from './CapsuleCollider.js';
import { MeshCollider } from './MeshCollider.js';
import { PerformanceMonitor } from './PerformanceMonitor.js';
import { GameMenu } from './GameMenu.js';
import { CameraController } from './CameraController.js';
import { PlayerCharacter } from './PlayerCharacter.js';
import { PlayerModel } from './PlayerModel.js';
import { SceneLoader } from './SceneLoader.js';
import { Skybox } from './Skybox.js';
import { Loader } from './Loader.js';
import { MultiplayerService } from './MultiplayerService.js';
import { VoiceChatService } from './VoiceChatService.js';
import { Clickable } from './Clickable.js';
import { Pickup } from './Pickup.js';
import { AnimationClipPlayer } from './AnimationClipPlayer.js';
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
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.xr.enabled = true;
    this.app.appendChild(this.renderer.domElement);

    this.clock = new THREE.Timer();
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
    this.playerAnimationController = new PlayerAnimationController({ animator: this.animator });
    this.playerRotationController = new QuaternionController({ yaw: 0, lerpFactor: 0.12 });
    this.playerModel = null;
    this.sceneLoader = new SceneLoader({
      scene: this.scene,
      resolveScenePath: this.resolveScenePath.bind(this),
      configureMeshCulling: this.configureMeshCulling.bind(this),
      registerCollider: this.registerCollider.bind(this),
      registerDistanceCullable: this.registerDistanceCullable.bind(this),
      debugDisplay: this.debugDisplay,
    });

    this.voiceMuteButton = this.createVoiceMuteButton();
    this.voiceChatService = new VoiceChatService({
      onSpeakingChange: (isSpeaking) => {
        if (this.localSpeakerSprite) {
          this.localSpeakerSprite.visible = !this.voiceChatService.isMuted && isSpeaking;
        }
      },
      onMutedChange: (isMuted) => {
        this.updateVoiceMuteButton(isMuted);
      },
    });

    this.gameMenu = new GameMenu({
      mountElement: this.app,
      onRespawn: () => this.respawnPlayer(),
      onLog: (msg) => this.debugDisplay.Log(msg),
      onThresholdChange: (val) => this.voiceChatService.setThreshold(val),
      onSelectPlayerModel: async (file, eyeOffset) => this.selectPlayerModel(file, eyeOffset),
      onEyeOffsetChange: (offset) => {
        const eyePosition = new THREE.Vector3(offset.x ?? 0, offset.y ?? 1.6, offset.z ?? 0);
        this.cameraController.setEyePosition(eyePosition);
      },
      onPlayerTokenChange: (token) => {
        const nextToken = this.multiplayerService?.normalizeGuid?.(token) ?? token;
        if (!nextToken) {
          return;
        }
        this.multiplayerService.setGuid(nextToken, true);
        this.voiceChatService?.init?.(this.multiplayerService.guid);
        this.restorePersistedPlayerState().catch(() => {});
      },
      onPlayerNameChange: (name) => {
        this.playerName = name;
      },
    });

    this.localSpeakerSprite = null;

    this.loader = new Loader({
      mountElement: this.app,
      message: 'Loading 3D assets & scene...',
      type: 'spinner',
      visible: false,
    });

    this.force = new Force();
    this.animationPlayers = [];
    this.playerRigidbody = new Rigidbody({
      mass: 1,
      gravity: new THREE.Vector3(0, -26, 0),
      linearDamping: 0,
      enablePhysicsCollision: true,
    });
    this.playerCollider = new CapsuleCollider({
      radius: 0.45,
      height: 1.7,
      offset: new THREE.Vector3(0, 0.85, 0),
      physicsCollision: true,
      maxWalkableSlope: 0.2,
    });

    this.worldColliders = [];
    this.dynamicRigidbodies = [];
    this.pickups = [];
    this.currentHeldPickup = null;
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
    this.pendingWorldLoadSound = null;

    this.respawnY = -1000;
    this.isPointerLocked = false;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 60;
    this.clickable = new Clickable({
      camera: this.camera,
      raycaster: this.raycaster,
      onTeleport: (destination) => this.spawnPlayerAt(destination),
      onPickup: (data) => this.handlePickupInteraction(data),
    });
    this.viewRayPointer = new THREE.Vector2(0, 0);
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
      new THREE.SphereGeometry(0.04, 10, 10),
      new THREE.MeshBasicMaterial({
        color: 0x00f5ff,
        transparent: true,
        opacity: 0.45,
        depthTest: false,
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
    this.xrForward = new THREE.Vector3();
    this.hasMoveInput = false;
    this.isGrounded = true;

    this.multiplayerService = new MultiplayerService({
      onRemotePlayersUpdate: async (players) => this.handleRemotePlayersUpdate(players),
    });
    this.remotePlayerMeshes = new Map();
    this.remotePlayersHud = document.getElementById('remote-players-hud');

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
    this.renderer.domElement.addEventListener('click', (event) => {
      if (this.audioListener && this.audioListener.context && this.audioListener.context.state === 'suspended') {
        this.audioListener.context.resume();
      }
      if (this.pendingWorldLoadSound && !this.pendingWorldLoadSound.isPlaying) {
        try {
          this.pendingWorldLoadSound.play();
          this.pendingWorldLoadSound = null;
        } catch (e) {
          // ignore
        }
      }
      if (!this.gameMenu.isOpen && !this.isPointerLocked) {
        this.renderer.domElement.requestPointerLock();
      }
    });
    document.addEventListener('pointerlockchange', this.onPointerLockChange.bind(this));
  }

  createVoiceMuteButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'voice-toggle-button';
    button.setAttribute('aria-label', 'Voice chat enabled');
    button.addEventListener('click', () => {
      this.voiceChatService?.toggleMuted();
    });
    this.voiceMuteButton = button;
    this.app.appendChild(button);
    this.updateVoiceMuteButton(false);
    return button;
  }

  updateVoiceMuteButton(isMuted = false) {
    if (!this.voiceMuteButton) {
      return;
    }

    const muted = Boolean(isMuted);
    this.voiceMuteButton.textContent = muted ? '🔇' : '🔊';
    this.voiceMuteButton.classList.toggle('is-muted', muted);
    this.voiceMuteButton.setAttribute('aria-pressed', String(muted));
    this.voiceMuteButton.setAttribute('aria-label', muted ? 'Voice chat muted' : 'Voice chat enabled');
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

  isDescendantOf(object, ancestor) {
    if (!object || !ancestor) {
      return false;
    }

    let current = object;
    while (current) {
      if (current === ancestor) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  getViewRaycastHit() {
    this.raycaster.setFromCamera(this.viewRayPointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.scene.children, true);

    for (const hit of intersections) {
      const object = hit?.object;
      if (!object || !hit.point) {
        continue;
      }

      if (object === this.hitMarker || object === this.mouseBeam) {
        continue;
      }

      if (object.parent?.userData?.clickableOutline === object) {
        continue;
      }

      if (this.playerCharacter?.root && this.isDescendantOf(object, this.playerCharacter.root)) {
        continue;
      }

      return hit;
    }

    return null;
  }

  updateRightClickHitMarker() {
    const hit = this.getViewRaycastHit();
    if (!hit) {
      this.hitMarker.visible = false;
      return;
    }

    this.hitMarker.position.copy(hit.point);
    this.hitMarker.visible = true;
  }

  updatePickups() {
    const playerRoot = this.playerCharacter?.root ?? null;
    if (!playerRoot) {
      return;
    }

    for (const entry of this.pickups) {
      entry.instance?.update(playerRoot, this.scene);
    }
  }

  updateDynamicRigidbodies(delta) {
    if (!Number.isFinite(delta) || delta <= 0) {
      return;
    }

    const playerRoot = this.playerCharacter?.root ?? null;
    for (const entry of this.dynamicRigidbodies) {
      const { object, rigidbody } = entry;
      if (!object || !rigidbody || !object.userData?.collider) {
        continue;
      }

      const isHeldByPlayer = this.currentHeldPickup?.object === object || (playerRoot && this.isDescendantOf(object, playerRoot));
      if (isHeldByPlayer) {
        rigidbody.useGravity = false;
        rigidbody.velocity.set(0, 0, 0);
        continue;
      }

      rigidbody.useGravity = Boolean(rigidbody.gravityVector || rigidbody.gravity !== 0 || rigidbody.useGravity !== false);
      rigidbody.integrate(object.position, delta, {
        collider: object.userData.collider,
        colliders: this.worldColliders,
      });

      if (playerRoot && this.playerCollider && this.playerRigidbody) {
        const playerBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
        const bodyBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
        this.playerCollider.getBounds(playerRoot.position, playerBounds);
        object.userData.collider.getBounds(object.position, bodyBounds);
        const intersects = !(
          playerBounds.max.x <= bodyBounds.min.x ||
          playerBounds.min.x >= bodyBounds.max.x ||
          playerBounds.max.y <= bodyBounds.min.y ||
          playerBounds.min.y >= bodyBounds.max.y ||
          playerBounds.max.z <= bodyBounds.min.z ||
          playerBounds.min.z >= bodyBounds.max.z
        );

        if (intersects) {
          const normal = new THREE.Vector3().subVectors(object.position, playerRoot.position).normalize();
          if (normal.lengthSq() > 0) {
            rigidbody.resolveRigidBodyCollision(this.playerRigidbody, object.position, playerRoot.position, normal);
          }
        }
      }
    }
  }

  /**
   * Respawns the player at the configured spawn position.
   */
  respawnPlayer() {
    const spawnPosition = this.resolvePlayerSpawnFromManifest(this.currentManifest ?? {}) || new THREE.Vector3(0, 0, 0);
    this.spawnPlayerAt(spawnPosition);
  }

  async restorePersistedPlayerState() {
    if (!this.multiplayerService) {
      return;
    }

    try {
      const guid = await this.multiplayerService.ensureGuid();
      if (!guid) {
        return;
      }

      const session = await this.multiplayerService.restoreSession();
      if (!session) {
        return;
      }

      if (this.playerCharacter?.root && session.position) {
        this.playerCharacter.root.position.set(session.position.x ?? 0, session.position.y ?? 0, session.position.z ?? 0);
      }

      if (typeof session.yaw === 'number') {
        this.playerYaw = session.yaw;
        this.playerTargetYaw = session.yaw;
        this.playerRotationController.setYaw(this.playerYaw);
        this.playerRotationQuaternion.copy(this.playerRotationController.quaternion);
        if (this.playerCharacter?.root) {
          this.playerCharacter.root.quaternion.copy(this.playerRotationQuaternion);
        }
      }

      const restoredModelPayload = session.model ?? this.readLocalStoragePlayerModel();
      if (restoredModelPayload && !this.playerModel) {
        const restoredModel = await PlayerModel.fromDataUrl(restoredModelPayload);
        this.playerModel = restoredModel;
        await this.animator.applyCustomPlayerModel(restoredModel);

        if (restoredModel.eyePosition) {
          const nextEyeOffset = new THREE.Vector3(
            restoredModel.eyePosition.x ?? 0,
            restoredModel.eyePosition.y ?? 1.6,
            restoredModel.eyePosition.z ?? 0,
          );
          this.gameMenu?.setEyeOffset?.(nextEyeOffset);
          this.cameraController.setEyePosition(nextEyeOffset);
        }
      }
    } catch (error) {
      console.warn('Unable to restore persisted player session:', error);
    }
  }

  spawnPlayerAt(spawnPosition) {
    this.playerCharacter.spawn(this.scene, spawnPosition);
    this.syncPickupAnchors();
    this.playerYaw = this.cameraController ? this.cameraController.state.yaw : 0;
    this.playerTargetYaw = this.playerYaw;
    this.playerRotationController.setYaw(this.playerYaw);
    this.playerRotationQuaternion.copy(this.playerRotationController.quaternion);
    this.playerCharacter.root.quaternion.copy(this.playerRotationQuaternion);
    this.playerRigidbody.velocity.set(0, 0, 0);
    this.playerAnimationController.reset();

    if (!this.localSpeakerSprite) {
      this.localSpeakerSprite = this.createSpeakerSprite();
      this.localSpeakerSprite.position.set(0, 2.2, 0);
    }
    if (this.playerCharacter.root && !this.localSpeakerSprite.parent) {
      this.playerCharacter.root.add(this.localSpeakerSprite);
    }

    this.multiplayerService.ensureGuid().then((guid) => {
      this.voiceChatService.init(guid);
      this.restorePersistedPlayerState().catch(() => {});
    }).catch(() => {});
  }

  readLocalStoragePlayerModel() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const rawValue = localStorage.getItem('thirdpersoncontroller-player-model');
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  persistLocalStoragePlayerModel(model) {
    if (typeof localStorage === 'undefined' || !model) {
      return;
    }

    try {
      localStorage.setItem('thirdpersoncontroller-player-model', JSON.stringify(model.toJSON ? model.toJSON() : model));
    } catch (error) {
      // ignore write errors from restricted browser storage
    }
  }

  async selectPlayerModel(file, eyeOffset = null) {
    try {
      const modelFile = file || null;
      if (!modelFile) {
        return;
      }

      const nextEyeOffset = eyeOffset && typeof eyeOffset === 'object'
        ? new THREE.Vector3(eyeOffset.x ?? 0, eyeOffset.y ?? 1.6, eyeOffset.z ?? 0)
        : this.cameraController?.eyePosition?.clone?.() ?? new THREE.Vector3(0, 1.6, 0);
      this.cameraController.setEyePosition(nextEyeOffset);
      this.gameMenu?.setEyeOffset?.(nextEyeOffset);

      const playerModel = await PlayerModel.fromFile(modelFile);
      this.playerModel = playerModel;
      this.persistLocalStoragePlayerModel(playerModel);
      await this.animator.applyCustomPlayerModel(playerModel);

      const spawnPosition = this.playerCharacter?.root?.position?.clone?.() ?? this.resolvePlayerSpawnFromManifest(this.currentManifest ?? {}) ?? new THREE.Vector3(0, 0, 0);
      this.playerCharacter.spawn(this.scene, spawnPosition);

      if (this.multiplayerService.guid) {
        this.multiplayerService.updateLocalTransform({
          model: playerModel.toServerPayload(),
        });
        await this.multiplayerService.sendTransform(this.multiplayerService.latestLocalTransform);
      }

      this.debugDisplay.Log(`Applied player model: ${playerModel.fileName} (eye offset ${nextEyeOffset.toArray().map((v) => v.toFixed(2)).join(', ')})`);
    } catch (error) {
      console.error('Failed to apply player model:', error);
      this.debugDisplay.LogError(`Unable to apply player model: ${error?.message ?? error}`);
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
    const maxWalkableSlope = Number.isFinite(colliderConfig.maxWalkableSlope)
      ? colliderConfig.maxWalkableSlope
      : Number.isFinite(this.maxWalkableSlope)
        ? this.maxWalkableSlope
        : 0.2;

    if (colliderConfig.type === 'box') {
      const size = this.sceneLoader.toVector3(colliderConfig.size, fallbackSize);
      return {
        position,
        collider: new BoxCollider({
          size,
          offset,
          physicsCollision,
          maxWalkableSlope,
          physicsMaterial: colliderConfig.physicsMaterial ?? 'default',
          restitution: Number.isFinite(colliderConfig.restitution) ? colliderConfig.restitution : undefined,
          mass: Number.isFinite(colliderConfig.mass) ? colliderConfig.mass : 1,
        }),
      };
    }
    if (colliderConfig.type === 'sphere') {
      const radius = colliderConfig.radius ?? 0.5;
      return {
        position,
        collider: new SphereCollider({
          radius,
          offset,
          physicsCollision,
          maxWalkableSlope,
          physicsMaterial: colliderConfig.physicsMaterial ?? 'bouncy',
          restitution: Number.isFinite(colliderConfig.restitution) ? colliderConfig.restitution : undefined,
          mass: Number.isFinite(colliderConfig.mass) ? colliderConfig.mass : 1,
        }),
      };
    }
    if (colliderConfig.type === 'mesh') {
      const mesh = context.mesh ?? null;
      return {
        position,
        collider: new MeshCollider({
          mesh,
          offset,
          physicsCollision,
          maxWalkableSlope,
          physicsMaterial: colliderConfig.physicsMaterial ?? 'default',
          restitution: Number.isFinite(colliderConfig.restitution) ? colliderConfig.restitution : undefined,
          mass: Number.isFinite(colliderConfig.mass) ? colliderConfig.mass : 1,
        }),
      };
    }
    return null;
  }

  syncPickupAnchors() {
    const rightHandBone = this.playerCharacter?.rightHandBone ?? null;
    for (const entry of this.pickups) {
      if (entry?.instance) {
        entry.instance.anchorBone = rightHandBone;
      }
    }
  }

  registerPickupObject(object, data = {}) {
    if (!object) {
      return null;
    }

    const pickupId = data.pickupId ?? object.userData?.gameObjectId ?? object.name ?? `pickup-${this.pickups.length + 1}`;
    const existingEntry = this.pickups.find((entry) => entry.id === pickupId);
    if (existingEntry) {
      existingEntry.object = object;
      existingEntry.instance.target = object;
      existingEntry.instance.anchorBone = this.playerCharacter?.rightHandBone ?? null;
      return existingEntry.instance;
    }

    const pickup = new Pickup({
      target: object,
      scene: this.scene,
      playerRoot: this.playerCharacter?.root ?? null,
      anchorBone: this.playerCharacter?.rightHandBone ?? null,
      anchorOffset: new THREE.Vector3(0.15, -0.05, 0.12),
      dropOffset: new THREE.Vector3(1.4, 0.9, 0.8),
      onPickup: () => {
        this.currentHeldPickup = { id: pickupId, object, instance: pickup };
      },
      onDrop: () => {
        if (this.currentHeldPickup?.id === pickupId) {
          this.currentHeldPickup = null;
        }
      },
    });

    const entry = { id: pickupId, object, instance: pickup };
    this.pickups.push(entry);
    return pickup;
  }

  registerDynamicRigidbody(object, config = {}) {
    if (!object || !config || !Number.isFinite(config.mass)) {
      return null;
    }

    if (!object.userData.rigidbody) {
      const rigidbody = new Rigidbody({
        mass: config.mass,
        gravity: Number.isFinite(config.gravity) ? Number(config.gravity) : -18,
        linearDamping: 0.08,
        enablePhysicsCollision: true,
        physicsMaterial: config.physicsMaterial ?? 'bouncy',
        restitution: Number.isFinite(config.restitution) ? config.restitution : undefined,
        kinetic: config.kinetic === true,
      });
      object.userData.rigidbody = rigidbody;
      this.dynamicRigidbodies.push({ object, rigidbody });
    }

    return object.userData.rigidbody;
  }

  handlePickupInteraction(data) {
    const pickupId = data?.pickupId ?? data?.id ?? null;
    if (!pickupId) {
      if (this.currentHeldPickup?.instance?.isPickedUp) {
        this.currentHeldPickup.instance.drop(this.playerCharacter?.root ?? null, this.scene);
      }
      return;
    }

    const entry = this.pickups.find((item) => item.id === pickupId);
    if (!entry) {
      return;
    }

    const playerRoot = this.playerCharacter?.root ?? null;
    if (!playerRoot) {
      return;
    }

    entry.instance.anchorBone = this.playerCharacter?.rightHandBone ?? null;

    if (this.currentHeldPickup && this.currentHeldPickup.id !== pickupId && this.currentHeldPickup.instance?.isPickedUp) {
      this.currentHeldPickup.instance.drop(playerRoot, this.scene);
    }

    entry.instance.toggle(playerRoot, this.scene);
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

      if (item.type === 'clickable') {
        const proxy = new THREE.Mesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshBasicMaterial({
            color: item.outlineColor ?? '#00f5ff',
            transparent: true,
            opacity: 0,
            depthWrite: false,
            depthTest: false,
          })
        );
        proxy.visible = true;
        proxy.renderOrder = 1000;
        proxy.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
        proxy.rotation.set(
          THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
          THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
          THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
        );
        proxy.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);
        this.scene.add(proxy);
        if (item.action === 'pickup') {
          this.registerPickupObject(proxy, { pickupId: item.pickupId ?? item.id ?? item.gameObjectId ?? 'clickable-pickup' });
        }
        this.clickable.registerObject(proxy, item);
        continue;
      }

      if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder' || item.type === 'sphere') {
        const mesh = this.sceneLoader.createPrimitiveMesh(item);
        if (mesh) {
          mesh.userData.gameObjectId = item.gameObjectId ?? item.id ?? null;
          mesh.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
          mesh.rotation.set(
            THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
          );
          mesh.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);
          this.scene.add(mesh);
          const colliderConfig = item.collider ?? null;
          if (colliderConfig && Number.isFinite(item.mass)) {
            mesh.userData.collider = this.buildManifestCollider(colliderConfig, new THREE.Vector3(...(item.position ?? [0, 0, 0])), this.sceneLoader.toVector3(item.size, new THREE.Vector3(1, 1, 1))).collider;
            this.registerDynamicRigidbody(mesh, {
              mass: item.mass,
              gravity: Number.isFinite(item.gravity) ? Number(item.gravity) : -9.8,
              physicsMaterial: colliderConfig.physicsMaterial ?? 'bouncy',
              restitution: Number.isFinite(colliderConfig.restitution) ? colliderConfig.restitution : undefined,
              kinetic: item.kinetic === true || colliderConfig.kinetic === true,
            });
          }
          if (item.clickable) {
            if (item.clickable.action === 'pickup') {
              this.registerPickupObject(mesh, { pickupId: item.clickable.pickupId ?? item.gameObjectId ?? item.id ?? mesh.name ?? 'pickup-item' });
            }
            this.clickable.registerObject(mesh, item.clickable);
          }
          this.registerDistanceCullablesForObj(mesh, null, { ignoreCulling: item.ignoreCulling === true });
          const fallbackSize = item.type === 'floor'
            ? new THREE.Vector3(120, 0.2, 120)
            : this.sceneLoader.toVector3(item.size, new THREE.Vector3(1, 1, 1));
          this.registerColliderFromManifestItem(item, fallbackSize);
        }
        continue;
      }

      if (item.type === 'animation') {
        if (!item.animationPath) {
          continue;
        }

        const targetId = item.gameObjectId ?? item.id ?? null;
        const clipTarget = (targetId
          ? this.scene.children.find((child) => child.userData?.gameObjectId === targetId)
          : null)
          ?? this.scene.getObjectByName(item.name ?? 'Primitive Model')
          ?? this.scene.children.find((child) => child.name === (item.animationName ?? item.name ?? ''))
          ?? null;

        if (!clipTarget) {
          continue;
        }

        const player = new AnimationClipPlayer({
          target: clipTarget,
          animationPath: item.animationPath,
          resolveScenePath: this.resolveScenePath.bind(this),
          name: item.animationName ?? item.name ?? 'animation',
          loop: item.loop !== false,
          speed: Number.isFinite(item.speed) ? Number(item.speed) : 1,
          playOnAwake: item.playOnAwake !== false,
        });
        await player.loadFromPath(item.animationPath);
        this.animationPlayers.push(player);
        if (item.playOnAwake !== false) {
          player.play();
        }
        continue;
      }

      if (item.type === 'obj' || item.type === 'glb' || item.type === 'fbx') {
        const modelPath = item.type === 'glb'
          ? (item.glbPath ?? item.path)
          : item.type === 'fbx'
            ? (item.fbxPath ?? item.path)
            : (item.objPath ?? item.path);
        if (!modelPath) {
          continue;
        }
        try {
          const isGLB = item.type === 'glb' || /\.glb$/i.test(modelPath);
          const isFBX = item.type === 'fbx' || /\.fbx$/i.test(modelPath);
          const model = isGLB
            ? await this.sceneLoader.loadGLBModel({
                glbPath: modelPath,
                materialRenderType: item.materialRenderType ?? 'cutout',
              })
            : isFBX
              ? await this.sceneLoader.loadFBXModel({
                  fbxPath: modelPath,
                  materialRenderType: item.materialRenderType ?? 'cutout',
                })
              : await this.sceneLoader.loadObjModel({
                  objPath: modelPath,
                  mtlPath: item.mtlPath,
                  materialRenderType: item.materialRenderType ?? 'cutout',
                });
          model.userData.gameObjectId = item.gameObjectId ?? item.id ?? null;
          model.position.set(item.position?.[0] ?? 0, item.position?.[1] ?? 0, item.position?.[2] ?? 0);
          model.rotation.set(
            THREE.MathUtils.degToRad(item.rotation?.[0] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[1] ?? 0),
            THREE.MathUtils.degToRad(item.rotation?.[2] ?? 0)
          );
          model.scale.set(item.scale?.[0] ?? 1, item.scale?.[1] ?? 1, item.scale?.[2] ?? 1);
          this.scene.add(model);
          if (item.clickable) {
            this.clickable.registerObject(model, item.clickable);
          }
          this.registerDistanceCullablesForObj(model, null, { ignoreCulling: item.ignoreCulling === true });
          this.registerColliderFromManifestItem(item, this.sceneLoader.toVector3(item.scale, new THREE.Vector3(1, 1, 1)), { mesh: model });
        } catch (error) {
          const modelType = item.type === 'glb' || /\.glb$/i.test(modelPath)
            ? 'GLB'
            : item.type === 'fbx' || /\.fbx$/i.test(modelPath)
              ? 'FBX'
              : 'OBJ';
          this.debugDisplay.LogError(`Failed to load ${modelType} model ${modelPath}: ${error?.message ?? error}`);
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
    const debugEnabled = debugConfig.enabled === true;
    const existingVrButton = document.getElementById('VRButton');
    if (!existingVrButton) {
      const vrButton = VRButton.createButton(this.renderer);
      if (vrButton) {
        if ('xr' in navigator && navigator.xr?.isSessionSupported) {
          navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
            if (supported || debugEnabled) {
              if (!document.getElementById('VRButton')) {
                document.body.appendChild(vrButton);
              }
            }
          }).catch(() => {
            if (debugEnabled) {
              if (!document.getElementById('VRButton')) {
                document.body.appendChild(vrButton);
              }
            }
          });
        } else if (debugEnabled) {
          document.body.appendChild(vrButton);
        }
      }
    }

    const playerConfig = manifest.player ?? {};
    const controllerConfig = manifest.controller ?? {};
    const physicsConfig = controllerConfig.physics ?? {};
    const maxWalkableSlope = Number.isFinite(playerConfig.maxWalkableSlope)
      ? playerConfig.maxWalkableSlope
      : Number.isFinite(controllerConfig.maxWalkableSlope)
        ? controllerConfig.maxWalkableSlope
        : Number.isFinite(physicsConfig.maxWalkableSlope)
          ? physicsConfig.maxWalkableSlope
          : 0.2;

    this.maxWalkableSlope = maxWalkableSlope;
    if (this.playerRigidbody) {
      this.playerRigidbody.maxWalkableSlope = maxWalkableSlope;
    }
    if (this.playerCollider) {
      this.playerCollider.maxWalkableSlope = maxWalkableSlope;
    }

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

    this.animationPlayers = [];
    await this.processManifestObjects(items);
    this.playWorldLoadSound();
  }

  playWorldLoadSound() {
    try {
      if (this.audioListener) {
        const audioLoader = new THREE.AudioLoader();
        const audioPath = this.resolveScenePath('/audio/loading/freesound_community-ding-36029.mp3');
        audioLoader.load(audioPath, (buffer) => {
          const sound = new THREE.Audio(this.audioListener);
          sound.setBuffer(buffer);
          sound.setVolume(1.0);
          if (this.audioListener.context && this.audioListener.context.state === 'suspended') {
            this.audioListener.context.resume().then(() => {
              sound.play();
            }).catch(() => {
              this.pendingWorldLoadSound = sound;
            });
          } else {
            sound.play();
          }
        }, undefined, (err) => {
          console.warn('Failed to load world load audio:', err);
        });
      }
    } catch (err) {
      console.warn('Error playing world load audio:', err);
    }
  }

  updateMouseLook() {
    if (this.renderer.xr.isPresenting) {
      return;
    }

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

  updatePlayer(delta, { isPresenting = false } = {}) {
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

    let viewYaw = this.cameraController.state.yaw;
    if (isPresenting) {
      const xrCamera = this.renderer.xr.getCamera(this.camera);
      if (xrCamera && typeof xrCamera.getWorldDirection === 'function') {
        xrCamera.getWorldDirection(this.xrForward);
        this.xrForward.y = 0;
        if (this.xrForward.lengthSq() > 1e-8) {
          this.xrForward.normalize();
          viewYaw = Math.atan2(-this.xrForward.x, -this.xrForward.z);
          this.cameraController.state.yaw = viewYaw;
        }
      }
    }

    const viewForward = new THREE.Vector3(-Math.sin(viewYaw), 0, -Math.cos(viewYaw));
    const viewRight = new THREE.Vector3(Math.cos(viewYaw), 0, -Math.sin(viewYaw));
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
      if (!this.cameraController.isFirstPerson()) {
        this.playerTargetYaw = THREE.MathUtils.euclideanModulo(this.cameraController.state.yaw + Math.PI + Math.PI, Math.PI * 2) - Math.PI;
      }
    }

    if (isPresenting) {
      this.playerYaw = THREE.MathUtils.euclideanModulo(viewYaw + Math.PI + Math.PI, Math.PI * 2) - Math.PI;
      this.playerTargetYaw = this.playerYaw;
      this.playerRotationController.setYaw(this.playerYaw);
    } else if (this.cameraController.isFirstPerson()) {
      this.playerYaw = THREE.MathUtils.euclideanModulo(this.cameraController.state.yaw + Math.PI + Math.PI, Math.PI * 2) - Math.PI;
      this.playerTargetYaw = this.playerYaw;
      this.playerRotationController.setYaw(this.playerYaw);
    } else {
      this.playerRotationController.targetYaw = this.playerTargetYaw;
      this.playerRotationController.update(delta * 0.9);
      this.playerYaw = this.playerRotationController.yaw;
      this.playerTargetYaw = this.playerRotationController.targetYaw;
    }

    if (!isPresenting && !this.cameraController.isFirstPerson()) {
      this.playerRotationQuaternion.copy(this.playerRotationController.quaternion);
    } else {
      this.playerRotationQuaternion.setFromAxisAngle(this.playerRotationAxis, this.playerYaw);
    }
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

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(playerRoot.quaternion);
    this.multiplayerService.updateLocalTransform({
      position: playerRoot.position,
      rotation: playerRoot.quaternion,
      yaw: this.playerYaw,
      direction: { x: forward.x, y: forward.y, z: forward.z },
      animationState: this.hasMoveInput ? (this.keyboardInput.isDown('ShiftLeft') ? 'sprint' : 'walk') : 'idle',
      isSpeaking: this.voiceChatService ? this.voiceChatService.isSpeaking : false,
    });
  }

  updatePlayerAnimation(delta) {
    this.playerAnimationController.update(delta, {
      isGrounded: this.isGrounded,
      hasMoveInput: this.hasMoveInput,
      isSprinting: this.keyboardInput.isDown('ShiftLeft') || this.keyboardInput.isDown('ShiftRight'),
      walkSpeed: this.playerState.speed,
      sprintSpeed: this.playerState.sprintSpeed,
      verticalVelocity: this.playerRigidbody?.velocity?.y ?? 0,
      isFalling: !this.isGrounded && (this.playerRigidbody?.velocity?.y ?? 0) < 0,
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
    this.clock.reset();
    this.isRunning = true;
    this.multiplayerService.ensureGuid().then((guid) => {
      this.voiceChatService.init(guid);
      this.restorePersistedPlayerState().catch(() => {});
    }).catch(() => {});
    this.multiplayerService.start();
    this.renderer.setAnimationLoop(this.tick);
  }

  tick(time) {
    if (!this.isRunning) {
      return;
    }

    this.clock.update(time);
    const delta = Math.min(this.clock.getDelta(), 0.05);

    if (this.keyboardInput.consumePress('KeyV')) {
      this.voiceChatService?.toggleMuted();
    }

    if (this.keyboardInput.consumePress('Escape')) {
      this.gameMenu.toggle();
    }

    if (this.gameMenu.isOpen) {
      this.clickable.clearHover();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (!this.isPointerLocked && document.pointerLockElement === this.renderer.domElement) {
      this.isPointerLocked = true;
    }

    if (this.renderer.xr.isPresenting) {
      this.cameraController.state.distance = this.cameraController.state.firstPersonDistanceThreshold;
    }

    this.clickable.updateHover(this.viewRayPointer, {
      isPointerLocked: false,
      gameMenuOpen: this.gameMenu.isOpen,
    });

    if (this.mouseInput.consumeRightClick()) {
      this.updateRightClickHitMarker();
    }

    if (this.mouseInput.consumeClick()) {
      const handled = this.clickable.tryHandleClick(this.viewRayPointer);
      if (!handled && this.currentHeldPickup?.instance?.isPickedUp) {
        this.currentHeldPickup.instance.drop(this.playerCharacter?.root ?? null, this.scene);
      }
    }

    this.updatePickups();
    this.updateDynamicRigidbodies(delta);
    this.updateMouseLook();
    this.updateAdaptiveFrustum(delta);
    this.updatePlayer(delta, { isPresenting: this.renderer.xr.isPresenting });
    this.updatePlayerAnimation(delta);
    this.animationPlayers.forEach((player) => player.update(delta));
    this.updateRemotePlayerMeshes(delta);
    this.cameraController.update(this.playerCharacter.root, {
      isPresenting: this.renderer.xr.isPresenting,
      playerHeadBone: this.playerCharacter.headBone,
    });

    if (this.cameraController.isFirstPerson() && !this.renderer.xr.isPresenting) {
      this.cameraController.headLookBaseLocalQuaternion?.copy?.(this.playerCharacter.headBone?.quaternion ?? new THREE.Quaternion());
      this.cameraController.applyHeadLookOverride(this.playerCharacter.headBone, this.playerYaw);
    } else {
      this.cameraController.clearHeadLookOverride(this.playerCharacter.headBone);
    }

    this.renderer.render(this.scene, this.camera);
  }

  async handleRemotePlayersUpdate(players) {
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

    if (this.remotePlayersHud) {
      if (players.length === 0) {
        this.remotePlayersHud.innerHTML = '<span style="opacity: 0.6; font-size: 0.75rem;">No other players online</span>';
      } else {
        const lines = players.map((p) => {
          const dir = p.direction ? `(${p.direction.x.toFixed(2)}, ${p.direction.z.toFixed(2)})` : '(0, -1)';
          const speaking = p.isSpeaking ? ' 🔊' : '';
          return `<div style="font-size: 0.75rem; opacity: 0.9;">Player ${p.guid.substring(0, 6)}: Dir ${dir}${speaking}</div>`;
        });
        this.remotePlayersHud.innerHTML = `<div style="font-weight: 600; font-size: 0.75rem; margin-bottom: 2px;">Remote Players (${players.length}):</div>` + lines.join('');
      }
    }

    for (const p of players) {
      let meshGroup = this.remotePlayerMeshes.get(p.guid);
      if (!meshGroup) {
        meshGroup = await this.createRemotePlayerVisual(p.model ?? null);
        this.scene.add(meshGroup);
        this.remotePlayerMeshes.set(p.guid, meshGroup);
      }

      meshGroup.userData.targetPosition = new THREE.Vector3(p.position.x, p.position.y, p.position.z);
      if (p.direction && typeof p.direction.x === 'number' && typeof p.direction.z === 'number') {
        const yaw = Math.atan2(-p.direction.x, -p.direction.z);
        meshGroup.userData.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      } else if (typeof p.yaw === 'number') {
        meshGroup.userData.targetQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw);
      } else if (p.rotation && typeof p.rotation.w === 'number') {
        meshGroup.userData.targetQuaternion = new THREE.Quaternion(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
      }
      if (p.animationState) {
        meshGroup.userData.animationState = p.animationState;
      }
      meshGroup.userData.isSpeaking = Boolean(p.isSpeaking);
      if (meshGroup.userData.speakerSprite) {
        meshGroup.userData.speakerSprite.visible = Boolean(meshGroup.userData.isSpeaking || meshGroup.userData.isPlayingAudio);
      }

      if (p.voiceData && p.voiceData.timestamp > meshGroup.userData.lastAudioTimestamp) {
        meshGroup.userData.lastAudioTimestamp = p.voiceData.timestamp;
        if (meshGroup.userData.audioQueue) {
          meshGroup.userData.audioQueue.push(p.voiceData.audioBase64);
          if (!meshGroup.userData.isPlayingAudio && typeof meshGroup.userData.playNextAudioChunk === 'function') {
            meshGroup.userData.playNextAudioChunk(meshGroup);
          }
        }
      }
    }
  }

  async createRemotePlayerVisual(playerModelData = null) {
    const group = new THREE.Group();
    let remoteVisualData;

    if (playerModelData) {
      try {
        const model = await PlayerModel.fromDataUrl(playerModelData);
        const root = await this.loadCustomPlayerModelAsset(model);
        if (root) {
          const animatorState = this.animator.createRemoteVisualFromRoot(root, () => this.playerCharacter.createFallbackVisual(), { useCustomRigAnimations: model.hasHumanoidRig });
          remoteVisualData = animatorState;
        }
      } catch (error) {
        console.warn('Failed to load remote player model:', error);
      }
    }

    if (!remoteVisualData) {
      remoteVisualData = this.animator.createRemoteVisual(() => this.playerCharacter.createFallbackVisual());
    }

    group.add(remoteVisualData.visual);

    group.userData.mixer = remoteVisualData.mixer;
    group.userData.walkAction = remoteVisualData.walkAction;
    group.userData.idleAction = remoteVisualData.idleAction;
    group.userData.jumpAction = remoteVisualData.jumpAction;
    group.userData.animationState = 'idle';

    group.userData.audioQueue = [];
    group.userData.isPlayingAudio = false;
    group.userData.lastAudioError = null;

    const decodeAudioData = async (audioContext, arrayBuffer) => {
      const workingBuffer = arrayBuffer.slice(0);
      if (audioContext.decodeAudioData.length <= 1) {
        return audioContext.decodeAudioData(workingBuffer);
      }

      return new Promise((resolve, reject) => {
        audioContext.decodeAudioData(workingBuffer, resolve, reject);
      });
    };

    const extractMimeTypeFromDataUrl = (dataUrl) => {
      if (typeof dataUrl !== 'string') return '';
      const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
      return match ? match[1].toLowerCase() : '';
    };

    const playNextAudioChunk = async (grp) => {
      const { audioQueue, positionalAudio } = grp.userData;
      if (!audioQueue || audioQueue.length === 0 || !positionalAudio) {
        grp.userData.isPlayingAudio = false;
        if (grp.userData.speakerSprite) {
          grp.userData.speakerSprite.visible = Boolean(grp.userData.isSpeaking);
        }
        return;
      }

      grp.userData.isPlayingAudio = true;
      if (grp.userData.speakerSprite) {
        grp.userData.speakerSprite.visible = true;
      }

      if (audioQueue.length > 3) {
        audioQueue.splice(0, audioQueue.length - 1);
      }

      const nextBase64 = audioQueue.shift();
      const mimeType = extractMimeTypeFromDataUrl(nextBase64);
      try {
        const response = await fetch(nextBase64);
        const encodedAudio = await response.arrayBuffer();
        const audioContext = positionalAudio.context;
        if (audioContext?.state === 'suspended') {
          await audioContext.resume();
        }

        const decodedAudio = await decodeAudioData(audioContext, encodedAudio);
        positionalAudio.stop();
        positionalAudio.setBuffer(decodedAudio);
        positionalAudio.setLoop(false);
        positionalAudio.setVolume(1);
        positionalAudio.onEnded = () => {
          grp.userData.isPlayingAudio = false;
          playNextAudioChunk(grp);
        };
        positionalAudio.play();
      } catch (err) {
        const errName = err?.name || 'UnknownError';
        const errorKey = `${mimeType}|${errName}`;
        if (grp.userData.lastAudioError !== errorKey) {
          grp.userData.lastAudioError = errorKey;
          console.warn('Remote voice decode/playback error:', {
            mimeType: mimeType || '(unknown)',
            errorName: errName,
            message: err?.message || String(err),
          });
        }
        grp.userData.isPlayingAudio = false;
        playNextAudioChunk(grp);
      }
    };
    group.userData.playNextAudioChunk = playNextAudioChunk;

    const speakerSprite = this.createSpeakerSprite();
    speakerSprite.position.set(0, 2.2, 0);
    group.add(speakerSprite);
    group.userData.speakerSprite = speakerSprite;
    group.userData.lastAudioTimestamp = 0;

    if (this.audioListener) {
      const positionalAudio = new THREE.PositionalAudio(this.audioListener);
      positionalAudio.setRefDistance(5);
      positionalAudio.setMaxDistance(100);
      positionalAudio.setRolloffFactor(1);
      group.add(positionalAudio);
      group.userData.positionalAudio = positionalAudio;
    }

    return group;
  }

  async loadCustomPlayerModelAsset(model) {
    if (!model || !model.dataUrl) {
      return null;
    }

    const extension = model.extension.toLowerCase();
    const response = await fetch(model.dataUrl);
    const arrayBuffer = await response.arrayBuffer();

    if (extension === '.fbx') {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      const loader = new FBXLoader();
      return loader.parse(arrayBuffer);
    }

    if (extension === '.glb' || extension === '.gltf') {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.parseAsync(arrayBuffer, '');
      return gltf.scene || gltf.scenes?.[0] || gltf;
    }

    if (extension === '.obj') {
      const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js');
      const loader = new OBJLoader();
      return loader.parse(new TextDecoder().decode(arrayBuffer));
    }

    return null;
  }

  updateRemotePlayerMeshes(delta) {
    const posLerp = Math.min(1, delta * 14);
    const rotSlerp = Math.min(1, delta * 24);
    for (const [guid, meshGroup] of this.remotePlayerMeshes.entries()) {
      if (meshGroup.userData.targetPosition) {
        meshGroup.position.lerp(meshGroup.userData.targetPosition, posLerp);
      }
      if (meshGroup.userData.targetQuaternion) {
        meshGroup.quaternion.slerp(meshGroup.userData.targetQuaternion, rotSlerp);
      }
      this.updateRemotePlayerAnimation(meshGroup, delta);
    }
  }

  updateRemotePlayerAnimation(meshGroup, delta) {
    const { mixer, walkAction, idleAction, jumpAction, animationState = 'idle' } = meshGroup.userData;
    if (!mixer) return;

    const isJump = animationState === 'jump';
    const isSprint = animationState === 'sprint';
    const isWalk = animationState === 'walk' || isSprint;

    const targetJumpWeight = isJump ? 1 : 0;
    const targetWalkWeight = isWalk ? 1 : 0;

    if (jumpAction) {
      const currentJumpWeight = jumpAction.getEffectiveWeight();
      const nextJumpWeight = THREE.MathUtils.lerp(currentJumpWeight, targetJumpWeight, Math.min(1, delta * 12));
      jumpAction.setEffectiveWeight(nextJumpWeight);
    }

    const currentJumpWeight = jumpAction ? jumpAction.getEffectiveWeight() : 0;
    const groundedWeightScale = 1 - currentJumpWeight;

    if (walkAction) {
      walkAction.setEffectiveTimeScale(isSprint ? 1.6 : 1.0);
      const currentWalkWeight = walkAction.getEffectiveWeight();
      const nextWalkWeight = THREE.MathUtils.lerp(currentWalkWeight, targetWalkWeight, Math.min(1, delta * 10));
      walkAction.setEffectiveWeight(nextWalkWeight * groundedWeightScale);
      if (idleAction) {
        idleAction.setEffectiveWeight((1 - nextWalkWeight) * groundedWeightScale);
      }
    } else if (idleAction) {
      idleAction.setEffectiveWeight(1 - currentJumpWeight);
    }

    mixer.update(delta);
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
