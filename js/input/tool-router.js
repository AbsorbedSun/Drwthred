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
//            En modo Superficie, cada punto se pega a la figura de abajo.
//   select / shapes → tocar algo lo selecciona y arrastrarlo lo mueve
//            (si es parte de una selección múltiple, mueve todo el grupo);
//            con Figuras, tocar el vacío coloca una primitiva sobre el plano.
//            Selección → Lazo: rodear objetos para seleccionarlos juntos.
//   plane  → Mover: arrastrar desplaza el plano a lo largo de su normal;
//            Girar: arrastrar lo rota sobre su centro (imantado a los ejes).
//            Tocar un trazo/figura lleva el plano hasta ese punto.
// ============================================================================
import { getState, setState } from '../core/store.js';
import { projectToPlane } from '../drawing/plane-projection.js';
import {
  resolvePlane, isFixedPlane, isSurfaceMode, normalOf, planeCenter, facingFactor,
  setPlaneOffset, planeThroughPoint, captureViewPlane, mirrorPoint, mirrorNormal,
  rotatedNormal, setPlaneOrientation,
} from '../drawing/draw-planes.js';
import { planeFacingCamera } from '../drawing/plane-projection.js';
import { eraseFull, erasePartial, createEraseBatch } from '../drawing/eraser.js';
import { placePrimitive } from '../drawing/primitives.js';
import { hitTestAt, hitPointAt, surfaceHitAt, getSelectedIds, setSelection, objectsInLasso } from '../drawing/selection.js';
import { pushAction } from '../core/history.js';
import { getBrush } from '../drawing/brushes.js';
import { recognizeShape } from '../drawing/shape-recognition.js';
import { findSnapTarget } from '../drawing/snapping.js';
import * as THREE from '../vendor/three.module.js';

const TAP_THRESHOLD = 0.03;   // en NDC — por debajo de esto, "onEnd" cuenta como toque, no arrastre
const MAX_PROJECT_DIST = 60;  // puntos más lejos que esto = plano casi de canto, se descartan
const EDGE_ON_LIMIT = 0.06;   // facingFactor por debajo de esto: no se puede dibujar en ese plano

/** Presión cruda (0..1, o null si no es lápiz) → factor de grosor. */
export function pressureFactor(pressure, enabled = true) {
  if (!enabled || pressure == null) return 1;
  return Math.min(1.7, Math.max(0.15, 0.15 + 1.7 * pressure)); // 0.5 ≈ grosor nominal
}

const HOLD_MS = 550;        // quieto este tiempo al final del trazo → forma rápida
const HOLD_JITTER = 0.008; // movimiento (NDC) que no cuenta como "moverse" (pulso)

/**
 * @param {Function} [o.onSnap]   - ({x,y} NDC) se pegó una punta: feedback visual
 * @param {Function} [o.onChange] - la escena cambió fuera de un evento (forma rápida por tiempo)
 * @param {Function} [o.viewport] - () => {w,h} del lienzo en px (el imán mide en px)
 */
