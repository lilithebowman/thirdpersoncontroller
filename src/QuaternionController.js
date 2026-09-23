export class QuaternionController {
  constructor({ yaw = 0, lerpFactor = 0.14 } = {}) {
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.lerpFactor = lerpFactor;
    this.quaternion = new THREE.Quaternion();
    this.up = new THREE.Vector3(0, 1, 0);
    this.setYaw(yaw);
  }

  setYaw(yaw) {
    this.targetYaw = yaw;
    this.yaw = yaw;
    this.quaternion.setFromAxisAngle(this.up, yaw);
  }

  rotateBy(deltaYaw) {
    this.targetYaw += deltaYaw;
  }

  update(delta) {
    const turnDelta = this.targetYaw - this.yaw;
    const shortest = ((turnDelta + Math.PI) % (Math.PI * 2)) - Math.PI;
    this.yaw += shortest * Math.min(1, delta * 12);
    this.quaternion.setFromAxisAngle(this.up, this.yaw);
  }

  applyTo(object) {
    object.quaternion.slerp(this.quaternion, 1);
  }
}
