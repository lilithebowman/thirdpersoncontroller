# Changelog

## 2026-09-28

### Added
- Drafted a separate editor route for scene editing, with a Unity-style layout split into Hierarchy, Scene, and Inspector panels.
- Defined a more robust GameObject-based scene manifest shape to support nested objects, reusable components, and script components.
- Reserved `/editor` as the non-game route so the gameplay view and scene editor can live side by side.
- Added a path for Unity scene import support so external scene data can be converted into the project manifest format.

### Changed
- Kept the manifest compatible with the existing gameplay route by preserving the legacy object-based scene representation.
- Standardized scene data around explicit GameObject transforms and component lists instead of a flat object-only structure.

### Notes
- The editor is intended to support direct manipulation of scene objects and export the result back into `public/scene-manifest.json`.
- Unity import support is best treated as an import bridge, not a full Unity runtime clone.
