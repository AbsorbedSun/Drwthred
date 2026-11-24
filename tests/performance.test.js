// node tests/performance.test.js — alarmas de rendimiento (márgenes amplios a
// propósito: no miden exacto, avisan si algo vuelve a escalar mal)
import * as THREE from '../js/vendor/three.module.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { hitTestAt, objectsInLasso } from '../js/drawing/selection.js';
import { serializeProject } from '../js/persistence/save-load.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
const ms = (fn, n = 1) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t) / n; };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1.4, 0.01, 100);
camera.position.set(3, 2, 5); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
const eng = createStrokeEngine(scene, camera);

// ── Trazo en vivo: el costo por punto NO crece con el largo del trazo ──
eng.startStroke(new THREE.Vector3(), { width: 0.01, brush: 'ink', smooth: true });
const per = [];
let p = new THREE.Vector3();
for (let block = 0; block < 6; block++) {
  per.push(ms(() => { p = p.clone().add(new THREE.Vector3(0.01, Math.sin(p.x * 9) * 0.01, 0.003)); eng.addPoint(p, 0.8); }, 500));
}
eng.endStroke();
assert(per[5] < per[0] * 3 + 0.05, `costo por punto estable: primeros 500 ${per[0].toFixed(3)} ms, últimos 500 ${per[5].toFixed(3)} ms`);

// ── Escena grande ──
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let s = 0; s < 800; s++) {
  const c = new THREE.Vector3((rnd() - 0.5) * 6, (rnd() - 0.5) * 3, (rnd() - 0.5) * 6);
  const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.02);
  eng.startStroke(c.clone(), { width: 0.02, meta: { layerId: 'layer-1' } });
  for (let i = 1; i < 60; i++) { c.add(d); eng.addPoint(c.clone()); }
  eng.endStroke();
}
const tap = ms((i) => hitTestAt(scene, camera, (i % 10) / 10 - 0.5, 0.1), 20);
assert(tap < 16, `tocar con 800 trazos: ${tap.toFixed(2)} ms (< 16 ms, un fotograma)`);
const sq = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]].map(([x, y]) => ({ x, y }));
const lasso = ms(() => objectsInLasso(scene, camera, sq), 2);
assert(lasso < 150, `lazo con 800 trazos: ${lasso.toFixed(1)} ms`);

// ── Guardado: coordenadas redondeadas ──
let json = '';
const save = ms(() => { json = JSON.stringify(serializeProject(scene)); }, 2);
assert(save < 300, `guardar 800 trazos: ${save.toFixed(1)} ms`);
const data = JSON.parse(json);
const decimals = Math.max(...data.strokes.slice(0, 50).flatMap((s) => s.points.flat().map((v) => (String(v).split('.')[1] || '').length)));
assert(decimals <= 4, `coordenadas con a lo sumo 4 decimales (máx. ${decimals})`);
const kbPerStroke = json.length / 1024 / data.strokes.length;
assert(kbPerStroke < 2.5, `tamaño por trazo de 60 puntos: ${kbPerStroke.toFixed(2)} KB`);

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
