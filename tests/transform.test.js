// node tests/transform.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { createTransformController } from '../js/drawing/transform.js';
import { canUndo, undo, redo, _clearHistory } from '../js/core/history.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-3) { return Math.abs(a - b) < eps; }

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
box.position.set(0, 0, 0);
box.userData.primitiveKind = 'cube';
scene.add(box);

const transform = createTransformController({ scene, camera });

// ── isActive() depende de selección + herramienta ──
setState({ selectedId: null, activeTool: 'select' });
assert(transform.isActive() === false, 'sin nada seleccionado, no debe estar activo');
setState({ selectedId: box.uuid, activeTool: 'brush' });
assert(transform.isActive() === false, 'con el pincel activo, no debe interferir aunque haya algo seleccionado');
setState({ selectedId: box.uuid, activeTool: 'select' });
assert(transform.isActive() === true, 'con selección activa y algo seleccionado, sí debe estar activo');
setState({ selectedId: box.uuid, activeTool: 'shapes' });
assert(transform.isActive() === true, 'con figuras activo y algo seleccionado, también debe estar activo');

// ── Mover (1 dedo) ──
_clearHistory();
setState({ selectedId: box.uuid, activeTool: 'select' });
const posBefore = box.position.clone();
const started = transform.startMove(0, 0);
assert(started === true, 'startMove debe devolver true si hay algo seleccionado');
assert(transform.isMoving() === true, 'isMoving debe ser true tras startMove');
transform.moveTo(0.3, 0.1); // arrastrar hacia la derecha/arriba en pantalla
assert(!box.position.equals(posBefore), 'moveTo debe cambiar la posición');
transform.endMove();
assert(transform.isMoving() === false, 'isMoving debe volver a false tras endMove');
const posAfterMove = box.position.clone();
assert(canUndo(), 'mover debe entrar al historial');
undo();
assert(box.position.equals(posBefore), 'deshacer el movimiento debe devolver la posición exacta original');
redo();
assert(box.position.equals(posAfterMove), 'rehacer debe volver a la posición movida');

// ── Escalar + rotar (2 dedos) ──
_clearHistory();
box.position.copy(posAfterMove);
const scaleBefore = box.scale.clone();
const quatBefore = box.quaternion.clone();

const pts0 = [{ x: -0.1, y: 0 }, { x: 0.1, y: 0 }]; // distancia inicial = 0.2
const startedSR = transform.startScaleRotate(pts0);
assert(startedSR === true, 'startScaleRotate debe devolver true con algo seleccionado');
assert(transform.isScalingRotating() === true, 'isScalingRotating debe ser true tras empezar');

// Separar los dedos al doble de distancia -> escala x2
const pts1 = [{ x: -0.2, y: 0 }, { x: 0.2, y: 0 }]; // distancia = 0.4 = 2x
transform.updateScaleRotate(pts1);
assert(approx(box.scale.x, scaleBefore.x * 2, 0.05), `separar los dedos al doble debe escalar x2 (scale.x=${box.scale.x})`);

// Girar los dedos 90° -> el objeto debe rotar (quaternion distinto)
const pts2 = [{ x: 0, y: -0.2 }, { x: 0, y: 0.2 }]; // mismo largo, girado 90°
transform.updateScaleRotate(pts2);
assert(!box.quaternion.equals(quatBefore), 'girar los dedos 90° debe rotar el objeto');

transform.endScaleRotate();
assert(transform.isScalingRotating() === false, 'isScalingRotating debe volver a false tras terminar');
const scaleAfter = box.scale.clone(), quatAfter = box.quaternion.clone();
assert(canUndo(), 'escalar/rotar debe entrar al historial');
undo();
assert(box.scale.equals(scaleBefore) && box.quaternion.equals(quatBefore), 'deshacer debe restaurar escala Y rotación originales exactas');
redo();
assert(box.scale.equals(scaleAfter) && box.quaternion.equals(quatAfter), 'rehacer debe volver al estado transformado');

// ── Sin nada seleccionado, no debe explotar ──
setState({ selectedId: null, activeTool: 'select' });
assert(transform.startMove(0, 0) === false, 'startMove sin selección debe devolver false');
assert(transform.startScaleRotate(pts0) === false, 'startScaleRotate sin selección debe devolver false');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
