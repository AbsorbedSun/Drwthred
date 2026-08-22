// ============================================================================
// TOOL WHEEL — rueda radial de herramientas.
//
// Es un "panel contextual" (categoría 2 del sistema de HUD) con una
// geometría interna distinta a la del panel rectangular: en vez de un
// cuadro que aparece abajo del disparador, los ítems se distribuyen en
// arco alrededor de él. Para el HUD manager esto es indistinguible de
// cualquier otro elemento — solo ve un contenedor y su bounding box, así
// que el anti-colisión con vecinos en el mismo slot sigue funcionando
// igual (lo probamos en la demo: cuando la rueda se abre, cualquier otro
// elemento apilado debajo en el mismo slot se corre solo).
//
// Interacción:
//   1. Estado cerrado: solo se ve el disparador (ícono de la herramienta activa).
//   2. Tocar el disparador → se abren los N segmentos en arco.
//   3. Tocar un segmento → se abre un submenú satélite con las variantes
//      de esa herramienta (ej: Pincel → Lápiz/Marcador/Aerógrafo).
//   4. Tocar una variante → esa pasa a ser la herramienta activa, el
//      disparador actualiza su ícono, y todo se cierra.
//   5. Tocar afuera en cualquier momento → cierra sin cambiar la selección.
// ============================================================================
import { register } from '../hud-manager.js';

const RADIUS = 104;     // distancia del centro a cada segmento
const SUB_RADIUS = 190; // distancia del centro al submenú satélite

/**
 * @param {Object} cfg
 * @param {string} cfg.id
 * @param {string} cfg.slot   - slot de esquina (el arco se orienta solo hacia el lado libre)
 * @param {number} cfg.order
 * @param {Array}  cfg.tools  - [{ id, icon, label, variants:[{id,icon,label}] }]
 * @param {Function} [cfg.onSelect] - (toolId, variantId) => void
 */
export function createToolWheel({ id, slot, order, tools, onSelect }) {
  // El arco se abre hacia el cuadrante libre de pantalla según de qué
  // esquina cuelga el disparador (evita que los segmentos salgan del viewport).
  const ARC_BY_SLOT = {
    'corner-top-right':    { start: 100, end: 190 }, // hacia abajo-izquierda
    'corner-top-left':     { start: -10, end: 80 },  // hacia abajo-derecha
    'corner-bottom-right': { start: 190, end: 280 }, // hacia arriba-izquierda
    'corner-bottom-left':  { start: 260, end: 350 }, // hacia arriba-derecha
  };
  const arc = ARC_BY_SLOT[slot] || ARC_BY_SLOT['corner-top-right'];
  const anchorRight = slot.includes('right');
  const anchorBottom = slot.includes('bottom');

  const wrap = document.createElement('div');
  wrap.className = 'tool-wheel';
  wrap.style.width = '44px';
  wrap.style.height = '44px';

  const trigger = document.createElement('button');
  trigger.className = 'tool-wheel-trigger';
  trigger.style[anchorRight ? 'right' : 'left'] = '0';
  trigger.style[anchorBottom ? 'bottom' : 'top'] = '0';

  let active = { toolIdx: 0, variantIdx: 0 };
  function setActive(toolIdx, variantIdx) {
    active = { toolIdx, variantIdx };
    const tool = tools[toolIdx];
    const variant = tool.variants[variantIdx];
    trigger.textContent = variant.icon || tool.icon;
    trigger.title = `${tool.label} — ${variant.label}`;
    if (onSelect) onSelect(tool.id, variant.id, variant);
  }

  const ring = document.createElement('div');
  ring.className = 'tool-wheel-ring';

  const submenu = document.createElement('div');
  submenu.className = 'tool-wheel-submenu';

  wrap.append(ring, trigger, submenu);

  // Centro del arco: coincide con el centro del disparador (esquina del wrap)
  function centerPoint() {
    const cx = anchorRight ? wrap.clientWidth - 22 : 22;
    const cy = anchorBottom ? wrap.clientHeight - 22 : 22;
    return { cx, cy };
  }

  function placeOnArc(el, i, count, radius) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const deg = arc.start + t * (arc.end - arc.start);
    const rad = (deg * Math.PI) / 180;
    const { cx, cy } = centerPoint();
    const x = cx + radius * Math.cos(rad);
    const y = cy + radius * Math.sin(rad);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    return deg;
  }

  function closeSubmenu() {
    submenu.classList.remove('open');
    submenu.innerHTML = '';
    ring.querySelectorAll('.tool-wheel-seg.picked').forEach(b => b.classList.remove('picked'));
  }

  function openSubmenu(toolIdx, segEl, deg) {
    closeSubmenu();
    segEl.classList.add('picked');
    const tool = tools[toolIdx];
    const { cx, cy } = centerPoint();
    const rad = (deg * Math.PI) / 180;
    submenu.style.left = `${cx + SUB_RADIUS * Math.cos(rad)}px`;
    submenu.style.top = `${cy + SUB_RADIUS * Math.sin(rad)}px`;

    tool.variants.forEach((v, vi) => {
      const b = document.createElement('button');
      b.className = 'tool-wheel-variant';
      b.textContent = v.icon || v.label[0];
      b.title = v.label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setActive(toolIdx, vi);
        close();
      });
      submenu.appendChild(b);
    });
    submenu.classList.add('open');
  }

  function open() {
    wrap.classList.add('open');
    wrap.style.width = '260px';
    wrap.style.height = '260px';
  }
  function close() {
    wrap.classList.remove('open');
    wrap.style.width = '44px';
    wrap.style.height = '44px';
    closeSubmenu();
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.contains('open') ? close() : open();
  });

  document.addEventListener('click', (e) => {
    if (wrap.classList.contains('open') && !wrap.contains(e.target)) close();
  });

  // Construir segmentos
  tools.forEach((tool, i) => {
    const seg = document.createElement('button');
    seg.className = 'tool-wheel-seg';
    seg.textContent = tool.icon;
    seg.title = tool.label;
    ring.appendChild(seg);
    // reposicionar cuando el wrap termina su transición de apertura
    const reposition = () => {
      const deg = placeOnArc(seg, i, tools.length, RADIUS);
      seg._deg = deg;
    };
    wrap._segRepositions = wrap._segRepositions || [];
    wrap._segRepositions.push(reposition);
    seg.addEventListener('click', (e) => {
      e.stopPropagation();
      openSubmenu(i, seg, seg._deg);
    });
  });

  // Reposicionar segmentos cada vez que el wrap cambia de tamaño (abrir/cerrar)
  const ro = new ResizeObserver(() => {
    (wrap._segRepositions || []).forEach(fn => fn());
  });
  ro.observe(wrap);

  setActive(0, 0);
  register({ id, slot, order, el: wrap });
  return { el: wrap, setActive };
}
