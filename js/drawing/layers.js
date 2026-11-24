// ============================================================================
// LAYERS — capas: crear, renombrar, eliminar, reordenar, duplicar, ocultar,
// bloquear y opacidad. Todo deshacible.
//
// Dos partes, a propósito:
//
// 1. Acciones — tocan el store (y la escena solo cuando la capa arrastra
//    objetos: eliminar/duplicar). El panel de capas las llama directo.
//
// 2. syncLayers(scene) — se suscribe al store y aplica a cada objeto lo que
//    dice su capa (userData.layerId): visibilidad, opacidad y orden de
//    dibujo (las capas de más arriba se dibujan encima). Los objetos nuevos
//    reciben lo suyo con refresh() (app.js lo llama al cambiar el historial).
//
// Capa bloqueada: sus objetos no se pueden seleccionar, borrar ni mover
// (selection.js y eraser.js preguntan isLockedObject), y no se dibuja en ella.
// ============================================================================
import { getState, setState, subscribe } from '../core/store.js';
import { pushAction } from '../core/history.js';

let counter = 1; // "Capa 1" ya viene por defecto en el store

export const LAYER_DEFAULTS = { visible: true, locked: false, opacity: 1 };

/** Completa campos faltantes (proyectos viejos no traen locked/opacity). */
export function normalizeLayer(l) {
  return { ...LAYER_DEFAULTS, ...l };
}

