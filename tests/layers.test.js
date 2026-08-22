// node tests/layers.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import { addLayer, setActiveLayer, toggleLayerVisibility, syncLayerVisibility } from '../js/drawing/layers.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

// ── Estado inicial: "Capa 1" por defecto ──
assert(getState().layers.length === 1, `debe arrancar con 1 capa, tiene ${getState().layers.length}`);
assert(getState().activeLayerId === getState().layers[0].id, 'la capa por defecto debe ser la activa');

// ── addLayer agrega y activa la nueva ──
const newId = addLayer('Mi capa');
assert(getState().layers.length === 2, 'addLayer debe agregar una capa');
assert(getState().activeLayerId === newId, 'addLayer debe activar la capa recién creada');
assert(getState().layers[1].name === 'Mi capa', 'addLayer debe respetar el nombre pedido');
assert(getState().layers[0].visible === true, 'addLayer no debe tocar las capas existentes');

// ── setActiveLayer cambia la activa sin tocar nada más ──
const firstId = getState().layers[0].id;
setActiveLayer(firstId);
assert(getState().activeLayerId === firstId, 'setActiveLayer debe cambiar activeLayerId');
assert(getState().layers.length === 2, 'setActiveLayer no debe crear ni borrar capas');

// ── toggleLayerVisibility solo toca esa capa ──
toggleLayerVisibility(newId);
assert(getState().layers.find(l => l.id === newId).visible === false, 'toggleLayerVisibility debe ocultar la capa');
assert(getState().layers.find(l => l.id === firstId).visible === true, 'toggleLayerVisibility no debe tocar otras capas');
toggleLayerVisibility(newId);
assert(getState().layers.find(l => l.id === newId).visible === true, 'toggleLayerVisibility debe volver a mostrarla');

// ── syncLayerVisibility: reactivo, aplica a scene.children por userData.layerId ──
const scene = new THREE.Scene();
const meshA = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
meshA.userData.layerId = firstId;
const meshB = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
meshB.userData.layerId = newId;
scene.add(meshA, meshB);

syncLayerVisibility(scene); // aplica el estado actual al conectarse
assert(meshA.visible === true && meshB.visible === true, 'al conectar, ambas capas visibles deben quedar mesh.visible=true');

toggleLayerVisibility(firstId); // esto dispara setState -> notifica -> vuelve a aplicar sola
assert(meshA.visible === false, 'ocultar la capa de meshA debe reflejarse SOLO (reactivo), sin llamar nada más');
assert(meshB.visible === true, 'meshB no debe verse afectado por ocultar la otra capa');

toggleLayerVisibility(firstId); // la mostramos de nuevo
assert(meshA.visible === true, 'volver a mostrarla debe reflejarse también solo');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
