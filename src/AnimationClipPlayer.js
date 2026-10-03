/**
 * AnimationClipPlayer.js
 *
 * Class: AnimationClipPlayer
 * Purpose: Loads a lightweight `.anim` timeline data file and applies its keyframed
 *          property values to a target Three.js object over time.
 *          This class is intentionally narrow: it knows how to fetch, evaluate, and
 *          drive a single animation clip without handling scene orchestration.
 */

export class AnimationClipPlayer {
  constructor({
    target = null,
    animationPath = '',
    resolveScenePath = null,
    name = 'animation',
    loop = true,
    speed = 1,
    playOnAwake = false,
  } = {}) {
    this.target = target;
    this.animationPath = animationPath;
    this.resolveScenePath = resolveScenePath;
    this.name = name;
    this.loop = loop !== false;
    this.speed = Number.isFinite(speed) && speed > 0 ? speed : 1;
    this.playOnAwake = playOnAwake === true;
    this.tracks = [];
    this.duration = 0;
    this.time = 0;
    this.isPlaying = false;
  }

  normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      if (lowered === 'true') return true;
      if (lowered === 'false') return false;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return fallback;
  }

  async loadFromPath(animationPath = this.animationPath) {
    if (!animationPath) {
      return null;
    }

    const resolvedPath = typeof this.resolveScenePath === 'function'
      ? this.resolveScenePath(animationPath)
      : animationPath;

    const response = await fetch(resolvedPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch animation ${resolvedPath}: ${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    return this.loadData(payload);
  }

  loadData(payload = {}) {
    this.name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : this.name;
    this.loop = this.normalizeBoolean(payload.loop, this.loop);
    this.speed = Number.isFinite(payload.speed) && payload.speed > 0 ? Number(payload.speed) : this.speed;
    this.playOnAwake = this.normalizeBoolean(payload.playOnAwake, this.playOnAwake);
    this.tracks = Array.isArray(payload.tracks) ? payload.tracks.map((track) => ({
      gameObjectId: track?.gameObjectId ?? null,
      propertyPath: typeof track?.propertyPath === 'string' ? track.propertyPath : 'transform.position.x',
      keyframes: Array.isArray(track?.keyframes) ? track.keyframes
        .map((keyframe) => ({
          time: Number.isFinite(keyframe?.time) ? Number(keyframe.time) : 0,
          value: Number.isFinite(keyframe?.value) ? Number(keyframe.value) : keyframe?.value ?? 0,
        }))
        .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
        : [],
    })) : [];

    const maxKeyframeTime = this.tracks.reduce((max, track) => {
      const trackMax = track.keyframes.reduce((candidate, frame) => Math.max(candidate, Number(frame.time ?? 0)), 0);
      return Math.max(max, trackMax);
    }, 0);
    this.duration = Number.isFinite(payload.duration) && payload.duration > 0
      ? Number(payload.duration)
      : maxKeyframeTime;

    if (this.playOnAwake) {
      this.play();
    }
    return this;
  }

  play() {
    this.isPlaying = true;
    if (!Number.isFinite(this.time) || this.time < 0) {
      this.time = 0;
    }
    if (this.duration > 0 && this.time >= this.duration) {
      this.time = 0;
    }
    this.applyCurrentState();
  }

  pause() {
    this.isPlaying = false;
  }

  setTarget(target) {
    this.target = target;
    this.applyCurrentState();
  }

  update(delta) {
    if (!this.isPlaying || !this.target) {
      return;
    }

    const deltaSeconds = Number.isFinite(delta) ? delta : 0;
    this.time += deltaSeconds * this.speed;

    if (this.duration > 0 && this.time >= this.duration) {
      if (this.loop) {
        this.time = this.time % this.duration;
      } else {
        this.time = this.duration;
        this.isPlaying = false;
      }
    }

    this.applyCurrentState();
  }

  getInterpolatedValue(track, timeValue) {
    const frames = Array.isArray(track?.keyframes) ? track.keyframes.slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0)) : [];
    if (!frames.length) {
      return 0;
    }
    const safeTime = Number.isFinite(timeValue) ? Number(timeValue) : 0;
    if (safeTime <= (frames[0].time ?? 0)) {
      return frames[0].value ?? 0;
    }
    if (safeTime >= (frames[frames.length - 1].time ?? 0)) {
      return frames[frames.length - 1].value ?? 0;
    }

    for (let index = 0; index < frames.length - 1; index += 1) {
      const currentFrame = frames[index];
      const nextFrame = frames[index + 1];
      const frameStart = Number(currentFrame.time ?? 0);
      const frameEnd = Number(nextFrame.time ?? 0);
      if (safeTime >= frameStart && safeTime <= frameEnd) {
        const span = frameEnd - frameStart;
        const t = span > 0 ? (safeTime - frameStart) / span : 0;
        return (currentFrame.value ?? 0) + (((nextFrame.value ?? 0) - (currentFrame.value ?? 0)) * t);
      }
    }

    return frames[frames.length - 1].value ?? 0;
  }

  applyCurrentState() {
    if (!this.target || !Array.isArray(this.tracks)) {
      return;
    }

    for (const track of this.tracks) {
      const propertyPath = typeof track?.propertyPath === 'string' ? track.propertyPath : null;
      if (!propertyPath) {
        continue;
      }

      const value = this.getInterpolatedValue(track, this.time);
      const pathSegments = propertyPath.split('.');
      if (pathSegments.length < 2) {
        continue;
      }

      const rootKey = pathSegments[0];
      const propertyKey = pathSegments[1];
      const axis = pathSegments[2];

      if (rootKey !== 'transform') {
        continue;
      }

      if (!this.target[propertyKey]) {
        continue;
      }

      if (axis && typeof this.target[propertyKey][axis] === 'number') {
        this.target[propertyKey][axis] = value;
        continue;
      }

      if (typeof this.target[propertyKey] === 'number') {
        this.target[propertyKey] = value;
      }
    }
  }
}
