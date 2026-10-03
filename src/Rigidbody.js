/**
 * Rigidbody.js
 *
 * Integrates velocity and accumulated forces, applies gravity and damping, and
 * resolves ground and collider overlaps for the player controller.
 *
 * Physics & Collision Architecture:
 * - Integrates external forces and gravity into linear velocity using delta time.
 * - Performs ground height sampling via world collider raycasts / bounding checks.
 * - Resolves axis-aligned bounding box (AABB) overlap and positional correction
 *   against static environment colliders (`BoxCollider`, `SphereCollider`, `MeshCollider`).
 */

import * as THREE from 'three';
import { Force } from './Force.js';

export class Rigidbody {
  constructor({
    mass = 1,
    gravity = new THREE.Vector3(0, -24, 0),
    linearDamping = 0,
    enablePhysicsCollision = false,
    maxWalkableSlope = 0.2,
    physicsMaterial = 'default',
    restitution,
    friction,
    kinetic = false,
  } = {}) {
    this.mass = Math.max(0.0001, mass);
    this.gravity = Number.isFinite(gravity)
      ? Number(gravity)
      : (gravity instanceof THREE.Vector3
        ? gravity.clone()
        : (Array.isArray(gravity) && gravity.length >= 3 && gravity.every((axis) => Number.isFinite(axis))
          ? new THREE.Vector3(gravity[0], gravity[1], gravity[2])
          : new THREE.Vector3(0, -24, 0)));
    this.gravityVector = this.getGravityVector();
    this.linearDamping = Math.max(0, linearDamping);
    this.enablePhysicsCollision = enablePhysicsCollision === true;
    this.maxWalkableSlope = Number.isFinite(maxWalkableSlope) ? maxWalkableSlope : 0.2;
    this.physicsMaterial = typeof physicsMaterial === 'string' ? physicsMaterial.toLowerCase() : 'default';
    this.restitution = Number.isFinite(restitution)
      ? Math.min(1, Math.max(0, restitution))
      : Rigidbody.getRestitutionForMaterial(this.physicsMaterial);
    this.friction = Number.isFinite(friction)
      ? Math.min(1, Math.max(0, friction))
      : Rigidbody.getFrictionForMaterial(this.physicsMaterial);
    this.kinetic = kinetic === true;
    this.collisionPoints = [];

    this.velocity = new THREE.Vector3();
    this.accumulatedForce = new THREE.Vector3();
    this.useGravity = this.hasGravity();

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

  static getRestitutionForMaterial(material = 'default') {
    const normalized = typeof material === 'string' ? material.toLowerCase() : 'default';
    const restitutionByMaterial = {
      default: 0,
      bouncy: 0.9,
      rubber: 0.75,
      soft: 0.2,
      ice: 0.08,
    };
    return Number.isFinite(restitutionByMaterial[normalized]) ? restitutionByMaterial[normalized] : 0;
  }

  static getFrictionForMaterial(material = 'default') {
    const normalized = typeof material === 'string' ? material.toLowerCase() : 'default';
    const frictionByMaterial = {
      default: 0.45,
      bouncy: 0.55,
      rubber: 0.8,
      soft: 0.35,
      ice: 0.08,
    };
    return Number.isFinite(frictionByMaterial[normalized]) ? frictionByMaterial[normalized] : 0.45;
  }

  getSurfaceFriction(other = null) {
    const localFriction = Number.isFinite(this.friction) ? this.friction : 0.45;
    const otherFriction = other && Number.isFinite(other.friction)
      ? other.friction
      : (other && typeof other.physicsMaterial === 'string'
        ? Rigidbody.getFrictionForMaterial(other.physicsMaterial)
        : 0.45);
    return Math.min(1, Math.max(0, (localFriction + otherFriction) * 0.5));
  }

  applySurfaceFriction(normal, frictionCoefficient = 0) {
    if (!normal || !(normal instanceof THREE.Vector3)) {
      return;
    }
    if (frictionCoefficient <= 0) {
      return;
    }

    const normalVector = normal.clone().normalize();
    if (normalVector.lengthSq() === 0) {
      return;
    }

    const tangentVelocity = this.velocity.clone().sub(
      normalVector.clone().multiplyScalar(this.velocity.dot(normalVector))
    );
    if (tangentVelocity.lengthSq() <= 1e-8) {
      return;
    }

    const reducedTangentialSpeed = Math.max(0, tangentVelocity.length() * (1 - frictionCoefficient));
    if (reducedTangentialSpeed <= 0) {
      this.velocity.copy(normalVector.clone().multiplyScalar(this.velocity.dot(normalVector)));
      return;
    }

    const tangentDirection = tangentVelocity.clone().normalize();
    const retainedNormal = normalVector.clone().multiplyScalar(this.velocity.dot(normalVector));
    this.velocity.copy(retainedNormal.add(tangentDirection.multiplyScalar(reducedTangentialSpeed)));
  }

  hasGravity() {
    if (this.gravity == null) {
      return false;
    }

    if (Number.isFinite(this.gravity)) {
      return this.gravity !== 0;
    }

    if (this.gravity instanceof THREE.Vector3) {
      return this.gravity.lengthSq() > 0;
    }

    return false;
  }

  configureGravity(enabled = this.hasGravity()) {
    const canUseGravity = this.hasGravity();
    this.useGravity = enabled === true && canUseGravity;
    return this.useGravity;
  }

  addForce(force) {
    if (force == null) {
      return;
    }

    if (Array.isArray(force)) {
      this.accumulatedForce.add(new THREE.Vector3(force[0] ?? 0, force[1] ?? 0, force[2] ?? 0));
      return;
    }

    if (force instanceof THREE.Vector3) {
      this.accumulatedForce.add(force);
      return;
    }

    if (typeof force === 'object' && 'x' in force && 'y' in force && 'z' in force) {
      this.accumulatedForce.add(new THREE.Vector3(force.x ?? 0, force.y ?? 0, force.z ?? 0));
    }
  }

  addImpulse(impulse) {
    this.velocity.addScaledVector(impulse, 1 / this.mass);
  }

  getGravityVector() {
    if (Number.isFinite(this.gravity)) {
      return new THREE.Vector3(0, Number(this.gravity), 0);
    }
    if (this.gravity instanceof THREE.Vector3) {
      return this.gravity.clone();
    }
    return new THREE.Vector3(0, -24, 0);
  }

  clearForces() {
    this.accumulatedForce.set(0, 0, 0);
  }

  registerCollisionPoint(point, impulse = null) {
    if (!this.kinetic) {
      return;
    }
    const collisionPoint = point instanceof THREE.Vector3 ? point.clone() : new THREE.Vector3();
    const impulseVector = impulse instanceof THREE.Vector3 ? impulse.clone() : new THREE.Vector3();
    this.collisionPoints.push({ point: collisionPoint, impulse: impulseVector });
    if (impulseVector.lengthSq() > 0) {
      this.addImpulse(impulseVector);
    }
  }

  resolveRigidBodyCollision(other, position, otherPosition, normal = null) {
    if (!other || typeof other.mass !== 'number' || !Number.isFinite(other.mass)) {
      return false;
    }

    const otherVelocity = other.velocity instanceof THREE.Vector3 ? other.velocity : new THREE.Vector3();
    const collisionNormal = normal instanceof THREE.Vector3
      ? normal.clone().normalize()
      : new THREE.Vector3().subVectors(otherPosition, position).normalize();

    if (collisionNormal.lengthSq() === 0) {
      return false;
    }

    const relativeVelocity = otherVelocity.clone().sub(this.velocity);
    const closingVelocity = relativeVelocity.dot(collisionNormal);
    if (closingVelocity >= 0) {
      return false;
    }

    const restitution = Math.max(this.restitution ?? 0, other.restitution ?? 0);
    const forceResult = new Force().applyCollisionImpulse({
      bodyA: this,
      bodyB: other,
      normal: collisionNormal,
      relativeVelocity,
      restitution,
    });

    if (forceResult.applied) {
      this.registerCollisionPoint(position, forceResult.impulse.clone());
      if (other && typeof other.registerCollisionPoint === 'function') {
        other.registerCollisionPoint(otherPosition, forceResult.impulse.clone().multiplyScalar(-1));
      }
    }

    return forceResult.applied;
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

      let groundY = null;
      if (collisionShape.type === 'MeshCollider') {
        this._groundProbePosition.set(position.x, Math.max(position.y + 3, 15), position.z);
        groundY = collisionShape.getGroundHeightAt(this._groundProbePosition, worldCollider.position, collisionShape.maxWalkableSlope ?? this.maxWalkableSlope);
      } else {
        groundY = collisionShape.getGroundHeightAt(position, worldCollider.position);
      }

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

  integrate(position, delta, { groundY = null, collider = null, colliders = [] } = {}) {
    if (!Number.isFinite(delta) || delta <= 0) {
      return groundY !== null ? position.y <= groundY + 1e-6 : false;
    }

    const initialGroundHeight = this.getGroundHeightAt(position, colliders);
    const effectiveInitialGround = initialGroundHeight !== null ? initialGroundHeight : groundY;
    const groundedFromCollision = this.isGroundedAgainstWorld(position, this._previousPosition, collider, colliders);
    const isCurrentlyGrounded = groundedFromCollision || (effectiveInitialGround !== null && Math.abs(position.y - effectiveInitialGround) < 0.35 && this.velocity.y <= 0.2);

    this.gravityVector = this.getGravityVector();

    if (this.useGravity && !isCurrentlyGrounded) {
      this._tmpForce.copy(this.gravityVector).multiplyScalar(this.mass);
      this.addForce(this._tmpForce);
    } else {
      this.accumulatedForce.y = 0;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    this._tmpAcceleration.copy(this.accumulatedForce).multiplyScalar(1 / this.mass);
    this.velocity.addScaledVector(this._tmpAcceleration, delta);

    if (this.linearDamping > 0) {
      const damping = Math.max(0, 1 - this.linearDamping * delta);
      this.velocity.multiplyScalar(damping);
    }

    this._previousPosition.copy(position);

    position.x += this.velocity.x * delta;
    position.z += this.velocity.z * delta;
    position.y += this.velocity.y * delta;

    if (this.enablePhysicsCollision && collider && Array.isArray(colliders) && colliders.length > 0) {
      this.resolveColliderCollisions(position, this._previousPosition, collider, colliders);
    }

    const groundHeight = this.getGroundHeightAt(position, colliders);
    const resolvedGround = groundHeight !== null ? groundHeight : groundY;
    const finalGroundedFromCollision = this.isGroundedAgainstWorld(position, this._previousPosition, collider, colliders);

    let isGrounded = finalGroundedFromCollision;
    const isAscending = this.velocity.y > 0.2;
    if (resolvedGround !== null && !isAscending) {
      if (position.y <= resolvedGround + 0.25 && this.velocity.y <= 0.5) {
        position.y = resolvedGround;
        this.velocity.y = 0;
        isGrounded = true;
      } else if (isCurrentlyGrounded && Math.abs(position.y - resolvedGround) < 0.6) {
        position.y = resolvedGround;
        this.velocity.y = 0;
        isGrounded = true;
      }
    } else if (isGrounded && !isAscending && resolvedGround !== null) {
      position.y = resolvedGround;
      this.velocity.y = 0;
    }

    this.clearForces();
    return isGrounded;
  }

  isGroundedAgainstWorld(position, previousPosition, collider, colliders) {
    if (!collider || !Array.isArray(colliders) || colliders.length === 0) {
      return false;
    }

    if (this.velocity.y > 0.2) {
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
        ? collisionShape.getGroundHeightAt(new THREE.Vector3(position.x, position.y + 0.25, position.z), worldCollider.position, collisionShape.maxWalkableSlope ?? this.maxWalkableSlope)
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
        const collisionNormal = new THREE.Vector3(direction, 0, 0);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
        this.velocity.x = 0;
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        const direction = this._centerA.y >= this._centerB.y ? 1 : -1;
        position.y += overlapY * direction;
        const collisionNormal = new THREE.Vector3(0, direction, 0);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
        this.velocity.y = 0;
      } else {
        const direction = this._centerA.z >= this._centerB.z ? 1 : -1;
        position.z += overlapZ * direction;
        const collisionNormal = new THREE.Vector3(0, 0, direction);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
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
    const maxSlope = worldCollisionShape.maxWalkableSlope ?? this.maxWalkableSlope;
    if (typeof worldCollisionShape.intersectsBounds === 'function') {
      return worldCollisionShape.intersectsBounds(this._boundsA, worldPosition, maxSlope);
    }
    return worldCollisionShape.intersectsBounds(this._boundsA, worldPosition);
  }
}