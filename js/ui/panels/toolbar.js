// ============================================================================
// TOOLBAR — barra de herramientas lateral, estilo apps de dibujo en tablet
// (Feather, Procreate): siempre visible, un toque = cambiar de herramienta.
// Reemplaza a la rueda radial, que necesitaba 3 toques (abrir → herramienta
// → variante) para algo que se hace cientos de veces por sesión.
//
//  · Tocar una herramienta la activa con la última variante que usaste.
//  · Tocar la herramienta YA activa (o mantenerla apretada) abre sus
//    variantes al costado.
//  · El círculo de color abre la paleta.
//
// En tablet vive en el borde izquierdo (vertical); en teléfono el HUD
// manager la muda al borde inferior (horizontal) — el CSS lee
// data-slot para orientar los botones.
// ============================================================================
import { register } from '../hud-manager.js';
import { attachPopover } from '../popover.js';
import { getState, setState, subscribe } from '../../core/store.js';

const LONG_PRESS_MS = 420;

export const PALETTE = [
  '#ffffff', '#c9c4b8', '#5a564e', '#151412',
  '#e8655a', '#f4a259', '#f4d35e', '#6cc070',
  '#3dbfae', '#5b8def', '#8e6cef', '#e07ab8',
];

export function createToolbar({ id = 'toolbar', tools, order = 0, onSelect }) {
  const bar = document.createElement('div');
  bar.className = 'hud-toolbar';
  bar.setAttribute('role', 'toolbar');

  const buttons = new Map();     // toolId -> button
  const popovers = new Map();    // toolId -> popover api

  function variantOf(tool, variantId) {
    return tool.variants.find((v) => v.id === variantId) || tool.variants[0];
  }

  function select(tool, variant) {
    const st = getState();
    const patch = {
      activeTool: tool.id,
      activeVariant: variant.id,
      toolVariants: { ...st.toolVariants, [tool.id]: variant.id },
    };
    if (variant.brushWidth) patch.brushWidth = variant.brushWidth;
    setState(patch);
    if (onSelect) onSelect(tool, variant);
  }

  function buildVariantsPanel(tool) {
    const panel = document.createElement('div');
    panel.className = 'hud-panel variants-panel' + (tool.layout === 'grid' ? ' variants-grid' : '');
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = tool.label.toUpperCase();
    panel.appendChild(title);
    tool.variants.forEach((v) => {
      const b = document.createElement('button');
      b.className = tool.layout === 'grid' ? 'variant-tile' : 'variant-row';
      b.dataset.variant = v.id;
      b.innerHTML = `${v.icon}<span>${v.label}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        select(tool, v);
        popovers.get(tool.id).close();
      });
      panel.appendChild(b);
    });
    return panel;
  }

  tools.forEach((tool) => {
    const b = document.createElement('button');
    b.className = 'tool-btn';
    b.dataset.tool = tool.id;
    b.title = tool.label;
    b.setAttribute('aria-label', tool.label);
    if (tool.variants.length > 1) b.classList.add('has-variants');
    bar.appendChild(b);
    buttons.set(tool.id, b);

    if (tool.variants.length > 1) {
      popovers.set(tool.id, attachPopover({ trigger: b, panel: buildVariantsPanel(tool), toggleOnTrigger: false }));
    }

    // Mantener apretado = abrir variantes sin cambiar de herramienta todavía
    let pressTimer = null, longPressed = false;
    b.addEventListener('pointerdown', () => {
      longPressed = false;
      clearTimeout(pressTimer);
      if (!popovers.has(tool.id)) return;
      pressTimer = setTimeout(() => { longPressed = true; popovers.get(tool.id).open(); }, LONG_PRESS_MS);
    });
    const clear = () => clearTimeout(pressTimer);
    b.addEventListener('pointerup', clear);
    b.addEventListener('pointerleave', clear);
    b.addEventListener('pointercancel', clear);
    b.addEventListener('contextmenu', (e) => e.preventDefault());

    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (longPressed) return;
      const st = getState();
      const pop = popovers.get(tool.id);
      if (st.activeTool === tool.id && pop) { pop.toggle(); return; }
      select(tool, variantOf(tool, st.toolVariants[tool.id]));
    });
  });

  // ── Color ──
  const sep = document.createElement('div');
  sep.className = 'toolbar-sep';
  const swatchBtn = document.createElement('button');
  swatchBtn.className = 'tool-btn swatch-btn';
  swatchBtn.title = 'Color';
  swatchBtn.setAttribute('aria-label', 'Color');
  swatchBtn.innerHTML = '<span class="swatch-dot"></span>';
  bar.append(sep, swatchBtn);

  const colorPanel = document.createElement('div');
  colorPanel.className = 'hud-panel color-panel';
  colorPanel.innerHTML = `<div class="panel-title">COLOR</div><div class="swatch-grid"></div>
    <label class="custom-color"><input type="color" value="#ffffff"><span>Personalizado…</span></label>`;
  const grid = colorPanel.querySelector('.swatch-grid');
  PALETTE.forEach((c) => {
    const s = document.createElement('button');
    s.className = 'swatch';
    s.style.background = c;
    s.dataset.color = c;
    s.title = c;
    s.addEventListener('click', (e) => { e.stopPropagation(); setState({ brushColor: c }); colorPop.close(); });
    grid.appendChild(s);
  });
  const picker = colorPanel.querySelector('input[type=color]');
  picker.addEventListener('input', () => setState({ brushColor: picker.value }));
  const colorPop = attachPopover({ trigger: swatchBtn, panel: colorPanel });

  // ── Reactivo ──
  function render(st) {
    tools.forEach((tool) => {
      const b = buttons.get(tool.id);
      // La herramienta activa muestra la variante REALMENTE activa
      const vid = st.activeTool === tool.id ? st.activeVariant : st.toolVariants[tool.id];
      const v = variantOf(tool, vid);
      // Pincel y Figuras muestran la variante activa (qué pincel/qué figura);
      // el resto, el ícono de la herramienta, que se reconoce mejor de un vistazo.
      const html = (tool.showVariant && v.icon) || tool.icon;
      if (b._icon !== html) { b.innerHTML = html; b._icon = html; }
      b.classList.toggle('active', st.activeTool === tool.id);
      b.title = tool.variants.length > 1 ? `${tool.label} — ${v.label}` : tool.label;
      const pop = popovers.get(tool.id);
      if (pop) pop.panel.querySelectorAll('.variant-row, .variant-tile').forEach((r) =>
        r.classList.toggle('active', r.dataset.variant === v.id));
    });
    swatchBtn.querySelector('.swatch-dot').style.background = st.brushColor;
    grid.querySelectorAll('.swatch').forEach((s) =>
      s.classList.toggle('active', s.dataset.color.toLowerCase() === String(st.brushColor).toLowerCase()));
    if (picker.value.toLowerCase() !== String(st.brushColor).toLowerCase()) {
      try { picker.value = st.brushColor; } catch (err) { /* color no válido para el input */ }
    }
  }
  subscribe(render, (s) => [s.activeTool, s.activeVariant, s.toolVariants, s.brushColor]);
  render(getState());

  register({ id, slot: { wide: 'edge-left-center', narrow: 'edge-bottom-center' }, order, el: bar });
  return { el: bar };
}
