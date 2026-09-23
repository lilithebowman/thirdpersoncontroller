import './style.css';
import * as THREE from 'three';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const app = document.querySelector('#app');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecae6);
scene.fog = new THREE.Fog(0x8ecae6, 12, 70);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 4.5, 8.5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

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

scene.add(player);

const clock = new THREE.Clock();
const keys = {};
const cameraTarget = new THREE.Vector3();
const cameraPosition = new THREE.Vector3();
const playerRotationQuaternion = new THREE.Quaternion();
const playerRotationAxis = new THREE.Vector3(0, 1, 0);
const renderEuler = new THREE.Euler(0, 0, 0, 'XYZ');

const playerState = {
  speed: 10,
  sprintSpeed: 18,
  rotationSpeed: 8,
};

const cameraState = {
  yaw: 0,
  distance: 7.5,
  height: 4.5,
};

window.addEventListener('keydown', (event) => {
  keys[event.code] = true;
});

window.addEventListener('keyup', (event) => {
  keys[event.code] = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function updatePlayer(delta) {
  const viewForward = new THREE.Vector3(-Math.sin(cameraState.yaw), 0, -Math.cos(cameraState.yaw));
  const viewRight = new THREE.Vector3(Math.cos(cameraState.yaw), 0, -Math.sin(cameraState.yaw));
  const move = new THREE.Vector3();

  if (keys.KeyA || keys.ArrowLeft) {
    cameraState.yaw += delta * 2.2;
  }
  if (keys.KeyD || keys.ArrowRight) {
    cameraState.yaw -= delta * 2.2;
  }

  if (keys.KeyW || keys.ArrowUp) move.add(viewForward);
  if (keys.KeyS || keys.ArrowDown) move.sub(viewForward);

  if (keys.KeyQ) move.sub(viewRight);
  if (keys.KeyE) move.add(viewRight);

  if (move.lengthSq() > 0) {
    move.normalize();
    const speed = keys.Shift ? playerState.sprintSpeed : playerState.speed;
    player.position.addScaledVector(move, speed * delta);

    const targetRotation = Math.atan2(move.x, move.z);
    const currentYaw = player.rotation.y;
    const shortestYaw = ((targetRotation - currentYaw + Math.PI) % (Math.PI * 2)) - Math.PI;
    const nextYaw = currentYaw + shortestYaw * Math.min(1, delta * playerState.rotationSpeed);

    playerRotationQuaternion.setFromAxisAngle(playerRotationAxis, nextYaw);
    renderEuler.setFromQuaternion(playerRotationQuaternion, 'XYZ');
    player.rotation.set(renderEuler.x, renderEuler.y, renderEuler.z, 'XYZ');
  }
}

function updateCamera() {
  cameraPosition.set(
    Math.sin(cameraState.yaw) * cameraState.distance,
    cameraState.height,
    Math.cos(cameraState.yaw) * cameraState.distance
  );
  cameraPosition.add(player.position);
  camera.position.lerp(cameraPosition, 0.12);

  cameraTarget.set(player.position.x, player.position.y + 1.5, player.position.z);
  camera.lookAt(cameraTarget);
}

const materialCache = new Map();
const textureLoader = new THREE.TextureLoader();

function createManifestObject(item) {
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

function createManifestLight(item) {
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

async function loadManifestScene() {
  const response = await fetch('/scene-manifest.json');
  const manifest = await response.json();

  const sceneConfig = manifest.scene ?? {};
  if (sceneConfig.background) {
    scene.background = new THREE.Color(sceneConfig.background);
    if (scene.fog) {
      scene.fog.color = new THREE.Color(sceneConfig.background);
    }
  }

  const items = manifest.objects ?? [];

  for (const item of items) {
    if (!item || !item.type) continue;

    if (item.type === 'light') {
      const light = createManifestLight(item);
      if (light) scene.add(light);
      continue;
    }

    if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder') {
      const mesh = createManifestObject(item);
      if (mesh) scene.add(mesh);
      continue;
    }

    if (item.type !== 'obj') continue;

    const objPath = item.objPath ?? item.path;
    if (!objPath) continue;

    const model = await loadObjModel({
      objPath,
      mtlPath: item.mtlPath,
      texturePath: item.texturePath,
      materialName: item.material,
    });

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

    scene.add(model);
  }
}

async function loadObjModel({ objPath, mtlPath, texturePath, materialName }) {
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
      const texture = await textureLoader.loadAsync(texturePath);
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
      console.warn('Texture could not be loaded for', objPath, error);
    }
  }

  if (materialName) {
    const fallbackMaterial = materialCache.get(materialName) ?? new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.75,
      metalness: 0.15,
    });

    materialCache.set(materialName, fallbackMaterial);

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

loadManifestScene().catch((error) => {
  console.error('Scene manifest failed to load:', error);
});

function tick() {
  requestAnimationFrame(tick);
  const delta = Math.min(clock.getDelta(), 0.05);
  updatePlayer(delta);
  updateCamera();
  renderer.render(scene, camera);
}

tick();
