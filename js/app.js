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
import * as THREE from './vendor/three.module.js';
import { createScene } from './core/scene.js';
import { createCameraController } from './core/camera-controller.js';
import { getState, setState, subscribe } from './core/store.js';
import { undo, redo, canUndo, canRedo, subscribeHistory } from './core/history.js';
import { attachGestures } from './input/gestures.js';
import { createToolRouter } from './input/tool-router.js';
import { createStrokeEngine } from './drawing/stroke-engine.js';
import { syncLayers } from './drawing/layers.js';
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
import { confirmDialog } from './ui/dialog.js';
import { downloadProject, pickAndLoadProject, newProject } from './persistence/save-load.js';
import { createAutosave, timeAgo } from './persistence/autosave.js';
import { loadImageFile, addReference, referenceMeshes, setReferenceReadyHandler } from './drawing/references.js';
import { export3D, exportPNG } from './persistence/export.js';
import { openExportDialog } from './ui/export-dialog.js';

// ── Escena ──
const canvas = document.getElementById('scene-canvas');
const { scene, camera, renderer, render, renderIfNeeded, invalidate } = createScene(canvas);
const camCtl = createCameraController(camera);
const strokeEngine = createStrokeEngine(scene, camera);
const mirrorEngine = createStrokeEngine(scene, camera); // trazo espejado en vivo
const planeGuide = createPlaneGuide(scene);

const layerSync = syncLayers(scene);
syncSelectionHighlight(scene);
const transform = createTransformController({ scene, camera });

// ── Entrada ──
// Contorno del lazo: una capa SVG encima del lienzo (el router solo
// informa los puntos en NDC; acá se dibujan en píxeles)
const lassoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
lassoSvg.classList.add('lasso-overlay');
lassoSvg.innerHTML = '<polyline points=""/><circle class="snap-ring" r="14" cx="-99" cy="-99"/>';
document.body.appendChild(lassoSvg);
function drawLasso(path) {
  const line = lassoSvg.firstChild;
  if (!path) { line.setAttribute('points', ''); return; }
  const w = canvas.clientWidth, h = canvas.clientHeight;
  line.setAttribute('points', path.map((p) => `${((p.x + 1) / 2) * w},${((1 - p.y) / 2) * h}`).join(' '));
}

// Imán: un anillo breve donde se pegó la punta del trazo
let snapTimer = null;
function flashSnap(ndc) {
  const ring = lassoSvg.querySelector('.snap-ring');
  ring.setAttribute('cx', ((ndc.x + 1) / 2) * canvas.clientWidth);
  ring.setAttribute('cy', ((1 - ndc.y) / 2) * canvas.clientHeight);
  ring.classList.remove('show');
  void ring.getBoundingClientRect(); // reiniciar la animación
  ring.classList.add('show');
  clearTimeout(snapTimer);
  snapTimer = setTimeout(() => ring.classList.remove('show'), 500);
}

const toolRouter = createToolRouter({
  scene, camera, camCtl, strokeEngine, mirrorEngine, transform,
  onNotice: (msg) => toast(msg),
  onLasso: drawLasso,
  onSnap: flashSnap,
  onChange: invalidate,
  viewport: () => ({ w: canvas.clientWidth, h: canvas.clientHeight }),
});

function doUndo() { if (undo()) toast('Deshecho'); else toast('Nada para deshacer'); }
function doRedo() { if (redo()) toast('Rehecho'); else toast('Nada para rehacer'); }

// ── Hover del lápiz: círculo del tamaño real del pincel donde caería el trazo ──
const hoverDot = document.createElement('div');
hoverDot.className = 'hover-dot';
document.body.appendChild(hoverDot);
let hoverRaf = 0;
function showHover(ndc) {
  cancelAnimationFrame(hoverRaf);
  if (!ndc) { hoverDot.classList.remove('show'); return; }
  hoverRaf = requestAnimationFrame(() => {
    const info = toolRouter.hoverInfo(ndc.x, ndc.y);
    if (!info) { hoverDot.classList.remove('show'); return; }
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const a = info.point.clone().project(camera);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(getState().brushWidth);
    const b = info.point.clone().add(right).project(camera);
    const px = Math.max(6, Math.min(120, Math.hypot((b.x - a.x) * w / 2, (b.y - a.y) * h / 2)));
    hoverDot.style.width = hoverDot.style.height = `${px}px`;
    hoverDot.style.transform = `translate(${((a.x + 1) / 2) * w - px / 2}px, ${((1 - a.y) / 2) * h - px / 2}px)`;
    hoverDot.style.setProperty('--dot', getState().brushColor);
    hoverDot.classList.toggle('snapped', info.snapped);
    hoverDot.classList.add('show');
  });
}

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
  onHover: showHover,
});

// ── HUD: fila superior izquierda ──
// ── Autoguardado ──
let lastSavedAt = null;
const autosave = createAutosave({
  scene, strokeEngine,
  onStatus: (status, info) => {
    if (status === 'saved') lastSavedAt = info.savedAt;
    else if (status === 'error') toast('No se puede guardar automáticamente en este navegador — descargá el proyecto a mano', 4500);
    else if (status === 'recovered') toast('El guardado automático volvió a funcionar');
  },
});
// Cualquier cambio del dibujo (todo pasa por el historial) o de capas,
// vistas y plano programa un guardado
subscribeHistory(() => autosave.schedule());
subscribe(() => autosave.schedule(), (s) => [s.layers, s.activeLayerId, s.savedViews, s.drawPlane, s.mirror]);

