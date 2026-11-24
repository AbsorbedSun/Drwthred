// ============================================================================
// HUD MANAGER
//
// El problema que resuelve: en el proyecto anterior, cada botón flotante
// tenía su propio top/right fijo escrito a mano en CSS. Cuando uno cambiaba
// de tamaño, nada sabía que tenía que correr al vecino.
//
// Acá cada elemento se REGISTRA en un slot nombrado (esquina o borde) con
// un orden. Este módulo calcula la posición real de cada uno apilándolos
// con un espacio fijo, y recalcula todo cuando el tamaño de cualquiera
// cambia (ResizeObserver), cuando gira la tablet o cambia la ventana.
//
// Novedades para tablet/móvil:
//  · Respeta las zonas seguras (notch, barra de inicio de iOS) leyendo
//    env(safe-area-inset-*).
//  · Slots de borde lateral centrados verticalmente (barra de herramientas
//    a la izquierda, sliders a la derecha — donde caen los pulgares).
//  · Slot responsivo: `slot` puede ser { wide, narrow } y el elemento se
//    muda solo de slot al cruzar el breakpoint (ej: en un teléfono la
//    barra de herramientas pasa del borde izquierdo al borde inferior).
//    El slot actual queda en `el.dataset.slot` para que el CSS oriente
//    el contenido (vertical/horizontal).
// ============================================================================

const GAP = 8;
const NARROW_QUERY = '(max-width: 640px), (max-height: 520px)';

// v: top | bottom | center    h: left | right | center
// stack: 'row' (en fila desde la esquina) | 'column' (apilado)
const SLOTS = {
  'corner-top-left':     { v: 'top', h: 'left', stack: 'row' },
  'corner-top-right':    { v: 'top', h: 'right', stack: 'row' },
  'corner-bottom-left':  { v: 'bottom', h: 'left', stack: 'column' },
  'corner-bottom-right': { v: 'bottom', h: 'right', stack: 'column' },
  'edge-top-center':     { v: 'top', h: 'center', stack: 'column' },
  'edge-bottom-center':  { v: 'bottom', h: 'center', stack: 'column' },
  'edge-left-center':    { v: 'center', h: 'left', stack: 'column' },
  'edge-right-center':   { v: 'center', h: 'right', stack: 'column' },
  // Debajo de la fila superior — para avisos que no deben empujar a nadie
  'overlay-top-center':  { v: 'top', h: 'center', stack: 'column', extraTop: 64 },
};

const registry = new Map(); // id -> { id, spec, slot, order, el, ro }
const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(NARROW_QUERY) : null;

export function isNarrow() {
  return !!(mq && mq.matches);
}

function margin() {
  return isNarrow() ? 8 : 12;
}

// ── Zonas seguras ──
let probe = null;
let insets = { top: 0, right: 0, bottom: 0, left: 0 };
function readInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  insets = {
    top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0,
  };
}

function resolveSlot(spec) {
  if (typeof spec === 'string') return spec;
  return isNarrow() ? (spec.narrow || spec.wide) : (spec.wide || spec.narrow);
}

/**
 * Registra un elemento de HUD en un slot.
 * @param {Object} cfg
 * @param {string} cfg.id
 * @param {string|{wide:string,narrow:string}} cfg.slot
 * @param {number} [cfg.order=0] - menor = más cerca de la esquina/borde
 * @param {HTMLElement} cfg.el
 * @returns {Function} des-registrar
 */
