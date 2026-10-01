# Third Person Controller Demo

This project is a browser-based 3D demo and editor for a third-person controller scene. It includes a gameplay app, a scene editor, and a manifest-driven world system built with Three.js and Vite.

## What the app does

- Renders a playable third-person controller scene at `/`
- Provides a scene editor at `/editor`
- Lets you create and manipulate `gameObjects` with transforms and components
- Supports lights, primitives, and OBJ/GLB/FBX model instances in the scene graph
- Exports or downloads JSON that matches the runtime manifest contract
- Loads a scene from `public/scene-manifest.json`

## Features

- Third-person character controller using WASD / arrow keys
- Sprinting and jumping support
- Cinematic / orbit-style editor viewport for scene layout
- Hierarchy and inspector editing for scene objects
- Real `gameObjects` + component system, not flat legacy top-level objects
- Primitive creation (`box`, `cube`, `cylinder`, floor-like shapes)
- OBJ/MTL, GLB, and FBX asset loading and placement from manifest data
- Copy/download scene JSON output for re-use in the runtime app

## Run locally

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:5173/` for the gameplay demo
- `http://localhost:5173/editor` for the editor

## Project structure

- `src/main.js` - app bootstrap and route selection
- `src/ThirdPersonControllerApp.js` - runtime gameplay app and world loader
- `src/SceneEditorApp.js` - scene editor, hierarchy, inspector, and export logic
- `src/sceneManifest.js` - normalization and GameObject/legacy conversion utilities
- `public/scene-manifest.json` - default scene file used by the runtime
- `SCENESETUP.md` - detailed scene manifest guidance and examples
- `public/models/` - sample OBJ/MTL and environment assets
- `copilot-instructions.md` - guidance for future AI-assisted changes
- `project-plan.md` - roadmap notes

## Scene manifest contract

The app uses a GameObject-first scene model. The authoritative scene data lives under `gameObjects`, and each object is a hierarchy node with a `transform` and a list of `components`.

This is the shape the runtime expects:

```json
{
  "version": 2,
  "gameObjects": [
    {
      "id": "primitive-123",
      "name": "Primitive Model",
      "active": true,
      "tag": "Untagged",
      "layer": 0,
      "static": false,
      "transform": {
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "components": [
        {
          "type": "primitive",
          "primitiveType": "box",
          "size": [1, 1, 1],
          "color": "#8ecae6"
        }
      ],
      "children": []
    },
    {
      "id": "portal-1",
      "name": "Portal",
      "active": true,
      "tag": "Untagged",
      "layer": 0,
      "static": false,
      "transform": {
        "position": [0, 5, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "components": [
        {
          "type": "model",
          "modelType": "glb",
          "glbPath": "/models/SocialWorldPortal.glb",
          "materialRenderType": "cutout"
        }
      ],
      "children": []
    }
  ]
}
```

### Important rules

- `gameObjects` is the source of truth
- Each object should be a `GameObject` with a transform and components
- Primitive items are created as a `GameObject` whose component is a `primitive`
- Legacy flat `objects` entries are kept only for backward compatibility and should not be treated as the main export format
- `modelType: "glb"` and `modelType: "fbx"` are supported alongside `modelType: "obj"` for runtime/editor loading
- The editor Copy/Download actions should write `gameObjects`-based JSON

For full setup and collider examples, see [`SCENESETUP.md`](SCENESETUP.md).

## Editor workflow

1. Open `/editor`
2. Add a primitive, OBJ, GLB, or FBX model from the toolbar
3. Edit its transform and component values in the inspector
4. Use Copy JSON or Download to export the current scene
5. Reload the gameplay route or replace `public/scene-manifest.json` with the exported manifest

## Notes

This project is intentionally a lightweight prototype for scene authoring and runtime composition. The current architecture favors explicit scene data, editor-authored GameObjects, and reusable manifest-driven world setup over ad hoc hardcoded scene placement.
