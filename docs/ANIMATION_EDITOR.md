# Animation Editor

The editor now includes an Animation Editor mode for creating lightweight `.anim` timeline files that capture transforms and other editable GameObject properties over time.

## Workflow

1. Open the editor at `/editor`.
2. Click the `Animation Editor` toolbar button to switch out of scene-authoring mode.
3. Pick a GameObject from the dropdown, choose a property such as `transform.position.x`, and set a time/value pair.
4. Click `Add Keyframe` to store the change on the timeline.
5. Export the resulting animation with `Export .anim` to produce a file named like `hero-idle.anim`.
6. Import an existing animation file with `Import .anim` or drop it into a scene JSON as a GameObject component reference.

## .anim file structure

The animation export is a JSON document with a simple track-based format:

```json
{
  "version": 2,
  "name": "hero-idle",
  "duration": 1.5,
  "tracks": [
    {
      "gameObjectId": "hero-001",
      "propertyPath": "transform.position.x",
      "keyframes": [
        { "time": 0, "value": 0 },
        { "time": 0.5, "value": 1.2 },
        { "time": 1.5, "value": 0 }
      ]
    }
  ]
}
```

## Scene component usage

Animation files are supported as a GameObject component:

```json
{
  "id": "hero-001",
  "name": "Hero",
  "transform": {
    "position": [0, 0, 0],
    "rotation": [0, 0, 0],
    "scale": [1, 1, 1]
  },
  "components": [
    {
      "type": "animation",
      "animationPath": "/animations/hero-idle.anim",
      "animationName": "hero-idle",
      "loop": true,
      "speed": 1,
      "enabled": true
    }
  ],
  "children": []
}
```

This component is intentionally lightweight and acts as a manifest reference to a timeline asset. It is accepted by the normalizer and exported as part of the scene JSON contract.

## Notes

- The editor supports keyframe entry for standard transform properties and a few basic GameObject metadata properties.
- The animation timeline is intentionally lightweight and easy to extend for richer sequencer features later.
- Legacy `objects` entries are still normalized for backward compatibility, but `gameObjects` remains the canonical export format.
