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
      "mass": 70,
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
- `player.maxWalkableSlope` specifies the maximum incline slope (rise over run) the player can walk up (default: `0.2`).

### `gameObjects`

The canonical world objects and scene hierarchy. Valid examples include:

- `light` components
- `primitive` components (`box`, `cube`, `cylinder`, `sphere`, floor-like shapes)
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

Optional distance setting:

- `distance`: maximum interaction distance in meters (default: `2`)

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
      "distance": 4,
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
| `box` | `type`, `size` | `offset`, `physicsCollision`, `position`, `mass`, `gravity`, `kinetic`, `bounciness`, `physicsMaterial`, `restitution` |
| `sphere` | `type` | `radius`, `offset`, `physicsCollision`, `position`, `mass`, `gravity`, `kinetic`, `bounciness`, `physicsMaterial`, `restitution` |
| `mesh` | `type` | `offset`, `physicsCollision`, `position`, `mass`, `gravity`, `kinetic`, `bounciness`, `physicsMaterial`, `restitution` |

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

For dynamic colliders, set `mass` and `kinetic` alongside `bounciness` when you want collision reaction force to be added in the opposite collision direction. For example, a beachball can use `"bounciness": 0.5` so ground contact produces an upward bounce.

## Physics system overview

The runtime physics stack is split across a few small classes that each do one job, and they combine to produce grounded motion, dynamic collisions, and bounce responses.

### `Time`

`src/Time.js` wraps the frame interval in a single helper object. It is intentionally lightweight: the runtime passes a `deltaTime` value (for example, `1 / 60` when a frame is 60 FPS) and the rest of the physics system multiplies forces and impulses by `Time.deltaTime` instead of treating them as if they were full-frame instantaneous events.

This matters because the same force should produce a smaller effect on a fast frame and a larger effect on a slower frame. A value like `gravity = -26` is not interpreted as "apply -26 units instantly"; it is interpreted as "apply a force that results in a velocity change proportional to frame time".

### `Force`

`src/Force.js` is the force/impulse helper layer. It converts user-supplied vectors into `THREE.Vector3`s and then routes them through `Rigidbody.addImpulse`.

The important calculation is `calculateCollisionImpulse`, which:

- reads the velocity of the two bodies relative to the collision normal,
- computes the closing speed by projecting that relative velocity onto the normal,
- checks that the bodies are actually moving into each other,
- combines mass and restitution to estimate the impulse needed to reverse the contact velocity,
- scales the result by `Time.deltaTime` so collision response matches the current frame length.

This prevents very large or tiny jumps in response from being caused solely by frame-rate differences.

### `Rigidbody`

`src/Rigidbody.js` is the runtime core. A `Rigidbody` owns:

- `mass`, which determines how strongly acceleration changes velocity,
- `velocity`, which is the actual linear motion vector,
- `accumulatedForce`, which stores pending force contributions,
- `gravity`, which is applied as a force each frame when the body is not grounded,
- `linearDamping`, which reduces velocity over time,
- `bounciness`, which creates opposite-direction reaction when a body hits a surface,
- `kinetic`, which tells the object to actively resolve overlap and push itself apart from other colliders.

The main update loop is `integrate(position, delta, context)`. It does the following in order:

1. Determines whether the body is grounded by checking both world colliders and recent collision data.
2. Adds gravity as a force when it is not grounded.
3. Converts accumulated force into acceleration: `a = F / mass`.
4. Multiplies acceleration by `Time.deltaTime` to produce a reliable per-frame velocity change.
5. Applies linear damping to avoid endless acceleration.
6. Advances the rigidbody's position by velocity * delta.
7. Resolves overlap against all world colliders.
8. Re-checks ground height and clamps the body back onto the surface when needed.
9. Clears pending forces for the next frame.

This is why dynamic motion is smooth and remains consistent whether the game runs at 30 FPS or 120 FPS.

### Collision resolution and bounce logic

`resolveColliderCollisions` is the core overlap solver. It:

- builds world-space bounds for the moving body and each colliding object,
- checks whether the AABBs intersect,
- computes overlap on all three axes,
- chooses the smallest overlap axis to separate the bodies with the least amount of correction,
- pushes the moving body out along that axis,
- zeroes the component of velocity along the collision normal,
- applies friction to tangential motion,
- triggers `applyBouncinessReaction` when the contact is moving into the surface.

The default non-kinetic case still uses a conservative axis-based separation, but `kinetic` bodies are treated more aggressively and are pushed out using the smallest penetration axis to prevent the body from staying intersecting a wall or floor.

### Bounce response

`applyBouncinessReaction(normal, incomingNormalVelocity)` is what makes the beachball jump upward after hitting the ground. It is intentionally gated so it only fires when:

- the collision normal is valid,
- the body has a positive `bounciness`,
- the body is moving into the surface (`incomingNormalVelocity < 0` for a downward hit),
- the collision is strong enough to matter.

The reaction is computed from a combination of:

- `bounciness * mass`, which ensures the bounce strength is proportional to the object's weight,
- the impact speed from the incoming normal velocity,
- the restitution value of the material.

The result is added directly to the body's velocity in the opposite direction of the collision normal. For a beachball with `bounciness: 0.5`, the contact with the ground adds upward force that sends the ball back into the air instead of leaving it stuck on the floor.

### Ground detection

The ground test path uses `getGroundHeightAt` and `isGroundedAgainstWorld`. These methods sample the height of the nearest solid collider and decide whether a moving rigidbody should be considered standing on a surface.

Together they do two checks:

- `getGroundHeightAt` chooses the highest valid support surface near the body,
- `isGroundedAgainstWorld` verifies the body is actually close enough to that surface and moving downward or settled enough to be counted as grounded.

This stops the controller from floating, jittering, or simply "rolling" across the floor with no real interaction.

## Controller physics settings

Use the `controller.physics` block to tune behavior without code changes:

- `enableCollision`: enable or disable rigidbody collision checks.
- `gravityY`: gravity acceleration on Y axis.
- `mass`: player rigidbody mass in kilograms; default is 70 for a typical adult human.
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
      "mass": 70,
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
