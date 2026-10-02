import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const DEFAULT_TEXTURE_SIZE = 1024;

function getViewportTextureSize() {
  if (typeof window === 'undefined') {
    return DEFAULT_TEXTURE_SIZE;
  }

  const viewport = Math.max(window.innerWidth, window.innerHeight, 1);
  const pixelRatio = Number.isFinite(window.devicePixelRatio) ? window.devicePixelRatio : 1;
  return Math.max(256, Math.floor(viewport * pixelRatio));
}

export class Mirror {
  static isMirrorMaterialType(value) {
    return typeof value === 'string' && value.trim().toLowerCase() === 'mirror';
  }

  createReflector(geometry, options = {}) {
    if (!geometry) {
      return null;
    }

    return new Reflector(geometry, {
      clipBias: Number.isFinite(options.clipBias) ? options.clipBias : 0.003,
      textureWidth: Number.isFinite(options.textureWidth) ? options.textureWidth : getViewportTextureSize(),
      textureHeight: Number.isFinite(options.textureHeight) ? options.textureHeight : getViewportTextureSize(),
      color: options.color ?? '#9fb7c0',
    });
  }
}
