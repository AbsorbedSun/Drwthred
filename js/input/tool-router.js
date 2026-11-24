// ============================================================================
// TOOL ROUTER — expone la interfaz {isDrawing, onStart, onMove, onEnd,
// cancel} que input/gestures.js usa para "el puntero que trabaja" (el
// lápiz, o el dedo en modo táctil), y por dentro decide QUÉ hacer según
// `getState().activeTool`. gestures.js no sabe nada de herramientas; acá
// no se sabe nada de cuántos dedos hay.
//
// Herramientas:
//   brush  → trazo proyectado sobre el PLANO ACTIVO (draw-planes.js). En
//            plano libre, si el trazo arranca encima de algo existente,
//            el plano pasa por ese punto (dibujar "pegado" a lo que ya hay).
//            Presión del lápiz → grosor; suavizado configurable; espejo.
//   eraser → borrado total/parcial.
//   select / shapes → tocar algo lo selecciona y arrastrarlo lo mueve;
//            con Figuras, tocar el vacío coloca una primitiva sobre el plano.
//   plane  → arrastrar mueve el plano activo a lo largo de su normal;
//            tocar un trazo/figura lleva el plano hasta ese punto.
// ============================================================================
import { getState, setState } from '../core/store.js';
import { projectToPlane } from '../drawing/plane-projection.js';
import {
  resolvePlane, isFixedPlane, normalOf, planeCenter, facingFactor,
  setPlaneOffset, planeThroughPoint, captureViewPlane, mirrorPoint, mirrorNormal,
} from '../drawing/draw-planes.js';
import { eraseFull, erasePartial } from '../drawing/eraser.js';
import { placePrimitive } from '../drawing/primitives.js';
import { hitTestAt, hitPointAt } from '../drawing/selection.js';
import { pushAction } from '../core/history.js';

const TAP_THRESHOLD = 0.03;   // en NDC — por debajo de esto, "onEnd" cuenta como toque, no arrastre
const MAX_PROJECT_DIST = 60;  // puntos más lejos que esto = plano casi de canto, se descartan
const EDGE_ON_LIMIT = 0.06;   // facingFactor por debajo de esto: no se puede dibujar en ese plano

/** Presión cruda (0..1, o null si no es lápiz) → factor de grosor. */
export function pressureFactor(pressure, enabled = true) {
  if (!enabled || pressure == null) return 1;
  return Math.min(1.7, Math.max(0.15, 0.15 + 1.7 * pressure)); // 0.5 ≈ grosor nominal
}

