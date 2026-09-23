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

  getAABB(position, target) {
    if (this.mesh) {
      this.mesh.updateMatrixWorld(true);
      this.bounds.setFromObject(this.mesh);
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

  intersectsAABB(aabb, position) {
    if (!this.mesh) {
      return super.intersectsAABB(aabb, position);
    }

    this.getAABB(position, this._tmpAABB);
    const broadPhaseOverlap = !(
      aabb.max.x <= this._tmpAABB.min.x ||
      aabb.min.x >= this._tmpAABB.max.x ||
      aabb.max.y <= this._tmpAABB.min.y ||
      aabb.min.y >= this._tmpAABB.max.y ||
      aabb.max.z <= this._tmpAABB.min.z ||
      aabb.min.z >= this._tmpAABB.max.z
    );

    if (!broadPhaseOverlap) {
      return false;
    }

    const dynamicBox = new THREE.Box3(aabb.min.clone(), aabb.max.clone());
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
}