import JSZip from 'jszip';

const ALLOWED_EXTENSIONS = new Set(['.fbx', '.gltf', '.glb', '.obj', '.zip']);
const MODEL_EXTENSIONS = new Set(['.fbx', '.gltf', '.glb', '.obj']);
const MAX_MODEL_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 128;

function toBase64(bytes) {
  if (typeof btoa === 'function') {
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return Buffer.from(binary, 'binary').toString('base64');
}

function sanitizeFileName(name, fallback = 'player-model') {
  const candidate = String(name ?? '')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[<>:"|?*]+/g, '_')
    .trim();

  if (!candidate || candidate === '.' || candidate === '..' || candidate.includes('..')) {
    return fallback;
  }

  const safeName = candidate.slice(0, MAX_NAME_LENGTH);
  return safeName || fallback;
}

function normalizeExtension(fileName) {
  const name = String(fileName ?? '').toLowerCase();
  const found = name.match(/\.[a-z0-9]+$/i);
  if (!found) {
    return '';
  }
  return found[0];
}

function parseDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length === 0) {
    throw new Error('Player model data URL is invalid.');
  }

  const match = /^data:([^;,]+)?(?:;base64)?,/i.exec(dataUrl);
  if (!match) {
    throw new Error('Player model data URL is not valid base64 or text data.');
  }

  const mimeType = (match[1] ?? 'application/octet-stream').toLowerCase();
  const base64Payload = dataUrl.includes(';base64,')
    ? dataUrl.split(';base64,')[1]
    : null;

  if (base64Payload && base64Payload.length > MAX_MODEL_BYTES * 1.33) {
    throw new Error('Player model data URL exceeds the safe size limit.');
  }

  return { mimeType, base64Payload };
}

function isSafeZipEntryPath(entryPath) {
  if (typeof entryPath !== 'string' || entryPath.length === 0) {
    return false;
  }

  const sanitized = entryPath.replace(/\\/g, '/').replace(/^\.?\//, '').trim();
  if (!sanitized || sanitized === '.' || sanitized.includes('..')) {
    return false;
  }

  return !/[<>:"|?*]/.test(sanitized);
}

function normalizeManifestPath(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const normalized = value.trim().replace(/\\/g, '/');
  if (normalized.startsWith('/')) {
    return normalized.slice(1);
  }
  return normalized;
}

function cleanManifestObject(data) {
  if (Array.isArray(data)) {
    return data.map((item) => cleanManifestObject(item));
  }
  if (data && typeof data === 'object') {
    const output = {};
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      output[key] = cleanManifestObject(value);
    });
    return output;
  }
  return data;
}

function normalizeEyePosition(value) {
  if (!value || typeof value !== 'object') {
    return { x: 0, y: 1.6, z: 0 };
  }

  const x = Number(value.x ?? 0);
  const y = Number(value.y ?? 1.6);
  const z = Number(value.z ?? 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return { x: 0, y: 1.6, z: 0 };
  }

  return { x, y, z };
}

function normalizeBoneNames(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === 'string' && entry.trim())
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean);
  }

  if (typeof value === 'object') {
    const nested = Object.values(value).flatMap((entry) => normalizeBoneNames(entry));
    return nested;
  }

  return [];
}

function normalizeMaterialData(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return cleanManifestObject(value);
}

export class PlayerModel {
  static MAX_FILE_SIZE_BYTES = MAX_MODEL_BYTES;
  static ALLOWED_EXTENSIONS = ALLOWED_EXTENSIONS;

  static async validateFile(file) {
    if (!file || typeof file !== 'object') {
      throw new Error('Player model file is invalid.');
    }

    const rawNameCandidate = String(file.name ?? file.fileName ?? 'player-model');
    const unsafeTraversal = rawNameCandidate.includes('..') || rawNameCandidate.includes('/') || rawNameCandidate.includes('\\');
    if (unsafeTraversal || /[<>:"|?*]/.test(rawNameCandidate)) {
      throw new Error('Unsafe player model filename.');
    }

    const rawName = sanitizeFileName(rawNameCandidate);
    const extension = normalizeExtension(rawName).toLowerCase();
    const size = Number(file.size);
    const mimeType = typeof file.type === 'string' ? file.type.toLowerCase() : 'application/octet-stream';

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new Error('Unsupported player model type. Use .zip, .fbx, .gltf, .glb, or .obj.');
    }

    if (!Number.isFinite(size) || size <= 0 || size > MAX_MODEL_BYTES) {
      throw new Error('Player model file exceeds the 25MB safe size limit.');
    }

    if (rawName.includes('..') || /[<>:"|?*]/.test(rawName)) {
      throw new Error('Unsafe player model filename.');
    }

    return {
      name: rawName,
      fileName: rawName,
      extension,
      mimeType,
      size,
      isZip: extension === '.zip',
    };
  }

  static async extractZipBundle(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer, { createFolders: true });
    const bundleFiles = {};
    for (const [entryPath, entry] of Object.entries(zip.files)) {
      if (entry?.dir || !isSafeZipEntryPath(entryPath)) {
        continue;
      }
      const bytes = await entry.async('uint8array');
      bundleFiles[entryPath.replace(/\\/g, '/')] = new Uint8Array(bytes);
    }
    return bundleFiles;
  }

