// The 3D view: renders a MapIR, picks surfaces, and runs the spawn / rail tools.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MapIR, Rail, Spawn, Vec3 } from '../ir';
import { SceneBuilder, geometryFor, type ViewMode } from '../three/fromIR';
import { creaseEdges, type CreaseEdges } from './edges';

export type Tool = 'select' | 'spawn' | 'rail' | 'edge-rail';
export type Selection =
  | { kind: 'object'; index: number }
  | { kind: 'spawn'; index: number }
  | { kind: 'rail'; index: number }
  | null;

export interface Marker { position: Vec3; severity: 'warn' | 'info'; label?: string }

const SKATER_HEIGHT = 1.81;
const ACCENT = 0xd63a1f;

export class Viewport {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, 1, 0.05, 20000);
  controls: OrbitControls;
  map: MapIR | null = null;
  mode: ViewMode = 'textured';
  tool: Tool = 'select';
  selection: Selection = null;

  /** Called after any edit to the map (spawns, rails) or selection change. */
  onChange: (what: 'map' | 'selection') => void = () => {};
  onStatus: (text: string) => void = () => {};

  private builder = new SceneBuilder();
  private world = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private spawnGroup = new THREE.Group();
  private railGroup = new THREE.Group();
  private markerGroup = new THREE.Group();
  private draftGroup = new THREE.Group();
  private selectionHelper: THREE.Box3Helper | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private draftRail: Vec3[] = [];
  private spawnDrag: { index: number } | null = null;
  private downAt: { x: number; y: number } | null = null;
  private edgeCache = new Map<number, CreaseEdges>();
  private grid: THREE.GridHelper;
  private frame = 0;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.camera.position.set(20, 15, 20);

    this.scene.background = new THREE.Color(0xdcd8cd);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8577, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.grid = new THREE.GridHelper(200, 200, 0x8a8577, 0xbdb8aa);
    this.grid.position.y = -0.02; // just under y=0 so it never z-fights a ground plane
    this.scene.add(this.grid, this.world, this.spawnGroup, this.railGroup, this.markerGroup, this.draftGroup);

    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', e => this.pointerDown(e));
    el.addEventListener('pointermove', e => this.pointerMove(e));
    el.addEventListener('pointerup', e => this.pointerUp(e));
    el.addEventListener('dblclick', () => { if (this.tool === 'rail') this.finishRail(); });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    const loop = () => { this.frame = requestAnimationFrame(loop); this.controls.update(); this.renderer.render(this.scene, this.camera); };
    loop();
  }

  setDark(dark: boolean) {
    (this.scene.background as THREE.Color).set(dark ? 0x1b1b19 : 0xdcd8cd);
    const mats = (Array.isArray(this.grid.material) ? this.grid.material : [this.grid.material]) as THREE.LineBasicMaterial[];
    mats.forEach(m => m.color.set(dark ? 0x3a3934 : 0xbdb8aa));
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  async setMap(map: MapIR) {
    this.map = map;
    this.edgeCache.clear();
    await this.builder.load(map);
    this.rebuildWorld();
    this.rebuildSpawns();
    this.rebuildRails();
    this.select(null);
    this.frameAll();
  }

  setMode(mode: ViewMode) { this.mode = mode; this.refreshMaterials(); }

  setTool(tool: Tool) {
    this.tool = tool;
    this.cancelDraft();
    this.controls.enabled = true;
    const hints: Record<Tool, string> = {
      select: 'Click an object, spawn or rail to edit it.',
      spawn: 'Click the ground to place a spawn, drag to face it.',
      rail: 'Click points along a rail. Double-click or Enter to finish, Esc to cancel.',
      'edge-rail': 'Click a ledge, coping or rail edge to turn the whole edge into a rail.',
    };
    this.onStatus(hints[tool]);
  }

  rebuildWorld() {
    if (!this.map) return;
    for (const m of this.meshes) m.geometry.dispose();
    this.world.clear();
    this.meshes = this.map.objects.map((obj, i) => {
      const mesh = new THREE.Mesh(geometryFor(obj), this.builder.materialsFor(this.map!, obj, this.mode));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(obj.transform);
      mesh.userData.index = i;
      mesh.visible = obj.render || this.mode !== 'textured';
      this.world.add(mesh);
      return mesh;
    });
    this.world.updateMatrixWorld(true);
  }

  refreshMaterials() {
    if (!this.map) return;
    this.meshes.forEach((mesh, i) => {
      const obj = this.map!.objects[i];
      mesh.material = this.builder.materialsFor(this.map!, obj, this.mode);
      mesh.visible = obj.render || this.mode !== 'textured';
    });
  }

  rebuildSpawns() {
    this.spawnGroup.clear();
    this.map?.spawns.forEach((s, i) => this.spawnGroup.add(spawnMarker(s, i, this.selection?.kind === 'spawn' && this.selection.index === i)));
  }

  rebuildRails() {
    this.railGroup.clear();
    this.map?.rails.forEach((r, i) => {
      const line = railLine(r, this.selection?.kind === 'rail' && this.selection.index === i);
      if (line) { line.userData.rail = i; this.railGroup.add(line); }
    });
  }

  setMarkers(markers: Marker[]) {
    this.markerGroup.clear();
    if (!markers.length) return;
    const warn = markers.filter(m => m.severity === 'warn').flatMap(m => m.position);
    const info = markers.filter(m => m.severity === 'info').flatMap(m => m.position);
    for (const [pts, color] of [[warn, 0xff3b1f], [info, 0x2f6fb0]] as const) {
      if (!pts.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      this.markerGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color, size: 8, sizeAttenuation: false, depthTest: false })));
    }
  }

  frameAll() {
    const box = new THREE.Box3().setFromObject(this.world);
    if (box.isEmpty()) return;
    this.frameBox(box);
  }

  frameSelection() {
    if (!this.selection || !this.map) return this.frameAll();
    if (this.selection.kind === 'object') return this.frameBox(new THREE.Box3().setFromObject(this.meshes[this.selection.index]));
    const pts = this.selection.kind === 'spawn' ? [this.map.spawns[this.selection.index].position] : this.map.rails[this.selection.index].points;
    const box = new THREE.Box3().setFromPoints(pts.map(p => new THREE.Vector3(...p)));
    box.expandByScalar(3);
    this.frameBox(box);
  }

  private frameBox(box: THREE.Box3) {
    const size = box.getSize(new THREE.Vector3()).length();
    const centre = box.getCenter(new THREE.Vector3());
    this.controls.target.copy(centre);
    const dir = new THREE.Vector3(1, 0.8, 1).normalize();
    this.camera.position.copy(centre).addScaledVector(dir, Math.max(size * 0.9, 4));
    this.camera.near = Math.max(size / 5000, 0.02);
    this.camera.far = Math.max(size * 20, 500);
    this.camera.updateProjectionMatrix();
    // About 40 cells across the map, in round metres.
    const span = Math.max(20, Math.ceil((size * 2) / 10) * 10);
    const dark = (this.scene.background as THREE.Color).getHex() !== 0xdcd8cd;
    this.scene.remove(this.grid);
    this.grid.dispose();
    this.grid = new THREE.GridHelper(span, Math.max(10, Math.round(span / Math.max(1, Math.round(span / 40)))), 0x8a8577, 0xbdb8aa);
    this.grid.position.set(Math.round(centre.x), -0.02, Math.round(centre.z));
    this.scene.add(this.grid);
    this.setDark(dark);
  }

  select(sel: Selection) {
    this.selection = sel;
    if (this.selectionHelper) { this.scene.remove(this.selectionHelper); this.selectionHelper = null; }
    if (sel?.kind === 'object' && this.meshes[sel.index]) {
      this.selectionHelper = new THREE.Box3Helper(new THREE.Box3().setFromObject(this.meshes[sel.index]), ACCENT);
      this.scene.add(this.selectionHelper);
    }
    this.rebuildSpawns();
    this.rebuildRails();
    this.onChange('selection');
  }

  /** Re-applies one object's transform/material after an inspector edit. */
  updateObject(index: number) {
    const mesh = this.meshes[index], obj = this.map?.objects[index];
    if (!mesh || !obj) return;
    mesh.material = this.builder.materialsFor(this.map!, obj, this.mode);
    mesh.visible = obj.render || this.mode !== 'textured';
  }

  private setPointer(e: PointerEvent | MouseEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
  }

  private hitWorld(): THREE.Intersection | null {
    const hits = this.raycaster.intersectObjects(this.meshes.filter(m => m.visible), false);
    return hits[0] ?? null;
  }

  private hitGround(y = 0): THREE.Vector3 | null {
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p) ? p : null;
  }

  private pointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    this.downAt = { x: e.clientX, y: e.clientY };
    this.setPointer(e);
    if (this.tool === 'spawn' && this.map) {
      const hit = this.hitWorld();
      const p = hit?.point ?? this.hitGround();
      if (!p) return;
      this.map.spawns.push({ name: this.map.spawns.length ? `Spot ${this.map.spawns.length + 1}` : 'spawn', position: [p.x, p.y, p.z], yaw: 0 });
      this.spawnDrag = { index: this.map.spawns.length - 1 };
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(e.pointerId);
      this.select({ kind: 'spawn', index: this.spawnDrag.index });
      this.onChange('map');
    }
  }

  private pointerMove(e: PointerEvent) {
    this.setPointer(e);
    if (this.spawnDrag && this.map) {
      const s = this.map.spawns[this.spawnDrag.index];
      const p = this.hitGround(s.position[1]);
      if (p) {
        const dx = p.x - s.position[0], dz = p.z - s.position[2];
        if (Math.hypot(dx, dz) > 0.2) s.yaw = Math.round((Math.atan2(dx, dz) * 180) / Math.PI);
        this.rebuildSpawns();
      }
      return;
    }
    if (this.tool === 'rail' && this.draftRail.length) {
      const hit = this.hitWorld();
      if (hit) this.drawDraft([...this.draftRail, this.snap(hit)]);
    }
  }

  private pointerUp(e: PointerEvent) {
    if (this.spawnDrag) {
      this.spawnDrag = null;
      this.controls.enabled = true;
      this.renderer.domElement.releasePointerCapture(e.pointerId);
      this.onChange('map');
      return;
    }
    const moved = this.downAt ? Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) : 0;
    this.downAt = null;
    if (moved > 4 || e.button !== 0) return; // orbit drag, not a click
    this.setPointer(e);
    if (this.tool === 'select') this.pickSelect();
    else if (this.tool === 'rail') {
      const hit = this.hitWorld();
      if (hit) { this.draftRail.push(this.snap(hit)); this.drawDraft(this.draftRail); }
    } else if (this.tool === 'edge-rail') this.pickEdgeRail();
  }

  private pickSelect() {
    if (!this.map) return;
    this.raycaster.params.Line = { threshold: 0.15 };
    const markers = this.raycaster.intersectObjects([...this.spawnGroup.children, ...this.railGroup.children], true);
    for (const m of markers) {
      let o: THREE.Object3D | null = m.object;
      while (o && o.userData.spawn === undefined && o.userData.rail === undefined) o = o.parent;
      if (o?.userData.spawn !== undefined) return this.select({ kind: 'spawn', index: o.userData.spawn });
      if (o?.userData.rail !== undefined) return this.select({ kind: 'rail', index: o.userData.rail });
    }
    const hit = this.hitWorld();
    this.select(hit ? { kind: 'object', index: (hit.object as THREE.Mesh).userData.index } : null);
  }

  /** Snaps a hit to the nearest vertex of the hit triangle when within 15 cm. */
  private snap(hit: THREE.Intersection): Vec3 {
    const mesh = hit.object as THREE.Mesh;
    const face = hit.face;
    if (face) {
      const pos = mesh.geometry.attributes.position;
      let best: THREE.Vector3 | null = null, bestD = 0.15;
      for (const i of [face.a, face.b, face.c]) {
        const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        const d = v.distanceTo(hit.point);
        if (d < bestD) { bestD = d; best = v; }
      }
      if (best) return [best.x, best.y, best.z];
    }
    return [hit.point.x, hit.point.y, hit.point.z];
  }

  private drawDraft(points: Vec3[]) {
    this.draftGroup.clear();
    if (points.length < 1) return;
    const g = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p)));
    this.draftGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: ACCENT, depthTest: false })));
    this.draftGroup.add(new THREE.Points(g, new THREE.PointsMaterial({ color: ACCENT, size: 7, sizeAttenuation: false, depthTest: false })));
  }

  finishRail() {
    if (!this.map) return;
    // dblclick also fired two clicks: drop the duplicate last point.
    const pts = this.draftRail.filter((p, i, a) => i === 0 || Math.hypot(p[0] - a[i - 1][0], p[1] - a[i - 1][1], p[2] - a[i - 1][2]) > 0.01);
    if (pts.length >= 2) {
      this.map.rails.push({ name: `Rail ${this.map.rails.length + 1}`, points: pts, closed: false });
      this.select({ kind: 'rail', index: this.map.rails.length - 1 });
      this.onChange('map');
    }
    this.cancelDraft();
  }

  cancelDraft() { this.draftRail = []; this.draftGroup.clear(); }

  private pickEdgeRail() {
    if (!this.map) return;
    const hit = this.hitWorld();
    if (!hit) return;
    const index = (hit.object as THREE.Mesh).userData.index as number;
    if (!this.edgeCache.has(index)) this.edgeCache.set(index, creaseEdges(this.map.objects[index]));
    const chain = this.edgeCache.get(index)!.chainNear([hit.point.x, hit.point.y, hit.point.z]);
    if (!chain || chain.points.length < 2) { this.onStatus('No sharp edge near that point. Click closer to a ledge or coping edge.'); return; }
    this.map.rails.push({ name: `Rail ${this.map.rails.length + 1}`, points: chain.points, closed: chain.closed });
    this.select({ kind: 'rail', index: this.map.rails.length - 1 });
    this.onChange('map');
    const len = chain.points.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - chain.points[i][0], p[1] - chain.points[i][1], p[2] - chain.points[i][2]), 0);
    this.onStatus(`Added a ${len.toFixed(1)} m rail along that edge.`);
  }

  deleteSelection() {
    if (!this.map || !this.selection) return;
    if (this.selection.kind === 'spawn') this.map.spawns.splice(this.selection.index, 1);
    else if (this.selection.kind === 'rail') this.map.rails.splice(this.selection.index, 1);
    else return;
    this.select(null);
    this.onChange('map');
  }

  /** PNG screenshot of the current view. */
  snapshot(): string { return this.renderer.domElement.toDataURL('image/png'); }

  dispose() { cancelAnimationFrame(this.frame); this.renderer.dispose(); this.builder.dispose(); }
}

