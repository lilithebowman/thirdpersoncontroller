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

test('Animator maps animation tracks by fuzzy humanoid roles even when bone names differ', () => {
  const animator = new Animator({ resolveScenePath: (value) => value });
  const root = new THREE.Group();

  const hips = new THREE.Bone();
  hips.name = 'RootBone';
  root.add(hips);

  const torso = new THREE.Bone();
  torso.name = 'Torso';
  hips.add(torso);

  const leftForearm = new THREE.Bone();
  leftForearm.name = 'LeftForearm';
  torso.add(leftForearm);

  const face = new THREE.Bone();
  face.name = 'Face';
  torso.add(face);

  const walkClip = new THREE.AnimationClip('walk', 1, [
    new THREE.NumberKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0, 0, 0, 0.1, 0]),
    new THREE.NumberKeyframeTrack('mixamorigLeftForearm.rotation', [0, 1], [0, 0, 0, 1, 0, 0, 1]),
    new THREE.NumberKeyframeTrack('mixamorigFace.scale', [0, 1], [1, 1, 1, 1.1, 1.1, 1.1]),
  ]);

  const rigNodeNames = animator.collectRigNodeNames(root);
  const rigNodeNameMap = animator.collectRigNodeNameMap(root);
  const prepared = animator.prepareClipForRig(walkClip, rigNodeNames, rigNodeNameMap, 'fuzzy walk', {
    preferBoneTracks: true,
    rigBoneNames: animator.collectRigBoneNames(root),
    stripRootPosition: true,
    root,
  });

  assert.ok(prepared);
  const remappedNames = prepared.tracks.map((track) => track.name.split('.')[0]);
  assert.ok(remappedNames.includes('RootBone'));
  assert.ok(remappedNames.includes('LeftForearm'));
  assert.ok(remappedNames.includes('Face'));
});

test('Animator detects Unity-style humanoid side names without misclassifying generic arm names', () => {
  const animator = new Animator({ resolveScenePath: (value) => value });

  assert.strictEqual(animator.inferBoneSide('Arm.L'), 'left');
  assert.strictEqual(animator.inferBoneSide('Forearm.R'), 'right');
  assert.strictEqual(animator.inferBoneSide('Arm'), 'center');
  assert.strictEqual(animator.inferBoneSide('Shoulder.L'), 'left');
  assert.strictEqual(animator.inferBoneSide('Shoulder.R'), 'right');
  assert.strictEqual(animator.inferBoneRole('Shoulder.L'), 'upperarm');
  assert.strictEqual(animator.inferBoneRole('Forearm.R'), 'lowerarm');
  assert.strictEqual(animator.inferBoneRole('Hand.L'), 'hand');
  assert.strictEqual(animator.inferBoneRole('Hips'), 'hips');
});
