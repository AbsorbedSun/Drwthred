// ============================================================================
// STROKE ENGINE — construye la geometría visible de un trazo a partir de
// una secuencia de puntos 3D. Usa una CINTA (triangle strip) que gira para
// mirar a la cámara (o queda apoyada en el plano de dibujo, si se pasa
// faceNormal).
//
// Pinceles (drawing/brushes.js): el motor interpreta la receta de cada
// pincel — sensibilidad a la presión, afinado de puntas, punta de
// caligrafía, punteado, textura (UVs a lo largo del trazo) y material.
//
// Curvas suaves (opción `smooth`): los eventos del lápiz/dedo llegan como
// puntos sueltos — unidos con rectas, un movimiento rápido dejaba tramos
// rectos y esquinas. Con `smooth`, entre cada par de puntos crudos se
// interpola una curva Catmull-Rom CENTRÍPETA (la variante que no hace
// rulos ni se pasa de largo en las curvas cerradas). El último tramo se
// recalcula con cada punto nuevo, así la cinta sigue al lápiz sin retraso.
//
// Normales por punto (opción `normal` en addPoint): para dibujar SOBRE la
// superficie de una figura, cada punto trae la normal de la superficie y
// la cinta queda apoyada en ella punto a punto.
//
// Rendimiento (trazo en vivo): buffers preasignados que crecen al doble;
// cada punto nuevo reescribe solo los últimos pares de vértices y sube a la
// GPU únicamente ese tramo. Al terminar se arma una geometría compacta una
// sola vez (y recién ahí se afina la punta final, cuando se conoce el largo).
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { widthFactor, nibFactor, dashOn, needsUV, uvScale, createBrushMaterial, getBrush } from './brushes.js';

const MIN_SEGMENT_LENGTH_FACTOR = 0.35; // fracción del grosor: evita puntos degenerados
const INITIAL_CAPACITY = 128;           // puntos

// Vectores temporales reutilizados — el cálculo por vértice no aloca nada
const _dir = new THREE.Vector3();
const _toCam = new THREE.Vector3();
const _side = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _X = new THREE.Vector3(1, 0, 0);

/**
 * Contexto de un trazo: todo lo que hace falta para calcular sus vértices.
 * { width, cameraPosition, faceNormal, normals, brush, nib, widths, lengths, total }
 */
function writeRibbonPair(out, offset, points, i, ctx) {
  const n = points.length;
  const p = points[i];
  if (i < n - 1) _dir.subVectors(points[i + 1], p);
  else _dir.subVectors(p, points[i - 1]);
  _dir.normalize();

  const fn = (ctx.normals && ctx.normals[i]) || ctx.faceNormal;
  if (fn) _toCam.copy(fn);
  else _toCam.subVectors(ctx.cameraPosition, p).normalize();

  _side.crossVectors(_dir, _toCam);
  if (_side.lengthSq() < 1e-8) {
    // dir y toCam casi paralelos — respaldo para no degenerar en ancho cero
    _side.crossVectors(_dir, _UP);
    if (_side.lengthSq() < 1e-8) _side.copy(_X);
  }
  let w = ctx.width * widthFactor(i, ctx);
  if (ctx.nib) w *= nibFactor(_dir, ctx.nib);
  _side.normalize().multiplyScalar(w / 2);

  out[offset] = p.x + _side.x; out[offset + 1] = p.y + _side.y; out[offset + 2] = p.z + _side.z;
  out[offset + 3] = p.x - _side.x; out[offset + 4] = p.y - _side.y; out[offset + 5] = p.z - _side.z;
}

function writeUV(out, i, ctx) {
  const u = ctx.lengths[i] / (ctx.width * uvScale(ctx.brush));
  out[i * 4] = u; out[i * 4 + 1] = 0;
  out[i * 4 + 2] = u; out[i * 4 + 3] = 1;
}

function writeSegmentIndices(out, offset, i, ctx) {
  if (!dashOn(i, ctx)) { // hueco del punteado: triángulos degenerados
    out[offset] = out[offset + 1] = out[offset + 2] = out[offset + 3] = out[offset + 4] = out[offset + 5] = 0;
    return;
  }
  const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
  out[offset] = a; out[offset + 1] = b; out[offset + 2] = c;
  out[offset + 3] = b; out[offset + 4] = d; out[offset + 5] = c;
}

// ── Catmull-Rom centrípeta ──
const _a1 = new THREE.Vector3(), _a2 = new THREE.Vector3(), _a3 = new THREE.Vector3();
const _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3();

