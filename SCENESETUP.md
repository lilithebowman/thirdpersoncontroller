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

## Collider setup

Objects can include a `collider` block for physics collision.

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
    }
  ]
}
```