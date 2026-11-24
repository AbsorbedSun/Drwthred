// node tests/drawing-tools.test.js — fase 3: formas rápidas, imán, edición de trazos,
// imágenes de referencia y vista ortográfica
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { undo, redo, clearHistory } from '../js/core/history.js';
import { recognizeShape, rdp } from '../js/drawing/shape-recognition.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { findSnapTarget } from '../js/drawing/snapping.js';
import { restyleStrokes } from '../js/drawing/object-actions.js';
import {
  createReferenceMesh, addReference, serializeReferences, loadReferences, setReferenceOpacity, referenceMeshes,
} from '../js/drawing/references.js';
import { syncLayers, setLayerOpacity } from '../js/drawing/layers.js';
import { hitTestAt } from '../js/drawing/selection.js';
import { createCameraController } from '../js/core/camera-controller.js';
import { projectToPlane } from '../js/drawing/plane-projection.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';
import { createToolRouter } from '../js/input/tool-router.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function cam(aspect = 1) {
  const c = new THREE.PerspectiveCamera(50, aspect, 0.01, 100);
  c.position.set(0, 0, 5); c.lookAt(0, 0, 0); c.updateMatrixWorld();
  return c;
}

// ── Formas rápidas: reconocimiento ──
{
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const noisy = (pts, k) => pts.map((p) => ({ x: p.x + rnd() * k, y: p.y + rnd() * k }));
  const poly = (cs, per = 15) => { const o = []; cs.forEach((a, i) => { const b = cs[(i + 1) % cs.length]; for (let k = 0; k < per; k++) o.push({ x: a.x + (b.x - a.x) * k / per, y: a.y + (b.y - a.y) * k / per }); }); o.push(cs[0]); return o; };
  const circle = (rx, ry, n = 60) => Array.from({ length: n }, (_, i) => { const t = (i / (n - 1)) * 2 * Math.PI; return { x: rx * Math.cos(t), y: ry * Math.sin(t) }; });
  const kind = (pts) => (recognizeShape(pts) || {}).kind || null;
  assert(kind(noisy(Array.from({ length: 40 }, (_, i) => ({ x: i / 20, y: i / 80 })), 0.02)) === 'line', 'línea a mano → línea');
  assert(kind(noisy(circle(1, 1), 0.04)) === 'circle', 'círculo a mano → círculo');
  assert(kind(noisy(circle(1.6, 0.7), 0.04)) === 'ellipse', 'óvalo → elipse');
  assert(kind(noisy(poly([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1.7 }]), 0.03)) === 'triangle', 'triángulo');
  assert(kind(noisy(poly([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }]), 0.03)) === 'rectangle', 'rectángulo');
  assert(kind(noisy(Array.from({ length: 40 }, (_, i) => { const t = (i / 39) * 2.4; return { x: Math.cos(t), y: Math.sin(t) }; }), 0.02)) === 'arc', 'arco');
  assert(kind(Array.from({ length: 50 }, (_, i) => ({ x: i / 10, y: Math.sin(i) * (i % 7) / 5 }))) === null, 'un garabato NO se convierte en nada');
  assert(kind([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === null, 'muy pocos puntos: nada');
  // El rectángulo sale cuadrado de verdad (ángulos rectos)
  const r = recognizeShape(noisy(poly([{ x: 0, y: 0 }, { x: 2, y: 0.05 }, { x: 1.95, y: 1.03 }, { x: -0.04, y: 0.98 }]), 0.02));
  const corners = rdp(r.points, 0.01).slice(0, 4);
  const ang = (a, b, c) => { const u = { x: a.x - b.x, y: a.y - b.y }, v = { x: c.x - b.x, y: c.y - b.y }; return Math.acos((u.x * v.x + u.y * v.y) / (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))); };
  assert(corners.length === 4 && corners.every((c, i) => approx(ang(corners[(i + 3) % 4], c, corners[(i + 1) % 4]), Math.PI / 2, 0.02)), 'el rectángulo se "cuadra": esquinas a 90°');
  const circ = recognizeShape(noisy(circle(1, 1), 0.04));
  assert(approx(circ.points[0].x, circ.points[circ.points.length - 1].x, 1e-9), 'las formas cerradas cierran exacto');
}

