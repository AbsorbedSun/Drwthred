// node tests/layers-full.test.js — capas completas (fase 2)
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { undo, redo, canUndo, clearHistory } from '../js/core/history.js';
import {
  addLayer, renameLayer, deleteLayer, duplicateLayer, moveLayer, toggleLayerLock, setLayerOpacity,
  syncLayers, layerObjects, isLockedObject, normalizeLayer,
} from '../js/drawing/layers.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { hitTestAt, objectsInLasso, setSelection, selectedObjects } from '../js/drawing/selection.js';
import { eraseFull } from '../js/drawing/eraser.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
const ids = () => getState().layers.map((l) => l.id);

function reset() {
  clearHistory();
  setState({ layers: [{ id: 'A', name: 'Fondo', visible: true, locked: false, opacity: 1 }], activeLayerId: 'A', selectedIds: [] });
}
const cam = () => { const c = new THREE.PerspectiveCamera(50, 1, 0.01, 100); c.position.set(0, 0, 5); c.lookAt(0, 0, 0); c.updateMatrixWorld(); return c; };

// ── Renombrar ──
reset();
assert(renameLayer('A', '  Bocetos  ') && getState().layers[0].name === 'Bocetos', 'renombrar (recorta espacios)');
assert(!renameLayer('A', '   '), 'un nombre vacío no se acepta');
undo();
assert(getState().layers[0].name === 'Fondo', 'renombrar se deshace');

// ── Reordenar ──
reset();
const B = addLayer('B'), C = addLayer('C');
assert(ids().join() === `A,${B},${C}`, 'orden inicial (la última, arriba)');
moveLayer(C, 0);
assert(ids().join() === `${C},A,${B}`, 'mover C al fondo');
undo();
assert(ids().join() === `A,${B},${C}`, 'reordenar se deshace');
assert(!moveLayer(C, 2), 'moverla a donde ya está no hace nada');

// ── Opacidad: en vivo sin historial, un paso al soltar ──
reset();
setLayerOpacity('A', 0.8, { record: false });
setLayerOpacity('A', 0.5, { record: false });
assert(!canUndo(), 'arrastrar el slider no llena el historial');
setLayerOpacity('A', 0.4, { record: true, from: 1 });
assert(getState().layers[0].opacity === 0.4, 'al soltar queda el valor final');
undo();
assert(getState().layers[0].opacity === 1, 'UN deshacer vuelve al valor de antes de arrastrar');
redo();
assert(getState().layers[0].opacity === 0.4, 'rehacer');

// ── Sincronización: visibilidad, opacidad y orden ──
{
  reset();
  const scene = new THREE.Scene();
  const sync = syncLayers(scene);
  const B2 = addLayer('B');
  const a = placePrimitive(scene, 'cube', new THREE.Vector3(), { layerId: 'A', record: false });
  const b = placePrimitive(scene, 'cube', new THREE.Vector3(), { layerId: B2, record: false });
  sync.refresh();
  assert(b.renderOrder > a.renderOrder, 'la capa de arriba se dibuja encima');
  setLayerOpacity(B2, 0.5);
  assert(b.material.transparent && Math.abs(b.material.opacity - 0.5) < 1e-6 && !b.material.depthWrite, 'opacidad de capa aplicada al material');
  setLayerOpacity(B2, 1);
  assert(!b.material.transparent && b.material.opacity === 1 && b.material.depthWrite, 'al volver a 100% se restaura el material original');

  // Pincel translúcido: se multiplica con la opacidad de la capa
  const eng = createStrokeEngine(scene, cam());
  eng.startStroke(new THREE.Vector3(), { width: 0.1, brush: 'watercolor', meta: { layerId: B2 } });
  for (let i = 1; i < 6; i++) eng.addPoint(new THREE.Vector3(i * 0.1, 0, 0));
  const wc = eng.endStroke().mesh;
  setLayerOpacity(B2, 0.5);
  assert(Math.abs(wc.material.opacity - 0.38 * 0.5) < 1e-6, 'acuarela (0.38) en capa al 50% → 0.19');
  setLayerOpacity(B2, 1);
  assert(Math.abs(wc.material.opacity - 0.38) < 1e-6 && wc.material.transparent, 'y vuelve a 0.38, sigue translúcida');
}

