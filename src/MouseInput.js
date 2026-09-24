/**
 * MouseInput.js
 *
 * Tracks mouse movement for camera look and click events for view-centered
 * raycasts.
 */

export class MouseInput {
  constructor({ domElement = window } = {}) {
    this.domElement = domElement;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.clickRequested = false;

    this.onMouseMove = this.onMouseMove.bind(this);
    this.onMouseDown = this.onMouseDown.bind(this);
    this.onContextMenu = this.onContextMenu.bind(this);
  }

  attach() {
    const target = this.domElement ?? window;
    target.addEventListener('mousemove', this.onMouseMove);
    target.addEventListener('mousedown', this.onMouseDown);
    target.addEventListener('contextmenu', this.onContextMenu);
  }

  detach() {
    const target = this.domElement ?? window;
    target.removeEventListener('mousemove', this.onMouseMove);
    target.removeEventListener('mousedown', this.onMouseDown);
    target.removeEventListener('contextmenu', this.onContextMenu);
    this.clear();
  }

  onMouseMove(event) {
    this.lookDeltaX += event.movementX ?? 0;
    this.lookDeltaY += event.movementY ?? 0;
  }

  onMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    this.clickRequested = true;
  }

  onContextMenu(event) {
    event.preventDefault();
  }

  consumeLookDelta() {
    const deltaX = this.lookDeltaX;
    const deltaY = this.lookDeltaY;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return { deltaX, deltaY };
  }

  consumeClick() {
    if (!this.clickRequested) {
      return false;
    }

    this.clickRequested = false;
    return true;
  }

  clear() {
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    this.clickRequested = false;
  }
}