  static resolveManifestFrom(zipFiles) {
    const manifestCandidates = ['player-manifest.json', 'player_manifest.json', 'manifest.json', 'player-manifest', 'manifest'];
    for (const candidate of manifestCandidates) {
      if (zipFiles[candidate]) {
        return { path: candidate, data: zipFiles[candidate] };
      }
    }

    const manifestMatch = Object.keys(zipFiles).find((entryPath) => /(?:^|\/)(?:player-)?manifest\.json$/i.test(entryPath));
    if (manifestMatch) {
      return { path: manifestMatch, data: zipFiles[manifestMatch] };
    }

    return null;
  }

  static async fromZipArchive(file, { name, arrayBuffer, mimeType, size } = {}) {
    const bundleFiles = await this.extractZipBundle(arrayBuffer);
    const manifestEntry = this.resolveManifestFrom(bundleFiles);
    let manifest = null;
    if (manifestEntry) {
      try {
        const manifestText = new TextDecoder().decode(bundleFiles[manifestEntry.path]);
        manifest = JSON.parse(manifestText);
      } catch (error) {
        manifest = null;
      }
    }

    const candidateModelEntry = (() => {
      const manifestModelPath = manifest && typeof manifest === 'object'
        ? (
            manifest.model ??
            manifest.modelPath ??
            manifest.file ??
            manifest.avatarModel ??
            manifest.playerModel ??
            manifest.asset ??
            manifest.modelPath ??
            manifest.assets?.model ??
            manifest.assets?.file
        )
        : null;

      const modelPath = typeof manifestModelPath === 'string' ? normalizeManifestPath(manifestModelPath) : null;
      if (modelPath && bundleFiles[modelPath]) {
        return modelPath;
      }

      const modelNames = ['model.fbx', 'character.fbx', 'avatar.fbx', 'model.glb', 'model.gltf', 'model.obj'];
      for (const candidate of modelNames) {
        const directMatch = Object.keys(bundleFiles).find((entryPath) => entryPath.toLowerCase().endsWith(candidate));
        if (directMatch) {
          return directMatch;
        }
      }

      const supportedEntry = Object.keys(bundleFiles).find((entryPath) => {
        const lowered = entryPath.toLowerCase();
        return MODEL_EXTENSIONS.has(normalizeExtension(lowered));
      });
      return supportedEntry || null;
    })();

    if (!candidateModelEntry) {
      throw new Error('Zip bundle does not contain a supported player model file.');
    }

    const modelBytes = bundleFiles[candidateModelEntry];
    const modelName = sanitizeFileName(candidateModelEntry.split('/').pop() || 'player-model');
    const modelExtension = normalizeExtension(modelName).toLowerCase() || '.fbx';
    const modelMimeType = modelExtension === '.gltf' || modelExtension === '.glb' || modelExtension === '.obj'
      ? 'application/octet-stream'
      : 'application/octet-stream';
    const dataUrl = `data:${modelMimeType};base64,${toBase64(modelBytes)}`;

    const eyePosition = normalizeEyePosition(
      manifest?.eyePosition ??
      manifest?.lookPosition ??
      manifest?.player?.eyePosition ??
      manifest?.player?.lookPosition ??
      manifest?.camera?.eyePosition ??
      manifest?.camera?.lookPosition
    );
    const materialData = normalizeMaterialData(
      manifest?.materialData ??
      manifest?.materials ??
      manifest?.material ??
      manifest?.player?.materialData ??
      manifest?.player?.materials
    );
    const boneNames = normalizeBoneNames(
      manifest?.boneNames ??
      manifest?.bones ??
      manifest?.humanoid?.boneNames ??
      manifest?.rig?.boneNames ??
      manifest?.player?.boneNames
    );

    return new PlayerModel({
      name: modelName,
      fileName: modelName,
      extension: modelExtension,
      mimeType: modelMimeType,
      dataUrl,
      size: modelBytes.length,
      isRigged: Boolean(manifest?.isRigged ?? manifest?.rigged ?? false),
      hasHumanoidRig: Boolean(manifest?.hasHumanoidRig ?? manifest?.humanoid?.isRigged ?? false),
      manifest: cleanManifestObject(manifest || {}),
      eyePosition,
      boneNames,
      materialData,
      bundleFiles,
      modelBasePath: candidateModelEntry.includes('/') ? candidateModelEntry.slice(0, candidateModelEntry.lastIndexOf('/')) : '',
    });
  }

