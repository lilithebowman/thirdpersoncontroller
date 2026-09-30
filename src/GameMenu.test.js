/**
 * GameMenu.test.js
 *
 * Unit tests for GameMenu toggle and open state.
 */

import test from 'node:test';
import assert from 'node:assert';
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      style: {},
      classList: { add: () => {} },
      appendChild: () => {},
      addEventListener: () => {},
    }),
  };
}

import { GameMenu } from './GameMenu.js';

test('GameMenu toggles open state correctly', () => {
  const mountElement = document.createElement('div');
  const menu = new GameMenu({ mountElement, onRespawn: () => {}, onLog: () => {} });

  assert.strictEqual(menu.isOpen, false);
  menu.toggle();
  assert.strictEqual(menu.isOpen, true);
  menu.setOpen(false);
  assert.strictEqual(menu.isOpen, false);
});
