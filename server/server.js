/**
 * server.js
 *
 * Standalone Node.js backend server for ThirdPersonController multiplayer sync.
 * Provides:
 * - POST /api/players/register: Assigns and returns a unique player GUID.
 * - POST /api/players/transform: Submits and persists player world transforms with strict input validation.
 * - GET /api/players: Returns all active player transforms (automatically pruning inactive players > 15s).
 * 
 * Safeguards:
 * - Rate limiting per player GUID (max 30 requests/sec).
 * - Request payload size limits (max 2KB).
 * - Strict input sanitization and numeric type checking.
 */

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = process.env.PORT || 3000;
const players = new Map();
const rateLimits = new Map();

const STALE_TIMEOUT_MS = 15000;
const MAX_BODY_SIZE = 2048; // 2KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function cleanupStalePlayers() {
  const now = Date.now();
  for (const [guid, data] of players.entries()) {
    if (now - data.lastUpdated > STALE_TIMEOUT_MS) {
      players.delete(guid);
      rateLimits.delete(guid);
    }
  }
}

function checkRateLimit(guid) {
  const now = Date.now();
  let record = rateLimits.get(guid);
  if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
    record = { windowStart: now, count: 1 };
    rateLimits.set(guid, record);
    return true;
  }
  record.count++;
  return record.count <= RATE_LIMIT_MAX_REQUESTS;
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  if (pathname === '/api/players/register' && req.method === 'POST') {
    const guid = crypto.randomUUID();
    const now = Date.now();
    players.set(guid, {
      guid,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      yaw: 0,
      animationState: 'idle',
      lastUpdated: now,
    });

    res.statusCode = 201;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, guid }));
    return;
  }

  if (pathname === '/api/players/transform' && req.method === 'POST') {
    let body = '';
    let bodySize = 0;
    let payloadTooLarge = false;

    req.on('data', (chunk) => {
      bodySize += chunk.length;
      if (bodySize > MAX_BODY_SIZE) {
        payloadTooLarge = true;
        req.destroy();
        return;
      }
      body += chunk;
    });

    req.on('end', () => {
      if (payloadTooLarge) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Payload Too Large (max 2KB)' }));
        return;
      }

      try {
        const data = JSON.parse(body);
        const { guid, position, rotation, yaw, animationState } = data;

        if (!guid || typeof guid !== 'string' || guid.length > 64) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid or missing player GUID' }));
          return;
        }

        if (!players.has(guid)) {
          // Auto-register if not yet registered
          players.set(guid, {
            guid,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            yaw: 0,
            animationState: 'idle',
            lastUpdated: Date.now(),
          });
        }

        if (!checkRateLimit(guid)) {
          res.statusCode = 429;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Too Many Requests (Rate limit exceeded)' }));
          return;
        }

        // Validate position
        if (!position || typeof position.x !== 'number' || !Number.isFinite(position.x) ||
            typeof position.y !== 'number' || !Number.isFinite(position.y) ||
            typeof position.z !== 'number' || !Number.isFinite(position.z)) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Invalid position coordinates' }));
          return;
        }

        const player = players.get(guid);
        player.position = { x: position.x, y: position.y, z: position.z };

        if (rotation && typeof rotation.x === 'number' && Number.isFinite(rotation.x) &&
            typeof rotation.y === 'number' && Number.isFinite(rotation.y) &&
            typeof rotation.z === 'number' && Number.isFinite(rotation.z) &&
            typeof rotation.w === 'number' && Number.isFinite(rotation.w)) {
          player.rotation = { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w };
        }

        if (typeof yaw === 'number' && Number.isFinite(yaw)) {
          player.yaw = yaw;
        }

        if (animationState && typeof animationState === 'string') {
          player.animationState = animationState.slice(0, 32);
        }

        player.lastUpdated = Date.now();

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true }));
      } catch (error) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  if (pathname === '/api/players' && req.method === 'GET') {
    cleanupStalePlayers();
    const activePlayers = Array.from(players.values());

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, players: activePlayers }));
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
});

if (process.argv[1] === import.meta.url || process.argv[1]?.endsWith('server.js')) {
  server.listen(PORT, () => {
    console.log(`Multiplayer sync backend server running on port ${PORT}`);
  });
}

export { server, players, cleanupStalePlayers };
