const ALLOWED_EXTENSIONS = new Set(['.fbx', '.gltf', '.glb', '.obj']);
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
      throw new Error('Unsupported player model type. Use .fbx, .gltf, .glb, or .obj.');
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
    };
  }

  static async fromFile(file) {
    const metadata = await this.validateFile(file);
    const arrayBuffer = await file.arrayBuffer();
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

  static async fromDataUrl({ name, dataUrl, mimeType, extension, hasHumanoidRig = false, isRigged = false } = {}) {
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

  constructor({ name, fileName, extension, mimeType, dataUrl, size = 0, hasHumanoidRig = false, isRigged = false } = {}) {
    this.name = sanitizeFileName(name || fileName || 'player-model');
    this.fileName = sanitizeFileName(fileName || this.name, 'player-model');
    this.extension = normalizeExtension(this.fileName || extension || '.fbx').toLowerCase() || '.fbx';
    this.mimeType = String(mimeType || 'application/octet-stream').toLowerCase();
    this.dataUrl = typeof dataUrl === 'string' ? dataUrl.trim() : '';
    this.size = Number.isFinite(size) ? size : 0;
    this.hasHumanoidRig = Boolean(hasHumanoidRig);
    this.isRigged = Boolean(isRigged);

    if (!ALLOWED_EXTENSIONS.has(this.extension)) {
      throw new Error('Unsupported player model type. Use .fbx, .gltf, .glb, or .obj.');
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
    };
  }
}
