/**
 * AssetMetaService.js
 *
 * Service: AssetMetaService
 * Purpose: Manages checking, dirty detection, and generation of .meta.json companion files
 *          for 3D assets (like OBJ models), integrating with development server APIs or client fallbacks.
 */

export class AssetMetaService {
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint ?? '/api/asset-meta';
  }

  /**
   * Checks whether the .meta.json file exists and whether it is dirty (out of date) relative to the asset.
   * @param {string} assetPath - Relative asset path (e.g., 'models/2026-CozyCon-Cafe/CosmosStation.obj')
   * @returns {Promise<{exists: boolean, dirty: boolean, meta: Object|null}>}
   */
  async checkMetaStatus(assetPath) {
    if (!assetPath) {
      return { exists: false, dirty: false, meta: null };
    }

    try {
      const response = await fetch(`${this.apiEndpoint}?path=${encodeURIComponent(assetPath)}`);
      if (response.ok) {
        const data = await response.json();
        return {
          exists: data.exists === true,
          dirty: data.dirty === true,
          meta: data.meta ?? null,
        };
      }
    } catch (error) {
      // Fallback if backend API is not available (e.g. static hosting or production build)
    }

    // Static fallback: fetch meta.json directly
    try {
      const metaUrl = new URL(assetPath + '.meta.json', window.location.origin).toString();
      const metaResponse = await fetch(metaUrl);
      if (metaResponse.ok) {
        const meta = await metaResponse.json();
        return { exists: true, dirty: false, meta };
      }
    } catch (error) {
      // Missing meta
    }

    return { exists: false, dirty: true, meta: null };
  }

  /**
   * Generates or updates the .meta.json file for an asset.
   * @param {string} assetPath - Relative asset path
   * @param {Array<string>} [subMeshNames=[]] - Discovered sub-mesh names
   * @param {Object} [importSettings={}] - Default import settings
   * @returns {Promise<Object>} Generated meta object
   */
  async generateMeta(assetPath, subMeshNames = [], importSettings = {}) {
    if (!assetPath) {
      throw new Error('AssetMetaService requires an assetPath to generate meta.');
    }

    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          assetPath,
          subMeshNames,
          importSettings,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.meta) {
          return data.meta;
        }
      }
    } catch (error) {
      // Fallback for static environments
    }

    // Client-side fallback meta object generation
    const subMeshOverrides = {};
    subMeshNames.forEach((name) => {
      subMeshOverrides[name] = {
        castShadow: true,
        receiveShadow: true,
        materialRenderType: 'cutout',
      };
    });

    const fallbackMeta = {
      assetPath,
      version: 1,
      generatedAt: new Date().toISOString(),
      importSettings: {
        scaleFactor: 1.0,
        generateColliders: true,
        materialRenderType: 'cutout',
        ...importSettings,
      },
      subMeshOverrides,
    };

    return fallbackMeta;
  }
}

export const assetMetaService = new AssetMetaService();
