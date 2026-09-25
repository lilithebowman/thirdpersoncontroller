/**
 * Rigidbody.js
 *
 * Integrates velocity and accumulated forces, applies gravity and damping, and
 * resolves ground and collider overlaps for the player controller.
 */

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
    this._previousPosition = new THREE.Vector3();
    this._candidatePosition = new THREE.Vector3();
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

    this._previousPosition.copy(position);
    position.addScaledVector(this.velocity, delta);

    if (this.enablePhysicsCollision && collider && Array.isArray(colliders) && colliders.length > 0) {
      this.resolveColliderCollisions(position, this._previousPosition, collider, colliders);
    }

    const groundedFromCollision = this.isGroundedAgainstWorld(position, this._previousPosition, collider, colliders);
    let isGrounded = groundedFromCollision || position.y <= groundY + 1e-6;

    if (isGrounded && position.y < groundY) {
      position.y = groundY;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    this.clearForces();
    return isGrounded;
  }

  isGroundedAgainstWorld(position, previousPosition, collider, colliders) {
    if (!collider || !Array.isArray(colliders) || colliders.length === 0) {
      return false;
    }

    collider.getAABB(position, this._aabbA);
    collider.getAABB(previousPosition, this._aabbB);

    const movingDown = position.y < previousPosition.y - 1e-6;
    if (!movingDown) {
      return false;
    }

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      const collisionShape = worldCollider.collider ?? worldCollider;
      if (!collisionShape || typeof collisionShape.getAABB !== 'function') {
        continue;
      }

      collisionShape.getAABB(worldCollider.position, this._centerA);

      const xOverlap = this._aabbA.max.x > this._centerA.min.x && this._aabbA.min.x < this._centerA.max.x;
      const zOverlap = this._aabbA.max.z > this._centerA.min.z && this._aabbA.min.z < this._centerA.max.z;
      const previousAboveSurface = this._aabbB.min.y >= this._centerA.max.y - 0.2;
      const feetNearSurface = this._aabbA.min.y <= this._centerA.max.y + 0.18 && this._aabbA.min.y >= this._centerA.max.y - 0.9;

      if (xOverlap && zOverlap && previousAboveSurface && feetNearSurface) {
        return true;
      }
    }

    return false;
  }

  resolveColliderCollisions(position, previousPosition, collider, colliders) {
    collider.getAABB(position, this._aabbA);

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      const collisionShape = worldCollider.collider ?? worldCollider;
      if (!collisionShape || typeof collisionShape.getAABB !== 'function') {
        continue;
      }

      collisionShape.getAABB(worldCollider.position, this._aabbB);

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

      if (typeof collisionShape.intersectsAABB === 'function' && !collisionShape.intersectsAABB(this._aabbA, worldCollider.position)) {
        continue;
      }

      if (collisionShape.type === 'MeshCollider') {
        this.resolveMeshCollision(position, previousPosition, collider, collisionShape, worldCollider.position);
        collider.getAABB(position, this._aabbA);
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

  resolveMeshCollision(position, previousPosition, movingCollider, worldCollisionShape, worldPosition) {
    const targetX = position.x;
    const targetY = position.y;
    const targetZ = position.z;

    this._candidatePosition.set(targetX, previousPosition.y, previousPosition.z);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.x = previousPosition.x;
      this.velocity.x = 0;
    } else {
      position.x = targetX;
    }

    this._candidatePosition.set(position.x, targetY, previousPosition.z);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.y = previousPosition.y;
      this.velocity.y = 0;
    } else {
      position.y = targetY;
    }

    this._candidatePosition.set(position.x, position.y, targetZ);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.z = previousPosition.z;
      this.velocity.z = 0;
    } else {
      position.z = targetZ;
    }
  }

  intersectsWorldShapeAt(testPosition, movingCollider, worldCollisionShape, worldPosition) {
    movingCollider.getAABB(testPosition, this._aabbA);
    return worldCollisionShape.intersectsAABB(this._aabbA, worldPosition);
  }
}