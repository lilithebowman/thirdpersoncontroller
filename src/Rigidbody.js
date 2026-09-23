import * as THREE from 'three';

export class Rigidbody {
  constructor({ mass = 1, gravity = new THREE.Vector3(0, -24, 0), linearDamping = 0, enablePhysicsCollision = false } = {}) {
    this.mass = Math.max(0.0001, mass);
    this.gravity = gravity.clone();
    this.linearDamping = Math.max(0, linearDamping);
    this.enablePhysicsCollision = enablePhysicsCollision === true;

    this.velocity = new THREE.Vector3();
    this.accumulatedForce = new THREE.Vector3();
    this.useGravity = true;

    this._tmpForce = new THREE.Vector3();
    this._tmpAcceleration = new THREE.Vector3();
    this._aabbA = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this._aabbB = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this._centerA = new THREE.Vector3();
    this._centerB = new THREE.Vector3();
  }

  addForce(force) {
    this.accumulatedForce.add(force);
  }

  addImpulse(impulse) {
    this.velocity.addScaledVector(impulse, 1 / this.mass);
  }

  clearForces() {
    this.accumulatedForce.set(0, 0, 0);
  }

  integrate(position, delta, { groundY = 0, collider = null, colliders = [] } = {}) {
    if (!Number.isFinite(delta) || delta <= 0) {
      return position.y <= groundY + 1e-6;
    }

    if (this.useGravity) {
      this._tmpForce.copy(this.gravity).multiplyScalar(this.mass);
      this.addForce(this._tmpForce);
    }

    this._tmpAcceleration.copy(this.accumulatedForce).multiplyScalar(1 / this.mass);
    this.velocity.addScaledVector(this._tmpAcceleration, delta);

    if (this.linearDamping > 0) {
      const damping = Math.max(0, 1 - this.linearDamping * delta);
      this.velocity.multiplyScalar(damping);
    }

    position.addScaledVector(this.velocity, delta);

    if (this.enablePhysicsCollision && collider && Array.isArray(colliders) && colliders.length > 0) {
      this.resolveColliderCollisions(position, collider, colliders);
    }

    let isGrounded = false;
    if (position.y < groundY) {
      position.y = groundY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
      isGrounded = true;
    }

    this.clearForces();
    return isGrounded;
  }

  resolveColliderCollisions(position, collider, colliders) {
    collider.getAABB(position, this._aabbA);

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      worldCollider.getAABB(worldCollider.position, this._aabbB);

      if (
        this._aabbA.max.x <= this._aabbB.min.x ||
        this._aabbA.min.x >= this._aabbB.max.x ||
        this._aabbA.max.y <= this._aabbB.min.y ||
        this._aabbA.min.y >= this._aabbB.max.y ||
        this._aabbA.max.z <= this._aabbB.min.z ||
        this._aabbA.min.z >= this._aabbB.max.z
      ) {
        continue;
      }

      const overlapX = Math.min(this._aabbA.max.x, this._aabbB.max.x) - Math.max(this._aabbA.min.x, this._aabbB.min.x);
      const overlapY = Math.min(this._aabbA.max.y, this._aabbB.max.y) - Math.max(this._aabbA.min.y, this._aabbB.min.y);
      const overlapZ = Math.min(this._aabbA.max.z, this._aabbB.max.z) - Math.max(this._aabbA.min.z, this._aabbB.min.z);

      this._centerA.set(
        (this._aabbA.min.x + this._aabbA.max.x) * 0.5,
        (this._aabbA.min.y + this._aabbA.max.y) * 0.5,
        (this._aabbA.min.z + this._aabbA.max.z) * 0.5
      );
      this._centerB.set(
        (this._aabbB.min.x + this._aabbB.max.x) * 0.5,
        (this._aabbB.min.y + this._aabbB.max.y) * 0.5,
        (this._aabbB.min.z + this._aabbB.max.z) * 0.5
      );

      if (overlapX <= overlapY && overlapX <= overlapZ) {
        const direction = this._centerA.x >= this._centerB.x ? 1 : -1;
        position.x += overlapX * direction;
        this.velocity.x = 0;
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        const direction = this._centerA.y >= this._centerB.y ? 1 : -1;
        position.y += overlapY * direction;
        this.velocity.y = 0;
      } else {
        const direction = this._centerA.z >= this._centerB.z ? 1 : -1;
        position.z += overlapZ * direction;
        this.velocity.z = 0;
      }

      collider.getAABB(position, this._aabbA);
    }
  }
}