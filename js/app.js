// ============================================================================
// APP — punto de entrada único. Arma la escena, la entrada y la HUD.
// (Reemplaza a demo.js + scene-demo.js: la HUD nueva necesita la cámara
// para varios paneles — barra de planos, gizmo — y partirla en dos
// archivos ya no tenía sentido.)
//
// Distribución de la HUD (tablet):
//   arriba-izq   : Archivo · Capas · Vistas · Ajustes
//   arriba-der   : Deshacer · Rehacer
//   borde izq    : barra de herramientas + color
//   borde der    : grosor
//   abajo-centro : barra de planos
//   abajo-der    : gizmo de ejes
// En teléfono el HUD manager muda la barra de herramientas abajo y el
// gizmo al borde derecho, sin que este archivo tenga que saberlo.
// ============================================================================
import { createScene } from './core/scene.js';
import { createCameraController } from './core/camera-controller.js';
import { getState, setState, subscribe } from './core/store.js';
import { undo, redo, canUndo, canRedo, subscribeHistory } from './core/history.js';
import { attachGestures } from './input/gestures.js';
import { createToolRouter } from './input/tool-router.js';
import { createStrokeEngine } from './drawing/stroke-engine.js';
import { syncLayerVisibility } from './drawing/layers.js';
import { syncSelectionHighlight, selectedObjects, setSelection } from './drawing/selection.js';
import { duplicateObjects, deleteObjects } from './drawing/object-actions.js';
import { createTransformController } from './drawing/transform.js';
import { createPlaneGuide } from './drawing/plane-guide.js';
import { BRUSHES } from './drawing/brushes.js';
import { register } from './ui/hud-manager.js';
import { toast } from './ui/toast.js';
import { icon } from './ui/icons.js';
import { createToolbar } from './ui/panels/toolbar.js';
import { createSizeSlider } from './ui/panels/size-slider.js';
import { createPlaneBar } from './ui/panels/plane-bar.js';
import { createSelectionBar } from './ui/panels/selection-bar.js';
import { createNavGizmo } from './ui/panels/nav-gizmo.js';
import { createLayersPanel } from './ui/panels/layers-panel.js';
import { createViewsPanel } from './ui/panels/views-panel.js';
import { createFilePanel } from './ui/panels/file-panel.js';
import { createSettingsPanel, isPenMode } from './ui/panels/settings-panel.js';
import { createHelpSheet } from './ui/help-sheet.js';

// ── Escena ──
const canvas = document.getElementById('scene-canvas');
const { scene, camera, renderer, render, renderIfNeeded, invalidate } = createScene(canvas);
const camCtl = createCameraController(camera);
const strokeEngine = createStrokeEngine(scene, camera);
const mirrorEngine = createStrokeEngine(scene, camera); // trazo espejado en vivo
const planeGuide = createPlaneGuide(scene);

syncLayerVisibility(scene);
syncSelectionHighlight(scene);
const transform = createTransformController({ scene, camera });

// ── Entrada ──
// Contorno del lazo: una capa SVG encima del lienzo (el router solo
// informa los puntos en NDC; acá se dibujan en píxeles)
const lassoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
lassoSvg.classList.add('lasso-overlay');
lassoSvg.innerHTML = '<polyline points=""/>';
document.body.appendChild(lassoSvg);
function drawLasso(path) {
  const line = lassoSvg.firstChild;
  if (!path) { line.setAttribute('points', ''); return; }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  line.setAttribute('points', path.map((p) => `${((p.x + 1) / 2) * w},${((1 - p.y) / 2) * h}`).join(' '));
}

const toolRouter = createToolRouter({
  scene, camera, camCtl, strokeEngine, mirrorEngine, transform,
  onNotice: (msg) => toast(msg),
  onLasso: drawLasso,
});

function doUndo() { if (undo()) toast('Deshecho'); else toast('Nada para deshacer'); }
function doRedo() { if (redo()) toast('Rehecho'); else toast('Nada para rehacer'); }

attachGestures(canvas, {
  camCtl, router: toolRouter, transform,
  isPenMode: () => isPenMode(),
  onPenDetected: () => {
    const st = getState();
    if (st.penDetected) return;
    setState({ penDetected: true });
    if (st.inputMode === 'auto') toast('Lápiz detectado: el lápiz dibuja, el dedo navega');
  },
  onUndo: doUndo,
  onRedo: doRedo,
  onActivity: invalidate, // dibujar, borrar, mover: la escena cambió
});

// ── HUD: fila superior izquierda ──
createFilePanel({
  id: 'file-panel', slot: 'corner-top-left', order: 0, scene, strokeEngine, renderer, onToast: toast,
  exportOpts: { render, hide: [planeGuide.group, planeGuide.mirrorGroup, scene.getObjectByName('floor-grid')] },
});
createLayersPanel({ id: 'layers-panel', slot: 'corner-top-left', order: 1 });
createViewsPanel({ id: 'views-panel', slot: 'corner-top-left', order: 2, camCtl });
const help = createHelpSheet();
createSettingsPanel({ id: 'settings', slot: 'corner-top-left', order: 3, onHelp: () => help.open() });

