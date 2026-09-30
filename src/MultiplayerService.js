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

    this.guid = null;
    this.isRegistered = false;
    this.isRunning = false;

    this.latestLocalTransform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      yaw: 0,
      animationState: 'idle',
    };

    this.remotePlayers = [];
    this.onRemotePlayersUpdate = options.onRemotePlayersUpdate ?? (() => {});

    this._submitTimer = null;
    this._pollTimer = null;
  }

  /**
   * Registers the player with the backend to obtain a unique GUID.
   * @returns {Promise<string>} The assigned player GUID
   */
  async register() {
    try {
      const response = await fetch(`${this.apiEndpoint}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.guid) {
          this.guid = data.guid;
          this.isRegistered = true;
          return this.guid;
        }
      }
    } catch (error) {
      // Fallback for offline or static mode: generate client-side pseudo-GUID
    }

    if (!this.guid) {
      this.guid = 'client-fallback-' + Math.random().toString(36).substring(2, 11);
      this.isRegistered = true;
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

    const payload = {
      guid: this.guid,
      position: transform.position ?? this.latestLocalTransform.position,
      rotation: transform.rotation ?? this.latestLocalTransform.rotation,
      yaw: transform.yaw ?? this.latestLocalTransform.yaw,
      animationState: transform.animationState ?? this.latestLocalTransform.animationState,
    };

    this.latestLocalTransform = payload;

    try {
      const response = await fetch(`${this.apiEndpoint}/transform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

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
    try {
      const response = await fetch(this.apiEndpoint);
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
    } catch (error) {
      // Network error / offline fallback
    }
    return this.remotePlayers;
  }

  /**
   * Starts the periodic update loops for submitting transform and polling remote players.
   */
  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Initial register if needed
    if (!this.guid) {
      this.register().catch(() => {});
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
    if (transform.animationState) {
      this.latestLocalTransform.animationState = transform.animationState;
    }
  }
}

export const multiplayerService = new MultiplayerService();
