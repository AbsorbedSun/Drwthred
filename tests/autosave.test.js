// node tests/autosave.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { canUndo, pushAction, clearHistory } from '../js/core/history.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import { createAutosave, memoryStorage, timeAgo, hasContent } from '../js/persistence/autosave.js';
import { newProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  return { scene, camera, engine: createStrokeEngine(scene, camera) };
}
function draw(engine) {
  engine.startStroke(new THREE.Vector3(0, 0, 0), { width: 0.02, color: '#ff0000', meta: { layerId: 'layer-1' } });
  for (let i = 1; i <= 10; i++) engine.addPoint(new THREE.Vector3(i * 0.1, 0, 0));
  return engine.endStroke().mesh;
}

// ── Guarda después de la pausa, agrupando ráfagas ──
{
  const storage = memoryStorage();
  let writes = 0;
  const counting = { ...storage, set: async (k, v) => { writes++; return storage.set(k, v); } };
  const { scene, engine } = setup();
  const statuses = [];
  const auto = createAutosave({ scene, strokeEngine: engine, storage: counting, delay: 30, onStatus: (s) => statuses.push(s) });
  draw(engine);
  auto.schedule(); auto.schedule(); auto.schedule(); // 3 cambios seguidos
  assert(writes === 0, 'no guarda en el acto: espera la pausa');
  await sleep(60);
  assert(writes === 1, `una ráfaga de cambios = una sola escritura (hubo ${writes})`);
  assert(statuses.includes('saved'), 'avisa que guardó');
  const saved = await storage.get('autosave');
  assert(saved && saved.strokes.length === 1 && typeof saved.savedAt === 'number', 'lo guardado es el proyecto, con fecha');

  // saveNow fuerza (pestaña oculta) y no escribe si no hay cambios
  await auto.saveNow();
  assert(writes === 1, 'sin cambios pendientes, saveNow no escribe');
  auto.schedule();
  await auto.saveNow();
  assert(writes === 2, 'con cambios pendientes, saveNow escribe ya mismo');
}

// ── Recuperar al abrir ──
{
  const storage = memoryStorage();
  const a = setup();
  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }, { id: 'L2', name: 'Bocetos', visible: true }], activeLayerId: 'L2' });
  draw(a.engine);
  placePrimitive(a.scene, 'cube', new THREE.Vector3(1, 2, 3), { record: false, layerId: 'layer-1' });
  const autoA = createAutosave({ scene: a.scene, strokeEngine: a.engine, storage, delay: 5 });
  autoA.schedule();
  await autoA.saveNow();

  setState({ layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }], activeLayerId: 'layer-1' });
  const b = setup();
  pushAction({ undo() {}, redo() {} });
  let wrote = false;
  const autoB = createAutosave({ scene: b.scene, strokeEngine: b.engine, storage: { ...storage, set: async (k, v) => { wrote = true; return storage.set(k, v); } }, delay: 5 });
  const data = await autoB.restore();
  assert(data && b.scene.children.filter((o) => o.userData.strokePoints).length === 1, 'recupera los trazos');
  assert(b.scene.children.some((o) => o.userData.primitiveKind === 'cube'), 'y las figuras');
  assert(getState().layers.length === 2 && getState().activeLayerId === 'L2', 'y las capas');
  assert(!canUndo(), 'el historial empieza vacío (no se "deshace" la recuperación)');
  assert(!autoB.dirty && !wrote, 'recuperar no programa un guardado nuevo');

  const empty = createAutosave({ scene: setup().scene, strokeEngine: setup().engine, storage: memoryStorage() });
  assert((await empty.restore()) === null, 'sin nada guardado, restore devuelve null');
  assert(!hasContent({ strokes: [], primitives: [] }), 'un proyecto vacío no cuenta como contenido');
}

// ── Si el almacenamiento falla: avisa una vez y reintenta ──
{
  const { scene, engine } = setup();
  let broken = true;
  const statuses = [];
  const storage = { get: async () => undefined, remove: async () => {}, set: async () => { if (broken) throw new Error('QuotaExceeded'); } };
  const auto = createAutosave({ scene, strokeEngine: engine, storage, delay: 5, onStatus: (s) => statuses.push(s) });
  draw(engine);
  auto.schedule(); await auto.saveNow();
  auto.schedule(); await auto.saveNow();
  assert(statuses.filter((s) => s === 'error').length === 1, 'el error se avisa UNA vez, no en cada intento');
  assert(auto.failed && auto.dirty, 'queda marcado para reintentar');
  broken = false;
  await auto.saveNow();
  assert(statuses.includes('recovered') && !auto.failed, 'cuando vuelve a funcionar, avisa y sigue');
}

// ── Dibujo nuevo ──
{
  const { scene, engine } = setup();
  scene.add(new THREE.GridHelper(10, 20)); // como en la app (core/scene.js)
  draw(engine);
  placePrimitive(scene, 'sphere', new THREE.Vector3(), { record: true });
  setState({ layers: [{ id: 'x', name: 'Otra', visible: true }], activeLayerId: 'x', savedViews: [{ id: 'v' }] });
  newProject(scene);
  assert(!scene.children.some((o) => o.userData.strokePoints || o.userData.primitiveKind), 'Dibujo nuevo vacía la escena');
  assert(scene.children.some((o) => o.type === 'GridHelper'), 'pero deja la grilla del piso');
  assert(getState().layers.length === 1 && getState().activeLayerId === 'layer-1' && getState().savedViews.length === 0, 'y vuelve a una capa, sin vistas');
  assert(!canUndo(), 'con el historial vacío');
  clearHistory();
}

// ── Texto de "hace cuánto" ──
const now = 1_000_000_000_000;
assert(timeAgo(now - 20_000, now) === 'hace un momento', 'segundos');
assert(timeAgo(now - 5 * 60_000, now) === 'hace 5 min', 'minutos');
assert(timeAgo(now - 3 * 3600_000, now) === 'hace 3 h', 'horas');
assert(timeAgo(now - 26 * 3600_000, now) === 'ayer', 'ayer');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
