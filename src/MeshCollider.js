/**
 * MeshCollider.js
 *
 * Implements a mesh-backed collider that uses broad-phase AABB checks and
 * triangle intersection tests against scene geometry.
 */

import * as THREE from 'three';
import { Collider } from './Collider.js';

export class MeshCollider extends Collider {
  constructor({ mesh = null, offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    super({ type: 'MeshCollider', offset, physicsCollision });
    this.mesh = mesh;
    this.bounds = new THREE.Box3();
    this._triangle = new THREE.Triangle();
    this._v0 = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  setMesh(mesh) {
    this.mesh = mesh;
  }

  getBounds(position, target) {
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

        const childBounds = new THREE.Box3();
        childBounds.setFromBufferAttribute(positionAttribute).applyMatrix4(child.matrixWorld);
        this.bounds.union(childBounds);
      });

      target.min.copy(this.bounds.min).add(this.offset);
      target.max.copy(this.bounds.max).add(this.offset);
      return target;
    }

    const center = target.min;
    center.copy(position).add(this.offset);
    target.min.copy(center);
    target.max.copy(center);
    return target;
  }

  intersectsBounds(bounds, position) {
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

        this._v0.fromBufferAttribute(positionAttribute, i0).applyMatrix4(child.matrixWorld).add(this.offset);
        this._v1.fromBufferAttribute(positionAttribute, i1).applyMatrix4(child.matrixWorld).add(this.offset);
        this._v2.fromBufferAttribute(positionAttribute, i2).applyMatrix4(child.matrixWorld).add(this.offset);

        this._triangle.set(this._v0, this._v1, this._v2);
        if (dynamicBox.intersectsTriangle(this._triangle)) {
          intersects = true;
          break;
        }
      }
    });

    return intersects;
  }

  getGroundHeightAt(playerPosition) {
    if (!this.mesh) {
      return null;
    }

    this.mesh.updateMatrixWorld(true);

    const origin = new THREE.Vector3(playerPosition.x, 200, playerPosition.z);
    const direction = new THREE.Vector3(0, -1, 0);
    const raycaster = new THREE.Raycaster(origin, direction, 0, 500);
    const hits = raycaster.intersectObject(this.mesh, true);

    if (!hits.length) {
      return null;
    }

    const hit = hits.find((entry) => Math.abs(entry.point.x - playerPosition.x) < 1.5 && Math.abs(entry.point.z - playerPosition.z) < 1.5);
    return hit ? hit.point.y : hits[0].point.y;
  }
}