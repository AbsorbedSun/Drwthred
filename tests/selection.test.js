// node tests/selection.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState } from '../js/core/store.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { selectAt, clearSelection, syncSelectionHighlight } from '../js/drawing/selection.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const strokeEngine = createStrokeEngine(scene, camera);
strokeEngine.startStroke(new THREE.Vector3(-1, 0, 0), { color: '#ff0000', width: 0.08, meta: { layerId: 'L1' } });
strokeEngine.addPoint(new THREE.Vector3(1, 0, 0));
const done = strokeEngine.endStroke();
done.mesh.updateMatrixWorld();

syncSelectionHighlight(scene); // reactivo, se aplica solo desde acá en adelante

// ── Tocar el trazo lo selecciona ──
const originalHex = done.mesh.material.color.getHex();
const id = selectAt(scene, camera, 0, 0); // el trazo pasa por el centro de pantalla
assert(id === done.mesh.uuid, 'selectAt debe devolver el uuid del objeto tocado');
assert(getState().selectedId === done.mesh.uuid, 'selectAt debe guardar el id en el store');
assert(done.mesh.material.color.getHex() !== originalHex, 'el objeto seleccionado debe cambiar de color (resaltado reactivo)');

// ── Tocar el vacío deselecciona y restaura el color original ──
selectAt(scene, camera, 0.9, 0.9); // esquina, lejos del trazo
assert(getState().selectedId === null, 'tocar el vacío debe dejar selectedId en null');
assert(done.mesh.material.color.getHex() === originalHex, 'deseleccionar debe restaurar el color original exacto');

// ── clearSelection ──
selectAt(scene, camera, 0, 0);
assert(getState().selectedId !== null, 'debe haber algo seleccionado antes de la prueba de clearSelection');
clearSelection();
assert(getState().selectedId === null, 'clearSelection debe vaciar la selección');
assert(done.mesh.material.color.getHex() === originalHex, 'clearSelection también debe restaurar el color');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
