// node tests/brushes.test.js
import * as THREE from '../js/vendor/three.module.js';
import { BRUSHES, getBrush, widthFactor, dashOn, needsUV } from '../js/drawing/brushes.js';
import { buildRibbonGeometry, createStrokeEngine, cumulativeLengths } from '../js/drawing/stroke-engine.js';
import { erasePartial } from '../js/drawing/eraser.js';
import { serializeProject, loadProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

const cam = new THREE.Vector3(0, 0, 5);
const line = (n = 60, len = 2) => Array.from({ length: n }, (_, i) => new THREE.Vector3(-len / 2 + (len * i) / (n - 1), 0, 0));
/** Ancho real de la cinta en el punto i (distancia entre su par de vértices). */
function widthAt(geo, i) {
  const p = geo.getAttribute('position');
  return new THREE.Vector3().fromBufferAttribute(p, i * 2).distanceTo(new THREE.Vector3().fromBufferAttribute(p, i * 2 + 1));
}

// ── Catálogo ──
assert(BRUSHES.length >= 9, `hay al menos 9 pinceles (hay ${BRUSHES.length})`);
assert(new Set(BRUSHES.map((b) => b.id)).size === BRUSHES.length, 'los ids son únicos');
assert(getBrush('no-existe').id === 'pencil', 'un id desconocido cae al pincel por defecto');
assert(getBrush('airbrush').id === 'watercolor', 'el id viejo "airbrush" se mapea a acuarela');

// ── Todos los pinceles construyen geometría válida ──
BRUSHES.forEach((b) => {
  const geo = buildRibbonGeometry(line(), b.width, cam, { brush: b, widths: line().map(() => 0.9), nib: b.nib ? new THREE.Vector3(1, 1, 0).normalize() : null });
  const pos = geo.getAttribute('position').array;
  assert(pos.every(Number.isFinite), `${b.id}: vértices finitos`);
  assert(!!geo.getAttribute('uv') === needsUV(b), `${b.id}: UVs solo si tiene textura`);
});

// ── Afinado de puntas ──
{
  const ink = getBrush('ink');
  const geo = buildRibbonGeometry(line(), ink.width, cam, { brush: ink });
  const mid = widthAt(geo, 30), start = widthAt(geo, 0), end = widthAt(geo, 59);
  assert(start < mid * 0.2 && end < mid * 0.2, `tinta: las puntas se afinan (inicio=${start.toFixed(4)}, medio=${mid.toFixed(4)}, fin=${end.toFixed(4)})`);
  assert(approx(mid, ink.width, 1e-6), 'tinta: en el medio, el grosor nominal');
  const marker = getBrush('marker');
  const gm = buildRibbonGeometry(line(), marker.width, cam, { brush: marker });
  assert(approx(widthAt(gm, 0), widthAt(gm, 30), 1e-6), 'marcador: sin afinado, ancho parejo');
}

// ── Presión según el pincel ──
{
  const ctx = (b) => ({ brush: b, widths: [1.6], lengths: null, width: 1 });
  assert(widthFactor(0, ctx(getBrush('marker'))) === 1, 'marcador: ignora la presión');
  assert(widthFactor(0, ctx(getBrush('ink'))) > widthFactor(0, ctx(getBrush('pencil'))), 'tinta responde a la presión más que el lápiz');
  assert(widthFactor(0, { brush: null, widths: [0.4], lengths: null, width: 1 }) === 0.4, 'sin pincel (trazos viejos): la presión se aplica tal cual');
}

// ── Caligrafía: el grosor depende de la dirección ──
{
  const cal = getBrush('calligraphy');
  const nib = new THREE.Vector3(1, 1, 0).normalize();
  const along = buildRibbonGeometry(line(20).map((p) => new THREE.Vector3(p.x, p.x, 0)), cal.width, cam, { brush: cal, nib });
  const across = buildRibbonGeometry(line(20).map((p) => new THREE.Vector3(p.x, -p.x, 0)), cal.width, cam, { brush: cal, nib });
  assert(widthAt(along, 10) < widthAt(across, 10) * 0.3, `caligrafía: paralelo a la punta = fino, perpendicular = grueso (${widthAt(along, 10).toFixed(4)} vs ${widthAt(across, 10).toFixed(4)})`);
}

// ── Punteado: hay huecos (segmentos degenerados) ──
{
  const dashed = getBrush('dashed');
  const pts = line(200, 2);
  const geo = buildRibbonGeometry(pts, dashed.width, cam, { brush: dashed });
  const idx = geo.getIndex().array;
  let gaps = 0;
  for (let s = 0; s < idx.length; s += 6) if (idx[s] === idx[s + 1] && idx[s + 1] === idx[s + 2]) gaps++;
  const ratio = gaps / (pts.length - 1);
  const [on, off] = dashed.dash;
  assert(approx(ratio, off / (on + off), 0.08), `punteado: proporción de huecos ≈ ${(off / (on + off)).toFixed(2)} (dio ${ratio.toFixed(2)})`);
  const L = cumulativeLengths(pts);
  assert(dashOn(0, { brush: dashed, lengths: L, width: dashed.width }), 'punteado: arranca con trazo, no con hueco');
}

// ── UVs a lo largo del trazo (texturas) ──
{
  const chalk = getBrush('chalk');
  const geo = buildRibbonGeometry(line(), chalk.width, cam, { brush: chalk });
  const uv = geo.getAttribute('uv');
  assert(uv.getX(0) === 0 && uv.getX(59) > uv.getX(30) && uv.getY(0) === 0 && uv.getY(1) === 1, 'tiza: u crece a lo largo, v cruza el ancho');
}

// ── Motor: trazo en vivo con pincel = geometría final (salvo la punta final) ──
{
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
  camera.position.copy(cam);
  const engine = createStrokeEngine(scene, camera);
  const pts = line(60); // separación 0.034 > mínimo (0.35 × 0.05): no se descarta ninguno
  engine.startStroke(pts[0], { width: 0.05, brush: 'chalk', color: '#ffcc00' });
  pts.slice(1).forEach((p) => engine.addPoint(p));
  const liveUV = scene.children[0].geometry.getAttribute('uv').array.slice(0, 240);
  const done = engine.endStroke();
  const finalUV = done.mesh.geometry.getAttribute('uv').array;
  let diff = 0;
  assert(finalUV.length === 240, 'la geometría final tiene los 60 puntos');
  for (let i = 0; i < 240; i++) diff = Math.max(diff, Math.abs(liveUV[i] - finalUV[i]));
  assert(diff < 1e-5, 'UVs en vivo = UVs finales');
  assert(done.mesh.userData.brush === 'chalk', 'el trazo recuerda su pincel');
  assert(done.mesh.material.alphaTest === 0.5, 'tiza: material con grano (alphaTest)');

  engine.startStroke(pts[0], { width: 0.05, brush: 'neon' });
  pts.slice(1).forEach((p) => engine.addPoint(p));
  const neon = engine.endStroke().mesh;
  assert(neon.material.blending === THREE.AdditiveBlending && neon.material.depthWrite === false, 'neón: mezcla aditiva');

  engine.startStroke(pts[0], { width: 0.05, brush: 'calligraphy', nib: [1, 1, 0] });
  pts.slice(1).forEach((p) => engine.addPoint(p));
  const cal = engine.endStroke().mesh;
  assert(cal.userData.strokeNib && approx(cal.userData.strokeNib[0], Math.SQRT1_2), 'caligrafía: guarda el eje de la punta');

  // Guardar/cargar conserva pincel y punta
  const data = JSON.parse(JSON.stringify(serializeProject(scene)));
  assert(data.strokes.map((s) => s.brush).join() === 'chalk,neon,calligraphy', 'se guardan los pinceles');
  const scene2 = new THREE.Scene();
  loadProject(scene2, createStrokeEngine(scene2, camera), data);
  const loaded = scene2.children.filter((o) => o.userData.strokePoints);
  assert(loaded.map((m) => m.userData.brush).join() === 'chalk,neon,calligraphy', 'al cargar vuelven con su pincel');
  assert(loaded[1].material.blending === THREE.AdditiveBlending, 'y con su material');
  const w0 = widthAt(cal.geometry, 30), w1 = widthAt(loaded[2].geometry, 30);
  assert(approx(w0, w1, 1e-6), 'y con la misma forma (punta de caligrafía incluida)');

  // Goma parcial: los pedazos conservan el pincel
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const only = new THREE.Scene();
  const e2 = createStrokeEngine(only, camera);
  e2.startStroke(pts[0], { width: 0.05, brush: 'dashed' });
  pts.slice(1).forEach((p) => e2.addPoint(p));
  e2.endStroke();
  erasePartial(only, camera, 0.013, 0, 0.15);
  const pieces = only.children.filter((o) => o.userData.strokePoints);
  assert(pieces.length === 2 && pieces.every((m) => m.userData.brush === 'dashed'), 'los pedazos borrados siguen siendo punteados');
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
