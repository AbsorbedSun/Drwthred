// ============================================================================
// ERASER — borrado total y parcial. Raycast directo contra la geometría
// real de los trazos (no contra un plano proyectado como el dibujo).
//
// Mejoras de lógica:
//  · LOTES: una pasada de goma (bajar, arrastrar, soltar) es UN paso de
//    deshacer. Antes cada trazo tocado — y cada corte del borrado parcial
//    en cada evento de movimiento — apilaba su propia acción: deshacer una
//    pasada podía llevar decenas de toques. createEraseBatch() junta todo
//    y al final registra el efecto NETO (si un pedazo se creó y se borró
//    dentro de la misma pasada, ni aparece).
//  · Trazos transformados: el borrado parcial comparaba el punto tocado
//    (mundo) contra los puntos ORIGINALES del trazo — si el trazo se había
//    movido/escalado/rotado, borraba en el lugar equivocado. Ahora el
//    punto se lleva al marco original del trazo, y los pedazos resultantes
//    heredan la transformación.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { pushAction } from '../core/history.js';
import { buildRibbonGeometry, centroidOf } from './stroke-engine.js';
import { getBrush } from './brushes.js';

const raycaster = new THREE.Raycaster();

function strokeMeshes(scene) {
  const list = scene.children.filter((o) => o.visible && o.userData && o.userData.strokePoints);
  // Con render bajo demanda, la matriz de mundo de un objeto recién
  // movido puede no estar actualizada todavía: el raycast la necesita.
  list.forEach((o) => o.updateMatrixWorld());
  return list;
}

function firstHit(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(strokeMeshes(scene), false);
  return hits.length ? hits[0] : null;
}

/**
 * Lote de borrado: registra altas/bajas y al cerrar empuja UNA acción.
 * Sin lote (llamada suelta), cada función registra su propia acción.
 */
export function createEraseBatch(scene) {
  const added = new Set();
  const removed = new Set();
  return {
    remove(mesh) {
      scene.remove(mesh);
      if (added.has(mesh)) added.delete(mesh); // nació y murió en esta pasada
      else removed.add(mesh);
    },
    add(mesh) {
      scene.add(mesh);
      added.add(mesh);
    },
    get changed() { return added.size > 0 || removed.size > 0; },
    commit() {
      if (!added.size && !removed.size) return false;
      const a = [...added], r = [...removed];
      pushAction({
        undo: () => { a.forEach((m) => scene.remove(m)); r.forEach((m) => scene.add(m)); },
        redo: () => { r.forEach((m) => scene.remove(m)); a.forEach((m) => scene.add(m)); },
      });
      added.clear(); removed.clear();
      return true;
    },
  };
}

function withBatch(scene, batch, fn) {
  const own = !batch;
  const b = batch || createEraseBatch(scene);
  const result = fn(b);
  if (own) b.commit();
  return result;
}

/** Borra el trazo completo que se toque. Devuelve true si borró algo. */
export function eraseFull(scene, camera, ndcX, ndcY, { batch = null } = {}) {
  const hit = firstHit(scene, camera, ndcX, ndcY);
  if (!hit) return false;
  return withBatch(scene, batch, (b) => { b.remove(hit.object); return true; });
}

/**
 * Borra solo la parte del trazo dentro de `radius` (en unidades de mundo)
 * del punto tocado. Si el borrado parte el trazo por la mitad, quedan DOS
 * trazos nuevos (uno a cada lado del hueco).
 */
export function erasePartial(scene, camera, ndcX, ndcY, radius = 0.12, { batch = null } = {}) {
  const hit = firstHit(scene, camera, ndcX, ndcY);
  if (!hit) return false;
  const mesh = hit.object;
  const ud = mesh.userData;

  const rawPoints = ud.strokePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const c0 = centroidOf(rawPoints); // la geometría del mesh está centrada en c0

  // Punto tocado → marco ORIGINAL del trazo (deshace mover/escalar/rotar)
  mesh.updateMatrixWorld();
  const hitOriginal = mesh.worldToLocal(hit.point.clone()).add(c0);
  const s = Math.max(1e-6, (Math.abs(mesh.scale.x) + Math.abs(mesh.scale.y) + Math.abs(mesh.scale.z)) / 3);
  const localRadius = radius / s;

  const pressures = ud.strokePressures || null;
  const faceArr = ud.strokeFaceNormal || null;
  const faceNormal = faceArr ? new THREE.Vector3().fromArray(faceArr) : null;
  const brush = ud.brush ? getBrush(ud.brush) : null;
  const nib = ud.strokeNib ? new THREE.Vector3().fromArray(ud.strokeNib) : null;

  // Tramos contiguos (por índice, para arrastrar la presión) FUERA del radio
  const segments = [];
  let run = [];
  rawPoints.forEach((p, i) => {
    if (p.distanceTo(hitOriginal) > localRadius) run.push(i);
    else if (run.length) { segments.push(run); run = []; }
  });
  if (run.length) segments.push(run);

  // Nada que cortar: el radio no tocó ningún punto (pasa con radios chicos
  // sobre segmentos largos) — no tiene sentido reemplazar el trazo por sí mismo.
  if (segments.length === 1 && segments[0].length === rawPoints.length) return false;

  // Cámara en el marco original, para las cintas que miran a la cámara
  const camOriginal = mesh.worldToLocal(camera.position.clone()).add(c0);

  const newMeshes = segments
    .filter((idx) => idx.length >= 2)
    .map((idx) => {
      const seg = idx.map((i) => rawPoints[i]);
      const segPressures = pressures ? idx.map((i) => pressures[i]) : null;
      const geo = buildRibbonGeometry(seg, ud.strokeWidth, camOriginal, { widths: segPressures, faceNormal, brush, nib });
      const cs = centroidOf(seg);
      geo.translate(-cs.x, -cs.y, -cs.z);

      const m = new THREE.Mesh(geo, mesh.material.clone());
      // Hereda la transformación del original: mismo giro/escala, y el
      // centro del pedazo llevado al mundo con la matriz del original.
      m.quaternion.copy(mesh.quaternion);
      m.scale.copy(mesh.scale);
      m.position.copy(mesh.localToWorld(cs.clone().sub(c0)));
      m.visible = mesh.visible;
      m.userData = {
        layerId: ud.layerId,
        strokeWidth: ud.strokeWidth,
        strokeColor: ud.strokeColor,
        strokePoints: seg.map((p) => p.toArray()),
      };
      if (ud.brush) m.userData.brush = ud.brush;
      if (ud.strokeNib) m.userData.strokeNib = ud.strokeNib.slice();
      if (segPressures) m.userData.strokePressures = segPressures;
      if (faceArr) m.userData.strokeFaceNormal = faceArr.slice();
      return m;
    });

  return withBatch(scene, batch, (b) => {
    b.remove(mesh);
    newMeshes.forEach((m) => b.add(m));
    return true;
  });
}
