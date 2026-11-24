// node tests/features.test.js — plano giratorio, superficie, curvas, lazo, grupo y acciones
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { canUndo, undo, redo, clearHistory } from '../js/core/history.js';
import { createStrokeEngine, catmullRom } from '../js/drawing/stroke-engine.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import {
  rotatedNormal, setPlaneOrientation, setPlaneMode, isFixedPlane, isSurfaceMode, resolvePlane,
} from '../js/drawing/draw-planes.js';
import {
  surfaceHitAt, objectsInLasso, pointInPolygon, setSelection, getSelectedIds, selectedObjects,
  syncSelectionHighlight, objectColor,
} from '../js/drawing/selection.js';
import { createTransformController } from '../js/drawing/transform.js';
import {
  duplicateObjects, deleteObjects, recolorObjects, mirrorObjects, moveObjectsToLayer,
} from '../js/drawing/object-actions.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';
import { erasePartial } from '../js/drawing/eraser.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

function cam() {
  const c = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  c.position.set(0, 0, 5); c.lookAt(0, 0, 0); c.updateMatrixWorld();
  return c;
}
const ndcOf = (p, c) => { const v = p.clone().project(c); return { x: v.x, y: v.y }; };

// ── Store: selectedId ↔ selectedIds ──
setState({ selectedId: 'a' });
assert(getState().selectedIds.length === 1 && getState().selectedIds[0] === 'a', 'selectedId llena selectedIds');
setState({ selectedIds: ['b', 'c'] });
assert(getState().selectedId === 'b', 'selectedIds actualiza selectedId (el primero)');
setState({ selectedId: null });
assert(getState().selectedIds.length === 0, 'deseleccionar vacía la lista');

// ── Curvas: Catmull-Rom centrípeta ──
{
  const P = [[0, 0, 0], [1, 0, 0], [2, 1, 0], [3, 1, 0]].map((a) => new THREE.Vector3(...a));
  assert(catmullRom(...P, 0).distanceTo(P[1]) < 1e-9 && catmullRom(...P, 1).distanceTo(P[2]) < 1e-9, 'la curva pasa por los puntos de control');
  const mid = catmullRom(...P, 0.5);
  assert(mid.y > 0.4 && mid.y < 0.6 && Math.abs(mid.x - 1.5) < 0.2, 'el punto medio queda entre ellos, sin rulos');

  // Un zigzag con pocos puntos queda redondeado: más puntos y sin esquinas bruscas
  const scene = new THREE.Scene();
  const e = createStrokeEngine(scene, cam());
  const raw = [[0, 0], [0.4, 0.3], [0.8, 0], [1.2, 0.3], [1.6, 0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  e.startStroke(raw[0], { width: 0.02, smooth: true });
  raw.slice(1).forEach((p) => e.addPoint(p));
  const done = e.endStroke();
  const pts = done.mesh.userData.strokePoints.map((a) => new THREE.Vector3(...a));
  assert(pts.length > raw.length * 5, `con curvas, se interpolan puntos (${raw.length} → ${pts.length})`);
  assert(raw.every((r) => pts.some((p) => p.distanceTo(r) < 1e-6)), 'la curva pasa por todos los puntos originales');
  let maxTurn = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i].clone().sub(pts[i - 1]).normalize(), b = pts[i + 1].clone().sub(pts[i]).normalize();
    maxTurn = Math.max(maxTurn, a.angleTo(b));
  }
  assert(maxTurn < THREE.MathUtils.degToRad(40), `sin esquinas: el giro máximo entre segmentos es ${THREE.MathUtils.radToDeg(maxTurn).toFixed(1)}° (sin curvas sería ~74°)`);

  // El trazo en vivo coincide con el final
  const live = scene.children[0];
  assert(live === done.mesh, 'es el mismo mesh');
  const e2 = createStrokeEngine(new THREE.Scene(), cam());
  e2.startStroke(raw[0], { width: 0.02 });
  raw.slice(1).forEach((p) => e2.addPoint(p));
  assert(e2.endStroke().mesh.userData.strokePoints.length === raw.length, 'sin la opción smooth, los puntos quedan tal cual (cargar archivos no los altera)');
}