// ── Formas rápidas en el router: quieto al final → forma ──
{
  clearHistory();
  setState({ activeTool: 'brush', activeVariant: 'pencil', brushWidth: 0.02, quickShapes: true, snapping: false, smoothing: 0,
    drawPlane: { mode: 'front', normal: [0, 0, 1], offset: 0 }, mirror: false, layers: [{ id: 'layer-1', name: 'Capa 1', visible: true, locked: false, opacity: 1 }], activeLayerId: 'layer-1' });
  const scene = new THREE.Scene();
  const c = cam();
  const camCtl = createCameraController(c);
  camCtl.viewAlong(new THREE.Vector3(0, 0, 1), 0);
  c.updateMatrixWorld();
  const engine = createStrokeEngine(scene, c);
  const notices = [];
  let changed = 0;
  const router = createToolRouter({ scene, camera: c, camCtl, strokeEngine: engine, onNotice: (m) => notices.push(m), onChange: () => changed++ });
  // Círculo a mano en NDC
  router.onStart(0.3, 0);
  for (let i = 1; i <= 50; i++) { const t = (i / 50) * 2 * Math.PI; router.onMove(0.3 * Math.cos(t) + 0.01 * Math.sin(7 * t), 0.3 * Math.sin(t)); }
  await sleep(700); // quieto
  router.onMove(0.9, 0.9); // moverse después de la forma no la deforma
  router.onEnd(0.9, 0.9);
  const m = scene.children.find((o) => o.userData.strokePoints);
  const pts = m.userData.strokePoints.map((p) => new THREE.Vector3(...p));
  // (sin el punto de cierre, que repite el primero y correría el centro)
  const ring = pts.slice(0, -1);
  const center = ring.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(ring.length);
  const radii = ring.map((p) => p.distanceTo(center));
  const spread = (Math.max(...radii) - Math.min(...radii)) / (radii.reduce((a, b) => a + b) / radii.length);
  assert(notices.some((n) => n.includes('círculo')), `avisa la forma reconocida (${notices.join(' / ')})`);
  assert(changed > 0, 'pide redibujar (la forma aparece sin que se mueva el lápiz)');
  assert(spread < 0.02, `el trazo quedó como un círculo perfecto (variación de radio ${(spread * 100).toFixed(2)}%)`);
  assert(pts.every((p) => approx(p.z, 0, 1e-6)), 'sobre el plano de dibujo');
  assert(pts.every((p) => Math.abs(p.x) < 2), 'el movimiento después de la forma no se agregó');

  // Con la opción desactivada, no pasa nada
  setState({ quickShapes: false });
  router.onStart(0.3, 0);
  for (let i = 1; i <= 50; i++) { const t = (i / 50) * 2 * Math.PI; router.onMove(0.3 * Math.cos(t), 0.3 * Math.sin(t)); }
  await sleep(700);
  router.onEnd(0.3, 0);
  assert(notices.filter((n) => n.startsWith('Forma')).length === 1, 'sin formas rápidas, no se reconoce nada');
  setState({ quickShapes: true });
}

// ── Imán entre trazos ──
{
  const scene = new THREE.Scene();
  const c = cam();
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(-1, 0, 0), { width: 0.02 });
  for (let i = 1; i <= 10; i++) e.addPoint(new THREE.Vector3(-1 + i * 0.1, 0, 0));
  const m = e.endStroke().mesh;
  const vp = { w: 1000, h: 1000 };
  const tip = new THREE.Vector3(0, 0, 0).project(c);
  const near = findSnapTarget(scene, c, { ndc: { x: tip.x + 0.02, y: tip.y + 0.02 }, viewport: vp });
  assert(near && near.kind === 'end' && near.point.distanceTo(new THREE.Vector3(0, 0, 0)) < 1e-6, 'cerca de la punta → se pega a la punta exacta');
  assert(findSnapTarget(scene, c, { ndc: { x: tip.x + 0.2, y: tip.y }, viewport: vp }) === null, 'lejos (100 px) → no se pega');
  const mid = new THREE.Vector3(-0.5, 0, 0).project(c);
  const onBody = findSnapTarget(scene, c, { ndc: { x: mid.x, y: mid.y + 0.01 }, viewport: vp });
  assert(onBody && onBody.kind === 'point', 'sobre el cuerpo del trazo → punto intermedio');
  m.position.y += 1; m.updateMatrixWorld();
  const moved = new THREE.Vector3(0, 1, 0).project(c);
  const s2 = findSnapTarget(scene, c, { ndc: { x: moved.x, y: moved.y }, viewport: vp });
  assert(s2 && approx(s2.point.y, 1, 1e-6), 'usa la posición actual del trazo (movido)');
  m.visible = false;
  assert(findSnapTarget(scene, c, { ndc: { x: moved.x, y: moved.y }, viewport: vp }) === null, 'lo oculto no atrae');
}

