import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { KeyboardInput } from './KeyboardInput.js';
import { DebugDisplay } from './DebugDisplay.js';
import { Rigidbody } from './Rigidbody.js';
import { Force } from './Force.js';

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
    });
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
    this.scene.add(this.player);
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
    });
  }

  resolveGroundYFromManifest(items) {
    const floorItem = (items ?? []).find((item) => item && item.type === 'floor');

    if (!floorItem) {
      this.debugDisplay.LogWarning('No floor object found in manifest. Falling back to groundY=0.');
      return 0;
    }

    return floorItem.position?.[1] ?? 0;
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

    this.playerRigidbody.gravity.set(0, this.playerState.gravityY, 0);
    this.debugDisplay.Log(
      `Controller config: jumpImpulse=${this.playerState.jumpImpulse.toFixed(2)}, gravityY=${this.playerState.gravityY.toFixed(2)}, groundY=${this.playerState.groundY.toFixed(2)}`
    );
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
    const response = await fetch(this.manifestPath);
    const manifest = await response.json();
    const spawnPosition = this.resolvePlayerSpawnFromManifest(manifest);

    const sceneConfig = manifest.scene ?? {};
    const debugConfig = manifest.debug ?? sceneConfig.debug ?? {};
    const items = manifest.objects ?? [];

    this.debugDisplay.setEnabled(debugConfig.enabled === true);
    this.debugDisplay.Log(`Debug display ${this.debugDisplay.enabled ? 'enabled' : 'disabled'} from manifest.`);

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

    for (const item of items) {
      if (!item || !item.type) continue;

      if (item.type === 'light') {
        const light = this.createManifestLight(item);
        if (light) this.scene.add(light);
        continue;
      }

      if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder') {
        const mesh = this.createManifestObject(item);
        if (mesh) this.scene.add(mesh);
        continue;
      }

      if (item.type !== 'obj') continue;

      const objPath = item.objPath ?? item.path;
      if (!objPath) continue;

      let model = null;
      try {
        model = await this.loadObjModel({
          objPath,
          mtlPath: item.mtlPath,
          texturePath: item.texturePath,
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
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(model);
      this.debugDisplay.Log(`Loaded object ${item.name ?? objPath}`);
    }
  }

  async loadObjModel({ objPath, mtlPath, texturePath, materialName }) {
    const loader = new OBJLoader();

    if (mtlPath) {
      const mtlLoader = new MTLLoader();
      const mtlMaterial = await mtlLoader.loadAsync(mtlPath);
      mtlMaterial.preload();
      loader.setMaterials(mtlMaterial);
    }

    const model = await loader.loadAsync(objPath);

    if (texturePath) {
      try {
        const texture = await this.textureLoader.loadAsync(texturePath);
        texture.colorSpace = THREE.SRGBColorSpace;

        model.traverse((child) => {
          if (child.isMesh && child.material) {
            const material = Array.isArray(child.material) ? child.material : [child.material];
            material.forEach((entry) => {
              if (entry && 'map' in entry) {
                entry.map = texture;
                entry.needsUpdate = true;
              }
            });
          }
        });
      } catch (error) {
        this.debugDisplay.LogWarning(`Texture could not be loaded for ${objPath}: ${error?.message ?? error}`);
        console.warn('Texture could not be loaded for', objPath, error);
      }
    }

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
    this.updatePlayer(delta);
    this.updateCamera();
    this.updateDebugDisplay();
    this.renderer.render(this.scene, this.camera);
  }

  async init() {
    await this.loadManifestScene();
    this.start();
  }
}