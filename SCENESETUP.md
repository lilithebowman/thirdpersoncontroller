# Scene Manifest Setup

This document explains how to configure `public/scene-manifest.json` for the third-person controller demo.

## File location

- `public/scene-manifest.json`

## Top-level structure

```json
{
  "debug": {
    "enabled": true
  },
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
  "objects": []
}
```

## Required sections

### `playerSpawns`

- Must be an array of spawn positions.
- Each entry must be `[x, y, z]`.
- If no valid spawn exists, the player will not spawn.

Example:

```json
"playerSpawns": [[0, 0, 0], [4, 0, -2]]
```

### `objects`

- Defines world objects, lights, and models.
- Supported object types include:
  - `light`
  - `floor`
  - `box` / `cube`
  - `cylinder`
  - `obj`

### OBJ materials and textures

- For `obj` entries, use `mtlPath` when the model has materials.
- Texture maps should be linked inside the `.mtl` file (`map_Kd`, etc.).
- Do not add `texturePath` in the manifest for OBJ assets; one global texture override breaks multi-material OBJ meshes.

## Collider setup

Objects can include a `collider` block for physics collision.

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

Field notes:

- `type` must be one of `box`, `sphere`, `mesh`.
- `position` overrides the manifest item position for collider placement.
- `physicsCollision` defaults to `true` if omitted.

### Box collider

```json
"collider": {
  "type": "box",
  "size": [1.5, 1.0, 2.0],
  "offset": [0, 0.5, 0],
  "physicsCollision": true
}
```

### Sphere collider

```json
"collider": {
  "type": "sphere",
  "radius": 0.75,
  "offset": [0, 0.75, 0],
  "physicsCollision": true
}
```

### Mesh collider

```json
"collider": {
  "type": "mesh",
  "offset": [0, 0, 0],
  "physicsCollision": true
}
```

Notes for mesh collider:

- Intended for `obj` entries where a model mesh is loaded from `objPath`.
- Bounds are generated from the loaded mesh geometry in world space.
- Use `offset` to shift the collision volume when needed.
- If no mesh is available, the collider cannot be created.

Notes:

- `physicsCollision` controls whether that collider participates in rigidbody collision resolution.
- For floor objects, collider size should represent world-space thickness and area.

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
  "objects": [
    {
      "type": "floor",
      "name": "Ground",
      "size": [120, 120],
      "position": [0, 0, 0],
      "rotation": [-90, 0, 0],
      "collider": {
        "type": "box",
        "size": [120, 0.2, 120],
        "offset": [0, 0.1, 0],
        "physicsCollision": true
      }
    },
    {
      "type": "obj",
      "name": "Rock Cluster",
      "objPath": "/models/rock.obj",
      "mtlPath": "/models/rock.mtl",
      "position": [4, 0, -5],
      "scale": [1.4, 1.4, 1.4],
      "collider": {
        "type": "mesh",
        "physicsCollision": true
      }
    }
  ]
}
```