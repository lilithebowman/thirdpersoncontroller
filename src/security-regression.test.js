import test from 'node:test';
import assert from 'node:assert';

import { resolvePublicAssetPath } from '../vite.config.js';
import { server } from '../server/server.js';

async function withTestServer(callback) {
  if (server.listening) {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    await callback(port);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

test('resolvePublicAssetPath rejects traversal attempts', () => {
  assert.equal(resolvePublicAssetPath('../../etc/passwd'), null);
  assert.equal(resolvePublicAssetPath('/etc/passwd'), null);
  assert.equal(resolvePublicAssetPath('..\\..\\secret.txt'), null);
  assert.ok(resolvePublicAssetPath('models/player-manifest.json'));
});

test('server rejects transform requests without a valid session token', async () => {
  await withTestServer(async (port) => {
    const registerResponse = await fetch(`http://127.0.0.1:${port}/api/players/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(registerResponse.status, 201);
    const registration = await registerResponse.json();
    assert.ok(registration.guid);
    assert.ok(registration.sessionToken);

    const unauthorizedTransform = await fetch(`http://127.0.0.1:${port}/api/players/transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': 'bad-token' },
      body: JSON.stringify({
        guid: registration.guid,
        position: { x: 10, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        yaw: 0,
        direction: { x: 1, y: 0, z: 0 },
        animationState: 'idle',
        isSpeaking: false,
      }),
    });

    assert.equal(unauthorizedTransform.status, 401);

    const authorizedTransform = await fetch(`http://127.0.0.1:${port}/api/players/transform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Token': registration.sessionToken },
      body: JSON.stringify({
        guid: registration.guid,
        position: { x: 10, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        yaw: 0,
        direction: { x: 1, y: 0, z: 0 },
        animationState: 'idle',
        isSpeaking: false,
      }),
    });

    assert.equal(authorizedTransform.status, 200);
  });
});

test('server rejects unauthorized session fetches and untrusted origins', async () => {
  await withTestServer(async (port) => {
    const registerResponse = await fetch(`http://127.0.0.1:${port}/api/players/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    assert.equal(registerResponse.status, 201);
    const registration = await registerResponse.json();
    assert.ok(registration.guid);
    assert.ok(registration.sessionToken);

    const unauthorizedSession = await fetch(`http://127.0.0.1:${port}/api/players/session?guid=${encodeURIComponent(registration.guid)}`, {
      headers: { 'X-Session-Token': 'bad-token' },
    });

    assert.equal(unauthorizedSession.status, 401);

    const authorizedSession = await fetch(`http://127.0.0.1:${port}/api/players/session?guid=${encodeURIComponent(registration.guid)}`, {
      headers: { 'X-Session-Token': registration.sessionToken },
    });

    assert.equal(authorizedSession.status, 200);

    const corsResponse = await fetch(`http://127.0.0.1:${port}/api/players/session?guid=${encodeURIComponent(registration.guid)}`, {
      headers: { Origin: 'https://evil.example', 'X-Session-Token': registration.sessionToken },
    });

    assert.equal(corsResponse.headers.get('access-control-allow-origin'), null);
  });
});
