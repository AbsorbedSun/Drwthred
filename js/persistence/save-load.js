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
import { normalizeLayer } from '../drawing/layers.js';
import { serializeReferences, loadReferences } from '../drawing/references.js';

// v3: capas con bloqueo y opacidad (y referencias, ver fase 3)
export const FORMAT_VERSION = 3;
const SUPPORTED = [1, 2, 3];

const round = (v) => +v.toFixed(6);
const round4 = (v) => Math.round(v * 1e4) / 1e4 + 0; // + 0: sin -0
const roundPoint = (p) => [round4(p[0]), round4(p[1]), round4(p[2])];

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
      // Coordenadas con 4 decimales (0.1 mm si la unidad es el metro): una
      // diferencia invisible que reduce el archivo a menos de la mitad
      const s = { layerId: ud.layerId, color: ud.strokeColor, width: ud.strokeWidth, points: ud.strokePoints.map(roundPoint) };
      if (ud.strokePressures) s.pressures = ud.strokePressures;
      if (ud.strokeFaceNormal) s.faceNormal = ud.strokeFaceNormal;
      if (ud.brush) s.brush = ud.brush;
      if (ud.strokeNib) s.nib = ud.strokeNib;
      if (ud.strokeNormals) s.normals = ud.strokeNormals;
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
  const references = serializeReferences(scene);
  return { version: FORMAT_VERSION, layers: layers.map(normalizeLayer), activeLayerId, savedViews, drawPlane, mirror, strokes, primitives, references };
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

  const toRemove = scene.children.filter((o) => o.userData && (o.userData.strokePoints || o.userData.primitiveKind || o.userData.reference));
  toRemove.forEach((o) => scene.remove(o));

  setState({
    layers: (data.layers && data.layers.length ? data.layers : [{ id: 'layer-1', name: 'Capa 1' }]).map(normalizeLayer),
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
    const nv = (i) => (s.normals && s.normals[i] ? new THREE.Vector3().fromArray(s.normals[i]) : null);
    strokeEngine.startStroke(pts[0], {
      color: s.color, width: s.width, meta: { layerId: s.layerId }, pressure: pr[0] ?? 1, faceNormal,
      brush: s.brush || null, nib: s.nib || null, normal: nv(0), ...extra,
    });
    for (let i = 1; i < pts.length; i++) strokeEngine.addPoint(pts[i], pr[i] ?? 1, nv(i));
    const done = strokeEngine.endStroke();
    if (done && done.mesh) applyTransform(done.mesh, s.transform);
  });

  (data.primitives || []).forEach((p) => {
    const mesh = placePrimitive(scene, p.kind, new THREE.Vector3(), { color: p.color, layerId: p.layerId, record: false });
    applyTransform(mesh, p);
  });

  loadReferences(scene, data.references || []);

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
 * Empieza un dibujo nuevo: saca trazos, figuras y referencias, vuelve a
 * una sola capa y vacía el historial. La grilla, luces y guías quedan.
 */
export function newProject(scene) {
  const toRemove = scene.children.filter((o) => o.userData &&
    (o.userData.strokePoints || o.userData.primitiveKind || o.userData.reference));
  toRemove.forEach((o) => scene.remove(o));
  setState({
    layers: [{ id: 'layer-1', name: 'Capa 1', visible: true, locked: false, opacity: 1 }],
    activeLayerId: 'layer-1',
    savedViews: [],
    selectedIds: [],
  });
  clearHistory();
}