  static async fromFile(file) {
    const metadata = await this.validateFile(file);
    const arrayBuffer = await file.arrayBuffer();

    if (metadata.isZip) {
      return this.fromZipArchive(file, {
        name: metadata.name,
        arrayBuffer,
        mimeType: metadata.mimeType,
        size: metadata.size,
      });
    }

    const bytes = new Uint8Array(arrayBuffer);
    const base64 = toBase64(bytes);
    const dataUrl = `data:${metadata.mimeType || 'application/octet-stream'};base64,${base64}`;

    return new PlayerModel({
      name: metadata.name,
      fileName: metadata.fileName,
      extension: metadata.extension,
      mimeType: metadata.mimeType,
      dataUrl,
      size: metadata.size,
      isRigged: false,
      hasHumanoidRig: false,
    });
  }

  static async fromDataUrl({ name, dataUrl, mimeType, extension, hasHumanoidRig = false, isRigged = false, manifest = null, eyePosition = null, boneNames = [], materialData = null, bundleFiles = {} } = {}) {
    if (typeof dataUrl !== 'string' || !dataUrl.trim()) {
      throw new Error('A valid player model data URL is required.');
    }

    const { mimeType: parsedMimeType } = parseDataUrl(dataUrl);
    const normalizedName = sanitizeFileName(name || 'player-model');
    const normalizedExtension = normalizeExtension(extension || normalizedName || '.fbx').toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(normalizedExtension)) {
      throw new Error('Unsupported player model type. Use .fbx, .gltf, .glb, or .obj.');
    }

    return new PlayerModel({
      name: normalizedName,
      fileName: normalizedName,
      extension: normalizedExtension,
      mimeType: (mimeType || parsedMimeType || 'application/octet-stream').toLowerCase(),
      dataUrl,
      hasHumanoidRig: Boolean(hasHumanoidRig),
      isRigged: Boolean(isRigged),
    });
  }

  constructor({
    name,
    fileName,
    extension,
    mimeType,
    dataUrl,
    size = 0,
    hasHumanoidRig = false,
    isRigged = false,
    manifest = null,
    eyePosition = null,
    boneNames = [],
    materialData = null,
    bundleFiles = {},
    modelBasePath = '',
  } = {}) {
    this.name = sanitizeFileName(name || fileName || 'player-model');
    this.fileName = sanitizeFileName(fileName || this.name, 'player-model');
    this.extension = normalizeExtension(this.fileName || extension || '.fbx').toLowerCase() || '.fbx';
    this.mimeType = String(mimeType || 'application/octet-stream').toLowerCase();
    this.dataUrl = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    this.size = Number.isFinite(size) ? size : 0;
    this.hasHumanoidRig = Boolean(hasHumanoidRig);
    this.isRigged = Boolean(isRigged);
    this.manifest = cleanManifestObject(manifest || {});
    this.eyePosition = normalizeEyePosition(eyePosition ?? this.manifest?.eyePosition ?? this.manifest?.lookPosition ?? null);
    this.boneNames = normalizeBoneNames(boneNames || this.manifest?.boneNames || this.manifest?.bones || this.manifest?.humanoid?.boneNames || this.manifest?.rig?.boneNames || this.manifest?.player?.boneNames);
    this.materialData = normalizeMaterialData(materialData ?? this.manifest?.materialData ?? this.manifest?.materials ?? this.manifest?.material ?? null);
    this.bundleFiles = bundleFiles && typeof bundleFiles === 'object' ? { ...bundleFiles } : {};
    this.modelBasePath = typeof modelBasePath === 'string' ? modelBasePath.replace(/\\/g, '/') : '';

    if (!ALLOWED_EXTENSIONS.has(this.extension)) {
      throw new Error('Unsupported player model type. Use .fbx, .gltf, .glb, .obj, or .zip.');
    }
  }

  toJSON() {
    return {
      name: this.name,
      fileName: this.fileName,
      extension: this.extension,
      mimeType: this.mimeType,
      dataUrl: this.dataUrl,
      hasHumanoidRig: this.hasHumanoidRig,
      isRigged: this.isRigged,
      size: this.size,
      eyePosition: { ...this.eyePosition },
      boneNames: [...this.boneNames],
      materialData: this.materialData ? cleanManifestObject(this.materialData) : null,
      manifest: this.manifest ? cleanManifestObject(this.manifest) : null,
      modelBasePath: this.modelBasePath,
    };
  }

  toServerPayload() {
    return {
      name: this.name,
      fileName: this.fileName,
      extension: this.extension,
      mimeType: this.mimeType,
      dataUrl: this.dataUrl,
      hasHumanoidRig: this.hasHumanoidRig,
      isRigged: this.isRigged,
      eyePosition: { ...this.eyePosition },
      boneNames: [...this.boneNames],
      materialData: this.materialData ? cleanManifestObject(this.materialData) : null,
      manifest: this.manifest ? cleanManifestObject(this.manifest) : null,
    };
  }
}