// ── Girar el plano ──
{
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(30));
  const r = rotatedNormal(new THREE.Vector3(0, 0, 1), q);
  assert(!r.snapped && approx(r.normal.angleTo(new THREE.Vector3(0, 0, 1)), THREE.MathUtils.degToRad(30), 1e-6), 'gira la normal 30°');
  const q2 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(88));
  const r2 = rotatedNormal(new THREE.Vector3(0, 0, 1), q2);
  assert(r2.snapped && approx(Math.abs(r2.normal.y), 1), 'cerca de un eje (a 2°), se imanta al eje');

  const pivot = new THREE.Vector3(0.3, 0.7, -0.2);
  setPlaneOrientation(r.normal, pivot);
  const spec = getState().drawPlane;
  assert(spec.mode === 'custom', 'un giro libre deja un plano propio');
  assert(approx(resolvePlane(spec, cam(), null).distanceToPoint(pivot), 0, 1e-3), 'el plano sigue pasando por el pivote (gira sobre sí mismo)');
  setPlaneOrientation(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 2, 0));
  assert(getState().drawPlane.mode === 'ground', 'alineado a un eje, vuelve a ser un preset (con su color)');

  setPlaneMode('surface');
  assert(isSurfaceMode(getState().drawPlane) && !isFixedPlane(getState().drawPlane), 'Superficie no es un plano fijo');
  setPlaneMode('view');
}

// ── Superficie de las figuras ──
{
  const scene = new THREE.Scene();
  const c = cam();
  const sphere = placePrimitive(scene, 'sphere', new THREE.Vector3(0, 0, 0), { record: false });
  sphere.updateMatrixWorld();
  const hit = surfaceHitAt(scene, c, 0, 0);
  assert(hit && approx(hit.point.z, 0.2, 0.01), `pega en el frente de la esfera (z=${hit && hit.point.z.toFixed(3)})`);
  assert(hit && hit.normal.z > 0.95, 'la normal apunta hacia afuera/la cámara');
  const side = surfaceHitAt(scene, c, ndcOf(new THREE.Vector3(0.17, 0, 0), c).x, 0);
  assert(side && side.normal.x > 0.6, `en el costado, la normal se inclina (${side && side.normal.toArray().map((v) => v.toFixed(2))})`);
  assert(surfaceHitAt(scene, c, 0.9, 0.9) === null, 'en el vacío no hay superficie');

  // Normales por punto: la cinta queda apoyada en la superficie
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(0, 0, 1), { width: 0.1, normal: new THREE.Vector3(0, 0, 1) });
  e.addPoint(new THREE.Vector3(1, 0, 1), 1, new THREE.Vector3(0, 0, 1));
  e.addPoint(new THREE.Vector3(2, 0, 1), 1, new THREE.Vector3(1, 0, 0));
  const m = e.endStroke().mesh;
  const pos = m.geometry.getAttribute('position');
  const z0 = pos.getZ(0) + m.position.z, z1 = pos.getZ(1) + m.position.z;
  assert(approx(z0, 1) && approx(z1, 1), 'con normal Z, el par de vértices queda en el plano de la superficie');
  assert(m.userData.strokeNormals.length === 3, 'se guardan las normales por punto');
  const data = JSON.parse(JSON.stringify(serializeProject(scene)));
  const s2 = new THREE.Scene();
  loadProject(s2, createStrokeEngine(s2, c), data);
  const m2 = s2.children.find((o) => o.userData.strokePoints);
  const p2 = m2.geometry.getAttribute('position');
  let d = 0;
  for (let i = 0; i < pos.count; i++) d = Math.max(d, Math.abs(pos.getX(i) - p2.getX(i)) + Math.abs(pos.getZ(i) - p2.getZ(i)));
  assert(d < 1e-3, 'al cargar, la cinta vuelve con la misma forma');
}

