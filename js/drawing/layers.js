// ============================================================================
// LAYERS
//
// Dos partes con responsabilidades distintas, a propósito:
//
// 1. Acciones (addLayer / setActiveLayer / toggleLayerVisibility) — solo
//    tocan el store. No necesitan la escena de Three.js para nada. Por
//    eso el panel de capas (ui/panels/layers-panel.js) las puede importar
//    directo, sin que nadie tenga que pasarle una instancia de "gestor de
//    capas" entre archivos — coordinan a través del store, que es
//    exactamente para lo que existe.
//
// 2. syncLayerVisibility(scene) — la única parte que sí necesita la
//    escena. Se suscribe al store una sola vez y aplica la visibilidad
//    resultante a los objetos de la escena, leyendo `mesh.userData.layerId`
//    (que cada trazo terminado trae puesto — ver scene-demo.js). No sabe
//    nada de stroke-engine.js, solo de esa convención de userData.
// ============================================================================
import { getState, setState, subscribe } from '../core/store.js';
import { pushAction } from '../core/history.js';

let counter = 1; // "Capa 1" ya viene por defecto en el store

export function addLayer(name) {
  counter++;
  const id = `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const layer = { id, name: name || `Capa ${counter}`, visible: true };
  const prevLayers = getState().layers;
  const prevActiveId = getState().activeLayerId;
  const nextLayers = [...prevLayers, layer];

  setState({ layers: nextLayers, activeLayerId: id });
  pushAction({
    undo: () => setState({ layers: prevLayers, activeLayerId: prevActiveId }),
    redo: () => setState({ layers: nextLayers, activeLayerId: id }),
  });
  return id;
}

export function setActiveLayer(id) {
  setState({ activeLayerId: id });
}

export function toggleLayerVisibility(id) {
  const prevLayers = getState().layers;
  const nextLayers = prevLayers.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));

  setState({ layers: nextLayers });
  pushAction({
    undo: () => setState({ layers: prevLayers }),
    redo: () => setState({ layers: nextLayers }),
  });
}

export function syncLayerVisibility(scene) {
  function apply() {
    const visMap = new Map(getState().layers.map((l) => [l.id, l.visible]));
    scene.children.forEach((obj) => {
      const lid = obj.userData && obj.userData.layerId;
      if (lid != null) obj.visible = visMap.get(lid) !== false;
    });
  }
  subscribe(apply);
  apply();
}
