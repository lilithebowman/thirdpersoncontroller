import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';

import { Armature } from './Armature.js';

test('Armature matches case-insensitive human bone names including hand.r and Right Hand', () => {
  const root = new THREE.Group();

  const rightHand = new THREE.Bone();
  rightHand.name = 'Hand.r';
  root.add(rightHand);

  const leftHand = new THREE.Bone();
  leftHand.name = 'hand.l';
  root.add(leftHand);

  const head = new THREE.Bone();
  head.name = 'HEAD';
  root.add(head);

  const armature = new Armature(root);
  assert.strictEqual(armature.findBone({ role: 'hand', side: 'right' }), rightHand);
  assert.strictEqual(armature.findBone('Right Hand'), rightHand);
  assert.strictEqual(armature.findBone('hand.right'), rightHand);
  assert.strictEqual(armature.findBone('HEAD'), head);
});

test('Armature discovers a Mixamo-like skeleton from fuzzy bone names', () => {
  const root = new THREE.Group();

  const hips = new THREE.Bone(); hips.name = 'mixamorigHips'; root.add(hips);
  const spine = new THREE.Bone(); spine.name = 'mixamorigSpine'; hips.add(spine);
  const chest = new THREE.Bone(); chest.name = 'mixamorigSpine2'; spine.add(chest);
  const neck = new THREE.Bone(); neck.name = 'mixamorigNeck'; chest.add(neck);
  const head = new THREE.Bone(); head.name = 'mixamorigHead'; neck.add(head);

  const leftUpperArm = new THREE.Bone(); leftUpperArm.name = 'mixamorigLeftArm'; chest.add(leftUpperArm);
  const leftLowerArm = new THREE.Bone(); leftLowerArm.name = 'mixamorigLeftForearm'; leftUpperArm.add(leftLowerArm);
  const leftHand = new THREE.Bone(); leftHand.name = 'mixamorigLeftHand'; leftLowerArm.add(leftHand);
  const rightUpperArm = new THREE.Bone(); rightUpperArm.name = 'mixamorigRightArm'; chest.add(rightUpperArm);
  const rightLowerArm = new THREE.Bone(); rightLowerArm.name = 'mixamorigRightForearm'; rightUpperArm.add(rightLowerArm);
  const rightHand = new THREE.Bone(); rightHand.name = 'mixamorigRightHand'; rightLowerArm.add(rightHand);

  const leftUpperLeg = new THREE.Bone(); leftUpperLeg.name = 'mixamorigLeftUpLeg'; root.add(leftUpperLeg);
  const leftLowerLeg = new THREE.Bone(); leftLowerLeg.name = 'mixamorigLeftLeg'; leftUpperLeg.add(leftLowerLeg);
  const leftFoot = new THREE.Bone(); leftFoot.name = 'mixamorigLeftFoot'; leftLowerLeg.add(leftFoot);
  const rightUpperLeg = new THREE.Bone(); rightUpperLeg.name = 'mixamorigRightUpLeg'; root.add(rightUpperLeg);
  const rightLowerLeg = new THREE.Bone(); rightLowerLeg.name = 'mixamorigRightLeg'; rightUpperLeg.add(rightLowerLeg);
  const rightFoot = new THREE.Bone(); rightFoot.name = 'mixamorigRightFoot'; rightLowerLeg.add(rightFoot);

  const armature = new Armature(root);
  const skeleton = armature.discover();

  assert.strictEqual(skeleton.head, head);
  assert.strictEqual(skeleton.rightHand, rightHand);
  assert.strictEqual(skeleton.leftHand, leftHand);
  assert.ok(Armature.hasHumanoidRig(root));
});

test('Armature finds the generic side and role without exact casing', () => {
  assert.strictEqual(Armature.inferBoneSide('hand.r'), 'right');
  assert.strictEqual(Armature.inferBoneSide('Hand.l'), 'left');
  assert.strictEqual(Armature.inferBoneRole('righthand'), 'hand');
  assert.strictEqual(Armature.inferBoneRole('LeftForearm'), 'lowerarm');
});
