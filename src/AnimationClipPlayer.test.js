import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';

import { AnimationClipPlayer } from './AnimationClipPlayer.js';

test('AnimationClipPlayer evaluates transform keyframes and honors playOnAwake', () => {
  const target = new THREE.Object3D();
  target.position.set(0, 5, 0);

  const clip = new AnimationClipPlayer({
    target,
    playOnAwake: false,
  });

  clip.loadData({
    name: 'primitive-cube-y-bob-animation',
    duration: 5.5,
    loop: true,
    playOnAwake: true,
    tracks: [{
      gameObjectId: 'primitive-cube',
      propertyPath: 'transform.position.y',
      keyframes: [
        { time: 0, value: 5 },
        { time: 2.5, value: 6 },
        { time: 5.5, value: 5 },
      ],
    }],
  });

  clip.time = 2.5;
  clip.applyCurrentState();
  assert.ok(Math.abs(target.position.y - 6) < 0.0001);
  assert.strictEqual(clip.playOnAwake, true);
  assert.strictEqual(clip.loop, true);
});

test('AnimationClipPlayer loops when time exceeds clip duration', () => {
  const target = new THREE.Object3D();
  target.position.set(0, 0, 0);

  const clip = new AnimationClipPlayer({
    target,
    loop: true,
    playOnAwake: true,
  });

  clip.loadData({
    duration: 2,
    loop: true,
    tracks: [{
      propertyPath: 'transform.position.y',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 5 },
        { time: 2, value: 0 },
      ],
    }],
  });

  clip.time = 1.9;
  clip.play();
  clip.update(0.2);

  assert.ok(clip.time > 0 && clip.time < 2);
  assert.ok(Math.abs(target.position.y - 0.5) < 0.001);
});
