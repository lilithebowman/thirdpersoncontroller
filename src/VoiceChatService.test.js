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

test('VoiceChatService downsampleToRate reduces sample count when output rate is lower', () => {
  const service = new VoiceChatService();
  const input = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
  const output = service.downsampleToRate(input, 8000, 4000);
  assert.ok(output.length > 0);
  assert.ok(output.length < input.length);
});

test('VoiceChatService encodePcm16Wav generates valid RIFF/WAVE header', () => {
  const service = new VoiceChatService();
  const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const wavBuffer = service.encodePcm16Wav(samples, 16000);
  const view = new DataView(wavBuffer);

  const toAscii = (start, end) => {
    let str = '';
    for (let i = start; i < end; i++) str += String.fromCharCode(view.getUint8(i));
    return str;
  };

  assert.strictEqual(toAscii(0, 4), 'RIFF');
  assert.strictEqual(toAscii(8, 12), 'WAVE');
  assert.strictEqual(toAscii(12, 16), 'fmt ');
  assert.strictEqual(toAscii(36, 40), 'data');
  assert.ok(wavBuffer.byteLength > 44);
});

test('VoiceChatService stops correctly', () => {
  const service = new VoiceChatService();
  service.isListening = true;
  service.isSpeaking = true;
  service.stop();

  assert.strictEqual(service.isListening, false);
  assert.strictEqual(service.isSpeaking, false);
});