// ── Bloquear ──
{
  reset();
  const scene = new THREE.Scene();
  const c = cam();
  const box = placePrimitive(scene, 'cube', new THREE.Vector3(), { layerId: 'A', record: false });
  const eng = createStrokeEngine(scene, c);
  eng.startStroke(new THREE.Vector3(-1, 0.5, 0), { width: 0.05, meta: { layerId: 'A' } });
  for (let i = 1; i <= 20; i++) eng.addPoint(new THREE.Vector3(-1 + i * 0.1, 0.5, 0));
  eng.endStroke();
  scene.updateMatrixWorld();
  assert(hitTestAt(scene, c, 0, 0) === box.uuid, 'sin bloquear, se puede tocar');
  setSelection([box.uuid]);
  toggleLayerLock('A');
  assert(isLockedObject(box), 'la capa queda bloqueada');
  assert(hitTestAt(scene, c, 0, 0) === null, 'bloqueada: tocar no agarra nada');
  assert(selectedObjects(scene).length === 0, 'lo seleccionado de una capa bloqueada no se puede transformar');
  const sq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({ x, y }));
  assert(objectsInLasso(scene, c, sq).length === 0, 'el lazo la ignora');
  const ny = 0.5 / (5 * Math.tan(THREE.MathUtils.degToRad(25)));
  assert(!eraseFull(scene, c, 0.013, ny), 'la goma no la borra');
  undo();
  assert(!isLockedObject(box) && hitTestAt(scene, c, 0, 0) === box.uuid, 'desbloquear (deshacer) la vuelve a habilitar');
}

// ── Eliminar y duplicar (con contenido) ──
{
  reset();
  const scene = new THREE.Scene();
  const B2 = addLayer('B');
  placePrimitive(scene, 'cube', new THREE.Vector3(), { layerId: B2, record: false });
  placePrimitive(scene, 'cone', new THREE.Vector3(), { layerId: B2, record: false });
  placePrimitive(scene, 'sphere', new THREE.Vector3(), { layerId: 'A', record: false });
  const dup = duplicateLayer(scene, B2);
  assert(ids().join() === `A,${B2},${dup}`, 'la copia queda justo encima del original');
  assert(getState().activeLayerId === dup && getState().layers[2].name === 'B (copia)', 'activa y con nombre "(copia)"');
  const copies = layerObjects(scene, dup);
  assert(copies.length === 2 && copies.every((o) => !layerObjects(scene, B2).includes(o)), 'con copias independientes de su contenido');
  copies[0].material.color.set('#123456');
  assert(layerObjects(scene, B2).every((o) => o.material.color.getHexString() !== '123456'), 'cambiar la copia no toca el original');
  undo();
  assert(ids().length === 2 && layerObjects(scene, dup).length === 0, 'deshacer quita la capa y sus copias');

  deleteLayer(scene, B2);
  assert(ids().join() === 'A' && layerObjects(scene, B2).length === 0, 'eliminar saca la capa y su contenido');
  assert(getState().activeLayerId === 'A', 'la activa pasa a la de abajo');
  assert(scene.children.filter((o) => o.userData.primitiveKind).length === 1, 'el contenido de otras capas queda');
  undo();
  assert(ids().length === 2 && layerObjects(scene, B2).length === 2, 'deshacer devuelve capa y contenido');
  assert(!deleteLayer(scene, 'A') || ids().length >= 1, 'nunca queda sin capas');
  reset();
  assert(!deleteLayer(scene, 'A'), 'la última capa no se puede eliminar');
}

// ── Guardar / cargar ──
{
  reset();
  const scene = new THREE.Scene();
  const B2 = addLayer('B');
  toggleLayerLock(B2);
  setLayerOpacity(B2, 0.3);
  const data = JSON.parse(JSON.stringify(serializeProject(scene)));
  assert(data.version === 3, 'formato v3');
  reset();
  const s2 = new THREE.Scene();
  loadProject(s2, createStrokeEngine(s2, cam()), data);
  const l = getState().layers.find((x) => x.name === 'B');
  assert(l && l.locked === true && l.opacity === 0.3, 'bloqueo y opacidad sobreviven');
  loadProject(s2, createStrokeEngine(s2, cam()), { version: 1, layers: [{ id: 'old', name: 'Vieja', visible: true }], activeLayerId: 'old', strokes: [] });
  const old = getState().layers[0];
  assert(old.locked === false && old.opacity === 1, 'archivos viejos reciben los valores por defecto');
  assert(JSON.stringify(normalizeLayer({ id: 'x', name: 'y' })) === JSON.stringify({ visible: true, locked: false, opacity: 1, id: 'x', name: 'y' }), 'normalizeLayer');
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
