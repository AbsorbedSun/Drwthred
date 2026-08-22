// ============================================================================
// SAVE / LOAD / EXPORT
//
// serializeProject lee los trazos directo de `scene.children` — NO de
// `strokeEngine.finished` — a propósito: un trazo deshecho sigue viviendo
// en `finished` (nadie lo saca de ahí) pero ya no está en la escena. Leer
// de la escena real es lo único que garantiza guardar exactamente lo que
// se ve ahora, respetando cualquier deshacer/rehacer que haya pasado.
//
// loadProject recibe el objeto YA PARSEADO (no un archivo ni un string) a
// propósito — separar "parsear JSON" de "reconstruir la escena" es lo que
// permite probar la reconstrucción con Node, sin simular un File real.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState } from '../core/store.js';

const FORMAT_VERSION = 1;

export function serializeProject(scene) {
  const strokes = scene.children
    .filter((obj) => obj.userData && obj.userData.strokePoints)
    .map((obj) => ({
      layerId: obj.userData.layerId,
      color: obj.userData.strokeColor,
      width: obj.userData.strokeWidth,
      points: obj.userData.strokePoints,
    }));

  const { layers, activeLayerId, savedViews } = getState();
  return { version: FORMAT_VERSION, layers, activeLayerId, savedViews, strokes };
}

/**
 * Reconstruye la escena a partir de un proyecto ya parseado. Borra los
 * trazos existentes primero (no la grilla ni las luces — esas no tienen
 * `userData.strokePoints`, así que el filtro las deja intactas).
 */
export function loadProject(scene, strokeEngine, data) {
  if (!data || data.version !== FORMAT_VERSION) {
    throw new Error(`Formato de proyecto no reconocido (versión ${data && data.version})`);
  }

  const toRemove = scene.children.filter((obj) => obj.userData && obj.userData.strokePoints);
  toRemove.forEach((obj) => scene.remove(obj));

  setState({
    layers: data.layers,
    activeLayerId: data.activeLayerId,
    savedViews: data.savedViews || [],
  });

  data.strokes.forEach((s) => {
    if (!s.points || s.points.length < 2) return;
    const pts = s.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    strokeEngine.startStroke(pts[0], { color: s.color, width: s.width, meta: { layerId: s.layerId } });
    for (let i = 1; i < pts.length; i++) strokeEngine.addPoint(pts[i]);
    strokeEngine.endStroke();
  });
}

/** Dispara la descarga del proyecto como archivo .json. */
export function downloadProject(scene, filename = 'proyecto.json') {
  const data = serializeProject(scene);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Abre el selector de archivos del sistema y carga el .json elegido. */
export function pickAndLoadProject(scene, strokeEngine, onDone) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        loadProject(scene, strokeEngine, data);
        if (onDone) onDone(null);
      } catch (err) {
        if (onDone) onDone(err);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/** Exporta una imagen PNG del lienzo tal como se ve ahora mismo. */
export function exportImage(renderer, filename = 'dibujo.png') {
  renderer.domElement.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, 'image/png');
}
