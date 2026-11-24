// ============================================================================
// HISTORY — pila de deshacer/rehacer. A propósito no sabe qué es un trazo
// ni qué es una capa: cualquier acción reversible se registra acá como un
// par {undo, redo} de funciones — la acción misma decide CÓMO deshacerse
// (sacar un mesh de la escena, revertir un cambio en el store, lo que
// sea). Este módulo solo lleva la cuenta de en qué orden pasaron.
//
// Mismo patrón de suscripción que core/store.js, a propósito — un botón
// de "deshacer" se suscribe para saber cuándo habilitarse/deshabilitarse,
// igual que cualquier otro consumidor reactivo del store.
// ============================================================================
// Tope de pasos: cada acción retiene meshes (geometría en memoria) — sin
// límite, una sesión larga en tablet crecía sin freno.
export const MAX_HISTORY = 300;

const undoStack = [];
const redoStack = [];
const listeners = new Set();

function notify() {
  const info = { canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 };
  listeners.forEach((fn) => fn(info));
}

/** Registra una acción ya ejecutada — llamar DESPUÉS de hacerla, no antes. */
export function pushAction({ undo, redo }) {
  undoStack.push({ undo, redo });
  if (undoStack.length > MAX_HISTORY) undoStack.shift();
  redoStack.length = 0; // una acción nueva invalida cualquier "rehacer" pendiente
  notify();
}

export function undo() {
  const action = undoStack.pop();
  if (!action) return false;
  action.undo();
  redoStack.push(action);
  notify();
  return true;
}

export function redo() {
  const action = redoStack.pop();
  if (!action) return false;
  action.redo();
  undoStack.push(action);
  notify();
  return true;
}

export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

export function subscribeHistory(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Vacía la pila — al cargar un proyecto, deshacer no debe mezclarse con lo anterior. */
export function clearHistory() {
  undoStack.length = 0;
  redoStack.length = 0;
  notify();
}
export const _clearHistory = clearHistory; // nombre viejo, lo usan los tests
