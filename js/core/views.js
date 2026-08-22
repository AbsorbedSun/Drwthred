// ============================================================================
// VIEWS — guardar/aplicar/borrar marcadores de cámara. A diferencia de
// layers.js, estas funciones SÍ necesitan una referencia directa al
// controlador de cámara (camCtl) — la posición "en vivo" de la cámara no
// vive en el store (cambia en cada frame de un gesto, meterla ahí sería
// forzar el store a un rol para el que no está pensado). Lo que SÍ vive
// en el store es la LISTA de vistas guardadas — datos, no estado en vivo.
// ============================================================================
import { getState, setState } from './store.js';
import { pushAction } from './history.js';

let counter = 0;

export function saveView(camCtl, name) {
  counter++;
  const { theta, phi, radius, target } = camCtl.state;
  const view = {
    id: `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name || `Vista ${counter}`,
    theta, phi, radius,
    target: [target.x, target.y, target.z],
  };
  const prevViews = getState().savedViews;
  const nextViews = [...prevViews, view];

  setState({ savedViews: nextViews });
  pushAction({
    undo: () => setState({ savedViews: prevViews }),
    redo: () => setState({ savedViews: nextViews }),
  });
  return view.id;
}

export function deleteView(id) {
  const prevViews = getState().savedViews;
  const nextViews = prevViews.filter((v) => v.id !== id);

  setState({ savedViews: nextViews });
  pushAction({
    undo: () => setState({ savedViews: prevViews }),
    redo: () => setState({ savedViews: nextViews }),
  });
}

/**
 * Salta la cámara a una vista guardada. No entra al historial de
 * deshacer/rehacer — "mirar para otro lado" no es una edición de
 * contenido, misma convención que setActiveLayer en layers.js.
 */
export function applyView(camCtl, id) {
  const view = getState().savedViews.find((v) => v.id === id);
  if (!view) return false;
  camCtl.state.theta = view.theta;
  camCtl.state.phi = view.phi;
  camCtl.state.radius = view.radius;
  camCtl.state.target.set(view.target[0], view.target[1], view.target[2]);
  camCtl.update();
  return true;
}
