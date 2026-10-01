/**
 * sceneManifest.js
 *
 * Module: Scene Manifest Normalizer & Converters
 * Purpose: Provides parsing, normalization, and bidirectional conversion between legacy
 *          flat object manifests and the robust hierarchical GameObject/component structure
 *          used by the scene editor and runtime.
 */

const DEFAULT_MANIFEST_VERSION = 2;

/**
 * Clones a value using structuredClone when available, falling back to JSON serialization.
 * @param {*} value - Value to clone
 * @returns {*} Cloned value
 */
function cloneValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function vectorOrFallback(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) {
    return fallback.slice();
  }

  const [x, y, z] = value;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return fallback.slice();
  }

  return [x, y, z];
}

function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'game-object';
}

function createGameObjectId(name, index, parentId = 'root') {
  return `${parentId}-${slugify(name || `game-object-${index + 1}`)}-${index + 1}`;
}

function normalizeClickableAction(action) {
  const normalized = typeof action === 'string' ? action.trim().toLowerCase() : 'teleport';
  return normalized === 'link' ? 'link' : 'teleport';
}

function normalizeComponent(component) {
  if (!component || typeof component !== 'object') {
    return null;
  }

  const normalized = cloneValue(component);
  if (!normalized.type) {
    normalized.type = 'script';
  }

  return normalized;
}

