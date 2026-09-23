import * as THREE from 'three';
import { Collider } from './Collider.js';

export class MeshCollider extends Collider {
  constructor({ mesh = null, offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    super({ type: 'MeshCollider', offset, physicsCollision });
    this.mesh = mesh;
    this.bounds = new THREE.Box3();
  }

  setMesh(mesh) {
    this.mesh = mesh;
  }

  getAABB(position, target) {
    if (this.mesh) {
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
}