export function register({ id, slot, order = 0, el }) {
  const resolved = resolveSlot(slot);
  for (const s of [slot.wide, slot.narrow, resolved]) {
    if (s && !SLOTS[s]) throw new Error(`[hud-manager] Slot desconocido: "${s}". Slots válidos: ${Object.keys(SLOTS).join(', ')}`);
  }
  if (!(el instanceof HTMLElement)) {
    throw new Error(`[hud-manager] register("${id}") necesita un elemento DOM real en cfg.el`);
  }
  if (registry.has(id)) throw new Error(`[hud-manager] Ya existe un elemento registrado con id "${id}"`);

  el.style.position = 'fixed';
  if (!el.style.zIndex) el.style.zIndex = '500';
  el.classList.add('hud-item');
  if (!document.body.contains(el)) document.body.appendChild(el);

  const entry = { id, spec: slot, slot: resolved, order, el };
  el.dataset.slot = resolved;
  registry.set(id, entry);

  entry.ro = new ResizeObserver(() => layoutSlot(entry.slot));
  entry.ro.observe(el);
  layoutSlot(resolved);
  return () => unregister(id);
}

export function unregister(id) {
  const entry = registry.get(id);
  if (!entry) return;
  registry.delete(id);
  entry.ro.disconnect();
  entry.el.remove();
  layoutSlot(entry.slot);
}

export function relayout(slot) {
  if (slot) { layoutSlot(slot); return; }
  readInsets();
  // Re-evaluar slots responsivos (puede haber cruzado el breakpoint)
  registry.forEach((entry) => {
    const s = resolveSlot(entry.spec);
    if (s !== entry.slot) { entry.slot = s; entry.el.dataset.slot = s; }
  });
  Object.keys(SLOTS).forEach(layoutSlot);
}

function entriesOf(slot) {
  return [...registry.values()].filter((e) => e.slot === slot).sort((a, b) => a.order - b.order);
}

function layoutSlot(slot) {
  const cfg = SLOTS[slot];
  if (!cfg) return;
  const entries = entriesOf(slot);
  if (!entries.length) return;

  const W = window.innerWidth, H = window.innerHeight, m = margin();
  const top = m + insets.top + (cfg.extraTop || 0);
  const bottom = m + insets.bottom;
  const left = m + insets.left;
  const right = m + insets.right;
  // offsetWidth/Height ignoran transforms — las animaciones de escala de
  // los elementos no deben mover a los vecinos.
  const sizes = entries.map(({ el }) => ({ w: el.offsetWidth, h: el.offsetHeight }));

  if (cfg.stack === 'row') {
    let x = cfg.h === 'left' ? left : W - right;
    entries.forEach(({ el }, i) => {
      const { w, h } = sizes[i];
      const px = cfg.h === 'left' ? x : x - w;
      const py = cfg.v === 'top' ? top : H - bottom - h;
      place(el, px, py);
      x = cfg.h === 'left' ? x + w + GAP : x - w - GAP;
    });
    return;
  }

  // column
  const total = sizes.reduce((s, z, i) => s + z.h + (i ? GAP : 0), 0);
  let y;
  if (cfg.v === 'top') y = top;
  else if (cfg.v === 'bottom') y = H - bottom - total;
  else {
    // Centrado vertical dentro de la franja libre entre la fila superior
    // (botones de esquina, ~44-48px) y el borde inferior
    const bandTop = m + insets.top + 56, bandBottom = H - bottom;
    y = Math.max(bandTop, bandTop + ((bandBottom - bandTop) - total) / 2);
  }
  // En slots de fondo el orden 0 queda ABAJO (más cerca del borde)
  const ordered = cfg.v === 'bottom' ? entries.map((e, i) => i).reverse() : entries.map((e, i) => i);
  ordered.forEach((i) => {
    const { el } = entries[i];
    const { w, h } = sizes[i];
    let px;
    if (cfg.h === 'left') px = left;
    else if (cfg.h === 'right') px = W - right - w;
    else px = Math.round((W - w) / 2);
    place(el, px, y);
    y += h + GAP;
  });
}

function place(el, x, y) {
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
  el.style.right = '';
  el.style.bottom = '';
}

if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => relayout());
  window.addEventListener('orientationchange', () => setTimeout(() => relayout(), 120));
  if (mq) (mq.addEventListener ? mq.addEventListener('change', () => relayout()) : mq.addListener(() => relayout()));
  // Las fuentes web cambian el ancho de los textos al terminar de cargar
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => relayout());
  readInsets();
}
