/**
 * MultiplayerService.js
 *
 * Class: MultiplayerService
 * Purpose: Manages client-side multiplayer synchronization, handling player registration,
 *          periodic world transform submissions (position, rotation, yaw, animation state),
 *          and polling active remote players from the backend server.
 * SOLID Principles:
 * - Single Responsibility: Encapsulates all network communication and state synchronization for multiplayer.
 * - Dependency Inversion: Accepts fetch and timing callbacks or delegates to standard HTTP fetch APIs.
 */

export class MultiplayerService {
  /**
   * Creates a MultiplayerService instance.
   * @param {Object} [options={}] - Configuration options
   * @param {string} [options.apiEndpoint='/api/players'] - Base API endpoint for multiplayer
   * @param {number} [options.submitIntervalMs=100] - Interval between transform submissions
   * @param {number} [options.pollIntervalMs=100] - Interval between fetching remote players
   */
  constructor(options = {}) {
    this.apiEndpoint = options.apiEndpoint ?? '/api/players';
    this.submitIntervalMs = options.submitIntervalMs ?? 100;
    this.pollIntervalMs = options.pollIntervalMs ?? 100;
    this.storageKey = options.storageKey ?? 'thirdpersoncontroller-player-guid';
    this.sessionTokenKey = options.sessionTokenKey ?? 'thirdpersoncontroller-player-session-token';

    this.guid = this.readStoredGuid();
    this.sessionToken = this.readStoredSessionToken();
    this.isRegistered = Boolean(this.guid);
    this.isRunning = false;

    this.latestLocalTransform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      yaw: 0,
      direction: { x: 0, y: 0, z: -1 },
      animationState: 'idle',
      isSpeaking: false,
      model: null,
    };

    this.remotePlayers = [];
    this.onRemotePlayersUpdate = options.onRemotePlayersUpdate ?? (() => {});