async function startNewProject() {
  const ok = await confirmDialog('¿Empezar un dibujo nuevo?', 'Se borra el dibujo actual. Si lo querés conservar, descargalo antes desde Archivo.', { ok: 'Dibujo nuevo', danger: true });
  if (!ok) return;
  newProject(scene);
  await autosave.clear();
  camCtl.reset();
  toast('Dibujo nuevo');
}

setReferenceReadyHandler(invalidate); // la imagen termina de cargar después: redibujar

async function startExport() {
  const sel = getState().selectedIds;
  const opts = await openExportDialog({
    hasSelection: sel.length > 0,
    hasReferences: referenceMeshes(scene).length > 0,
    hasHidden: getState().layers.some((l) => l.visible === false),
  });
  if (!opts) return;
  try {
    if (opts.format === 'png') {
      // Sin ayudas visuales; las referencias, solo si se pidió; sin el resaltado de selección
      const hide = [planeGuide.group, planeGuide.mirrorGroup, scene.getObjectByName('floor-grid'),
        ...(opts.includeReferences ? [] : referenceMeshes(scene))].filter(Boolean);
      const prevSel = getState().selectedIds;
      setSelection([]);
      const r = await exportPNG(renderer, scene, camera, { scale: opts.scale, transparent: opts.transparent, hide });
      setState({ selectedIds: prevSel });
      toast(`Imagen exportada (${r.width}×${r.height})`);
    } else {
      toast('Preparando el archivo 3D…');
      const r = await export3D(scene, opts.format, {
        selection: opts.onlySelection ? getState().selectedIds : null,
        includeHidden: opts.includeHidden,
      });
      const kb = Math.max(1, Math.round(r.bytes / 1024));
      toast(`${opts.format.toUpperCase()} exportado: ${r.count} ${r.count === 1 ? 'objeto' : 'objetos'}, ${kb} KB` +
        (opts.format === 'obj' ? ' (OBJ no guarda colores)' : ''));
    }
  } catch (err) {
    toast(err && err.message === 'No hay nada para exportar' ? 'No hay nada para exportar' : 'No se pudo exportar');
  }
}

function pickReferenceImage() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*'; // en iPad ofrece Fotos, Cámara y Archivos
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    try {
      const image = await loadImageFile(file);
      const st = getState();
      const mesh = addReference(scene, image, {
        spec: st.drawPlane, camera, target: camCtl.state.target, layerId: st.activeLayerId,
        size: Math.max(0.5, camCtl.state.radius * 0.45),
      });
      setSelection([mesh.uuid]);
      toast('Imagen agregada: movela con Selección; la opacidad, en la barra de arriba');
    } catch (err) {
      toast('No se pudo abrir la imagen');
    }
  });
  input.click();
}
createFilePanel({
  id: 'file-panel', slot: 'corner-top-left', order: 0,
  footer: () => (lastSavedAt ? `Guardado automático ${timeAgo(lastSavedAt)}` : 'Guardado automático activado'),
  actions: [
    { id: 'new', icon: 'plus', label: 'Dibujo nuevo', run: startNewProject },
    { id: 'save', icon: 'save', label: 'Descargar proyecto', separatorBefore: true, run: () => { downloadProject(scene); toast('Proyecto descargado'); } },
    { id: 'load', icon: 'load', label: 'Abrir proyecto', run: () => pickAndLoadProject(scene, strokeEngine, (err) => {
      toast(err ? 'No se pudo abrir el archivo' : 'Proyecto abierto');
      if (!err) autosave.schedule();
    }) },
    { id: 'reference', icon: 'image', label: 'Agregar imagen de referencia', separatorBefore: true, run: pickReferenceImage },
    { id: 'export', icon: 'save', label: 'Exportar… (imagen o 3D)', separatorBefore: true, run: startExport },
  ],
});
createLayersPanel({ id: 'layers-panel', slot: 'corner-top-left', order: 1, scene, onToast: toast });
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
// Lo que entra a la escena (trazo nuevo, deshacer) recibe opacidad/orden de su capa
subscribeHistory(() => layerSync.refresh());
// Al bloquear/ocultar una capa, su contenido deja de estar seleccionado
subscribe(() => {
  const ids = getState().selectedIds;
  if (!ids.length) return;
  const still = selectedObjects(scene).filter((o) => o.visible).map((o) => o.uuid);
  if (still.length !== ids.length) setSelection(still);
}, (s) => s.layers);

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
window.__autosave = autosave;
window.__camera = camera;
window.__renderer = renderer;

function beforeRender() {
  planeGuide.update(camCtl.state.target);
  gizmo.draw();
}
// Recuperar el último dibujo (si lo hay) antes de mostrar nada
autosave.restore().then((data) => {
  if (data) toast(`Se recuperó tu dibujo (${timeAgo(data.savedAt)})`, 3500);
});

// App instalable / offline: solo con HTTPS (o localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

(function loop() {
  renderIfNeeded(beforeRender);
  requestAnimationFrame(loop);
})();
