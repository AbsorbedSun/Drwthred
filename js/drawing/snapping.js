// ============================================================================
// SNAPPING — "imán entre trazos": si la punta de un trazo cae cerca (en
// pantalla) de otro trazo, se pega EXACTO a ese punto 3D. Dibujar en 3D
// sobre planos hace casi imposible acertar a mano la punta de otra línea
// que está en otro plano; con el imán, las líneas se unen de verdad.
//
// Prioriza las PUNTAS de los otros trazos (unir esquinas) sobre los puntos
// intermedios. Se consulta solo al empezar y al terminar un trazo.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { centroidOf } from './stroke-engine.js';

const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * @param {Object} o
 * @param {{x,y}} o.ndc - puntero en NDC
 * @param {{w,h}} o.viewport - tamaño del lienzo en px (para medir en px)
 * @param {number} [o.radiusPx=22]
 * @returns {{point: THREE.Vector3, kind: 'end'|'point', ndc: {x,y}}|null}
 */
export function findSnapTarget(scene, camera, { ndc, viewport, radiusPx = 22, exclude = null } = {}) {
  camera.updateMatrixWorld();
  const hw = viewport.w / 2, hh = viewport.h / 2;
  let best = null;
  let bestScore = Infinity;
  for (const obj of scene.children) {
    const ud = obj.userData;
    if (!ud || !ud.strokePoints || !obj.visible || obj === exclude) continue;
    obj.updateMatrixWorld();
    const pts = ud.strokePoints;
    const c0 = centroidOf(pts.map((p) => _p.set(p[0], p[1], p[2]).clone()));
    const last = pts.length - 1;
    // En trazos muy largos (miles de puntos) los intermedios se revisan salteados
    const step = pts.length > 400 ? Math.ceil(pts.length / 400) : 1;
    for (let i = 0; i <= last; i++) {
      const isEnd = i === 0 || i === last;
      if (!isEnd && i % step) continue;
      _p.set(pts[i][0] - c0.x, pts[i][1] - c0.y, pts[i][2] - c0.z);
      obj.localToWorld(_p);
      _s.copy(_p).project(camera);
      if (_s.z < -1 || _s.z > 1) continue;
      const dpx = Math.hypot((_s.x - ndc.x) * hw, (_s.y - ndc.y) * hh);
      const limit = isEnd ? radiusPx : radiusPx * 0.6;
      if (dpx > limit) continue;
      // Las puntas ganan aunque estén un poco más lejos
      const score = isEnd ? dpx * 0.5 : dpx;
      if (score < bestScore) {
        bestScore = score;
        best = { point: _p.clone(), kind: isEnd ? 'end' : 'point', ndc: { x: _s.x, y: _s.y } };
      }
    }
  }
  return best;
}
