// node tests/eraser.test.js
import * as THREE from '../js/vendor/three.module.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { eraseFull, erasePartial } from '../js/drawing/eraser.js';
import { canUndo, undo, redo, _clearHistory } from '../js/core/history.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

function setup() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const strokeEngine = createStrokeEngine(scene, camera);
  return { scene, camera, strokeEngine };
}

function strokesIn(scene) {
  return scene.children.filter((o) => o.userData && o.userData.strokePoints);
}

// ── eraseFull: tocar un trazo lo saca entero ──
_clearHistory();
{
  const { scene, camera, strokeEngine } = setup();
  strokeEngine.startStroke(new THREE.Vector3(-1, 0, 0), { color: '#fff', width: 0.05, meta: { layerId: 'L1' } });
  strokeEngine.addPoint(new THREE.Vector3(1, 0, 0));
  strokeEngine.endStroke();
  strokesIn(scene)[0].updateMatrixWorld();

  const missed = eraseFull(scene, camera, 0.9, 0.9); // esquina, lejos del trazo
  assert(missed === false, 'eraseFull no debe borrar nada si el toque no pega en ningún trazo');
  assert(strokesIn(scene).length === 1, 'el trazo debe seguir ahí tras un toque que no pega');

  const hit = eraseFull(scene, camera, 0, 0); // centro, el trazo pasa por el origen
  assert(hit === true, 'eraseFull debe devolver true si borró algo');
  assert(strokesIn(scene).length === 0, 'eraseFull debe sacar el trazo de la escena');
  assert(canUndo(), 'borrar debe entrar al historial');

  undo();
  assert(strokesIn(scene).length === 1, 'deshacer un borrado debe devolver el trazo');
}

// ── erasePartial: solo saca la parte tocada, el resto sobrevive en 1 o 2 trazos ──
_clearHistory();
{
  const { scene, camera, strokeEngine } = setup();
  // Trazo horizontal largo de -2 a 2 en X, con puntos cada 0.2 unidades
  strokeEngine.startStroke(new THREE.Vector3(-2, 0, 0), { color: '#fff', width: 0.03, meta: { layerId: 'L1' } });
  for (let x = -1.8; x <= 2; x += 0.2) strokeEngine.addPoint(new THREE.Vector3(x, 0, 0));
  strokeEngine.endStroke();
  strokesIn(scene)[0].updateMatrixWorld();
  assert(strokesIn(scene).length === 1, 'debe empezar con 1 solo trazo largo');

  // Borrar en el medio (x≈0) debe partirlo en DOS trazos
  const hit = erasePartial(scene, camera, 0, 0, 0.3);
  assert(hit === true, 'erasePartial debe devolver true si pegó en algo');
  const remaining = strokesIn(scene);
  assert(remaining.length === 2, `borrar el medio debe dejar 2 trazos separados, quedaron ${remaining.length}`);

  // Cada mitad debe tener menos puntos que el original, y ningún punto
  // remanente debe estar cerca de x=0 (donde se borró)
  remaining.forEach((mesh) => {
    const pts = mesh.userData.strokePoints;
    pts.forEach((p) => assert(Math.abs(p[0]) > 0.29, `no debe quedar ningún punto dentro del radio borrado (x=${p[0]})`));
  });

  assert(canUndo(), 'el borrado parcial debe entrar al historial');
  undo();
  assert(strokesIn(scene).length === 1, 'deshacer el borrado parcial debe devolver el trazo original completo');
  redo();
  assert(strokesIn(scene).length === 2, 'rehacer debe volver a partirlo en 2');
}

// ── erasePartial en la punta del trazo: debe quedar 1 solo trazo más corto, no 2 ──
_clearHistory();
{
  const { scene, camera, strokeEngine } = setup();
  strokeEngine.startStroke(new THREE.Vector3(0, 0, 0), { color: '#fff', width: 0.03, meta: { layerId: 'L1' } });
  for (let x = 0.2; x <= 2; x += 0.2) strokeEngine.addPoint(new THREE.Vector3(x, 0, 0));
  strokeEngine.endStroke();

  erasePartial(scene, camera, 0, 0, 0.3); // borra la punta cerca de x=0
  const remaining = strokesIn(scene);
  assert(remaining.length === 1, `borrar la punta debe dejar 1 solo trazo, quedaron ${remaining.length}`);
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
