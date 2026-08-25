// node tests/stroke-engine.test.js
import * as THREE from '../js/vendor/three.module.js';
import { buildRibbonGeometry, createStrokeEngine } from '../js/drawing/stroke-engine.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

const camPos = new THREE.Vector3(0, 0, 5);

// ── buildRibbonGeometry: casos base ──
assert(buildRibbonGeometry([new THREE.Vector3()], 0.03, camPos) === null, 'con 1 solo punto no debe generar geometría');

const p2 = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0)];
const geo2 = buildRibbonGeometry(p2, 0.03, camPos);
assert(geo2 !== null, 'con 2 puntos sí debe generar geometría');
assert(geo2.attributes.position.count === 4, `2 puntos → 4 vértices (izq/der por punto), tiene ${geo2.attributes.position.count}`);
assert(geo2.index.count === 6, `2 puntos → 1 segmento → 2 triángulos → 6 índices, tiene ${geo2.index.count}`);

const p3 = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)];
const geo3 = buildRibbonGeometry(p3, 0.03, camPos);
assert(geo3.attributes.position.count === 6, `3 puntos → 6 vértices, tiene ${geo3.attributes.position.count}`);
assert(geo3.index.count === 12, `3 puntos → 2 segmentos → 4 triángulos → 12 índices, tiene ${geo3.index.count}`);

// ── El ancho de la cinta debe respetar el "width" pedido ──
const WIDTH = 0.08;
const geoW = buildRibbonGeometry(p2, WIDTH, camPos);
const pos = geoW.attributes.position;
const left0 = new THREE.Vector3(pos.getX(0), pos.getY(0), pos.getZ(0));
const right0 = new THREE.Vector3(pos.getX(1), pos.getY(1), pos.getZ(1));
assert(approx(left0.distanceTo(right0), WIDTH, 1e-3), `el ancho de la cinta debe ser ${WIDTH}, midió ${left0.distanceTo(right0)}`);

// ── createStrokeEngine: ciclo de vida completo ──
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.copy(camPos);
camera.lookAt(0, 0, 0);

const engine = createStrokeEngine(scene, camera);
assert(!engine.isDrawing(), 'al inicio no debe estar dibujando');

engine.startStroke(new THREE.Vector3(0, 0, 0), { width: 0.03, color: 0xffffff });
assert(engine.isDrawing(), 'tras startStroke debe estar dibujando');
assert(scene.children.length === 0, 'con un solo punto todavía no hay mesh (hace falta un segundo punto)');

engine.addPoint(new THREE.Vector3(0.5, 0, 0));
assert(scene.children.length === 1, `tras el 2do punto debe haber 1 mesh en la escena, hay ${scene.children.length}`);

// Punto degenerado (demasiado cerca) — no debe agregar vértices de más
const meshBefore = scene.children[0];
const vertsBefore = meshBefore.geometry.attributes.position.count;
engine.addPoint(new THREE.Vector3(0.5001, 0, 0)); // a menos del 35% del ancho de distancia
const vertsAfterDegenerate = scene.children[0].geometry.attributes.position.count;
assert(vertsBefore === vertsAfterDegenerate, 'un punto demasiado cerca del anterior no debe agregarse');

engine.addPoint(new THREE.Vector3(1, 0.5, 0)); // punto real, lejos
const vertsAfterReal = scene.children[0].geometry.attributes.position.count;
assert(vertsAfterReal > vertsBefore, 'un punto suficientemente lejos sí debe agregar geometría');

const finishedStroke = engine.endStroke();
assert(!engine.isDrawing(), 'tras endStroke ya no debe estar dibujando');
assert(finishedStroke !== null, 'endStroke debe devolver el trazo terminado');
assert(engine.finished.length === 1, 'el trazo terminado debe quedar registrado');
assert(scene.children.length === 1, 'el mesh del trazo debe seguir en la escena tras terminarlo');

// ── El pivote del mesh queda en el centroide del trazo, no en el origen
// del mundo — necesario para poder escalar/rotar sobre el trazo mismo
// más adelante, no que "vuele" desde (0,0,0). ──
{
  const scene2 = new THREE.Scene();
  const camera2 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera2.position.copy(camPos);
  const engine2 = createStrokeEngine(scene2, camera2);
  const pA = new THREE.Vector3(10, 0, 0), pB = new THREE.Vector3(20, 0, 0);
  engine2.startStroke(pA, { width: 0.03 });
  engine2.addPoint(pB);
  const done2 = engine2.endStroke();
  const expectedCentroid = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);
  assert(approx(done2.mesh.position.x, expectedCentroid.x) && approx(done2.mesh.position.y, expectedCentroid.y),
    `mesh.position debe quedar en el centroide (${expectedCentroid.x},${expectedCentroid.y}), quedó (${done2.mesh.position.x},${done2.mesh.position.y})`);
  // El vértice más cercano a pA, medido en coordenadas LOCALES (relativas
  // al pivote), no debe seguir en (10,0,0) absoluto — debe estar cerca de
  // pA - centroide, confirmando que la geometría se corrió al centrar.
  const localX = done2.mesh.geometry.attributes.position.getX(0);
  assert(!approx(localX, 10, 1), `la geometría debe quedar relativa al centroide, no en coordenadas absolutas (x local=${localX})`);
  // Pero el punto MUNDO (posición del mesh + vértice local) debe seguir
  // coincidiendo con el trazo dibujado — nada se movió visualmente.
  const worldX = done2.mesh.position.x + localX;
  assert(approx(worldX, pA.x, 0.01) || approx(worldX, pB.x, 0.01), `el vértice en coordenadas de mundo debe seguir coincidiendo con el trazo original (x mundo=${worldX})`);
  // userData.strokePoints tiene que seguir en coordenadas absolutas —
  // de eso depende el guardado/carga, no debe cambiar con este fix.
  assert(approx(done2.mesh.userData.strokePoints[0][0], 10), 'userData.strokePoints debe seguir siendo coordenadas absolutas del mundo');
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
