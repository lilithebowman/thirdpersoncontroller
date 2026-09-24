/**
 * main.js
 *
 * Bootstraps the third-person controller app and reports initialization
 * failures to the debug overlay and console.
 */

import './style.css';
import { ThirdPersonControllerApp } from './ThirdPersonControllerApp.js';

const app = new ThirdPersonControllerApp({
  mountSelector: '#app',
  manifestPath: '/scene-manifest.json',
});

app.init().catch((error) => {
  if (app.debugDisplay && typeof app.debugDisplay.LogError === 'function') {
    app.debugDisplay.LogError(`Initialization failed: ${error?.message ?? error}`);
  }
  console.error('Failed to initialize third-person controller app:', error);
});
