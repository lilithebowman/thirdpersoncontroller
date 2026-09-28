# Editor Plan

## Goal
Add a separate scene editor route that behaves like a lightweight Unity-style editor, with a hierarchy panel, a scene viewport, and an inspector panel, while keeping the current game route intact.

## Plan
1. Add a route switch in `src/main.js` so `/editor` loads the editor app and the default route still loads the game.
2. Introduce a shared scene-manifest helper that can normalize both the current flat object format and a new GameObject/component format.
3. Build a scene editor shell with three panels: Hierarchy on the left, Scene in the middle, Inspector on the right.
4. Support selecting GameObjects, editing transforms and component data, and exporting the manifest back to JSON.
5. Add a simple Unity scene import bridge that can translate a Unity-like JSON structure into the editor manifest.
6. Update the sample `public/scene-manifest.json` to use the new GameObject/component structure while preserving legacy compatibility output.

## Execution notes
- Keep the game route functional while the editor grows.
- Prefer additive changes over rewrites so the existing controller code remains stable.
- Validate with a production build after the editor route and manifest helpers are in place.
