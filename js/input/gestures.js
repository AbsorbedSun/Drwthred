// ============================================================================
// GESTURES — traduce Pointer Events crudos (mouse/touch/lápiz, misma API)
// en acciones semánticas sobre el controlador de cámara y el motor de
// trazo. No sabe nada de Three.js: para dibujar, solo convierte a
// coordenadas normalizadas de pantalla (NDC) y delega en los callbacks
// `draw` que le pasen — la proyección a 3D es responsabilidad de
// drawing/plane-projection.js, no de este módulo.
//
// El lápiz (pointerType 'pen') es un canal aparte de los dedos, no un
// puntero más en la cuenta: mientras esté activo, dibuja siempre y los
// dedos quedan libres para navegar — "dibujar preferiblemente con lápiz
// en vez de con un dedo", como se pidió. Sin lápiz de por medio, el
// vocabulario de siempre sigue intacto:
//   1 dedo  → dibujar/herramienta activa
//   2 dedos → orbitar + pellizco = zoom
//   3 dedos → pan
// Con el lápiz activo, los dedos se corren un lugar (ya no hace falta
// reservar el primero para dibujar):
//   1 dedo  → orbitar + pellizco = zoom
//   2 dedos → pan
// ============================================================================
export function attachGestures(el, camCtl, draw) {
  const pointers = new Map(); // pointerId -> {x, y, type}
  let penId = null;

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
      // Si algún dedo estaba dibujando a medio camino, se cierra en vez
      // de perderse — el lápiz toma la posta de forma limpia.
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

    if (!penActive && touches.length === 1 && draw) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onStart(ndc.x, ndc.y);
    } else if (!penActive && hadOneTouch && draw && draw.isDrawing()) {
      // pasamos de 1 a 2+ dedos con un trazo a medio hacer: se cierra,
      // no se pierde, y arrancamos navegación en su lugar.
      draw.onEnd();
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
      if (lastCentroid && c) camCtl.orbit(c.x - lastCentroid.x, c.y - lastCentroid.y);
      const d = pinchDistanceOf(touches);
      if (lastPinchDist) camCtl.zoom(lastPinchDist / d);
      lastPinchDist = d;
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

    if (!penActive && wasOneTouch && draw && draw.isDrawing()) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onEnd(ndc.x, ndc.y);
    }
    const touches = nonPenPointers();
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