export function createToolRouter({ scene, camera, camCtl, strokeEngine, mirrorEngine = null, transform, onNotice = null }) {
  let mode = null;
  let active = false;
  let drawPlane = null;
  let downNdc = null;
  let maxMove = 0;
  let smooth = null;      // posición suavizada del puntero (NDC)
  let planeDrag = null;   // { startOffset, axis, len2, hitPoint }
  let usedMirror = false;

  function isDrawing() {
    return active;
  }

  function projectSafe(ndcX, ndcY) {
    const p = projectToPlane(camera, ndcX, ndcY, drawPlane);
    if (!p || p.distanceTo(camera.position) > MAX_PROJECT_DIST) return null;
    return p;
  }

  function onStart(ndcX, ndcY, pressure = null) {
    const st = getState();
    const { activeTool, activeVariant, brushColor, brushWidth, activeLayerId } = st;
    active = true;
    downNdc = { x: ndcX, y: ndcY };
    maxMove = 0;
    mode = activeTool;

    if (activeTool === 'brush') {
      const spec = st.drawPlane;
      if (isFixedPlane(spec) && facingFactor(spec, camera) < EDGE_ON_LIMIT) {
        mode = 'blocked';
        if (onNotice) onNotice('El plano se ve de canto — girá la vista para dibujar en él');
        return;
      }
      let anchor = camCtl.state.target;
      if (!isFixedPlane(spec)) {
        const hp = hitPointAt(scene, camera, ndcX, ndcY);
        if (hp) anchor = hp;
      }
      drawPlane = resolvePlane(spec, camera, anchor);
      const faceNormal = isFixedPlane(spec) ? drawPlane.normal.clone() : null;
      smooth = { x: ndcX, y: ndcY };
      const p = projectSafe(ndcX, ndcY);
      if (!p) { mode = 'blocked'; return; }
      const opts = {
        color: brushColor, width: brushWidth, meta: { layerId: activeLayerId },
        pressure: pressureFactor(pressure, st.pressure), faceNormal,
      };
      strokeEngine.startStroke(p, opts);
      usedMirror = !!(st.mirror && mirrorEngine);
      if (usedMirror) mirrorEngine.startStroke(mirrorPoint(p), { ...opts, faceNormal: mirrorNormal(faceNormal) });
    } else if (activeTool === 'eraser') {
      eraseAt(ndcX, ndcY, activeVariant);
    } else if (activeTool === 'select' || activeTool === 'shapes') {
      // Pegarle a algo YA es una decisión sin ambigüedad: selecciona y
      // arranca a moverlo. Si el toque cae en el vacío, la decisión se
      // resuelve recién en onEnd (podría ser el arranque de otro gesto).
      const hitId = hitTestAt(scene, camera, ndcX, ndcY);
      if (hitId) {
        setState({ selectedId: hitId });
        if (transform && transform.startMove(ndcX, ndcY)) mode = 'moving';
      }
    } else if (activeTool === 'plane') {
      startPlaneDrag(ndcX, ndcY);
    }
  }

  function startPlaneDrag(ndcX, ndcY) {
    const hitPoint = hitPointAt(scene, camera, ndcX, ndcY);
    if (!isFixedPlane(getState().drawPlane)) captureViewPlane(camera, hitPoint || camCtl.state.target);
    const spec = getState().drawPlane;
    // Eje de la normal proyectado en pantalla: cuántas unidades NDC se
    // mueve el centro del plano por cada unidad de mundo a lo largo de la
    // normal. Así el plano sigue al dedo/lápiz exactamente.
    const n = normalOf(spec);
    const c = planeCenter(spec, camCtl.state.target);
    const a = c.clone().project(camera);
    const b = c.clone().add(n).project(camera);
    const axis = { x: b.x - a.x, y: b.y - a.y };
    planeDrag = { startOffset: spec.offset, axis, len2: axis.x * axis.x + axis.y * axis.y, hitPoint };
  }

  function eraseAt(ndcX, ndcY, variant) {
    if (variant === 'erase-partial') erasePartial(scene, camera, ndcX, ndcY);
    else eraseFull(scene, camera, ndcX, ndcY);
  }

  function addBrushPoint(ndcX, ndcY, pressure, raw = false) {
    const k = raw ? 0 : Math.min(0.85, Math.max(0, getState().smoothing || 0));
    smooth.x += (ndcX - smooth.x) * (1 - k);
    smooth.y += (ndcY - smooth.y) * (1 - k);
    const p = projectSafe(smooth.x, smooth.y);
    if (!p) return;
    const pf = pressureFactor(pressure, getState().pressure);
    strokeEngine.addPoint(p, pf);
    if (usedMirror) mirrorEngine.addPoint(mirrorPoint(p), pf);
  }

  function onMove(ndcX, ndcY, pressure = null) {
    if (downNdc) {
      const d = Math.hypot(ndcX - downNdc.x, ndcY - downNdc.y);
      if (d > maxMove) maxMove = d;
    }

    if (mode === 'brush') {
      addBrushPoint(ndcX, ndcY, pressure);
    } else if (mode === 'eraser') {
      eraseAt(ndcX, ndcY, getState().activeVariant);
    } else if (mode === 'moving' && transform) {
      transform.moveTo(ndcX, ndcY);
    } else if (mode === 'plane' && planeDrag && maxMove >= TAP_THRESHOLD) {
      const dx = ndcX - downNdc.x, dy = ndcY - downNdc.y;
      const delta = planeDrag.len2 > 1e-4
        ? (dx * planeDrag.axis.x + dy * planeDrag.axis.y) / planeDrag.len2
        : dy * camCtl.state.radius * 0.5; // plano visto de frente: arrastre vertical
      setPlaneOffset(planeDrag.startOffset + delta);
    }
  }

  function finishBrush() {
    const done = strokeEngine.endStroke();
    const doneMirror = usedMirror ? mirrorEngine.endStroke() : null;
    drawPlane = null;
    const meshes = [done, doneMirror].filter((d) => d && d.mesh).map((d) => d.mesh);
    if (meshes.length) {
      pushAction({
        undo: () => meshes.forEach((m) => scene.remove(m)),
        redo: () => meshes.forEach((m) => scene.add(m)),
      });
    }
  }

  function onEnd(ndcX, ndcY, pressure = null) {
    const hasCoords = typeof ndcX === 'number' && typeof ndcY === 'number';
    const isTap = hasCoords && maxMove < TAP_THRESHOLD;
    if (mode === 'brush') {
      // Con suavizado, la cinta va "atrás" del puntero — el último punto
      // real se agrega crudo para que el trazo termine donde se soltó.
      if (hasCoords) addBrushPoint(ndcX, ndcY, pressure, true);
      finishBrush();
    } else if (mode === 'moving' && transform) {
      transform.endMove();
    } else if (mode === 'select' && isTap) {
      // Toque real que no le pegó a nada — recién acá deselecciona.
      setState({ selectedId: null });
    } else if (mode === 'shapes' && isTap) {
      const { activeVariant, activeLayerId, drawPlane: spec, brushColor } = getState();
      const plane = resolvePlane(spec, camera, camCtl.state.target);
      const p = projectToPlane(camera, ndcX, ndcY, plane);
      if (p && p.distanceTo(camera.position) < MAX_PROJECT_DIST) {
        const color = brushColor && brushColor.toLowerCase() !== '#ffffff' ? brushColor : undefined;
        const mesh = placePrimitive(scene, activeVariant, p, { layerId: activeLayerId, color });
        setState({ selectedId: mesh.uuid }); // lista para mover/escalar/rotar ya mismo
      }
    } else if (mode === 'plane' && planeDrag) {
      if (isTap && planeDrag.hitPoint) planeThroughPoint(planeDrag.hitPoint, camera);
    }
    reset();
  }

  /** Aborta lo que esté en curso sin dejar rastro ni entrada en el historial. */
  function cancel() {
    if (mode === 'brush') {
      strokeEngine.cancelStroke();
      if (usedMirror) mirrorEngine.cancelStroke();
    } else if (mode === 'moving' && transform) {
      transform.cancelMove();
    } else if (mode === 'plane' && planeDrag) {
      setPlaneOffset(planeDrag.startOffset);
    }
    reset();
  }

  /** ¿Lo que está en curso es tan corto que conviene cancelarlo en vez de confirmarlo? */
  function isTrivial() {
    return maxMove < TAP_THRESHOLD * 1.5;
  }

  function reset() {
    mode = null;
    downNdc = null;
    active = false;
    smooth = null;
    planeDrag = null;
    drawPlane = null;
    usedMirror = false;
  }

  return { isDrawing, onStart, onMove, onEnd, cancel, isTrivial };
}
