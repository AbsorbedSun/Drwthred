import { register } from './ui/hud-manager.js';
import { toast } from './ui/toast.js';
import { createToolWheel } from './ui/panels/tool-wheel.js';
import { createLayersPanel } from './ui/panels/layers-panel.js';
import { setState } from './core/store.js';
import { undo, redo, canUndo, canRedo, subscribeHistory } from './core/history.js';

// ── Deshacer / rehacer — esquina arriba-derecha, libre desde que la rueda
// se mudó a la izquierda. Categoría 1 (siempre visibles, sin panel: tocar
// ejecuta la acción directo, no hay nada que desplegar).
const undoBtn = document.createElement('button');
undoBtn.className = 'hud-fab';
undoBtn.textContent = '↺';
undoBtn.title = 'Deshacer';
register({ id: 'undo-btn', slot: 'corner-top-right', order: 0, el: undoBtn });

const redoBtn = document.createElement('button');
redoBtn.className = 'hud-fab';
redoBtn.textContent = '↻';
redoBtn.title = 'Rehacer';
register({ id: 'redo-btn', slot: 'corner-top-right', order: 1, el: redoBtn });

function syncUndoRedoUI() {
  undoBtn.disabled = !canUndo();
  redoBtn.disabled = !canRedo();
}
subscribeHistory(syncUndoRedoUI);
syncUndoRedoUI();

undoBtn.addEventListener('click', () => { if (!undo()) toast('Nada para deshacer'); });
redoBtn.addEventListener('click', () => { if (!redo()) toast('Nada para rehacer'); });

// Atajos de teclado — comodidad para probar en escritorio, no reemplazan
// los botones (la app es táctil-first, esto es un extra).
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  // e.key llega en mayúscula cuando Shift está apretado ('Z', no 'z') —
  // sin el toLowerCase(), Ctrl+Shift+Z nunca matcheaba nada.
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
});

// ── Rueda radial de herramientas — pincel, goma, figuras, selección ──
// Segmento pedido: cada botón despliega un submenú satélite con variantes.
// Cada variante de pincel trae su propio color/ancho, para que el store
// realmente cambie algo observable (antes solo lo mostraba en un toast).
createToolWheel({
  id: 'tool-wheel',
  slot: 'corner-top-left',
  order: 0,
  tools: [
    { id: 'brush', icon: '✎', label: 'Pincel', variants: [
      { id: 'pencil', icon: '✎', label: 'Lápiz', brushColor: '#ffffff', brushWidth: 0.015 },
      { id: 'marker', icon: '🖊', label: 'Marcador', brushColor: '#f4d35e', brushWidth: 0.05 },
      { id: 'airbrush', icon: '💨', label: 'Aerógrafo', brushColor: '#e07a5f', brushWidth: 0.09 },
    ]},
    { id: 'eraser', icon: '⌫', label: 'Goma', variants: [
      { id: 'erase-full', icon: '⬛', label: 'Borrado total' },
      { id: 'erase-partial', icon: '◐', label: 'Borrado parcial' },
    ]},
    { id: 'shapes', icon: '◆', label: 'Figuras', variants: [
      { id: 'plane', icon: '▱', label: 'Plano' },
      { id: 'cube', icon: '⬚', label: 'Cubo' },
      { id: 'sphere', icon: '○', label: 'Esfera' },
      { id: 'cylinder', icon: '⬭', label: 'Cilindro' },
      { id: 'cone', icon: '▲', label: 'Cono' },
    ]},
    { id: 'select', icon: '⬚', label: 'Selección', variants: [
      { id: 'select-single', icon: '•', label: 'Individual' },
      { id: 'select-lasso', icon: '◯', label: 'Lazo' },
    ]},
  ],
  onSelect: (toolId, variantId, variant) => {
    const patch = { activeTool: toolId, activeVariant: variantId };
    // Solo las variantes de pincel traen color/ancho propios — las demás
    // (goma, figuras, selección) no tocan esos campos del store todavía.
    if (variant.brushColor) patch.brushColor = variant.brushColor;
    if (variant.brushWidth) patch.brushWidth = variant.brushWidth;
    setState(patch);
    toast(`Herramienta activa: ${toolId} / ${variantId}`);
  },
});

// ── Un segundo elemento REAL apilado debajo, en el mismo slot — sigue
// probando el anti-colisión, ahora del lado izquierdo junto a la rueda.
const settingsBtn = document.createElement('button');
settingsBtn.className = 'hud-fab';
settingsBtn.textContent = '⚙';
settingsBtn.title = 'Ajustes (placeholder) — mirá cómo se corre cuando la rueda se abre';
register({ id: 'settings-fab', slot: 'corner-top-left', order: 1, el: settingsBtn });
settingsBtn.addEventListener('click', () => toast('Acá iría el panel de ajustes'));

// ── Panel de capas (categoría 2) — esquina abajo-izquierda ──
createLayersPanel({ id: 'layers-panel', slot: 'corner-bottom-left', order: 0 });

// (El panel contextual de ejemplo que vivía en esquina abajo-derecha ya
// cumplió su función — probar que categoría 2 funcionaba. Ese lugar ahora
// lo ocupa el panel de archivo real, ver scene-demo.js.)

// ── Notificación transitoria (categoría 3) ──
document.getElementById('toast-trigger').addEventListener('click', () => {
  toast('Guardado ✓');
});
