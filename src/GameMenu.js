/**
 * GameMenu.js
 *
 * Class: GameMenu
 * Purpose: Manages the in-game Escape menu modal overlay, providing options
 *          for respawning the player, toggling fullscreen mode, and resuming gameplay.
 * SOLID Principles:
 * - Single Responsibility: Solely responsible for the game menu UI overlay state and actions.
 */

export class GameMenu {
  /**
   * Creates a GameMenu instance.
   * @param {Object} options - Configuration options
   * @param {HTMLElement} options.mountElement - Parent DOM element for mounting the menu
   * @param {Function} options.onRespawn - Callback triggered when respawn is clicked
   * @param {Function} options.onLog - Optional logging callback
   */
  constructor({ mountElement, onRespawn, onLog, onThresholdChange, onSelectPlayerModel, onEyeOffsetChange, onPlayerNameChange, onPlayerTokenChange, defaultPlayerName = '', defaultPlayerToken = '' } = {}) {
    if (!mountElement) {
      throw new Error('GameMenu requires a mountElement.');
    }

    this.mountElement = mountElement;
    this.onRespawn = typeof onRespawn === 'function' ? onRespawn : () => {};
    this.onLog = typeof onLog === 'function' ? onLog : () => {};
    this.onThresholdChange = typeof onThresholdChange === 'function' ? onThresholdChange : () => {};
    this.onSelectPlayerModel = typeof onSelectPlayerModel === 'function' ? onSelectPlayerModel : () => {};
    this.onEyeOffsetChange = typeof onEyeOffsetChange === 'function' ? onEyeOffsetChange : () => {};
    this.onPlayerNameChange = typeof onPlayerNameChange === 'function' ? onPlayerNameChange : () => {};
    this.onPlayerTokenChange = typeof onPlayerTokenChange === 'function' ? onPlayerTokenChange : () => {};
    this.isOpen = false;
    this.eyeOffset = this.readStoredEyeOffset() ?? { x: 0, y: 1.6, z: 0 };
    this.playerName = this.normalizePlayerName(typeof localStorage !== 'undefined' ? localStorage.getItem('thirdpersoncontroller-player-name') ?? defaultPlayerName : defaultPlayerName);
    this.playerToken = this.normalizePlayerToken(typeof localStorage !== 'undefined' ? localStorage.getItem('thirdpersoncontroller-player-guid') ?? defaultPlayerToken : defaultPlayerToken);
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.zip,.fbx,.gltf,.glb,.obj';
    this.fileInput.hidden = true;
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files?.[0];
      this.fileInput.value = '';
      if (file) {
        await this.onSelectPlayerModel(file, this.getEyeOffset());
      }
    });
    this.mountElement.appendChild(this.fileInput);

    this.overlay = this.createMenuDOM();
  }

  /**
   * Creates the menu DOM structure and attaches event listeners.
   * @returns {HTMLElement} The created menu overlay element
   */
  createMenuDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'game-menu-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'game-menu-modal';
    modal.innerHTML = `
      <h2>Game Menu</h2>
      <div style="margin: 12px 0; text-align: left;">
        <label for="player-name" style="display: block; font-size: 14px; margin-bottom: 4px;">Player Name</label>
        <input type="text" id="player-name" maxlength="24" value="${this.escapeHtml(this.playerName)}" placeholder="Your display name" style="width: 100%; box-sizing: border-box;">
      </div>
      <div style="margin: 12px 0; text-align: left;">
        <label for="player-token" style="display: block; font-size: 14px; margin-bottom: 4px;">Player Token</label>
        <input type="text" id="player-token" value="${this.escapeHtml(this.playerToken)}" placeholder="Paste your saved token here" style="width: 100%; box-sizing: border-box;">
      </div>
      <div style="margin: 12px 0; text-align: left;">
        <label for="mic-threshold" style="display: block; font-size: 14px; margin-bottom: 4px;">Mic Threshold: <span id="threshold-display">0.05</span></label>
        <input type="range" id="mic-threshold" min="0.005" max="0.5" step="0.005" value="0.05" style="width: 100%; cursor: pointer;">
      </div>
      <div style="margin: 12px 0; text-align: left;">
        <label style="display: block; font-size: 14px; margin-bottom: 6px;">Eye Offset</label>
        <div style="display: grid; grid-template-columns: repeat(3, minmax(60px, 1fr)); gap: 8px;">
          <label style="font-size: 12px;">X <input type="number" id="eye-offset-x" step="0.05" value="0" style="width: 100%; box-sizing: border-box;"></label>
          <label style="font-size: 12px;">Y <input type="number" id="eye-offset-y" step="0.05" value="1.6" style="width: 100%; box-sizing: border-box;"></label>
          <label style="font-size: 12px;">Z <input type="number" id="eye-offset-z" step="0.05" value="0" style="width: 100%; box-sizing: border-box;"></label>
        </div>
      </div>
      <button type="button" data-action="respawn">Respawn</button>
      <button type="button" data-action="select-player-model">Select Player Model</button>
      <button type="button" data-action="fullscreen">Toggle Fullscreen</button>
      <button type="button" data-action="resume">Resume Game</button>
    `;

    const modalQuery = modal && typeof modal.querySelector === 'function' ? modal.querySelector.bind(modal) : () => null;
    const thresholdInput = modalQuery('#mic-threshold');
    const thresholdDisplay = modalQuery('#threshold-display');
    if (thresholdInput) {
      thresholdInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (thresholdDisplay) {
          thresholdDisplay.textContent = val.toFixed(3);
        }
        this.onThresholdChange(val);
      });
    }

    const playerNameInput = modalQuery('#player-name');
    const playerTokenInput = modalQuery('#player-token');
    if (playerNameInput) {
      playerNameInput.value = this.playerName;
      playerNameInput.addEventListener('input', (event) => {
        const nextValue = this.normalizePlayerName(event.target.value);
        this.playerName = nextValue;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('thirdpersoncontroller-player-name', nextValue);
        }
        this.onPlayerNameChange(nextValue);
      });
    }
    if (playerTokenInput) {
      playerTokenInput.value = this.playerToken;
      playerTokenInput.addEventListener('input', (event) => {
        const nextValue = this.normalizePlayerToken(event.target.value);
        this.playerToken = nextValue;
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('thirdpersoncontroller-player-guid', nextValue || '');
        }
        this.onPlayerTokenChange(nextValue);
      });
    }

    const eyeOffsetInputs = {
      x: modalQuery('#eye-offset-x'),
      y: modalQuery('#eye-offset-y'),
      z: modalQuery('#eye-offset-z'),
    };
    const updateEyeOffsetFromInputs = () => {
      const next = {
        x: Number.parseFloat(eyeOffsetInputs.x?.value ?? this.eyeOffset.x),
        y: Number.parseFloat(eyeOffsetInputs.y?.value ?? this.eyeOffset.y),
        z: Number.parseFloat(eyeOffsetInputs.z?.value ?? this.eyeOffset.z),
      };
      this.eyeOffset = {
        x: Number.isFinite(next.x) ? next.x : 0,
        y: Number.isFinite(next.y) ? next.y : 1.6,
        z: Number.isFinite(next.z) ? next.z : 0,
      };
      this.onEyeOffsetChange({ ...this.eyeOffset });
    };
    Object.values(eyeOffsetInputs).forEach((input) => {
      if (input) {
        input.addEventListener('input', updateEyeOffsetFromInputs);
      }
    });

    modal.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      if (action === 'respawn') {
        this.onRespawn();
        this.onLog('Player respawned via game menu.');
        this.setOpen(false);
      } else if (action === 'select-player-model') {
        this.fileInput.click();
      } else if (action === 'fullscreen') {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen?.();
        } else {
          document.exitFullscreen?.();
        }
      } else if (action === 'resume') {
        this.setOpen(false);
      }
    });

    overlay.appendChild(modal);
    this.mountElement.appendChild(overlay);
    return overlay;
  }

  readStoredEyeOffset() {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const rawValue = localStorage.getItem('thirdpersoncontroller-eye-offset');
      if (!rawValue) {
        return null;
      }

      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      const next = {
        x: Number.isFinite(Number(parsed.x)) ? Number(parsed.x) : 0,
        y: Number.isFinite(Number(parsed.y)) ? Number(parsed.y) : 1.6,
        z: Number.isFinite(Number(parsed.z)) ? Number(parsed.z) : 0,
      };
      return { x: next.x, y: next.y, z: next.z };
    } catch (error) {
      return null;
    }
  }

  normalizePlayerName(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Player';
  }

  normalizePlayerToken(value) {
    const token = String(value ?? '').trim();
    return token.length > 0 ? token.slice(0, 128) : '';
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  setPlayerName(name) {
    this.playerName = this.normalizePlayerName(name);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thirdpersoncontroller-player-name', this.playerName);
    }
    const input = this.overlay?.querySelector?.('#player-name');
    if (input) {
      input.value = this.playerName;
    }
    this.onPlayerNameChange(this.playerName);
    return this.playerName;
  }

  setPlayerToken(token) {
    this.playerToken = this.normalizePlayerToken(token);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thirdpersoncontroller-player-guid', this.playerToken || '');
    }
    const input = this.overlay?.querySelector?.('#player-token');
    if (input) {
      input.value = this.playerToken;
    }
    this.onPlayerTokenChange(this.playerToken);
    return this.playerToken;
  }

  getPlayerToken() {
    return this.playerToken;
  }

  setEyeOffset(offset = {}) {
    const x = Number.isFinite(offset.x) ? offset.x : 0;
    const y = Number.isFinite(offset.y) ? offset.y : 1.6;
    const z = Number.isFinite(offset.z) ? offset.z : 0;
    this.eyeOffset = { x, y, z };

    const overlayQuery = this.overlay && typeof this.overlay.querySelector === 'function'
      ? this.overlay.querySelector.bind(this.overlay)
      : () => null;
    const xInput = overlayQuery('#eye-offset-x');
    const yInput = overlayQuery('#eye-offset-y');
    const zInput = overlayQuery('#eye-offset-z');
    if (xInput) xInput.value = String(x);
    if (yInput) yInput.value = String(y);
    if (zInput) zInput.value = String(z);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('thirdpersoncontroller-eye-offset', JSON.stringify({ x, y, z }));
    }
    this.onEyeOffsetChange({ ...this.eyeOffset });
  }

  getEyeOffset() {
    return { ...this.eyeOffset };
  }

  /**
   * Sets whether the game menu is open and visible.
   * @param {boolean} isOpen - Open state
   */
  setOpen(isOpen) {
    this.isOpen = Boolean(isOpen);
    if (this.overlay) {
      this.overlay.style.display = this.isOpen ? 'flex' : 'none';
    }

    if (this.isOpen && document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  /**
   * Toggles the open state of the game menu.
   * @returns {boolean} The new open state
   */
  toggle() {
    this.setOpen(!this.isOpen);
    return this.isOpen;
  }
}
