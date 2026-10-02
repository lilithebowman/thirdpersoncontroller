import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Lili-bunnExampleModel.fbx is a valid FBX asset in the project', () => {
  const fullPath = path.resolve(process.cwd(), 'public/models/Lili-bunnExampleModel.fbx');
  const bytes = fs.readFileSync(fullPath);

  assert.ok(bytes.length > 0, 'FBX file should exist and contain data');
  assert.match(bytes.slice(0, 20).toString('ascii'), /Kaydara FBX Binary/i, 'FBX header must identify a valid FBX binary asset');
});
