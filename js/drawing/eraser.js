// ============================================================================
// ERASER — borrado total y parcial. Ambos hacen raycast directo contra la
// geometría real de los trazos (no contra un plano proyectado como el
// dibujo) — es lo correcto para "tocar algo que ya existe en el espacio".
//
// Borrado parcial reconstruye el trazo cortado reutilizando
// buildRibbonGeometry de stroke-engine.js — no duplica esa matemática.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { pushAction } from '../core/history.js';
import { buildRibbonGeometry } from './stroke-engine.js';

const raycaster = new THREE.Raycaster();

function strokeMeshes(scene) {
  return scene.children.filter((o) => o.userData && o.userData.strokePoints);
}

function firstHit(scene, camera, ndcX, ndcY) {
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const hits = raycaster.intersectObjects(strokeMeshes(scene), false);
  return hits.length ? hits[0] : null;
}

/** Borra el trazo completo que se toque. Devuelve true si borró algo. */
export function eraseFull(scene, camera, ndcX, ndcY) {
  const hit = firstHit(scene, camera, ndcX, ndcY);
  if (!hit) return false;
  const mesh = hit.object;
  scene.remove(mesh);
  pushAction({
    undo: () => scene.add(mesh),
    redo: () => scene.remove(mesh),
  });
  return true;
}

/**
 * Borra solo la parte del trazo dentro de `radius` del punto tocado.
 * Si el borrado parte el trazo por la mitad, quedan DOS trazos nuevos
 * (uno a cada lado del hueco) en vez de uno solo con un agujero en el medio.
 */
export function erasePartial(scene, camera, ndcX, ndcY, radius = 0.12) {
  const hit = firstHit(scene, camera, ndcX, ndcY);
  if (!hit) return false;
  const mesh = hit.object;
  const hitPoint = hit.point;

  const rawPoints = mesh.userData.strokePoints.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
  const width = mesh.userData.strokeWidth;
  const color = mesh.userData.strokeColor;
  const layerId = mesh.userData.layerId;

  // Partir en tramos contiguos de puntos que quedan FUERA del radio de borrado
  const segments = [];
  let current = [];
  for (const p of rawPoints) {
    if (p.distanceTo(hitPoint) > radius) {
      current.push(p);
    } else if (current.length) {
      segments.push(current);
      current = [];
    }
  }
  if (current.length) segments.push(current);

  const newMeshes = segments
    .filter((seg) => seg.length >= 2)
    .map((seg) => {
      const geo = buildRibbonGeometry(seg, width, camera.position);
      // Mismo centrado de pivote que stroke-engine.js — un pedazo de
      // trazo recién partido también tiene que poder escalarse/rotarse
      // sobre sí mismo más adelante, no sobre el origen del mundo.
      const centroid = new THREE.Vector3();
      seg.forEach((p) => centroid.add(p));
      centroid.divideScalar(seg.length);
      geo.translate(-centroid.x, -centroid.y, -centroid.z);

      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(centroid);
      m.userData = {
        layerId,
        strokeWidth: width,
        strokeColor: color,
        strokePoints: seg.map((p) => p.toArray()),
      };
      return m;
    });

  scene.remove(mesh);
  newMeshes.forEach((m) => scene.add(m));

  pushAction({
    undo: () => { newMeshes.forEach((m) => scene.remove(m)); scene.add(mesh); },
    redo: () => { scene.remove(mesh); newMeshes.forEach((m) => scene.add(m)); },
  });
  return true;
}
