// ============================================================================
// HUD MANAGER
//
// El problema que resuelve: en el proyecto anterior, cada botón flotante
// (`#bprims`, `#sc-fab`, `#sbar`...) tenía su propio top/right fijo escrito
// a mano en CSS. Cuando uno cambiaba de tamaño, nada sabía que tenía que
// correr al vecino — así terminamos con varios botones tapándose entre sí.
//
// Acá en vez de eso, cada elemento se REGISTRA en un slot nombrado (una
// esquina o borde de la pantalla) con un orden. Este módulo calcula la
// posición real de cada uno apilándolos con un espacio fijo (--hud-gap),
// y vuelve a calcular todo automáticamente cuando el tamaño de cualquiera
// cambia (via ResizeObserver). Ningún elemento vuelve a necesitar saber
// dónde está el de al lado.
// ============================================================================

const GAP = 10; // debe coincidir con --hud-gap en style.css

// Cada slot define: en qué esquina/borde vive, en qué dirección se apila,
// y si se centra horizontalmente (para los slots de borde superior/inferior).
const SLOTS = {
  // top-left tiene más margen superior que el resto: es donde vive la rueda
  // de herramientas, que necesita aire para su arco al abrirse.
  'corner-top-left':     { anchor: { top: 40, left: 8 },   stack: 'vertical' },
  'corner-top-right':    { anchor: { top: 8, right: 8 },   stack: 'vertical' },
  'corner-bottom-left':  { anchor: { bottom: 8, left: 8 }, stack: 'vertical' },
  'corner-bottom-right': { anchor: { bottom: 8, right: 8 },stack: 'vertical' },
  'edge-top-center':     { anchor: { top: 8 },             stack: 'horizontal', center: true },
  'edge-bottom-center':  { anchor: { bottom: 8 },           stack: 'horizontal', center: true },
};

// slot -> [{ id, order, el, ro }]
const registry = new Map();

/**
 * Registra un elemento de HUD en un slot.
 * @param {Object} cfg
 * @param {string} cfg.id     - identificador único
 * @param {string} cfg.slot   - una de las claves de SLOTS
 * @param {number} [cfg.order=0] - orden dentro del slot (menor = más cerca de la esquina)
 * @param {HTMLElement} cfg.el - el elemento a posicionar (ya debe existir en el DOM o se agrega acá)
 * @returns {Function} función para des-registrar
 */
export function register({ id, slot, order = 0, el }) {
  if (!SLOTS[slot]) {
    throw new Error(`[hud-manager] Slot desconocido: "${slot}". Slots válidos: ${Object.keys(SLOTS).join(', ')}`);
  }
  if (!(el instanceof HTMLElement)) {
    throw new Error(`[hud-manager] register("${id}") necesita un elemento DOM real en cfg.el`);
  }

  if (!registry.has(slot)) registry.set(slot, []);
  const entries = registry.get(slot);

  if (entries.some(e => e.id === id)) {
    throw new Error(`[hud-manager] Ya existe un elemento registrado con id "${id}"`);
  }

  el.style.position = 'fixed';
  if (!el.style.zIndex) el.style.zIndex = '500';
  if (!document.body.contains(el)) document.body.appendChild(el);

  const entry = { id, order, el };
  entries.push(entry);
  entries.sort((a, b) => a.order - b.order);

  // Si el elemento cambia de tamaño en cualquier momento (crece, se abre un
  // panel adentro, cambia el texto...), todo el slot se vuelve a calcular.
  const ro = new ResizeObserver(() => layoutSlot(slot));
  ro.observe(el);
  entry.ro = ro;

  layoutSlot(slot);

  return () => unregister(slot, id);
}

/** Quita un elemento del slot y reacomoda a los que quedan. */
export function unregister(slot, id) {
  const entries = registry.get(slot);
  if (!entries) return;
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) return;
  const [entry] = entries.splice(idx, 1);
  entry.ro.disconnect();
  entry.el.remove();
  layoutSlot(slot);
}

/** Fuerza recalcular un slot puntual (normalmente no hace falta llamarlo a mano). */
export function relayout(slot) {
  if (slot) layoutSlot(slot);
  else for (const s of registry.keys()) layoutSlot(s);
}

function layoutSlot(slot) {
  const cfg = SLOTS[slot];
  const entries = registry.get(slot) || [];
  let offset = 0;

  for (const { el } of entries) {
    if (cfg.stack === 'vertical') {
      if (cfg.anchor.top != null) {
        el.style.top = `${cfg.anchor.top + offset}px`;
        el.style.bottom = '';
      } else {
        el.style.bottom = `${cfg.anchor.bottom + offset}px`;
        el.style.top = '';
      }
      if (cfg.anchor.left != null) { el.style.left = `${cfg.anchor.left}px`; el.style.right = ''; }
      else { el.style.right = `${cfg.anchor.right}px`; el.style.left = ''; }
      el.style.transform = '';
      offset += el.getBoundingClientRect().height + GAP;
    } else {
      // horizontal, centrado — usado por los slots de borde superior/inferior
      // (se calcula el ancho total primero para poder centrar el grupo)
    }
  }

  if (cfg.stack === 'horizontal' && cfg.center) {
    const total = entries.reduce((sum, { el }, i) =>
      sum + el.getBoundingClientRect().width + (i > 0 ? GAP : 0), 0);
    let x = -total / 2;
    for (const { el } of entries) {
      const w = el.getBoundingClientRect().width;
      el.style.left = '50%';
      el.style.right = '';
      el.style.transform = `translateX(${x}px)`;
      if (cfg.anchor.top != null) el.style.top = `${cfg.anchor.top}px`;
      else el.style.bottom = `${cfg.anchor.bottom}px`;
      x += w + GAP;
    }
  }
}

// Los slots centrados dependen del ancho de la ventana
window.addEventListener('resize', () => relayout());
