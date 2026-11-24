// ============================================================================
// SIZE SLIDER — slider vertical de grosor en el borde derecho (donde cae
// el pulgar de la mano que no dibuja). Hecho a mano con Pointer Events en
// vez de <input type=range> rotado: el range vertical es inconsistente
// entre Safari/Chrome y su área táctil es mínima. Acá toda la columna es
// táctil y se puede arrastrar desde cualquier punto.
//
// Escala logarítmica: la diferencia entre 0.005 y 0.01 importa tanto como
// entre 0.1 y 0.2. La vista previa muestra el grosor y el color reales.
// ============================================================================
import { register } from '../hud-manager.js';
import { getState, setState, subscribe } from '../../core/store.js';

const MIN_W = 0.004;
const MAX_W = 0.25;

export const widthToT = (w) => Math.log(w / MIN_W) / Math.log(MAX_W / MIN_W);
export const tToWidth = (t) => MIN_W * Math.pow(MAX_W / MIN_W, Math.max(0, Math.min(1, t)));

export function createSizeSlider({ id = 'size-slider', order = 1 } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-slider';
  wrap.title = 'Grosor del trazo';
  wrap.innerHTML = `
    <div class="slider-preview"><span class="slider-dot"></span></div>
    <div class="slider-track"><div class="slider-fill"></div><div class="slider-thumb"></div></div>
    <div class="slider-value"></div>`;
  const track = wrap.querySelector('.slider-track');
  const fill = wrap.querySelector('.slider-fill');
  const thumb = wrap.querySelector('.slider-thumb');
  const dot = wrap.querySelector('.slider-dot');
  const value = wrap.querySelector('.slider-value');

  let dragging = null;
  function setFromY(clientY) {
    const r = track.getBoundingClientRect();
    const t = 1 - (clientY - r.top) / r.height; // arriba = más grueso
    setState({ brushWidth: +tToWidth(t).toFixed(4) });
  }
  track.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = e.pointerId;
    try { track.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    wrap.classList.add('dragging');
    setFromY(e.clientY);
  });
  track.addEventListener('pointermove', (e) => { if (dragging === e.pointerId) setFromY(e.clientY); });
  const end = (e) => { if (dragging === e.pointerId) { dragging = null; wrap.classList.remove('dragging'); } };
  track.addEventListener('pointerup', end);
  track.addEventListener('pointercancel', end);

  function render({ brushWidth, brushColor, activeTool }) {
    const t = Math.max(0, Math.min(1, widthToT(brushWidth)));
    thumb.style.bottom = `calc(${t * 100}% - 11px)`;
    fill.style.height = `${t * 100}%`;
    const px = Math.max(3, Math.min(30, 3 + t * 27));
    dot.style.width = dot.style.height = `${px}px`;
    dot.style.background = brushColor;
    value.textContent = Math.round(brushWidth * 1000);
    wrap.classList.toggle('dim', activeTool !== 'brush');
  }
  subscribe(render);
  render(getState());

  register({ id, slot: 'edge-right-center', order, el: wrap });
  return { el: wrap };
}
