import * as THREE from 'three';

export class DebugDisplay {
  constructor({ parentElement, enabled = false } = {}) {
    this.parentElement = parentElement;
    this.enabled = Boolean(enabled);
    this.maxMessages = 120;
    this.messages = [];

    this.container = document.createElement('aside');
    this.container.className = 'debug-overlay';

    this.title = document.createElement('h2');
    this.title.textContent = 'Controller Debug';

    this.content = document.createElement('pre');
    this.content.className = 'debug-overlay-content';

    this.container.appendChild(this.title);
    this.container.appendChild(this.content);

    this.logContainer = document.createElement('section');
    this.logContainer.className = 'debug-console';

    this.logTitle = document.createElement('h3');
    this.logTitle.textContent = 'Debug Console';

    this.logContent = document.createElement('div');
    this.logContent.className = 'debug-console-content';

    this.logContainer.appendChild(this.logTitle);
    this.logContainer.appendChild(this.logContent);

    if (this.parentElement) {
      this.parentElement.appendChild(this.container);
      this.parentElement.appendChild(this.logContainer);
    }

    this.setEnabled(this.enabled);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    this.container.style.display = this.enabled ? 'block' : 'none';
    this.logContainer.style.display = this.enabled ? 'block' : 'none';
  }

  Log(message) {
    this.pushMessage('info', message);
  }

  LogWarning(message) {
    this.pushMessage('warning', message);
  }

  LogError(message) {
    this.pushMessage('error', message);
  }

  pushMessage(level, message) {
    const timestamp = new Date().toLocaleTimeString();
    this.messages.push({ level, message: String(message), timestamp });

    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    this.renderMessages();
  }

  renderMessages() {
    if (!this.enabled) {
      return;
    }

    this.logContent.replaceChildren();

    for (const entry of this.messages) {
      const line = document.createElement('p');
      line.className = `debug-console-line debug-console-line-${entry.level}`;
      line.textContent = `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}`;
      this.logContent.appendChild(line);
    }

    this.logContent.scrollTop = this.logContent.scrollHeight;
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