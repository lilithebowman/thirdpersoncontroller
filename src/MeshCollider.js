/**
 * MeshCollider.js
 *
 * Class: MeshCollider
 * Purpose: Implements a multi-mesh based triangle collider which performs broad-phase
 *          broad-phase AABB checks, narrow-phase triangle intersection tests, and ground height sampling.
 * 
 * Notes: Designed for static or dynamic meshes with multiple child meshes.
 * Inherits: Collider
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class MeshCollider extends Collider {
  /**
   * Creates a MeshCollider instance.
   * @param {Object} options - Configuration options
   * @param {THREE.Object3D|null} [options.mesh=null] - Source Three.js mesh for collision geometry
   * @param {THREE.Vector3} [options.offset=new THREE.Vector3()] - Position offset relative to parent transform
   * @param {boolean} [options.physicsCollision=true] - Whether collider resolves physical overlaps
   * @param {number} [options.maxWalkableSlope=0.2] - Maximum walkable incline slope
   */
  constructor({ mesh = null, offset = new THREE.Vector3(), physicsCollision = true, maxWalkableSlope = 0.2 } = {}) {
    super({ type: 'MeshCollider', offset, physicsCollision, maxWalkableSlope });
    this.mesh = mesh;
    this.bounds = new THREE.Box3();
    this._triangle = new THREE.Triangle();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._boundsWorkspace = new THREE.Box3();
    this._groundRay = new THREE.Raycaster();
    this._groundDirection = new THREE.Vector3(0, -1, 0);
    this._groundOrigin = new THREE.Vector3();
    this._groundHeightCache = { key: null, value: null, time: 0 };
    this._meshWorldPos = new THREE.Vector3();
    this._translationDelta = new THREE.Vector3();
  }

  /**
   * Sets or updates the source mesh for collision.
   * @param {THREE.Object3D} mesh - New collision mesh
   */
  setMesh(mesh) {
    this.mesh = mesh;
  }

  /**
   * Computes the world-space bounding box for the mesh collider by traversing
   * child meshes and unioning their transformed buffer attributes.
   * @param {THREE.Vector3|null} [position=null] - World position fallback or override
   * @param {THREE.Box3} target - Target box to populate
   * @returns {THREE.Box3} Populated bounds object
   */
  getBounds(position = null, target) {
    if (this.mesh) {
      this.mesh.updateMatrixWorld(true);

      this.bounds.makeEmpty();
      this.mesh.traverse((child) => {
        if (!child?.isMesh || !child.geometry) {
          return;
        }

        const positionAttribute = child.geometry.attributes?.position;
        if (!positionAttribute) {
          return;
        }

        this._boundsWorkspace.setFromBufferAttribute(positionAttribute).applyMatrix4(child.matrixWorld);
        this.bounds.union(this._boundsWorkspace);
      });

      if (position) {
        this.mesh.getWorldPosition(this._meshWorldPos);
        this._translationDelta.copy(position).sub(this._meshWorldPos);
        this.bounds.min.add(this._translationDelta);
        this.bounds.max.add(this._translationDelta);
      }

      target.min.copy(this.bounds.min).add(this.offset);
      target.max.copy(this.bounds.max).add(this.offset);
      return target;
    }

    if (position) {
      const center = target.min;
      center.copy(position).add(this.offset);
      target.min.copy(center);
      target.max.copy(center);
      return target;
    }

    return super.getBounds(position, target);
  }

  /**
   * Tests intersection between a dynamic AABB and this mesh collider.
   * Logic:
   * 1. Broad-phase AABB test to quickly reject non-overlapping colliders.
   * 2. Narrow-phase triangle traversal: iterates over geometry triangles, transforms vertices
   *    to world space, and tests triangle-box intersection.
   * @param {THREE.Box3} bounds - Dynamic AABB bounds to test
   * @param {THREE.Vector3|null} [position=null] - World position of the mesh collider
   * @returns {boolean} True if any triangle intersects the dynamic AABB
   */
  intersectsBounds(bounds, position = null) {
    if (!this.mesh) {
      return super.intersectsBounds(bounds, position);
    }

    this.getBounds(position, this._tmpBounds);
    const broadPhaseOverlap = !(
      bounds.max.x <= this._tmpBounds.min.x ||
      bounds.min.x >= this._tmpBounds.max.x ||
      bounds.max.y <= this._tmpBounds.min.y ||
      bounds.min.y >= this._tmpBounds.max.y ||
      bounds.max.z <= this._tmpBounds.min.z ||
      bounds.min.z >= this._tmpBounds.max.z
    );

    if (!broadPhaseOverlap) {
      return false;
    }

    this.mesh.getWorldPosition(this._meshWorldPos);
    if (position) {
      this._translationDelta.copy(position).sub(this._meshWorldPos);
    } else {
      this._translationDelta.set(0, 0, 0);
    }

    const dynamicBox = new THREE.Box3(bounds.min.clone(), bounds.max.clone());
    let intersects = false;

    this.mesh.traverse((child) => {
      if (intersects || !child?.isMesh || !child.geometry) {
        return;
      }

      const positionAttribute = child.geometry.attributes?.position;
      if (!positionAttribute) {
        return;
      }

      const index = child.geometry.index;
      const triangleCount = index ? index.count / 3 : positionAttribute.count / 3;

      for (let triangleIndex = 0; triangleIndex < triangleCount; triangleIndex += 1) {
        const i0 = index ? index.getX(triangleIndex * 3) : triangleIndex * 3;
        const i1 = index ? index.getX(triangleIndex * 3 + 1) : triangleIndex * 3 + 1;
        const i2 = index ? index.getX(triangleIndex * 3 + 2) : triangleIndex * 3 + 2;

        this._v0.fromBufferAttribute(positionAttribute, i0).applyMatrix4(child.matrixWorld).add(this._translationDelta).add(this.offset);
        this._v1.fromBufferAttribute(positionAttribute, i1).applyMatrix4(child.matrixWorld).add(this._translationDelta).add(this.offset);
        this._v2.fromBufferAttribute(positionAttribute, i2).applyMatrix4(child.matrixWorld).add(this._translationDelta).add(this.offset);

        this._triangle.set(this._v0, this._v1, this._v2);
        if (dynamicBox.intersectsTriangle(this._triangle)) {
          intersects = true;
          break;
        }
      }
    });

    return intersects;
  }

  /**
   * Samples the ground height (Y coordinate) below a given player position using raycasting.
   * Includes spatial caching (80ms TTL) and slope limit verification against maxWalkableSlope.
   * @param {THREE.Vector3} playerPosition - Current player position
   * @param {THREE.Vector3|null} [position=null] - World position of the mesh collider
   * @param {number} [maxWalkableSlope=this.maxWalkableSlope] - Maximum walkable incline slope
   * @returns {number|null} Ground Y coordinate or null if no hit or too steep
   */
  getGroundHeightAt(playerPosition, position = null, maxWalkableSlope = this.maxWalkableSlope) {
    if (!this.mesh) {
      return null;
    }

    const resolvedSlope = Number.isFinite(maxWalkableSlope) ? maxWalkableSlope : this.maxWalkableSlope;
    const cacheKey = `${Math.round(playerPosition.x * 4)}:${Math.round(playerPosition.z * 4)}:${position ? `${Math.round(position.x * 4)},${Math.round(position.z * 4)}` : ''}:${resolvedSlope}`;
    const now = performance.now();
    if (this._groundHeightCache.key === cacheKey && now - this._groundHeightCache.time < 80) {
      return this._groundHeightCache.value;
    }

    this.mesh.updateMatrixWorld(true);
    this.mesh.getWorldPosition(this._meshWorldPos);
    if (position) {
      this._translationDelta.copy(position).sub(this._meshWorldPos);
    } else {
      this._translationDelta.set(0, 0, 0);
    }

    this._groundOrigin.set(playerPosition.x, Math.max(playerPosition.y + 100, 200), playerPosition.z);
    this._groundOrigin.sub(this._translationDelta);

    this._groundRay.set(this._groundOrigin, this._groundDirection);
    this._groundRay.far = 1000;
    this._groundRay.near = 0;

    const hits = this._groundRay.intersectObject(this.mesh, true);
    let result = null;
    if (hits.length > 0) {
      const hit = hits[0];
      let isWalkable = true;

      if (hit.object && hit.object.geometry) {
        const geom = hit.object.geometry;
        const posAttr = geom.attributes?.position;
        const indexAttr = geom.index;
        const faceIndex = hit.faceIndex;

        if (posAttr && Number.isFinite(faceIndex)) {
          const i0 = indexAttr ? indexAttr.getX(faceIndex * 3) : faceIndex * 3;
          const i1 = indexAttr ? indexAttr.getX(faceIndex * 3 + 1) : faceIndex * 3 + 1;
          const i2 = indexAttr ? indexAttr.getX(faceIndex * 3 + 2) : faceIndex * 3 + 2;

          this._v0.fromBufferAttribute(posAttr, i0).applyMatrix4(hit.object.matrixWorld);
          this._v1.fromBufferAttribute(posAttr, i1).applyMatrix4(hit.object.matrixWorld);
          this._v2.fromBufferAttribute(posAttr, i2).applyMatrix4(hit.object.matrixWorld);

          this._triangle.set(this._v0, this._v1, this._v2);
          const normal = new THREE.Vector3();
          this._triangle.getNormal(normal);
          if (normal.y < 0) {
            normal.negate();
          }

          const ny = Math.max(1e-6, normal.y);
          const horizontalMagnitude = Math.sqrt(normal.x * normal.x + normal.z * normal.z);
          const slope = horizontalMagnitude / ny;

          if (slope > resolvedSlope) {
            isWalkable = false;
          }
        }
      }

      if (isWalkable) {
        const hitPoint = hit.point.clone().add(this._translationDelta).add(this.offset);
        result = hitPoint.y;
      }
    }

    this._groundHeightCache.key = cacheKey;
    this._groundHeightCache.value = result;
    this._groundHeightCache.time = now;
    return result;
  }
}