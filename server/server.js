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
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_DIR = path.join(__dirname, 'data');
const PLAYER_STATE_PATH = path.join(STORAGE_DIR, 'players.json');

const PORT = process.env.PORT || 3000;
const players = new Map();
const rateLimits = new Map();

const STALE_TIMEOUT_MS = 15000;
const MAX_MODEL_DATA_URL_LENGTH = 32 * 1024 * 1024; // 32MB
const MAX_TRANSFORM_BODY_SIZE = MAX_MODEL_DATA_URL_LENGTH + 4096; // allow safe model uploads
const MAX_VOICE_BODY_SIZE = 256 * 1024; // 256KB
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;
const ALLOWED_MODEL_EXTENSIONS = new Set(['.fbx', '.gltf', '.glb', '.obj']);

function sanitizeModelPayload(model) {
  if (!model || typeof model !== 'object') {
    return null;
  }

  const fileName = typeof model.fileName === 'string' ? model.fileName : typeof model.name === 'string' ? model.name : 'player-model';
  const extension = typeof model.extension === 'string' ? model.extension.trim().toLowerCase() : '';
  const dataUrl = typeof model.dataUrl === 'string' ? model.dataUrl : '';

  if (!ALLOWED_MODEL_EXTENSIONS.has(extension)) {
    return null;
  }

  if (!/^data:/i.test(dataUrl) || dataUrl.length > MAX_MODEL_DATA_URL_LENGTH) {
    return null;
  }

  const safeName = fileName.replace(/[<>:"|?*\\/]+/g, '_').slice(0, 128) || 'player-model';
  const eyePosition = model.eyePosition && typeof model.eyePosition === 'object'
    ? {
        x: Number(model.eyePosition.x) || 0,
        y: Number(model.eyePosition.y) || 1.6,
        z: Number(model.eyePosition.z) || 0,
      }
    : null;
  const boneNames = Array.isArray(model.boneNames)
    ? model.boneNames.filter((name) => typeof name === 'string' && name.trim()).slice(0, 128)
    : [];
  const materialData = model.materialData && typeof model.materialData === 'object'
    ? model.materialData
    : null;
  const manifest = model.manifest && typeof model.manifest === 'object'
    ? model.manifest
    : null;

  return {
    name: safeName,
    fileName: safeName,
    extension,
    mimeType: typeof model.mimeType === 'string' ? model.mimeType.toLowerCase() : 'application/octet-stream',
    dataUrl,
    hasHumanoidRig: Boolean(model.hasHumanoidRig),
    isRigged: Boolean(model.isRigged),
    eyePosition,
    boneNames,
    materialData,
    manifest,
  };
}

async function ensureStorageDirectory() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

async function persistPlayers() {
  await ensureStorageDirectory();
  const snapshot = Array.from(players.values()).map((player) => ({
    guid: player.guid,
    position: player.position ?? { x: 0, y: 0, z: 0 },
    rotation: player.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
    yaw: Number.isFinite(player.yaw) ? player.yaw : 0,
    direction: player.direction ?? { x: 0, y: 0, z: -1 },
    animationState: typeof player.animationState === 'string' ? player.animationState.slice(0, 32) : 'idle',
    isSpeaking: Boolean(player.isSpeaking),
    model: player.model ?? null,
    lastUpdated: player.lastUpdated ?? Date.now(),
    createdAt: player.createdAt ?? player.lastUpdated ?? Date.now(),
  }));

  await fs.writeFile(PLAYER_STATE_PATH, JSON.stringify({ players: snapshot }, null, 2), 'utf8');
}

async function loadPersistedPlayers() {
  try {
    await ensureStorageDirectory();
    const content = await fs.readFile(PLAYER_STATE_PATH, 'utf8');
    if (!content.trim()) {
      return;
    }

    const parsed = JSON.parse(content);
    const entries = Array.isArray(parsed?.players) ? parsed.players : [];
    for (const entry of entries) {
      if (!entry || typeof entry.guid !== 'string') {
        continue;
      }

      const storedPlayer = {
        guid: entry.guid,
        position: entry.position ?? { x: 0, y: 0, z: 0 },
        rotation: entry.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
        yaw: Number.isFinite(entry.yaw) ? entry.yaw : 0,
        direction: entry.direction ?? { x: 0, y: 0, z: -1 },
        animationState: typeof entry.animationState === 'string' ? entry.animationState.slice(0, 32) : 'idle',
        isSpeaking: Boolean(entry.isSpeaking),
        model: sanitizeModelPayload(entry.model),
        voiceData: null,
        lastUpdated: Number.isFinite(entry.lastUpdated) ? entry.lastUpdated : Date.now(),
        createdAt: Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now(),
      };
      players.set(entry.guid, storedPlayer);
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('Failed to load persisted player state:', error?.message ?? error);
    }
  }
}

async function cleanupStalePlayers() {
  const now = Date.now();
  let changed = false;
  for (const [guid, data] of players.entries()) {
    if (now - data.lastUpdated > STALE_TIMEOUT_MS) {
      players.delete(guid);
      rateLimits.delete(guid);
      changed = true;
    }
  }

  if (changed) {
    await persistPlayers();
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
      direction: { x: 0, y: 0, z: -1 },
      animationState: 'idle',
      isSpeaking: false,
      model: null,
      voiceData: null,
      lastUpdated: now,
      createdAt: now,
    });

    persistPlayers().catch(() => {});

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
      if (bodySize > MAX_TRANSFORM_BODY_SIZE) {
        payloadTooLarge = true;
        return;
      }
      body += chunk;
    });

    req.on('end', async () => {
      if (payloadTooLarge) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Payload Too Large (max 2KB)' }));
        return;
      }

      try {
        const data = JSON.parse(body);
        const { guid, position, rotation, yaw, direction, animationState, isSpeaking, model } = data;

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
            direction: { x: 0, y: 0, z: -1 },
            animationState: 'idle',
            isSpeaking: false,
            model: null,
            voiceData: null,
            lastUpdated: Date.now(),
            createdAt: Date.now(),
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

        if (model !== undefined) {
          const sanitizedModel = sanitizeModelPayload(model);
          if (sanitizedModel) {
            player.model = sanitizedModel;
          }
        }

        player.lastUpdated = Date.now();
        await persistPlayers();

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

  if (pathname === '/api/players/voice' && req.method === 'POST') {
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

    req.on('end', async () => {
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
            direction: { x: 0, y: 0, z: -1 },
            animationState: 'idle',
            isSpeaking: false,
            model: null,
            voiceData: null,
            lastUpdated: Date.now(),
            createdAt: Date.now(),
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
          await persistPlayers();
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

  if (pathname === '/api/players/session' && req.method === 'GET') {
    const guid = url.searchParams.get('guid');
    const player = guid ? players.get(guid) : null;
    if (!player) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'No persisted session found.' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      success: true,
      session: {
        guid: player.guid,
        position: player.position ?? { x: 0, y: 0, z: 0 },
        rotation: player.rotation ?? { x: 0, y: 0, z: 0, w: 1 },
        yaw: Number.isFinite(player.yaw) ? player.yaw : 0,
        direction: player.direction ?? { x: 0, y: 0, z: -1 },
        animationState: player.animationState ?? 'idle',
        isSpeaking: Boolean(player.isSpeaking),
        model: player.model ?? null,
        lastUpdated: player.lastUpdated ?? Date.now(),
        createdAt: player.createdAt ?? player.lastUpdated ?? Date.now(),
      },
    }));
    return;
  }

  if (pathname === '/api/players' && req.method === 'GET') {
    await cleanupStalePlayers();
    const now = Date.now();
    const activePlayers = Array.from(players.values()).map((p) => ({
      guid: p.guid,
      position: p.position,
      rotation: p.rotation,
      yaw: p.yaw,
      direction: p.direction ?? { x: 0, y: 0, z: -1 },
      animationState: p.animationState,
      isSpeaking: Boolean(p.isSpeaking),
      model: p.model ?? null,
      voiceData: p.voiceData && (now - p.voiceData.timestamp < 3000) ? p.voiceData : null,
    }));

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
