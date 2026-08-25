// ============================================================================
// TRANSFORM — mover (1 dedo), escalar y rotar (2 dedos: distancia = escala,
// ángulo entre los dedos = rotación) el objeto seleccionado. Mismo
// lenguaje táctil que cualquier app de fotos — pellizcar para achicar/
// agrandar, girar dos dedos para rotar — en vez de un gizmo de ejes con
// agarraderas chiquitas, poco cómodas para dedos reales.
//
// Solo actúa sobre lo que ya esté seleccionado (drawing/selection.js).
// No sabe nada de gestos ni de cuántos dedos hay — input/gestures.js y
// input/tool-router.js deciden CUÁNDO llamar a esto; acá solo vive la
// matemática de mover/escalar/rotar en sí.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState } from '../core/store.js';
import { pushAction } from '../core/history.js';
import { planeFacingCamera, projectToPlane } from './plane-projection.js';

export function createTransformController({ scene, camera }) {
  let moveTarget = null, movePlane = null, moveAnchorPoint = null, moveStartPos = null;
  let scaleTarget = null, scaleStartDist = null, scaleStartScale = null;
  let rotateStartAngle = null, rotateStartQuat = null;

  function currentSelection() {
    const { selectedId } = getState();
    if (!selectedId) return null;
    return scene.children.find((o) => o.uuid === selectedId) || null;
  }

  /** ¿Tiene sentido que 1 dedo mueva o 2 dedos transformen ahora mismo? */
  function isActive() {
    const { activeTool, selectedId } = getState();
    return !!selectedId && (activeTool === 'select' || activeTool === 'shapes');
  }

  // ── Mover (1 dedo) ──
  function startMove(ndcX, ndcY) {
    const target = currentSelection();
    if (!target) return false;
    movePlane = planeFacingCamera(camera, target.position);
    const p = projectToPlane(camera, ndcX, ndcY, movePlane);
    if (!p) return false;
    moveTarget = target;
    moveAnchorPoint = p;
    moveStartPos = target.position.clone();
    return true;
  }
  function moveTo(ndcX, ndcY) {
    if (!moveTarget) return;
    const p = projectToPlane(camera, ndcX, ndcY, movePlane);
    if (!p) return;
    const delta = new THREE.Vector3().subVectors(p, moveAnchorPoint);
    moveTarget.position.copy(moveStartPos).add(delta);
  }
  function endMove() {
    if (!moveTarget) return;
    const obj = moveTarget, from = moveStartPos, to = obj.position.clone();
    if (!from.equals(to)) {
      pushAction({ undo: () => obj.position.copy(from), redo: () => obj.position.copy(to) });
    }
    moveTarget = null; movePlane = null; moveAnchorPoint = null; moveStartPos = null;
  }
  function isMoving() { return moveTarget !== null; }

  // ── Escalar + rotar (2 dedos) ──
  function startScaleRotate(pts) {
    const target = currentSelection();
    if (!target || pts.length < 2) return false;
    scaleTarget = target;
    scaleStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    scaleStartScale = target.scale.clone();
    rotateStartAngle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    rotateStartQuat = target.quaternion.clone();
    return true;
  }
  function updateScaleRotate(pts) {
    if (!scaleTarget || pts.length < 2) return;
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    const factor = Math.max(0.05, dist / scaleStartDist);
    scaleTarget.scale.copy(scaleStartScale).multiplyScalar(factor);

    const angle = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
    const delta = angle - rotateStartAngle;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const q = new THREE.Quaternion().setFromAxisAngle(camDir.normalize().negate(), delta);
    scaleTarget.quaternion.copy(rotateStartQuat).premultiply(q);
  }
  function endScaleRotate() {
    if (!scaleTarget) return;
    const obj = scaleTarget;
    const fromScale = scaleStartScale, toScale = obj.scale.clone();
    const fromQuat = rotateStartQuat, toQuat = obj.quaternion.clone();
    pushAction({
      undo: () => { obj.scale.copy(fromScale); obj.quaternion.copy(fromQuat); },
      redo: () => { obj.scale.copy(toScale); obj.quaternion.copy(toQuat); },
    });
    scaleTarget = null; scaleStartDist = null; scaleStartScale = null; rotateStartAngle = null; rotateStartQuat = null;
  }
  function isScalingRotating() { return scaleTarget !== null; }

  return {
    isActive, currentSelection,
    startMove, moveTo, endMove, isMoving,
    startScaleRotate, updateScaleRotate, endScaleRotate, isScalingRotating,
  };
}
