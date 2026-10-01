# Copilot Instructions

## Project purpose
This project is a browser-based 3D scene editor and runtime demo built with Three.js and Vite. It includes a playable third-person controller app at `/` and a scene editor at `/editor` for authoring `gameObjects`, primitive meshes, lights, and asset instances.

The manifest architecture is intentionally GameObject-first. The editor and runtime rely on `gameObjects` as the canonical scene data model. Legacy flat `objects` entries remain only for backward compatibility and must never be treated as the authoritative export format.

## Architecture and coding standards
- Use modern JavaScript modules and keep logic organized strictly by responsibility.
- Apply **SOLID Principles**:
  - **Single Responsibility Principle (SRP)**: each class must have one clear, focused job and a minimal public API.
  - **Open/Closed Principle (OCP)**: prefer extension through modular components and callback-based behavior rather than editing core logic in place.
  - **Liskov Substitution Principle (LSP)**: collider classes must remain substitutable for the base `Collider` abstraction.
  - **Interface Segregation & Dependency Inversion (ISP/DIP)**: depend on abstractions and supplied callbacks instead of hardcoded global state.
- Keep classes concise and focused: separate scene editing, runtime gameplay, physics, rendering, and manifest loading concerns.
- Clearly document each class with a short purpose statement and key public methods.
- Maintain a single source of truth for scene configuration and avoid duplicated or conflicting manifest schemas.
- Keep code DRY by centralizing repeated logic in utilities and data loaders.
- Prefer readable code over over-engineering.
- Keep the result stable in a browser without framework overhead.

## Required runtime behavior
- The app should support a playable third-person controller with WASD / arrow key movement and jump support.
- The main app should load a world from `public/scene-manifest.json` and render environment objects, lights, and colliders.
- The editor should allow creating and editing `GameObject` nodes in a hierarchy and inspector.
- A primitive should be represented as a `GameObject` with a `primitive` component, not as a standalone legacy object entry.
- Scene items may include lights, primitive meshes, OBJ models, and skybox data.
- The runtime should support `gameObjects` with `transform` and `components` arrays.
- The project should support OBJ/MTL models and FBX-based character rigs loaded through the manifest.

## Manifest contract
- `gameObjects` is the canonical scene structure.
- Each `GameObject` must include at minimum:
  - `id`
  - `name`
  - `active`
  - `tag`
  - `layer`
  - `static`
  - `transform`
  - `components`
  - `children`
- Primitive objects must be represented as a GameObject with a `primitive` component.
- Example component types include:
  - `primitive`
  - `light`
  - `collider`
  - `model`
  - `scene`
  - `skybox`
- Legacy `objects` entries may be accepted during import and normalization, but they must not be treated as authoritative for new exports.
- Export/copy/download actions must write data in the `gameObjects` model, not a stale legacy flat-object model.

## Asset guidance
- Keep OBJ, MTL, FBX, and texture assets under the public folder so Vite can serve them.
- Use relative or root-relative manifest paths.
- Prefer small placeholder meshes for iteration and refactor to richer assets later.
- Asset metadata generation should remain robust for model imports and sub-mesh variants.

## Validation & automated testing
- Every new module or utility must include a corresponding unit test file (`*.test.js`) executed through Node.js test runner (`npm test`).
- Before claiming the project is complete, run `npm test` and confirm it passes.
- If scene, export, or loader changes are made, verify the manifest still loads correctly in the browser and that the exported JSON matches the runtime contract.
- Reproduce and test regressions involving manifest normalization, export format, and legacy compatibility.

## Documentation expectations for JavaScript code
- New and updated modules must include clear purpose statements, state assumptions, and key behavior notes.
- Validation and rejection logic should explain why checks exist and what failure conditions are guarded against.
- Fallback behavior should always be documented.
- Manifest-loading and export code must clearly document the schema it accepts and the schema it emits.
- Scene editor and runtime logic must document how GameObjects, transforms, and components are converted into rendered scene objects.
- README and setup docs must reflect the actual app behavior; stale "legacy object" documentation is not acceptable.
