// node tests/save-load.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

function freshScene() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  const strokeEngine = createStrokeEngine(scene, camera);
  return { scene, camera, strokeEngine };
}

// ── Preparar un estado con 2 capas y 2 trazos, uno en cada una ──
setState({
  layers: [
    { id: 'L1', name: 'Capa 1', visible: true },
    { id: 'L2', name: 'Capa 2', visible: false }, // una oculta, a propósito
  ],
  activeLayerId: 'L2',
  savedViews: [{ id: 'V1', name: 'Vista A', theta: 1, phi: 1, radius: 3, target: [0, 0, 0] }],
});

const { scene, strokeEngine } = freshScene();
strokeEngine.startStroke(new THREE.Vector3(0, 0, 0), { color: '#ff0000', width: 0.02, meta: { layerId: 'L1' } });
strokeEngine.addPoint(new THREE.Vector3(1, 0, 0));
strokeEngine.addPoint(new THREE.Vector3(1, 1, 0));
strokeEngine.endStroke();

strokeEngine.startStroke(new THREE.Vector3(5, 5, 5), { color: '#00ff00', width: 0.05, meta: { layerId: 'L2' } });
strokeEngine.addPoint(new THREE.Vector3(6, 5, 5));
strokeEngine.endStroke();

// ── Serializar ──
const data = serializeProject(scene);
assert(data.version === 1, 'debe traer un número de versión');
assert(data.layers.length === 2, `debe serializar las 2 capas, serializó ${data.layers.length}`);
assert(data.layers[1].visible === false, 'debe respetar la visibilidad de cada capa, no solo la activa');
assert(data.activeLayerId === 'L2', 'debe serializar la capa activa');
assert(data.savedViews.length === 1, 'debe serializar las vistas guardadas');
assert(data.savedViews[0].name === 'Vista A', 'debe preservar el nombre de la vista');
assert(data.strokes.length === 2, `debe serializar los 2 trazos, serializó ${data.strokes.length}`);

const s1 = data.strokes.find((s) => s.layerId === 'L1');
assert(s1 !== undefined, 'debe encontrarse el trazo de L1');
assert(s1.color === '#ff0000', `debe preservar el color exacto, quedó ${s1.color}`);
assert(approx(s1.width, 0.02), 'debe preservar el ancho exacto');
assert(s1.points.length === 3, `debe preservar los 3 puntos del trazo, tiene ${s1.points.length}`);
assert(approx(s1.points[1][0], 1), 'debe preservar las coordenadas de cada punto');

// ── Cargar en una escena NUEVA y vacía, y confirmar reconstrucción fiel ──
const { scene: scene2, strokeEngine: strokeEngine2 } = freshScene();
loadProject(scene2, strokeEngine2, data);

assert(getState().layers.length === 2, 'loadProject debe restaurar las capas en el store');
assert(getState().activeLayerId === 'L2', 'loadProject debe restaurar la capa activa');
assert(getState().savedViews.length === 1, 'loadProject debe restaurar las vistas guardadas');

const strokesInScene = scene2.children.filter((o) => o.userData && o.userData.strokePoints);
assert(strokesInScene.length === 2, `debe reconstruir 2 meshes de trazo, hay ${strokesInScene.length}`);

// ── Round-trip: serializar de nuevo la escena reconstruida y comparar ──
const data2 = serializeProject(scene2);
assert(JSON.stringify(data.layers) === JSON.stringify(data2.layers), 'las capas deben sobrevivir un round-trip completo');
assert(data.strokes.length === data2.strokes.length, 'la cantidad de trazos debe sobrevivir el round-trip');
const s1b = data2.strokes.find((s) => s.layerId === 'L1');
assert(s1b.color === s1.color && approx(s1b.width, s1.width), 'color/ancho deben sobrevivir el round-trip');
assert(JSON.stringify(s1b.points) === JSON.stringify(s1.points), 'los puntos exactos deben sobrevivir el round-trip');

// ── loadProject debe limpiar los trazos previos antes de reconstruir ──
// (si cargo el mismo proyecto una segunda vez sobre scene2, no debe duplicar)
loadProject(scene2, strokeEngine2, data2);
const strokesAfterReload = scene2.children.filter((o) => o.userData && o.userData.strokePoints);
assert(strokesAfterReload.length === 2, `cargar de nuevo no debe duplicar trazos, hay ${strokesAfterReload.length}`);

// ── Formato desconocido debe fallar explícito, no en silencio ──
let threw = false;
try { loadProject(scene2, strokeEngine2, { version: 99 }); } catch (e) { threw = true; }
assert(threw, 'cargar un formato de versión desconocida debe tirar un error, no fallar en silencio');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
