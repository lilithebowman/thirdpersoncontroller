import * as THREE from 'three';

export class DebugDisplay {
  constructor({ parentElement, enabled = false } = {}) {
    this.parentElement = parentElement;
    this.enabled = Boolean(enabled);

    this.container = document.createElement('aside');
    this.container.className = 'debug-overlay';

    this.title = document.createElement('h2');
    this.title.textContent = 'Controller Debug';

    this.content = document.createElement('pre');
    this.content.className = 'debug-overlay-content';

    this.container.appendChild(this.title);
    this.container.appendChild(this.content);

    if (this.parentElement) {
      this.parentElement.appendChild(this.container);
    }

    this.setEnabled(this.enabled);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.container.style.display = this.enabled ? 'block' : 'none';
  }

  update(data) {
    if (!this.enabled) {
      return;
    }

    const lines = [
      `position: ${this.formatVector3(data.position)}`,
      `rotation (deg): ${this.formatEulerDegrees(data.rotationEulerRadians)}`,
      `quaternion: ${this.formatQuaternion(data.quaternion)}`,
      `look normal: ${this.formatVector3(data.lookNormal)}`,
      `camera forward: ${this.formatVector3(data.cameraForward)}`,
      `player yaw (deg): ${this.formatDegrees(data.playerYawRadians)}`,
      `target yaw (deg): ${this.formatDegrees(data.playerTargetYawRadians)}`,
      `camera yaw (deg): ${this.formatDegrees(data.cameraYawRadians)}`,
      `move input: ${data.hasMoveInput ? 'active' : 'idle'}`,
    ];

    this.content.textContent = lines.join('\n');
  }

  formatNumber(value) {
    if (!Number.isFinite(value)) {
      return 'NaN';
    }

    return value.toFixed(3);
  }

  formatDegrees(radians) {
    return this.formatNumber(THREE.MathUtils.radToDeg(radians));
  }

  formatVector3(vector) {
    if (!vector) {
      return '(NaN, NaN, NaN)';
    }

    return `(${this.formatNumber(vector.x)}, ${this.formatNumber(vector.y)}, ${this.formatNumber(vector.z)})`;
  }

  formatQuaternion(quaternion) {
    if (!quaternion) {
      return '(NaN, NaN, NaN, NaN)';
    }

    return `(${this.formatNumber(quaternion.x)}, ${this.formatNumber(quaternion.y)}, ${this.formatNumber(quaternion.z)}, ${this.formatNumber(quaternion.w)})`;
  }

  formatEulerDegrees(eulerRadians) {
    if (!eulerRadians) {
      return '(NaN, NaN, NaN)';
    }

    return `(${this.formatDegrees(eulerRadians.x)}, ${this.formatDegrees(eulerRadians.y)}, ${this.formatDegrees(eulerRadians.z)})`;
  }
}