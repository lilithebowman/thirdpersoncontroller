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
import { Time } from './Time.js';

export class Rigidbody {
  /**
   * Creates a rigidbody with a mass, gravity, damping, and collision configuration.
   *
   * @param {Object} [options] - Physics configuration values.
   * @param {number} [options.mass=1] - Body mass used to scale acceleration and impulses.
   * @param {THREE.Vector3|number|number[]} [options.gravity=new THREE.Vector3(0, -24, 0)] - Gravity vector or scalar.
   * @param {number} [options.linearDamping=0] - Linear damping factor applied each step.
   * @param {boolean} [options.enablePhysicsCollision=false] - Whether world collisions are resolved.
   * @param {number} [options.maxWalkableSlope=0.2] - Highest slope the body can walk over.
   * @param {string} [options.physicsMaterial='default'] - Material name used for defaults.
   * @param {number} [options.restitution] - Override for collision restitution.
   * @param {number} [options.friction] - Override for surface friction.
   * @param {number} [options.bounciness=0] - Bounce strength used in collision response.
   * @param {boolean} [options.kinetic=false] - Whether the body actively pushes itself out of other colliders.
   */
  constructor({
    mass = 1,
    gravity = new THREE.Vector3(0, -24, 0),
    linearDamping = 0,
    enablePhysicsCollision = false,
    maxWalkableSlope = 0.2,
    physicsMaterial = 'default',
    restitution,
    friction,
    bounciness = 0,
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
    this.bounciness = Number.isFinite(bounciness) ? Math.max(0, bounciness) : 0;
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

  /**
   * Returns the restitution value associated with a material name.
   *
   * @param {string} [material='default'] - Material identifier.
   * @returns {number} The configured bounce value for the material.
   */
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

  /**
   * Returns the friction value associated with a material name.
   *
   * @param {string} [material='default'] - Material identifier.
   * @returns {number} The configured friction value for the material.
   */
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

  /**
   * Computes the combined friction value for a collision between this rigidbody and another collider.
   *
   * @param {Rigidbody|Object|null} [other=null] - Other body or collider being contacted.
   * @returns {number} Blended friction coefficient clamped to [0, 1].
   */
  getSurfaceFriction(other = null) {
    const localFriction = Number.isFinite(this.friction) ? this.friction : 0.45;
    const otherFriction = other && Number.isFinite(other.friction)
      ? other.friction
      : (other && typeof other.physicsMaterial === 'string'
        ? Rigidbody.getFrictionForMaterial(other.physicsMaterial)
        : 0.45);
    return Math.min(1, Math.max(0, (localFriction + otherFriction) * 0.5));
  }

  /**
   * Reduces tangential velocity along a collision normal to simulate surface friction.
   *
   * @param {THREE.Vector3} normal - Contact normal used to isolate tangential motion.
   * @param {number} [frictionCoefficient=0] - Coefficient of friction to apply.
   */
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

  /**
   * Applies a bounce impulse along the collision normal when a rigidbody strikes a surface.
   * The reaction is intentionally scaled by both the object's mass and the configured
   * bounciness so a heavier body has a stronger push back out of the surface than a
   * lighter one. This is the mechanism that sends the beachball upward after landings.
   *
   * @param {THREE.Vector3} normal - Surface normal for the contact.
   * @param {number} incomingNormalVelocity - Speed along the normal moving into the surface.
   * @returns {boolean} True when a bounce impulse was applied.
   */
  applyBouncinessReaction(normal, incomingNormalVelocity = 0) {
    if (!(normal instanceof THREE.Vector3) || !Number.isFinite(incomingNormalVelocity)) {
      return false;
    }
    if (!Number.isFinite(this.bounciness) || this.bounciness <= 0) {
      return false;
    }
    if (incomingNormalVelocity >= -1e-4) {
      return false;
    }

    const reactionDirection = normal.clone().normalize();
    if (reactionDirection.lengthSq() === 0) {
      return false;
    }

    const minimumReaction = this.bounciness * this.mass;
    const restitutionReaction = Math.abs(incomingNormalVelocity) * Math.max(0, this.restitution ?? 0);
    const reactionMagnitude = Math.max(minimumReaction, restitutionReaction);
    if (!Number.isFinite(reactionMagnitude) || reactionMagnitude <= 1e-4) {
      return false;
    }

    this.velocity.addScaledVector(reactionDirection, reactionMagnitude);
    return true;
  }

  /**
   * Checks whether this rigidbody is configured to use gravity.
   *
   * @returns {boolean} True when the gravity vector or scalar is non-zero.
   */
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

  /**
   * Enables or disables gravitational acceleration for this body.
   *
   * @param {boolean} [enabled=this.hasGravity()] - Whether gravity should be applied.
   * @returns {boolean} The resulting gravity-enabled state.
   */
  configureGravity(enabled = this.hasGravity()) {
    const canUseGravity = this.hasGravity();
    this.useGravity = enabled === true && canUseGravity;
    return this.useGravity;
  }

  /**
   * Adds a force vector to the body's pending force accumulator.
   *
   * @param {THREE.Vector3|number[]|{x:number,y:number,z:number}|null} force - Force to be summed into the accumulator.
   */
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

  /**
   * Applies an impulse to the body's velocity, accounting for the current timestep.
   *
   * @param {THREE.Vector3} impulse - Velocity change vector in force-time units.
   * @param {Time|null} [time=null] - Time step used to normalize the impulse.
   */
  addImpulse(impulse, time = null) {
    const elapsedTime = time instanceof Time ? time.deltaTime : 1;
    this.velocity.addScaledVector(impulse, (elapsedTime / this.mass));
  }

  /**
   * Builds the gravity vector used by this rigidbody from the configured gravity input.
   *
   * @returns {THREE.Vector3} The resolved gravity vector.
   */
  getGravityVector() {
    if (Number.isFinite(this.gravity)) {
      return new THREE.Vector3(0, Number(this.gravity), 0);
    }
    if (this.gravity instanceof THREE.Vector3) {
      return this.gravity.clone();
    }
    return new THREE.Vector3(0, -24, 0);
  }

  /**
   * Clears any accumulated external forces so the next integration step starts cleanly.
   */
  clearForces() {
    this.accumulatedForce.set(0, 0, 0);
  }

  /**
   * Stores a recorded collision point and optionally applies an impulse to that body.
   *
   * @param {THREE.Vector3} point - World-space contact point.
   * @param {THREE.Vector3|null} [impulse=null] - Optional impulse to apply at the contact point.
   */
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

  /**
   * Resolves a collision between this rigidbody and another body using a normal-based impulse response.
   *
   * @param {Rigidbody} other - Other body involved in the contact.
   * @param {THREE.Vector3} position - This body's world-space position.
   * @param {THREE.Vector3} otherPosition - Other body's world-space position.
   * @param {THREE.Vector3|null} [normal=null] - Explicit collision normal when known.
   * @returns {boolean} True when an impulse-based resolution was applied.
   */
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

  /**
   * Finds the highest valid ground surface near the given position from all colliders.
   *
   * @param {THREE.Vector3} position - Position to sample for ground support.
   * @param {Array<Object>} colliders - World colliders to query.
   * @returns {number|null} Highest contact height, or null if no relevant ground is found.
   */
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

  /**
   * Advances the rigidbody by one physics step.
   *
   * The method intentionally keeps force, acceleration, and collision response tied to the
   * passed frame duration so simulation results stay stable regardless of the current fps.
   * It first updates velocity from gravity and accumulated forces, then moves the body,
   * resolves overlap against world colliders, and re-clamps the body to the ground when
   * appropriate.
   *
   * @param {THREE.Vector3} position - Body position to update in place.
   * @param {number} delta - Time step for this update.
   * @param {Object} [context] - Optional ground and collider context.
   * @returns {boolean} True when the body is grounded after the step.
   */
  integrate(position, delta, { groundY = null, collider = null, colliders = [] } = {}) {
    if (!Number.isFinite(delta) || delta <= 0) {
      return groundY !== null ? position.y <= groundY + 1e-6 : false;
    }

    const physicsTime = new Time(delta);
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
      const preserveDownwardVelocityForBounce = Number.isFinite(this.bounciness) && this.bounciness > 0 && this.velocity.y < 0;
      if (this.velocity.y < 0 && !preserveDownwardVelocityForBounce) {
        this.velocity.y = 0;
      }
    }

    this._tmpAcceleration.copy(this.accumulatedForce).multiplyScalar(1 / this.mass);
    this.velocity.addScaledVector(this._tmpAcceleration, physicsTime.deltaTime);

    if (this.linearDamping > 0) {
      const damping = Math.max(0, 1 - this.linearDamping * physicsTime.deltaTime);
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

  /**
   * Determines whether the rigidbody is currently in contact with a world surface while moving downward or settled.
   *
   * @param {THREE.Vector3} position - Current body position.
   * @param {THREE.Vector3} previousPosition - Previous position used for motion comparison.
   * @param {Object} collider - Active collider for the rigidbody.
   * @param {Array<Object>} colliders - World colliders to test against.
   * @returns {boolean} True when the body should be treated as grounded.
   */
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

  /**
   * Separates a moving collider from overlapping world colliders.
   *
   * This method uses AABB overlap measurements to identify the smallest penetration axis,
   * which keeps kinetic bodies from remaining embedded in walls or floors. Once the axis is
   * chosen, the body is pushed out along that axis, its velocity along the contact normal is
   * removed, and friction / bounce are applied to the remaining motion.
   */
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

      if (this.kinetic) {
        const candidateAxes = [
          { axis: 'x', overlap: overlapX, center: this._centerA.x - this._centerB.x },
          { axis: 'y', overlap: overlapY, center: this._centerA.y - this._centerB.y },
          { axis: 'z', overlap: overlapZ, center: this._centerA.z - this._centerB.z },
        ].filter((entry) => Number.isFinite(entry.overlap) && entry.overlap > 0);

        if (candidateAxes.length > 0) {
          candidateAxes.sort((a, b) => a.overlap - b.overlap);
          const minimal = candidateAxes[0];
          const epsilon = 1e-4;
          const direction = minimal.center >= 0 ? 1 : -1;
          if (minimal.axis === 'x') {
            position.x += (minimal.overlap + epsilon) * direction;
            const collisionNormal = new THREE.Vector3(direction, 0, 0);
            const incomingNormalVelocity = this.velocity.dot(collisionNormal);
            this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
            this.velocity.x = 0;
            this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
          } else if (minimal.axis === 'y') {
            position.y += (minimal.overlap + epsilon) * direction;
            const collisionNormal = new THREE.Vector3(0, direction, 0);
            const incomingNormalVelocity = this.velocity.dot(collisionNormal);
            this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
            this.velocity.y = 0;
            this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
          } else {
            position.z += (minimal.overlap + epsilon) * direction;
            const collisionNormal = new THREE.Vector3(0, 0, direction);
            const incomingNormalVelocity = this.velocity.dot(collisionNormal);
            this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
            this.velocity.z = 0;
            this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
          }
        }
      } else if (overlapX <= overlapY && overlapX <= overlapZ) {
        const direction = this._centerA.x >= this._centerB.x ? 1 : -1;
        position.x += overlapX * direction;
        const collisionNormal = new THREE.Vector3(direction, 0, 0);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
        this.velocity.x = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
      } else if (overlapY <= overlapX && overlapY <= overlapZ) {
        const direction = this._centerA.y >= this._centerB.y ? 1 : -1;
        position.y += overlapY * direction;
        const collisionNormal = new THREE.Vector3(0, direction, 0);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
        this.velocity.y = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
      } else {
        const direction = this._centerA.z >= this._centerB.z ? 1 : -1;
        position.z += overlapZ * direction;
        const collisionNormal = new THREE.Vector3(0, 0, direction);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.applySurfaceFriction(collisionNormal, this.getSurfaceFriction(collisionShape));
        this.velocity.z = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
      }

      collider.getBounds(position, this._boundsA);
    }
  }

  /**
   * Resolves collisions against mesh-based world geometry by axis-testing and fallback correction.
   *
   * @param {THREE.Vector3} position - The candidate position after motion integration.
   * @param {THREE.Vector3} previousPosition - Position before the attempted move.
   * @param {Object} movingCollider - The collider being moved.
   * @param {Object} worldCollisionShape - Mesh world collider being collided with.
   * @param {THREE.Vector3} worldPosition - World-space position of the mesh collider.
   */
  resolveMeshCollision(position, previousPosition, movingCollider, worldCollisionShape, worldPosition) {
    const targetX = position.x;
    const targetY = position.y;
    const targetZ = position.z;

    this._candidatePosition.set(targetX, previousPosition.y, previousPosition.z);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.x = previousPosition.x;
      const collisionNormal = new THREE.Vector3(targetX > previousPosition.x ? -1 : 1, 0, 0);
      const incomingNormalVelocity = this.velocity.dot(collisionNormal);
      this.velocity.x = 0;
      this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
    } else {
      position.x = targetX;
    }

    this._candidatePosition.set(position.x, targetY, previousPosition.z);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.y = previousPosition.y;
      const collisionNormal = new THREE.Vector3(0, targetY > previousPosition.y ? -1 : 1, 0);
      const incomingNormalVelocity = this.velocity.dot(collisionNormal);
      this.velocity.y = 0;
      this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
    } else {
      position.y = targetY;
    }

