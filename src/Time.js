/**
 * Small wrapper for the per-frame simulation interval.
 *
 * The physics system passes this object around so force, gravity, and collision impulses
 * are scaled by elapsed time rather than being treated as instantaneous values. This keeps
 * gameplay stable across different frame rates and prevents physics from feeling like it is
 * strongly dependent on the current FPS.
 */
export class Time {
  constructor(deltaTime = 1 / 60) {
    const resolvedDeltaTime = deltaTime && typeof deltaTime === 'object'
      ? (Number.isFinite(deltaTime.deltaTime) ? deltaTime.deltaTime : 0)
      : deltaTime;

    const numericDeltaTime = Number(resolvedDeltaTime);
    this.deltaTime = Number.isFinite(numericDeltaTime) && numericDeltaTime > 0 ? numericDeltaTime : 0;
  }

  static fromDeltaTime(deltaTime = 1 / 60) {
    return new Time(deltaTime);
  }

  scale(value = 0) {
    return Number(value) * this.deltaTime;
  }

  get value() {
    return this.deltaTime;
  }
}
