// Test rápido, sin framework — corre con: node js/core/camera-controller.test.js
import * as THREE from '../js/vendor/three.module.js';
import { createCameraController } from '../js/core/camera-controller.js';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('FALLÓ:', msg); }
}
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

// ── Estado inicial ──
const cam1 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl1 = createCameraController(cam1);
const dist1 = cam1.position.distanceTo(ctl1.state.target);
assert(approx(dist1, ctl1.state.radius), `la cámara debe estar a "radius" del target al iniciar (dist=${dist1}, radius=${ctl1.state.radius})`);

// ── Orbit cambia theta/phi y mueve la cámara, sin tocar el radio ──
const cam2 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl2 = createCameraController(cam2);
const thetaBefore = ctl2.state.theta, phiBefore = ctl2.state.phi;
const posBefore = cam2.position.clone();
ctl2.orbit(50, 20);
assert(ctl2.state.theta !== thetaBefore, 'orbit debe cambiar theta');
assert(ctl2.state.phi !== phiBefore, 'orbit debe cambiar phi');
assert(!cam2.position.equals(posBefore), 'orbit debe mover la posición de la cámara');
assert(approx(cam2.position.distanceTo(ctl2.state.target), ctl2.state.radius), 'orbit no debe alterar la distancia al target');

// ── Phi se clampea — no se puede pasar el "polo" ──
const cam3 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl3 = createCameraController(cam3);
ctl3.orbit(0, -100000); // dy enorme negativo → intenta empujar phi muy arriba
assert(ctl3.state.phi <= Math.PI - 0.06 + 1e-6, `phi debe quedar clampeado (phi=${ctl3.state.phi})`);
ctl3.orbit(0, 100000000);
assert(ctl3.state.phi >= 0.06 - 1e-6, `phi no debe bajar del mínimo (phi=${ctl3.state.phi})`);

// ── Zoom cambia el radio y se clampea en los extremos ──
const cam4 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl4 = createCameraController(cam4);
const radiusBefore = ctl4.state.radius;
ctl4.zoom(0.5);
assert(approx(ctl4.state.radius, radiusBefore * 0.5), `zoom(0.5) debe reducir el radio a la mitad (radius=${ctl4.state.radius})`);
for (let i = 0; i < 30; i++) ctl4.zoom(0.1); // forzar muy por debajo del mínimo
assert(ctl4.state.radius >= 0.4 - 1e-6, `el radio no debe bajar de MIN_RADIUS (radius=${ctl4.state.radius})`);
for (let i = 0; i < 30; i++) ctl4.zoom(10); // forzar muy por encima del máximo
assert(ctl4.state.radius <= 40 + 1e-6, `el radio no debe superar MAX_RADIUS (radius=${ctl4.state.radius})`);

// ── Pan mueve el target, la cámara lo sigue manteniendo el radio ──
const cam5 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl5 = createCameraController(cam5);
const targetBefore = ctl5.state.target.clone();
ctl5.pan(40, 0);
assert(!ctl5.state.target.equals(targetBefore), 'pan debe mover el target');
assert(approx(cam5.position.distanceTo(ctl5.state.target), ctl5.state.radius), 'pan no debe alterar la distancia al target');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
