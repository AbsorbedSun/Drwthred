// ============================================================================
// SAVE / LOAD / EXPORT
//
// serializeProject lee directo de `scene.children` — lo único que garantiza
// guardar exactamente lo que se ve, respetando cualquier deshacer/rehacer.
//
// Formato v2 (lee también v1):
//  · Cada trazo guarda su transformación (posición/rotación/escala). En v1
//    un trazo movido, escalado o rotado volvía a su lugar original al
//    cargar — se perdía el trabajo hecho con Selección.
//  · Las figuras (cubo, esfera...) ahora se guardan. En v1 desaparecían.
//  · Cargar vacía el historial: "deshacer" justo después de abrir un
//    archivo no puede mezclar acciones del proyecto anterior.
//
// loadProject recibe el objeto YA PARSEADO — separar "parsear JSON" de
// "reconstruir la escena" permite probarlo con Node, sin simular un File.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState } from '../core/store.js';
import { clearHistory } from '../core/history.js';
import { placePrimitive } from '../drawing/primitives.js';

const FORMAT_VERSION = 2;
const SUPPORTED = [1, 2];

const round = (v) => +v.toFixed(6);

function transformOf(obj) {
  return {
    position: obj.position.toArray().map(round),
    quaternion: obj.quaternion.toArray().map(round),
    scale: obj.scale.toArray().map(round),
  };
}
function applyTransform(obj, t) {
  if (!t) return;
  if (t.position) obj.position.fromArray(t.position);
  if (t.quaternion) obj.quaternion.fromArray(t.quaternion);
  if (t.scale) obj.scale.fromArray(t.scale);
}
function isIdentity(obj, centroid) {
  return obj.quaternion.equals(new THREE.Quaternion()) &&
    obj.scale.equals(new THREE.Vector3(1, 1, 1)) &&
    obj.position.distanceToSquared(centroid) < 1e-12;
}

export function serializeProject(scene) {
  const strokes = [];
  const primitives = [];
  scene.children.forEach((obj) => {
    const ud = obj.userData;
    if (!ud) return;
    if (ud.strokePoints) {
      const s = { layerId: ud.layerId, color: ud.strokeColor, width: ud.strokeWidth, points: ud.strokePoints };
      if (ud.strokePressures) s.pressures = ud.strokePressures;
      if (ud.strokeFaceNormal) s.faceNormal = ud.strokeFaceNormal;
      if (ud.brush) s.brush = ud.brush;
      if (ud.strokeNib) s.nib = ud.strokeNib;
      // Solo se guarda la transformación si el trazo se movió de donde se dibujó
      const c = new THREE.Vector3();
      ud.strokePoints.forEach((p) => { c.x += p[0]; c.y += p[1]; c.z += p[2]; });
      c.divideScalar(ud.strokePoints.length);
      if (!isIdentity(obj, c)) s.transform = transformOf(obj);
      strokes.push(s);
    } else if (ud.primitiveKind) {
      primitives.push({ kind: ud.primitiveKind, layerId: ud.layerId, color: ud.color, ...transformOf(obj) });
    }
  });

  const { layers, activeLayerId, savedViews, drawPlane, mirror } = getState();
  return { version: FORMAT_VERSION, layers, activeLayerId, savedViews, drawPlane, mirror, strokes, primitives };
}

/**
 * Reconstruye la escena a partir de un proyecto ya parseado. Borra los
 * trazos y figuras existentes (no la grilla, luces ni guías).
 * @param {Object} [opts]
 * @param {Function} [opts.strokeOptions] - (strokeData) => opciones extra de
 *   startStroke (lo usa el sistema de pinceles para recrear materiales).
 */
export function loadProject(scene, strokeEngine, data, { strokeOptions = null } = {}) {
  if (!data || !SUPPORTED.includes(data.version)) {
    throw new Error(`Formato de proyecto no reconocido (versión ${data && data.version})`);
  }

  const toRemove = scene.children.filter((o) => o.userData && (o.userData.strokePoints || o.userData.primitiveKind));
  toRemove.forEach((o) => scene.remove(o));

  setState({
    layers: data.layers,
    activeLayerId: data.activeLayerId,
    savedViews: data.savedViews || [],
    selectedId: null,
  });
  if (data.drawPlane) setState({ drawPlane: data.drawPlane });
  if (typeof data.mirror === 'boolean') setState({ mirror: data.mirror });

  (data.strokes || []).forEach((s) => {
    if (!s.points || s.points.length < 2) return;
    const pts = s.points.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const pr = s.pressures || [];
    const faceNormal = s.faceNormal ? new THREE.Vector3().fromArray(s.faceNormal) : null;
    const extra = strokeOptions ? strokeOptions(s) : {};
    strokeEngine.startStroke(pts[0], {
      color: s.color, width: s.width, meta: { layerId: s.layerId }, pressure: pr[0] ?? 1, faceNormal,
      brush: s.brush || null, nib: s.nib || null, ...extra,
    });
    for (let i = 1; i < pts.length; i++) strokeEngine.addPoint(pts[i], pr[i] ?? 1);
    const done = strokeEngine.endStroke();
    if (done && done.mesh) applyTransform(done.mesh, s.transform);
  });

  (data.primitives || []).forEach((p) => {
    const mesh = placePrimitive(scene, p.kind, new THREE.Vector3(), { color: p.color, layerId: p.layerId, record: false });
    applyTransform(mesh, p);
  });

  // La visibilidad de capas se re-aplica sola (layers.js escucha `layers`),
  // pero los meshes recién creados llegaron DESPUÉS de ese aviso.
  const visMap = new Map((data.layers || []).map((l) => [l.id, l.visible]));
  scene.children.forEach((o) => {
    if (o.userData && o.userData.layerId != null) o.visible = visMap.get(o.userData.layerId) !== false;
  });

  clearHistory();
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Dispara la descarga del proyecto como archivo .json. */
export function downloadProject(scene, filename = 'proyecto.json') {
  const data = serializeProject(scene);
  download(new Blob([JSON.stringify(data)], { type: 'application/json' }), filename);
}

/** Abre el selector de archivos del sistema y carga el .json elegido. */
export function pickAndLoadProject(scene, strokeEngine, onDone, loadOpts) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files[0];
    input.remove();
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        loadProject(scene, strokeEngine, JSON.parse(reader.result), loadOpts);
        if (onDone) onDone(null);
      } catch (err) {
        if (onDone) onDone(err);
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/**
 * Exporta una imagen PNG de lo que se ve. Antes salía en blanco en muchos
 * navegadores: WebGL descarta el buffer después de mostrarlo
 * (preserveDrawingBuffer: false), así que hay que dibujar y capturar en el
 * mismo instante. También oculta las ayudas visuales (grilla del plano,
 * espejo, piso) para que la imagen tenga solo el dibujo.
 */
export function exportImage(renderer, { render, hide = [] } = {}, filename = 'dibujo.png') {
  const prev = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  if (render) render();
  renderer.domElement.toBlob((blob) => { if (blob) download(blob, filename); }, 'image/png');
  hide.forEach((o, i) => { o.visible = prev[i]; });
  if (render) render();
}
