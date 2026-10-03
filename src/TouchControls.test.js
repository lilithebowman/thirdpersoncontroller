/**
 * TouchControls.test.js
 *
 * Verifies the touch overlay exposes movement, look, and jump input state.
 */

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {
    addEventListener: () => {},
  };
}

if (typeof globalThis.document === 'undefined') {
  const makeClassList = () => ({
    toggle: () => {},
    add: () => {},
    remove: () => {},
  });

  const makeElement = (tagName = 'div') => ({
    tagName,
    style: {},
    dataset: {},
    listeners: {},
    className: '',
    type: '',
    textContent: '',
    appendChild: () => {},
    addEventListener: (type, callback) => {
      if (!this || !this.listeners) {
        return;
      }
      this.listeners[type] = callback;
    },
    setAttribute: () => {},
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 120,
      height: 120,
    }),
    setPointerCapture: () => {},
    classList: makeClassList(),
  });

  globalThis.document = {
    body: makeElement('body'),
    createElement: (tagName) => makeElement(tagName),
  };
}

import test from 'node:test';
import assert from 'node:assert';
import { TouchControls } from './TouchControls.js';

test('TouchControls tracks movement, jump, and look deltas', () => {
  const mount = {
    appendChild: () => {},
    children: [],
  };
  const controls = new TouchControls({ mountElement: mount });

  controls.setEnabled(true);
  controls.movePad.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 120 });
  controls.movePad.dispatchEvent = (event) => {
    if (event.type === 'pointerdown') {
      controls.updateMovementFromPointer(event);
    }
  };
  controls.lookPad.dispatchEvent = () => {};

  controls.updateMovementFromPointer({ clientX: 30, clientY: 30 });
  const move = controls.getMovementVector();
  assert.ok(Math.abs(move.x) > 0 || Math.abs(move.y) > 0);

  controls.jumpButton.dispatchEvent = (event) => {
    event.preventDefault();
    controls.jumpRequested = true;
  };
  controls.jumpButton.dispatchEvent({ preventDefault: () => {} });
  assert.strictEqual(controls.consumeJump(), true);
  assert.strictEqual(controls.consumeJump(), false);

  controls.lookDeltaX = 8;
  controls.lookDeltaY = -12;
  const look = controls.consumeLookDelta();
  assert.strictEqual(look.deltaX, 8);
  assert.strictEqual(look.deltaY, -12);

  controls.setEnabled(false);
  assert.strictEqual(controls.isEnabled(), false);
});
