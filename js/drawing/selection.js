// ============================================================================
// SELECTION — tocar un trazo o figura lo selecciona (resaltado de color);
// tocar el vacío deselecciona. El id seleccionado vive en el store — el
// resaltado se aplica solo, reactivo (mismo patrón que layers.js): se
// suscribe una vez acá, nadie más tiene que acordarse de aplicar nada.
//
// Deliberadamente NO mueve el objeto seleccionado en esta pasada — eso
// queda anotado como posible mejora, no lo escondo. Por ahora selección
// es "ver qué está tocado", no "agarrar y arrastrar".
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState, subscribe } from '../core/store.js';

const raycaster = new THREE.Raycaster();
const HIGHLIGHT_COLOR = 0x4fd1c5;
const originalColors = new Map(); // mesh -> color hex original, para restaurar al deseleccionar

function selectableMeshes(scene) {
  return scene.children.filter((o) => o.userData && (o.userData.strokePoints || o.userData.primitiveKind));
}

/** Hit-test puro, sin efectos secundarios — no toca el store. Separado
 * de selectAt() a propósito: el enrutador de herramientas necesita saber
 * QUÉ se tocó sin decidir todavía si eso implica cambiar la selección
 * (podría ser el primer dedo de un gesto de 2 dedos, ver tool-router.js). */
export function hitTestAt(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(selectableMeshes(scene), false);
  return hits.length ? hits[0].object.uuid : null;
}

export function selectAt(scene, camera, ndcX, ndcY) {
  const id = hitTestAt(scene, camera, ndcX, ndcY);
  setState({ selectedId: id });
  return id;
}

export function clearSelection() {
  setState({ selectedId: null });
}

export function syncSelectionHighlight(scene) {
  function apply() {
    const { selectedId } = getState();
    selectableMeshes(scene).forEach((obj) => {
      if (!obj.material || !obj.material.color) return;
      const isSelected = obj.uuid === selectedId;
      if (isSelected) {
        if (!originalColors.has(obj)) originalColors.set(obj, obj.material.color.getHex());
        obj.material.color.setHex(HIGHLIGHT_COLOR);
      } else if (originalColors.has(obj)) {
        obj.material.color.setHex(originalColors.get(obj));
        originalColors.delete(obj);
      }
    });
  }
  subscribe(apply);
  apply();
}
