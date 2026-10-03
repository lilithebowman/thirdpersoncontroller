import test from 'node:test';
import assert from 'node:assert';
import { PlayerAnimationController } from './PlayerAnimationController.js';

function createAction(weight = 0) {
  return {
    weight,
    time: 0,
    effectiveTimeScale: 1,
    enabled: true,
    play() {},
    getEffectiveWeight() { return this.weight; },
    setEffectiveWeight(value) { this.weight = value; },
    setEffectiveTimeScale(value) { this.effectiveTimeScale = value; },
  };
}

test('PlayerAnimationController blends walk/run/fall weights from movement state', () => {
  const animator = {
    mixer: { update() {}, setTime() {} },
    walkAction: createAction(0),
    idleAction: createAction(1),
    jumpAction: createAction(0),
    runAction: createAction(0),
    fallAction: createAction(0),
    landAction: createAction(0),
  };

  const controller = new PlayerAnimationController({ animator });
  controller.update(0.016, {
    isGrounded: true,
    hasMoveInput: true,
    isSprinting: true,
    walkSpeed: 6,
    sprintSpeed: 12,
    verticalVelocity: 0,
    isFalling: false,
  });

  assert.ok(animator.runAction.getEffectiveWeight() > 0 || animator.walkAction.getEffectiveWeight() > 0);
  assert.ok(animator.idleAction.getEffectiveWeight() <= 1);
});

test('PlayerAnimationController reset restores idle weight and clears motion state', () => {
  const animator = {
    mixer: { update() {}, setTime() {} },
    walkAction: createAction(1),
    idleAction: createAction(0),
    jumpAction: createAction(1),
    runAction: createAction(1),
    fallAction: createAction(1),
    landAction: createAction(1),
  };

  const controller = new PlayerAnimationController({ animator });
  controller.reset();

  assert.strictEqual(animator.walkAction.getEffectiveWeight(), 0);
  assert.strictEqual(animator.idleAction.getEffectiveWeight(), 1);
  assert.strictEqual(animator.jumpAction.getEffectiveWeight(), 0);
  assert.strictEqual(animator.runAction.getEffectiveWeight(), 0);
});
