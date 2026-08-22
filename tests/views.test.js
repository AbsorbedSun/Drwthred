// node tests/views.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { createCameraController } from '../js/core/camera-controller.js';
import { saveView, applyView, deleteView } from '../js/core/views.js';
import { canUndo, undo, _clearHistory } from '../js/core/history.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

setState({ savedViews: [] });
_clearHistory();

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const camCtl = createCameraController(camera);

// ── Guardar una vista captura el estado actual de la cámara ──
camCtl.orbit(120, 40);
camCtl.zoom(0.6);
const savedTheta = camCtl.state.theta, savedPhi = camCtl.state.phi, savedRadius = camCtl.state.radius;

const id = saveView(camCtl, 'Mi vista');
assert(getState().savedViews.length === 1, 'saveView debe agregar una vista al store');
assert(getState().savedViews[0].name === 'Mi vista', 'debe respetar el nombre pedido');
assert(approx(getState().savedViews[0].theta, savedTheta), 'debe guardar el theta actual');
assert(canUndo(), 'guardar una vista debe entrar al historial');

// ── Mover la cámara a otro lado, aplicar la vista, y volver exacto ──
camCtl.orbit(-500, -300);
camCtl.zoom(3);
assert(!approx(camCtl.state.theta, savedTheta), 'la cámara debe haberse movido de la posición guardada');

const applied = applyView(camCtl, id);
assert(applied === true, 'applyView debe devolver true si la vista existe');
assert(approx(camCtl.state.theta, savedTheta), `applyView debe restaurar theta exacto (esperado ${savedTheta}, quedó ${camCtl.state.theta})`);
assert(approx(camCtl.state.phi, savedPhi), 'applyView debe restaurar phi exacto');
assert(approx(camCtl.state.radius, savedRadius), 'applyView debe restaurar radius exacto');
assert(approx(camera.position.distanceTo(camCtl.state.target), camCtl.state.radius), 'tras aplicar la vista, la cámara sigue a "radius" del target');

assert(applyView(camCtl, 'id-que-no-existe') === false, 'applyView con un id inexistente debe devolver false, no explotar');

// ── deleteView ──
deleteView(id);
assert(getState().savedViews.length === 0, 'deleteView debe sacar la vista del store');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
