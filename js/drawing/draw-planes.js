// ============================================================================
// DRAW PLANES — el concepto central de Feather: no se dibuja "en el aire",
// se dibuja SOBRE un plano. El plano activo vive en el store
// (`drawPlane`), así la barra de planos, la guía visual y el enrutador de
// herramientas coordinan sin conocerse entre sí.
//
//   'view'   → plano libre de frente a la cámara, que pasa por el punto
//              de anclaje (el objetivo de la cámara o lo que se toque).
//   'front' / 'side' / 'ground' → planos fijos XY / YZ / XZ del mundo.
//   'custom' → plano fijo con normal arbitraria (capturado desde la vista,
//              o girado con la herramienta Plano → Girar).
//   'surface'→ sin plano: el trazo se pega a la superficie de las figuras
//              que tenga debajo (si no hay figura, cae al plano libre).
//
// Un plano fijo es `normal · p = offset`. Cambiar el plano NO entra al
// historial de deshacer: igual que mover la cámara, es una herramienta de
// trabajo, no una edición del dibujo.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState } from '../core/store.js';
import { planeFacingCamera } from './plane-projection.js';

export const PLANE_PRESETS = {
  front:  { normal: [0, 0, 1], label: 'Frente', color: 0x5b8def },
  side:   { normal: [1, 0, 0], label: 'Lado',   color: 0xe8655a },
  ground: { normal: [0, 1, 0], label: 'Suelo',  color: 0x6cc070 },
};
export const CUSTOM_COLOR = 0x3dbfae;

const OFFSET_STEP = 0.05; // el offset se redondea a esta grilla — planos "limpios"

export function snapOffset(v, step = OFFSET_STEP) {
  const r = Math.round(v / step) * step;
  return Math.abs(r) < 1e-9 ? 0 : +r.toFixed(4);
}

export function normalOf(spec) {
  return new THREE.Vector3().fromArray(spec.normal).normalize();
}

export function isFixedPlane(spec) {
  return spec.mode !== 'view' && spec.mode !== 'surface';
}
export function isSurfaceMode(spec) {
  return spec.mode === 'surface';
}

/**
 * Devuelve el THREE.Plane sobre el que hay que proyectar ahora mismo.
 * `anchor` solo importa en modo 'view' (por dónde pasa el plano libre).
 */
export function resolvePlane(spec, camera, anchor) {
  if (!isFixedPlane(spec)) return planeFacingCamera(camera, anchor);
  return new THREE.Plane(normalOf(spec), -spec.offset); // three: n·p + c = 0
}

/** Punto del plano más cercano a `target` — donde se centra la guía visual. */
export function planeCenter(spec, target) {
  const n = normalOf(spec);
  const d = n.dot(target) - spec.offset;
  return target.clone().addScaledVector(n, -d);
}

/**
 * Qué tan "de canto" se ve el plano desde la cámara: 1 = de frente,
 * 0 = completamente de canto (proyectar ahí explota hacia el infinito).
 */
export function facingFactor(spec, camera) {
  if (!isFixedPlane(spec)) return 1;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  return Math.abs(dir.dot(normalOf(spec)));
}

// ── Acciones (solo tocan el store) ──

/** Cambia de plano. Los presets pasan por `target` (donde se está mirando). */
export function setPlaneMode(mode, { target } = {}) {
  const cur = getState().drawPlane;
  if (mode === 'view' || mode === 'surface') { setState({ drawPlane: { ...cur, mode } }); return; }
  const preset = PLANE_PRESETS[mode];
  if (!preset) throw new Error(`[draw-planes] Plano desconocido: "${mode}"`);
  const normal = preset.normal.slice();
  const offset = target ? snapOffset(new THREE.Vector3().fromArray(normal).dot(target)) : 0;
  setState({ drawPlane: { mode, normal, offset } });
}

/** Congela el plano libre actual como plano fijo ('custom'). */
export function captureViewPlane(camera, anchor) {
  const n = new THREE.Vector3();
  camera.getWorldDirection(n);
  n.negate(); // la normal apunta hacia la cámara
  const normal = n.toArray().map((v) => +v.toFixed(5));
  const offset = snapOffset(n.dot(anchor));
  setState({ drawPlane: { mode: 'custom', normal, offset } });
}

export function setPlaneOffset(offset) {
  const cur = getState().drawPlane;
  if (!isFixedPlane(cur)) return;
  setState({ drawPlane: { ...cur, offset: snapOffset(offset) } });
}

/** Mueve el plano (sin rotarlo) para que pase por `point`. */
export function planeThroughPoint(point, camera) {
  const cur = getState().drawPlane;
  if (!isFixedPlane(cur)) { captureViewPlane(camera, point); return; }
  setPlaneOffset(normalOf(cur).dot(point));
}

// ── Girar el plano ──
const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((a) => new THREE.Vector3().fromArray(a));
const SNAP_RAD = THREE.MathUtils.degToRad(4);

/**
 * Normal resultante de girar `normal` con el cuaternión `q`, imantada a un
 * eje del mundo (±X/±Y/±Z) si queda a menos de 4°: es fácil volver a un
 * plano "limpio" sin tener que acertar el ángulo exacto con el dedo.
 */
export function rotatedNormal(normal, q) {
  const n = normal.clone().applyQuaternion(q).normalize();
  for (const a of AXES) {
    const d = n.dot(a);
    if (Math.acos(Math.min(1, Math.abs(d))) < SNAP_RAD) return { normal: a.clone().multiplyScalar(Math.sign(d)), snapped: true };
  }
  return { normal: n, snapped: false };
}

/**
 * Gira el plano alrededor de `pivot` (un punto del plano, normalmente su
 * centro visible). El pivote queda quieto: el plano "pivotea" donde se lo
 * ve, no alrededor del origen del mundo. Siempre deja un plano 'custom'
 * (o el preset que corresponda si quedó alineado a un eje).
 */
export function setPlaneOrientation(normal, pivot) {
  const n = normal.clone().normalize();
  const offset = snapOffset(n.dot(pivot), 1e-4);
  // ¿Quedó exactamente sobre un eje? Entonces es un preset (con su color y nombre)
  const preset = Object.entries(PLANE_PRESETS).find(([, p]) => Math.abs(new THREE.Vector3().fromArray(p.normal).dot(n)) > 0.99999);
  if (preset) {
    const pn = new THREE.Vector3().fromArray(preset[1].normal);
    setState({ drawPlane: { mode: preset[0], normal: preset[1].normal.slice(), offset: snapOffset(pn.dot(pivot), 1e-4) } });
    return;
  }
  setState({ drawPlane: { mode: 'custom', normal: n.toArray().map((v) => +v.toFixed(6)), offset } });
}

export function toggleMirror() {
  setState({ mirror: !getState().mirror });
}

// ── Simetría (espejo respecto a X = 0) ──
export function mirrorPoint(p) {
  return new THREE.Vector3(-p.x, p.y, p.z);
}
export function mirrorNormal(n) {
  return n ? new THREE.Vector3(-n.x, n.y, n.z) : null;
}
