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

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x243b3a, 1.5);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight(0xffffff, 1.15);
sunLight.position.set(12, 18, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -25;
sunLight.shadow.camera.right = 25;
sunLight.shadow.camera.top = 25;
sunLight.shadow.camera.bottom = -25;
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far = 60;
scene.add(sunLight);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120),
  new THREE.MeshStandardMaterial({
    color: 0x7fb069,
    roughness: 0.96,
    metalness: 0.08,
  })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

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
  const viewForward = new THREE.Vector3(Math.sin(cameraState.yaw), 0, Math.cos(cameraState.yaw));
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
    player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotation, delta * playerState.rotationSpeed);
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

function addMarker(x, z, color) {
  const marker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.2, 0.8, 12),
    new THREE.MeshStandardMaterial({ color })
  );
  marker.position.set(x, 0.4, z);
  marker.castShadow = true;
  marker.receiveShadow = true;
  scene.add(marker);
}

for (let x = -18; x <= 18; x += 6) {
  for (let z = -18; z <= 18; z += 6) {
    addMarker(x, z, x % 12 === 0 ? 0x5e9f67 : 0x7bc9d9);
  }
}

const materialCache = new Map();
const textureLoader = new THREE.TextureLoader();

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

  const models = manifest.objects ?? [];

  for (const item of models) {
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
