// ============================================================================
// CAMERA CONTROLLER — matemática pura de órbita/pan/zoom alrededor de un
// punto objetivo (coordenadas esféricas, convención Y-arriba de Three.js).
// No escucha eventos de mouse/touch — eso es responsabilidad de
// input/gestures.js, que llama a estas funciones con deltas ya
// interpretados. Se puede probar sin DOM ni WebGL (ver camera-controller.test.js).
//
// Vista ORTOGRÁFICA (sin perspectiva): la misma cámara cambia de proyección
// en vez de cambiar de objeto — muchos módulos guardan una referencia a
// `camera`, y así ninguno tiene que enterarse. Three.js decide cómo trazar
// rayos y proyectar según isOrthographicCamera, que se ajusta acá. El zoom
// en ortográfica cambia el tamaño de lo que se ve (no la distancia).
// "Auto": al alinear la vista con un plano/eje se entra sola, y al orbitar
// a mano se vuelve a perspectiva (como Feather).
// ============================================================================
import * as THREE from '../vendor/three.module.js';

const MIN_PHI = 0.06;
const MAX_PHI = Math.PI - 0.06;
const MIN_RADIUS = 0.4;
const MAX_RADIUS = 40;
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const ORTHO_DIST = 30; // en ortográfica la cámara se aleja: la distancia no cambia lo que se ve

export function createCameraController(camera) {
  const state = {
    theta: Math.PI * 0.28,   // azimut, radianes
    phi: Math.PI * 0.38,     // polar, radianes (0 = polo norte, PI = polo sur)
    radius: 4.5,
    target: new THREE.Vector3(0, 0, 0),
  };

  // ── Proyección perspectiva / ortográfica ──
  let ortho = false;
  let orthoAuto = false; // entró sola (al alinear): orbitar la saca
  const perspectiveUpdate = camera.updateProjectionMatrix.bind(camera);
  function applyOrtho() {
    const halfH = state.radius * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfW = halfH * camera.aspect;
    camera.projectionMatrix.makeOrthographic(-halfW, halfW, halfH, -halfH, camera.near, camera.far, camera.coordinateSystem);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  camera.updateProjectionMatrix = function updateProjectionMatrix() {
    if (ortho) applyOrtho(); else perspectiveUpdate();
  };
  const listeners = new Set();

  function setOrtho(on, { auto = false } = {}) {
    on = !!on;
    orthoAuto = on && auto;
    if (on === ortho) return;
    ortho = on;
    camera.isPerspectiveCamera = !on;
    camera.isOrthographicCamera = on;
    update();
    camera.updateProjectionMatrix();
    listeners.forEach((fn) => fn(on));
  }

  function update() {
    const sinP = Math.sin(state.phi), cosP = Math.cos(state.phi);
    const dist = ortho ? Math.max(state.radius, ORTHO_DIST) : state.radius;
    camera.position.set(
      state.target.x + dist * sinP * Math.sin(state.theta),
      state.target.y + dist * cosP,
      state.target.z + dist * sinP * Math.cos(state.theta)
    );
    camera.lookAt(state.target);
    if (ortho) applyOrtho(); // el zoom (radius) cambia el tamaño de la vista
  }

  function orbit(dx, dy, sens = 0.008) {
    if (ortho && orthoAuto) setOrtho(false); // girar a mano saca de la vista alineada
    state.theta -= dx * sens;
    state.phi = clamp(state.phi - dy * sens, MIN_PHI, MAX_PHI);
    update();
  }

  function pan(dx, dy, sens = 0.0022) {
    // Right/up reales de la cámara en este instante, para que el pan
    // siempre vaya "para donde se ve", sin importar el ángulo actual.
    const right = _right.setFromMatrixColumn(camera.matrix, 0);
    const up = _up.setFromMatrixColumn(camera.matrix, 1);
    const scale = state.radius * sens;
    state.target.addScaledVector(right, -dx * scale);
    state.target.addScaledVector(up, dy * scale);
    update();
  }

  function zoom(factor) {
    state.radius = clamp(state.radius * factor, MIN_RADIUS, MAX_RADIUS);
    update();
  }

  // ── Saltos de vista animados (gizmo de ejes, "alinear al plano") ──
  let anim = null;
  const HOME = { theta: state.theta, phi: state.phi, radius: state.radius, target: state.target.clone() };

  /** Anima hacia {theta, phi, radius?, target?}. Sin requestAnimationFrame (Node) salta directo. */
  function animateTo(to, ms = 320, onDone = null) {
    const from = { theta: state.theta, phi: state.phi, radius: state.radius, target: state.target.clone() };
    // Girar por el camino corto: llevar la diferencia de theta a [-PI, PI]
    let dTheta = (to.theta ?? from.theta) - from.theta;
    dTheta = Math.atan2(Math.sin(dTheta), Math.cos(dTheta));
    const end = {
      theta: from.theta + dTheta,
      phi: clamp(to.phi ?? from.phi, MIN_PHI, MAX_PHI),
      radius: clamp(to.radius ?? from.radius, MIN_RADIUS, MAX_RADIUS),
      target: to.target ? to.target.clone() : from.target,
    };
    const apply = (t) => {
      state.theta = from.theta + (end.theta - from.theta) * t;
      state.phi = from.phi + (end.phi - from.phi) * t;
      state.radius = from.radius + (end.radius - from.radius) * t;
      state.target.lerpVectors(from.target, end.target, t);
      update();
    };
    if (typeof requestAnimationFrame !== 'function' || ms <= 0) { apply(1); if (onDone) onDone(); return; }
    const token = {};
    anim = token;
    const t0 = performance.now();
    const step = (now) => {
      if (anim !== token) return; // otro salto (o un gesto) lo interrumpió
      const k = Math.min(1, (now - t0) / ms);
      apply(1 - Math.pow(1 - k, 3)); // ease-out cúbico
      if (k < 1) requestAnimationFrame(step);
      else { anim = null; if (onDone) onDone(); }
    };
    requestAnimationFrame(step);
  }

  /**
   * Coloca la cámara mirando A LO LARGO de -normal (la cámara queda del lado
   * de la normal). Con { ortho: true } termina en vista ortográfica.
   */
  function viewAlong(normal, ms, { ortho: toOrtho = false } = {}) {
    const n = normal.clone().normalize();
    const phi = Math.acos(clamp(n.y, -1, 1));
    // En los polos (vista de arriba/abajo) theta no está definido: se conserva el actual
    const theta = Math.abs(n.y) > 0.999 ? state.theta : Math.atan2(n.x, n.z);
    if (ortho && orthoAuto && !toOrtho) setOrtho(false);
    animateTo({ theta, phi }, ms, toOrtho ? () => setOrtho(true, { auto: !ortho || orthoAuto }) : null);
  }

  function reset(ms) {
    animateTo(HOME, ms);
  }

  function stopAnimation() { anim = null; }

  // Cualquier gesto manual cancela una animación en curso
  const wrap = (fn) => (...args) => { anim = null; return fn(...args); };

  update();
  return {
    state, update,
    setOrtho, isOrtho: () => ortho, toggleOrtho: () => setOrtho(!ortho),
    onProjectionChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    orbit: wrap(orbit), pan: wrap(pan), zoom: wrap(zoom),
    animateTo, viewAlong, reset, stopAnimation,
  };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export { clamp };