function knot(t, a, b) {
  return t + Math.max(Math.sqrt(a.distanceTo(b)), 1e-6); // alpha = 0.5 (centrípeta)
}
function lerpK(out, a, b, t0, t1, t) {
  const k = (t - t0) / (t1 - t0);
  return out.copy(a).multiplyScalar(1 - k).addScaledVector(b, k);
}
/** Punto de la curva entre p1 y p2 (u ∈ [0,1]), usando p0 y p3 de control. */
export function catmullRom(p0, p1, p2, p3, u, out = new THREE.Vector3()) {
  const t0 = 0, t1 = knot(t0, p0, p1), t2 = knot(t1, p1, p2), t3 = knot(t2, p2, p3);
  const t = t1 + (t2 - t1) * u;
  lerpK(_a1, p0, p1, t0, t1, t);
  lerpK(_a2, p1, p2, t1, t2, t);
  lerpK(_a3, p2, p3, t2, t3, t);
  lerpK(_b1, _a1, _a2, t0, t2, t);
  lerpK(_b2, _a2, _a3, t1, t3, t);
  return lerpK(out, _b1, _b2, t1, t2, t);
}

const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
/** Ángulo de giro en `b` entre los tramos a→b y b→c (0 si alguno es nulo). */
function turnAngle(a, b, c) {
  _t1.subVectors(b, a); _t2.subVectors(c, b);
  if (_t1.lengthSq() < 1e-12 || _t2.lengthSq() < 1e-12) return 0;
  return _t1.angleTo(_t2);
}

export function cumulativeLengths(points) {
  const L = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) L[i] = L[i - 1] + points[i].distanceTo(points[i - 1]);
  return L;
}

/** ¿Este trazo necesita el largo acumulado de cada punto? */
function needsLengths(brush) {
  return !!(brush && (brush.taper || brush.dash || brush.texture));
}

/**
 * Construye la geometría de cinta para una lista de puntos 3D.
 * Exportada aparte para poder probarla sin crear un motor completo.
 *
 * opts.widths     — factor de presión por punto, opcional.
 * opts.faceNormal — si viene, la cinta queda APOYADA en el plano con esa normal.
 * opts.normals    — normal por punto (Vector3 o null), para trazos sobre superficies.
 * opts.brush      — receta de pincel (drawing/brushes.js), opcional.
 * opts.nib        — eje de la punta de caligrafía (Vector3), opcional.
 */
export function buildRibbonGeometry(points, width, cameraPosition, opts = {}) {
  const { widths = null, faceNormal = null, normals = null, brush = null, nib = null } = opts;
  const n = points.length;
  if (n < 2) return null;
  const lengths = needsLengths(brush) ? cumulativeLengths(points) : null;
  const ctx = { width, cameraPosition, faceNormal, normals, brush, nib, widths, lengths, total: lengths ? lengths[n - 1] : null };

  const positions = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) writeRibbonPair(positions, i * 6, points, i, ctx);

  const IndexArray = n * 2 > 65535 ? Uint32Array : Uint16Array;
  const indices = new IndexArray((n - 1) * 6);
  for (let i = 0; i < n - 1; i++) writeSegmentIndices(indices, i * 6, i, ctx);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (needsUV(brush)) {
    const uvs = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) writeUV(uvs, i, ctx);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  }
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  // Sin normales: los trazos usan MeshBasicMaterial (no reaccionan a la luz)
  geo.computeBoundingSphere();
  return geo;
}

