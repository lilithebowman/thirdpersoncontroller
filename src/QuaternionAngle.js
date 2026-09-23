import * as THREE from 'three';
import { EulerAngle } from './EulerAngle.js';

export class QuaternionAngle {
  constructor(x = 0, y = 0, z = 0, w = 1) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
  }

  clone() {
    return new QuaternionAngle(this.x, this.y, this.z, this.w);
  }

  set(x, y, z, w) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.w = w;
    return this;
  }

  fromEuler(euler) {
    const quaternion = new THREE.Quaternion().setFromEuler(euler.toTHREE());
    this.x = quaternion.x;
    this.y = quaternion.y;
    this.z = quaternion.z;
    this.w = quaternion.w;
    return this;
  }

  toEuler() {
    const quaternion = this.toTHREE();
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    return new EulerAngle(euler.x, euler.y, euler.z);
  }

  static fromEuler(euler) {
    return new QuaternionAngle().fromEuler(euler);
  }

  toEuler() {
    const quaternion = this.toTHREE();
    const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
    return new EulerAngle(euler.x, euler.y, euler.z);
  }

  static fromQuaternion(quaternion) {
    return new QuaternionAngle(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }

  toTHREE() {
    return new THREE.Quaternion(this.x, this.y, this.z, this.w);
  }

  slerp(target, alpha) {
    const result = this.toTHREE().slerp(target.toTHREE(), alpha);
    this.x = result.x;
    this.y = result.y;
    this.z = result.z;
    this.w = result.w;
    return this;
  }
}
