// ============================================================================
// TOAST — notificación transitoria (categoría 3 del sistema de HUD).
// Aparece sola cuando algo pasa, se cierra sola. Nunca requiere un toque
// para verse — a diferencia de un panel contextual.
// ============================================================================
import { register } from './hud-manager.js';

let el = null;
let hideTimer = null;

function ensureEl() {
  if (el) return el;
  el = document.createElement('div');
  el.className = 'hud-toast';
  register({ id: 'toast', slot: 'edge-bottom-center', order: 0, el });
  return el;
}

/**
 * Muestra un mensaje transitorio.
 * @param {string} msg
 * @param {number} [ms=2200] duración visible antes de desvanecerse
 */
export function toast(msg, ms = 2200) {
  const node = ensureEl();
  node.textContent = msg;
  node.classList.add('show');
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => node.classList.remove('show'), ms);
}