function newLayerId() {
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function layerById(id) {
  return getState().layers.find((l) => l.id === id) || null;
}

/** Cambia la lista de capas (y opcionalmente la activa) con un solo paso de deshacer. */
function commitLayers(nextLayers, nextActive = getState().activeLayerId, extra = null) {
  const prevLayers = getState().layers;
  const prevActive = getState().activeLayerId;
  setState({ layers: nextLayers, activeLayerId: nextActive });
  if (extra && extra.redo) extra.redo();
  pushAction({
    undo: () => { if (extra && extra.undo) extra.undo(); setState({ layers: prevLayers, activeLayerId: prevActive }); },
    redo: () => { setState({ layers: nextLayers, activeLayerId: nextActive }); if (extra && extra.redo) extra.redo(); },
  });
}

function updateLayer(id, patch) {
  return getState().layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
}

export function addLayer(name) {
  counter++;
  const id = newLayerId();
  const layer = normalizeLayer({ id, name: name || `Capa ${counter}` });
  commitLayers([...getState().layers, layer], id);
  return id;
}

export function setActiveLayer(id) {
  setState({ activeLayerId: id });
}

export function toggleLayerVisibility(id) {
  const l = layerById(id);
  if (l) commitLayers(updateLayer(id, { visible: !l.visible }));
}

export function toggleLayerLock(id) {
  const l = layerById(id);
  if (!l) return;
  // (lo seleccionado de una capa que se bloquea se deselecciona en app.js,
  // que tiene la escena)
  commitLayers(updateLayer(id, { locked: !l.locked }));
}

export function renameLayer(id, name) {
  const clean = String(name || '').trim().slice(0, 60);
  const l = layerById(id);
  if (!l || !clean || clean === l.name) return false;
  commitLayers(updateLayer(id, { name: clean }));
  return true;
}

/**
 * Opacidad de la capa (0..1). Mientras se arrastra el slider, `record:false`
 * aplica en vivo sin llenar el historial; al soltar, una llamada con
 * `record:true` y `from` (el valor al empezar) deja UN paso de deshacer.
 */
export function setLayerOpacity(id, opacity, { record = true, from = null } = {}) {
  const v = Math.max(0, Math.min(1, +opacity));
  const l = layerById(id);
  if (!l) return;
  if (!record) { setState({ layers: updateLayer(id, { opacity: v }) }); return; }
  const start = from != null ? from : l.opacity;
  if (start === v) { setState({ layers: updateLayer(id, { opacity: v }) }); return; }
  // Registrar desde el valor de partida, aunque el estado ya tenga el final
  setState({ layers: updateLayer(id, { opacity: start }) });
  commitLayers(updateLayer(id, { opacity: v }));
}

/** Mueve la capa a la posición `toIndex` de la lista (0 = la de más abajo). */
export function moveLayer(id, toIndex) {
  const layers = getState().layers.slice();
  const from = layers.findIndex((l) => l.id === id);
  const to = Math.max(0, Math.min(layers.length - 1, toIndex));
  if (from < 0 || from === to) return false;
  const [l] = layers.splice(from, 1);
  layers.splice(to, 0, l);
  commitLayers(layers);
  return true;
}

export function layerObjects(scene, id) {
  return scene.children.filter((o) => o.userData && o.userData.layerId === id &&
    (o.userData.strokePoints || o.userData.primitiveKind || o.userData.reference));
}

/** Elimina la capa y su contenido. No se puede eliminar la última. */
export function deleteLayer(scene, id) {
  const layers = getState().layers;
  if (layers.length <= 1) return false;
  const idx = layers.findIndex((l) => l.id === id);
  if (idx < 0) return false;
  const objs = layerObjects(scene, id);
  const next = layers.filter((l) => l.id !== id);
  const active = getState().activeLayerId === id ? next[Math.max(0, idx - 1)].id : getState().activeLayerId;
  const prevSel = getState().selectedIds;
  commitLayers(next, active, {
    redo: () => { objs.forEach((o) => scene.remove(o)); setState({ selectedIds: [] }); },
    undo: () => { objs.forEach((o) => scene.add(o)); setState({ selectedIds: prevSel }); },
  });
  return true;
}

/** Duplica la capa con todo su contenido (copias independientes) justo encima. */
export function duplicateLayer(scene, id) {
  const layers = getState().layers;
  const idx = layers.findIndex((l) => l.id === id);
  if (idx < 0) return null;
  const src = layers[idx];
  const nid = newLayerId();
  const copy = normalizeLayer({ ...src, id: nid, name: `${src.name} (copia)`, locked: false });
  const objs = layerObjects(scene, id).map((o) => {
    const c = o.clone();
    if (o.material) c.material = o.material.clone();
    c.userData.layerId = nid;
    return c;
  });
  const next = layers.slice();
  next.splice(idx + 1, 0, copy);
  commitLayers(next, nid, {
    redo: () => objs.forEach((o) => scene.add(o)),
    undo: () => objs.forEach((o) => scene.remove(o)),
  });
  return nid;
}

export function isLayerLocked(layerId, state = getState()) {
  const l = state.layers.find((x) => x.id === layerId);
  return !!(l && l.locked);
}
export function isLockedObject(obj, state = getState()) {
  return !!(obj && obj.userData && obj.userData.layerId != null && isLayerLocked(obj.userData.layerId, state));
}

// ── Sincronización escena ← capas ──

/**
 * Aplica opacidad de capa a un material, recordando su configuración
 * original (los pinceles translúcidos ya traen la suya: se multiplican).
 */
function applyOpacity(mat, layerOpacity) {
  if (!mat) return;
  const ud = mat.userData;
  if (!ud.base) ud.base = { opacity: mat.opacity, transparent: mat.transparent, depthWrite: mat.depthWrite };
  const fade = layerOpacity < 0.999;
  const transparent = ud.base.transparent || fade;
  if (mat.transparent !== transparent) mat.needsUpdate = true;
  mat.transparent = transparent;
  ud.layerOpacity = layerOpacity;
  mat.opacity = ud.base.opacity * layerOpacity;
  mat.depthWrite = fade ? false : ud.base.depthWrite;
}

export function syncLayers(scene) {
  function apply() {
    const layers = getState().layers;
    const info = new Map(layers.map((l, i) => [l.id, { ...normalizeLayer(l), index: i }]));
    scene.children.forEach((obj) => {
      const lid = obj.userData && obj.userData.layerId;
      if (lid == null) return;
      const l = info.get(lid);
      obj.visible = !l || l.visible !== false;
      if (!l) return;
      // Capas de más arriba, encima; las imágenes de referencia, siempre debajo del dibujo
      obj.renderOrder = obj.userData.reference ? l.index - 1000 : l.index;
      applyOpacity(obj.material, l.opacity);
    });
  }
  subscribe(apply, (s) => s.layers);
  apply();
  return { refresh: apply };
}

/** Nombre viejo (lo usan tests y código previo). */
export const syncLayerVisibility = syncLayers;