// ── Lazo ──
{
  const square = [{ x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 }];
  assert(pointInPolygon(0, 0, square) && !pointInPolygon(0.7, 0, square), 'punto dentro/fuera de polígono');
  const scene = new THREE.Scene();
  const c = cam();
  const inside = placePrimitive(scene, 'cube', new THREE.Vector3(0, 0, 0), { record: false });
  const outside = placePrimitive(scene, 'cube', new THREE.Vector3(3, 0, 0), { record: false });
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(-0.5, 0.5, 0), { width: 0.02 });
  for (let i = 1; i <= 10; i++) e.addPoint(new THREE.Vector3(-0.5 + i * 0.1, 0.5, 0));
  const strokeIn = e.endStroke().mesh;
  e.startStroke(new THREE.Vector3(-0.5, -1.2, 0), { width: 0.02 });
  for (let i = 1; i <= 30; i++) e.addPoint(new THREE.Vector3(-0.5 + i * 0.1, -1.2, 0)); // cruza el borde del lazo
  const strokeCut = e.endStroke().mesh;
  const lasso = [new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, -1, 0), new THREE.Vector3(1, 1, 0), new THREE.Vector3(-1, 1, 0)].map((p) => ndcOf(p, c));
  const found = objectsInLasso(scene, c, lasso);
  assert(found.includes(inside) && found.includes(strokeIn), 'el lazo agarra lo que rodea');
  assert(!found.includes(outside) && !found.includes(strokeCut), 'y no lo que queda afuera o apenas roza');
  outside.position.set(0.2, 0.2, 0); // se movió adentro
  assert(objectsInLasso(scene, c, lasso).includes(outside), 'usa la posición actual (transformada) de los objetos');
  outside.visible = false;
  assert(!objectsInLasso(scene, c, lasso).includes(outside), 'lo oculto no se selecciona');
}

// ── Grupo: mover, escalar y rotar juntos ──
{
  clearHistory();
  const scene = new THREE.Scene();
  const c = cam();
  const a = placePrimitive(scene, 'cube', new THREE.Vector3(-1, 0, 0), { record: false });
  const b = placePrimitive(scene, 'cube', new THREE.Vector3(1, 0, 0), { record: false });
  setState({ activeTool: 'select', drawPlane: { mode: 'view', normal: [0, 0, 1], offset: 0 } });
  setSelection([a.uuid, b.uuid]);
  const t = createTransformController({ scene, camera: c });
  assert(t.isActive() && t.currentObjects().length === 2, 'hay un grupo para transformar');
  t.startMove(0, 0); t.moveTo(ndcOf(new THREE.Vector3(0.5, 0.5, 0), c).x, ndcOf(new THREE.Vector3(0.5, 0.5, 0), c).y); t.endMove();
  assert(approx(a.position.x, -0.5, 1e-3) && approx(b.position.y, 0.5, 1e-3), 'mover desplaza a todos igual');
  undo();
  assert(approx(a.position.x, -1) && approx(b.position.x, 1), 'un solo deshacer los devuelve a todos');
  t.startScaleRotate([{ x: -10, y: 0 }, { x: 10, y: 0 }]);
  t.updateScaleRotate([{ x: 0, y: -20 }, { x: 0, y: 20 }]); // x2 y 90°
  t.endScaleRotate();
  assert(approx(a.scale.x, 2) && approx(b.scale.x, 2), 'escalar el grupo escala a cada uno');
  assert(approx(a.position.distanceTo(b.position), 4, 1e-3), 'y separa sus posiciones (alrededor del centro común)');
  assert(approx(a.position.x, 0, 1e-3) && approx(Math.abs(a.position.y), 2, 1e-3), 'rotar 90° gira las posiciones alrededor del centro');
  undo();
}

