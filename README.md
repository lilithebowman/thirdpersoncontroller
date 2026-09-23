# Third Person Controller Demo

This project is a minimal 3D web prototype using Three.js and Vite. It includes a simple cube character that can be moved in a third-person camera setup, a default floor, and a scene manifest system for loading OBJ models into the world.

## Features
- Third-person character controller using WASD / arrow keys
- Sprint support with Shift
- Ground plane and lighting setup
- Cube placeholder character for easy replacement later
- JSON scene manifest for OBJ/MTL model loading
- World-space placement of environment props with transforms

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL in a browser.

## Project structure

- `src/main.js` - core Three.js scene setup and controller logic
- `public/scene-manifest.json` - object placement and asset manifest
- `SCENESETUP.md` - full guide for configuring the scene manifest
- `public/models/` - sample OBJ/MTL assets and textures
- `copilot-instructions.md` - guidance for future AI-assisted editing
- `project-plan.md` - short implementation roadmap

## Scene manifest format

For full setup instructions, schema details, and collider examples, see:

- [`SCENESETUP.md`](SCENESETUP.md)

```json
{
  "scene": {
    "background": "#8ecae6",
    "fog": "#8ecae6"
  },
  "objects": [
    {
      "type": "obj",
      "objPath": "/models/example.obj",
      "mtlPath": "/models/example.mtl",
      "position": [0, 0, 0],
      "rotation": [0, 0, 0],
      "scale": [1, 1, 1]
    }
  ]
}
```

The loader will read the OBJ and optional MTL file, apply placement transforms, and add the result to the scene.

## Notes
This is intentionally a simple prototype. Replace the cube character with a rigged model later, and expand the scene manifest to include more complex props, triggers, and gameplay objects.