// ── Editar trazos ya hechos ──
{
  clearHistory();
  const scene = new THREE.Scene();
  const c = cam();
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(-1, 0, 0), { width: 0.02, color: '#ff0000', brush: 'pencil' });
  for (let i = 1; i <= 20; i++) e.addPoint(new THREE.Vector3(-1 + i * 0.1, 0, 0));
  const m = e.endStroke().mesh;
  m.position.y = 2; m.rotation.z = 0.5;
  const widthAt = (geo, i) => new THREE.Vector3().fromBufferAttribute(geo.getAttribute('position'), i * 2)
    .distanceTo(new THREE.Vector3().fromBufferAttribute(geo.getAttribute('position'), i * 2 + 1));
  const w0 = widthAt(m.geometry, 10);
  restyleStrokes([m], c, { width: 0.08 });
  assert(m.userData.strokeWidth === 0.08 && approx(widthAt(m.geometry, 10) / w0, 4, 0.05), 'cambiar el grosor reconstruye la cinta (x4)');
  assert(m.position.y === 2 && approx(m.rotation.z, 0.5), 'conserva posición y rotación');
  restyleStrokes([m], c, { brush: 'neon' });
  assert(m.userData.brush === 'neon' && m.material.blending === THREE.AdditiveBlending, 'cambiar el pincel cambia material y receta');
  assert('#' + m.material.color.getHexString() === '#ff0000', 'conserva el color');
  undo();
  assert(m.userData.brush === 'pencil' && m.material.blending !== THREE.AdditiveBlending, 'deshacer vuelve al pincel anterior');
  undo();
  assert(m.userData.strokeWidth === 0.02 && approx(widthAt(m.geometry, 10), w0, 1e-6), 'y al grosor anterior');
  redo();
  assert(m.userData.strokeWidth === 0.08, 'rehacer');
  const box = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  box.userData = { primitiveKind: 'cube' };
  assert(!restyleStrokes([box], c, { width: 0.5 }), 'las figuras se ignoran');
  restyleStrokes([m], c, { brush: 'calligraphy' });
  assert(Array.isArray(m.userData.strokeNib), 'pasar a caligrafía le da una punta');
}