export function legacyItemToGameObject(item, index = 0, parentId = 'root') {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const name = typeof item.name === 'string' && item.name.trim()
    ? item.name.trim()
    : item.type ?? `GameObject ${index + 1}`;

  const gameObject = {
    id: typeof item.id === 'string' && item.id.trim()
      ? item.id.trim()
      : createGameObjectId(name, index, parentId),
    name,
    active: item.active !== false,
    tag: typeof item.tag === 'string' && item.tag.trim() ? item.tag.trim() : 'Untagged',
    layer: Number.isFinite(item.layer) ? item.layer : 0,
    static: item.static === true,
    transform: {
      position: vectorOrFallback(item.position, [0, 0, 0]),
      rotation: vectorOrFallback(item.rotation, [0, 0, 0]),
      scale: vectorOrFallback(item.scale, [1, 1, 1]),
    },
    components: [],
    children: [],
  };

  if (item.type === 'light') {
    gameObject.components.push(normalizeComponent({
      type: 'light',
      lightType: item.lightType ?? 'directional',
      color: item.color ?? '#ffffff',
      groundColor: item.groundColor ?? '#222222',
      intensity: Number.isFinite(item.intensity) ? item.intensity : 1,
      distance: Number.isFinite(item.distance) ? item.distance : undefined,
      angle: Number.isFinite(item.angle) ? item.angle : undefined,
      penumbra: Number.isFinite(item.penumbra) ? item.penumbra : undefined,
      decay: Number.isFinite(item.decay) ? item.decay : undefined,
      castShadow: item.castShadow === true,
      shadow: cloneValue(item.shadow) ?? undefined,
    }));
  }

  if (item.type === 'floor' || item.type === 'box' || item.type === 'cube' || item.type === 'cylinder') {
    gameObject.components.push(normalizeComponent({
      type: 'primitive',
      primitiveType: item.type,
      size: vectorOrFallback(item.size, item.type === 'floor' ? [120, 120, 1] : [1, 1, 1]),
      radiusTop: Number.isFinite(item.radiusTop) ? item.radiusTop : undefined,
      radiusBottom: Number.isFinite(item.radiusBottom) ? item.radiusBottom : undefined,
      height: Number.isFinite(item.height) ? item.height : undefined,
      radialSegments: Number.isFinite(item.radialSegments) ? item.radialSegments : undefined,
      color: item.color ?? undefined,
      roughness: Number.isFinite(item.roughness) ? item.roughness : undefined,
      metalness: Number.isFinite(item.metalness) ? item.metalness : undefined,
    }));
  }

  if (item.type === 'obj') {
    gameObject.components.push(normalizeComponent({
      type: 'model',
      modelType: 'obj',
      objPath: item.objPath ?? item.path ?? '',
      mtlPath: item.mtlPath ?? null,
      material: item.material ?? null,
      materialRenderType: item.materialRenderType ?? 'cutout',
      ignoreCulling: item.ignoreCulling === true,
    }));
  }

  if (item.type === 'glb' || item.modelType === 'glb' || typeof item.glbPath === 'string' && item.glbPath.trim()) {
    gameObject.components.push(normalizeComponent({
      type: 'model',
      modelType: 'glb',
      glbPath: item.glbPath ?? item.path ?? '',
      materialRenderType: item.materialRenderType ?? 'cutout',
      ignoreCulling: item.ignoreCulling === true,
    }));
  }

  if (item.type === 'fbx' || item.modelType === 'fbx' || typeof item.fbxPath === 'string' && item.fbxPath.trim()) {
    gameObject.components.push(normalizeComponent({
      type: 'model',
      modelType: 'fbx',
      fbxPath: item.fbxPath ?? item.path ?? '',
      materialRenderType: item.materialRenderType ?? 'cutout',
      ignoreCulling: item.ignoreCulling === true,
    }));
  }

  if (item.type === 'scene') {
    gameObject.components.push(normalizeComponent({
      type: 'scene',
      manifestPath: item.manifestPath ?? item.path ?? null,
      stream: cloneValue(item.stream) ?? undefined,
    }));
  }

  if (item.type === 'clickable' || item.action || item.url || item.href || item.link || item.target || item.destination) {
    const clickableAction = normalizeClickableAction(item.action);
    gameObject.components.push(normalizeComponent({
      type: 'clickable',
      action: clickableAction,
      target: Array.isArray(item.target) ? item.target.slice() : Array.isArray(item.position) ? item.position.slice() : [0, 0, 0],
      url: typeof item.url === 'string' ? item.url : typeof item.href === 'string' ? item.href : typeof item.link === 'string' ? item.link : undefined,
      label: typeof item.label === 'string' ? item.label : undefined,
      outlineColor: typeof item.outlineColor === 'string' ? item.outlineColor : '#00f5ff',
      enabled: item.enabled !== false,
    }));
  }

  if (item.type === 'skybox' || item.skyboxType || item.textures || item.texture) {
    gameObject.components.push(normalizeComponent({
      type: 'skybox',
      skyboxType: item.skyboxType ?? item.type ?? 'color',
      color: item.color ?? undefined,
      paths: cloneValue(item.paths) ?? undefined,
      textures: cloneValue(item.textures) ?? undefined,
      texture: item.texture ?? item.path ?? item.url ?? undefined,
    }));
  }

  if (item.collider) {
    gameObject.components.push(normalizeComponent({
      type: 'collider',
      collider: cloneValue(item.collider),
    }));
  }

  if (item.script) {
    gameObject.components.push(normalizeComponent({
      type: 'script',
      name: item.script.name ?? 'Script',
      language: item.script.language ?? 'javascript',
      code: item.script.code ?? '',
      enabled: item.script.enabled !== false,
    }));
  }

  if (Array.isArray(item.children)) {
    gameObject.children = item.children
      .map((child, childIndex) => legacyItemToGameObject(child, childIndex, gameObject.id))
      .filter(Boolean);
  }

  return gameObject;
}

export function normalizeGameObject(gameObject, index = 0, parentId = 'root') {
  if (!gameObject || typeof gameObject !== 'object') {
    return null;
  }

  const name = typeof gameObject.name === 'string' && gameObject.name.trim()
    ? gameObject.name.trim()
    : `GameObject ${index + 1}`;

  const normalized = {
    id: typeof gameObject.id === 'string' && gameObject.id.trim()
      ? gameObject.id.trim()
      : createGameObjectId(name, index, parentId),
    name,
    active: gameObject.active !== false,
    tag: typeof gameObject.tag === 'string' && gameObject.tag.trim() ? gameObject.tag.trim() : 'Untagged',
    layer: Number.isFinite(gameObject.layer) ? gameObject.layer : 0,
    static: gameObject.static === true,
    transform: {
      position: vectorOrFallback(gameObject.transform?.position ?? gameObject.position, [0, 0, 0]),
      rotation: vectorOrFallback(gameObject.transform?.rotation ?? gameObject.rotation, [0, 0, 0]),
      scale: vectorOrFallback(gameObject.transform?.scale ?? gameObject.scale, [1, 1, 1]),
    },
    components: Array.isArray(gameObject.components)
      ? gameObject.components.map((component) => normalizeComponent(component)).filter(Boolean)
      : [],
    children: [],
  };

  if (Array.isArray(gameObject.children)) {
    normalized.children = gameObject.children
      .map((child, childIndex) => normalizeGameObject(child, childIndex, normalized.id))
      .filter(Boolean);
  }

  return normalized;
}

