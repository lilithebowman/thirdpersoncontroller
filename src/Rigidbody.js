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
    this._boundsA = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this._boundsB = { min: new THREE.Vector3(), max: new THREE.Vector3() };
    this._centerA = new THREE.Vector3();
    this._centerB = new THREE.Vector3();
    this._previousPosition = new THREE.Vector3();
    this._candidatePosition = new THREE.Vector3();
    this._groundProbePosition = new THREE.Vector3();
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

  getGroundHeightAt(position, colliders) {
    let bestGroundY = null;

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      const collisionShape = worldCollider.collider ?? worldCollider;
      if (!collisionShape || typeof collisionShape.getGroundHeightAt !== 'function') {
        continue;
      }

      this._groundProbePosition.set(position.x, Math.max(position.y + 3, 15), position.z);
      const groundY = collisionShape.getGroundHeightAt(this._groundProbePosition, worldCollider.position);
      if (groundY === null || !Number.isFinite(groundY)) {
        continue;
      }

      const playerBottom = position.y;
      const withinReach = playerBottom >= groundY - 1.2 && playerBottom <= groundY + 1.2;
      if (withinReach && (bestGroundY === null || groundY > bestGroundY)) {
        bestGroundY = groundY;
      }
    }

    return bestGroundY;
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

    const groundHeight = this.getGroundHeightAt(position, colliders);
    const groundedFromCollision = this.isGroundedAgainstWorld(position, this._previousPosition, collider, colliders);
    let isGrounded = groundedFromCollision || position.y <= groundY + 1e-6;

    if (groundHeight !== null && this.velocity.y <= 0.2) {
      isGrounded = true;
      const epsilon = 0.18;
      if (position.y < groundHeight - epsilon) {
        position.y = groundHeight;
      }
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

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

    collider.getBounds(position, this._boundsA);
    collider.getBounds(previousPosition, this._boundsB);

    const playerBottom = this._boundsA.min.y;
    const previousBottom = this._boundsB.min.y;

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      const collisionShape = worldCollider.collider ?? worldCollider;
      if (!collisionShape || typeof collisionShape.getBounds !== 'function') {
        continue;
      }

      const groundHeight = typeof collisionShape.getGroundHeightAt === 'function'
        ? collisionShape.getGroundHeightAt(new THREE.Vector3(position.x, Math.max(position.y + 3, 15), position.z), worldCollider.position)
        : null;

      if (groundHeight !== null && Number.isFinite(groundHeight)) {
        const onSurface = playerBottom >= groundHeight - 0.8 && playerBottom <= groundHeight + 0.6;
        const isSettled = this.velocity.y <= 0.2 || previousBottom >= groundHeight - 0.2;
        if (onSurface && isSettled) {
          return true;
        }
      }

      const worldBounds = { min: new THREE.Vector3(), max: new THREE.Vector3() };
      collisionShape.getBounds(worldCollider.position, worldBounds);

      const xOverlap = this._boundsA.max.x > worldBounds.min.x && this._boundsA.min.x < worldBounds.max.x;
      const zOverlap = this._boundsA.max.z > worldBounds.min.z && this._boundsA.min.z < worldBounds.max.z;
      const feetNearSurface = playerBottom <= worldBounds.max.y + 0.25 && playerBottom >= worldBounds.max.y - 0.9;
      const isSettledOrDescending = this.velocity.y <= 0.1 || previousBottom >= worldBounds.max.y - 0.2;
      const groundedContact = xOverlap && zOverlap && feetNearSurface && isSettledOrDescending;

      if (groundedContact) {
        return true;
      }
    }

    return false;
  }

  resolveColliderCollisions(position, previousPosition, collider, colliders) {
    collider.getBounds(position, this._boundsA);

    for (const worldCollider of colliders) {
      if (!worldCollider || worldCollider.physicsCollision !== true) {
        continue;
      }

      const collisionShape = worldCollider.collider ?? worldCollider;
      if (!collisionShape || typeof collisionShape.getBounds !== 'function') {
        continue;
      }

      collisionShape.getBounds(worldCollider.position, this._boundsB);

      if (
        this._boundsA.max.x <= this._boundsB.min.x ||
        this._boundsA.min.x >= this._boundsB.max.x ||
        this._boundsA.max.y <= this._boundsB.min.y ||
        this._boundsA.min.y >= this._boundsB.max.y ||
        this._boundsA.max.z <= this._boundsB.min.z ||
        this._boundsA.min.z >= this._boundsB.max.z
      ) {
        continue;
      }

      if (typeof collisionShape.intersectsBounds === 'function' && !collisionShape.intersectsBounds(this._boundsA, worldCollider.position)) {
        continue;
      }

      if (collisionShape.type === 'MeshCollider') {
        this.resolveMeshCollision(position, previousPosition, collider, collisionShape, worldCollider.position);
        collider.getBounds(position, this._boundsA);
        continue;
      }

      const overlapX = Math.min(this._boundsA.max.x, this._boundsB.max.x) - Math.max(this._boundsA.min.x, this._boundsB.min.x);
      const overlapY = Math.min(this._boundsA.max.y, this._boundsB.max.y) - Math.max(this._boundsA.min.y, this._boundsB.min.y);
      const overlapZ = Math.min(this._boundsA.max.z, this._boundsB.max.z) - Math.max(this._boundsA.min.z, this._boundsB.min.z);

      this._centerA.set(
        (this._boundsA.min.x + this._boundsA.max.x) * 0.5,
        (this._boundsA.min.y + this._boundsA.max.y) * 0.5,
        (this._boundsA.min.z + this._boundsA.max.z) * 0.5
      );
      this._centerB.set(
        (this._boundsB.min.x + this._boundsB.max.x) * 0.5,
        (this._boundsB.min.y + this._boundsB.max.y) * 0.5,
        (this._boundsB.min.z + this._boundsB.max.z) * 0.5
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

      collider.getBounds(position, this._boundsA);
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

    if (this.intersectsWorldShapeAt(position, movingCollider, worldCollisionShape, worldPosition)) {
      const dx = Math.abs(targetX - previousPosition.x);
      const dy = Math.abs(targetY - previousPosition.y);
      const dz = Math.abs(targetZ - previousPosition.z);

      if (dy >= dx && dy >= dz) {
        position.y = previousPosition.y;
        this.velocity.y = 0;
      } else if (dx >= dz) {
        position.x = previousPosition.x;
        this.velocity.x = 0;
        position.z = targetZ;
      } else {
        position.z = previousPosition.z;
        this.velocity.z = 0;
        position.x = targetX;
      }
    }
  }

  intersectsWorldShapeAt(testPosition, movingCollider, worldCollisionShape, worldPosition) {
    movingCollider.getBounds(testPosition, this._boundsA);
    return worldCollisionShape.intersectsBounds(this._boundsA, worldPosition);
  }
}