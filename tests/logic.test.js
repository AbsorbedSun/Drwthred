// node tests/logic.test.js — cubre los arreglos de lógica/optimización de la fase 1
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState, subscribe } from '../js/core/store.js';
import { canUndo, undo, redo, pushAction, clearHistory, MAX_HISTORY } from '../js/core/history.js';
import { createStrokeEngine, buildRibbonGeometry } from '../js/drawing/stroke-engine.js';
import { eraseFull, erasePartial, createEraseBatch } from '../js/drawing/eraser.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import { createTransformController } from '../js/drawing/transform.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return { scene, camera, engine: createStrokeEngine(scene, camera) };
}
function drawLine(engine, from, to, n = 20, opts = {}) {
  engine.startStroke(from, { width: 0.05, color: '#ff0000', meta: { layerId: 'layer-1' }, ...opts });
  for (let i = 1; i <= n; i++) engine.addPoint(from.clone().lerp(to, i / n));
  return engine.endStroke().mesh;
}
const strokes = (scene) => scene.children.filter((o) => o.userData.strokePoints);

// ── Store: selectores y parches sin cambios ──
{
  let all = 0, sliced = 0;
  const u1 = subscribe(() => all++);
  const u2 = subscribe(() => sliced++, (s) => [s.layers, s.activeLayerId]);
  setState({ brushWidth: 0.07 });
  assert(all === 1 && sliced === 0, `un selector no debe dispararse por cambios ajenos (all=${all}, sliced=${sliced})`);
  setState({ brushWidth: 0.07 });
  assert(all === 1, 'un parche que no cambia nada no debe notificar');
  setState({ activeLayerId: 'otra' });
  assert(sliced === 1, 'el selector se dispara cuando cambia su porción');
  setState({ activeLayerId: 'layer-1' });
  u1(); u2();
}

// ── Trazo en vivo incremental = geometría completa ──
{
  const { scene, camera, engine } = setup();
  const pts = [];
  for (let i = 0; i < 300; i++) pts.push(new THREE.Vector3(Math.cos(i / 10), Math.sin(i / 10), i / 50)); // separación ≈ 0.1, ninguno se descarta
  engine.startStroke(pts[0], { width: 0.03, pressure: 1 });
  for (let i = 1; i < pts.length; i++) engine.addPoint(pts[i], 0.5 + 0.5 * Math.sin(i / 10));
  const live = scene.children[0].geometry;
  const ref = buildRibbonGeometry(pts, 0.03, camera.position, {
    widths: [1, ...pts.slice(1).map((_, k) => 0.5 + 0.5 * Math.sin((k + 1) / 10))],
  });
  const lp = live.getAttribute('position').array, rp = ref.getAttribute('position').array;
  let maxDiff = 0;
  for (let i = 0; i < rp.length; i++) maxDiff = Math.max(maxDiff, Math.abs(lp[i] - rp[i]));
  assert(maxDiff < 1e-5, `la cinta en vivo (incremental) debe coincidir con la completa (dif=${maxDiff})`);
  assert(live.drawRange.count === (pts.length - 1) * 6, 'el drawRange cubre exactamente los segmentos dibujados');
  const done = engine.endStroke();
  assert(done.mesh.geometry.getAttribute('position').count === pts.length * 2, 'al terminar, la geometría queda compacta');
  assert(done.mesh.frustumCulled === true, 'al terminar vuelve el frustum culling');
}

// ── Goma: una pasada = un solo deshacer ──
{
  const { scene, camera, engine } = setup();
  clearHistory();
  drawLine(engine, new THREE.Vector3(-1, 0.3, 0), new THREE.Vector3(1, 0.3, 0));
  drawLine(engine, new THREE.Vector3(-1, -0.3, 0), new THREE.Vector3(1, -0.3, 0));
  clearHistory();
  const batch = createEraseBatch(scene);
  // NDC de y=±0.3 en z=0 con la cámara a 5: 0.3 / (5 * tan(25°)) ≈ 0.129
  const ny = 0.3 / (5 * Math.tan(THREE.MathUtils.degToRad(25)));
  // (x = 0.013: no justo sobre la arista entre dos triángulos, caso límite de precisión)
  eraseFull(scene, camera, 0.013, ny, { batch });
  eraseFull(scene, camera, 0.013, -ny, { batch });
  assert(strokes(scene).length === 0, 'la pasada borra ambos trazos');
  assert(!canUndo(), 'durante la pasada no se apila nada');
  batch.commit();
  undo();
  assert(strokes(scene).length === 2, 'un solo deshacer devuelve los dos trazos');
  redo();
  assert(strokes(scene).length === 0, 'rehacer los vuelve a borrar juntos');
  assert(!canUndo() || (undo(), strokes(scene).length === 2), 'el historial tiene una sola entrada');

  // Pedazo creado y borrado en la misma pasada: el efecto neto no lo menciona
  clearHistory();
  scene.clear();
  drawLine(engine, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), 40);
  clearHistory();
  const b2 = createEraseBatch(scene);
  erasePartial(scene, camera, 0, 0, 0.2, { batch: b2 });
  const pieces = strokes(scene).length;
  eraseFull(scene, camera, -0.5 / (5 * Math.tan(THREE.MathUtils.degToRad(25))), 0, { batch: b2 });
  b2.commit();
  assert(pieces === 2 && strokes(scene).length === 1, 'corte + borrado de un pedazo en la misma pasada');
  undo();
  assert(strokes(scene).length === 1 && strokes(scene)[0].userData.strokePoints.length === 41,
    'deshacer la pasada devuelve el trazo ORIGINAL entero, no los pedazos');
}

