/**
 * AssetMetaService.test.js
 * 
 * Unit tests for AssetMetaService.
 */

import test from 'node:test';
import assert from 'node:assert';
import { AssetMetaService } from './AssetMetaService.js';

test('AssetMetaService initializes with default endpoint', () => {
  const service = new AssetMetaService();
  assert.strictEqual(service.apiEndpoint, '/api/asset-meta');
});

test('AssetMetaService generates fallback meta object correctly', async () => {
  const service = new AssetMetaService();
  const meta = await service.generateMeta('models/test/Model.obj', ['MeshA', 'MeshB'], { scaleFactor: 2.0 });

  assert.strictEqual(meta.assetPath, 'models/test/Model.obj');
  assert.strictEqual(meta.version, 1);
  assert.strictEqual(meta.importSettings.scaleFactor, 2.0);
  assert.ok(meta.subMeshOverrides);
  assert.ok(meta.subMeshOverrides['MeshA']);
  assert.strictEqual(meta.subMeshOverrides['MeshA'].materialRenderType, 'cutout');
});