function gameObjectToLegacyItems(gameObject) {
  if (!gameObject) {
    return [];
  }

  const transform = gameObject.transform ?? {};
  const legacyItems = [];

  for (const component of gameObject.components ?? []) {
    if (!component || !component.type) {
      continue;
    }

    if (component.type === 'light') {
      legacyItems.push({
        type: 'light',
        name: gameObject.name,
        lightType: component.lightType ?? 'directional',
        color: component.color ?? '#ffffff',
        groundColor: component.groundColor ?? '#222222',
        intensity: component.intensity ?? 1,
        distance: component.distance,
        angle: component.angle,
        penumbra: component.penumbra,
        decay: component.decay,
        castShadow: component.castShadow === true,
        shadow: cloneValue(component.shadow) ?? undefined,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
      });
      continue;
    }

    if (component.type === 'primitive') {
      const legacyType = component.primitiveType ?? 'box';
      const legacyItem = {
        type: legacyType,
        name: gameObject.name,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
        color: component.color ?? undefined,
        roughness: component.roughness,
        metalness: component.metalness,
      };

      if (Array.isArray(component.size)) {
        legacyItem.size = component.size.slice();
      }

      if (Number.isFinite(component.radiusTop)) {
        legacyItem.radiusTop = component.radiusTop;
      }

      if (Number.isFinite(component.radiusBottom)) {
        legacyItem.radiusBottom = component.radiusBottom;
      }

      if (Number.isFinite(component.height)) {
        legacyItem.height = component.height;
      }

      if (Number.isFinite(component.radialSegments)) {
        legacyItem.radialSegments = component.radialSegments;
      }

      const colliderComponent = (gameObject.components ?? []).find((entry) => entry?.type === 'collider');
      if (colliderComponent?.collider) {
        legacyItem.collider = cloneValue(colliderComponent.collider);
      }

      legacyItems.push(legacyItem);
      continue;
    }

    if (component.type === 'collider') {
      const hasRenderableComponent = (gameObject.components ?? []).some(
        (c) => c?.type === 'primitive' || c?.type === 'model'
      );
      if (!hasRenderableComponent && component.collider) {
        const colliderConfig = component.collider;
        const legacyItem = {
          type: 'box',
          name: gameObject.name,
          position: transform.position ?? [0, 0, 0],
          rotation: transform.rotation ?? [0, 0, 0],
          scale: transform.scale ?? [1, 1, 1],
          collider: cloneValue(colliderConfig),
        };
        if (colliderConfig.size) {
          legacyItem.size = cloneValue(colliderConfig.size);
        }
        legacyItems.push(legacyItem);
      }
      continue;
    }

    if (component.type === 'model') {
      if (component.modelType === 'glb') {
        const legacyItem = {
          type: 'glb',
          name: gameObject.name,
          glbPath: component.glbPath ?? component.path ?? '',
          materialRenderType: component.materialRenderType ?? undefined,
          ignoreCulling: component.ignoreCulling === true,
          position: transform.position ?? [0, 0, 0],
          rotation: transform.rotation ?? [0, 0, 0],
          scale: transform.scale ?? [1, 1, 1],
        };

        const colliderComponent = (gameObject.components ?? []).find((entry) => entry?.type === 'collider');
        if (colliderComponent?.collider) {
          legacyItem.collider = cloneValue(colliderComponent.collider);
        }

        legacyItems.push(legacyItem);
        continue;
      }

      if (component.modelType === 'fbx') {
        const legacyItem = {
          type: 'fbx',
          name: gameObject.name,
          fbxPath: component.fbxPath ?? component.path ?? '',
          materialRenderType: component.materialRenderType ?? undefined,
          ignoreCulling: component.ignoreCulling === true,
          position: transform.position ?? [0, 0, 0],
          rotation: transform.rotation ?? [0, 0, 0],
          scale: transform.scale ?? [1, 1, 1],
        };

        const colliderComponent = (gameObject.components ?? []).find((entry) => entry?.type === 'collider');
        if (colliderComponent?.collider) {
          legacyItem.collider = cloneValue(colliderComponent.collider);
        }

        legacyItems.push(legacyItem);
        continue;
      }

      if (component.modelType !== 'obj') {
        continue;
      }

      const legacyItem = {
        type: 'obj',
        name: gameObject.name,
        objPath: component.objPath ?? '',
        mtlPath: component.mtlPath ?? undefined,
        material: component.material ?? undefined,
        materialRenderType: component.materialRenderType ?? undefined,
        ignoreCulling: component.ignoreCulling === true,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
      };

      const colliderComponent = (gameObject.components ?? []).find((entry) => entry?.type === 'collider');
      if (colliderComponent?.collider) {
        legacyItem.collider = cloneValue(colliderComponent.collider);
      }

      legacyItems.push(legacyItem);
      continue;
    }

    if (component.type === 'clickable') {
      const clickAction = normalizeClickableAction(component.action);
      const target = Array.isArray(component.target) ? component.target.slice() : Array.isArray(transform.position) ? transform.position.slice() : [0, 0, 0];
      const clickItem = {
        type: 'clickable',
        name: gameObject.name,
        action: clickAction,
        target,
        url: typeof component.url === 'string' ? component.url : undefined,
        label: typeof component.label === 'string' ? component.label : undefined,
        outlineColor: typeof component.outlineColor === 'string' ? component.outlineColor : '#00f5ff',
        enabled: component.enabled !== false,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
      };
      if (clickAction === 'link') {
        clickItem.link = clickItem.url;
      }
      legacyItems.push(clickItem);
      continue;
    }

    if (component.type === 'scene') {
      legacyItems.push({
        type: 'scene',
        name: gameObject.name,
        manifestPath: component.manifestPath ?? undefined,
        stream: cloneValue(component.stream) ?? undefined,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
      });
      continue;
    }

    if (component.type === 'skybox') {
      legacyItems.push({
        type: 'skybox',
        name: gameObject.name,
        skyboxType: component.skyboxType ?? 'color',
        color: component.color ?? undefined,
        paths: cloneValue(component.paths) ?? undefined,
        textures: cloneValue(component.textures) ?? undefined,
        texture: component.texture ?? undefined,
        position: transform.position ?? [0, 0, 0],
        rotation: transform.rotation ?? [0, 0, 0],
        scale: transform.scale ?? [1, 1, 1],
      });
    }
  }

  for (const child of gameObject.children ?? []) {
    legacyItems.push(...gameObjectToLegacyItems(child));
  }

  return legacyItems;
}

