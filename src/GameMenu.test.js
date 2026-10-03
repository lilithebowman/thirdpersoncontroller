/**
 * GameMenu.test.js
 *
 * Unit tests for GameMenu toggle and open state.
 */

import test from 'node:test';
import assert from 'node:assert';
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => {
      const element = {
        style: {},
        classList: { add: () => {} },
        children: [],
        listeners: {},
        value: '',
        textContent: '',
        appendChild: (child) => {
          element.children.push(child);
        },
        addEventListener: (type, callback) => {
          element.listeners[type] = callback;
        },
        dispatchEvent: (event) => {
          if (element.listeners[event.type]) {
            element.listeners[event.type](event);
          }
        },
        querySelector(selector) {
          if (selector === '#mic-threshold') {
            return { value: '0.05', textContent: '0.05', addEventListener: () => {} };
          }
          if (selector === '#threshold-display') {
            return { textContent: '0.05' };
          }
          if (selector === '#eye-offset-x') {
            return { value: '0', addEventListener: () => {} };
          }
          if (selector === '#eye-offset-y') {
            return { value: '1.6', addEventListener: () => {} };
          }
          if (selector === '#eye-offset-z') {
            return { value: '0', addEventListener: () => {} };
          }
          if (selector === '#player-name') {
            return { value: '', addEventListener: () => {} };
          }
          if (selector === '#player-token') {
            return { value: '', addEventListener: () => {} };
          }
          return null;
        },
        closest: () => null,
      };
      return element;
    },
    fullscreenElement: null,
    documentElement: { requestFullscreen: () => {}, },
    exitFullscreen: () => {},
  };
}

if (typeof globalThis.localStorage === 'undefined') {
  const storage = {};
  globalThis.localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
    setItem: (key, value) => {
      storage[key] = String(value);
    },
    removeItem: (key) => {
      delete storage[key];
    },
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

test('GameMenu exposes eye offset controls and passes offsets with model selection', async () => {
  const mountElement = document.createElement('div');
  let capturedOffset = null;
  let capturedFile = null;
  const menu = new GameMenu({
    mountElement,
    onRespawn: () => {},
    onLog: () => {},
    onSelectPlayerModel: async (file, eyeOffset) => {
      capturedFile = file;
      capturedOffset = eyeOffset;
    },
  });

  menu.setEyeOffset({ x: 0.25, y: 1.8, z: -0.15 });
  assert.deepStrictEqual(menu.getEyeOffset(), { x: 0.25, y: 1.8, z: -0.15 });

  const rawOffset = menu.getEyeOffset();
  menu.fileInput.files = [{ name: 'avatar.fbx' }];
  menu.fileInput.dispatchEvent?.({ type: 'change' });
  await Promise.resolve();

  assert.strictEqual(capturedFile.name, 'avatar.fbx');
  assert.deepStrictEqual(capturedOffset, rawOffset);
});

test('GameMenu exposes a visible player token and persists manual entries', () => {
  const mountElement = document.createElement('div');
  let lastToken = null;
  const menu = new GameMenu({
    mountElement,
    onRespawn: () => {},
    onLog: () => {},
    onPlayerTokenChange: (token) => {
      lastToken = token;
    },
  });

  menu.setPlayerToken('player-token-123');
  assert.strictEqual(menu.getPlayerToken(), 'player-token-123');
  assert.strictEqual(lastToken, 'player-token-123');
  assert.strictEqual(localStorage.getItem('thirdpersoncontroller-player-guid'), 'player-token-123');
});
