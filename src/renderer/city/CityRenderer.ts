import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { fileHeight, formatBytes, hash, type CameraState, type PlacedObject, type Entry } from '../../shared/world/model';
import type { CityTheme } from './themes';

type Part = { shape: 'box' | 'roof' | 'tree'; color: string; x: number; y: number; z: number; w: number; h: number; d: number; owner: string | null; fine: boolean };
export class CityRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.1, 600);
  private scene = new THREE.Scene();
  private content = new THREE.Group();
  private controls: OrbitControls;
  private observer: ResizeObserver;
  private ray = new THREE.Raycaster();
  private batches: THREE.InstancedMesh[] = [];
  private labels: { button: HTMLButtonElement; position: THREE.Vector3; id: string }[] = [];
  private parts: Part[] = [];
  private objects: PlacedObject[] = [];
  private marker = new THREE.Group();
  private hovered: string | null = null;
  private selected: string | null = null;
  private frame = 0;
  private disposed = false;
  private pointerStart = { x: 0, y: 0 };
  private moved = false;
  private theme?: CityTheme;
  private extent = 44;
  private centerZ = 8;
  private lost = false;
  private transition?: { from: CameraState; to: CameraState; start: number };
  onSelect: (id: string | null) => void = () => {};
  onEnter: (id: string) => void = () => {};
  onFailure: (message: string) => void = () => {};

  constructor(private host: HTMLDivElement, private overlay: HTMLDivElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute('aria-label', '可平移旋转缩放的样例城市沙盘');
    this.camera.position.set(55, 64, 65);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    this.controls.minPolarAngle = Math.PI / 8;
    this.controls.maxPolarAngle = Math.PI / 2.65;
    this.controls.minZoom = 0.45; this.controls.maxZoom = 3.8;
    this.controls.enableDamping = false;
    this.controls.addEventListener('change', this.requestRender);
    this.controls.addEventListener('start', () => { this.transition = undefined; });
    this.scene.add(this.content, this.marker);
    this.scene.add(new THREE.HemisphereLight('#fff7e7', '#9eac89', 1.8));
    const sun = new THREE.DirectionalLight('#fff4d8', 2.4);
    sun.position.set(-25, 60, 10); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 160 });
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    this.scene.add(sun);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(host);
    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.pointerDown);
    canvas.addEventListener('pointermove', this.pointerMove);
    canvas.addEventListener('pointerup', this.pointerUp);
    canvas.addEventListener('dblclick', this.doubleClick);
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
    document.addEventListener('visibilitychange', this.requestRender);
    this.resize();
  }

  private resize = (): void => {
    const { clientWidth: width, clientHeight: height } = this.host;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    const ratio = width / height;
    const span = Math.max(this.extent, 86 / ratio);
    this.camera.left = -span * ratio / 2; this.camera.right = span * ratio / 2;
    this.camera.top = span / 2; this.camera.bottom = -span / 2;
    this.camera.updateProjectionMatrix(); this.requestRender();
  };
  private part(shape: Part['shape'], color: string, x: number, y: number, z: number, w: number, h: number, d: number, owner: string | null = null, fine = false): void {
    this.parts.push({ shape, color, x, y, z, w, h, d, owner, fine });
  }
  private building(x: number, z: number, height: number, color: string, owner: string, tower = false): void {
    const theme = this.theme!;
    const w = tower ? 2.8 : 2.3; const d = 2.5;
    this.part('box', color, x, height / 2 + 0.65, z, w, height, d, owner);
    if (tower) {
      this.part('box', theme.wall, x, height + 0.8, z, w + 0.3, 0.3, d + 0.3, owner);
      this.part('box', theme.roof, x + 0.4, height + 1.15, z, 1.1, 0.5, 1.1, owner);
    } else this.part('roof', theme.roof, x, height + 1.05, z, w * 0.8, 1.15, d * 0.8, owner);
    for (let floor = 0; floor < Math.min(12, Math.floor(height / 1.1)); floor++) {
      for (const offset of [-0.55, 0.55]) {
        this.part('box', '#6f8886', x + offset, 1.25 + floor * 1.05, z + d / 2 + 0.012, 0.43, 0.52, 0.035, owner, true);
        this.part('box', '#6f8886', x + w / 2 + 0.012, 1.25 + floor * 1.05, z + offset, 0.035, 0.52, 0.43, owner, true);
      }
    }
    this.part('box', '#8e7053', x, 1.1, z + d / 2 + 0.02, 0.45, 0.9, 0.04, owner);
  }
  private tree(x: number, z: number): void {
    this.part('box', '#a18763', x, 1.05, z, 0.24, 1.4, 0.24);
    this.part('tree', this.theme!.foliage, x, 2.1, z, 1.05, 1.45, 1.05);
  }

  setScene(objects: PlacedObject[], theme: CityTheme, mode: 'capacity' | 'type', revealed?: Entry): void {
    this.clearContent(); this.objects = objects; this.theme = theme;
    this.scene.background = new THREE.Color(theme.sky);
    const maxZ = Math.max(0, ...objects.map(o => o.z));
    this.centerZ = maxZ / 2; this.extent = Math.max(72, maxZ + 47);
    this.part('box', '#bba482', 0, -1.1, this.centerZ, 58, 1.8, maxZ + 24);
    this.part('box', theme.ground, 0, -0.12, this.centerZ, 58, 0.4, maxZ + 24);
    // Longitudinal streets and parcel lanes remain decorative, never traffic evidence.
    for (const x of [-8.5, 8.5]) this.part('box', theme.road, x, 0.12, this.centerZ, 3, 0.12, maxZ + 23);
    for (let z = -8; z <= maxZ + 8; z += 16) {
      this.part('box', theme.road, 0, 0.13, z, 57, 0.12, 2.4);
      for (let x = -26; x < 27; x += 4) this.part('box', '#faf5e8', x, 0.21, z, 1.4, 0.015, 0.12);
    }
    for (const object of objects) {
      const { x, z, id } = object;
      this.part('box', theme.plot, x, 0.38, z, 13.5, 0.5, 12.5, id);
      this.part('box', '#c1cba3', x - 5.3, 0.69, z, 1.5, 0.12, 10, id);
      this.tree(x - 5.3, z - 3.6); this.tree(x - 5.3, z + 0.1); this.tree(x - 5.3, z + 3.7);
      const color = mode === 'type' ? theme.types[object.fileType] : theme.wall;
      if (object.kind === 'file') this.building(x + 0.2, z - 0.5, fileHeight(object.bytes), color, id, BigInt(object.bytes) > 104857600n);
      else if (object.kind === 'group') {
        for (let i = 0; i < 4; i++) this.building(x - 2 + i % 2 * 4, z - 2.5 + Math.floor(i / 2) * 4, 2.3, theme.types[object.fileType], id);
        this.part('box', theme.selection, x + 4.8, 2, z - 4, 0.25, 3, 0.25, id);
      } else if (object.count === 0) {
        this.part('box', '#a3b88c', x + 0.5, 0.7, z, 7, 0.15, 7, id);
        for (const offset of [-2, 2]) this.tree(x + offset, z - 1);
      } else {
        const count = Math.min(6, object.count);
        for (let i = 0; i < count; i++) {
          // Overview miniatures are directory summaries, not selectable file buildings.
          const height = 2 + (hash(id + i) % 35) / 10;
          this.building(x - 2 + i % 2 * 4.1, z - 3.3 + Math.floor(i / 2) * 3.25, height,
            mode === 'type' ? theme.types[object.fileType] : i % 3 === 0 ? '#d8bb8d' : theme.wall, id, Boolean(object.repository));
        }
        if (object.repository) {
          this.part('box', theme.types.code, x + 5.1, 0.95, z, 0.18, 0.6, 11.6, id);
          this.part('box', theme.types.code, x, 0.95, z - 5.7, 10.5, 0.6, 0.18, id);
        }
      }
      const button = document.createElement('button');
      button.className = 'map-label'; button.title = object.name;
      button.dataset.objectId = id;
      const name = document.createElement('span'); name.textContent = object.name;
      const subtitle = document.createElement('small');
      subtitle.textContent = object.kind === 'group' ? `${object.count} 个文件 · 聚合` : object.kind === 'directory' ? `${object.repository ? 'Git 工业园 · ' : ''}${object.count} 个文件` : '文件建筑';
      button.append(name, subtitle);
      button.onclick = () => this.onSelect(id);
      button.ondblclick = () => { if (object.kind === 'directory') this.onEnter(id); };
      this.overlay.append(button);
      this.labels.push({ button, position: new THREE.Vector3(x, 0.9, z + 6.4), id });
    }
    if (revealed) {
      const group = objects.find(o => o.members.includes(revealed.id));
      if (group?.kind === 'group') this.building(group.x + 5, group.z + 3.2, fileHeight(revealed.bytes), theme.selection, revealed.id, true);
    }
    this.bake(); this.resize(); this.setSelection(this.selected); this.requestRender();
  }

  private bake(): void {
    const grouped = new Map<string, Part[]>();
    for (const part of this.parts) { const key = `${part.shape}:${part.color}:${part.fine}`; const list = grouped.get(key) ?? []; list.push(part); grouped.set(key, list); }
    for (const list of grouped.values()) {
      const first = list[0]!;
      const geometry = first.shape === 'roof' ? new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4) : first.shape === 'tree' ? new THREE.IcosahedronGeometry(1, 0) : new THREE.BoxGeometry(1, 1, 1);
      const material = new THREE.MeshStandardMaterial({ color: first.color, roughness: 0.88, flatShading: true });
      const mesh = new THREE.InstancedMesh(geometry, material, list.length);
      const transform = new THREE.Object3D();
      list.forEach((p, i) => { transform.position.set(p.x, p.y, p.z); transform.scale.set(p.w, p.h, p.d); transform.updateMatrix(); mesh.setMatrixAt(i, transform.matrix); });
      mesh.userData.owners = list.map(p => p.owner); mesh.instanceMatrix.needsUpdate = true;
      mesh.userData.fine = first.fine;
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.content.add(mesh); this.batches.push(mesh);
    }
  }
  setSelection(id: string | null): void { this.selected = id; this.updateMarker(); }
  private updateMarker(): void {
    for (const child of [...this.marker.children]) { if (child instanceof THREE.Line) { child.geometry.dispose(); (child.material as THREE.Material).dispose(); } this.marker.remove(child); }
    const object = this.objects.find(o => o.id === (this.selected ?? this.hovered) || o.members.includes(this.selected ?? ''));
    if (object && this.theme) {
      const { x, z } = object;
      const points = [[-6.9, -6.5], [6.9, -6.5], [6.9, 6.5], [-6.9, 6.5]].map(([dx, dz]) => new THREE.Vector3(x + dx!, 0.72, z + dz!));
      this.marker.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: this.theme.selection })));
    }
    for (const label of this.labels) label.button.dataset.selected = String(label.id === object?.id);
    this.requestRender();
  }
  getCamera(): CameraState { return { position: this.camera.position.toArray(), target: this.controls.target.toArray(), zoom: this.camera.zoom }; }
  restoreCamera(state?: CameraState, animate = false): void {
    if (animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.transition = { from: this.getCamera(), to: state ?? { position: [57, 65, this.centerZ + 66], target: [0, 0, this.centerZ], zoom: 1 }, start: performance.now() };
      this.requestRender(); return;
    }
    this.transition = undefined;
    if (state) { this.camera.position.fromArray(state.position); this.controls.target.fromArray(state.target); this.camera.zoom = state.zoom; }
    else { this.camera.position.set(57, 65, this.centerZ + 66); this.controls.target.set(0, 0, this.centerZ); this.camera.zoom = 1; }
    this.camera.updateProjectionMatrix(); this.controls.update(); this.requestRender();
  }
  focus(id: string): void {
    this.transition = undefined;
    const object = this.objects.find(o => o.id === id || o.members.includes(id));
    if (!object) return;
    const offset = this.camera.position.clone().sub(this.controls.target);
    this.controls.target.set(object.x, 0, object.z); this.camera.position.copy(this.controls.target).add(offset);
    this.camera.zoom = 1.8; this.camera.updateProjectionMatrix(); this.controls.update(); this.requestRender();
  }
  zoom(factor: number): void { this.transition = undefined; this.camera.zoom = Math.max(0.45, Math.min(3.8, this.camera.zoom * factor)); this.camera.updateProjectionMatrix(); this.requestRender(); }
  private pick(event: PointerEvent | MouseEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), this.camera);
    for (const hit of this.ray.intersectObjects(this.batches)) {
      const owner = hit.object.userData.owners?.[hit.instanceId ?? -1];
      if (owner) return owner as string;
    }
    return null;
  }
  private pointerDown = (event: PointerEvent): void => { this.pointerStart = { x: event.clientX, y: event.clientY }; this.moved = false; };
  private pointerMove = (event: PointerEvent): void => {
    if (Math.hypot(event.clientX - this.pointerStart.x, event.clientY - this.pointerStart.y) > 5) this.moved = true;
    if (event.buttons) return;
    const id = this.pick(event);
    const object = this.objects.find(o => o.id === id || o.members.includes(id ?? ''));
    this.renderer.domElement.title = object ? `${object.name} · ${formatBytes(object.bytes)}${object.kind === 'group' ? ` · ${object.count} 个文件` : ''}` : '';
    if (id !== this.hovered) { this.hovered = id; this.renderer.domElement.style.cursor = id ? 'pointer' : 'grab'; this.updateMarker(); }
  };
  private pointerUp = (event: PointerEvent): void => { if (event.button === 0 && !this.moved) this.onSelect(this.pick(event)); };
  private doubleClick = (event: MouseEvent): void => {
    if (this.moved) return;
    const id = this.pick(event);
    if (this.objects.find(o => o.id === id)?.kind === 'directory' && id) this.onEnter(id);
  };
  private contextLost = (event: Event): void => { event.preventDefault(); this.lost = true; this.host.dataset.sceneState = 'lost'; this.onFailure('图形连接已中断，可继续使用左侧列表，或重新加载沙盘。'); };
  private contextRestored = (): void => { this.lost = false; this.host.dataset.sceneState = 'ready'; this.onFailure(''); this.requestRender(); };
  private requestRender = (): void => {
    if (this.disposed || this.frame || this.lost || document.hidden) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (this.disposed) return;
      if (this.transition) {
        const { from, to, start } = this.transition;
        const t = Math.min(1, (performance.now() - start) / 260), eased = 1 - (1 - t) ** 3;
        this.camera.position.lerpVectors(new THREE.Vector3(...from.position), new THREE.Vector3(...to.position), eased);
        this.controls.target.lerpVectors(new THREE.Vector3(...from.target), new THREE.Vector3(...to.target), eased);
        this.camera.zoom = from.zoom + (to.zoom - from.zoom) * eased;
        this.camera.updateProjectionMatrix(); this.controls.update();
        if (t === 1) this.transition = undefined;
        else this.requestRender();
      }
      for (const batch of this.batches) batch.visible = !batch.userData.fine || this.camera.zoom > 0.75;
      this.renderer.render(this.scene, this.camera);
      const width = this.host.clientWidth, height = this.host.clientHeight;
      const occupied: { x: number; y: number }[] = [];
      for (const label of this.labels) {
        const v = label.position.clone().project(this.camera);
        const x = (v.x + 1) * width / 2, y = (1 - v.y) * height / 2;
        const collision = occupied.some(p => Math.abs(p.x - x) < 115 && Math.abs(p.y - y) < 45);
        const visible = v.z < 1 && x > 40 && x < width - 40 && y > 25 && y < height - 45 && !collision;
        label.button.hidden = !visible;
        if (visible) occupied.push({ x, y });
        label.button.style.transform = `translate(${x}px, ${y}px) translate(-50%, 0)`;
        const pick = label.position.clone(); pick.z -= 6.4; pick.y = 2; pick.project(this.camera);
        label.button.dataset.pickX = String((pick.x + 1) * width / 2);
        label.button.dataset.pickY = String((1 - pick.y) * height / 2);
      }
      this.host.dataset.sceneState = 'ready';
      this.host.dataset.transition = String(Boolean(this.transition));
      this.host.dataset.camera = JSON.stringify(this.getCamera());
      this.host.dataset.drawCalls = String(this.renderer.info.render.calls);
      this.host.dataset.triangles = String(this.renderer.info.render.triangles);
    });
  };
  private clearContent(): void {
    for (const batch of this.batches) { batch.geometry.dispose(); (batch.material as THREE.Material).dispose(); batch.dispose(); }
    this.content.clear(); this.batches = []; this.parts = [];
    for (const label of this.labels) label.button.remove(); this.labels = [];
  }
  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.controls.dispose(); this.clearContent(); this.selected = null; this.hovered = null; this.updateMarker();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.pointerDown); canvas.removeEventListener('pointermove', this.pointerMove);
    canvas.removeEventListener('pointerup', this.pointerUp); canvas.removeEventListener('dblclick', this.doubleClick);
    canvas.removeEventListener('webglcontextlost', this.contextLost); canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    document.removeEventListener('visibilitychange', this.requestRender);
    this.scene.traverse(object => { if (object instanceof THREE.DirectionalLight) object.shadow.dispose(); });
    this.renderer.dispose(); canvas.remove();
  }
}