export function gameObjectsToLegacyObjects(gameObjects) {
  if (!Array.isArray(gameObjects)) {
    return [];
  }

  return gameObjects.flatMap((gameObject) => gameObjectToLegacyItems(gameObject));
}

export function normalizeSceneManifest(manifest = {}) {
  const normalized = cloneValue(manifest) ?? {};

  normalized.version = Number.isFinite(normalized.version) ? normalized.version : DEFAULT_MANIFEST_VERSION;

  if (Array.isArray(normalized.gameObjects) && normalized.gameObjects.length > 0) {
    normalized.gameObjects = normalized.gameObjects
      .map((gameObject, index) => normalizeGameObject(gameObject, index))
      .filter(Boolean);
  } else if (Array.isArray(normalized.objects) && normalized.objects.length > 0) {
    normalized.gameObjects = normalized.objects
      .map((item, index) => legacyItemToGameObject(item, index))
      .filter(Boolean);
  } else {
    normalized.gameObjects = [];
  }

  normalized.objects = gameObjectsToLegacyObjects(normalized.gameObjects);

  return normalized;
}

export function toExportManifest(manifest = {}) {
  const normalized = normalizeSceneManifest(manifest);
  normalized.gameObjects = normalized.gameObjects
    .map((gameObject, index) => normalizeGameObject(gameObject, index))
    .filter(Boolean);
  delete normalized.objects;
  return normalized;
}