    this._candidatePosition.set(position.x, position.y, targetZ);
    if (this.intersectsWorldShapeAt(this._candidatePosition, movingCollider, worldCollisionShape, worldPosition)) {
      position.z = previousPosition.z;
      const collisionNormal = new THREE.Vector3(0, 0, targetZ > previousPosition.z ? -1 : 1);
      const incomingNormalVelocity = this.velocity.dot(collisionNormal);
      this.velocity.z = 0;
      this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
    } else {
      position.z = targetZ;
    }

    if (this.intersectsWorldShapeAt(position, movingCollider, worldCollisionShape, worldPosition)) {
      const dx = Math.abs(targetX - previousPosition.x);
      const dy = Math.abs(targetY - previousPosition.y);
      const dz = Math.abs(targetZ - previousPosition.z);

      if (dy >= dx && dy >= dz) {
        position.y = previousPosition.y;
        const collisionNormal = new THREE.Vector3(0, targetY > previousPosition.y ? -1 : 1, 0);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.velocity.y = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
      } else if (dx >= dz) {
        position.x = previousPosition.x;
        const collisionNormal = new THREE.Vector3(targetX > previousPosition.x ? -1 : 1, 0, 0);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.velocity.x = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
        position.z = targetZ;
      } else {
        position.z = previousPosition.z;
        const collisionNormal = new THREE.Vector3(0, 0, targetZ > previousPosition.z ? -1 : 1);
        const incomingNormalVelocity = this.velocity.dot(collisionNormal);
        this.velocity.z = 0;
        this.applyBouncinessReaction(collisionNormal, incomingNormalVelocity);
        position.x = targetX;
      }
    }
  }

  /**
   * Checks whether a collider bounds intersects a world collision shape at a specific test position.
   *
   * @param {THREE.Vector3} testPosition - Candidate position to test.
   * @param {Object} movingCollider - Collider being evaluated.
   * @param {Object} worldCollisionShape - Static or mesh collider being intersected.
   * @param {THREE.Vector3} worldPosition - World-space position of the static collider.
   * @returns {boolean} True when the moving bounds overlap the world shape at that position.
   */
  intersectsWorldShapeAt(testPosition, movingCollider, worldCollisionShape, worldPosition) {
    movingCollider.getBounds(testPosition, this._boundsA);
    const maxSlope = worldCollisionShape.maxWalkableSlope ?? this.maxWalkableSlope;
    if (typeof worldCollisionShape.intersectsBounds === 'function') {
      return worldCollisionShape.intersectsBounds(this._boundsA, worldPosition, maxSlope);
    }
    return worldCollisionShape.intersectsBounds(this._boundsA, worldPosition);
  }
}