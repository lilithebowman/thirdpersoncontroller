import test from 'node:test';
import assert from 'node:assert';

import { PlayerModel } from './PlayerModel.js';

test('PlayerModel rejects dangerous filenames and unsupported types', async () => {
  await assert.rejects(() => PlayerModel.validateFile({
    name: '../malicious.fbx',
    size: 1024,
    type: 'application/octet-stream',
  }), /unsafe|unsupported|invalid/i);

  await assert.rejects(() => PlayerModel.validateFile({
    name: 'avatar.exe',
    size: 1024,
    type: 'application/octet-stream',
  }), /unsupported|invalid/i);
});

test('PlayerModel serializes valid file metadata and preserves rig state', async () => {
  const model = await PlayerModel.fromDataUrl({
    name: 'Hero.fbx',
    dataUrl: 'data:model/vnd.fbx;base64,QUJDRA==',
    mimeType: 'model/vnd.fbx',
  });

  assert.strictEqual(model.fileName, 'Hero.fbx');
  assert.strictEqual(model.extension, '.fbx');
  assert.strictEqual(model.hasHumanoidRig, false);
  assert.strictEqual(model.isRigged, false);
});
