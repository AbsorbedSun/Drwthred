// node tests/draw-planes.test.js
import * as THREE from '../js/vendor/three.module.js';
import { getState, setState } from '../js/core/store.js';
import {
  resolvePlane, setPlaneMode, setPlaneOffset, planeThroughPoint, captureViewPlane,
  planeCenter, facingFactor, snapOffset, mirrorPoint, mirrorNormal, toggleMirror,
} from '../js/drawing/draw-planes.js';
import { projectToPlane } from '../js/drawing/plane-projection.js';
import { buildRibbonGeometry, createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { pressureFactor } from '../js/input/tool-router.js';
import { createCameraController } from '../js/core/camera-controller.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
camera.position.set(3, 4, 5);
camera.lookAt(0, 0, 0);
camera.updateMatrixWorld();

// ── Estado inicial: plano libre ──
assert(getState().drawPlane.mode === 'view', 'el plano inicial debe ser el libre (view)');
const anchor = new THREE.Vector3(0.5, 0.2, -0.3);
const free = resolvePlane(getState().drawPlane, camera, anchor);
assert(approx(free.distanceToPoint(anchor), 0), 'el plano libre debe pasar por el anclaje');

// ── Preset suelo, pasando por el target ──
setPlaneMode('ground', { target: new THREE.Vector3(1, 0.52, 2) });
let spec = getState().drawPlane;
assert(spec.mode === 'ground', 'setPlaneMode debe activar el preset');
assert(approx(spec.offset, 0.5), `el offset se redondea a 0.05 y pasa cerca del target (offset=${spec.offset})`);
const ground = resolvePlane(spec, camera, anchor);
const hit = projectToPlane(camera, 0.1, -0.2, ground);
assert(hit && approx(hit.y, 0.5, 1e-4), `un trazo sobre el suelo debe caer en y = offset (y=${hit && hit.y})`);
assert(approx(resolvePlane(spec, camera, new THREE.Vector3(9, 9, 9)).constant, -0.5), 'un plano fijo ignora el anclaje');

// ── Offset y "llevar el plano a un punto" ──
setPlaneOffset(1.234);
assert(approx(getState().drawPlane.offset, 1.25), 'setPlaneOffset redondea a la grilla');
planeThroughPoint(new THREE.Vector3(7, -2, 3), camera);
assert(approx(getState().drawPlane.offset, -2), 'planeThroughPoint mueve el plano sin rotarlo');
assert(getState().drawPlane.mode === 'ground', 'planeThroughPoint conserva la orientación');

// ── Centro de la guía ──
const c = planeCenter(getState().drawPlane, new THREE.Vector3(1, 3, 2));
assert(approx(c.x, 1) && approx(c.y, -2) && approx(c.z, 2), `planeCenter proyecta el target sobre el plano (${c.toArray()})`);

// ── Frente / lado ──
setPlaneMode('front');
assert(getState().drawPlane.offset === 0, 'sin target, el preset pasa por el origen');
const front = resolvePlane(getState().drawPlane, camera, anchor);
const hf = projectToPlane(camera, 0, 0, front);
assert(hf && approx(hf.z, 0), 'el plano frente es z = 0');
setPlaneMode('side', { target: new THREE.Vector3(-0.7, 0, 0) });
assert(approx(getState().drawPlane.offset, -0.7), 'el plano lado pasa por x del target');

// ── Plano de canto ──
const edgeCam = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
edgeCam.position.set(0, 0, 5); edgeCam.lookAt(0, 0, 0); edgeCam.updateMatrixWorld();
setPlaneMode('ground');
assert(facingFactor(getState().drawPlane, edgeCam) < 0.01, 'mirar el suelo desde el horizonte = de canto');
setPlaneMode('front');
assert(approx(facingFactor(getState().drawPlane, edgeCam), 1), 'mirar el frente de frente = 1');

// ── Capturar el plano libre como propio ──
captureViewPlane(edgeCam, new THREE.Vector3(0, 0, 0.42));
spec = getState().drawPlane;
assert(spec.mode === 'custom', 'captureViewPlane deja un plano propio');
assert(approx(spec.normal[2], 1, 1e-3), `la normal apunta hacia la cámara (${spec.normal})`);
assert(approx(spec.offset, 0.4), 'y pasa por el anclaje (redondeado)');
setPlaneMode('view');
assert(getState().drawPlane.mode === 'view', 'volver al plano libre');

// ── Utilidades ──
assert(snapOffset(-0.0001) === 0, 'snapOffset no deja -0');
assert(mirrorPoint(new THREE.Vector3(1, 2, 3)).equals(new THREE.Vector3(-1, 2, 3)), 'mirrorPoint refleja X');
assert(mirrorNormal(null) === null, 'mirrorNormal(null) = null');
const before = getState().mirror;
toggleMirror();
assert(getState().mirror === !before, 'toggleMirror alterna');
toggleMirror();

// ── Presión ──
assert(pressureFactor(null) === 1, 'sin lápiz, grosor nominal');
assert(approx(pressureFactor(0.5), 1, 0.01), 'presión media ≈ grosor nominal');
assert(pressureFactor(0) < pressureFactor(1), 'más presión = más grosor');
assert(pressureFactor(1, false) === 1, 'con la presión desactivada, grosor nominal');

// ── Cinta apoyada en el plano (faceNormal) ──
const pts = [new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(1, 0.5, 0), new THREE.Vector3(1, 0.5, 1)];
const geo = buildRibbonGeometry(pts, 0.1, new THREE.Vector3(0, 0, 5), { faceNormal: new THREE.Vector3(0, 1, 0) });
const pos = geo.getAttribute('position');
let flat = true;
for (let i = 0; i < pos.count; i++) if (!approx(pos.getY(i), 0.5)) flat = false;
assert(flat, 'con faceNormal = Y, toda la cinta queda en el plano y = 0.5');
const geoW = buildRibbonGeometry(pts, 0.1, new THREE.Vector3(0, 0, 5), { faceNormal: new THREE.Vector3(0, 1, 0), widths: [0.2, 1, 2] });
const w0 = new THREE.Vector3().fromBufferAttribute(geoW.getAttribute('position'), 0)
  .distanceTo(new THREE.Vector3().fromBufferAttribute(geoW.getAttribute('position'), 1));
assert(approx(w0, 0.02, 1e-4), `el factor de presión escala el ancho (w0=${w0})`);

// ── Motor: presión, normal y cancelar ──
const scene = new THREE.Scene();
const engine = createStrokeEngine(scene, camera);
engine.startStroke(pts[0], { width: 0.05, pressure: 0.5, faceNormal: new THREE.Vector3(0, 1, 0) });
engine.addPoint(pts[1], 1.2);
engine.addPoint(pts[2], 0.8);
const done = engine.endStroke();
assert(done.mesh.userData.strokePressures.length === 3, 'se guardan las presiones por punto');
assert(approx(done.mesh.userData.strokeFaceNormal[1], 1), 'se guarda la normal del plano');
const n0 = scene.children.length;
engine.startStroke(pts[0], { width: 0.05 });
engine.addPoint(pts[1]);
assert(scene.children.length === n0 + 1, 'el trazo en curso aparece en la escena');
engine.cancelStroke();
assert(scene.children.length === n0 && !engine.isDrawing(), 'cancelStroke lo saca sin dejar rastro');

// ── Cámara: viewAlong (sin requestAnimationFrame en Node salta directo) ──
const cam2 = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
const ctl = createCameraController(cam2);
ctl.viewAlong(new THREE.Vector3(1, 0, 0));
const dir = new THREE.Vector3().subVectors(cam2.position, ctl.state.target).normalize();
assert(approx(dir.x, 1, 1e-3), `viewAlong(+X) deja la cámara del lado +X (${dir.toArray()})`);
ctl.viewAlong(new THREE.Vector3(0, 0, -1));
const dir2 = new THREE.Vector3().subVectors(cam2.position, ctl.state.target).normalize();
assert(approx(dir2.z, -1, 1e-3), 'viewAlong(-Z) deja la cámara del lado -Z');
ctl.reset();
assert(approx(ctl.state.radius, 4.5), 'reset vuelve a la vista inicial');

setState({ drawPlane: { mode: 'view', normal: [0, 0, 1], offset: 0 } });
console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
