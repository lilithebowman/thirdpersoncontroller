/**
 * Input.test.js
 *
 * Unit tests for KeyboardInput and MouseInput state tracking.
 */

if (typeof globalThis.window === 'undefined') {
  globalThis.window = {};
}

import test from 'node:test';
import assert from 'node:assert';
import { KeyboardInput } from './KeyboardInput.js';
import { MouseInput } from './MouseInput.js';

test('KeyboardInput tracks key down and press consumption', () => {
  const kb = new KeyboardInput();
  kb.onKeyDown({ code: 'KeyW', repeat: false });

  assert.strictEqual(kb.isDown('KeyW'), true);
  assert.strictEqual(kb.consumePress('KeyW'), true);
  assert.strictEqual(kb.consumePress('KeyW'), false);

  kb.onKeyUp({ code: 'KeyW' });
  assert.strictEqual(kb.isDown('KeyW'), false);
});

test('MouseInput accumulates look delta and clicks', () => {
  const mouse = new MouseInput();
  mouse.onMouseMove({ movementX: 10, movementY: -5 });
  mouse.onMouseDown({ button: 0 });

  const delta = mouse.consumeLookDelta();
  assert.strictEqual(delta.deltaX, 10);
  assert.strictEqual(delta.deltaY, 5); // inverted Y logic in MouseInput

  assert.strictEqual(mouse.consumeClick(), true);
  assert.strictEqual(mouse.consumeClick(), false);
});
