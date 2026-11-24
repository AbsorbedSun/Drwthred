// ============================================================================
// SELECTION — qué está seleccionado, cómo se ve y cómo se elige.
//
//  · La selección vive en el store (`selectedIds`, ver core/store.js) y el
//    resaltado se aplica solo, reactivo: se suscribe una vez acá.
//  · Tocar un objeto lo selecciona; el LAZO selecciona todo lo que quede
//    adentro del contorno dibujado (objectsInLasso).
//  · El resaltado tiñe el material; el color real queda guardado aparte, y
//    setObjectColor() respeta eso (pintar algo seleccionado no se pierde
//    al deseleccionar).
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState, setState, subscribe } from '../core/store.js';
import { isLockedObject } from './layers.js';

const raycaster = new THREE.Raycaster();
const HIGHLIGHT_COLOR = 0x4fd1c5;
const originalColors = new Map(); // mesh -> color hex original, para restaurar al deseleccionar

export function isSelectable(o) {
  return !!(o.userData && (o.userData.strokePoints || o.userData.primitiveKind || o.userData.reference));
}
export function selectableMeshes(scene) {
  return scene.children.filter(isSelectable);
}
/** Candidatos para raycast: visibles y con la matriz de mundo al día
 * (con render bajo demanda puede no haberse actualizado desde el último cambio). */
function pickable(scene, filter) {
  const list = selectableMeshes(scene).filter((o) => o.visible && (!filter || filter(o)));
  list.forEach((o) => o.updateMatrixWorld());
  return list;
}

/** Hit-test puro, sin efectos secundarios — no toca el store. */
export function hitTestAt(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  // Lo de capas bloqueadas no se puede agarrar
  const hits = raycaster.intersectObjects(pickable(scene, (o) => !isLockedObject(o)), false);
  // Lo dibujado gana sobre la imagen de referencia que tenga detrás
  const hit = hits.find((h) => !h.object.userData.reference) || hits[0];
  return hit ? hit.object.uuid : null;
}

/** Igual que hitTestAt, pero devuelve el PUNTO 3D tocado (o null). */
export function hitPointAt(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(pickable(scene), false);
  return hits.length ? hits[0].point.clone() : null;
}

const _nm = new THREE.Matrix3();
/**
 * Punto y normal (de mundo) de la SUPERFICIE de una figura bajo el puntero.
 * Solo figuras: los trazos son cintas finas, no superficies para dibujar.
 * La normal se orienta hacia la cámara (las caras se ven de los dos lados).
 * @returns {{point: THREE.Vector3, normal: THREE.Vector3, object: THREE.Object3D}|null}
 */
export function surfaceHitAt(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(pickable(scene, (o) => !!o.userData.primitiveKind), false);
  const h = hits.find((x) => x.face);
  if (!h) return null;
  _nm.getNormalMatrix(h.object.matrixWorld);
  const normal = h.face.normal.clone().applyMatrix3(_nm).normalize();
  if (normal.dot(raycaster.ray.direction) > 0) normal.negate();
  return { point: h.point.clone(), normal, object: h.object };
}

export function getSelectedIds(state = getState()) {
  return state.selectedIds || (state.selectedId ? [state.selectedId] : []);
}

/** Objetos seleccionados que siguen en la escena (lo deshecho/borrado no cuenta). */
export function selectedObjects(scene, state = getState()) {
  const ids = new Set(getSelectedIds(state));
  if (!ids.size) return [];
  return scene.children.filter((o) => ids.has(o.uuid) && !isLockedObject(o, state));
}

export function setSelection(ids) {
  setState({ selectedIds: [...new Set(ids)] });
}

export function selectAt(scene, camera, ndcX, ndcY) {
  const id = hitTestAt(scene, camera, ndcX, ndcY);
  setSelection(id ? [id] : []);
  return id;
}

export function clearSelection() {
  setSelection([]);
}

// ── Lazo ──

/** Punto dentro de polígono (regla par-impar), en NDC. */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const _v = new THREE.Vector3();
/** Puntos de muestra de un objeto, en mundo: los del trazo, o las esquinas+centro de la figura. */
function samplePoints(obj) {
  obj.updateMatrixWorld();
  const ud = obj.userData;
  if (ud.strokePoints) {
    const pts = ud.strokePoints;
    const c = pts.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length);
    const step = Math.max(1, Math.floor(pts.length / 40)); // hasta ~40 muestras por trazo
    const out = [];
    for (let i = 0; i < pts.length; i += step) {
      // strokePoints están en el marco ORIGINAL; la geometría está centrada en c
      out.push(obj.localToWorld(_v.set(pts[i][0] - c[0], pts[i][1] - c[1], pts[i][2] - c[2]).clone()));
    }
    return out;
  }
  if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
  const b = obj.geometry.boundingBox;
  const out = [obj.localToWorld(b.getCenter(new THREE.Vector3()))];
  for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
    out.push(obj.localToWorld(new THREE.Vector3(x, y, z)));
  }
  return out;
}

/**
 * Objetos visibles que quedan adentro del lazo (polígono en NDC). Un objeto
 * entra si al menos la mitad de sus puntos de muestra caen adentro — así un
 * trazo largo que el lazo apenas roza no se cuela, y uno rodeado casi
 * entero sí entra.
 */
export function objectsInLasso(scene, camera, polygon, minFraction = 0.5) {
  if (!polygon || polygon.length < 3) return [];
  camera.updateMatrixWorld();
  return selectableMeshes(scene).filter((o) => {
    if (!o.visible || isLockedObject(o)) return false;
    const pts = samplePoints(o);
    let inside = 0, total = 0;
    for (const p of pts) {
      const s = p.clone().project(camera);
      if (s.z > 1 || s.z < -1) continue; // detrás de la cámara
      total++;
      if (pointInPolygon(s.x, s.y, polygon)) inside++;
    }
    return total > 0 && inside / total >= minFraction;
  });
}

// ── Color y resaltado ──

/** Color "real" de un objeto (sin el teñido de la selección). */
export function objectColor(obj) {
  if (originalColors.has(obj)) return originalColors.get(obj);
  return obj.material && obj.material.color ? obj.material.color.getHex() : 0xffffff;
}

/** Cambia el color real de un objeto, respetando el resaltado si está seleccionado. */
export function setObjectColor(obj, hex) {
  const css = '#' + new THREE.Color(hex).getHexString();
  if (obj.userData.strokePoints) obj.userData.strokeColor = css;
  if (obj.userData.primitiveKind) obj.userData.color = css;
  if (originalColors.has(obj)) originalColors.set(obj, new THREE.Color(hex).getHex());
  else if (obj.material && obj.material.color) obj.material.color.set(hex);
}

export function syncSelectionHighlight(scene) {
  function apply() {
    const ids = new Set(getSelectedIds());
    // Primero restaurar TODO lo que estaba resaltado y ya no está
    // seleccionado — aunque haya salido de la escena (borrado/deshecho):
    // si no, al rehacerlo volvía con el color del resaltado para siempre.
    originalColors.forEach((hex, obj) => {
      if (ids.has(obj.uuid) && obj.parent === scene) return;
      obj.material.color.setHex(hex);
      originalColors.delete(obj);
    });
    selectableMeshes(scene).forEach((obj) => {
      if (!obj.material || !obj.material.color || !ids.has(obj.uuid)) return;
      if (!originalColors.has(obj)) originalColors.set(obj, obj.material.color.getHex());
      obj.material.color.setHex(HIGHLIGHT_COLOR);
    });
  }
  subscribe(apply, (s) => s.selectedIds);
  apply();
  return { refresh: apply };
}
