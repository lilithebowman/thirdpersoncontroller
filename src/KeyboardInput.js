/**
 * KeyboardInput.js
 * 
 * Provides a utility for handling keyboard input, tracking key states and pressed events.
 */

export class KeyboardInput {
  constructor() {
    this.keys = {};
    this.pressed = {};

    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onWindowBlur = this.onWindowBlur.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.clear();
  }

  onKeyDown(event) {
    if (event.repeat) {
      return;
    }

    this.keys[event.code] = true;
    this.pressed[event.code] = true;
  }

  onKeyUp(event) {
    this.keys[event.code] = false;
  }

  onWindowBlur() {
    this.clear();
  }

  onVisibilityChange() {
    if (document.hidden) {
      this.clear();
    }
  }

  isDown(code) {
    return this.keys[code] === true;
  }

  consumePress(code) {
    if (this.pressed[code] !== true) {
      return false;
    }

    this.pressed[code] = false;
    return true;
  }

  clear() {
    this.keys = {};
    this.pressed = {};
  }
}