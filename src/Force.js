import * as THREE from 'three';

export class Force {
  Impulse(rigidbody, impulse) {
    if (!rigidbody || typeof rigidbody.addImpulse !== 'function') {
      throw new Error('Force.Impulse requires a Rigidbody instance.');
    }

    let impulseVector = impulse;
    if (Array.isArray(impulse)) {
      impulseVector = new THREE.Vector3(
        impulse[0] ?? 0,
        impulse[1] ?? 0,
        impulse[2] ?? 0
      );
    }

    if (!(impulseVector instanceof THREE.Vector3)) {
      throw new Error('Force.Impulse expects a THREE.Vector3 or [x, y, z] array.');
    }

    rigidbody.addImpulse(impulseVector);
  }

  static Impulse(rigidbody, impulse) {
    new Force().Impulse(rigidbody, impulse);
  }
}