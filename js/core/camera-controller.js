// ============================================================================
// CAMERA CONTROLLER — matemática pura de órbita/pan/zoom alrededor de un
// punto objetivo (coordenadas esféricas, convención Y-arriba de Three.js).
// No escucha eventos de mouse/touch — eso es responsabilidad de
// input/gestures.js, que llama a estas funciones con deltas ya
// interpretados. Se puede probar sin DOM ni WebGL (ver camera-controller.test.js).
// ============================================================================
import * as THREE from '../vendor/three.module.js';

const MIN_PHI = 0.06;
const MAX_PHI = Math.PI - 0.06;
const MIN_RADIUS = 0.4;
const MAX_RADIUS = 40;

export function createCameraController(camera) {
  const state = {
    theta: Math.PI * 0.28,   // azimut, radianes
    phi: Math.PI * 0.38,     // polar, radianes (0 = polo norte, PI = polo sur)
    radius: 4.5,
    target: new THREE.Vector3(0, 0, 0),
  };

  function update() {
    const sinP = Math.sin(state.phi), cosP = Math.cos(state.phi);
    camera.position.set(
      state.target.x + state.radius * sinP * Math.sin(state.theta),
      state.target.y + state.radius * cosP,
      state.target.z + state.radius * sinP * Math.cos(state.theta)
    );
    camera.lookAt(state.target);
  }

  function orbit(dx, dy, sens = 0.008) {
    state.theta -= dx * sens;
    state.phi = clamp(state.phi - dy * sens, MIN_PHI, MAX_PHI);
    update();
  }

  function pan(dx, dy, sens = 0.0022) {
    // Right/up reales de la cámara en este instante, para que el pan
    // siempre vaya "para donde se ve", sin importar el ángulo actual.
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
    const scale = state.radius * sens;
    state.target.addScaledVector(right, -dx * scale);
    state.target.addScaledVector(up, dy * scale);
    update();
  }

  function zoom(factor) {
    state.radius = clamp(state.radius * factor, MIN_RADIUS, MAX_RADIUS);
    update();
  }

  update();
  return { state, update, orbit, pan, zoom };
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export { clamp };
