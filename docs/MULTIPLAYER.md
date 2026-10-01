# Multiplayer Synchronization Service

## Overview
The Multiplayer Synchronization Service enables players across different browser instances to see each other's live world positions and orientations in real time. It consists of a robust backend server/middleware component (`server/server.js` and `server/multiplayerPlugin.js`) and a client-side service module (`src/MultiplayerService.js`) integrated into the core `ThirdPersonControllerApp`.

---

## Backend Architecture & API Endpoints

The backend maintains an in-memory store of active player instances with automatic stale player garbage collection.

### 1. Register Player
- **Endpoint**: `POST /api/players/register`
- **Description**: Assigns and returns a unique cryptographic GUID (`crypto.randomUUID()`) and initializes player state.
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "guid": "c9bf9e57-1685-4c89-bafb-95089e240c95"
  }
  ```

### 2. Submit World Transform
- **Endpoint**: `POST /api/players/transform`
- **Description**: Submits the local player's world position, rotation quaternion, yaw, and animation state.
- **Request Body**:
  ```json
  {
    "guid": "c9bf9e57-1685-4c89-bafb-95089e240c95",
    "position": { "x": 1.2, "y": 0.0, "z": -4.5 },
    "rotation": { "x": 0.0, "y": 0.707, "z": 0.0, "w": 0.707 },
    "yaw": 1.57,
    "animationState": "walk"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

### 3. Fetch Active Players
- **Endpoint**: `GET /api/players`
- **Description**: Returns all currently active connected players, automatically pruning stale instances inactive for more than 15 seconds.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "players": [
      {
        "guid": "d4e2f1a3-89b2-4c12-9e32-a5814c89f123",
        "position": { "x": 5.0, "y": 0.0, "z": 2.1 },
        "rotation": { "x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0 },
        "yaw": 0.0,
        "animationState": "idle",
        "lastUpdated": 1727654400000
      }
    ]
  }
  ```

---

## Security & Anti-Exploit Safeguards

To prevent flooding, denial of service, malformed injection, and memory exhaustion exploits, the backend enforces rigorous safeguards:

1. **Rate Limiting**:
   - Each player GUID is restricted to a maximum of **30 transform submissions per second**.
   - Exceeding this limit results in an immediate **HTTP 429 Too Many Requests** response.

2. **Request Payload Size Limits**:
   - Incoming POST request bodies are strictly capped at **2KB (2048 bytes)**.
   - Payloads exceeding this size are rejected with **HTTP 413 Payload Too Large**.

3. **Strict Input Validation & Sanitization**:
   - **GUID**: Must be a non-empty string of maximum 64 characters.
   - **Position & Rotation**: Coordinates (`x`, `y`, `z`, `w`) are explicitly checked using `typeof val === 'number' && Number.isFinite(val)` to prevent NaN, Infinity, or prototype pollution injections.
   - **Animation State**: Strings are truncated and sanitized to prevent buffer or memory overflow.
   - Malformed payloads receive **HTTP 400 Bad Request**.

4. **Stale Player Pruning**:
   - Players who stop transmitting updates for more than **15 seconds** are automatically removed from memory.

---

## Frontend Integration

- **`MultiplayerService` (`src/MultiplayerService.js`)**:
  - Automatically registers on startup to obtain a unique session GUID.
  - Runs asynchronous update intervals (every 100ms) to submit local player transforms and poll remote players.
- **`ThirdPersonControllerApp` (`src/ThirdPersonControllerApp.js`)**:
  - Maintains `remotePlayerMeshes` mapping active GUIDs to Three.js avatar groups.
  - Renders remote players using stylized avatar representations with distinct coloring (`0x10b981`).
  - Applies smooth linear interpolation (`lerp`) and spherical linear interpolation (`slerp`) each animation tick to ensure fluid, jitter-free movement across network instances.

---

## Running the Service

- **Development Mode (Vite Dev Server with integrated multiplayer middleware)**:
  ```bash
  npm run dev
  ```
- **Standalone Backend Server**:
  ```bash
  npm run server
  ```
- **Automated Testing**:
  ```bash
  npm test
  ```