export function createToolRouter({
  scene, camera, camCtl, strokeEngine, mirrorEngine = null, transform,
  onNotice = null, onLasso = null, onSnap = null, onChange = null, viewport = null,
}) {
  let mode = null;
  let active = false;
  let drawPlane = null;
  let downNdc = null;
  let maxMove = 0;
  let smooth = null;      // posición suavizada del puntero (NDC)
  let planeDrag = null;   // { startOffset, axis, len2, hitPoint }
  let usedMirror = false;
  let eraseBatch = null;  // una pasada de goma = un solo paso de deshacer
  let surface = null;     // modo Superficie: { lift, fallback: Plane }
  let lasso = null;       // contorno del lazo en NDC
  let planeRot = null;    // { startSpec, n0, pivot }
  let dropped = 0;        // puntos descartados por caer demasiado lejos (plano casi de canto)
  let holdTimer = null;   // formas rápidas: espera de "quieto"
  let holdNdc = null;
  let shaped = false;     // el trazo ya se convirtió en forma: se ignoran los movimientos

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

    const layer = st.layers.find((l) => l.id === activeLayerId);
    if ((activeTool === 'brush' || activeTool === 'shapes') && layer && layer.locked) {
      mode = 'blocked';
      if (onNotice) onNotice(`"${layer.name}" está bloqueada — desbloqueala en Capas para dibujar en ella`);
      return;
    }
    if ((activeTool === 'brush' || activeTool === 'shapes') && layer && !layer.visible) {
      // Dibujar en una capa oculta creaba trazos visibles "fantasma" que
      // desaparecían al tocar cualquier capa.
      mode = 'blocked';
      if (onNotice) onNotice(`"${layer.name}" está oculta — mostrala para trabajar en ella`);
      return;
    }

    if (activeTool === 'brush') {
      const spec = st.drawPlane;
      if (isFixedPlane(spec) && facingFactor(spec, camera) < EDGE_ON_LIMIT) {
        mode = 'blocked';
        if (onNotice) onNotice('El plano se ve de canto — girá la vista para dibujar en él');
        return;
      }
      let anchor = camCtl.state.target;
      let first = null; // { p, n } en modo Superficie
      if (isSurfaceMode(spec)) {
        const hit = surfaceHitAt(scene, camera, ndcX, ndcY);
        if (hit) anchor = hit.point;
        // Si el trazo sale de la figura, sigue en un plano de frente a la
        // cámara a la profundidad del último punto de superficie.
        surface = { lift: brushWidth * 0.4, fallback: planeFacingCamera(camera, anchor) };
        drawPlane = surface.fallback;
        first = hit ? { p: hit.point.addScaledVector(hit.normal, surface.lift), n: hit.normal } : null;
      } else {
        // Imán: empezar sobre la punta (o el cuerpo) de otro trazo
        const snap = st.snapping && viewport ? findSnapTarget(scene, camera, { ndc: { x: ndcX, y: ndcY }, viewport: viewport() }) : null;
        if (snap) {
          anchor = snap.point;
          first = { p: snap.point.clone(), n: null };
          if (onSnap) onSnap(snap.ndc);
        } else if (!isFixedPlane(spec)) {
          const hp = hitPointAt(scene, camera, ndcX, ndcY);
          if (hp) anchor = hp;
        }
        drawPlane = resolvePlane(spec, camera, anchor);
      }
      const faceNormal = isFixedPlane(spec) ? drawPlane.normal.clone() : null;
      smooth = { x: ndcX, y: ndcY };
      const p = first ? first.p : projectSafe(ndcX, ndcY);
      if (!p) { mode = 'blocked'; return; }
      const brush = getBrush(activeVariant);
      const nib = brush.nib ? nibAxis(first ? first.n : drawPlane.normal) : null;
      const opts = {
        color: brushColor, width: brushWidth, meta: { layerId: activeLayerId },
        pressure: pressureFactor(pressure, st.pressure), faceNormal, brush, nib,
        smooth: true, normal: first ? first.n : null,
      };
      strokeEngine.startStroke(p, opts);
      usedMirror = !!(st.mirror && mirrorEngine);
      if (usedMirror) {
        mirrorEngine.startStroke(mirrorPoint(p), {
          ...opts, faceNormal: mirrorNormal(faceNormal), nib: mirrorNormal(nib), normal: mirrorNormal(opts.normal),
        });
      }
    } else if (activeTool === 'eraser') {
      eraseBatch = createEraseBatch(scene);
      eraseAt(ndcX, ndcY, activeVariant);
    } else if (activeTool === 'select' || activeTool === 'shapes') {
      // Pegarle a algo YA es una decisión sin ambigüedad: selecciona y
      // arranca a moverlo. Si el toque cae en el vacío, la decisión se
      // resuelve recién en onEnd (podría ser el arranque de otro gesto).
      const hitId = hitTestAt(scene, camera, ndcX, ndcY);
      const inSelection = hitId && getSelectedIds().includes(hitId);
      const isLasso = activeTool === 'select' && activeVariant === 'select-lasso';
      // Con el lazo es normal empezar a rodear desde ENCIMA de algo: solo
      // arrastrar algo ya seleccionado mueve; lo demás dibuja el lazo.
      if (hitId && (!isLasso || inSelection)) {
        // Tocar algo que ya es parte de una selección múltiple mueve todo el grupo
        if (!inSelection) setSelection([hitId]);
        if (transform && transform.startMove(ndcX, ndcY)) mode = 'moving';
      } else if (isLasso) {
        mode = 'lasso';
        lasso = [{ x: ndcX, y: ndcY }];
        if (onLasso) onLasso(lasso);
      }
    } else if (activeTool === 'plane') {
      if (activeVariant === 'plane-rotate') startPlaneRotate(ndcX, ndcY);
      else startPlaneDrag(ndcX, ndcY);
      mode = 'plane';
    }
  }

  /**
   * Eje de la punta de caligrafía: la diagonal de la pantalla (45°, como se
   * sostiene una pluma), apoyada en el plano de dibujo. Queda fijo durante
   * todo el trazo, así el grosor depende solo de la dirección del trazo.
   */
  function nibAxis(planeNormal) {
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const nib = right.add(up);
    nib.addScaledVector(planeNormal, -nib.dot(planeNormal));
    return nib.lengthSq() > 1e-8 ? nib.normalize() : new THREE.Vector3(1, 0, 0);
  }

  function startPlaneRotate(ndcX, ndcY) {
    const hitPoint = hitPointAt(scene, camera, ndcX, ndcY);
    if (!isFixedPlane(getState().drawPlane)) captureViewPlane(camera, hitPoint || camCtl.state.target);
    const spec = getState().drawPlane;
    planeRot = { startSpec: spec, n0: normalOf(spec), pivot: planeCenter(spec, camCtl.state.target), hitPoint };
  }

  function updatePlaneRotate(ndcX, ndcY) {
    // Arrastre horizontal = girar alrededor del "arriba" de la cámara;
    // vertical = alrededor de su "derecha". Media pantalla ≈ 90°.
    const dx = (ndcX - downNdc.x) * camera.aspect, dy = ndcY - downNdc.y;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const q = new THREE.Quaternion().setFromAxisAngle(up, dx * Math.PI / 2)
      .premultiply(new THREE.Quaternion().setFromAxisAngle(right, -dy * Math.PI / 2));
    const { normal } = rotatedNormal(planeRot.n0, q);
    setPlaneOrientation(normal, planeRot.pivot);
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
    // El radio de la goma parcial sigue al grosor elegido (con un mínimo
    // cómodo para el dedo), en vez de un 0.12 fijo.
    const radius = Math.max(0.05, getState().brushWidth * 2.5);
    if (variant === 'erase-partial') erasePartial(scene, camera, ndcX, ndcY, radius, { batch: eraseBatch });
    else eraseFull(scene, camera, ndcX, ndcY, { batch: eraseBatch });
  }

  /** Modo Superficie: punto (y normal) sobre la figura de abajo, o sobre el plano de respaldo. */
  function surfacePoint(x, y) {
    const hit = surfaceHitAt(scene, camera, x, y);
    if (hit) {
      surface.fallback = planeFacingCamera(camera, hit.point);
      drawPlane = surface.fallback;
      return { p: hit.point.addScaledVector(hit.normal, surface.lift), n: hit.normal };
    }
    const p = projectSafe(x, y);
    return p ? { p, n: null } : null;
  }

  function addBrushPoint(ndcX, ndcY, pressure, raw = false) {
    const k = raw ? 0 : Math.min(0.85, Math.max(0, getState().smoothing || 0));
    smooth.x += (ndcX - smooth.x) * (1 - k);
    smooth.y += (ndcY - smooth.y) * (1 - k);
    let p, n = null;
    if (surface) {
      const sp = surfacePoint(smooth.x, smooth.y);
      if (!sp) return;
      ({ p, n } = sp);
    } else {
      p = projectSafe(smooth.x, smooth.y);
      if (!p) { dropped++; return; }
    }
    const pf = pressureFactor(pressure, getState().pressure);
    strokeEngine.addPoint(p, pf, n);
    if (usedMirror) mirrorEngine.addPoint(mirrorPoint(p), pf, mirrorNormal(n));
  }

  function onMove(ndcX, ndcY, pressure = null) {
    if (downNdc) {
      const d = Math.hypot(ndcX - downNdc.x, ndcY - downNdc.y);
      if (d > maxMove) maxMove = d;
    }

    if (mode === 'brush') {
      if (shaped) return; // ya es una forma perfecta: el resto del gesto no la deforma
      addBrushPoint(ndcX, ndcY, pressure);
      armHold(ndcX, ndcY);
    } else if (mode === 'eraser') {
      eraseAt(ndcX, ndcY, getState().activeVariant);
    } else if (mode === 'moving' && transform) {
      transform.moveTo(ndcX, ndcY);
    } else if (mode === 'lasso') {
      const last = lasso[lasso.length - 1];
      if (Math.hypot(ndcX - last.x, ndcY - last.y) > 0.006) {
        lasso.push({ x: ndcX, y: ndcY });
        if (onLasso) onLasso(lasso);
      }
    } else if (mode === 'plane' && planeRot && maxMove >= TAP_THRESHOLD) {
      updatePlaneRotate(ndcX, ndcY);
    } else if (mode === 'plane' && planeDrag && maxMove >= TAP_THRESHOLD) {
      const dx = ndcX - downNdc.x, dy = ndcY - downNdc.y;
      const delta = planeDrag.len2 > 1e-4
        ? (dx * planeDrag.axis.x + dy * planeDrag.axis.y) / planeDrag.len2
        : dy * camCtl.state.radius * 0.5; // plano visto de frente: arrastre vertical
      setPlaneOffset(planeDrag.startOffset + delta);
    }
  }

  // ── Formas rápidas ──
  function armHold(x, y) {
    if (!getState().quickShapes || surface) return;
    if (holdNdc && Math.hypot(x - holdNdc.x, y - holdNdc.y) < HOLD_JITTER) return; // pulso: sigue contando
    holdNdc = { x, y };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(tryQuickShape, HOLD_MS);
  }

  /** Base 2D del plano de dibujo: u = "derecha" de la pantalla apoyada en el plano. */
  function planeBasis(n) {
    const u = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    u.addScaledVector(n, -u.dot(n));
    if (u.lengthSq() < 1e-8) u.set(0, 1, 0).addScaledVector(n, -n.y);
    u.normalize();
    return { u, v: new THREE.Vector3().crossVectors(n, u).normalize() };
  }

  function tryQuickShape() {
    holdTimer = null;
    if (mode !== 'brush' || shaped || !drawPlane) return;
    const pts = strokeEngine.currentPoints();
    if (pts.length < 6) return;
    const n = drawPlane.normal.clone().normalize();
    const { u, v } = planeBasis(n);
    const o = pts[0];
    const d = new THREE.Vector3();
    const res = recognizeShape(pts.map((p) => { d.subVectors(p, o); return { x: d.dot(u), y: d.dot(v) }; }));
    if (!res) return;
    const pts3 = res.points.map((q) => o.clone().addScaledVector(u, q.x).addScaledVector(v, q.y));
    if (!strokeEngine.replaceCurrent(pts3)) return;
    if (usedMirror) mirrorEngine.replaceCurrent(pts3.map(mirrorPoint));
    shaped = true;
    if (onNotice) onNotice(`Forma: ${res.label}`);
    if (onChange) onChange();
  }

  function finishBrush() {
    const done = strokeEngine.endStroke();
    const doneMirror = usedMirror ? mirrorEngine.endStroke() : null;
    drawPlane = null;
    const meshes = [done, doneMirror].filter((d) => d && d.mesh).map((d) => d.mesh);
    if (!meshes.length && dropped > 0 && onNotice) {
      // Antes no pasaba nada y no se entendía por qué
      onNotice('Esa zona del plano queda muy lejos (casi de canto) — girá la vista o el plano');
    }
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
    if (mode === 'eraser' && eraseBatch) {
      eraseBatch.commit();
    } else if (mode === 'brush') {
      if (!shaped && hasCoords) {
        // Imán al final: la punta se pega exacta al otro trazo
        const st = getState();
        const snap = st.snapping && viewport ? findSnapTarget(scene, camera, { ndc: { x: ndcX, y: ndcY }, viewport: viewport() }) : null;
        if (snap) {
          const pf = pressureFactor(pressure, st.pressure);
          strokeEngine.addPoint(snap.point, pf);
          if (usedMirror) mirrorEngine.addPoint(mirrorPoint(snap.point), pf);
          if (onSnap) onSnap(snap.ndc);
        } else {
          // Con suavizado, la cinta va "atrás" del puntero — el último punto
          // real se agrega crudo para que el trazo termine donde se soltó.
          addBrushPoint(ndcX, ndcY, pressure, true);
        }
      }
      finishBrush();
    } else if (mode === 'moving' && transform) {
      transform.endMove();
    } else if (mode === 'lasso') {
      if (onLasso) onLasso(null);
      if (isTap || lasso.length < 3) {
        setSelection([]);
      } else {
        const found = objectsInLasso(scene, camera, lasso);
        setSelection(found.map((o) => o.uuid));
        if (onNotice) onNotice(found.length ? `${found.length} ${found.length === 1 ? 'objeto seleccionado' : 'objetos seleccionados'}` : 'El lazo no rodeó nada');
      }
    } else if (mode === 'select' && isTap) {
      // Toque real que no le pegó a nada — recién acá deselecciona.
      setSelection([]);
    } else if (mode === 'shapes' && isTap) {
      const { activeVariant, activeLayerId, drawPlane: spec, brushColor } = getState();
      const plane = resolvePlane(spec, camera, camCtl.state.target);
      const p = projectToPlane(camera, ndcX, ndcY, plane);
      if (p && p.distanceTo(camera.position) < MAX_PROJECT_DIST) {
        const color = brushColor && brushColor.toLowerCase() !== '#ffffff' ? brushColor : undefined;
        const mesh = placePrimitive(scene, activeVariant, p, { layerId: activeLayerId, color });
        setSelection([mesh.uuid]); // lista para mover/escalar/rotar ya mismo
      }
    } else if (mode === 'plane') {
      const hp = planeDrag ? planeDrag.hitPoint : planeRot && planeRot.hitPoint;
      if (isTap && hp) planeThroughPoint(hp, camera);
    }
    reset();
  }

  /** Aborta lo que esté en curso sin dejar rastro ni entrada en el historial. */
  function cancel() {
    if (mode === 'eraser' && eraseBatch) {
      eraseBatch.commit(); // lo borrado, borrado está: no se "des-borra" por un 2º dedo
    } else if (mode === 'brush') {
      strokeEngine.cancelStroke();
      if (usedMirror) mirrorEngine.cancelStroke();
    } else if (mode === 'moving' && transform) {
      transform.cancelMove();
    } else if (mode === 'plane' && planeDrag) {
      setPlaneOffset(planeDrag.startOffset);
    } else if (mode === 'plane' && planeRot) {
      setState({ drawPlane: planeRot.startSpec });
    } else if (mode === 'lasso' && onLasso) {
      onLasso(null);
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
    eraseBatch = null;
    surface = null;
    lasso = null;
    planeRot = null;
    dropped = 0;
    clearTimeout(holdTimer);
    holdTimer = null;
    holdNdc = null;
    shaped = false;
  }

  /**
   * Vista previa del hover (lápiz cerca de la pantalla, sin tocar): dónde
   * caería el trazo y si el imán lo pegaría a otro. No cambia nada.
   * @returns {{point: THREE.Vector3, snapped: boolean}|null}
   */
  function hoverInfo(ndcX, ndcY) {
    const st = getState();
    if (st.activeTool !== 'brush' || active) return null;
    const spec = st.drawPlane;
    if (isSurfaceMode(spec)) {
      const hit = surfaceHitAt(scene, camera, ndcX, ndcY);
      return hit ? { point: hit.point, snapped: false } : null;
    }
    if (st.snapping && viewport) {
      const snap = findSnapTarget(scene, camera, { ndc: { x: ndcX, y: ndcY }, viewport: viewport() });
      if (snap) return { point: snap.point, snapped: true };
    }
    if (isFixedPlane(spec) && facingFactor(spec, camera) < EDGE_ON_LIMIT) return null;
    const anchor = (!isFixedPlane(spec) && hitPointAt(scene, camera, ndcX, ndcY)) || camCtl.state.target;
    const p = projectToPlane(camera, ndcX, ndcY, resolvePlane(spec, camera, anchor));
    return p && p.distanceTo(camera.position) < MAX_PROJECT_DIST ? { point: p, snapped: false } : null;
  }

  return { isDrawing, onStart, onMove, onEnd, cancel, isTrivial, hoverInfo };
}
