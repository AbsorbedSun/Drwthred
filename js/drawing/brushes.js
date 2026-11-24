// ============================================================================
// BRUSHES — catálogo de pinceles. Cada pincel es una RECETA declarativa que
// el motor de trazo (stroke-engine.js) sabe interpretar:
//
//   width      grosor sugerido al elegirlo (el slider lo puede cambiar)
//   pressure   sensibilidad a la presión del lápiz: 0 = nada, 1 = normal, >1 = mucha
//   taper      [inicio, fin] largo del afinado de las puntas, en "grosores"
//              (el inicio se ve mientras se dibuja; el final, al soltar)
//   nib        punta de caligrafía: el grosor depende de la dirección
//   dash       [trazo, hueco] en "grosores" — punteado real en la geometría
//   texture    'chalk' (grano), 'soft' (bordes difusos), 'glow' (resplandor)
//   opacity    < 1 = translúcido (las capas se acumulan, como acuarela)
//   additive   mezcla aditiva: los cruces brillan más (neón)
//
// Agregar un pincel nuevo = agregar una entrada acá. Nada más.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

export const BRUSHES = [
  { id: 'pencil',      label: 'Lápiz',      icon: 'pencil',      width: 0.012, pressure: 0.6, taper: [0, 1.5] },
  { id: 'ink',         label: 'Tinta',      icon: 'ink',         width: 0.022, pressure: 1.3, taper: [5, 8] },
  { id: 'marker',      label: 'Marcador',   icon: 'marker',      width: 0.045, pressure: 0,   opacity: 0.88 },
  { id: 'brush-soft',  label: 'Pincel',     icon: 'softBrush',   width: 0.07,  pressure: 1.1, taper: [3, 10] },
  { id: 'calligraphy', label: 'Caligrafía', icon: 'calligraphy', width: 0.06,  pressure: 0.4, nib: true, taper: [0.5, 1] },
  { id: 'neon',        label: 'Neón',       icon: 'neon',        width: 0.07,  pressure: 0.3, texture: 'glow', additive: true },
  { id: 'watercolor',  label: 'Acuarela',   icon: 'watercolor',  width: 0.14,  pressure: 0.6, texture: 'soft', opacity: 0.38, taper: [2, 4] },
  { id: 'dashed',      label: 'Punteado',   icon: 'dashed',      width: 0.025, pressure: 0.3, dash: [2.6, 2.2] },
  { id: 'chalk',       label: 'Tiza',       icon: 'chalk',       width: 0.06,  pressure: 0.5, texture: 'chalk' },
];

const BY_ID = new Map(BRUSHES.map((b) => [b.id, b]));
// Ids viejos (proyectos guardados antes del catálogo)
const LEGACY = { airbrush: 'watercolor', 'pencil-thin': 'pencil' };

export const DEFAULT_BRUSH = BRUSHES[0];

/** Pincel por id; ids desconocidos o viejos caen a uno válido, nunca explota. */
export function getBrush(id) {
  return BY_ID.get(id) || BY_ID.get(LEGACY[id]) || DEFAULT_BRUSH;
}

/** ¿Este pincel necesita coordenadas UV (textura a lo largo del trazo)? */
export function needsUV(brush) {
  return !!(brush && brush.texture);
}

// ── Ancho por punto ──
const MIN_TAPER = 0.08;
const easeOut = (t) => t * (2 - t);

/**
 * Factor de grosor del punto i (sin contar la punta de caligrafía, que
 * depende de la dirección y la aplica el motor).
 * @param {Object} ctx { brush, widths, lengths, total, width }
 */
export function widthFactor(i, ctx) {
  let f = 1;
  const b = ctx.brush;
  if (ctx.widths && ctx.widths[i] != null) {
    const p = ctx.widths[i];
    f *= b ? Math.min(2.2, Math.max(0.08, 1 + (p - 1) * (b.pressure ?? 1))) : p;
  }
  if (b && b.taper && ctx.lengths) {
    const [ts, te] = b.taper;
    const L = ctx.lengths[i];
    if (ts) f *= MIN_TAPER + (1 - MIN_TAPER) * easeOut(Math.min(1, L / (ts * ctx.width)));
    if (te && ctx.total != null) f *= MIN_TAPER + (1 - MIN_TAPER) * easeOut(Math.min(1, (ctx.total - L) / (te * ctx.width)));
  }
  return f;
}

/** Factor de la punta de caligrafía: fino en la dirección de la punta, grueso a 90°. */
export function nibFactor(dir, nib) {
  const s = dir.clone().cross(nib).length(); // |sen(ángulo)|
  return 0.14 + 0.86 * s;
}

/** ¿El segmento i (entre los puntos i e i+1) se dibuja, o es un hueco del punteado? */
export function dashOn(i, ctx) {
  const b = ctx.brush;
  if (!b || !b.dash || !ctx.lengths) return true;
  const [on, off] = b.dash;
  const mid = (ctx.lengths[i] + ctx.lengths[i + 1]) / 2;
  const period = (on + off) * ctx.width;
  return (mid % period) < on * ctx.width;
}

// ── Texturas procedurales (se generan una vez, sin archivos de imagen) ──
const textures = new Map();

function makeTexture(kind) {
  if (typeof document === 'undefined') return null; // Node (tests): sin texturas
  const c = document.createElement('canvas');
  const W = kind === 'chalk' ? 256 : 8, H = 64;
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1);
    const across = 1 - Math.abs(2 * v - 1); // 0 en los bordes, 1 al centro
    for (let x = 0; x < W; x++) {
      let a;
      if (kind === 'chalk') {
        // Grano: ruido + vetas a lo largo del trazo + bordes desgastados
        const streak = 0.5 + 0.5 * Math.sin(y * 1.7 + Math.sin(x * 0.05) * 2);
        a = rnd() * 0.65 + streak * 0.25 + Math.pow(across, 0.6) * 0.45 - 0.2;
      } else if (kind === 'glow') {
        a = Math.pow(across, 1.6); // núcleo brillante, borde que se apaga
      } else { // soft
        a = Math.pow(Math.min(1, across * 1.6), 1.4);
      }
      const k = (y * W + x) * 4;
      const val = Math.max(0, Math.min(255, Math.round(a * 255)));
      img.data[k] = img.data[k + 1] = img.data[k + 2] = val;
      img.data[k + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function textureFor(kind) {
  if (!textures.has(kind)) textures.set(kind, makeTexture(kind));
  return textures.get(kind);
}

/** Material de un trazo con este pincel. Cada trazo tiene el suyo (la selección lo tiñe). */
export function createBrushMaterial(brush, color) {
  const b = brush || DEFAULT_BRUSH;
  const opts = { color, side: THREE.DoubleSide };
  const alphaMap = b.texture ? textureFor(b.texture) : null;
  if (alphaMap) opts.alphaMap = alphaMap;

  if (b.additive) {
    Object.assign(opts, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  } else if (b.texture === 'chalk') {
    opts.alphaTest = 0.5; // grano nítido, sin problemas de orden de transparencias
  } else if ((b.opacity != null && b.opacity < 1) || b.texture === 'soft') {
    Object.assign(opts, { transparent: true, opacity: b.opacity ?? 1, depthWrite: false });
  }
  return new THREE.MeshBasicMaterial(opts);
}

/** Cuántas veces se repite la textura por unidad de largo (en "grosores"). */
export function uvScale(brush) {
  return brush && brush.texture === 'chalk' ? 3 : 1;
}
