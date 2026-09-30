/**
 * PerformanceMonitor.js
 *
 * Class: PerformanceMonitor
 * Purpose: Tracks frames per second (FPS) with exponential smoothing so the application
 *          can monitor performance and trigger adaptive optimizations.
 */

export class PerformanceMonitor {
  /**
   * Creates a PerformanceMonitor instance.
   * @param {Object} options - Configuration options
   * @param {number} [options.smoothing=0.9] - Exponential smoothing factor [0, 1)
   * @param {number} [options.initialFPS=60] - Initial FPS baseline
   */
  constructor({ smoothing = 0.9, initialFPS = 60 } = {}) {
    this.smoothing = smoothing;
    this.FPS = initialFPS;
    this.hasSample = false;
  }

  /**
   * Updates FPS tracking using frame delta time.
   * @param {number} deltaSeconds - Frame delta time in seconds
   * @returns {number} Current smoothed FPS value
   */
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
