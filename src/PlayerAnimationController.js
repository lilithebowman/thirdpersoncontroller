import * as THREE from 'three';

export class PlayerAnimationController {
  constructor({ animator } = {}) {
    if (!animator) {
      throw new Error('PlayerAnimationController requires an Animator instance.');
    }

    this.animator = animator;
  }

  reset() {
    const { mixer, walkAction, idleAction, jumpAction, runAction, fallAction, landAction } = this.animator;

    if (mixer) {
      mixer.setTime(0);
    }

    if (walkAction) {
      walkAction.setEffectiveWeight(0);
      walkAction.time = 0;
    }

    if (idleAction) {
      idleAction.setEffectiveWeight(1);
      idleAction.time = 0;
    }

    if (jumpAction) {
      jumpAction.setEffectiveWeight(0);
      jumpAction.time = 0;
    }

    if (runAction) {
      runAction.setEffectiveWeight(0);
      runAction.time = 0;
    }

    if (fallAction) {
      fallAction.setEffectiveWeight(0);
      fallAction.time = 0;
    }

    if (landAction) {
      landAction.setEffectiveWeight(0);
      landAction.time = 0;
    }
  }

  update(delta, {
    isGrounded,
    hasMoveInput,
    isSprinting,
    walkSpeed,
    sprintSpeed,
    verticalVelocity = 0,
    isFalling = false,
  }) {
    const { mixer, jumpAction, fallAction, runAction, walkAction, idleAction, landAction } = this.animator;

    if (!mixer) {
      return;
    }

    const jumpTarget = !isGrounded && verticalVelocity > 0.15 ? 1 : 0;
    const fallTarget = !isGrounded && verticalVelocity < -0.2 ? 1 : 0;
    const runTarget = isGrounded && hasMoveInput && isSprinting ? 1 : 0;
    const walkTarget = isGrounded && hasMoveInput && !isSprinting ? 1 : 0;

    if (jumpAction) {
      const current = jumpAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, jumpTarget, Math.min(1, delta * 10));
      jumpAction.setEffectiveWeight(next);
    }

    if (fallAction) {
      const current = fallAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, fallTarget, Math.min(1, delta * 10));
      fallAction.setEffectiveWeight(next);
    }

    if (runAction) {
      const current = runAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, runTarget, Math.min(1, delta * 10));
      runAction.setEffectiveWeight(next);
      if (isSprinting) {
        runAction.setEffectiveTimeScale(Math.max(0.75, sprintSpeed / Math.max(walkSpeed, 0.01)));
      }
    }

    if (walkAction) {
      const current = walkAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, walkTarget, Math.min(1, delta * 10));
      walkAction.setEffectiveWeight(next);
      const safeWalkSpeed = Math.max(walkSpeed, 0.01);
      const sprintMultiplier = sprintSpeed / safeWalkSpeed;
      walkAction.setEffectiveTimeScale(isSprinting ? sprintMultiplier : 1);
    }

    if (idleAction) {
      const totalMotion = (walkAction ? walkAction.getEffectiveWeight() : 0)
        + (runAction ? runAction.getEffectiveWeight() : 0)
        + (fallAction ? fallAction.getEffectiveWeight() : 0)
        + (jumpAction ? jumpAction.getEffectiveWeight() : 0);
      const idleTarget = totalMotion > 0.05 ? 0 : 1;
      const current = idleAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, idleTarget, Math.min(1, delta * 10));
      idleAction.setEffectiveWeight(next);
    }

    if (landAction) {
      const landTarget = isGrounded && isFalling ? 1 : 0;
      const current = landAction.getEffectiveWeight();
      const next = THREE.MathUtils.lerp(current, landTarget, Math.min(1, delta * 12));
      landAction.setEffectiveWeight(next);
    }

    mixer.update(delta);
  }
}
