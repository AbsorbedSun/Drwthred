// ============================================================================
// EXPORT — sacar el dibujo de la app:
//
//  · 3D: GLB (Blender, visores web, realidad aumentada en Android), OBJ
//    (compatibilidad máxima, solo geometría) y USDZ (realidad aumentada en
//    iPhone/iPad con Quick Look).
//  · Imagen PNG: a 1×/2×/4× de la pantalla, con fondo transparente opcional.
//
// Para 3D se arma una escena aparte, solo con lo exportable (trazos y
// figuras visibles; las imágenes de referencia, opcionales), con la
// transformación de cada objeto ya aplicada a la geometría. Los materiales
// se traducen a lo que cada formato entiende:
//   GLB  → trazos "sin luz" (KHR_materials_unlit): se ven igual que en la app
//   USDZ → material estándar que EMITE su color (sin luz no existe en USD)
// Lo que no tiene equivalente (mezcla aditiva del neón, grano de la tiza,
// bordes difusos) sale aproximado como color + transparencia.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

const lazy = {
  gltf: () => import('../vendor/addons/GLTFExporter.js').then((m) => new m.GLTFExporter()),
  obj: () => import('../vendor/addons/OBJExporter.js').then((m) => new m.OBJExporter()),
  usdz: () => import('../vendor/addons/USDZExporter.js').then((m) => new m.USDZExporter()),
};

/**
 * USD no tiene materiales de doble lado: una cinta plana se vería desde un
 * solo lado en realidad aumentada. Se duplica cada cara con el orden
 * invertido (y vértices propios, para que tengan su propia normal).
 */
function doubleSidedGeometry(geo) {
  const g = geo.index ? geo : geo.toNonIndexed();
  const pos = g.getAttribute('position');
  const n = pos.count;
  const out = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 6);
  arr.set(pos.array.subarray(0, n * 3));
  arr.set(pos.array.subarray(0, n * 3), n * 3);
  out.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const uv = g.getAttribute('uv');
  if (uv) { const u = new Float32Array(n * 4); u.set(uv.array.subarray(0, n * 2)); u.set(uv.array.subarray(0, n * 2), n * 2); out.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  const src = g.index ? g.index.array : Array.from({ length: n }, (_, i) => i);
  const idx = new Uint32Array(src.length * 2);
  idx.set(src);
  for (let k = 0; k < src.length; k += 3) {
    idx[src.length + k] = src[k] + n; idx[src.length + k + 1] = src[k + 2] + n; idx[src.length + k + 2] = src[k + 1] + n;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeVertexNormals();
  return out;
}

function realColor(obj) {
  const ud = obj.userData;
  const css = ud.strokeColor || ud.color;
  return new THREE.Color(css || obj.material.color);
}

/** Objetos que entran en la exportación. */
export function exportableObjects(scene, { selection = null, includeHidden = false, includeReferences = false } = {}) {
  const ids = selection ? new Set(selection) : null;
  return scene.children.filter((o) => {
    const ud = o.userData || {};
    const kind = ud.strokePoints || ud.primitiveKind || (includeReferences && ud.reference);
    if (!kind) return false;
    if (!includeHidden && !o.visible) return false;
    return !ids || ids.has(o.uuid);
  });
}

/**
 * Escena lista para exportar: copias con la transformación horneada en la
 * geometría y materiales traducidos al formato `target` ('gltf'|'usdz'|'obj').
 */
export function buildExportScene(objs, target = 'gltf') {
  const root = new THREE.Scene();
  root.name = 'Drwthred';
  objs.forEach((o, i) => {
    o.updateMatrixWorld();
    const geo = o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    // Una matriz con escala negativa (espejar) invierte el orden de los triángulos
    if (o.matrixWorld.determinant() < 0 && geo.index) {
      const idx = geo.index.array;
      for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    }
    if (target === 'usdz' || !geo.getAttribute('normal')) geo.computeVertexNormals();
    const ud = o.userData;
    const color = realColor(o);
    const opacity = Math.min(1, o.material.opacity ?? 1);
    let mat;
    const usd = target === 'usdz';
    const side = usd ? THREE.FrontSide : THREE.DoubleSide;
    const finalGeo = usd ? doubleSidedGeometry(geo) : geo;
    if (ud.reference && o.material.map) {
      mat = new THREE.MeshBasicMaterial({ map: o.material.map, transparent: true, opacity, side });
    } else if (ud.primitiveKind) {
      mat = new THREE.MeshStandardMaterial({ color, side, roughness: 0.8 });
    } else if (target === 'usdz') {
      // USD no tiene "sin luz": color emitido = se ve plano como en la app
      mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, roughness: 1, side,
        transparent: opacity < 1, opacity });
    } else {
      mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: opacity < 1, opacity });
    }
    const solid = ud.primitiveKind && ud.primitiveKind !== 'plane'; // la figura Plano también es plana
    const m = new THREE.Mesh(solid && usd ? geo : finalGeo, mat);
    m.name = ud.primitiveKind ? `${ud.primitiveKind}-${i + 1}` : ud.reference ? `referencia-${i + 1}` : `trazo-${i + 1}`;
    root.add(m);
  });
  return root;
}

