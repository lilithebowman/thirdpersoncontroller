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
