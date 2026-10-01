/**
 * VoiceChatService.test.js
 *
 * Unit tests for VoiceChatService.
 */

import test from 'node:test';
import assert from 'node:assert';
import { VoiceChatService } from './VoiceChatService.js';

test('VoiceChatService initializes with default options', () => {
  const service = new VoiceChatService();
  assert.strictEqual(service.apiEndpoint, '/api/players');
  assert.strictEqual(service.threshold, 0.05);
  assert.strictEqual(service.isListening, false);
  assert.strictEqual(service.isSpeaking, false);
});

test('VoiceChatService updates threshold correctly within bounds', () => {
  const service = new VoiceChatService();
  service.setThreshold(0.2);
  assert.strictEqual(service.threshold, 0.2);

  service.setThreshold(-1);
  assert.strictEqual(service.threshold, 0);

  service.setThreshold(5);
  assert.strictEqual(service.threshold, 1);
});

test('VoiceChatService stops correctly', () => {
  const service = new VoiceChatService();
  service.isListening = true;
  service.isSpeaking = true;
  service.stop();

  assert.strictEqual(service.isListening, false);
  assert.strictEqual(service.isSpeaking, false);
});
