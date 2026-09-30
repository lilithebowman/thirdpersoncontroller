/**
 * MaterialRenderService.js
 *
 * Class: MaterialRenderService
 * Purpose: Centralizes material rendering configuration (transparent vs cutout)
 *          for 3D models and meshes across loaders and editors.
 */

export class MaterialRenderService {
  /**
   * Applies material rendering settings based on render type and overrides.
   * @param {THREE.Material|Array<THREE.Material>} materialInput - Material or array of materials
   * @param {string} renderType - Render type ('transparent', 'cutout', etc.)
   */
  static applyMaterialRenderType(materialInput, renderType) {
    if (!materialInput) {
      return;
    }

    const materials = Array.isArray(materialInput) ? materialInput : [materialInput];
    materials.forEach((material) => {
      if (!material) {
        return;
      }

      if (renderType === 'transparent') {
        material.transparent = true;
        material.depthWrite = false;
      } else {
        material.alphaTest = 0.5;
      }
    });
  }

  /**
   * Configures mesh and materials using sub-mesh overrides and default render type.
   * @param {THREE.Object3D} model - Loaded 3D object / model
   * @param {Object} subMeshOverrides - Sub-mesh override map from meta
   * @param {string} defaultRenderType - Default render type
   */
  static configureModelMaterials(model, subMeshOverrides = {}, defaultRenderType = 'cutout') {
    if (!model || typeof model.traverse !== 'function') {
      return;
    }

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const override = subMeshOverrides[child.name] ?? {};
      child.frustumCulled = false;
      child.castShadow = override.castShadow ?? true;
      child.receiveShadow = override.receiveShadow ?? true;
      if (override.visible !== undefined) {
        child.visible = override.visible;
      }

      const renderType = override.materialRenderType ?? defaultRenderType;
      if (child.material) {
        this.applyMaterialRenderType(child.material, renderType);
      }
    });
  }
}
