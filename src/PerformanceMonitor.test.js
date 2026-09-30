/**
 * PerformanceMonitor.test.js
 *
 * Unit tests for PerformanceMonitor exponential smoothing FPS calculation.
 */

import test from 'node:test';
import assert from 'node:assert';
import { PerformanceMonitor } from './PerformanceMonitor.js';

test('PerformanceMonitor smooths FPS correctly', () => {
  const monitor = new PerformanceMonitor({ smoothing: 0.8, initialFPS: 60 });
  const fps1 = monitor.update(1 / 30); // 30 fps
  assert.strictEqual(fps1, 30); // first sample sets initial instant FPS

  const fps2 = monitor.update(1 / 60); // 60 fps
  // 30 * 0.8 + 60 * 0.2 = 24 + 12 = 36
  assert.strictEqual(fps2, 36);
});
