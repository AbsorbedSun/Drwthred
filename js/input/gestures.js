// ============================================================================
// GESTURES — traduce Pointer Events crudos (mouse/touch/lápiz) en acciones
// semánticas: "el puntero que trabaja" (router de herramientas), la
// navegación de cámara y la transformación del objeto seleccionado. No
// sabe nada de Three.js: solo convierte a coordenadas normalizadas (NDC).
//
// Dos modos, como en Feather:
//
//  MODO LÁPIZ (se activa solo la primera vez que aparece un lápiz, o a mano
//  desde Ajustes):
//    lápiz      → herramienta activa (con presión)
//    1 dedo     → orbitar
//    2 dedos    → pan + pellizco = zoom (o escalar/rotar lo seleccionado)
//    Mientras el lápiz toca la pantalla, los dedos se IGNORAN (rechazo de
//    palma: la mano apoyada no debe mover la cámara a mitad de trazo).
//
//  MODO TÁCTIL (sin lápiz):
//    1 dedo     → herramienta activa
//    2 dedos    → orbitar + pellizco = zoom (o escalar/rotar lo seleccionado)
//    3 dedos    → pan
//    Si llega un 2º dedo justo después de empezar un trazo, el trazo se
//    CANCELA (era el arranque de un gesto, no un dibujo); si el trazo ya
//    era largo, se conserva.
//
//  En ambos modos: toque rápido con 2 dedos = deshacer, con 3 = rehacer.
//  Mouse: botón izquierdo = herramienta, derecho = orbitar, medio = pan,
//  rueda = zoom.
// ============================================================================
const TAP_MAX_MS = 280;
const TAP_MAX_MOVE_PX = 14;
const CANCEL_STROKE_MS = 260;

