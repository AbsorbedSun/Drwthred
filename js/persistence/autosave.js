// ============================================================================
// AUTOSAVE — el dibujo se guarda solo en el almacenamiento del navegador
// (IndexedDB) y se recupera al volver a abrir la app. Antes, recargar la
// página, cerrar la pestaña o que el iPad suspendiera Safari en segundo
// plano borraba todo lo que no se hubiera descargado a mano.
//
// Cuándo guarda:
//  · 2 s después del último cambio (agrupa ráfagas: no guarda en cada trazo)
//  · YA, al ocultarse la pestaña (cambiar de app, bloquear la tablet): es
//    el último momento seguro — después Safari puede matar la página sin aviso
//  · al cerrar/recargar
//
// El almacenamiento es inyectable: IndexedDB en el navegador, un Map en
// los tests (Node no tiene IndexedDB).
// ============================================================================
import { serializeProject, loadProject } from './save-load.js';

const DB_NAME = 'drwthred';
const STORE = 'projects';
const KEY = 'autosave';

/** Almacenamiento en IndexedDB. Guarda el objeto tal cual (clonado estructurado, sin JSON). */
export function idbStorage() {
  let dbp = null;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const req = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    }));
  }
  return {
    get: (k) => tx('readonly', (s) => s.get(k)),
    set: (k, v) => tx('readwrite', (s) => s.put(v, k)),
    remove: (k) => tx('readwrite', (s) => s.delete(k)),
  };
}

/** Almacenamiento en memoria (tests, o navegadores sin IndexedDB). */
export function memoryStorage() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? structuredClone(m.get(k)) : undefined),
    set: async (k, v) => { m.set(k, structuredClone(v)); },
    remove: async (k) => { m.delete(k); },
  };
}

export function hasContent(data) {
  return !!data && ((data.strokes && data.strokes.length) || (data.primitives && data.primitives.length) ||
    (data.references && data.references.length));
}

/**
 * @param {Object} cfg
 * @param {THREE.Scene} cfg.scene
 * @param {Object} cfg.strokeEngine
 * @param {Object} [cfg.storage] - { get, set, remove } (por defecto IndexedDB)
 * @param {number} [cfg.delay=2000]
 * @param {Function} [cfg.onStatus] - ('saved'|'error', info)
 * @param {Object} [cfg.loadOpts] - opciones para loadProject
 * @param {Function} [cfg.serialize] / [cfg.load] - para inyectar (referencias, tests)
 */
export function createAutosave({
  scene, strokeEngine, storage = null, delay = 2000, onStatus = null, loadOpts,
  serialize = serializeProject, load = loadProject,
} = {}) {
  let store = storage;
  if (!store) {
    try { store = typeof indexedDB !== 'undefined' ? idbStorage() : memoryStorage(); } catch (e) { store = memoryStorage(); }
  }
  let timer = null;
  let dirty = false;
  let failed = false;
  let pending = Promise.resolve();
  let paused = false;

  async function saveNow() {
    clearTimeout(timer);
    timer = null;
    if (!dirty || paused) return pending;
    dirty = false;
    let data;
    try {
      data = serialize(scene);
      data.savedAt = Date.now();
    } catch (e) {
      if (onStatus) onStatus('error', e);
      return pending;
    }
    // Las escrituras se encadenan: nunca dos a la vez, y la última gana
    pending = pending.then(() => store.set(KEY, data)).then(() => {
      if (failed && onStatus) onStatus('recovered');
      failed = false;
      if (onStatus) onStatus('saved', data);
    }).catch((e) => {
      dirty = true; // reintentar en el próximo cambio
      if (!failed && onStatus) onStatus('error', e); // avisar una sola vez, no en cada intento
      failed = true;
    });
    return pending;
  }

  function schedule() {
    if (paused) return;
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(saveNow, delay);
  }

  /** Carga el último autoguardado. @returns {Promise<Object|null>} los datos, si había algo */
  async function restore() {
    let data;
    try { data = await store.get(KEY); } catch (e) { if (onStatus) onStatus('error', e); return null; }
    if (!hasContent(data)) return null;
    paused = true; // cargar dispara cambios: no tienen que reprogramar un guardado
    try { load(scene, strokeEngine, data, loadOpts); } finally { paused = false; dirty = false; }
    return data;
  }

  async function clear() {
    clearTimeout(timer);
    dirty = false;
    try { await store.remove(KEY); } catch (e) { /* nada que hacer */ }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
    window.addEventListener('pagehide', () => saveNow());
  }

  return {
    schedule, saveNow, restore, clear,
    get dirty() { return dirty; },
    get failed() { return failed; },
    pause() { paused = true; clearTimeout(timer); },
    resume() { paused = false; },
  };
}

/** "hace 3 min", "hace 2 h", "ayer"… para el aviso de recuperación. */
export function timeAgo(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
