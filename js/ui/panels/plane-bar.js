// ============================================================================
// PLANE BAR — selector de plano de dibujo, abajo al centro. Es la pieza
// "Feather" de la interfaz: elegir SOBRE QUÉ plano cae el próximo trazo.
//
//   [Libre] [Frente] [Lado] [Suelo] [·Personalizado]  | offset |  [Espejo] [Alinear]
//
//  · Libre: plano de frente a la cámara (dibujo "2.5D" clásico).
//  · Frente/Lado/Suelo: planos XY / YZ / XZ; al elegirlos pasan por el
//    punto que se está mirando. Tocar el plano YA activo alinea la vista
//    a él (mirarlo de frente), como el doble toque de Feather.
//  · Personalizado: aparece cuando el plano se capturó desde la vista o
//    se arrastró con la herramienta Plano.
//  · Chip de offset: arrastrarlo a los lados desplaza el plano a lo largo
//    de su normal; tocarlo lo vuelve a pasar por el centro de la vista.
//  · Espejo: simetría respecto a X = 0.
//  · Alinear: gira la cámara para ver el plano de frente.
// ============================================================================
import * as THREE from '../../vendor/three.module.js';
import { register } from '../hud-manager.js';
import { icon } from '../icons.js';
import { getState, subscribe } from '../../core/store.js';
import {
  PLANE_PRESETS, setPlaneMode, setPlaneOffset, planeThroughPoint, toggleMirror,
  isFixedPlane, normalOf, captureViewPlane,
} from '../../drawing/draw-planes.js';

const MODES = [
  { id: 'view', icon: 'planeFree', label: 'Libre' },
  { id: 'front', icon: 'planeFront', label: PLANE_PRESETS.front.label },
  { id: 'side', icon: 'planeSide', label: PLANE_PRESETS.side.label },
  { id: 'ground', icon: 'planeGround', label: PLANE_PRESETS.ground.label },
  { id: 'surface', icon: 'surface', label: 'Superficie' },
  { id: 'custom', icon: 'planeCustom', label: 'Propio' },
];

export function createPlaneBar({ id = 'plane-bar', order = 1, camCtl, camera, scene, onToast }) {
  const bar = document.createElement('div');
  bar.className = 'hud-planebar';

  const seg = document.createElement('div');
  seg.className = 'plane-seg';
  const modeBtns = new Map();
  MODES.forEach((m) => {
    const b = document.createElement('button');
    b.className = `plane-btn plane-${m.id}`;
    b.dataset.mode = m.id;
    b.title = m.id === 'view' ? 'Plano libre (de frente a la cámara)'
      : m.id === 'surface' ? 'Dibujar sobre la superficie de las figuras' : `Plano ${m.label}`;
    b.innerHTML = `${icon(m.icon)}<span class="plane-label">${m.label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = getState().drawPlane;
      if (m.id === 'custom') {
        // "Propio" sin plano propio todavía = congelar el plano libre actual
        if (cur.mode !== 'custom') {
          captureViewPlane(camera, camCtl.state.target);
          onToast && onToast('Plano fijado desde la vista actual');
        } else alignView();
        return;
      }
      if (cur.mode === m.id && m.id !== 'view' && m.id !== 'surface') { alignView(); return; }
      if (m.id === 'surface' && cur.mode !== 'surface' && !scene.children.some((o) => o.userData.primitiveKind && o.visible)) {
        onToast && onToast('Superficie: agregá una figura y dibujá encima de ella');
      }
      setPlaneMode(m.id, { target: camCtl.state.target });
    });
    modeBtns.set(m.id, b);
    seg.appendChild(b);
  });

  const sep1 = document.createElement('div'); sep1.className = 'planebar-sep';

  // ── Chip de offset (arrastrable) ──
  const chip = document.createElement('button');
  chip.className = 'offset-chip';
  chip.title = 'Arrastrar: mover el plano · Tocar: llevarlo al centro de la vista';
  chip.innerHTML = '<span class="offset-arrows">‹ ›</span><span class="offset-val">0.00</span>';
  let drag = null;
  chip.addEventListener('pointerdown', (e) => {
    if (!isFixedPlane(getState().drawPlane)) return;
    e.preventDefault();
    try { chip.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    drag = { id: e.pointerId, x0: e.clientX, start: getState().drawPlane.offset, moved: false };
    chip.classList.add('dragging');
  });
  chip.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x0;
    if (Math.abs(dx) > 4) drag.moved = true;
    // Sensibilidad proporcional al zoom: lejos se mueve más rápido
    setPlaneOffset(drag.start + dx * 0.004 * camCtl.state.radius);
  });
  const endDrag = (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const wasTap = !drag.moved;
    drag = null;
    chip.classList.remove('dragging');
    if (wasTap) planeThroughPoint(camCtl.state.target, camera);
  };
  chip.addEventListener('pointerup', endDrag);
  chip.addEventListener('pointercancel', endDrag);

  const sep2 = document.createElement('div'); sep2.className = 'planebar-sep';

  const mirrorBtn = document.createElement('button');
  mirrorBtn.className = 'plane-btn plane-mirror';
  mirrorBtn.title = 'Simetría (espejo en X)';
  mirrorBtn.innerHTML = `${icon('mirror')}<span class="plane-label">Espejo</span>`;
  mirrorBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleMirror(); });

  const alignBtn = document.createElement('button');
  alignBtn.className = 'plane-btn plane-align';
  alignBtn.title = 'Ver el plano de frente';
  alignBtn.innerHTML = `${icon('alignView')}<span class="plane-label">Alinear</span>`;
  alignBtn.addEventListener('click', (e) => { e.stopPropagation(); alignView(); });

  bar.append(seg, sep1, chip, sep2, mirrorBtn, alignBtn);

  function alignView() {
    const spec = getState().drawPlane;
    if (!isFixedPlane(spec)) { onToast && onToast('El plano libre ya mira a la cámara'); return; }
    let n = normalOf(spec);
    // Mirar el plano desde el lado donde ya está la cámara (no dar media vuelta)
    const toCam = new THREE.Vector3().subVectors(camera.position, camCtl.state.target);
    if (toCam.dot(n) < 0) n = n.negate();
    camCtl.viewAlong(n, undefined, { ortho: getState().autoOrtho });
  }

  function render({ drawPlane, mirror }) {
    const fixed = isFixedPlane(drawPlane);
    modeBtns.forEach((b, m) => b.classList.toggle('active', drawPlane.mode === m));
    bar.dataset.mode = drawPlane.mode;
    bar.classList.toggle('has-custom', drawPlane.mode === 'custom');
    chip.disabled = !fixed;
    chip.querySelector('.offset-val').textContent = fixed ? drawPlane.offset.toFixed(2) : '—';
    alignBtn.disabled = !fixed;
    mirrorBtn.classList.toggle('active', !!mirror);
  }
  subscribe(render, (s) => [s.drawPlane, s.mirror]);
  render(getState());

  register({ id, slot: 'edge-bottom-center', order, el: bar });
  return { el: bar, alignView };
}
