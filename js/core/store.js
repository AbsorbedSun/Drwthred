// ============================================================================
// STORE — única fuente de verdad. Todo pasa por getState/setState/
// subscribe: quien necesita reaccionar a un cambio se suscribe
// explícitamente — la dependencia queda escrita en el código.
//
// Optimización: subscribe(fn, selector) solo llama a `fn` cuando cambia
// la PORCIÓN del estado que devuelve el selector (comparación superficial,
// elemento por elemento si devuelve un array). Antes, mover el slider de
// grosor reconstruía el DOM del panel de capas, el de vistas, recorría la
// escena para la visibilidad de capas... decenas de veces por segundo.
// setState además ignora parches que no cambian nada.
// ============================================================================

let state = {
  activeTool: 'brush',
  activeVariant: 'pencil',
  brushColor: '#ffffff',
  brushWidth: 0.012,
  layers: [{ id: 'layer-1', name: 'Capa 1', visible: true }],
  activeLayerId: 'layer-1',
  savedViews: [],
  selectedId: null,

  // Última variante usada de cada herramienta — tocar una herramienta en
  // la barra la reactiva con la variante que tenía, sin abrir submenú.
  toolVariants: { brush: 'pencil', eraser: 'erase-full', shapes: 'cube', select: 'select-single', plane: 'plane-move' },

  // Plano de dibujo activo (estilo Feather). mode:
  //   'view'   → plano libre, siempre de frente a la cámara
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
  let changed = false;
  for (const k in patch) {
    if (state[k] !== patch[k]) { changed = true; break; }
  }
  if (!changed) return;
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

function sameSlice(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * @param {Function} fn        - recibe el estado completo
 * @param {Function} [selector] - (state) => valor o array de valores; si se
 *   pasa, `fn` solo corre cuando ese valor cambia.
 * @returns {Function} función para des-suscribirse
 */
export function subscribe(fn, selector) {
  let listener = fn;
  if (selector) {
    let last = selector(state);
    listener = (s) => {
      const next = selector(s);
      if (sameSlice(last, next)) return;
      last = next;
      fn(s);
    };
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}
