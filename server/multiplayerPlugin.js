/**
 * multiplayerPlugin.js
 *
 * Vite plugin middleware for multiplayer player registration, transform persistence,
 * rate limiting, input validation, and stale player pruning.
 */

import crypto from 'node:crypto';

const players = new Map();
const rateLimits = new Map();

const STALE_TIMEOUT_MS = 15000;
const PLAYER_RETENTION_MS = 1000 * 60 * 60 * 24 * 60; // 60 days
const MAX_TRANSFORM_BODY_SIZE = 2048; // 2KB
const MAX_VOICE_BODY_SIZE = 256 * 1024; // 256KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

function cleanupExpiredPlayers() {
  const now = Date.now();
  for (const [guid, data] of players.entries()) {
    if (now - (data.lastUpdated ?? now) > PLAYER_RETENTION_MS) {
      players.delete(guid);
      rateLimits.delete(guid);
    }
  }
}

function cleanupStalePlayers() {
  const now = Date.now();
  for (const [guid, data] of players.entries()) {
    if (now - (data.lastUpdated ?? now) > STALE_TIMEOUT_MS) {
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

export function multiplayerPlugin() {
  return {
    name: 'multiplayer-sync-service',
    configureServer(server) {
      server.middlewares.use('/api/players', async (req, res, next) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathname = url.pathname;

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          res.end();
          return;
        }

        if (req.method === 'POST' && pathname === '/register') {
          cleanupExpiredPlayers();
          const guid = crypto.randomUUID();
          const now = Date.now();
          players.set(guid, {
            guid,
            position: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            yaw: 0,
            direction: { x: 0, y: 0, z: -1 },
            animationState: 'idle',
            isSpeaking: false,
            voiceData: null,
            lastUpdated: now,
          });

          res.statusCode = 201;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, guid }));
          return;
        }

        if (req.method === 'POST' && pathname === '/transform') {
          let body = '';
          let bodySize = 0;
          let payloadTooLarge = false;

          req.on('data', (chunk) => {
            bodySize += chunk.length;
            if (bodySize > MAX_TRANSFORM_BODY_SIZE) {
              payloadTooLarge = true;
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
              const { guid, position, rotation, yaw, direction, animationState, isSpeaking } = data;

              if (!guid || typeof guid !== 'string' || guid.length > 64) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid or missing player GUID' }));
                return;
              }

              if (!players.has(guid)) {
                players.set(guid, {
                  guid,
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0, w: 1 },
                  yaw: 0,
                  animationState: 'idle',
                  voiceData: null,
                  lastUpdated: Date.now(),
                });
              }

              if (!checkRateLimit(guid)) {
                res.statusCode = 429;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Too Many Requests (Rate limit exceeded)' }));
                return;
              }

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

              if (direction && typeof direction.x === 'number' && Number.isFinite(direction.x) &&
                  typeof direction.y === 'number' && Number.isFinite(direction.y) &&
                  typeof direction.z === 'number' && Number.isFinite(direction.z)) {
                player.direction = { x: direction.x, y: direction.y, z: direction.z };
              }

              if (animationState && typeof animationState === 'string') {
                player.animationState = animationState.slice(0, 32);
              }

              if (typeof isSpeaking === 'boolean') {
                player.isSpeaking = isSpeaking;
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

        if (req.method === 'POST' && pathname === '/voice') {
          let body = '';
          let bodySize = 0;
          let payloadTooLarge = false;

          req.on('data', (chunk) => {
            bodySize += chunk.length;
            if (bodySize > MAX_VOICE_BODY_SIZE) {
              payloadTooLarge = true;
              return;
            }
            body += chunk;
          });

          req.on('end', () => {
            if (payloadTooLarge) {
              res.statusCode = 413;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Payload Too Large (max 256KB)' }));
              return;
            }

            try {
              const data = JSON.parse(body);
              const { guid, audioBase64 } = data;

              if (!guid || typeof guid !== 'string' || guid.length > 64) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Invalid or missing player GUID' }));
                return;
              }

              if (!players.has(guid)) {
                players.set(guid, {
                  guid,
                  position: { x: 0, y: 0, z: 0 },
                  rotation: { x: 0, y: 0, z: 0, w: 1 },
                  yaw: 0,
                  animationState: 'idle',
                  voiceData: null,
                  lastUpdated: Date.now(),
                });
              }

              if (!checkRateLimit(guid)) {
                res.statusCode = 429;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Too Many Requests (Rate limit exceeded)' }));
                return;
              }

              if (audioBase64 && typeof audioBase64 === 'string') {
                const player = players.get(guid);
                player.voiceData = {
                  audioBase64: audioBase64,
                  timestamp: Date.now(),
                };
                player.lastUpdated = Date.now();
              }

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

        if (req.method === 'GET' && (pathname === '' || pathname === '/')) {
          cleanupStalePlayers();
          const now = Date.now();
          const activePlayers = Array.from(players.values()).map((p) => ({
            guid: p.guid,
            position: p.position,
            rotation: p.rotation,
            yaw: p.yaw,
            direction: p.direction ?? { x: 0, y: 0, z: -1 },
            animationState: p.animationState,
            isSpeaking: Boolean(p.isSpeaking),
            voiceData: p.voiceData && (now - p.voiceData.timestamp < 3000) ? p.voiceData : null,
          }));

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, players: activePlayers }));
          return;
        }

        next();
      });
    },
  };
}
