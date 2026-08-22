// ============================================================================
// TOOL ROUTER — expone la misma interfaz {isDrawing, onStart, onMove, onEnd}
// que input/gestures.js espera para el gesto de 1 dedo, pero por dentro
// decide QUÉ hacer según `getState().activeTool` — antes de este módulo,
// el gesto de 1 dedo llamaba siempre al motor de trazo sin importar qué
// herramienta mostraba la rueda. Ese era el bug de fondo.
//
// gestures.js sigue sin saber nada de esto — solo ve un objeto con
// onStart/onMove/onEnd, igual que antes. El router es quien conoce todas
// las herramientas; ningún módulo de herramienta individual conoce a los demás.
// ============================================================================
import { getState } from '../core/store.js';
import { planeFacingCamera, projectToPlane } from '../drawing/plane-projection.js';
import { eraseFull, erasePartial } from '../drawing/eraser.js';
import { placePrimitive } from '../drawing/primitives.js';
import { selectAt } from '../drawing/selection.js';
import { pushAction } from '../core/history.js';

const TAP_THRESHOLD = 0.03; // en NDC — por debajo de esto, "onEnd" cuenta como toque, no arrastre

export function createToolRouter({ scene, camera, camCtl, strokeEngine }) {
  let mode = null;
  let active = false;
  let drawPlane = null;
  let downNdc = null;
  let maxMove = 0;

  function isDrawing() {
    return active;
  }

  function onStart(ndcX, ndcY) {
    const { activeTool, activeVariant, brushColor, brushWidth, activeLayerId } = getState();
    active = true;
    downNdc = { x: ndcX, y: ndcY };
    maxMove = 0;
    mode = activeTool;

    if (activeTool === 'brush') {
      drawPlane = planeFacingCamera(camera, camCtl.state.target);
      const p = projectToPlane(camera, ndcX, ndcY, drawPlane);
      if (p) strokeEngine.startStroke(p, { color: brushColor, width: brushWidth, meta: { layerId: activeLayerId } });
    } else if (activeTool === 'eraser') {
      eraseAt(ndcX, ndcY, activeVariant);
    } else if (activeTool === 'select') {
      selectAt(scene, camera, ndcX, ndcY);
    }
    // 'shapes' no hace nada al bajar el dedo — se resuelve en onEnd, solo
    // si el gesto entero terminó siendo un toque y no un arrastre.
  }

  function eraseAt(ndcX, ndcY, variant) {
    if (variant === 'erase-partial') erasePartial(scene, camera, ndcX, ndcY);
    else eraseFull(scene, camera, ndcX, ndcY);
  }

  function onMove(ndcX, ndcY) {
    if (downNdc) {
      const d = Math.hypot(ndcX - downNdc.x, ndcY - downNdc.y);
      if (d > maxMove) maxMove = d;
    }

    if (mode === 'brush') {
      if (!drawPlane) return;
      const p = projectToPlane(camera, ndcX, ndcY, drawPlane);
      if (p) strokeEngine.addPoint(p);
    } else if (mode === 'eraser') {
      const { activeVariant } = getState();
      eraseAt(ndcX, ndcY, activeVariant);
    }
  }

  function onEnd(ndcX, ndcY) {
    const hasCoords = typeof ndcX === 'number' && typeof ndcY === 'number';
    if (mode === 'brush') {
      const done = strokeEngine.endStroke();
      drawPlane = null;
      if (done && done.mesh) {
        const mesh = done.mesh;
        pushAction({ undo: () => scene.remove(mesh), redo: () => scene.add(mesh) });
      }
    } else if (mode === 'shapes' && hasCoords && maxMove < TAP_THRESHOLD) {
      const { activeVariant, activeLayerId } = getState();
      const plane = planeFacingCamera(camera, camCtl.state.target);
      const p = projectToPlane(camera, ndcX, ndcY, plane);
      if (p) placePrimitive(scene, activeVariant, p, { layerId: activeLayerId });
    }
    mode = null;
    downNdc = null;
    active = false;
  }

  return { isDrawing, onStart, onMove, onEnd };
}
