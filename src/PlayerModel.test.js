import test from 'node:test';
import assert from 'node:assert';
import JSZip from 'jszip';

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

test('PlayerModel.fromDataUrl retains eye position and manifest metadata', async () => {
  const model = await PlayerModel.fromDataUrl({
    name: 'Hero.fbx',
    dataUrl: 'data:model/vnd.fbx;base64,QUJDRA==',
    mimeType: 'model/vnd.fbx',
    eyePosition: { x: 0.2, y: 1.8, z: -0.1 },
    manifest: { name: 'Hero', version: 1 },
  });

  assert.deepStrictEqual(model.eyePosition, { x: 0.2, y: 1.8, z: -0.1 });
  assert.strictEqual(model.manifest.name, 'Hero');
  assert.strictEqual(model.manifest.version, 1);
});

test('PlayerModel can unpack a zip bundle with player-manifest.json and linked assets', async () => {
  const zip = new JSZip();
  zip.file('player-manifest.json', JSON.stringify({
    name: 'LiliBunn',
    model: 'models/lili-bunn.fbx',
    materialData: {
      roughness: 0.8,
      color: '#FF88AA'
    },
    eyePosition: { x: 0.1, y: 1.7, z: -0.2 },
    boneNames: ['Hips', 'Spine', 'Chest', 'Shoulder.L', 'Shoulder.R'],
  }));
  zip.file('models/lili-bunn.fbx', 'fake-fbx-content');
  zip.file('textures/lili-bunn.png', 'fake-png-content');

  const archive = await zip.generateAsync({ type: 'uint8array' });
  const file = new File([archive], 'lili-bunn.zip', { type: 'application/zip' });

  const model = await PlayerModel.fromFile(file);
  assert.strictEqual(model.fileName, 'lili-bunn.fbx');
  assert.strictEqual(model.extension, '.fbx');
  assert.strictEqual(model.manifest.name, 'LiliBunn');
  assert.strictEqual(model.manifest.model, 'models/lili-bunn.fbx');
  assert.deepStrictEqual(model.eyePosition, { x: 0.1, y: 1.7, z: -0.2 });
  assert.deepStrictEqual(model.boneNames, ['Hips', 'Spine', 'Chest', 'Shoulder.L', 'Shoulder.R']);
  assert.ok(model.bundleFiles && model.bundleFiles['textures/lili-bunn.png']);
});
