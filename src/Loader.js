/**
 * Loader.js
 *
 * Class: Loader
 * Purpose: Manages loading overlay displays, supporting various loader styles
 *          (spinner, pulse, progress bar) and messages during app asset loading.
 */

export class Loader {
  /**
   * Creates a Loader instance.
   * @param {Object} options - Configuration options
   * @param {HTMLElement} [options.mountElement=document.body] - Parent DOM element for mounting loader
   * @param {string} [options.message='Loading assets...'] - Initial loading message
   * @param {string} [options.type='spinner'] - Loader visual style ('spinner', 'pulse', 'bar')
   * @param {boolean} [options.visible=false] - Initial visibility state
   */
  constructor({ mountElement = document.body, message = 'Loading assets...', type = 'spinner', visible = false } = {}) {
    this.mountElement = mountElement || document.body;
    this.message = message;
    this.type = type;
    this.isOpen = false;
    this.progress = 0;

    this.overlay = this.createLoaderDOM();
    this.setVisible(visible);
  }

  /**
   * Creates the loader DOM structure.
   * @returns {HTMLElement} The created loader overlay element
   */
  createLoaderDOM() {
    const overlay = document.createElement('div');
    overlay.className = 'loader-overlay';
    overlay.style.display = 'none';

    const modal = document.createElement('div');
    modal.className = 'loader-modal';

    const visual = document.createElement('div');
    visual.className = `loader-visual loader-visual-${this.type}`;
    visual.innerHTML = this.renderVisualHTML(this.type);

    const messageEl = document.createElement('p');
    messageEl.className = 'loader-message';
    messageEl.textContent = this.message;

    modal.appendChild(visual);
    modal.appendChild(messageEl);
    overlay.appendChild(modal);

    this.mountElement.appendChild(overlay);
    this.visualEl = visual;
    this.messageEl = messageEl;
    return overlay;
  }

  /**
   * Generates inner HTML for the loader visual based on type.
   * @param {string} type - Loader type
   * @returns {string} HTML string
   */
  renderVisualHTML(type) {
    if (type === 'pulse') {
      return '<div class="loader-pulse-dot"></div><div class="loader-pulse-dot"></div><div class="loader-pulse-dot"></div>';
    }
    if (type === 'bar') {
      return '<div class="loader-bar-track"><div class="loader-bar-fill" style="width: 0%"></div></div>';
    }
    // Default spinner
    return '<div class="loader-spinner-circle"></div>';
  }

  /**
   * Sets whether the loader is visible.
   * @param {boolean} visible - Visibility state
   */
  setVisible(visible) {
    this.isOpen = Boolean(visible);
    if (this.overlay) {
      this.overlay.style.display = this.isOpen ? 'flex' : 'none';
    }
  }

  /**
   * Shows the loader with an optional message.
   * @param {string} [message] - Optional message to display
   */
  show(message) {
    if (message !== undefined) {
      this.setMessage(message);
    }
    this.setVisible(true);
  }

  /**
   * Hides the loader.
   */
  hide() {
    this.setVisible(false);
  }

  /**
   * Updates the loading message text.
   * @param {string} message - New message text
   */
  setMessage(message) {
    this.message = String(message);
    if (this.messageEl) {
      this.messageEl.textContent = this.message;
    }
  }

  /**
   * Sets the loader visual style/type.
   * @param {string} type - Loader type ('spinner', 'pulse', 'bar')
   */
  setType(type) {
    this.type = type;
    if (this.visualEl) {
      this.visualEl.className = `loader-visual loader-visual-${this.type}`;
      this.visualEl.innerHTML = this.renderVisualHTML(this.type);
    }
  }

  /**
   * Sets progress value (0 to 1 or 0 to 100) for bar loader.
   * @param {number} value - Progress value
   */
  setProgress(value) {
    this.progress = Math.max(0, Math.min(100, value <= 1 ? value * 100 : value));
    const fill = this.overlay?.querySelector('.loader-bar-fill');
    if (fill) {
      fill.style.width = `${this.progress}%`;
    }
  }
}