export function attachGestures(el, { camCtl, router, transform, isPenMode, onPenDetected, onUndo, onRedo }) {
  const pointers = new Map(); // pointerId -> {x, y, sx, sy}  (solo dedos que cuentan)
  const ignored = new Set();  // dedos apoyados mientras el lápiz dibujaba (palma)
  let penId = null;
  let toolPointerId = null;   // el dedo/mouse que está usando la herramienta (modo táctil)
  let toolStart = 0;
  let transforming = false;
  let mouseNav = null;        // { button, x, y }
  let tap = null;             // { t0, maxTouches, moved }
  let lastCentroid = null;
  let lastPinchDist = null;

  const penMode = () => (isPenMode ? isPenMode() : false);

  function touchList() { return [...pointers.values()]; }
  function centroidOf(pts) {
    return {
      x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
      y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
    };
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
  /** Eventos intermedios que el navegador agrupó — en iPad el lápiz manda
   * hasta 240 Hz y sin esto los trazos rápidos salen poligonales. */
  function samplesOf(e) {
    const list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    return list && list.length ? list : [e];
  }
  function pressureOf(e) {
    return e.pointerType === 'pen' ? e.pressure : null;
  }
  function resetNavBaseline() {
    const pts = touchList();
    lastCentroid = pts.length ? centroidOf(pts) : null;
    lastPinchDist = pinchDistanceOf(pts);
  }

  // Cuántos dedos significan qué, según el modo
  function navRole(count) {
    if (penMode()) {
      if (count === 1) return 'orbit';
      if (count >= 2) return 'pan-zoom';
    } else {
      if (count === 2) return 'orbit-zoom';
      if (count >= 3) return 'pan';
    }
    return null;
  }
  const scaleRotateCount = () => 2;

  function updateTransformState() {
    const pts = touchList();
    const want = toolPointerId === null && transform && transform.isActive() && pts.length === scaleRotateCount();
    if (want && !transforming) {
      transform.startScaleRotate(pts);
      transforming = true;
    } else if (!want && transforming) {
      transform.endScaleRotate();
      transforming = false;
    }
  }

  function endToolPointer(e, commit) {
    if (toolPointerId === null) return;
    if (router && router.isDrawing()) {
      if (commit && e) {
        const ndc = toNDC(e.clientX, e.clientY);
        router.onEnd(ndc.x, ndc.y, pressureOf(e));
      } else if (commit) {
        router.onEnd();
      } else {
        router.cancel();
      }
    }
    toolPointerId = null;
  }

  // ───────────────────────── pointerdown ─────────────────────────
  function onDown(e) {
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* no crítico */ }

    // Mouse con botón derecho/medio → navegación directa
    if (e.pointerType === 'mouse' && e.button !== 0) {
      mouseNav = { button: e.button, x: e.clientX, y: e.clientY };
      return;
    }

    // ── Lápiz ──
    if (e.pointerType === 'pen') {
      if (penId !== null) return;
      if (onPenDetected) onPenDetected();
      // Si un dedo estaba dibujando (modo táctil), el lápiz manda
      endToolPointer(null, true);
      if (transforming) { transform.endScaleRotate(); transforming = false; }
      // Los dedos que estén apoyados ahora pasan a ser "palma"
      pointers.forEach((_, id) => ignored.add(id));
      pointers.clear();
      tap = null;
      penId = e.pointerId;
      const ndc = toNDC(e.clientX, e.clientY);
      if (router) router.onStart(ndc.x, ndc.y, pressureOf(e));
      return;
    }

    // ── Dedo (o mouse izquierdo) ──
    if (penId !== null) { ignored.add(e.pointerId); return; } // rechazo de palma

    const isMouse = e.pointerType === 'mouse';
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    const count = pointers.size;

    if (count === 1) tap = { t0: performance.now(), maxTouches: 1, moved: 0 };
    else if (tap) tap.maxTouches = Math.max(tap.maxTouches, count);

    const fingerDraws = isMouse || !penMode();
    if (count === 1 && fingerDraws && router) {
      toolPointerId = e.pointerId;
      toolStart = performance.now();
      const ndc = toNDC(e.clientX, e.clientY);
      router.onStart(ndc.x, ndc.y, null);
    } else if (count > 1 && toolPointerId !== null) {
      // Llegó otro dedo con un trazo en curso: si recién empezaba, era el
      // arranque de un gesto de navegación → se cancela sin dejar rastro.
      const young = performance.now() - toolStart < CANCEL_STROKE_MS;
      const trivial = router.isTrivial ? router.isTrivial() : true;
      endToolPointer(null, !(young || trivial));
    }

    updateTransformState();
    resetNavBaseline();
  }

  // ───────────────────────── pointermove ─────────────────────────
  function onMove(e) {
    if (mouseNav && e.pointerType === 'mouse') {
      const dx = e.clientX - mouseNav.x, dy = e.clientY - mouseNav.y;
      mouseNav.x = e.clientX; mouseNav.y = e.clientY;
      if (mouseNav.button === 2) camCtl.orbit(dx, dy);
      else camCtl.pan(dx, dy);
      return;
    }

    if (e.pointerId === penId) {
      if (router) for (const s of samplesOf(e)) {
        const ndc = toNDC(s.clientX, s.clientY);
        router.onMove(ndc.x, ndc.y, pressureOf(s));
      }
      return;
    }
    if (ignored.has(e.pointerId) || !pointers.has(e.pointerId)) return;

    const p = pointers.get(e.pointerId);
    p.x = e.clientX; p.y = e.clientY;
    if (tap) tap.moved = Math.max(tap.moved, Math.hypot(p.x - p.sx, p.y - p.sy));

    if (e.pointerId === toolPointerId) {
      if (router && router.isDrawing()) for (const s of samplesOf(e)) {
        const ndc = toNDC(s.clientX, s.clientY);
        router.onMove(ndc.x, ndc.y, null);
      }
      return;
    }

    const pts = touchList();
    const c = pts.length ? centroidOf(pts) : null;
    if (transforming) {
      transform.updateScaleRotate(pts);
    } else {
      const role = navRole(pts.length);
      const dx = lastCentroid && c ? c.x - lastCentroid.x : 0;
      const dy = lastCentroid && c ? c.y - lastCentroid.y : 0;
      if (role === 'orbit') {
        camCtl.orbit(dx, dy);
      } else if (role === 'orbit-zoom' || role === 'pan-zoom') {
        if (role === 'orbit-zoom') camCtl.orbit(dx, dy);
        else camCtl.pan(dx, dy);
        const d = pinchDistanceOf(pts);
        if (lastPinchDist && d) camCtl.zoom(lastPinchDist / d);
        lastPinchDist = d;
      } else if (role === 'pan') {
        camCtl.pan(dx, dy);
      }
    }
    lastCentroid = c;
  }

  // ───────────────────────── pointerup / cancel ─────────────────────────
  function onUp(e, cancelled = false) {
    if (mouseNav && e.pointerType === 'mouse' && e.button === mouseNav.button) {
      mouseNav = null;
      return;
    }

    if (e.pointerId === penId) {
      penId = null;
      if (router && router.isDrawing()) {
        const ndc = toNDC(e.clientX, e.clientY);
        // pointercancel en iOS = el sistema se quedó con el gesto: se
        // conserva lo dibujado, pero sin tratarlo como un "toque".
        if (cancelled) router.onEnd(); else router.onEnd(ndc.x, ndc.y, pressureOf(e));
      }
      return;
    }
    if (ignored.delete(e.pointerId)) return;
    if (!pointers.has(e.pointerId)) return;

    if (e.pointerId === toolPointerId) endToolPointer(cancelled ? null : e, true);
    pointers.delete(e.pointerId);

    updateTransformState();
    resetNavBaseline();

    if (pointers.size === 0 && tap) {
      const quick = performance.now() - tap.t0 < TAP_MAX_MS && tap.moved < TAP_MAX_MOVE_PX;
      if (quick && !cancelled) {
        if (tap.maxTouches === 2 && onUndo) onUndo();
        else if (tap.maxTouches === 3 && onRedo) onRedo();
      }
      tap = null;
    }
  }

  function onWheel(e) {
    e.preventDefault();
    // ctrlKey = pellizco en trackpad (el navegador lo reporta así)
    const k = e.ctrlKey ? 0.01 : 0.0015;
    camCtl.zoom(Math.exp(e.deltaY * k));
  }
  const onCancel = (e) => onUp(e, true);
  const onContext = (e) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContext);
  el.style.touchAction = 'none'; // el navegador no debe scrollear/zoomear la página

  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContext);
  };
}