// ── Goma parcial sobre un trazo transformado ──
{
  const { scene, camera, engine } = setup();
  clearHistory();
  const mesh = drawLine(engine, new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), 40);
  mesh.position.x += 0.5; // se movió medio a la derecha después de dibujarlo
  mesh.updateMatrixWorld();
  // Tocar el centro de pantalla (x=0 del mundo) = el punto x=-0.5 del trazo original
  const ok = erasePartial(scene, camera, 0, 0, 0.1);
  assert(ok, 'pega en el trazo movido');
  const pieces = strokes(scene);
  assert(pieces.length === 2, `parte el trazo en 2, quedaron ${pieces.length}`);
  // Los pedazos quedan donde se veía el trazo (mundo), no donde estaba originalmente
  const worldXs = pieces.flatMap((m) => {
    m.updateMatrixWorld();
    const c = m.userData.strokePoints.reduce((a, p) => a + p[0], 0) / m.userData.strokePoints.length;
    return m.userData.strokePoints.map((p) => m.localToWorld(new THREE.Vector3(p[0] - c, p[1], p[2])).x);
  });
  assert(Math.min(...worldXs) > -0.55 && Math.max(...worldXs) < 1.55, `los pedazos heredan la posición (x ∈ [${Math.min(...worldXs).toFixed(2)}, ${Math.max(...worldXs).toFixed(2)}])`);
  const nearCut = worldXs.filter((x) => Math.abs(x) < 0.09);
  assert(nearCut.length === 0, 'el hueco quedó donde se tocó en pantalla');
}

// ── Guardar/cargar: transformaciones, figuras, historial ──
{
  const { scene, camera, engine } = setup();
  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }], activeLayerId: 'layer-1' });
  const m = drawLine(engine, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  m.position.set(3, 2, 1);
  m.scale.setScalar(2);
  m.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);
  const cube = placePrimitive(scene, 'cone', new THREE.Vector3(-2, 1, 0), { color: '#123456', layerId: 'layer-1' });
  cube.rotation.x = 0.4; cube.updateMatrix();
  setState({ selectedId: cube.uuid }); // resaltada: el color guardado debe ser el real

  const data = JSON.parse(JSON.stringify(serializeProject(scene)));
  assert(data.version === 2, 'formato v2');
  assert(data.primitives.length === 1 && data.primitives[0].color === '#123456', 'se guardan las figuras con su color real');
  assert(data.strokes[0].transform, 'el trazo transformado guarda su transformación');

  const b = setup();
  pushAction({ undo() {}, redo() {} });
  loadProject(b.scene, b.engine, data);
  assert(!canUndo(), 'cargar vacía el historial');
  const m2 = b.scene.children.find((o) => o.userData.strokePoints);
  assert(m2.position.distanceTo(m.position) < 1e-4 && approx(m2.scale.x, 2) && m2.quaternion.angleTo(m.quaternion) < 1e-3,
    'el trazo vuelve con su posición, escala y rotación');
  const p2 = b.scene.children.find((o) => o.userData.primitiveKind);
  assert(p2 && p2.userData.primitiveKind === 'cone' && p2.position.distanceTo(cube.position) < 1e-4 && approx(p2.rotation.x, 0.4),
    'la figura vuelve con su tipo y transformación');
  const untouched = setup();
  drawLine(untouched.engine, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));
  assert(!serializeProject(untouched.scene).strokes[0].transform, 'un trazo sin mover no guarda transformación (archivo liviano)');
  setState({ selectedId: null });

  // v1 sigue cargando
  loadProject(b.scene, b.engine, { version: 1, layers: data.layers, activeLayerId: 'layer-1', strokes: [{ layerId: 'layer-1', color: '#fff', width: 0.02, points: [[0, 0, 0], [1, 0, 0]] }] });
  assert(b.scene.children.filter((o) => o.userData.strokePoints).length === 1, 'los archivos v1 siguen abriendo');
}

// ── Transform: lo seleccionado deshecho no bloquea la navegación ──
{
  const { scene, camera } = setup();
  clearHistory();
  const box = placePrimitive(scene, 'cube', new THREE.Vector3(), { layerId: 'layer-1' });
  setState({ selectedId: box.uuid, activeTool: 'select' });
  const t = createTransformController({ scene, camera });
  assert(t.isActive(), 'con algo seleccionado, 2 dedos transforman');
  undo(); // saca el cubo de la escena
  assert(!t.isActive(), 'si lo seleccionado ya no existe, 2 dedos vuelven a navegar');
  setState({ selectedId: null, activeTool: 'brush' });
}

// ── Historial con tope ──
{
  clearHistory();
  let undone = 0;
  for (let i = 0; i < MAX_HISTORY + 50; i++) pushAction({ undo: () => undone++, redo() {} });
  while (undo());
  assert(undone === MAX_HISTORY, `el historial se limita a ${MAX_HISTORY} pasos (deshizo ${undone})`);
  clearHistory();
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
