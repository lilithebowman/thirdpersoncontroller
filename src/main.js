import './style.css';
import { ThirdPersonControllerApp } from './ThirdPersonControllerApp.js';

const app = new ThirdPersonControllerApp({
  mountSelector: '#app',
  manifestPath: '/scene-manifest.json',
});

app.init().catch((error) => {
  console.error('Failed to initialize third-person controller app:', error);
});
