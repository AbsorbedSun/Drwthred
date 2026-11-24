// ============================================================================
// STROKE ENGINE — construye la geometría visible de un trazo a partir de
// una secuencia de puntos 3D. Usa una CINTA (triangle strip) que gira para
// mirar siempre hacia la cámara en cada segmento — a diferencia de
// THREE.Line, esto da control real sobre el grosor y se ve bien desde
// cualquier ángulo, en vez de desaparecer al mirarlo de canto.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

const MIN_SEGMENT_LENGTH_FACTOR = 0.35; // fracción del grosor: evita puntos degenerados

/**
 * Construye la geometría de cinta para una lista de puntos 3D.
 * Exportada aparte para poder probarla sin crear un motor completo.
 *
 * opts.widths     — factor de grosor por punto (presión del lápiz), opcional.
 * opts.faceNormal — si viene, la cinta queda APOYADA en el plano con esa
 *                   normal (trazo "pintado" sobre un plano fijo, como en
 *                   Feather) en vez de girar para mirar a la cámara.
 */
export function buildRibbonGeometry(points, width, cameraPosition, opts = {}) {
  const { widths = null, faceNormal = null } = opts;
  const n = points.length;
  if (n < 2) return null;

  const positions = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const dir = new THREE.Vector3();
    if (i < n - 1) dir.subVectors(points[i + 1], p);
    else dir.subVectors(p, points[i - 1]);
    dir.normalize();

    const toCam = faceNormal
      ? faceNormal.clone().normalize()
      : new THREE.Vector3().subVectors(cameraPosition, p).normalize();
    let side = new THREE.Vector3().crossVectors(dir, toCam);
    if (side.lengthSq() < 1e-8) {
      // dir y toCam casi paralelos (cámara mirando justo por el eje del
      // trazo) — usamos el "up" de la cámara como respaldo para no
      // degenerar en un segmento de ancho cero.
      side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0));
      if (side.lengthSq() < 1e-8) side = new THREE.Vector3(1, 0, 0);
    }
    const w = widths && widths[i] != null ? width * widths[i] : width;
    side.normalize().multiplyScalar(w / 2);

    const left = new THREE.Vector3().addVectors(p, side);
    const right = new THREE.Vector3().subVectors(p, side);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
  }

  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createStrokeEngine(scene, camera) {
  let current = null; // { points, color, width, mesh }
  const finished = []; // trazos ya terminados, agregados a la escena

  function startStroke(point, { color = 0xffffff, width = 0.03, meta = null, pressure = 1, faceNormal = null } = {}) {
    current = {
      points: [point.clone()], widths: [pressure], color, width, meta,
      faceNormal: faceNormal ? faceNormal.clone().normalize() : null, mesh: null,
    };
  }

  function addPoint(point, pressure = 1) {
    if (!current) return;
    const last = current.points[current.points.length - 1];
    if (last.distanceTo(point) < current.width * MIN_SEGMENT_LENGTH_FACTOR) return;
    current.points.push(point.clone());
    current.widths.push(pressure);
    rebuildCurrentMesh();
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

  function hasVariableWidth(c) {
    return c.widths.some((w) => w !== 1);
  }

  function rebuildCurrentMesh() {
    const geo = buildRibbonGeometry(current.points, current.width, camera.position, {
      widths: hasVariableWidth(current) ? current.widths : null,
      faceNormal: current.faceNormal,
    });
    if (!geo) return;
    if (current.mesh) {
      current.mesh.geometry.dispose();
      current.mesh.geometry = geo;
    } else {
      const mat = new THREE.MeshBasicMaterial({ color: current.color, side: THREE.DoubleSide });
      current.mesh = new THREE.Mesh(geo, mat);
      if (current.meta) current.mesh.userData.layerId = current.meta.layerId;
      scene.add(current.mesh);
    }
  }

  function endStroke() {
    const done = current;
    current = null;
    if (done && done.mesh) {
      // Centrar el pivote en el propio centroide del trazo — hasta acá
      // la geometría se construía en coordenadas absolutas del mundo con
      // mesh.position siempre en (0,0,0). Eso funciona para dibujar, pero
      // escalar o rotar así saldría disparado desde el origen del mundo
      // en vez de girar sobre el trazo mismo. Centrar la GEOMETRÍA y
      // mover el mesh.position al centroide arregla eso sin tocar
      // userData.strokePoints (que sigue guardando coordenadas absolutas
      // — de eso depende el guardado/carga, no debe cambiar).
      const centroid = new THREE.Vector3();
      done.points.forEach((p) => centroid.add(p));
      centroid.divideScalar(done.points.length);
      done.mesh.geometry.translate(-centroid.x, -centroid.y, -centroid.z);
      done.mesh.position.copy(centroid);

      // Se completa acá, no en cada punto mientras se dibuja — hasta que
      // no termina el trazo no hace falta que sea serializable. Guardar
      // esto en userData (en vez de solo en `finished`) es lo que permite
      // que persistence/save-load.js lea directo de scene.children sin
      // acoplarse a este módulo — un trazo deshecho sigue en `finished`
      // pero ya no en la escena, así que la escena es la verdad real.
      done.mesh.userData.strokePoints = done.points.map((p) => p.toArray());
      done.mesh.userData.strokeWidth = done.width;
      done.mesh.userData.strokeColor = '#' + done.mesh.material.color.getHexString();
      if (hasVariableWidth(done)) done.mesh.userData.strokePressures = done.widths.map((w) => +w.toFixed(3));
      if (done.faceNormal) done.mesh.userData.strokeFaceNormal = done.faceNormal.toArray();
      finished.push(done);
    }
    return done;
  }

  function isDrawing() {
    return current !== null;
  }

  return { startStroke, addPoint, endStroke, cancelStroke, isDrawing, finished };
}
