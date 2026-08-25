// ============================================================================
// GESTURES — traduce Pointer Events crudos (mouse/touch/lápiz, misma API)
// en acciones semánticas sobre el controlador de cámara, el motor de
// trazo y la transformación del objeto seleccionado. No sabe nada de
// Three.js: para dibujar, solo convierte a coordenadas normalizadas de
// pantalla (NDC) y delega en los callbacks que le pasen.
//
// El lápiz (pointerType 'pen') es un canal aparte de los dedos: mientras
// esté activo, dibuja siempre y los dedos quedan libres para navegar.
// Sin lápiz de por medio, el vocabulario de siempre:
//   1 dedo  → dibujar/herramienta activa
//   2 dedos → orbitar + pellizco = zoom — SALVO que haya algo seleccionado
//             con Selección/Figuras activo: ahí, 2 dedos escalan+rotan
//             ese objeto en vez de mover la cámara (transform.isActive()
//             decide, este módulo no sabe de selección, solo pregunta).
//   3 dedos → pan
// Con el lápiz activo, los dedos se corren un lugar (1→orbit/transform, 2→pan).
// ============================================================================
export function attachGestures(el, camCtl, draw, transform) {
  const pointers = new Map(); // pointerId -> {x, y, type}
  let penId = null;
  let transforming = false;

  function nonPenPointers() {
    const out = [];
    pointers.forEach((p, id) => { if (id !== penId) out.push(p); });
    return out;
  }
  function centroidOf(pts) {
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x, y };
  }
  function pinchDistanceOf(pts) {
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
  function toNDC(x, y) {
    const rect = el.getBoundingClientRect();
    return {
      x: ((x - rect.left) / rect.width) * 2 - 1,
      y: -(((y - rect.top) / rect.height) * 2 - 1),
    };
  }

  let lastCentroid = null;
  let lastPinchDist = null;

  function onDown(e) {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* no crítico */ }

    if (e.pointerType === 'pen' && penId === null) {
      if (draw && draw.isDrawing()) draw.onEnd();
      penId = e.pointerId;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
      if (draw) {
        const ndc = toNDC(e.clientX, e.clientY);
        draw.onStart(ndc.x, ndc.y);
      }
      return;
    }

    const penActive = penId !== null;
    const hadOneTouch = nonPenPointers().length === 1;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    const touches = nonPenPointers();
    const orbitAt = penActive ? 1 : 2;

    if (!penActive && touches.length === 1 && draw) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onStart(ndc.x, ndc.y);
    } else if (!penActive && hadOneTouch && draw && draw.isDrawing()) {
      draw.onEnd();
    }

    if (touches.length === orbitAt && transform && transform.isActive()) {
      transform.startScaleRotate(touches);
      transforming = true;
    } else if (transforming) {
      transform.endScaleRotate();
      transforming = false;
    }

    lastCentroid = touches.length ? centroidOf(touches) : null;
    lastPinchDist = pinchDistanceOf(touches);
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    const prevType = pointers.get(e.pointerId).type;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: prevType });

    if (e.pointerId === penId) {
      if (draw) {
        const ndc = toNDC(e.clientX, e.clientY);
        draw.onMove(ndc.x, ndc.y);
      }
      return;
    }

    const penActive = penId !== null;
    const touches = nonPenPointers();
    const c = touches.length ? centroidOf(touches) : null;
    const orbitAt = penActive ? 1 : 2;
    const panAt = penActive ? 2 : 3;

    if (!penActive && touches.length === 1 && draw && draw.isDrawing()) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onMove(ndc.x, ndc.y);
    } else if (touches.length === orbitAt) {
      if (transforming && transform) {
        transform.updateScaleRotate(touches);
      } else {
        if (lastCentroid && c) camCtl.orbit(c.x - lastCentroid.x, c.y - lastCentroid.y);
        const d = pinchDistanceOf(touches);
        if (lastPinchDist) camCtl.zoom(lastPinchDist / d);
        lastPinchDist = d;
      }
    } else if (touches.length >= panAt) {
      if (lastCentroid && c) camCtl.pan(c.x - lastCentroid.x, c.y - lastCentroid.y);
    }
    lastCentroid = c;
  }

  function onUp(e) {
    if (e.pointerId === penId) {
      pointers.delete(e.pointerId);
      penId = null;
      if (draw && draw.isDrawing()) {
        const ndc = toNDC(e.clientX, e.clientY);
        draw.onEnd(ndc.x, ndc.y);
      }
      const touches = nonPenPointers();
      lastCentroid = touches.length ? centroidOf(touches) : null;
      lastPinchDist = pinchDistanceOf(touches);
      return;
    }

    const penActive = penId !== null;
    const wasOneTouch = nonPenPointers().length === 1;
    pointers.delete(e.pointerId);
    const touches = nonPenPointers();
    const orbitAt = (penId !== null) ? 1 : 2;

    if (!penActive && wasOneTouch && draw && draw.isDrawing()) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onEnd(ndc.x, ndc.y);
    }
    if (transforming && touches.length !== orbitAt) {
      transform.endScaleRotate();
      transforming = false;
    }

    lastCentroid = touches.length ? centroidOf(touches) : null;
    lastPinchDist = pinchDistanceOf(touches);
  }

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.style.touchAction = 'none'; // el navegador no debe scrollear/zoomear la página

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
  };
}