    this._submitTimer = null;
    this._pollTimer = null;
  }

  readStoredGuid() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedValue = localStorage.getItem(this.storageKey);
    return typeof storedValue === 'string' && storedValue.trim() ? storedValue.trim() : null;
  }

  normalizeGuid(guid) {
    const value = typeof guid === 'string' ? guid.trim() : '';
    return value.length > 0 ? value.slice(0, 128) : null;
  }

  setGuid(guid, persist = true) {
    const normalized = this.normalizeGuid(guid);
    if (!normalized) {
      return null;
    }

    this.guid = normalized;
    this.isRegistered = true;
    if (persist) {
      this.persistGuid(this.guid);
    }
    return this.guid;
  }

  persistGuid(guid = this.guid) {
    if (typeof localStorage === 'undefined' || !guid) {
      return;
    }

    localStorage.setItem(this.storageKey, String(guid));
  }

  readStoredSessionToken() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const storedValue = localStorage.getItem(this.sessionTokenKey);
    return typeof storedValue === 'string' && storedValue.trim() ? storedValue.trim() : null;
  }

  persistSessionToken(sessionToken = this.sessionToken) {
    if (typeof localStorage === 'undefined' || !sessionToken) {
      return;
    }

    localStorage.setItem(this.sessionTokenKey, String(sessionToken));
  }

  getAuthHeaders(extraHeaders = {}) {
    const headers = { ...extraHeaders };
    if (this.sessionToken) {
      headers['X-Session-Token'] = this.sessionToken;
    }
    return headers;
  }

  async ensureGuid() {
    if (this.guid && this.sessionToken) {
      return this.guid;
    }

    const storedGuid = this.readStoredGuid();
    if (storedGuid) {
      this.guid = storedGuid;
      this.isRegistered = true;
      if (this.sessionToken) {
        return this.guid;
      }
    }

    return this.register();
  }

  /**
   * Registers the player with the backend to obtain a unique GUID.
   * @returns {Promise<string>} The assigned player GUID
   */
  async register() {
    try {
      const response = await fetch(`${this.apiEndpoint}/register`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.guid) {
          this.guid = data.guid;
          this.sessionToken = data.sessionToken || this.sessionToken;
          this.persistGuid(this.guid);
          if (this.sessionToken) {
            this.persistSessionToken(this.sessionToken);
          }
          this.isRegistered = true;
          return this.guid;
        }
      }
    } catch (error) {
      // Fallback for offline or static mode: generate client-side pseudo-GUID
    }

    if (!this.guid) {
      this.guid = 'client-fallback-' + Math.random().toString(36).substring(2, 11);
      this.persistGuid(this.guid);
      this.isRegistered = true;
    }

    if (!this.sessionToken) {
      this.sessionToken = 'client-fallback-session-' + Math.random().toString(36).substring(2, 11);
      this.persistSessionToken(this.sessionToken);
    }

    return this.guid;
  }

  /**
   * Submits the local player transform to the server.
   * @param {Object} transform - Transform data (position, rotation, yaw, animationState)
   * @returns {Promise<boolean>} Success status
   */
  async sendTransform(transform) {
    if (!this.guid) {
      await this.register();
    }

    const safeModel = this.normalizeModelPayload(transform.model ?? this.latestLocalTransform.model);
    const payload = {
      guid: this.guid,
      position: transform.position ?? this.latestLocalTransform.position,
      rotation: transform.rotation ?? this.latestLocalTransform.rotation,
      yaw: transform.yaw ?? this.latestLocalTransform.yaw,
      direction: transform.direction ?? this.latestLocalTransform.direction,
      animationState: transform.animationState ?? this.latestLocalTransform.animationState,
      isSpeaking: transform.isSpeaking ?? this.latestLocalTransform.isSpeaking ?? false,
      model: safeModel,
    };

    this.latestLocalTransform = payload;

    try {
      const response = await fetch(`${this.apiEndpoint}/transform`, {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status === 401 && this.sessionToken) {
        this.sessionToken = null;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(this.sessionTokenKey);
        }
        await this.register();
        return false;
      }

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Fetches active remote players from the server.
   * @returns {Promise<Array<Object>>} List of active players excluding self
   */
  async fetchPlayers() {
    if (!this.guid) {
      await this.ensureGuid();
    }

    try {
      const response = await fetch(`${this.apiEndpoint}?guid=${encodeURIComponent(this.guid ?? '')}`, {
        headers: this.getAuthHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success && Array.isArray(data.players)) {
          // Filter out self
          const others = data.players.filter((p) => p.guid !== this.guid);
          this.remotePlayers = others;
          this.onRemotePlayersUpdate(others);
          return others;
        }
      }

      if (response.status === 401 && this.sessionToken) {
        this.sessionToken = null;
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem(this.sessionTokenKey);
        }
        await this.register();
        return this.fetchPlayers();
      }
    } catch (error) {
      // Network error / offline fallback
    }
    return this.remotePlayers;
  }

  async restoreSession() {
    if (!this.guid) {
      await this.ensureGuid();
    }

    if (!this.guid) {
      return null;
    }

    try {
      const response = await fetch(`${this.apiEndpoint}/session?guid=${encodeURIComponent(this.guid)}`, {
        headers: this.getAuthHeaders(),
      });
      if (!response.ok) {
        if (response.status === 401 && this.sessionToken) {
          this.sessionToken = null;
          if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.sessionTokenKey);
          }
          await this.register();
        }
        return null;
      }

      const data = await response.json();
      const session = data?.session ?? null;
      if (!session) {
        return null;
      }

      this.latestLocalTransform = {
        position: session.position ?? this.latestLocalTransform.position,
        rotation: session.rotation ?? this.latestLocalTransform.rotation,
        yaw: typeof session.yaw === 'number' ? session.yaw : this.latestLocalTransform.yaw,
        direction: session.direction ?? this.latestLocalTransform.direction,
        animationState: session.animationState ?? this.latestLocalTransform.animationState,
        isSpeaking: Boolean(session.isSpeaking),
        model: session.model ?? this.latestLocalTransform.model,
      };

      return this.latestLocalTransform;
    } catch (error) {
      return null;
    }
  }

  /**
   * Starts the periodic update loops for submitting transform and polling remote players.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    if (!this.guid) {
      this.ensureGuid().catch(() => {});
    }

    this._submitTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.sendTransform(this.latestLocalTransform);
      }
    }, this.submitIntervalMs);

    this._pollTimer = setInterval(async () => {
      if (this.isRunning) {
        await this.fetchPlayers();
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stops the multiplayer update loops.
   */
  stop() {
    this.isRunning = false;
    if (this._submitTimer) {
      clearInterval(this._submitTimer);
      this._submitTimer = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  normalizeModelPayload(model) {
    if (!model || typeof model !== 'object') {
      return null;
    }

    const fileName = typeof model.fileName === 'string' ? model.fileName : typeof model.name === 'string' ? model.name : 'player-model';
    const extension = typeof model.extension === 'string' && model.extension.trim() ? model.extension.trim().toLowerCase() : '';
    const allowedExtensions = new Set(['.fbx', '.gltf', '.glb', '.obj']);
    if (!allowedExtensions.has(extension)) {
      return null;
    }

    const dataUrl = typeof model.dataUrl === 'string' ? model.dataUrl : '';
    if (!/^data:/i.test(dataUrl) || dataUrl.length > 32 * 1024 * 1024) {
      return null;
    }

    return {
      name: fileName.replace(/[<>:"|?*\\/]+/g, '_').slice(0, 128),
      fileName: fileName.replace(/[<>:"|?*\\/]+/g, '_').slice(0, 128),
      extension,
      mimeType: typeof model.mimeType === 'string' ? model.mimeType.toLowerCase() : 'application/octet-stream',
      dataUrl,
      hasHumanoidRig: Boolean(model.hasHumanoidRig),
      isRigged: Boolean(model.isRigged),
    };
  }

  /**
   * Updates local transform data ready for next transmission.
   * @param {Object} transform - Current position, rotation, yaw, animationState
   */
  updateLocalTransform(transform) {
    if (transform.position) {
      this.latestLocalTransform.position = { ...transform.position };
    }
    if (transform.rotation) {
      this.latestLocalTransform.rotation = { ...transform.rotation };
    }
    if (typeof transform.yaw === 'number') {
      this.latestLocalTransform.yaw = transform.yaw;
    }
    if (transform.direction) {
      this.latestLocalTransform.direction = { ...transform.direction };
    }
    if (transform.animationState) {
      this.latestLocalTransform.animationState = transform.animationState;
    }
    if (typeof transform.isSpeaking === 'boolean') {
      this.latestLocalTransform.isSpeaking = transform.isSpeaking;
    }
    if (transform.model !== undefined) {
      this.latestLocalTransform.model = this.normalizeModelPayload(transform.model);
    }
  }
}

export const multiplayerService = new MultiplayerService();
