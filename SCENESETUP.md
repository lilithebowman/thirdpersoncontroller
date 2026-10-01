# Scene Manifest Setup

This document explains how to configure `public/scene-manifest.json` for the current editor/runtime workflow.

## File location

- `public/scene-manifest.json`

## Core contract

The runtime and editor are built around a GameObject-first manifest. The source-of-truth scene data lives in `gameObjects`, where each entry is a node with a transform and a set of components.

Legacy flat `objects` entries still load for backwards compatibility, but new exports and authoring should use `gameObjects` only.

## Top-level structure

```json
{
  "version": 2,
  "debug": {
    "enabled": true
  },
  "playerSpawns": [[0, 0, 0]],
  "player": {
    "model": {
      "path": "/animations/Action%20Adventure%20Pack/X%20Bot.fbx",
      "walkPath": "/animations/Action%20Adventure%20Pack/running.fbx",
      "idlePath": "/animations/Action%20Adventure%20Pack/idle.fbx",
      "jumpPath": "/animations/Action%20Adventure%20Pack/jumping%20up.fbx",
      "scale": [0.01, 0.01, 0.01],
      "rotation": [0, 0, 0],
      "offset": [0, 0, 0]
    },
    "collider": {
      "size": [0.9, 1.9, 0.9],
      "offset": [0, 0.95, 0],
      "physicsCollision": true
    },
    "eyePosition": [0, 1.6, 0]
  },
  "controller": {
    "jumpImpulse": 8.8,
    "physics": {
      "enableCollision": true,
      "gravityY": -26,
      "mass": 1,
      "linearDamping": 0
    }
  },
  "scene": {
    "background": "#112233",
    "fog": "#000000"
  },
  "gameObjects": []
}
```

## GameObject structure

Each `gameObject` should follow this pattern:

```json
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
}
```

### Primitive rule

A primitive object is not a standalone flat object entry. It must be a `GameObject` with a `primitive` component attached. This is the format the editor creates and the runtime expects.

## Required sections

### `playerSpawns`

- Must be an array of spawn positions.
- Each entry must be `[x, y, z]`.
- If no valid spawn exists, the player will not spawn.

Example:

```json
"playerSpawns": [[0, 0, 0], [4, 0, -2]]
```

### `player`

- `player.model.path` points to the rigged character FBX used for rendering.
- `player.model.idlePath`, `walkPath`, and `jumpPath` may be provided for animation clips.
- `player.model.scale`, `rotation`, and `offset` control how the model is attached to the controller root.
- `player.collider.size` and `player.collider.offset` configure the player physics body dimensions.
- `player.collider.physicsCollision` toggles whether player collider resolves against world colliders.
- `player.eyePosition` specifies the camera eye position offset for first-person rendering.

### `gameObjects`

The canonical world objects and scene hierarchy. Valid examples include:

- `light` components
- `primitive` components (`box`, `cube`, `cylinder`, floor-like shapes)
- `model` components (`obj`, `glb`, or `fbx` assets)
- `collider` components
- nested `children`

### Legacy compatibility

The loader can still normalize legacy top-level `objects` arrays, but those are imported only as compatibility input and are not the preferred authoring format.

## Model assets: OBJ, GLB, and FBX

- For `model` entries with `modelType: "obj"`, use `mtlPath` when the model has materials.
- For `model` entries with `modelType: "glb"`, set `glbPath` to the binary asset location and keep the transform data on the parent GameObject.
- For `model` entries with `modelType: "fbx"`, set `fbxPath` to the animation/rig asset path. The runtime and editor both accept the same manifest contract.
- Texture maps for OBJ assets should be defined inside the `.mtl` file (`map_Kd`, etc.).
- Do not add a global texture override in the manifest for OBJ assets unless you are deliberately overriding a material pipeline for a specific case.

Example GLB GameObject:

```json
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
```

Example FBX GameObject:

```json
{
  "id": "character-1",
  "name": "Character Rig",
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
      "type": "model",
      "modelType": "fbx",
      "fbxPath": "/animations/Action%20Adventure%20Pack/X%20Bot.fbx",
      "materialRenderType": "cutout"
    }
  ],
  "children": []
}
```

## Clickable interactions

Use a `clickable` component on any object to enable hover outlining and click-triggered actions.

Supported actions:

- `teleport`: teleports the player to `target` coordinates
- `link`: navigates to a URL or route such as `/scenes/OtherScene.json`

Example:

```json
{
  "id": "portal-trigger",
  "name": "Portal Trigger",
  "active": true,
  "tag": "Untagged",
  "layer": 0,
  "static": false,
  "transform": {
    "position": [0, 2, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "components": [
    {
      "type": "primitive",
      "primitiveType": "box",
      "size": [1.5, 2, 1.5],
      "color": "#8ecae6"
    },
    {
      "type": "clickable",
      "action": "teleport",
      "target": [12, 3, -8],
      "label": "Teleport to the plaza",
      "outlineColor": "#00f5ff"
    }
  ],
  "children": []
}
```

For a scene-to-scene navigation example:

```json
{
  "type": "clickable",
  "action": "link",
  "url": "/scenes/OtherScene.json",
  "label": "Open the next scene",
  "outlineColor": "#7ef9ff"
}
```

## Collider setup

Objects can include a `collider` component for physics collision.

Supported collider types:

- `box`
- `sphere`
- `mesh`

### Collider quick reference

| Collider type | Required fields | Optional fields |
| --- | --- | --- |
| `box` | `type`, `size` | `offset`, `physicsCollision`, `position` |
| `sphere` | `type` | `radius`, `offset`, `physicsCollision`, `position` |
| `mesh` | `type` | `offset`, `physicsCollision`, `position` |

Example:

```json
{
  "type": "collider",
  "collider": {
    "type": "box",
    "size": [1.5, 1.0, 2.0],
    "offset": [0, 0.5, 0],
    "physicsCollision": true
  }
}
```

## Controller physics settings

Use the `controller.physics` block to tune behavior without code changes:

- `enableCollision`: enable or disable rigidbody collision checks.
- `gravityY`: gravity acceleration on Y axis.
- `mass`: player rigidbody mass.
- `linearDamping`: velocity damping factor.

Use `controller.jumpImpulse` to tune jump height.

## Minimal example

```json
{
  "version": 2,
  "debug": { "enabled": true },
  "playerSpawns": [[0, 0, 0]],
  "controller": {
    "jumpImpulse": 8.8,
    "physics": {
      "enableCollision": true,
      "gravityY": -26,
      "mass": 1,
      "linearDamping": 0
    }
  },
  "scene": {
    "background": "#8ecae6",
    "fog": "#8ecae6"
  },
  "gameObjects": [
    {
      "id": "ground-1",
      "name": "Ground",
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
          "primitiveType": "cube",
          "size": [120, 0.1, 120],
          "color": "#ffffff"
        },
        {
          "type": "collider",
          "collider": {
            "type": "box",
            "size": [120, 0.1, 120],
            "offset": [0, 0, 0],
            "physicsCollision": true
          }
        }
      ],
      "children": []
    }
  ]
}
```
