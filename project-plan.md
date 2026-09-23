# Project Plan

## Goal
Build a browser demo with a third-person controller and a manifest-driven level loader using Three.js and Vite.

## Milestones
1. Scaffold the Vite app and install dependencies.
2. Create the base 3D scene with a floor, lighting, and a cube character.
3. Implement third-person movement and camera follow behavior.
4. Add a JSON scene manifest and OBJ loading support for models, materials, and textures.
5. Validate the build and document usage for future iteration.

## Implementation notes
- Use a simple cube for the player avatar until a proper humanoid model is available.
- Use a JSON file in the public folder as the source of truth for world objects.
- Keep the scene ready for future upgrades such as animation, physics, and navigation.

## Future enhancements
- Replace the box with a rigged character model.
- Add state-based animation and camera smoothing.
- Expand the manifest with enemy objects, triggers, and interactive props.
- Add collision and ground detection for a more game-like movement system.