export function createStrokeEngine(scene, camera) {
  let current = null;
  const finished = []; // trazos ya terminados (la escena sigue siendo la verdad: ver save-load.js)

  /**
   * @param {Object} [o]
   * @param {Object|string} [o.brush] - receta o id de pincel (drawing/brushes.js)
   * @param {THREE.Vector3|number[]} [o.nib] - eje de la punta (pinceles de caligrafía)
   * @param {boolean} [o.smooth=false] - interpolar curvas entre los puntos (trazo a mano)
   * @param {THREE.Vector3} [o.normal] - normal de superficie del primer punto
   */
  function startStroke(point, {
    color = 0xffffff, width = 0.03, meta = null, pressure = 1, faceNormal = null,
    brush = null, nib = null, smooth = false, normal = null,
  } = {}) {
    const b = typeof brush === 'string' ? getBrush(brush) : brush;
    const nibVec = b && b.nib && nib ? (Array.isArray(nib) ? new THREE.Vector3().fromArray(nib) : nib.clone()).normalize() : null;
    const n0 = normal ? normal.clone().normalize() : null;
    current = {
      // puntos que se DIBUJAN (ya interpolados si smooth)
      points: [point.clone()], widths: [pressure], lengths: [0], normals: [n0],
      // puntos crudos (solo con smooth)
      raw: smooth ? [{ p: point.clone(), w: pressure, n: n0 }] : null,
      committed: 1, committedSeg: -1,
      hasNormals: !!n0,
      color, width, meta, brush: b, nib: nibVec,
      faceNormal: faceNormal ? faceNormal.clone().normalize() : null,
      mesh: null, cap: 0, positions: null, indices: null, uvs: null,
      variable: pressure !== 1,
    };
  }

  function ctxOf(c, final) {
    return {
      width: c.width, cameraPosition: camera.position, faceNormal: c.faceNormal, brush: c.brush, nib: c.nib,
      normals: c.hasNormals ? c.normals : null,
      widths: c.variable ? c.widths : null, lengths: c.lengths, total: final ? c.lengths[c.lengths.length - 1] : null,
    };
  }

  /** Crece los buffers del trazo en vivo (al doble) cuando se llenan. */
  function ensureCapacity(c, nPoints) {
    if (nPoints <= c.cap) return null;
    let cap = c.cap || INITIAL_CAPACITY;
    while (cap < nPoints) cap *= 2;
    const positions = new Float32Array(cap * 6);
    const indices = new Uint32Array((cap - 1) * 6);
    const uvs = needsUV(c.brush) ? new Float32Array(cap * 4) : null;
    if (c.positions) { positions.set(c.positions); indices.set(c.indices); if (uvs) uvs.set(c.uvs); }
    c.positions = positions; c.indices = indices; c.uvs = uvs; c.cap = cap;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    if (uvs) geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(indices, 1).setUsage(THREE.DynamicDrawUsage));
    if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = geo; }
    return geo;
  }

  function pushRender(c, p, w, n) {
    const last = c.points[c.points.length - 1];
    c.lengths.push(c.lengths[c.lengths.length - 1] + last.distanceTo(p));
    c.points.push(p);
    c.widths.push(w);
    c.normals.push(n);
  }

  function truncateRender(c, count) {
    c.points.length = count; c.widths.length = count; c.lengths.length = count; c.normals.length = count;
  }

  /** Agrega los puntos interpolados del tramo crudo s → s+1 (sin el punto inicial, que ya está). */
  function appendSpline(c, s) {
    const R = c.raw;
    const a = R[Math.max(0, s - 1)], b = R[s], d = R[s + 1], e = R[Math.min(R.length - 1, s + 2)];
    // Subdividir según cuánto GIRA el trazo en este tramo, no solo por largo:
    // con el lápiz (muestras muy juntas y casi alineadas) un tramo recto no
    // gana nada con más puntos — solo engorda el archivo. Las esquinas sí.
    const segLen = b.p.distanceTo(d.p);
    const turn = Math.max(turnAngle(a.p, b.p, d.p), turnAngle(b.p, d.p, e.p));
    const byAngle = Math.ceil(turn / 0.1);            // ~6° por subdivisión
    const byLength = Math.ceil(segLen / (c.width * 0.4));
    const steps = Math.max(1, Math.min(24, byAngle, byLength));
    for (let k = 1; k <= steps; k++) {
      const u = k / steps;
      const p = k === steps ? d.p.clone() : catmullRom(a.p, b.p, d.p, e.p, u);
      const w = b.w + (d.w - b.w) * u;
      let n = null;
      if (b.n && d.n) n = b.n.clone().lerp(d.n, u).normalize();
      else n = k === steps ? d.n : (u < 0.5 ? b.n : d.n);
      pushRender(c, p, w, n);
    }
  }

  function addPoint(point, pressure = 1, normal = null) {
    if (!current) return;
    const c = current;
    const lastP = c.raw ? c.raw[c.raw.length - 1].p : c.points[c.points.length - 1];
    if (lastP.distanceTo(point) < c.width * MIN_SEGMENT_LENGTH_FACTOR) return;
    const n = normal ? normal.clone().normalize() : null;
    if (n) c.hasNormals = true;
    // Si la presión empieza a variar a mitad de trazo, se reescribe todo una vez
    const becameVariable = pressure !== 1 && !c.variable;
    if (becameVariable) c.variable = true;

    if (!c.raw) {
      pushRender(c, point.clone(), pressure, n);
      updateLiveMesh(c, becameVariable, c.points.length - 2);
      return;
    }

    // ── Con curvas: confirmar los tramos que ya tienen sus 4 puntos de
    // control y rehacer solo el último (provisorio) ──
    c.raw.push({ p: point.clone(), w: pressure, n });
    const m = c.raw.length;
    const firstChanged = c.committed; // desde acá cambian los puntos dibujados
    truncateRender(c, c.committed);
    for (let s = c.committedSeg + 1; s <= m - 3; s++) {
      appendSpline(c, s);
      c.committedSeg = s;
    }
    c.committed = c.points.length;
    appendSpline(c, m - 2); // tramo final provisorio (se recalcula con el próximo punto)
    updateLiveMesh(c, becameVariable, firstChanged - 1);
  }

  /** @param {number} fromIdx primer punto dibujado cuyo par de vértices cambió */
  function updateLiveMesh(c, rewriteAll, fromIdx) {
    const n = c.points.length;
    if (n < 2) return;
    const newGeo = ensureCapacity(c, n);
    const ctx = ctxOf(c, false);
    const full = rewriteAll || !c.mesh || !!newGeo;
    // El par del punto anterior también cambia (su dirección ahora apunta al nuevo)
    const from = full ? 0 : Math.max(0, Math.min(fromIdx, n - 2));

    for (let i = from; i < n; i++) writeRibbonPair(c.positions, i * 6, c.points, i, ctx);
    for (let i = from; i < n - 1; i++) writeSegmentIndices(c.indices, i * 6, i, ctx);
    if (c.uvs) for (let i = from; i < n; i++) writeUV(c.uvs, i, ctx);

    if (!c.mesh) {
      c.mesh = new THREE.Mesh(newGeo, createBrushMaterial(c.brush, c.color));
      c.mesh.frustumCulled = false; // la esfera envolvente cambia en cada punto
      if (c.meta) c.mesh.userData.layerId = c.meta.layerId;
      scene.add(c.mesh);
    }

    const geo = c.mesh.geometry;
    const attrs = [geo.getAttribute('position'), geo.getIndex()];
    const uvAttr = geo.getAttribute('uv');
    if (uvAttr) attrs.push(uvAttr);
    attrs.forEach((a) => a.clearUpdateRanges());
    if (!full) {
      // Subir a la GPU solo el tramo que cambió
      attrs[0].addUpdateRange(from * 6, (n - from) * 6);
      attrs[1].addUpdateRange(from * 6, (n - 1 - from) * 6);
      if (uvAttr) uvAttr.addUpdateRange(from * 4, (n - from) * 4);
    }
    attrs.forEach((a) => { a.needsUpdate = true; });
    geo.setDrawRange(0, (n - 1) * 6);
  }

  /** Descarta el trazo en curso sin dejar rastro (ej: era el primer dedo de un gesto de navegación). */
  function cancelStroke() {
    if (!current) return;
    if (current.mesh) {
      scene.remove(current.mesh);
      current.mesh.geometry.dispose();
      current.mesh.material.dispose();
    }
    current = null;
  }

  function endStroke() {
    const done = current;
    current = null;
    if (done && done.mesh) {
      // Geometría final compacta, con la punta final ya afinada
      const geo = buildRibbonGeometry(done.points, done.width, camera.position, {
        widths: done.variable ? done.widths : null,
        faceNormal: done.faceNormal, brush: done.brush, nib: done.nib,
        normals: done.hasNormals ? done.normals : null,
      });
      // Pivote en el centroide del trazo: escalar/rotar gira sobre el
      // trazo mismo. userData.strokePoints sigue en coordenadas ORIGINALES.
      const centroid = centroidOf(done.points);
      geo.translate(-centroid.x, -centroid.y, -centroid.z);
      done.mesh.geometry.dispose();
      done.mesh.geometry = geo;
      done.mesh.position.copy(centroid);
      done.mesh.frustumCulled = true;

      const ud = done.mesh.userData;
      ud.strokePoints = done.points.map((p) => p.toArray());
      ud.strokeWidth = done.width;
      ud.strokeColor = typeof done.color === 'string'
        ? done.color.toLowerCase()
        : '#' + new THREE.Color(done.color).getHexString();
      if (done.variable) ud.strokePressures = done.widths.map((w) => +w.toFixed(3));
      if (done.faceNormal) ud.strokeFaceNormal = done.faceNormal.toArray();
      if (done.brush) ud.brush = done.brush.id;
      if (done.nib) ud.strokeNib = done.nib.toArray().map((v) => +v.toFixed(5));
      if (done.hasNormals) ud.strokeNormals = done.normals.map((n) => (n ? n.toArray().map((v) => +v.toFixed(4)) : null));
      finished.push({ mesh: done.mesh });
    }
    return done;
  }

  function isDrawing() {
    return current !== null;
  }

  return { startStroke, addPoint, endStroke, cancelStroke, isDrawing, finished };
}

export function centroidOf(points) {
  const c = new THREE.Vector3();
  points.forEach((p) => c.add(p));
  return c.divideScalar(points.length);
}
