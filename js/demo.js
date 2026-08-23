import { register } from './ui/hud-manager.js';
import { toast } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { createToolWheel } from './ui/panels/tool-wheel.js';
import { createLayersPanel } from './ui/panels/layers-panel.js';
import { setState } from './core/store.js';
import { undo, redo, canUndo, canRedo, subscribeHistory } from './core/history.js';

// ── Deshacer / rehacer — un solo grupo, lado a lado (no apilados verticalmente
// como antes). Para el HUD manager sigue siendo UN elemento en el slot, así
// que el anti-colisión no cambia — adentro del grupo el layout es propio.
const undoRedoGroup = document.createElement('div');
undoRedoGroup.className = 'hud-btn-group';

const undoBtn = document.createElement('button');
undoBtn.className = 'hud-fab';
undoBtn.innerHTML = icon('undo');
undoBtn.title = 'Deshacer';

const redoBtn = document.createElement('button');
redoBtn.className = 'hud-fab';
redoBtn.innerHTML = icon('redo');
redoBtn.title = 'Rehacer';

undoRedoGroup.append(undoBtn, redoBtn);
register({ id: 'undo-redo-group', slot: 'corner-top-right', order: 0, el: undoRedoGroup });

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
// Cada variante de pincel trae su propio color/ancho, para que el store
// realmente cambie algo observable.
createToolWheel({
  id: 'tool-wheel',
  slot: 'corner-top-left',
  order: 0,
  tools: [
    { id: 'brush', icon: icon('pencil'), label: 'Pincel', variants: [
      { id: 'pencil', icon: icon('pencilThin'), label: 'Lápiz', brushColor: '#ffffff', brushWidth: 0.015 },
      { id: 'marker', icon: icon('marker'), label: 'Marcador', brushColor: '#f4d35e', brushWidth: 0.05 },
      { id: 'airbrush', icon: icon('airbrush'), label: 'Aerógrafo', brushColor: '#e07a5f', brushWidth: 0.09 },
    ]},
    { id: 'eraser', icon: icon('eraser'), label: 'Goma', variants: [
      { id: 'erase-full', icon: icon('eraseFull'), label: 'Borrado total' },
      { id: 'erase-partial', icon: icon('erasePartial'), label: 'Borrado parcial' },
    ]},
    { id: 'shapes', icon: icon('shapes'), label: 'Figuras', variants: [
      { id: 'plane', icon: icon('plane'), label: 'Plano' },
      { id: 'cube', icon: icon('cube'), label: 'Cubo' },
      { id: 'sphere', icon: icon('sphere'), label: 'Esfera' },
      { id: 'cylinder', icon: icon('cylinder'), label: 'Cilindro' },
      { id: 'cone', icon: icon('cone'), label: 'Cono' },
    ]},
    { id: 'select', icon: icon('cursor'), label: 'Selección', variants: [
      { id: 'select-single', icon: icon('selectSingle'), label: 'Individual' },
      { id: 'select-lasso', icon: icon('selectLasso'), label: 'Lazo' },
    ]},
  ],
  onSelect: (toolId, variantId, variant) => {
    const patch = { activeTool: toolId, activeVariant: variantId };
    if (variant.brushColor) patch.brushColor = variant.brushColor;
    if (variant.brushWidth) patch.brushWidth = variant.brushWidth;
    setState(patch);
    toast(`Herramienta activa: ${toolId} / ${variantId}`);
  },
});

// ── Segundo elemento en el mismo slot que la rueda — sigue probando el
// anti-colisión con un caso real, ahora con ícono en vez de emoji.
const settingsBtn = document.createElement('button');
settingsBtn.className = 'hud-fab';
settingsBtn.innerHTML = icon('gear');
settingsBtn.title = 'Ajustes (placeholder)';
register({ id: 'settings-fab', slot: 'corner-top-left', order: 1, el: settingsBtn });
settingsBtn.addEventListener('click', () => toast('Acá iría el panel de ajustes'));

// ── Panel de capas (categoría 2) — esquina abajo-izquierda ──
createLayersPanel({ id: 'layers-panel', slot: 'corner-bottom-left', order: 0 });

// ── Notificación transitoria (categoría 3) ──
document.getElementById('toast-trigger').addEventListener('click', () => {
  toast('Guardado ✓');
});

// ── Cerrar el panel de instrucciones — es documentación de la demo, no
// parte de la HUD real; no tiene sentido que ocupe el centro de la
// pantalla para siempre.
document.getElementById('doc-close').addEventListener('click', () => {
  document.getElementById('doc-panel').classList.add('hidden');
});
