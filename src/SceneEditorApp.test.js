import test from 'node:test';
import assert from 'node:assert';

import { resolveModeSelection } from './SceneEditorApp.js';

test('resolveModeSelection opens the animation editor when scene mode is active', () => {
  assert.strictEqual(resolveModeSelection('scene', 'animation'), 'animation');
});

test('resolveModeSelection closes the animation editor when animation mode is active', () => {
  assert.strictEqual(resolveModeSelection('animation', 'animation'), 'scene');
});

test('resolveModeSelection keeps scene mode stable when the scene button is clicked', () => {
  assert.strictEqual(resolveModeSelection('scene', 'scene'), 'scene');
  assert.strictEqual(resolveModeSelection('animation', 'scene'), 'scene');
});
