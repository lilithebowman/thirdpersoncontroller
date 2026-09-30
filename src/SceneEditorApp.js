import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import {
  gameObjectsToLegacyObjects,
  normalizeGameObject,
  normalizeSceneManifest,
} from './sceneManifest.js';
import { Loader } from './Loader.js';
import { assetMetaService } from './AssetMetaService.js';

export class SceneEditorApp {
  constructor({ mountSelector = '#app', manifestPath = '/scene-manifest.json' } = {}) {
    this.mountSelector = mountSelector;
    this.manifestPath = manifestPath;

    this.app = document.querySelector(this.mountSelector);
    if (!this.app) {
      throw new Error(`Mount element not found for selector: ${this.mountSelector}`);
    }

    this.app.classList.add('scene-editor-app');
    this.app.innerHTML = '';

    this.mount = this.createShell();
    this.app.appendChild(this.mount);

    this.hierarchyRoot = this.mount.querySelector('[data-role="hierarchy-root"]');
    this.inspectorRoot = this.mount.querySelector('[data-role="inspector-root"]');
    this.viewportRoot = this.mount.querySelector('[data-role="viewport-root"]');
    this.toolbarRoot = this.mount.querySelector('[data-role="toolbar-root"]');
    this.statusRoot = this.mount.querySelector('[data-role="status-root"]');
    this.jsonInput = this.mount.querySelector('[data-role="json-input"]');
    this.hierarchyContextMenuRoot = this.mount.querySelector('[data-role="hierarchy-context-menu"]');

    this.loader = new Loader({
      mountElement: this.app,
      message: 'Loading scene editor...',
      type: 'spinner',
      visible: false,
    });

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x18212f);
    this.scene.fog = null;

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    this.camera.position.set(14, 12, 18);
    this.camera.lookAt(0, 2, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.viewportRoot.appendChild(this.renderer.domElement);

    this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.08;
    this.orbitControls.enableZoom = false;
    this.orbitControls.target.set(0, 2, 0);

    this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
    this.transformControls.addEventListener('dragging-changed', (event) => {
      this.orbitControls.enabled = !event.value;
      if (event.value) {
        this.pushUndoSnapshot();
      } else if (this.selectedNode) {
        this.commitSelectedTransform({ frameSelection: true });
      }
      this.requestRender();
    });
    this.transformControls.addEventListener('objectChange', () => {
      if (this.selectedNode) {
        this.commitSelectedTransform({ preserveHistory: true });
        this.requestRender();
      }
    });
    this.transformControlsHelper = this.transformControls.getHelper();
    this.scene.add(this.transformControlsHelper);

    this.grid = new THREE.GridHelper(200, 100, 0x5d7286, 0x304052);
    this.scene.add(this.grid);

    this.ambientLight = new THREE.HemisphereLight(0xdff4ff, 0x22313f, 1.3);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.4);
    this.directionalLight.position.set(8, 20, 12);
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.set(2048, 2048);
    this.directionalLight.shadow.camera.left = -40;
    this.directionalLight.shadow.camera.right = 40;
    this.directionalLight.shadow.camera.bottom = -40;
    this.scene.add(this.directionalLight);

    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.pickables = [];
    this.assetCache = new Map();
    this.gameObjectMap = new Map();
    this.gameObjectOrder = [];
    this.currentManifest = normalizeSceneManifest({});
    this.selectedNode = null;
    this.activeTransformMode = 'translate';
    this.undoStack = [];
    this.redoStack = [];
    this.historyLimit = 10;
    this.isRestoringHistory = false;
    this.isRendering = false;
    this.hierarchyContextMenuRecordId = null;

    this.onResize = this.onResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onSceneWheel = this.onSceneWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onDocumentPointerDown = this.onDocumentPointerDown.bind(this);
    this.animate = this.animate.bind(this);

    window.addEventListener('resize', this.onResize);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.viewportRoot.addEventListener('wheel', this.onSceneWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('blur', () => this.closeHierarchyContextMenu());

    this.setTransformMode('translate');
    this.bindToolbarActions();
    this.bindHierarchyContextMenuActions();
  }

  createShell() {
    const shell = document.createElement('div');
    shell.className = 'scene-editor-shell';
    shell.innerHTML = `
      <header class="scene-editor-toolbar" data-role="toolbar-root">
        <div class="scene-editor-toolbar__brand">
          <strong>Scene Editor</strong>
          <span>Hierarchy, scene, and inspector</span>
        </div>
        <div class="scene-editor-toolbar__actions">
          <button type="button" data-action="undo">Undo</button>
          <button type="button" data-action="redo">Redo</button>
          <button type="button" data-action="add-obj">Add OBJ</button>
          <button type="button" data-action="add-primitive">Add Primitive</button>
          <button type="button" data-action="mode-translate">Move</button>
          <button type="button" data-action="mode-rotate">Rotate</button>
          <button type="button" data-action="mode-scale">Scale</button>
          <button type="button" data-action="frame">Frame</button>
          <button type="button" data-action="copy">Copy JSON</button>
          <button type="button" data-action="download">Download</button>
          <button type="button" data-action="import-unity">Import Unity JSON</button>
        </div>
        <input data-role="json-input" type="file" accept="application/json,.json" hidden />
      </header>
      <main class="scene-editor-layout">
        <aside class="scene-editor-panel scene-editor-panel--hierarchy">
          <div class="scene-editor-panel__header">
            <h2>Hierarchy</h2>
            <span data-role="status-root">Ready</span>
          </div>
          <div class="scene-editor-panel__body" data-role="hierarchy-root"></div>
        </aside>
        <section class="scene-editor-viewport" data-role="viewport-root"></section>
        <aside class="scene-editor-panel scene-editor-panel--inspector">
          <div class="scene-editor-panel__header">
            <h2>Inspector</h2>
            <span>Selected GameObject</span>
          </div>
          <div class="scene-editor-panel__body" data-role="inspector-root"></div>
        </aside>
      </main>
      <div class="scene-editor-context-menu" data-role="hierarchy-context-menu" hidden></div>
    `;

    return shell;
  }

