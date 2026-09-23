import * as THREE from 'three';

export class Collider {
  constructor({ type = 'Collider', offset = new THREE.Vector3(), physicsCollision = true } = {}) {
    this.type = type;
    this.offset = offset.clone();
    this.physicsCollision = physicsCollision === true;
  }

  getAABB(_position, _target) {
    throw new Error('Collider.getAABB must be implemented by subclasses.');
  }
}