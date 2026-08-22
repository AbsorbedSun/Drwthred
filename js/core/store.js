// ============================================================================
// STORE — única fuente de verdad. Reemplaza el patrón `window._algo` del
// proyecto anterior: en vez de que cada módulo cuelgue funciones del
// objeto global para que otros las llamen sin que quede registrado en
// ningún lado quién depende de quién, todo pasa por getState/setState/
// subscribe. Quien necesita reaccionar a un cambio se suscribe
// explícitamente — la dependencia queda escrita en el código.
// ============================================================================

let state = {
  activeTool: 'brush',
  activeVariant: 'pencil',
  brushColor: '#ffffff',
  brushWidth: 0.03,
  layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }],
  activeLayerId: 'layer-1',
  savedViews: [],
  selectedId: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

/** @returns {Function} función para des-suscribirse */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
