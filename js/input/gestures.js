// ============================================================================
// GESTURES — traduce Pointer Events crudos (mouse/touch/lápiz, misma API)
// en acciones semánticas sobre el controlador de cámara y el motor de
// trazo. No sabe nada de Three.js: para dibujar, solo convierte a
// coordenadas normalizadas de pantalla (NDC) y delega en los callbacks
// `draw` que le pasen — la proyección a 3D es responsabilidad de
// drawing/plane-projection.js, no de este módulo.
//
// Vocabulario heredado y validado en el proyecto anterior:
//   1 dedo  → dibujar
//   2 dedos → orbitar (mirar alrededor) + pellizco = zoom
//   3 dedos → pan (desplazar el target)
// ============================================================================
export function attachGestures(el, camCtl, draw) {
  const pointers = new Map(); // pointerId -> {x, y}

  function centroid() {
    const pts = [...pointers.values()];
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x, y };
  }
  function pinchDistance() {
    const pts = [...pointers.values()];
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
    const hadOne = pointers.size === 1;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointers.size;

    if (n === 1 && draw) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onStart(ndc.x, ndc.y);
    } else if (hadOne && draw && draw.isDrawing()) {
      // pasamos de 1 a 2+ dedos con un trazo a medio hacer: se cierra,
      // no se pierde, y arrancamos navegación en su lugar.
      draw.onEnd();
    }

    lastCentroid = centroid();
    lastPinchDist = pinchDistance();
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const n = pointers.size;
    const c = centroid();

    if (n === 1 && draw && draw.isDrawing()) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onMove(ndc.x, ndc.y);
    } else if (n === 2) {
      if (lastCentroid) camCtl.orbit(c.x - lastCentroid.x, c.y - lastCentroid.y);
      const d = pinchDistance();
      if (lastPinchDist) camCtl.zoom(lastPinchDist / d);
      lastPinchDist = d;
    } else if (n >= 3) {
      if (lastCentroid) camCtl.pan(c.x - lastCentroid.x, c.y - lastCentroid.y);
    }
    lastCentroid = c;
  }

  function onUp(e) {
    const wasOne = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasOne && draw && draw.isDrawing()) {
      const ndc = toNDC(e.clientX, e.clientY);
      draw.onEnd(ndc.x, ndc.y);
    }
    lastCentroid = pointers.size ? centroid() : null;
    lastPinchDist = pointers.size >= 2 ? pinchDistance() : null;
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
