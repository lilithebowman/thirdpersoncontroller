/**
 * Loader.test.js
 *
 * Unit tests for Loader show, hide, message, type, and progress.
 */

import test from 'node:test';
import assert from 'node:assert';

if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({
      style: {},
      classList: { add: () => {} },
      appendChild: () => {},
      querySelector: () => ({ style: {} }),
      replaceChildren: () => {},
    }),
    body: {
      appendChild: () => {},
    },
  };
}

import { Loader } from './Loader.js';

test('Loader initializes, shows, and hides correctly', () => {
  const mountElement = document.createElement('div');
  const loader = new Loader({ mountElement, message: 'Loading...' });

  assert.strictEqual(loader.isOpen, false);
  loader.show('Initializing assets...');
  assert.strictEqual(loader.isOpen, true);
  assert.strictEqual(loader.message, 'Initializing assets...');

  loader.hide();
  assert.strictEqual(loader.isOpen, false);
});

test('Loader updates type and progress', () => {
  const mountElement = document.createElement('div');
  const loader = new Loader({ mountElement, type: 'pulse' });

  assert.strictEqual(loader.type, 'pulse');
  loader.setType('bar');
  assert.strictEqual(loader.type, 'bar');

  loader.setProgress(50);
  assert.strictEqual(loader.progress, 50);
});
