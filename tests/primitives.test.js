// node tests/primitives.test.js
import * as THREE from '../js/vendor/three.module.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import { canUndo, undo, redo, _clearHistory } from '../js/core/history.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

_clearHistory();
const scene = new THREE.Scene();
const point = new THREE.Vector3(1, 2, 3);

['plane', 'cube', 'sphere', 'cylinder', 'cone', 'algo-inventado'].forEach((kind) => {
  const mesh = placePrimitive(scene, kind, point, { layerId: 'L1' });
  assert(mesh.position.equals(point), `${kind}: debe colocarse exactamente en el punto pedido`);
  assert(mesh.userData.primitiveKind === kind, `${kind}: debe guardar qué tipo de primitiva es`);
  assert(mesh.userData.layerId === 'L1', `${kind}: debe guardar la capa`);
  assert(mesh.geometry.attributes.position.count > 0, `${kind}: debe tener geometría real, no vacía`);
});
// 'algo-inventado' no es un tipo válido — debe caer a un default (cubo), no explotar
assert(scene.children.length === 6, `deben existir 6 primitivas en la escena, hay ${scene.children.length}`);

assert(canUndo(), 'colocar una primitiva debe entrar al historial');
const countBefore = scene.children.length;
undo();
assert(scene.children.length === countBefore - 1, 'deshacer debe sacar la última primitiva colocada');
redo();
assert(scene.children.length === countBefore, 'rehacer debe devolverla');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
