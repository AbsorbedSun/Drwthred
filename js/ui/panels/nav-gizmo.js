// ============================================================================
// NAV GIZMO — indicador de ejes que además es control de navegación:
//
//  · Muestra hacia dónde apuntan X (rojo), Y (verde), Z (azul) desde la
//    cámara actual — orientación siempre visible, clave cuando se dibuja
//    sobre planos.
//  · Arrastrar sobre él con UN dedo orbita la cámara (navegar sin
//    gestos multi-dedo, útil en teléfono o con una sola mano libre).
//  · Tocar la punta de un eje salta a esa vista (frente, lado, arriba...).
//  · El botón de abajo vuelve a la vista inicial.
// ============================================================================
import * as THREE from '../../vendor/three.module.js';
import { register, isNarrow } from '../hud-manager.js';
import { icon } from '../icons.js';
import { getState } from '../../core/store.js';

const AXES = [
  { v: new THREE.Vector3(1, 0, 0), color: '#e8655a', label: 'X' },
  { v: new THREE.Vector3(0, 1, 0), color: '#6cc070', label: 'Y' },
  { v: new THREE.Vector3(0, 0, 1), color: '#5b8def', label: 'Z' },
];

export function createNavGizmo({ id = 'nav-gizmo', camCtl, camera }) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-gizmo';
  const canvas = document.createElement('canvas');
  canvas.className = 'gizmo-canvas';
  canvas.title = 'Arrastrar: orbitar · Tocar un eje: ver desde ahí';
  const home = document.createElement('button');
  home.className = 'gizmo-home';
  home.title = 'Vista inicial';
  home.innerHTML = icon('home');
  home.addEventListener('click', (e) => { e.stopPropagation(); camCtl.setOrtho(false); camCtl.reset(); });

  // Perspectiva ↔ ortográfica (sin perspectiva: medidas y paralelas exactas)
  const proj = document.createElement('button');
  proj.className = 'gizmo-home gizmo-proj';
  const syncProj = () => {
    const o = camCtl.isOrtho();
    proj.innerHTML = icon(o ? 'orthoView' : 'perspView');
    proj.title = o ? 'Vista ortográfica (tocar para perspectiva)' : 'Vista en perspectiva (tocar para ortográfica)';
    proj.setAttribute('aria-label', proj.title);
    proj.classList.toggle('on', o);
  };
  proj.addEventListener('click', (e) => { e.stopPropagation(); camCtl.toggleOrtho(); });
  camCtl.onProjectionChange(syncProj);
  syncProj();
  const buttons = document.createElement('div');
  buttons.className = 'gizmo-buttons';
  buttons.append(proj, home);
  wrap.append(canvas, buttons);

  const ctx = canvas.getContext('2d');
  let size = 0, dpr = 0;
  let ends = []; // posiciones en pantalla de las puntas, para el hit-test

  function resize() {
    const nextSize = isNarrow() ? 76 : 92;
    const nextDpr = Math.min(window.devicePixelRatio || 1, 2);
    if (nextSize === size && nextDpr === dpr) return;
    size = nextSize;
    dpr = nextDpr;
    canvas.style.width = canvas.style.height = `${size}px`;
    // Cambiar el ancho de un canvas lo BORRA: hay que redibujar sí o sí,
    // aunque la cámara no se haya movido (antes quedaba un círculo vacío).
    canvas.width = canvas.height = Math.round(size * dpr);
    lastKey = '';
    draw();
  }
  window.addEventListener('resize', resize);

  const inv = new THREE.Quaternion();
  const tmp = new THREE.Vector3();
  let lastKey = '';

  function draw() {
    // Redibujar solo si cambió la orientación (es barato, pero no gratis)
    const q = camera.quaternion;
    const key = `${size}|${q.x.toFixed(4)}|${q.y.toFixed(4)}|${q.z.toFixed(4)}|${q.w.toFixed(4)}`;
    if (key === lastKey) return;
    lastKey = key;

    const c = size / 2, R = size / 2 - 13;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    inv.copy(q).invert();

    const items = [];
    AXES.forEach((a) => {
      [1, -1].forEach((sign) => {
        tmp.copy(a.v).multiplyScalar(sign).applyQuaternion(inv);
        items.push({ ...a, sign, x: c + tmp.x * R, y: c - tmp.y * R, z: tmp.z, dir: a.v.clone().multiplyScalar(sign) });
      });
    });
    items.sort((p, q2) => p.z - q2.z); // de atrás hacia adelante
    ends = items;

    items.forEach((it) => {
      const front = it.z > -0.05;
      if (it.sign > 0) {
        ctx.strokeStyle = it.color;
        ctx.globalAlpha = front ? 1 : 0.45;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(it.x, it.y); ctx.stroke();
        ctx.beginPath(); ctx.arc(it.x, it.y, 9, 0, Math.PI * 2);
        ctx.fillStyle = it.color; ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#16140f';
        ctx.font = '600 10px "DM Sans", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.label, it.x, it.y + 0.5);
      } else {
        ctx.globalAlpha = front ? 0.9 : 0.4;
        ctx.beginPath(); ctx.arc(it.x, it.y, 6, 0, Math.PI * 2);
        ctx.strokeStyle = it.color; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });
  }

  // ── Interacción ──
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0 };
    wrap.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX; drag.y = e.clientY;
    if (drag.moved > 4) camCtl.orbit(dx * 1.6, dy * 1.6);
  });
  const end = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const tapped = drag.moved <= 4;
    drag = null;
    wrap.classList.remove('dragging');
    if (!tapped) return;
    const r = canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // La punta más cercana (preferir las de adelante), con radio táctil generoso
    let best = null, bestD = 22;
    for (let i = ends.length - 1; i >= 0; i--) {
      const it = ends[i];
      const d = Math.hypot(it.x - x, it.y - y) - (it.z > 0 ? 3 : 0);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best) camCtl.viewAlong(best.dir, undefined, { ortho: getState().autoOrtho });
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  resize();
  register({ id, slot: { wide: 'corner-bottom-right', narrow: 'edge-right-center' }, order: 0, el: wrap });
  return { el: wrap, draw };
}
