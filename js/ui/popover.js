// ============================================================================
// POPOVER — panel flotante anclado a un disparador. Un solo lugar para lo
// que antes repetía cada panel (abrir/cerrar, cerrar al tocar afuera) y
// para lo que en tablet/teléfono importa de verdad:
//
//  · Se posiciona con JS contra el rect real del disparador y se mantiene
//    DENTRO de la pantalla (antes, un panel de 220px anclado a un botón
//    cerca del borde se salía en un teléfono).
//  · Elige solo hacia dónde abrir según dónde está el disparador: hacia
//    abajo desde la fila superior, a la derecha desde la barra lateral,
//    hacia arriba desde la barra inferior.
//  · Un solo popover abierto a la vez.
//  · Tocar el lienzo con un popover abierto SOLO lo cierra — no deja un
//    trazo accidental (el toque se consume antes de llegar al canvas).
// ============================================================================
const all = new Set();

export function closeAllPopovers(except) {
  all.forEach((p) => { if (p !== except) p.close(); });
}

function autoPlacement(r) {
  const W = window.innerWidth, H = window.innerHeight;
  if (r.top < H * 0.22) return 'down';
  if (r.bottom > H * 0.78) return 'up';
  return r.left + r.width / 2 < W / 2 ? 'right' : 'left';
}

/**
 * @param {Object} cfg
 * @param {HTMLElement} cfg.trigger
 * @param {HTMLElement} cfg.panel     - contenido; se mueve a <body>
 * @param {string} [cfg.placement='auto'] - auto | down | up | left | right
 * @param {boolean} [cfg.toggleOnTrigger=true]
 * @param {Function} [cfg.onOpen]
 */
export function attachPopover({ trigger, panel, placement = 'auto', toggleOnTrigger = true, onOpen, onClose }) {
  panel.classList.add('hud-popover');
  document.body.appendChild(panel);
  let isOpen = false;

  function position() {
    const r = trigger.getBoundingClientRect();
    const pw = panel.offsetWidth, ph = panel.offsetHeight;
    const W = window.innerWidth, H = window.innerHeight, m = 8, gap = 10;
    const place = placement === 'auto' ? autoPlacement(r) : placement;
    let x, y;
    if (place === 'down') { x = r.left + r.width / 2 - pw / 2; y = r.bottom + gap; }
    else if (place === 'up') { x = r.left + r.width / 2 - pw / 2; y = r.top - gap - ph; }
    else if (place === 'right') { x = r.right + gap; y = r.top + r.height / 2 - ph / 2; }
    else { x = r.left - gap - pw; y = r.top + r.height / 2 - ph / 2; }
    x = Math.max(m, Math.min(W - pw - m, x));
    y = Math.max(m, Math.min(H - ph - m, y));
    panel.style.left = `${Math.round(x)}px`;
    panel.style.top = `${Math.round(y)}px`;
    panel.dataset.place = place;
  }

  const api = {
    open() {
      if (isOpen) { position(); return; }
      closeAllPopovers(api);
      isOpen = true;
      if (onOpen) onOpen();
      panel.classList.add('open');
      trigger.classList.add('is-open');
      position();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      panel.classList.remove('open');
      trigger.classList.remove('is-open');
      if (onClose) onClose();
    },
    toggle() { isOpen ? api.close() : api.open(); },
    isOpen: () => isOpen,
    position,
    panel,
  };
  all.add(api);

  if (toggleOnTrigger) {
    trigger.addEventListener('click', (e) => { e.stopPropagation(); api.toggle(); });
  }

  // Fase de captura: se decide antes que nadie (incluido el canvas)
  document.addEventListener('pointerdown', (e) => {
    if (!isOpen) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    // Un diálogo abierto desde el panel (renombrar, confirmar) no lo cierra
    if (e.target.closest && e.target.closest('.app-dialog')) return;
    api.close();
    if (e.target && e.target.id === 'scene-canvas') { e.stopPropagation(); e.preventDefault(); }
  }, true);

  window.addEventListener('resize', () => { if (isOpen) position(); });
  // El contenido puede cambiar de tamaño estando abierto (ej: nueva capa)
  new ResizeObserver(() => { if (isOpen) position(); }).observe(panel);

  return api;
}
