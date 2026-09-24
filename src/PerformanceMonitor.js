/**
 * PerformanceMonitor.js
 * 
 * Provides a simple performance monitoring utility to track frames per second (FPS) with smoothing.
 */

export class PerformanceMonitor {
  constructor({ smoothing = 0.9, initialFPS = 60 } = {}) {
    this.smoothing = smoothing;
    this.FPS = initialFPS;
    this.hasSample = false;
  }

  update(deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return this.FPS;
    }

    const instantFPS = 1 / deltaSeconds;

    if (!this.hasSample) {
      this.FPS = instantFPS;
      this.hasSample = true;
      return this.FPS;
    }

    this.FPS = this.FPS * this.smoothing + instantFPS * (1 - this.smoothing);
    return this.FPS;
  }
}
