// node tests/export.test.js — exportación 3D (GLB / OBJ / USDZ)
import * as THREE from '../js/vendor/three.module.js';
import { createStrokeEngine } from '../js/drawing/stroke-engine.js';
import { placePrimitive } from '../js/drawing/primitives.js';
import { mirrorObjects } from '../js/drawing/object-actions.js';
import { createReferenceMesh } from '../js/drawing/references.js';
import { exportableObjects, buildExportScene, export3D } from '../js/persistence/export.js';

// Node no trae FileReader (lo usa GLTFExporter para armar el binario)
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend && this.onloadend(); this.onload && this.onload({ target: this }); }); }
    readAsDataURL(blob) { blob.arrayBuffer().then((b) => { this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`; this.onloadend && this.onloadend(); this.onload && this.onload({ target: this }); }); }
  };
}

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
function approx(a, b, eps = 1e-4) { return Math.abs(a - b) < eps; }

const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, 1, 0.01, 100);
cam.position.set(0, 0, 5);
const eng = createStrokeEngine(scene, cam);
eng.startStroke(new THREE.Vector3(0, 0, 0), { width: 0.05, color: '#ff0000', brush: 'ink', meta: { layerId: 'L' } });
for (let i = 1; i <= 20; i++) eng.addPoint(new THREE.Vector3(i * 0.05, Math.sin(i / 3) * 0.2, 0));
const stroke = eng.endStroke().mesh;
stroke.position.x += 2; // movido después de dibujar
const neon = (() => {
  eng.startStroke(new THREE.Vector3(0, 1, 0), { width: 0.05, color: '#00ffaa', brush: 'neon', meta: { layerId: 'L' } });
  for (let i = 1; i <= 10; i++) eng.addPoint(new THREE.Vector3(i * 0.1, 1, 0));
  return eng.endStroke().mesh;
})();
const cube = placePrimitive(scene, 'cube', new THREE.Vector3(0, -1, 0), { color: '#3366ff', layerId: 'L', record: false });
const hidden = placePrimitive(scene, 'sphere', new THREE.Vector3(5, 5, 5), { layerId: 'L', record: false });
hidden.visible = false;
const ref = createReferenceMesh({ src: 'data:image/png;base64,AAAA', width: 10, height: 10, layerId: 'L' });
scene.add(ref);
scene.add(new THREE.GridHelper(10, 10)); // no debe exportarse

// ── Qué entra ──
let objs = exportableObjects(scene);
assert(objs.length === 3 && objs.includes(stroke) && objs.includes(neon) && objs.includes(cube), 'por defecto: trazos y figuras visibles');
assert(!objs.includes(hidden) && !objs.includes(ref), 'sin lo oculto ni las referencias');
assert(exportableObjects(scene, { includeHidden: true }).includes(hidden), 'con "capas ocultas" entra lo oculto');
assert(exportableObjects(scene, { selection: [cube.uuid] }).length === 1, 'solo lo seleccionado');
assert(exportableObjects(scene, { includeReferences: true }).includes(ref), 'referencias, si se piden');

// ── Escena de exportación: transformación horneada ──
const root = buildExportScene(objs, 'gltf');
const sm = root.children[0];
sm.geometry.computeBoundingBox();
stroke.geometry.computeBoundingBox();
assert(sm.position.equals(new THREE.Vector3()) && approx(sm.geometry.boundingBox.min.x, stroke.geometry.boundingBox.min.x + stroke.position.x, 1e-5),
  'la posición del objeto queda aplicada a la geometría');
assert(sm.material.isMeshBasicMaterial && sm.material.color.getHexString() === 'ff0000', 'trazo: material sin luz con su color real');
assert(root.children[2].material.isMeshStandardMaterial, 'figura: material estándar (reacciona a la luz)');
assert(buildExportScene(objs, 'usdz').children[0].material.isMeshStandardMaterial &&
  buildExportScene(objs, 'usdz').children[0].material.emissive.getHexString() === 'ff0000', 'USDZ: trazo como color emitido');

// Espejado: el orden de los triángulos se invierte (si no, las caras quedan al revés)
const mir = placePrimitive(new THREE.Scene(), 'cone', new THREE.Vector3(), { record: false });
const idx0 = Array.from(mir.geometry.index.array.slice(0, 3));
mirrorObjects([mir]);
const mm = buildExportScene([mir], 'gltf').children[0];
const idx1 = Array.from(mm.geometry.index.array.slice(0, 3));
assert(idx1[0] === idx0[0] && idx1[1] === idx0[2] && idx1[2] === idx0[1], 'objeto espejado: triángulos con el orden corregido');

// ── GLB real ──
let saved = null;
const save = (data, name, type) => { saved = { data, name, type }; };
const glb = await export3D(scene, 'glb', {}, { save, filename: 'prueba' });
assert(saved.name === 'prueba.glb' && saved.type === 'model/gltf-binary', 'descarga prueba.glb');
const buf = Buffer.from(saved.data);
assert(buf.toString('ascii', 0, 4) === 'glTF' && buf.readUInt32LE(4) === 2, 'GLB válido (encabezado glTF v2)');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
assert(gltf.meshes.length === 3 && glb.count === 3, `3 mallas (hay ${gltf.meshes.length})`);
assert((gltf.extensionsUsed || []).includes('KHR_materials_unlit'), 'usa materiales sin luz para los trazos');
const strokeMesh = gltf.meshes.find((m, i) => gltf.nodes.some((n) => n.mesh === i && n.name.startsWith('trazo')));
const posAcc = gltf.accessors[strokeMesh.primitives[0].attributes.POSITION];
assert(posAcc.count === stroke.geometry.getAttribute('position').count, 'misma cantidad de vértices que el trazo original');
assert(approx(posAcc.min[0], stroke.geometry.boundingBox.min.x + stroke.position.x, 1e-4), 'en la posición movida (pivote en el centro + desplazamiento)');
assert(gltf.materials.some((m) => m.doubleSided), 'caras de doble lado (las cintas se ven de los dos lados)');

// ── OBJ ──
await export3D(scene, 'obj', {}, { save });
const vLines = saved.data.split('\n').filter((l) => l.startsWith('v ')).length;
const expected = objs.reduce((s, o) => s + o.geometry.getAttribute('position').count, 0);
assert(saved.name === 'dibujo.obj' && vLines === expected, `OBJ con todos los vértices (${vLines}/${expected})`);

// ── USDZ ──
await export3D(scene, 'usdz', {}, { save });
const z = Buffer.from(saved.data);
assert(saved.name === 'dibujo.usdz' && z.toString('ascii', 0, 2) === 'PK', 'USDZ (zip) válido');
assert(z.toString('latin1').includes('.usda'), 'con la escena USD adentro');
const usdTrazo = buildExportScene([stroke], 'usdz').children[0];
assert(usdTrazo.material.side === THREE.FrontSide && usdTrazo.geometry.index.count === stroke.geometry.index.count * 2,
  'USDZ: las cintas llevan las caras duplicadas al revés (USD no tiene doble lado)');

// ── Vacío ──
let threw = false;
try { await export3D(new THREE.Scene(), 'glb', {}, { save }); } catch (e) { threw = e.message === 'No hay nada para exportar'; }
assert(threw, 'sin nada que exportar, avisa (no descarga un archivo vacío)');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
