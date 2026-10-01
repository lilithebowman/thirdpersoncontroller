/**
 * Clickable.js
 *
 * Class: Clickable
 * Purpose: Encapsulates hover highlighting and click-triggered object interactions for
 *          scene objects such as teleport pads and route links.
 * Public API:
 * - normalizeData(data): Normalizes manifest config into a validated interaction payload.
 * - registerObject(object, data): Attaches hover outlines and interaction metadata to a Three.js object.
 * - updateHover(pointer, options): Highlights the nearest clickable object under the pointer.
 * - tryHandleClick(pointer): Executes the action for the closest clicked target.
 * - performAction(data): Executes a normalized teleport or link action.
 */

import * as THREE from 'three';

const DEFAULT_CLICK_DISTANCE = 2;

export class Clickable {
  constructor({ camera = null, raycaster = new THREE.Raycaster(), onTeleport = null } = {}) {
    this.camera = camera;
    this.raycaster = raycaster;
    this.onTeleport = typeof onTeleport === 'function' ? onTeleport : null;
    this.targets = [];
    this.hoveredTarget = null;
  }

  normalizeData(data) {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const actionValue = typeof data.action === 'string' ? data.action : typeof data.onClick === 'string' ? data.onClick : 'teleport';
    const action = String(actionValue).trim().toLowerCase();
    const normalizedAction = action === 'link' ? 'link' : 'teleport';
    const target = Array.isArray(data.target)
      ? data.target.slice()
      : Array.isArray(data.destination)
        ? data.destination.slice()
      : Array.isArray(data.position)
        ? data.position.slice()
        : [0, 0, 0];
    const url = typeof data.url === 'string' && data.url.trim()
      ? data.url.trim()
      : typeof data.href === 'string' && data.href.trim()
        ? data.href.trim()
        : typeof data.link === 'string' && data.link.trim()
          ? data.link.trim()
          : undefined;
    const configuredDistance = Number.isFinite(data.distance)
      ? data.distance
      : Number.isFinite(data.maxDistance)
        ? data.maxDistance
        : Number.isFinite(data.clickDistance)
          ? data.clickDistance
          : DEFAULT_CLICK_DISTANCE;
    const distance = configuredDistance > 0 ? configuredDistance : DEFAULT_CLICK_DISTANCE;

    return {
      action: normalizedAction,
      target,
      url,
      distance,
      label: typeof data.label === 'string' ? data.label : typeof data.hoverText === 'string' ? data.hoverText : undefined,
      outlineColor: typeof data.outlineColor === 'string' ? data.outlineColor : '#00f5ff',
      enabled: data.enabled !== false,
    };
  }

  registerObject(object, data) {
    const normalized = this.normalizeData(data);
    if (!object || !normalized || normalized.enabled === false) {
      return null;
    }

    const candidates = [];
    object.traverse((child) => {
      if (!child || !child.isMesh || !child.geometry) {
        return;
      }

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(child.geometry),
        new THREE.LineBasicMaterial({
          color: normalized.outlineColor,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        })
      );
      outline.visible = false;
      outline.renderOrder = 1000;
      child.add(outline);
      child.userData.clickableOutline = outline;
      candidates.push(child);
    });