// ── Imágenes de referencia ──
{
  clearHistory();
  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true, locked: false, opacity: 1 }], activeLayerId: 'layer-1' });
  const scene = new THREE.Scene();
  const sync = syncLayers(scene);
  const c = cam();
  const img = { src: 'data:image/png;base64,iVBORw0KGgo=', width: 400, height: 200 };
  const ref = addReference(scene, img, { spec: { mode: 'front', normal: [0, 0, 1], offset: 0 }, camera: c, target: new THREE.Vector3(), layerId: 'layer-1', size: 2 });
  ref.geometry.computeBoundingBox();
  const bb = ref.geometry.boundingBox;
  assert(approx(bb.max.x - bb.min.x, 2) && approx(bb.max.y - bb.min.y, 1), 'respeta la proporción de la imagen (2:1)');
  assert(ref.position.z < 0, 'queda un pelito DETRÁS del plano (lo dibujado encima se ve/toca primero)');
  const n = new THREE.Vector3(0, 0, 1).applyQuaternion(ref.quaternion);
  assert(approx(Math.abs(n.z), 1, 1e-6), 'apoyada en el plano activo');
  undo();
  assert(referenceMeshes(scene).length === 0, 'agregar se deshace');
  redo();

  // Un trazo encima gana al tocar
  const e = createStrokeEngine(scene, c);
  e.startStroke(new THREE.Vector3(-0.5, 0, 0), { width: 0.1, meta: { layerId: 'layer-1' } });
  for (let i = 1; i <= 10; i++) e.addPoint(new THREE.Vector3(-0.5 + i * 0.1, 0, 0));
  const stroke = e.endStroke().mesh;
  scene.updateMatrixWorld();
  assert(hitTestAt(scene, c, 0.013, 0) === stroke.uuid, 'tocar sobre un trazo encima de la referencia selecciona el trazo');
  assert(hitTestAt(scene, c, 0.013, 0.12) === ref.uuid, 'fuera del trazo, la referencia');

  // Opacidad propia × opacidad de capa
  sync.refresh();
  setReferenceOpacity([ref], 0.4);
  setLayerOpacity('layer-1', 0.5);
  assert(approx(ref.material.opacity, 0.2), 'opacidad de referencia (0.4) × capa (0.5)');
  setReferenceOpacity([ref], 0.8);
  assert(approx(ref.material.opacity, 0.4), 'cambiarla con la capa al 50% respeta la capa');
  setLayerOpacity('layer-1', 1);
  assert(approx(ref.material.opacity, 0.8), 'y la capa al 100% deja la propia');
  assert(ref.renderOrder < stroke.renderOrder, 'las referencias se dibujan debajo del dibujo');

  // Guardar / cargar
  const data = JSON.parse(JSON.stringify(serializeProject(scene)));
  assert(data.references.length === 1 && data.references[0].src === img.src && approx(data.references[0].opacity, 0.8), 'se guardan dentro del proyecto');
  const s2 = new THREE.Scene();
  loadProject(s2, createStrokeEngine(s2, c), data);
  const r2 = referenceMeshes(s2)[0];
  assert(r2 && r2.position.distanceTo(ref.position) < 1e-6 && approx(r2.userData.refOpacity, 0.8), 'y vuelven al cargar, en su lugar');
  loadProject(s2, createStrokeEngine(s2, c), data);
  assert(referenceMeshes(s2).length === 1, 'cargar otra vez no las duplica');
  const plain = createReferenceMesh({ ...img, layerId: 'x' });
  assert(plain.userData.reference && plain.material.transparent && !plain.material.depthWrite, 'material translúcido');
  loadReferences(s2, []);
  assert(serializeReferences(new THREE.Scene()).length === 0, 'sin referencias, lista vacía');
}

// ── Vista ortográfica ──
{
  const c = cam(1.5);
  const ctl = createCameraController(c);
  ctl.viewAlong(new THREE.Vector3(0, 0, 1), 0, { ortho: true });
  c.updateMatrixWorld();
  assert(ctl.isOrtho() && c.isOrthographicCamera && !c.isPerspectiveCamera, 'alinear con { ortho } entra en ortográfica');
  const rc = new THREE.Raycaster();
  rc.setFromCamera({ x: 0, y: 0 }, c); const d1 = rc.ray.direction.clone();
  rc.setFromCamera({ x: 0.8, y: -0.6 }, c); const d2 = rc.ray.direction.clone();
  assert(d1.angleTo(d2) < 1e-9, 'los rayos son paralelos (sin perspectiva)');
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const a = projectToPlane(c, 0.5, 0.5, plane);
  const plane2 = new THREE.Plane(new THREE.Vector3(0, 0, 1), 3); // 3 unidades más atrás
  const b = projectToPlane(c, 0.5, 0.5, plane2);
  assert(a && b && approx(a.x, b.x, 1e-6) && approx(a.y, b.y, 1e-6), 'el mismo punto de pantalla cae igual a cualquier profundidad');
  const sizeBefore = new THREE.Vector3(1, 0, 0).project(c).x;
  ctl.zoom(2);
  assert(approx(new THREE.Vector3(1, 0, 0).project(c).x, sizeBefore / 2, 1e-6), 'el zoom achica/agranda la vista');
  c.aspect = 2; c.updateProjectionMatrix();
  assert(c.isOrthographicCamera && approx(new THREE.Vector3(1, 0, 0).project(c).x, sizeBefore / 2 * 0.75, 1e-6), 'cambiar el tamaño de la ventana mantiene la ortográfica');
  ctl.orbit(20, 0);
  assert(!ctl.isOrtho() && c.isPerspectiveCamera, 'orbitar a mano vuelve a perspectiva (entró sola)');
  ctl.setOrtho(true);
  ctl.orbit(20, 0);
  assert(ctl.isOrtho(), 'si se activó a mano, orbitar la mantiene');
  let notified = 0;
  ctl.onProjectionChange(() => notified++);
  ctl.toggleOrtho();
  assert(!ctl.isOrtho() && notified === 1, 'alternar avisa a la interfaz');
  assert(approx(c.position.distanceTo(ctl.state.target), ctl.state.radius, 1e-6), 'en perspectiva la cámara vuelve a su distancia');
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
