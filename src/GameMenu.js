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
  constructor({ mountElement, onRespawn, onLog, onThresholdChange } = {}) {
    if (!mountElement) {
      throw new Error('GameMenu requires a mountElement.');
    }

    this.mountElement = mountElement;
    this.onRespawn = typeof onRespawn === 'function' ? onRespawn : () => {};
    this.onLog = typeof onLog === 'function' ? onLog : () => {};
    this.onThresholdChange = typeof onThresholdChange === 'function' ? onThresholdChange : () => {};
    this.isOpen = false;

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
        <label for="mic-threshold" style="display: block; font-size: 14px; margin-bottom: 4px;">Mic Threshold: <span id="threshold-display">0.05</span></label>
        <input type="range" id="mic-threshold" min="0.005" max="0.5" step="0.005" value="0.05" style="width: 100%; cursor: pointer;">
      </div>
      <button type="button" data-action="respawn">Respawn</button>
      <button type="button" data-action="fullscreen">Toggle Fullscreen</button>
      <button type="button" data-action="resume">Resume Game</button>
    `;

    const thresholdInput = typeof modal.querySelector === 'function' ? modal.querySelector('#mic-threshold') : null;
    const thresholdDisplay = typeof modal.querySelector === 'function' ? modal.querySelector('#threshold-display') : null;
    if (thresholdInput) {
      thresholdInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (thresholdDisplay) {
          thresholdDisplay.textContent = val.toFixed(3);
        }
        this.onThresholdChange(val);
      });
    }

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
