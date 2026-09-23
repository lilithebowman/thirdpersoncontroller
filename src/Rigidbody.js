import * as THREE from 'three';

export class Rigidbody {
  constructor({ mass = 1, gravity = new THREE.Vector3(0, -24, 0), linearDamping = 0 } = {}) {
    this.mass = Math.max(0.0001, mass);
    this.gravity = gravity.clone();
    this.linearDamping = Math.max(0, linearDamping);

    this.velocity = new THREE.Vector3();
    this.accumulatedForce = new THREE.Vector3();
    this.useGravity = true;

    this._tmpForce = new THREE.Vector3();
    this._tmpAcceleration = new THREE.Vector3();
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

  integrate(position, delta, { groundY = 0 } = {}) {
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
}