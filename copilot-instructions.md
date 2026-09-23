# Copilot Instructions

## Project purpose
This project is a browser-based 3D prototype for a third-person character controller in Three.js. It is intentionally lightweight and built for rapid iteration while a future rigged character replaces the current cube placeholder.

## Coding standards
- Use modern JavaScript modules and keep logic organized by responsibility.
- Prefer simple, readable code over over-engineering.
- Keep the demo stable in a browser without framework overhead.
- Maintain a clear separation between scene setup, input handling, and manifest-driven asset loading.

## Required behavior
- The scene should include a floor, lighting, and a simple third-person camera.
- The player should be a simple cube character for now.
- Movement should use WASD or arrow keys, with Shift enabling sprinting.
- The project should support OBJ models loaded from a JSON scene manifest.
- Manifest-driven models should be able to specify position, rotation, scale, MTL files, textures, and world placement.

## Asset guidance
- Keep OBJ/MTL assets in the public folder so they can be served by Vite.
- Use relative or root-relative paths in the manifest.
- Favor small placeholder meshes for early iteration; replace them later with higher-detail models.

## Validation
- Before claiming the project is complete, run the build command and confirm it succeeds.
- If scene or loader changes are made, verify that the app still loads in a browser and the manifest is respected.
