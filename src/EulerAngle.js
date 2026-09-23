import * as THREE from 'three';
import { QuaternionAngle } from './QuaternionAngle.js';

export class EulerAngle {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new EulerAngle(this.x, this.y, this.z);
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  normalizeYaw() {
    this.y = THREE.MathUtils.euclideanModulo(this.y + Math.PI * 2, Math.PI * 2) - Math.PI;
    return this;
  }

  shortestDelta(targetYaw) {
    const difference = targetYaw - this.y;
    return ((difference + Math.PI) % (Math.PI * 2)) - Math.PI;
  }

  rotateBy(deltaYaw) {
    this.y += deltaYaw;
    this.normalizeYaw();
    return this;
  }

  toQuaternion() {
    return QuaternionAngle.fromEuler(this);
  }

  static fromQuaternion(quaternion) {
    return quaternion.toEuler();
  }

  toTHREE() {
    return new THREE.Euler(this.x, this.y, this.z, 'XYZ');
  }

  toQuaternion() {
    return QuaternionAngle.fromEuler(this);
  }

  static fromQuaternion(quaternion) {
    return quaternion.toEuler();
  }
}
