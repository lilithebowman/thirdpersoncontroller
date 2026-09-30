# Testing and Quality Assurance

This document outlines the testing standards, validation procedures, and quality assurance workflows for the Third-Person Controller and Scene Editor project.

## Overview
To maintain high stability across both the gameplay runtime (`ThirdPersonControllerApp`) and the Unity-style scene editor (`SceneEditorApp`), all changes should adhere to automated and manual verification standards.

## Automated Testing

- **Test Runner**: Node.js built-in test runner (`node --test`).
- **Test Location**: Unit tests are placed alongside source files with `.test.js` extensions (e.g., `src/sceneManifest.test.js`).
- **Running Tests**:
  ```bash
  npm test
  ```

### Adding New Tests
When introducing new utility classes, manifest transformation rules, or physics helpers, always add a corresponding unit test in `src/`.

## Production Build Validation

Before merging or claiming a feature complete, verify that the Vite production bundle builds successfully without errors:
```bash
npm run build
```

## Browser Verification

1. Start the local development server:
   ```bash
   npm run dev
   ```
2. Open the local URL in a browser:
   - **Gameplay Route**: `http://localhost:5173/` (or root)
   - **Editor Route**: `http://localhost:5173/editor`
3. Verify that:
   - Player movement, camera follow, and lighting initialize correctly in the gameplay view.
   - Hierarchy, Scene viewport, and Inspector panels load correctly in the editor view.
