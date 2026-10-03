/**
 * TouchControls.js
 *
 * Renders a compact on-screen control surface for touch devices. The left pad
 * drives movement input while the right pad adjusts camera yaw/pitch, and the
 * jump button triggers a single jump impulse.
 */

export class TouchControls {
  constructor({ mountElement = document.body } = {}) {
    this.mountElement = mountElement ?? document.body ?? null;
    this.enabled = false;
    this.moveAxis = { x: 0, y: 0 };
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpRequested = false;
    this.leftPointerId = null;
    this.rightPointerId = null;
    this.rightLastX = 0;
    this.rightLastY = 0;

    this.overlay = null;
    this.movePad = null;
    this.moveThumb = null;
    this.lookPad = null;
    this.lookThumb = null;
    this.jumpButton = null;

    if (!this.mountElement || typeof document === 'undefined') {
      return;
    }

    this.overlay = document.createElement('div');
    this.overlay.className = 'touch-controls';

    this.movePad = document.createElement('div');
    this.movePad.className = 'touch-move-pad touch-zone';
    this.moveThumb = document.createElement('div');
    this.moveThumb.className = 'touch-pad-thumb';
    this.movePad.appendChild(this.moveThumb);

    this.lookPad = document.createElement('div');
    this.lookPad.className = 'touch-look-pad touch-zone';
    this.lookThumb = document.createElement('div');
    this.lookThumb.className = 'touch-pad-thumb touch-pad-thumb-small';
    this.lookPad.appendChild(this.lookThumb);

    this.jumpButton = document.createElement('button');
    this.jumpButton.type = 'button';
    this.jumpButton.className = 'touch-jump-button';
    this.jumpButton.textContent = 'Jump';
    this.jumpButton.setAttribute('aria-label', 'Jump');

    this.overlay.appendChild(this.movePad);
    this.overlay.appendChild(this.lookPad);
    this.overlay.appendChild(this.jumpButton);
    this.mountElement.appendChild(this.overlay);

    this.bindEvents();
    this.setEnabled(false);
  }

  bindEvents() {
    if (!this.movePad || !this.lookPad || !this.jumpButton) {
      return;
    }

    this.movePad.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      this.leftPointerId = event.pointerId;
      this.movePad.setPointerCapture?.(event.pointerId);
      this.updateMovementFromPointer(event);
    });

    this.lookPad.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }
      this.rightPointerId = event.pointerId;
      this.rightLastX = event.clientX;
      this.rightLastY = event.clientY;
      this.lookPad.setPointerCapture?.(event.pointerId);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', (event) => {
        if (this.leftPointerId !== null && event.pointerId === this.leftPointerId) {
          this.updateMovementFromPointer(event);
        }
        if (this.rightPointerId !== null && event.pointerId === this.rightPointerId) {
          const dx = event.clientX - this.rightLastX;
          const dy = event.clientY - this.rightLastY;
          this.rightLastX = event.clientX;
          this.rightLastY = event.clientY;
          this.lookDeltaX += dx * 0.35;
          this.lookDeltaY -= dy * 0.35;
          this.updateLookThumb(dx, dy);
        }
      });

      const clearPointer = (event) => {
        if (this.leftPointerId !== null && event.pointerId === this.leftPointerId) {
          this.leftPointerId = null;
          this.moveAxis.x = 0;
          this.moveAxis.y = 0;
          this.updateMovementThumb();
        }
        if (this.rightPointerId !== null && event.pointerId === this.rightPointerId) {
          this.rightPointerId = null;
          if (this.lookThumb?.style) {
            if (typeof this.lookThumb.style.setProperty === 'function') {
              this.lookThumb.style.setProperty('transform', 'translate(-50%, -50%)');
            } else {
              this.lookThumb.style.transform = 'translate(-50%, -50%)';
            }
          }
          this.lookThumb.dataset.offsetX = '0';
          this.lookThumb.dataset.offsetY = '0';
        }
      };

      window.addEventListener('pointerup', clearPointer);
      window.addEventListener('pointercancel', clearPointer);
    }

    this.jumpButton.addEventListener('click', (event) => {
      event.preventDefault();
      this.jumpRequested = true;
    });
  }

  isEnabled() {
    return this.enabled;
  }

  setEnabled(nextEnabled) {
    this.enabled = Boolean(nextEnabled);
    if (!this.overlay) {
      return;
    }
    this.overlay.classList.toggle('is-visible', this.enabled);
    if (!this.enabled) {
      this.clear();
    }
  }

  clear() {
    this.moveAxis.x = 0;
    this.moveAxis.y = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.jumpRequested = false;
    this.leftPointerId = null;
    this.rightPointerId = null;
    this.rightLastX = 0;
    this.rightLastY = 0;
    this.updateMovementThumb();
    if (this.lookThumb?.style) {
      if (typeof this.lookThumb.style.setProperty === 'function') {
        this.lookThumb.style.setProperty('transform', 'translate(-50%, -50%)');
      } else {
        this.lookThumb.style.transform = 'translate(-50%, -50%)';
      }
    }
    this.lookThumb && (this.lookThumb.dataset.offsetX = '0');
    this.lookThumb && (this.lookThumb.dataset.offsetY = '0');
  }

  updateMovementFromPointer(event) {
    if (!this.movePad) {
      return;
    }

    const rect = this.movePad.getBoundingClientRect();
    const maxDistance = rect.width * 0.34;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const distance = Math.hypot(dx, dy);
    const radius = maxDistance > 0 ? maxDistance : 1;
    const limitedDistance = Math.min(distance, radius);
    const normalized = distance > 0 ? limitedDistance / distance : 1;
    const clampedX = dx * normalized;
    const clampedY = dy * normalized;

    this.moveAxis.x = Number.isFinite(clampedX) ? THREE_MATH.clamp(clampedX / radius, -1, 1) : 0;
    this.moveAxis.y = Number.isFinite(clampedY) ? THREE_MATH.clamp(-clampedY / radius, -1, 1) : 0;
    this.updateMovementThumb();
  }

  updateMovementThumb() {
    if (!this.moveThumb || !this.movePad) {
      return;
    }
    const rect = this.movePad.getBoundingClientRect();
    const radius = rect.width * 0.34;
    const offsetX = this.moveAxis.x * radius;
    const offsetY = this.moveAxis.y * radius;
    this.moveThumb.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
  }

  updateLookThumb(deltaX, deltaY) {
    if (!this.lookThumb) {
      return;
    }
    const currentX = Number.parseFloat(this.lookThumb.dataset.offsetX ?? '0');
    const currentY = Number.parseFloat(this.lookThumb.dataset.offsetY ?? '0');
    const nextX = Math.max(-34, Math.min(34, currentX + deltaX * 0.25));
    const nextY = Math.max(-34, Math.min(34, currentY + deltaY * 0.25));
    this.lookThumb.dataset.offsetX = String(nextX);
    this.lookThumb.dataset.offsetY = String(nextY);
    this.lookThumb.style.transform = `translate(calc(-50% + ${nextX}px), calc(-50% + ${nextY}px))`;
  }

  getMovementVector() {
    return { x: this.moveAxis.x, y: this.moveAxis.y };
  }

  consumeJump() {
    const requested = this.jumpRequested;
    this.jumpRequested = false;
    return requested;
  }

  consumeLookDelta() {
    const deltaX = this.lookDeltaX;
    const deltaY = this.lookDeltaY;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return { deltaX, deltaY };
  }
}

const THREE_MATH = {
  clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  },
};
