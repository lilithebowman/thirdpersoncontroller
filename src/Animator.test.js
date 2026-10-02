import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';

import { Animator } from './Animator.js';

test('Animator resolves animation clips attached to a loaded GLTF scene root', () => {
  const animator = new Animator({ resolveScenePath: (value) => value });
  const clip = new THREE.AnimationClip('walk', 1, []);
  const scene = new THREE.Group();
  scene.animations = [clip];

  assert.deepStrictEqual(animator.resolveAnimationClips(scene), [clip]);
});

test('Animator reuses stored scene clips when a custom rig has no embedded animation', () => {
  const animator = new Animator({ resolveScenePath: (value) => value });
  const root = new THREE.Group();

  const hips = new THREE.Bone();
  hips.name = 'Hips';
  root.add(hips);

  const spine = new THREE.Bone();
  spine.name = 'Spine';
  hips.add(spine);

  const leftArm = new THREE.Bone();
  leftArm.name = 'LeftArm';
  spine.add(leftArm);

  const head = new THREE.Bone();
  head.name = 'Head';
  spine.add(head);

  const walkClip = new THREE.AnimationClip('walk', 1, [
    new THREE.NumberKeyframeTrack('Hips.position', [0, 1], [0, 0, 0, 0, 0.1, 0]),
  ]);

  animator.sceneAnimationClips = { walkClip, idleClip: null, jumpClip: null };

  const prepared = animator.prepareSceneAnimationClips(root, animator.sceneAnimationClips);
  assert.ok(prepared.walkClip);
  assert.strictEqual(prepared.walkClip.name, 'walk');
});