function spawnMarker(s: Spawn, index: number, selected: boolean): THREE.Group {
  const g = new THREE.Group();
  g.userData.spawn = index;
  const color = selected ? ACCENT : 0x141413;
  const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 });
  // A skater-height post for scale, and an arrow on the ground for facing.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, SKATER_HEIGHT, 8), mat);
  post.position.y = SKATER_HEIGHT / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), mat);
  head.position.y = SKATER_HEIGHT;
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.8, 3), mat);
  arrow.rotation.x = Math.PI / 2;
  arrow.position.set(0, 0.05, 0.7);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.45, 24), mat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(post, head, arrow, ring);
  g.position.set(...s.position);
  g.rotation.y = (s.yaw * Math.PI) / 180;
  g.renderOrder = 10;
  g.traverse(o => { o.renderOrder = 10; });
  return g;
}

function railLine(r: Rail, selected: boolean): THREE.Object3D | null {
  if (r.points.length < 2) return null;
  const pts = r.points.map(p => new THREE.Vector3(...p));
  if (r.closed) pts.push(pts[0].clone());
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const group = new THREE.Group();
  group.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: selected ? ACCENT : 0xe8b100, depthTest: false })));
  group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: selected ? ACCENT : 0xe8b100, size: 5, sizeAttenuation: false, depthTest: false })));
  group.renderOrder = 11;
  group.traverse(o => { o.renderOrder = 11; });
  return group;
}