// ── Deshacer / rehacer ──
const undoRedoGroup = document.createElement('div');
undoRedoGroup.className = 'hud-btn-group';
const undoBtn = document.createElement('button');
undoBtn.className = 'hud-fab';
undoBtn.innerHTML = icon('undo');
undoBtn.title = 'Deshacer (toque con 2 dedos)';
undoBtn.setAttribute('aria-label', 'Deshacer');
const redoBtn = document.createElement('button');
redoBtn.className = 'hud-fab';
redoBtn.innerHTML = icon('redo');
redoBtn.title = 'Rehacer (toque con 3 dedos)';
redoBtn.setAttribute('aria-label', 'Rehacer');
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

// ── Barra de herramientas ──
createToolbar({
  id: 'toolbar',
  tools: [
    // Los pinceles salen del catálogo (drawing/brushes.js): agregar uno ahí
    // lo suma solo a este menú.
    { id: 'brush', icon: icon('brush'), label: 'Pinceles', showVariant: true, layout: 'grid',
      variants: BRUSHES.map((b) => ({ id: b.id, icon: icon(b.icon), label: b.label, brushWidth: b.width })) },
    { id: 'eraser', icon: icon('eraser'), label: 'Goma', variants: [
      { id: 'erase-full', icon: icon('eraseFull'), label: 'Borrar trazo entero' },
      { id: 'erase-partial', icon: icon('erasePartial'), label: 'Borrar una parte' },
    ]},
    { id: 'select', icon: icon('cursor'), label: 'Selección', showVariant: true, variants: [
      { id: 'select-single', icon: icon('cursor'), label: 'Tocar y mover' },
      { id: 'select-lasso', icon: icon('lasso'), label: 'Lazo (varios)' },
    ]},
    { id: 'shapes', icon: icon('shapes'), label: 'Figuras', showVariant: true, variants: [
      { id: 'cube', icon: icon('cube'), label: 'Cubo' },
      { id: 'plane', icon: icon('plane'), label: 'Plano' },
      { id: 'sphere', icon: icon('sphere'), label: 'Esfera' },
      { id: 'cylinder', icon: icon('cylinder'), label: 'Cilindro' },
      { id: 'cone', icon: icon('cone'), label: 'Cono' },
    ]},
    { id: 'plane', icon: icon('planeTool'), label: 'Plano', showVariant: true, variants: [
      { id: 'plane-move', icon: icon('planeTool'), label: 'Mover plano' },
      { id: 'plane-rotate', icon: icon('rotatePlane'), label: 'Girar plano' },
    ]},
  ],
});

createSizeSlider({ id: 'size-slider', order: 1 });
createPlaneBar({ id: 'plane-bar', order: 1, camCtl, camera, scene, onToast: toast });
createSelectionBar({ id: 'selection-bar', scene, camera, camCtl, onToast: toast });
const gizmo = createNavGizmo({ id: 'nav-gizmo', camCtl, camera });

// Al cambiar de plano, avisar cuál quedó (feedback sin mirar la barra)
subscribe(({ drawPlane }) => {
  const names = { view: 'Plano libre', front: 'Plano frente', side: 'Plano lado', ground: 'Plano suelo', custom: 'Plano propio', surface: 'Dibujar sobre figuras' };
  toast(names[drawPlane.mode] || 'Plano');
}, (s) => s.drawPlane.mode);

// Render bajo demanda: cualquier cambio de estado o de historial (deshacer
// saca/pone meshes) marca la escena como sucia. Los movimientos de cámara
// se detectan solos en scene.js.
subscribe(invalidate);
subscribeHistory(invalidate);

// ── Atajos de teclado (extra para escritorio) ──
document.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase(); // con Shift llega 'Z', no 'z'
    if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redo(); }
    else if (key === 'd') {
      const list = selectedObjects(scene);
      if (list.length) { e.preventDefault(); duplicateObjects(scene, list); }
    }
    return;
  }
  if (e.key === 'Escape') { setSelection([]); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const list = selectedObjects(scene);
    if (list.length) { e.preventDefault(); deleteObjects(scene, list); }
    return;
  }
  const tools = { b: 'brush', e: 'eraser', v: 'select', s: 'shapes', p: 'plane' };
  const t = tools[e.key.toLowerCase()];
  if (t) {
    const st = getState();
    setState({ activeTool: t, activeVariant: st.toolVariants[t] });
  }
});

// Expuesto para las pruebas automáticas — no es parte de la app final
window.__camCtl = camCtl;
window.__strokeEngine = strokeEngine;
window.__scene = scene;
window.__store = { getState, setState };

function beforeRender() {
  planeGuide.update(camCtl.state.target);
  gizmo.draw();
}
(function loop() {
  renderIfNeeded(beforeRender);
  requestAnimationFrame(loop);
})();
