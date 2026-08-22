// node tests/plane-projection.test.js
import * as THREE from '../js/vendor/three.module.js';
import { planeFacingCamera, projectToPlane } from '../js/drawing/plane-projection.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

// Cámara mirando derecho hacia el origen desde +Z
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(0, 0, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

const target = new THREE.Vector3(0, 0, 0);
const plane = planeFacingCamera(camera, target);

assert(approx(plane.distanceToPoint(target), 0), 'el plano debe contener el punto dado');
assert(approx(Math.abs(plane.normal.z), 1, 1e-2), `la normal del plano debe apuntar según la vista de la cámara (normal=${plane.normal.toArray()})`);

// Proyectar el centro de pantalla (NDC 0,0) debe caer muy cerca del target
const hitCenter = projectToPlane(camera, 0, 0, plane);
assert(hitCenter !== null, 'debe haber intersección en el centro de pantalla');
assert(approx(hitCenter.distanceTo(target), 0, 1e-2), `el centro de pantalla debe proyectar cerca del target (hit=${hitCenter.toArray()})`);

// Proyectar una esquina de pantalla debe caer lejos del centro, pero seguir en el plano
const hitCorner = projectToPlane(camera, 0.5, 0.5, plane);
assert(hitCorner !== null, 'debe haber intersección en una esquina de pantalla');
assert(hitCorner.distanceTo(target) > 0.1, 'una esquina de pantalla debe proyectar lejos del centro');
assert(approx(plane.distanceToPoint(hitCorner), 0, 1e-3), 'el punto proyectado debe estar sobre el plano');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