    if (object.isMesh && object.geometry) {
      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(object.geometry),
        new THREE.LineBasicMaterial({
          color: normalized.outlineColor,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        })
      );
      outline.visible = false;
      outline.renderOrder = 1000;
      object.add(outline);
      object.userData.clickableOutline = outline;
      candidates.push(object);
    }

    if (candidates.length === 0) {
      const proxy = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({
          color: normalized.outlineColor,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          depthTest: false,
        })
      );
      proxy.visible = true;
      proxy.renderOrder = 1000;
      object.add(proxy);
      candidates.push(proxy);
    }

    const entry = { object, candidates, data: normalized };
    this.targets.push(entry);
    return entry;
  }

  updateHover(pointer, { isPointerLocked = false, gameMenuOpen = false } = {}) {
    if (!this.camera || !this.targets.length || gameMenuOpen || isPointerLocked) {
      this.clearHover();
      return;
    }

    this.raycaster.setFromCamera(pointer, this.camera);
    let nextTarget = null;
    let nextDistance = Infinity;

    for (const entry of this.targets) {
      const intersections = this.raycaster.intersectObjects(entry.candidates, false);
      if (intersections.length === 0) {
        continue;
      }
      const hit = intersections[0];
      const maxDistance = Number.isFinite(entry.data?.distance) ? entry.data.distance : DEFAULT_CLICK_DISTANCE;
      if (!Number.isFinite(hit.distance) || hit.distance > maxDistance) {
        continue;
      }
      if (hit.distance < nextDistance) {
        nextTarget = entry;
        nextDistance = hit.distance;
      }
    }

    if (this.hoveredTarget && this.hoveredTarget !== nextTarget) {
      this.hideOutline(this.hoveredTarget);
    }

    if (nextTarget) {
      this.showOutline(nextTarget);
      this.hoveredTarget = nextTarget;
    } else {
      this.hoveredTarget = null;
    }
  }

  clearHover() {
    if (this.hoveredTarget) {
      this.hideOutline(this.hoveredTarget);
      this.hoveredTarget = null;
    }
  }

  tryHandleClick(pointer) {
    if (!this.camera || !this.targets.length) {
      return false;
    }

    this.raycaster.setFromCamera(pointer, this.camera);

    let bestTarget = null;
    let bestDistance = Infinity;
    for (const entry of this.targets) {
      const intersections = this.raycaster.intersectObjects(entry.candidates, false);
      if (intersections.length === 0) {
        continue;
      }
      const hit = intersections[0];
      const maxDistance = Number.isFinite(entry.data?.distance) ? entry.data.distance : DEFAULT_CLICK_DISTANCE;
      if (!Number.isFinite(hit.distance) || hit.distance > maxDistance) {
        continue;
      }
      if (hit.distance < bestDistance) {
        bestTarget = entry;
        bestDistance = hit.distance;
      }
    }

    if (!bestTarget || !bestTarget.data) {
      return false;
    }

    this.performAction(bestTarget.data);
    return true;
  }

  performAction(data) {
    if (!data || data.enabled === false) {
      return;
    }

    if (data.action === 'link') {
      const destination = data.url ?? data.href ?? data.link ?? '#';
      if (typeof window !== 'undefined' && window.location) {
        const nextLocation = destination.startsWith('http') ? destination : new URL(destination, window.location.href).toString();
        window.location.assign(nextLocation);
      }
      return;
    }

    if (this.onTeleport) {
      const target = data.target ?? [0, 0, 0];
      const destination = Array.isArray(target)
        ? new THREE.Vector3(target[0], target[1], target[2])
        : target instanceof THREE.Vector3
          ? target.clone()
          : new THREE.Vector3(0, 0, 0);
      this.onTeleport(destination);
    }
  }

  showOutline(target) {
    if (!target) {
      return;
    }

    const outlineMeshes = [];
    target.object.traverse((child) => {
      if (child.userData?.clickableOutline) {
        outlineMeshes.push(child.userData.clickableOutline);
      }
    });
    if (target.object.userData?.clickableOutline) {
      outlineMeshes.push(target.object.userData.clickableOutline);
    }

    outlineMeshes.forEach((mesh) => {
      mesh.visible = true;
    });
  }

  hideOutline(target) {
    if (!target) {
      return;
    }

    const outlineMeshes = [];
    target.object.traverse((child) => {
      if (child.userData?.clickableOutline) {
        outlineMeshes.push(child.userData.clickableOutline);
      }
    });
    if (target.object.userData?.clickableOutline) {
      outlineMeshes.push(target.object.userData.clickableOutline);
    }

    outlineMeshes.forEach((mesh) => {
      mesh.visible = false;
    });
  }
}