function download(data, filename, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** @returns {Promise<{bytes:number, count:number}>} */
export async function export3D(scene, format, opts = {}, { filename = 'dibujo', save = download } = {}) {
  const objs = exportableObjects(scene, opts);
  if (!objs.length) throw new Error('No hay nada para exportar');
  const root = buildExportScene(objs, format === 'obj' ? 'obj' : format === 'usdz' ? 'usdz' : 'gltf');
  let data, type, ext;
  if (format === 'glb') {
    data = await (await lazy.gltf()).parseAsync(root, { binary: true });
    type = 'model/gltf-binary'; ext = 'glb';
  } else if (format === 'obj') {
    data = (await lazy.obj()).parse(root);
    type = 'text/plain'; ext = 'obj';
  } else if (format === 'usdz') {
    data = await (await lazy.usdz()).parseAsync(root);
    type = 'model/vnd.usdz+zip'; ext = 'usdz';
  } else {
    throw new Error(`Formato desconocido: ${format}`);
  }
  save(data, `${filename}.${ext}`, type);
  return { bytes: data.byteLength ?? data.length, count: objs.length, data };
}

/**
 * PNG de lo que se ve, a `scale` veces el tamaño del lienzo, con fondo
 * transparente opcional. Se dibuja fuera de pantalla (render target) y se
 * suaviza dibujando al doble y reduciendo (el render target no tiene
 * antialias). Tope de tamaño según la GPU para no agotar la memoria.
 * @param {Object} o { scale, transparent, hide: [objetos a ocultar] }
 * @returns {Promise<{width:number, height:number}>}
 */
export async function exportPNG(renderer, scene, camera, { scale = 1, transparent = false, hide = [] } = {}, { filename = 'dibujo.png', save = download } = {}) {
  const canvas = renderer.domElement;
  const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
  const maxSide = Math.min(renderer.capabilities.maxTextureSize || 4096, 8192);
  let outW = Math.round(cssW * scale), outH = Math.round(cssH * scale);
  const fit = Math.min(1, maxSide / Math.max(outW, outH));
  outW = Math.round(outW * fit); outH = Math.round(outH * fit);
  const ss = Math.min(2, maxSide / Math.max(outW, outH)); // supersampling (antialias)
  const W = Math.max(1, Math.round(outW * ss)), H = Math.max(1, Math.round(outH * ss));

  const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const prevBg = scene.background;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  const prevVis = hide.map((o) => o.visible);
  hide.forEach((o) => { o.visible = false; });
  const bgColor = prevBg && prevBg.isColor ? prevBg.clone() : new THREE.Color(0x1a1815);
  if (transparent) scene.background = null;
  renderer.setClearColor(bgColor, transparent ? 0 : 1);
  const pixels = new Uint8Array(W * H * 4);
  try {
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, pixels);
  } finally {
    renderer.setRenderTarget(null);
    scene.background = prevBg;
    renderer.setClearColor(prevClear, prevAlpha);
    hide.forEach((o, i) => { o.visible = prevVis[i]; });
    rt.dispose();
  }

  // Las filas vienen de abajo hacia arriba: invertir al pasar a un canvas
  const big = document.createElement('canvas');
  big.width = W; big.height = H;
  const bctx = big.getContext('2d');
  const img = bctx.createImageData(W, H);
  const row = W * 4;
  for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * row, (H - y) * row), y * row);
  bctx.putImageData(img, 0, 0);
  const out = document.createElement('canvas');
  out.width = outW; out.height = outH;
  const octx = out.getContext('2d');
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(big, 0, 0, outW, outH);
  const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
  save(blob, filename, 'image/png');
  return { width: outW, height: outH, blob };
}
