# Copilot Instructions

## Project purpose
This project is a browser-based 3D prototype for a third-person character controller in Three.js. It is intentionally lightweight and built fot extendability. As such, documentation and proper testing procedures shall be followed to ensure code quality and maintainability.
  

## Coding standards & Architecture (SOLID & Atomic Design)
- Use modern JavaScript modules and keep logic organized strictly by responsibility.
- Apply **SOLID Principles**:
  - **Single Responsibility Principle (SRP)**: Each class must have one clear, focused job and minimal public API.
  - **Open/Closed Principle (OCP)**: Classes should be open for extension (e.g. via modular components and inheritance like `Collider`) but closed for modification.
  - **Liskov Substitution Principle (LSP)**: Subclasses (e.g. `BoxCollider`, `SphereCollider`, `MeshCollider`) must be fully substitutable for their base class (`Collider`).
  - **Interface Segregation & Dependency Inversion (ISP/DIP)**: Depend on abstractions and callbacks rather than hardcoded global dependencies.
- Keep classes concise: avoid bloated "god" classes and split behavior into focused modules (e.g., separating `CameraController`, `PlayerCharacter`, `SceneLoader`, `GameMenu`, `Animator`, and `Rigidbody`).
- Clearly document each class with a short purpose statement, inheritance/SOLID notes, and key public methods.
- Maintain a single source of truth for important gameplay/config values and avoid duplicated or competing settings.
- Keep code DRY: centralize shared logic into utility classes and avoid copy-pasting behavior across modules.
- Prefer simple, readable code over over-engineering.
- Keep the demo stable in a browser without framework overhead.
- Maintain a clear separation between scene setup, input handling, physics, and manifest-driven asset loading.

## Required behavior
- The scene should include a floor, lighting, and a simple third-person camera.
- The player should be a simple cube or rigged character model.
- Movement should use WASD or arrow keys, with Shift enabling sprinting and Space enabling jumping.
- The project should support OBJ models and FBX character rigs loaded from a JSON scene manifest.
- Manifest-driven models should be able to specify position, rotation, scale, MTL files, colliders, and world placement.

## Asset guidance
- Keep OBJ/MTL/FBX assets in the public folder so they can be served by Vite.
- Use relative or root-relative paths in the manifest.
- Favor small placeholder meshes for early iteration; replace them later with higher-detail models.

## Validation & Automated Testing
- **Automated Tests**: Every new module or utility must include a corresponding unit test file (`*.test.js`) executed via Node.js test runner (`npm test`).
- Before claiming the project is complete, run the build command (`npm run build`) and test suite (`npm test`) and confirm both succeed.
- If scene or loader changes are made, verify that the app still loads in a browser and the manifest is respected.

## Documentation expectations for JavaScript code
- FBX, OBJ, animation-retargeting, skeleton-mapping, root-motion, physics collision resolution, and manifest-loading code must be documented at a level where a developer unfamiliar with the implementation can safely modify it.
- Validation and rejection logic should explain the conditions being checked and the reason those checks exist.
- Fallback behavior should always be documented.
- Runtime update loops should clearly explain how state transitions and blending are calculated.
