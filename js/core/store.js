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

  // Última variante usada de cada herramienta — tocar una herramienta en
  // la barra la reactiva con la variante que tenía, sin abrir submenú.
  toolVariants: { brush: 'pencil', eraser: 'erase-full', shapes: 'cube', select: 'select-single', plane: 'plane-move' },

  // Plano de dibujo activo (estilo Feather). mode:
  //   'view'   → plano libre, siempre de frente a la cámara (comportamiento original)
  //   'front' | 'side' | 'ground' → planos fijos alineados a los ejes del mundo
  //   'custom' → plano fijo con cualquier normal (capturado desde la vista)
  // Ecuación del plano fijo: normal · p = offset
  drawPlane: { mode: 'view', normal: [0, 0, 1], offset: 0 },
  mirror: false,             // simetría respecto al plano X = 0

  // Entrada: 'auto' (si aparece un lápiz, el lápiz dibuja y el dedo
  // navega), 'pen' (forzar ese modo) o 'touch' (el dedo dibuja).
  inputMode: 'auto',
  penDetected: false,
  pressure: true,            // el lápiz modula el grosor con la presión
  smoothing: 0.35,           // 0 = sin suavizado, ~0.7 = muy suave
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
