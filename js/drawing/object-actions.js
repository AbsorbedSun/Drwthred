// ============================================================================
// OBJECT ACTIONS — lo que se puede hacer con la selección (uno o varios
// objetos): duplicar, eliminar, pintar, espejar, mandar a la capa activa.
// Cada acción es UN paso de deshacer aunque toque muchos objetos.
//
// Solo lógica: la barra de acciones (ui/panels/selection-bar.js) llama a
// estas funciones; acá no se sabe nada de botones.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState } from '../core/store.js';
import { pushAction } from '../core/history.js';
import { setSelection, objectColor, setObjectColor } from './selection.js';
import { snapshot, recordTransform, groupPivot } from './transform.js';
import { buildRibbonGeometry, centroidOf } from './stroke-engine.js';
import { getBrush, createBrushMaterial } from './brushes.js';

/**
 * Duplica los objetos, corridos `offset` (mundo), y deja seleccionadas las copias.
 * La geometría se comparte (no cambia nunca después de creada); el material
 * no, porque el resaltado de selección lo tiñe por objeto.
 */
export function duplicateObjects(scene, objs, offset = new THREE.Vector3(0.15, -0.15, 0)) {
  if (!objs.length) return [];
  const prevSel = getState().selectedIds;
  const copies = objs.map((o) => {
    const c = o.clone(); // copia también userData (JSON)
    c.material = o.material.clone();
    c.material.color.setHex(objectColor(o)); // sin el turquesa del resaltado
    c.position.add(offset);
    scene.add(c);
    return c;
  });
  const ids = copies.map((c) => c.uuid);
  setSelection(ids);
  pushAction({
    undo: () => { copies.forEach((c) => scene.remove(c)); setState({ selectedIds: prevSel }); },
    redo: () => { copies.forEach((c) => scene.add(c)); setSelection(ids); },
  });
  return copies;
}

export function deleteObjects(scene, objs) {
  if (!objs.length) return false;
  const prevSel = getState().selectedIds;
  objs.forEach((o) => scene.remove(o));
  setSelection([]);
  pushAction({
    undo: () => { objs.forEach((o) => scene.add(o)); setState({ selectedIds: prevSel }); },
    redo: () => { objs.forEach((o) => scene.remove(o)); setSelection([]); },
  });
  return true;
}

/** Pinta los objetos con un color (el resaltado de selección se respeta). */
export function recolorObjects(objs, color) {
  if (!objs.length) return false;
  const before = objs.map((o) => objectColor(o));
  const hex = new THREE.Color(color).getHex();
  if (before.every((b) => b === hex)) return false;
  objs.forEach((o) => setObjectColor(o, hex));
  pushAction({
    undo: () => objs.forEach((o, i) => setObjectColor(o, before[i])),
    redo: () => objs.forEach((o) => setObjectColor(o, hex)),
  });
  return true;
}

const _m = new THREE.Matrix4();
/**
 * Espeja el grupo respecto a un plano vertical (normal `axis`, por defecto
 * X del mundo) que pasa por su centro. Se aplica sobre la matriz completa
 * — el reflejo invierte la orientación, y three lo representa como escala
 * negativa al descomponer. Las caras son de doble lado: se ve bien igual.
 */
export function mirrorObjects(objs, axis = new THREE.Vector3(1, 0, 0)) {
  if (!objs.length) return false;
  const before = snapshot(objs);
  const pivot = groupPivot(objs);
  const n = axis.clone().normalize();
  // Reflexión de Householder I - 2nnᵀ, trasladada al pivote
  const R = new THREE.Matrix4().set(
    1 - 2 * n.x * n.x, -2 * n.x * n.y, -2 * n.x * n.z, 0,
    -2 * n.y * n.x, 1 - 2 * n.y * n.y, -2 * n.y * n.z, 0,
    -2 * n.z * n.x, -2 * n.z * n.y, 1 - 2 * n.z * n.z, 0,
    0, 0, 0, 1,
  );
  const M = new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z)
    .multiply(R).multiply(_m.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
  objs.forEach((o) => {
    o.updateMatrix();
    o.matrix.premultiply(M);
    o.matrix.decompose(o.position, o.quaternion, o.scale);
  });
  return recordTransform(before, 'espejar');
}

/** Manda los objetos a la capa activa (y aplica su visibilidad). */
export function moveObjectsToLayer(objs, layerId = getState().activeLayerId) {
  const moving = objs.filter((o) => o.userData.layerId !== layerId);
  if (!moving.length) return false;
  const before = moving.map((o) => o.userData.layerId);
  const visible = (id) => getState().layers.find((l) => l.id === id)?.visible !== false;
  const apply = (ids) => moving.forEach((o, i) => {
    o.userData.layerId = ids[i];
    o.visible = visible(ids[i]);
  });
  apply(moving.map(() => layerId));
  pushAction({ undo: () => apply(before), redo: () => apply(moving.map(() => layerId)) });
  return true;
}

/**
 * Cambia el grosor y/o el pincel de los TRAZOS seleccionados (las figuras
 * se ignoran). Cada trazo se reconstruye con su receta nueva conservando
 * forma, posición/rotación/escala, color y capa. Un solo paso de deshacer.
 * @param {Object} change - { width?: number, brush?: string }
 */
export function restyleStrokes(objs, camera, { width = null, brush = null } = {}) {
  const strokes = objs.filter((o) => o.userData && o.userData.strokePoints);
  if (!strokes.length) return false;
  const swaps = strokes.map((m) => {
    const ud = m.userData;
    const before = { geometry: m.geometry, material: m.material, userData: { ...ud } };
    const nextUd = { ...ud };
    if (width != null) nextUd.strokeWidth = width;
    if (brush != null) nextUd.brush = brush;
    const b = nextUd.brush ? getBrush(nextUd.brush) : null;
    if (!(b && b.nib)) delete nextUd.strokeNib;
    else if (!nextUd.strokeNib) nextUd.strokeNib = [Math.SQRT1_2, Math.SQRT1_2, 0];

    const pts = ud.strokePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const c0 = centroidOf(pts);
    // Cámara en el marco original del trazo (para las cintas que la miran)
    m.updateMatrixWorld();
    const cam = m.worldToLocal(camera.position.clone()).add(c0);
    const geo = buildRibbonGeometry(pts, nextUd.strokeWidth, cam, {
      widths: ud.strokePressures || null,
      faceNormal: ud.strokeFaceNormal ? new THREE.Vector3().fromArray(ud.strokeFaceNormal) : null,
      normals: ud.strokeNormals ? ud.strokeNormals.map((n) => (n ? new THREE.Vector3().fromArray(n) : null)) : null,
      brush: b,
      nib: nextUd.strokeNib ? new THREE.Vector3().fromArray(nextUd.strokeNib) : null,
    });
    geo.translate(-c0.x, -c0.y, -c0.z);
    const mat = createBrushMaterial(b, objectColor(m));
    // Si estaba resaltado (seleccionado), el material nuevo también
    if (m.material.color.getHex() !== objectColor(m)) mat.color.copy(m.material.color);
    return { m, before, after: { geometry: geo, material: mat, userData: nextUd } };
  });
  const apply = (key) => swaps.forEach((s) => {
    s.m.geometry = s[key].geometry;
    s.m.material = s[key].material;
    s.m.userData = { ...s[key].userData };
  });
  apply('after');
  pushAction({ undo: () => apply('before'), redo: () => apply('after') });
  return true;
}