// ── Acciones ──
{
  clearHistory();
  const scene = new THREE.Scene();
  const hl = syncSelectionHighlight(scene);
  const a = placePrimitive(scene, 'cube', new THREE.Vector3(0, 0, 0), { color: '#ff0000', record: false, layerId: 'layer-1' });
  const b = placePrimitive(scene, 'cone', new THREE.Vector3(1, 0, 0), { color: '#00ff00', record: false, layerId: 'layer-1' });
  setSelection([a.uuid, b.uuid]);
  hl.refresh();
  assert(a.material.color.getHex() === 0x4fd1c5 && b.material.color.getHex() === 0x4fd1c5, 'los dos quedan resaltados');

  const copies = duplicateObjects(scene, [a, b], new THREE.Vector3(0, 1, 0));
  hl.refresh();
  assert(copies.length === 2 && scene.children.filter((o) => o.userData.primitiveKind).length === 4, 'duplicar crea copias');
  assert(getSelectedIds().length === 2 && getSelectedIds().includes(copies[0].uuid), 'las copias quedan seleccionadas');
  assert(objectColor(copies[0]) === 0xff0000 && approx(copies[0].position.y, 1), 'con el color real (no el del resaltado) y corridas');
  assert(a.material.color.getHex() === 0xff0000, 'el original vuelve a su color al dejar de estar seleccionado');
  undo();
  assert(scene.children.filter((o) => o.userData.primitiveKind).length === 2, 'deshacer quita las copias');

  setSelection([a.uuid]); hl.refresh();
  recolorObjects([a], '#0000ff');
  assert(a.userData.color === '#0000ff' && a.material.color.getHex() === 0x4fd1c5, 'pintar algo seleccionado cambia su color real; sigue resaltado');
  setSelection([]); hl.refresh();
  assert(a.material.color.getHex() === 0x0000ff, 'al deseleccionar se ve el color nuevo');
  undo();
  assert(a.material.color.getHex() === 0xff0000 && a.userData.color === '#ff0000', 'deshacer devuelve el color');

  b.rotation.set(0.3, 0.5, 0); b.updateMatrix();
  const before = b.position.x;
  mirrorObjects([a, b]);
  // a en x=0, b en x=1 → centro 0.5: quedan intercambiados
  assert(approx(a.position.x, 1, 1e-6) && approx(b.position.x, 0, 1e-6), 'espejar refleja las posiciones respecto al centro del grupo');
  assert(b.scale.x * b.scale.y * b.scale.z < 0, 'espejar invierte la orientación (escala negativa)');
  undo();
  assert(b.scale.x > 0 && b.scale.y > 0 && b.scale.z > 0 && approx(b.position.x, before), 'deshacer el espejo');

  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }, { id: 'L2', name: 'Capa 2', visible: false }], activeLayerId: 'L2' });
  moveObjectsToLayer([a]);
  assert(a.userData.layerId === 'L2' && a.visible === false, 'mandar a la capa activa (oculta) lo oculta');
  undo();
  assert(a.userData.layerId === 'layer-1' && a.visible === true, 'deshacer lo devuelve');
  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }], activeLayerId: 'layer-1' });

  // Eliminar algo seleccionado y rehacer: no vuelve turquesa
  setSelection([a.uuid]); hl.refresh();
  deleteObjects(scene, [a]);
  hl.refresh();
  assert(!scene.children.includes(a) && getSelectedIds().length === 0, 'eliminar saca y deselecciona');
  undo(); hl.refresh();
  assert(scene.children.includes(a) && getSelectedIds()[0] === a.uuid, 'deshacer lo devuelve seleccionado');
  redo(); hl.refresh();
  undo(); setSelection([]); hl.refresh();
  assert(a.material.color.getHex() === 0xff0000, 'tras eliminar/deshacer/rehacer conserva su color real');
}

// ── Goma parcial sobre un trazo espejado y con normales ──
{
  const scene = new THREE.Scene();
  const c = cam();
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(-1, 0, 0), { width: 0.05, normal: new THREE.Vector3(0, 0, 1) });
  for (let i = 1; i <= 40; i++) e.addPoint(new THREE.Vector3(-1 + i * 0.05, 0, 0), 1, new THREE.Vector3(0, 0, 1));
  const m = e.endStroke().mesh;
  mirrorObjects([m], new THREE.Vector3(1, 0, 0));
  m.updateMatrixWorld();
  assert(erasePartial(scene, c, 0.013, 0, 0.1), 'la goma pega en un trazo espejado');
  const pieces = scene.children.filter((o) => o.userData.strokePoints);
  assert(pieces.length === 2 && pieces.every((p) => p.userData.strokeNormals), 'los pedazos conservan sus normales');
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
