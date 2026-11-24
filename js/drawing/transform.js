// ============================================================================
// TRANSFORM — mover (1 dedo/lápiz), escalar y rotar (2 dedos: distancia =
// escala, ángulo entre los dedos = rotación) lo seleccionado. Mismo
// lenguaje táctil que cualquier app de fotos, en vez de un gizmo de ejes
// con agarraderas chiquitas.
//
// Funciona con UNO o VARIOS objetos (selección con lazo): el grupo se
// mueve junto, y escala/rota alrededor de su centro común — cada objeto
// cambia de posición además de girar, como si fueran una sola pieza.
//
// No sabe nada de gestos — input/gestures.js y input/tool-router.js
// deciden CUÁNDO llamar a esto; acá solo vive la matemática.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState } from '../core/store.js';
import { pushAction } from '../core/history.js';
import { planeFacingCamera, projectToPlane } from './plane-projection.js';
import { isFixedPlane, normalOf, facingFactor } from './draw-planes.js';
import { selectedObjects } from './selection.js';

/** Foto de la transformación de cada objeto, para deshacer o cancelar. */
export function snapshot(objs) {
  return objs.map((o) => ({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }));
}
export function restore(snap) {
  snap.forEach(({ o, p, q, s }) => { o.position.copy(p); o.quaternion.copy(q); o.scale.copy(s); });
}
function changed(a, b) {
  return a.some((x, i) => !x.p.equals(b[i].p) || !x.q.equals(b[i].q) || !x.s.equals(b[i].s));
}
/** Registra en el historial el paso de `before` al estado actual (si cambió algo). */
export function recordTransform(before, label) {
  const after = snapshot(before.map((x) => x.o));
  if (!changed(before, after)) return false;
  pushAction({ undo: () => restore(before), redo: () => restore(after), label });
  return true;
}

/** Centro del grupo: promedio de las posiciones (el pivote de cada objeto). */
export function groupPivot(objs) {
  const c = new THREE.Vector3();
  objs.forEach((o) => c.add(o.position));
  return c.divideScalar(Math.max(1, objs.length));
}

export function createTransformController({ scene, camera }) {
  let move = null;   // { objs, start, plane, anchor }
  let sr = null;     // { objs, start, pivot, dist0, angle0 }

  function currentSelection() {
    return selectedObjects(scene)[0] || null;
  }
  function currentObjects() {
    return selectedObjects(scene).filter((o) => o.visible);
  }

  /** ¿Tiene sentido que 1 dedo mueva o 2 dedos transformen ahora mismo? */
  function isActive() {
    const { activeTool } = getState();
    if (activeTool !== 'select' && activeTool !== 'shapes') return false;
    // Si lo seleccionado ya no está en la escena (se deshizo o borró), no
    // hay nada que transformar: los 2 dedos tienen que volver a navegar.
    return currentObjects().length > 0;
  }

  // ── Mover ──
  function startMove(ndcX, ndcY) {
    const objs = currentObjects();
    if (!objs.length) return false;
    const pivot = groupPivot(objs);
    // Con un plano fijo activo, se desliza SOBRE ese plano (como en
    // Feather); si se ve de canto, plano de frente a la cámara.
    const spec = getState().drawPlane;
    const plane = isFixedPlane(spec) && facingFactor(spec, camera) > 0.2
      ? new THREE.Plane().setFromNormalAndCoplanarPoint(normalOf(spec), pivot)
      : planeFacingCamera(camera, pivot);
    const anchor = projectToPlane(camera, ndcX, ndcY, plane);
    if (!anchor) return false;
    move = { objs, start: snapshot(objs), plane, anchor };
    return true;
  }
  function moveTo(ndcX, ndcY) {
    if (!move) return;
    const p = projectToPlane(camera, ndcX, ndcY, move.plane);
    if (!p) return;
    const delta = p.sub(move.anchor);
    move.start.forEach(({ o, p: p0 }) => o.position.copy(p0).add(delta));
  }
  function endMove() {
    if (!move) return;
    recordTransform(move.start, 'mover');
    move = null;
  }
  function cancelMove() {
    if (!move) return;
    restore(move.start);
    move = null;
  }
  function isMoving() { return move !== null; }

  // ── Escalar + rotar (2 dedos) ──
  function startScaleRotate(pts) {
    const objs = currentObjects();
    if (!objs.length || pts.length < 2) return false;
    sr = {
      objs, start: snapshot(objs), pivot: groupPivot(objs),
      dist0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      angle0: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x),
    };
    return true;
  }
  const _off = new THREE.Vector3();
  function updateScaleRotate(pts) {
    if (!sr || pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const factor = Math.max(0.05, dist / sr.dist0);
    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const q = new THREE.Quaternion().setFromAxisAngle(camDir.negate(), angle - sr.angle0);
    sr.start.forEach(({ o, p, q: q0, s }) => {
      o.scale.copy(s).multiplyScalar(factor);
      o.quaternion.copy(q0).premultiply(q);
      // La posición también gira y escala alrededor del centro del grupo
      _off.subVectors(p, sr.pivot).applyQuaternion(q).multiplyScalar(factor);
      o.position.copy(sr.pivot).add(_off);
    });
  }
  function endScaleRotate() {
    if (!sr) return;
    // Un toque de 2 dedos (= deshacer) no debe dejar una acción vacía en el historial
    recordTransform(sr.start, 'escalar/rotar');
    sr = null;
  }
  function isScalingRotating() { return sr !== null; }

  return {
    isActive, currentSelection, currentObjects,
    startMove, moveTo, endMove, cancelMove, isMoving,
    startScaleRotate, updateScaleRotate, endScaleRotate, isScalingRotating,
  };
}