  bindToolbarActions() {
    this.toolbarRoot.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      if (action === 'undo') this.undoHistory();
      if (action === 'redo') this.redoHistory();
      if (action === 'add-obj') await this.addGameObject('obj');
      if (action === 'add-primitive') await this.addGameObject('primitive');
      if (action === 'mode-translate') this.setTransformMode('translate');
      if (action === 'mode-rotate') this.setTransformMode('rotate');
      if (action === 'mode-scale') this.setTransformMode('scale');
      if (action === 'frame') this.frameSelection();
      if (action === 'copy') await this.copyManifestJson();
      if (action === 'download') this.downloadManifest();
      if (action === 'import-unity') this.jsonInput.click();
    });

    this.jsonInput.addEventListener('change', async () => {
      const file = this.jsonInput.files?.[0];
      this.jsonInput.value = '';
      if (!file) {
        return;
      }

      try {
        const text = await file.text();
        await this.importUnitySceneJson(text);
        this.setStatus('Imported Unity scene JSON.');
      } catch (error) {
        this.setStatus(`Import failed: ${error?.message ?? error}`);
      }
    });
  }

  bindHierarchyContextMenuActions() {
    this.hierarchyContextMenuRoot.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    this.hierarchyContextMenuRoot.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) {
        return;
      }

      const action = button.dataset.action;
      const recordId = this.hierarchyContextMenuRecordId;
      this.closeHierarchyContextMenu();

      if (!recordId) {
        return;
      }

      if (action === 'add-child-obj') await this.addChildGameObject(recordId, 'obj');
      if (action === 'add-child-primitive') await this.addChildGameObject(recordId, 'primitive');
      if (action === 'clone') await this.cloneGameObjectById(recordId);
      if (action === 'delete') this.confirmDeleteSelectedGameObject(this.findRecordById(recordId, this.currentManifest.gameObjects ?? []));
    });
  }

  onDocumentPointerDown(event) {
    if (this.hierarchyContextMenuRoot.hidden) {
      return;
    }

    if (this.hierarchyContextMenuRoot.contains(event.target)) {
      return;
    }

    this.closeHierarchyContextMenu();
  }

  openHierarchyContextMenu(clientX, clientY, record) {
    if (!record || !this.hierarchyContextMenuRoot) {
      return;
    }

    this.hierarchyContextMenuRecordId = record.id;
    this.hierarchyContextMenuRoot.innerHTML = `
      <button type="button" data-action="add-child-obj">Add Child OBJ</button>
      <button type="button" data-action="add-child-primitive">Add Child Primitive</button>
      <button type="button" data-action="clone">Clone</button>
      <button type="button" data-action="delete">Delete</button>
    `;

    this.hierarchyContextMenuRoot.hidden = false;
    const menuRect = this.hierarchyContextMenuRoot.getBoundingClientRect();
    const clampPadding = 8;
    const maxLeft = window.innerWidth - menuRect.width - clampPadding;
    const maxTop = window.innerHeight - menuRect.height - clampPadding;
    const left = Math.min(Math.max(clientX, clampPadding), Math.max(clampPadding, maxLeft));
    const top = Math.min(Math.max(clientY, clampPadding), Math.max(clampPadding, maxTop));

    this.hierarchyContextMenuRoot.style.left = `${left}px`;
    this.hierarchyContextMenuRoot.style.top = `${top}px`;
  }

  closeHierarchyContextMenu() {
    if (!this.hierarchyContextMenuRoot) {
      return;
    }

    this.hierarchyContextMenuRoot.hidden = true;
    this.hierarchyContextMenuRoot.style.left = '';
    this.hierarchyContextMenuRoot.style.top = '';
    this.hierarchyContextMenuRecordId = null;
  }

  setStatus(message) {
    if (this.statusRoot) {
      this.statusRoot.textContent = message;
    }
  }

  async init() {
    this.loader.show('Loading scene editor...');
    try {
      await this.loadManifest();
      this.onResize();
      this.animate();
    } finally {
      this.loader.hide();
    }
  }

  async loadManifest() {
    const response = await fetch(this.manifestPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch manifest ${this.manifestPath}: ${response.status} ${response.statusText}`);
    }

    const manifest = normalizeSceneManifest(await response.json());
    this.currentManifest = manifest;
    this.scene.background = manifest.scene?.background
      ? new THREE.Color(manifest.scene.background)
      : this.scene.background;

    this.scene.fog = null;

    await this.rebuildSceneGraph();
    this.refreshHierarchy();

    if (this.gameObjectOrder.length > 0) {
      this.selectGameObject(this.gameObjectOrder[0]);
    } else {
      this.refreshInspector();
    }

    this.setStatus(`Loaded ${this.gameObjectOrder.length} GameObject(s).`);
  }

  async rebuildSceneGraph() {
    this.transformControls.detach();
    this.selectedNode = null;

    for (const child of [...this.scene.children]) {
      if (child === this.transformControlsHelper || child === this.grid || child === this.ambientLight || child === this.directionalLight) {
        continue;
      }
      this.scene.remove(child);
    }

    this.gameObjectMap.clear();
    this.gameObjectOrder = [];
    this.pickables = [];

    await this.instantiateGameObjects(this.currentManifest.gameObjects ?? [], this.scene);
  }

  async instantiateGameObjects(gameObjects, parentObject) {
    for (const record of gameObjects) {
      const node = await this.instantiateGameObject(record, parentObject);
      if (node) {
        this.gameObjectMap.set(record.id, node);
        this.gameObjectOrder.push(record);
      }
    }
  }

  async instantiateGameObject(record, parentObject) {
    const group = new THREE.Group();
    group.name = record.name;
    group.userData.gameObjectId = record.id;
    group.userData.gameObjectRecord = record;
    parentObject.add(group);
    this.gameObjectMap.set(record.id, group);

    this.applyTransformToObject(group, record.transform);

    for (const component of record.components ?? []) {
      const childObject = await this.createComponentObject(component, record);
      if (childObject) {
        childObject.userData.gameObjectId = record.id;
        group.add(childObject);
        this.collectPickables(childObject);
      }
    }

    for (const childRecord of record.children ?? []) {
      await this.instantiateGameObject(childRecord, group);
    }

    this.collectPickables(group);
    group.updateMatrixWorld(true);

    return group;
  }

  async createComponentObject(component) {
    if (!component || !component.type) {
      return null;
    }

    if (component.type === 'light') {
      const lightType = (component.lightType ?? 'directional').toLowerCase();
      let light = null;

      if (lightType === 'hemisphere') {
        light = new THREE.HemisphereLight(component.color ?? '#ffffff', component.groundColor ?? '#243b3a', component.intensity ?? 1);
      } else if (lightType === 'ambient') {
        light = new THREE.AmbientLight(component.color ?? '#ffffff', component.intensity ?? 1);
      } else {
        light = new THREE.DirectionalLight(component.color ?? '#ffffff', component.intensity ?? 1);
        light.castShadow = component.castShadow === true;
      }

      if (component.shadow && light.shadow) {
        if (Array.isArray(component.shadow.mapSize)) {
          light.shadow.mapSize.set(component.shadow.mapSize[0] ?? 1024, component.shadow.mapSize[1] ?? 1024);
        }

        if (component.shadow.camera) {
          Object.assign(light.shadow.camera, component.shadow.camera);
          light.shadow.camera.updateProjectionMatrix?.();
        }
      }

      return light;
    }

    if (component.type === 'primitive') {
      const primitiveType = component.primitiveType ?? 'box';
      const material = new THREE.MeshStandardMaterial({
        color: component.color ? new THREE.Color(component.color).getHex() : 0x8ecae6,
        roughness: component.roughness ?? 0.75,
        metalness: component.metalness ?? 0.15,
      });
      let geometry = null;

      if (primitiveType === 'floor') {
        const size = Array.isArray(component.size) ? component.size : [120, 120, 1];
        geometry = new THREE.PlaneGeometry(size[0] ?? 120, size[1] ?? 120);
      } else if (primitiveType === 'cylinder') {
        geometry = new THREE.CylinderGeometry(
          component.radiusTop ?? 0.2,
          component.radiusBottom ?? 0.2,
          component.height ?? 0.8,
          component.radialSegments ?? 12
        );
      } else {
        const size = Array.isArray(component.size) ? component.size : [1, 1, 1];
        geometry = new THREE.BoxGeometry(size[0] ?? 1, size[1] ?? 1, size[2] ?? 1);
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;

      if (primitiveType === 'floor') {
        mesh.rotation.x = -Math.PI / 2;
      }

      return mesh;
    }

    if (component.type === 'model' && component.modelType === 'obj') {
      return this.loadObjModel({
        objPath: component.objPath,
        mtlPath: component.mtlPath,
        materialName: component.material,
        materialRenderType: component.materialRenderType ?? 'cutout',
      });
    }

    if (component.type === 'scene') {
      const helper = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 })
      );
      helper.name = component.manifestPath ?? 'Scene Reference';
      return helper;
    }

    return null;
  }

  async loadAssetMeta(objPath) {
    if (!objPath) {
      return null;
    }
    const status = await assetMetaService.checkMetaStatus(objPath);
    return status.meta;
  }

  async loadObjModel({ objPath, mtlPath, materialName, materialRenderType = 'cutout' }) {
    const cacheKey = `${objPath}|${mtlPath ?? ''}|${materialName ?? ''}|${materialRenderType}`;
    if (this.assetCache.has(cacheKey)) {
      return this.assetCache.get(cacheKey).clone(true);
    }

    const metaStatus = await assetMetaService.checkMetaStatus(objPath);
    let meta = metaStatus.meta;

    const loader = new OBJLoader();
    if (mtlPath) {
      const mtlLoader = new MTLLoader();
      const mtlMaterial = await mtlLoader.loadAsync(mtlPath);
      mtlMaterial.preload();
      loader.setMaterials(mtlMaterial);
    }

    const model = await loader.loadAsync(objPath);

    if (!metaStatus.exists || metaStatus.dirty) {
      const subMeshNames = [];
      model.traverse((child) => {
        if (child.isMesh && child.name) {
          subMeshNames.push(child.name);
        }
      });
      meta = await assetMetaService.generateMeta(objPath, subMeshNames);
    }

    const subMeshOverrides = meta?.subMeshOverrides ?? {};

    model.traverse((child) => {
      if (!child.isMesh) {
        return;
      }

      const override = subMeshOverrides[child.name] ?? {};
      child.frustumCulled = false;
      child.castShadow = override.castShadow ?? true;
      child.receiveShadow = override.receiveShadow ?? true;
      if (override.visible !== undefined) {
        child.visible = override.visible;
      }

      const renderType = override.materialRenderType ?? materialRenderType;
      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => {
          if (material) {
            if (renderType === 'transparent') {
              material.transparent = true;
              material.depthWrite = false;
            } else if (renderType === 'cutout') {
              material.transparent = true;
              material.alphaTest = 0.5;
              if (material.map) {
                if (material.map.format === THREE.RGBAFormat) {
                  material.alphaMap = material.map;
                }
              }
            }
          }
        });
      }
    });

    this.assetCache.set(cacheKey, model);
    return model.clone(true);
  }

  extractSubMeshes(record) {
    const object = this.gameObjectMap.get(record.id);
    if (!object) {
      this.setStatus('GameObject instance not found in scene.');
      return;
    }

    const subMeshes = [];
    object.traverse((child) => {
      if (child !== object && child.isMesh) {
        subMeshes.push(child);
      }
    });

    if (subMeshes.length === 0) {
      this.setStatus('No sub-meshes found inside this GameObject.');
      return;
    }

    this.pushUndoSnapshot();
    record.children = record.children ?? [];

    let addedCount = 0;
    subMeshes.forEach((mesh, index) => {
      const meshName = mesh.name || `SubMesh_${index + 1}`;
      const exists = record.children.some((c) => c.name === meshName);
      if (!exists) {
        const childRecord = {
          id: `${record.id}-${slugify(meshName)}-${index + 1}`,
          name: meshName,
          active: true,
          tag: 'Untagged',
          layer: 0,
          static: false,
          transform: {
            position: [mesh.position.x, mesh.position.y, mesh.position.z],
            rotation: [THREE.MathUtils.radToDeg(mesh.rotation.x), THREE.MathUtils.radToDeg(mesh.rotation.y), THREE.MathUtils.radToDeg(mesh.rotation.z)],
            scale: [mesh.scale.x, mesh.scale.y, mesh.scale.z],
          },
          components: [
            {
              type: 'model',
              modelType: 'submesh',
              subMeshName: meshName,
              materialRenderType: 'cutout',
            }
          ],
          children: []
        };
        record.children.push(childRecord);
        addedCount++;
      }
    });

    this.replaceRecord(record.id, record);
    this.setStatus(`Extracted ${addedCount} sub-mesh child GameObject(s).`);
  }

  collectPickables(object) {
    object.traverse((child) => {
      if (child.isMesh || child.isLine || child.isPoints) {
        this.pickables.push(child);
      }
    });
  }

  applyTransformToObject(object, transform) {
    const position = transform?.position ?? [0, 0, 0];
    const rotation = transform?.rotation ?? [0, 0, 0];
    const scale = transform?.scale ?? [1, 1, 1];

    object.position.set(position[0] ?? 0, position[1] ?? 0, position[2] ?? 0);
    object.rotation.set(
      THREE.MathUtils.degToRad(rotation[0] ?? 0),
      THREE.MathUtils.degToRad(rotation[1] ?? 0),
      THREE.MathUtils.degToRad(rotation[2] ?? 0)
    );
    object.scale.set(scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1);
  }

  syncGameObjectTransformFromObject(record, object) {
    record.transform = record.transform ?? {};
    record.transform.position = [object.position.x, object.position.y, object.position.z];
    record.transform.rotation = [
      THREE.MathUtils.radToDeg(object.rotation.x),
      THREE.MathUtils.radToDeg(object.rotation.y),
      THREE.MathUtils.radToDeg(object.rotation.z),
    ];
    record.transform.scale = [object.scale.x, object.scale.y, object.scale.z];
  }

  commitSelectedTransform({ preserveHistory = false, frameSelection = false } = {}) {
    if (!this.selectedNode?.record || !this.selectedNode?.object) {
      return;
    }

    if (!preserveHistory) {
      this.pushUndoSnapshot();
    }

    this.syncGameObjectTransformFromObject(this.selectedNode.record, this.selectedNode.object);
    this.refreshHierarchy();
    this.refreshInspector();

    if (frameSelection) {
      this.frameSelection();
    }
  }

  refreshHierarchy() {
    if (!this.hierarchyRoot) {
      return;
    }

    this.hierarchyRoot.innerHTML = '';
    this.closeHierarchyContextMenu();
    const list = document.createElement('div');
    list.className = 'scene-editor-tree';

    for (const record of this.currentManifest.gameObjects ?? []) {
      list.appendChild(this.createHierarchyNode(record, 0));
    }

    this.hierarchyRoot.appendChild(list);
  }

  createHierarchyNode(record, depth) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `scene-editor-tree__item${this.selectedNode?.record?.id === record.id ? ' is-selected' : ''}`;
    node.style.paddingLeft = `${12 + depth * 16}px`;
    node.textContent = record.name;
    node.addEventListener('click', () => this.selectGameObject(record));
    node.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.selectGameObject(record, { frameSelection: false });
      this.openHierarchyContextMenu(event.clientX, event.clientY, record);
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'scene-editor-tree__group';
    wrapper.appendChild(node);

    for (const child of record.children ?? []) {
      wrapper.appendChild(this.createHierarchyNode(child, depth + 1));
    }

    return wrapper;
  }

  selectGameObject(record, { frameSelection = true } = {}) {
    const node = this.gameObjectMap.get(record.id);
    if (!node) {
      this.selectedNode = null;
      this.transformControls.detach();
      this.refreshInspector();
      this.refreshHierarchy();
      return;
    }

    this.selectedNode = { record, object: node };
    this.closeHierarchyContextMenu();
    this.transformControls.attach(node);
    this.refreshInspector();
    this.refreshHierarchy();
    this.setStatus(`Selected ${record.name}.`);
    if (frameSelection) {
      this.frameSelection();
    }
    this.requestRender();
  }

  refreshInspector() {
    if (!this.inspectorRoot) {
      return;
    }

    this.inspectorRoot.innerHTML = '';

    if (!this.selectedNode) {
      const empty = document.createElement('div');
      empty.className = 'scene-editor-empty-state';
      empty.textContent = 'Select a GameObject from the hierarchy or scene to inspect its properties.';
      this.inspectorRoot.appendChild(empty);
      return;
    }

    const { record } = this.selectedNode;

    const form = document.createElement('div');
    form.className = 'scene-editor-inspector';

    form.appendChild(this.createTextField('Name', record.name, (value) => {
      this.pushUndoSnapshot();
      record.name = value || 'GameObject';
      this.selectedNode.object.name = record.name;
      this.refreshHierarchy();
    }));

    form.appendChild(this.createCheckboxField('Active', record.active !== false, (value) => {
      this.pushUndoSnapshot();
      record.active = value;
      this.selectedNode.object.visible = value;
    }));

    form.appendChild(this.createTextField('Tag', record.tag ?? '', (value) => {
      this.pushUndoSnapshot();
      record.tag = value;
    }));

    form.appendChild(this.createVectorField('Position', record.transform?.position ?? [0, 0, 0], (value) => {
      this.pushUndoSnapshot();
      record.transform = record.transform ?? {};
      record.transform.position = value;
      this.applyTransformToObject(this.selectedNode.object, record.transform);
      this.requestRender();
    }));

    form.appendChild(this.createVectorField('Rotation', record.transform?.rotation ?? [0, 0, 0], (value) => {
      this.pushUndoSnapshot();
      record.transform = record.transform ?? {};
      record.transform.rotation = value;
      this.applyTransformToObject(this.selectedNode.object, record.transform);
      this.requestRender();
    }));

    form.appendChild(this.createVectorField('Scale', record.transform?.scale ?? [1, 1, 1], (value) => {
      this.pushUndoSnapshot();
      record.transform = record.transform ?? {};
      record.transform.scale = value;
      this.applyTransformToObject(this.selectedNode.object, record.transform);
      this.requestRender();
    }));

    const componentsTitle = document.createElement('h3');
    componentsTitle.textContent = 'Components';
    form.appendChild(componentsTitle);

    for (const component of record.components ?? []) {
      form.appendChild(this.createComponentSummary(component));
    }

    const hasModel = (record.components ?? []).some((c) => c?.type === 'model');
    if (hasModel) {
      const extractBtn = document.createElement('button');
      extractBtn.type = 'button';
      extractBtn.className = 'scene-editor-apply';
      extractBtn.textContent = 'Extract Sub-Meshes to Children';
      extractBtn.addEventListener('click', () => {
        this.extractSubMeshes(record);
      });
      form.appendChild(extractBtn);
    }

    const rawTitle = document.createElement('h3');
    rawTitle.textContent = 'Raw GameObject JSON';
    form.appendChild(rawTitle);

    const rawEditor = document.createElement('textarea');
    rawEditor.className = 'scene-editor-json';
    rawEditor.value = JSON.stringify(record, null, 2);
    rawEditor.spellcheck = false;
    form.appendChild(rawEditor);

    const applyRaw = document.createElement('button');
    applyRaw.type = 'button';
    applyRaw.className = 'scene-editor-apply';
    applyRaw.textContent = 'Apply raw JSON';
    applyRaw.addEventListener('click', () => {
      try {
        this.pushUndoSnapshot();
        const parsed = JSON.parse(rawEditor.value);
        const normalized = normalizeGameObject({
          ...parsed,
          id: record.id,
          name: parsed.name ?? record.name,
        });

        if (!normalized) {
          throw new Error('Unable to normalize GameObject JSON.');
        }

        const nextRecord = {
          ...record,
          ...normalized,
          id: record.id,
        };

        this.replaceRecord(record.id, nextRecord);
        this.setStatus(`Updated ${nextRecord.name}.`);
      } catch (error) {
        this.setStatus(`Raw JSON error: ${error?.message ?? error}`);
      }
    });
    form.appendChild(applyRaw);

    this.inspectorRoot.appendChild(form);
  }

  createTextField(label, value, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'scene-editor-field';

    const title = document.createElement('span');
    title.textContent = label;
    wrapper.appendChild(title);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value ?? '';
    input.addEventListener('change', () => onChange(input.value));
    wrapper.appendChild(input);

    return wrapper;
  }

  createCheckboxField(label, value, onChange) {
    const wrapper = document.createElement('label');
    wrapper.className = 'scene-editor-field scene-editor-field--checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.addEventListener('change', () => onChange(input.checked));

    const title = document.createElement('span');
    title.textContent = label;

    wrapper.appendChild(input);
    wrapper.appendChild(title);
    return wrapper;
  }

  createVectorField(label, value, onChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'scene-editor-vector';

    const title = document.createElement('span');
    title.className = 'scene-editor-vector__label';
    title.textContent = label;
    wrapper.appendChild(title);

    const values = Array.isArray(value) ? value.slice(0, 3) : [0, 0, 0];
    while (values.length < 3) {
      values.push(0);
    }

    const inputs = values.map((entry) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.value = String(entry);
      input.addEventListener('change', () => {
        const next = inputs.map((control) => Number.parseFloat(control.value) || 0);
        onChange(next);
      });
      wrapper.appendChild(input);
      return input;
    });

    return wrapper;
  }

  createComponentSummary(component) {
    const details = document.createElement('details');
    details.className = 'scene-editor-component';

    const summary = document.createElement('summary');
    summary.textContent = component.type ?? 'component';
    details.appendChild(summary);

    const code = document.createElement('pre');
    code.textContent = JSON.stringify(component, null, 2);
    details.appendChild(code);

    return details;
  }

  replaceRecord(recordId, nextRecord) {
    this.pushUndoSnapshot();
    const replaceRecursive = (items) => items.map((item) => {
      if (item.id === recordId) {
        return nextRecord;
      }

      if (Array.isArray(item.children) && item.children.length > 0) {
        return { ...item, children: replaceRecursive(item.children) };
      }

      return item;
    });

    this.currentManifest.gameObjects = replaceRecursive(this.currentManifest.gameObjects ?? []);
    this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);
    this.rebuildSceneGraph().then(() => {
      this.refreshHierarchy();
      const next = this.gameObjectMap.get(recordId);
      if (next) {
        this.selectedNode = { record: next.userData.gameObjectRecord ?? next, object: next };
        this.transformControls.attach(next);
      }
      this.refreshInspector();
      this.requestRender();
    });
  }

  setTransformMode(mode) {
    this.activeTransformMode = mode;
    this.transformControls.setMode(mode);
    for (const button of this.toolbarRoot.querySelectorAll('button[data-action^="mode-"]')) {
      button.classList.toggle('is-active', button.dataset.action === `mode-${mode}`);
    }
    this.setStatus(`Transform mode: ${mode}.`);
  }

  frameSelection() {
    if (!this.selectedNode?.object) {
      return;
    }

    const box = new THREE.Box3().setFromObject(this.selectedNode.object);
    if (box.isEmpty()) {
      return;
    }

    const center = box.getCenter(new THREE.Vector3());
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Number.isFinite(sphere.radius) && sphere.radius > 0
      ? sphere.radius
      : box.getSize(new THREE.Vector3()).length() * 0.5;
    const halfFovRadians = THREE.MathUtils.degToRad(this.camera.fov * 0.5);
    const fitDistance = radius > 0 && halfFovRadians > 0
      ? radius / Math.sin(halfFovRadians)
      : 4;
    const distance = Math.min(Math.max(fitDistance * 1.35, radius * 2.5, 8), 1000);
    const viewDirection = new THREE.Vector3();

    this.camera.getWorldDirection(viewDirection);
    if (viewDirection.lengthSq() < 1e-6) {
      viewDirection.set(1, 0.35, 1).normalize();
    }

    this.orbitControls.target.copy(center);
    this.camera.position.copy(center).addScaledVector(viewDirection.normalize().negate(), distance);
    this.camera.near = Math.max(0.05, distance * 0.01);
    this.camera.far = 1000;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);
    this.orbitControls.update();
    this.requestRender();
  }

  onPointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const gizmoHits = this.transformControlsHelper
      ? this.raycaster.intersectObject(this.transformControlsHelper, true)
      : [];

    if (gizmoHits.length > 0) {
      return;
    }

    const intersections = this.raycaster.intersectObjects(this.pickables, true);
    if (intersections.length === 0) {
      return;
    }

    const target = this.resolveGameObjectFromObject(intersections[0].object);
    if (target) {
      this.selectGameObject(target);
    }
  }

  onSceneWheel(event) {
    if (!this.viewportRoot.contains(event.target)) {
      return;
    }

    event.preventDefault();

    const zoomFactor = Math.exp(event.deltaY * 0.0012);
    const target = this.orbitControls.target.clone();
    const offset = this.camera.position.clone().sub(target);
    const currentDistance = offset.length();

    if (currentDistance <= 1e-6) {
      offset.set(0, 0, 1);
    }

    const nextDistance = THREE.MathUtils.clamp(
      (currentDistance > 1e-6 ? currentDistance : 1) * zoomFactor,
      0.75,
      1000
    );

    offset.normalize().multiplyScalar(nextDistance);
    this.camera.position.copy(target).add(offset);
    this.camera.updateProjectionMatrix();
    this.orbitControls.update();
    this.requestRender();
  }

  resolveGameObjectFromObject(object) {
    let current = object;
    while (current) {
      const gameObjectId = current.userData?.gameObjectId;
      if (gameObjectId && this.gameObjectMap.has(gameObjectId)) {
        return this.findRecordById(gameObjectId, this.currentManifest.gameObjects ?? []);
      }
      current = current.parent;
    }

    return null;
  }

  findRecordById(recordId, items) {
    for (const item of items) {
      if (item.id === recordId) {
        return item;
      }

      const child = this.findRecordById(recordId, item.children ?? []);
      if (child) {
        return child;
      }
    }

    return null;
  }

  onKeyDown(event) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (event.code === 'Escape') {
      this.closeHierarchyContextMenu();
      return;
    }

    if (event.code === 'Delete') {
      event.preventDefault();
      this.confirmDeleteSelectedGameObject();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
      event.preventDefault();
      if (event.shiftKey) {
        this.redoHistory();
      } else {
        this.undoHistory();
      }
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyY') {
      event.preventDefault();
      this.redoHistory();
      return;
    }

    if (event.code === 'KeyW') {
      this.setTransformMode('translate');
    }

    if (event.code === 'KeyE') {
      this.setTransformMode('rotate');
    }

    if (event.code === 'KeyR') {
      this.setTransformMode('scale');
    }
  }

  confirmDeleteSelectedGameObject(record = this.selectedNode?.record) {
    if (!record) {
      this.setStatus('Select a GameObject before deleting.');
      return;
    }

    const shouldDelete = window.confirm(`Delete \"${record.name}\" from the hierarchy?`);
    if (!shouldDelete) {
      this.setStatus('Delete canceled.');
      return;
    }

    this.deleteGameObjectById(record.id);
  }

  async addChildGameObject(parentRecordId, kind) {
    const parentRecord = this.findRecordById(parentRecordId, this.currentManifest.gameObjects ?? []);
    if (!parentRecord) {
      return;
    }

    this.pushUndoSnapshot();

    const childRecord = this.createNewGameObject(kind);
    childRecord.transform = {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };

    parentRecord.children = [...(parentRecord.children ?? []), childRecord];
    this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);

    await this.rebuildSceneGraph();
    this.refreshHierarchy();

    const nextSelection = this.findRecordById(childRecord.id, this.currentManifest.gameObjects ?? []);
    if (nextSelection) {
      this.selectGameObject(nextSelection, { frameSelection: true });
    } else {
      this.requestRender();
    }
  }

  async cloneGameObjectById(recordId) {
    const location = this.findRecordLocationById(recordId, this.currentManifest.gameObjects ?? []);
    if (!location) {
      return;
    }

    this.pushUndoSnapshot();

    const clone = this.cloneGameObjectRecord(location.record);
    clone.name = this.createUniqueGameObjectName(`${location.record.name} Copy`);
    location.list.splice(location.index + 1, 0, clone);

    this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);

    await this.rebuildSceneGraph();
    this.refreshHierarchy();

    const nextSelection = this.findRecordById(clone.id, this.currentManifest.gameObjects ?? []);
    if (nextSelection) {
      this.selectGameObject(nextSelection, { frameSelection: true });
    } else {
      this.requestRender();
    }
  }

  findRecordLocationById(recordId, items) {
    const search = (list) => {
      for (let index = 0; index < list.length; index += 1) {
        const item = list[index];
        if (item.id === recordId) {
          return { list, index, record: item };
        }

        const childMatch = search(item.children ?? []);
        if (childMatch) {
          return childMatch;
        }
      }

      return null;
    };

    return search(items ?? []);
  }

  cloneGameObjectRecord(record) {
    const clone = JSON.parse(JSON.stringify(record));
    const assignIds = (item) => {
      item.id = `clone-${crypto.randomUUID()}`;
      item.children = (item.children ?? []).map((child) => assignIds(child));
      return item;
    };

    return assignIds(clone);
  }

  async deleteGameObjectById(recordId) {
    const removeRecursive = (items) => {
      let removed = false;
      const nextItems = [];

      for (const item of items ?? []) {
        if (item.id === recordId) {
          removed = true;
          continue;
        }

        const childResult = removeRecursive(item.children ?? []);
        if (childResult.removed) {
          removed = true;
          nextItems.push({ ...item, children: childResult.items });
        } else {
          nextItems.push(item);
        }
      }

      return { items: nextItems, removed };
    };

    const result = removeRecursive(this.currentManifest.gameObjects ?? []);
    if (!result.removed) {
      return;
    }

    this.pushUndoSnapshot();
    this.currentManifest.gameObjects = result.items;
    this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);
    this.selectedNode = null;
    this.transformControls.detach();

    await this.rebuildSceneGraph();
    this.refreshHierarchy();

    if (this.gameObjectOrder.length > 0) {
      this.selectGameObject(this.gameObjectOrder[0], { frameSelection: false });
    } else {
      this.refreshInspector();
      this.setStatus('All GameObjects deleted.');
      this.requestRender();
    }
  }

  async copyManifestJson() {
    const text = JSON.stringify(this.serializeManifest(), null, 2);
    await navigator.clipboard.writeText(text);
    this.setStatus('Manifest JSON copied to clipboard.');
  }

  downloadManifest() {
    const blob = new Blob([JSON.stringify(this.serializeManifest(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scene-manifest.json';
    link.click();
    URL.revokeObjectURL(url);
    this.setStatus('Downloaded scene-manifest.json.');
  }

  serializeManifest() {
    const manifest = normalizeSceneManifest(this.currentManifest);
    manifest.objects = gameObjectsToLegacyObjects(manifest.gameObjects);
    return manifest;
  }

  requestRender() {
    this.isRendering = true;
  }

  onResize() {
    const { width, height } = this.viewportRoot.getBoundingClientRect();
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    this.camera.aspect = nextWidth / nextHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(nextWidth, nextHeight, false);
    this.requestRender();
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.orbitControls.update();
    this.renderer.render(this.scene, this.camera);
    this.isRendering = false;
  }

  async importUnitySceneJson(text) {
    this.pushUndoSnapshot();
    const parsed = JSON.parse(text);
    const imported = this.convertUnityScene(parsed);
    this.currentManifest.gameObjects = imported;
    this.currentManifest.objects = gameObjectsToLegacyObjects(imported);
    await this.rebuildSceneGraph();
    this.refreshHierarchy();
    if (this.gameObjectOrder.length > 0) {
      this.selectGameObject(this.gameObjectOrder[0]);
    } else {
      this.refreshInspector();
    }
    this.requestRender();
  }

  createHistorySnapshot() {
    return {
      manifest: JSON.parse(JSON.stringify(this.currentManifest)),
      selectedGameObjectId: this.selectedNode?.record?.id ?? null,
    };
  }

  pushUndoSnapshot() {
    if (this.isRestoringHistory) {
      return;
    }

    const snapshot = this.createHistorySnapshot();
    const lastSnapshot = this.undoStack.at(-1);
    if (lastSnapshot
      && lastSnapshot.selectedGameObjectId === snapshot.selectedGameObjectId
      && JSON.stringify(lastSnapshot.manifest) === JSON.stringify(snapshot.manifest)) {
      return;
    }

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }

    this.redoStack = [];
  }

  async restoreHistorySnapshot(snapshot) {
    if (!snapshot) {
      return;
    }

    this.isRestoringHistory = true;
    try {
      this.currentManifest = normalizeSceneManifest(snapshot.manifest);
      this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);
      await this.rebuildSceneGraph();
      this.refreshHierarchy();

      const selectedRecord = snapshot.selectedGameObjectId
        ? this.findRecordById(snapshot.selectedGameObjectId, this.currentManifest.gameObjects ?? [])
        : null;

      if (selectedRecord) {
        this.selectGameObject(selectedRecord, { frameSelection: false });
      } else {
        this.selectedNode = null;
        this.transformControls.detach();
        this.refreshInspector();
      }

      this.setStatus('History restored.');
      this.requestRender();
    } finally {
      this.isRestoringHistory = false;
    }
  }

  async undoHistory() {
    if (this.undoStack.length === 0 || this.isRestoringHistory) {
      return;
    }

    const currentSnapshot = this.createHistorySnapshot();
    const previousSnapshot = this.undoStack.pop();
    this.redoStack.push(currentSnapshot);
    if (this.redoStack.length > this.historyLimit) {
      this.redoStack.shift();
    }

    await this.restoreHistorySnapshot(previousSnapshot);
  }

  async redoHistory() {
    if (this.redoStack.length === 0 || this.isRestoringHistory) {
      return;
    }

    const currentSnapshot = this.createHistorySnapshot();
    const nextSnapshot = this.redoStack.pop();
    this.undoStack.push(currentSnapshot);
    if (this.undoStack.length > this.historyLimit) {
      this.undoStack.shift();
    }

    await this.restoreHistorySnapshot(nextSnapshot);
  }

  createUniqueGameObjectName(baseName) {
    const existingNames = new Set();

    const collectNames = (items) => {
      for (const item of items ?? []) {
        if (item?.name) {
          existingNames.add(item.name);
        }
        if (Array.isArray(item?.children) && item.children.length > 0) {
          collectNames(item.children);
        }
      }
    };

    collectNames(this.currentManifest.gameObjects ?? []);

    if (!existingNames.has(baseName)) {
      return baseName;
    }

    let suffix = 2;
    while (existingNames.has(`${baseName} ${suffix}`)) {
      suffix += 1;
    }

    return `${baseName} ${suffix}`;
  }

  createNewGameObject(kind) {
    const targetPosition = this.selectedNode?.object
      ? this.selectedNode.object.position.clone()
      : this.orbitControls.target.clone();

    if (kind === 'primitive') {
      return {
        id: `primitive-${crypto.randomUUID()}`,
        name: this.createUniqueGameObjectName('Primitive Model'),
        active: true,
        tag: 'Untagged',
        layer: 0,
        static: false,
        transform: {
          position: [targetPosition.x, targetPosition.y, targetPosition.z],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        },
        components: [
          {
            type: 'primitive',
            primitiveType: 'box',
            size: [1, 1, 1],
            color: '#8ecae6',
          },
        ],
        children: [],
      };
    }

    return {
      id: `obj-${crypto.randomUUID()}`,
      name: this.createUniqueGameObjectName('OBJ Model'),
      active: true,
      tag: 'Untagged',
      layer: 0,
      static: false,
      transform: {
        position: [targetPosition.x, targetPosition.y, targetPosition.z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      components: [
        {
          type: 'model',
          modelType: 'obj',
          objPath: '/models/2026-CozyCon-Cafe/2026-Booths.obj',
          mtlPath: '/models/2026-CozyCon-Cafe/2026-Booths.mtl',
          materialRenderType: 'cutout',
        },
      ],
      children: [],
    };
  }

  async addGameObject(kind) {
    this.pushUndoSnapshot();

    const nextGameObject = this.createNewGameObject(kind);
    this.currentManifest.gameObjects = [...(this.currentManifest.gameObjects ?? []), nextGameObject];
    this.currentManifest.objects = gameObjectsToLegacyObjects(this.currentManifest.gameObjects);

    await this.rebuildSceneGraph();
    this.refreshHierarchy();

    const selectedRecord = this.findRecordById(nextGameObject.id, this.currentManifest.gameObjects ?? []);
    if (selectedRecord) {
      this.selectGameObject(selectedRecord, { frameSelection: true });
    } else {
      this.requestRender();
    }

    this.setStatus(`Added ${nextGameObject.name}.`);
  }

  convertUnityScene(input) {
    const candidates = Array.isArray(input?.gameObjects)
      ? input.gameObjects
      : Array.isArray(input?.GameObjects)
        ? input.GameObjects
        : Array.isArray(input?.objects)
          ? input.objects
          : Array.isArray(input?.root)
            ? input.root
            : [];

    const convertNode = (node, index, parentId = 'unity') => {
      const name = node?.m_Name ?? node?.name ?? `Unity Object ${index + 1}`;
      const transform = node?.m_Transform ?? node?.transform ?? node ?? {};
      const position = transform.m_LocalPosition ?? transform.position ?? [0, 0, 0];
      const rotation = transform.m_LocalRotation ?? transform.rotation ?? [0, 0, 0];
      const scale = transform.m_LocalScale ?? transform.scale ?? [1, 1, 1];
      const components = [];

      if (node?.m_Renderer?.m_Materials || node?.renderer) {
        components.push({
          type: 'primitive',
          primitiveType: 'box',
          size: [1, 1, 1],
          color: '#8ecae6',
        });
      }

      if (node?.m_Light || node?.light) {
        components.push({
          type: 'light',
          lightType: node.lightType ?? 'directional',
          color: node.color ?? '#ffffff',
          intensity: node.intensity ?? 1,
        });
      }

      const children = Array.isArray(node?.m_Children)
        ? node.m_Children.map((child, childIndex) => convertNode(child, childIndex, `${parentId}-${index}`))
        : Array.isArray(node?.children)
          ? node.children.map((child, childIndex) => convertNode(child, childIndex, `${parentId}-${index}`))
          : [];

      if (components.length === 0) {
        components.push({
          type: 'primitive',
          primitiveType: 'box',
          size: [1, 1, 1],
          color: '#8ecae6',
        });
      }

      return {
        id: typeof node?.id === 'string' ? node.id : `${parentId}-${index + 1}`,
        name,
        active: node?.active !== false,
        tag: node?.tag ?? 'Untagged',
        layer: Number.isFinite(node?.layer) ? node.layer : 0,
        static: node?.static === true,
        transform: {
          position: Array.isArray(position) ? position.slice(0, 3) : [0, 0, 0],
          rotation: Array.isArray(rotation) ? rotation.slice(0, 3) : [0, 0, 0],
          scale: Array.isArray(scale) ? scale.slice(0, 3) : [1, 1, 1],
        },
        components,
        children,
      };
    };

    return candidates.map((candidate, index) => convertNode(candidate, index));
  }
}
