// ============================================================================
// SELECTION BAR — menú de acciones sobre lo seleccionado. Aparece solo
// cuando hay algo seleccionado (uno o varios objetos, con toque o lazo) y
// desaparece al deseleccionar. En tablet vive arriba al centro; en
// teléfono, debajo de la fila de botones superior.
//
//   [N objetos] Duplicar · Pintar · Espejar · A capa · Plano aquí · Eliminar · ✕
//
// Toda la lógica está en drawing/object-actions.js; acá solo hay botones.
// ============================================================================
import * as THREE from '../../vendor/three.module.js';
import { register } from '../hud-manager.js';
import { icon } from '../icons.js';
import { getState, subscribe } from '../../core/store.js';
import { subscribeHistory } from '../../core/history.js';
import { selectedObjects, setSelection } from '../../drawing/selection.js';
import {
  duplicateObjects, deleteObjects, recolorObjects, mirrorObjects, moveObjectsToLayer,
} from '../../drawing/object-actions.js';
import { groupPivot } from '../../drawing/transform.js';
import { restyleStrokes } from '../../drawing/object-actions.js';
import { BRUSHES, getBrush } from '../../drawing/brushes.js';
import { setReferenceOpacity } from '../../drawing/references.js';
import { attachPopover } from '../popover.js';
import { widthToT, tToWidth } from './size-slider.js';
import { planeThroughPoint } from '../../drawing/draw-planes.js';

export function createSelectionBar({ id = 'selection-bar', scene, camera, camCtl, onToast }) {
  const bar = document.createElement('div');
  bar.className = 'hud-selbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Acciones de selección');

  const count = document.createElement('span');
  count.className = 'selbar-count';
  bar.appendChild(count);

  const toast = (m) => onToast && onToast(m);
  const objs = () => selectedObjects(scene).filter((o) => o.visible);
  const hasStrokes = (list) => list.some((o) => o.userData.strokePoints);
  const hasRefs = (list) => list.some((o) => o.userData.reference);
  const strokesOf = (list) => list.filter((o) => o.userData.strokePoints);

  function title(text) {
    const t = document.createElement('div');
    t.className = 'panel-title';
    t.textContent = text;
    return t;
  }

  /** Grosor de los trazos seleccionados (misma escala que el slider). */
  function widthPanel(list) {
    const box = document.createElement('div');
    const strokes = strokesOf(list);
    const w0 = strokes[0] ? strokes[0].userData.strokeWidth : getState().brushWidth;
    const row = document.createElement('label');
    row.className = 'layer-opacity';
    row.innerHTML = `<span>Grosor</span><input type="range" min="0" max="1000" value="${Math.round(widthToT(w0) * 1000)}"><output>${Math.round(w0 * 1000)}</output>`;
    const range = row.querySelector('input'), out = row.querySelector('output');
    range.addEventListener('input', () => { out.textContent = Math.round(tToWidth(range.value / 1000) * 1000); });
    range.addEventListener('change', () => {
      restyleStrokes(objs(), camera, { width: +tToWidth(range.value / 1000).toFixed(4) });
      toast(strokes.length > 1 ? `Grosor de ${strokes.length} trazos cambiado` : 'Grosor cambiado');
    });
    box.append(title(strokes.length > 1 ? `GROSOR · ${strokes.length} TRAZOS` : 'GROSOR'), row);
    return box;
  }

  /** Cambiar el pincel de los trazos seleccionados. */
  function brushPanel(list, close) {
    const box = document.createElement('div');
    box.className = 'variants-grid';
    const current = strokesOf(list).map((o) => getBrush(o.userData.brush).id);
    box.appendChild(title('CAMBIAR PINCEL'));
    BRUSHES.forEach((br) => {
      const t = document.createElement('button');
      t.className = 'variant-tile' + (current.length && current.every((c) => c === br.id) ? ' active' : '');
      t.innerHTML = `${icon(br.icon)}<span>${br.label}</span>`;
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        restyleStrokes(objs(), camera, { brush: br.id });
        toast(`Pincel: ${br.label}`);
        close();
      });
      box.appendChild(t);
    });
    return box;
  }

  /** Opacidad de las imágenes de referencia seleccionadas. */
  function opacityPanel(list) {
    const box = document.createElement('div');
    const refs = list.filter((o) => o.userData.reference);
    const v0 = refs[0] ? refs[0].userData.refOpacity : 0.6;
    const row = document.createElement('label');
    row.className = 'layer-opacity';
    row.innerHTML = `<span>Opacidad</span><input type="range" min="5" max="100" value="${Math.round(v0 * 100)}"><output>${Math.round(v0 * 100)}%</output>`;
    const range = row.querySelector('input'), out = row.querySelector('output');
    range.addEventListener('input', () => {
      out.textContent = `${range.value}%`;
      setReferenceOpacity(refs, range.value / 100, { record: false });
    });
    range.addEventListener('change', () => setReferenceOpacity(refs, range.value / 100, { record: true, from: v0 }));
    box.append(title('IMAGEN DE REFERENCIA'), row);
    return box;
  }

  const ACTIONS = [
    { id: 'duplicate', icon: 'duplicate', label: 'Duplicar', run(list) {
      // Corrido un poco hacia la derecha/abajo DE LA PANTALLA (se ve la copia)
      const k = camCtl.state.radius * 0.04;
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(k);
      const down = new THREE.Vector3(0, -1, 0).applyQuaternion(camera.quaternion).multiplyScalar(k);
      duplicateObjects(scene, list, right.add(down));
      toast(list.length > 1 ? `${list.length} copias` : 'Duplicado');
    } },
    { id: 'paint', icon: 'paint', label: 'Pintar', swatch: true, run(list) {
      if (recolorObjects(list, getState().brushColor)) toast('Pintado con el color actual');
      else toast('Ya tiene ese color — elegí otro en la paleta');
    } },
    { id: 'width', icon: 'strokeWidth', label: 'Grosor', when: hasStrokes, popover: widthPanel },
    { id: 'brush', icon: 'softBrush', label: 'Pincel', when: hasStrokes, popover: brushPanel },
    { id: 'opacity', icon: 'image', label: 'Opacidad', when: hasRefs, popover: opacityPanel },
    { id: 'mirror', icon: 'mirror', label: 'Espejar', run(list) { mirrorObjects(list); } },
    { id: 'layer', icon: 'toLayer', label: 'A capa', run(list) {
      const layer = getState().layers.find((l) => l.id === getState().activeLayerId);
      if (moveObjectsToLayer(list)) toast(`Movido a "${layer ? layer.name : 'capa activa'}"`);
      else toast('Ya está en la capa activa');
    } },
    { id: 'plane', icon: 'planeTool', label: 'Plano aquí', run(list) {
      planeThroughPoint(groupPivot(list), camera);
      toast('El plano pasa por la selección');
    } },
    { id: 'delete', icon: 'trash', label: 'Eliminar', danger: true, run(list) {
      deleteObjects(scene, list);
      toast(list.length > 1 ? `${list.length} objetos eliminados` : 'Eliminado');
    } },
  ];

  const buttons = ACTIONS.map((a) => {
    const b = document.createElement('button');
    b.className = 'selbar-btn' + (a.danger ? ' danger' : '');
    b.title = a.label;
    b.setAttribute('aria-label', a.label);
    b.innerHTML = `${icon(a.icon)}${a.swatch ? '<i class="selbar-swatch"></i>' : ''}<span>${a.label}</span>`;
    if (a.popover) {
      // Acciones con ajuste (grosor, pincel, opacidad): abren un panelcito
      const panel = document.createElement('div');
      panel.className = 'hud-panel selbar-pop';
      const pop = attachPopover({ trigger: b, panel, onOpen: () => {
        panel.innerHTML = '';
        panel.appendChild(a.popover(objs(), () => pop.close()));
      } });
    } else {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const list = objs();
        if (list.length) a.run(list);
      });
    }
    bar.appendChild(b);
    return { a, b };
  });

  const close = document.createElement('button');
  close.className = 'selbar-btn selbar-close';
  close.title = 'Deseleccionar';
  close.setAttribute('aria-label', 'Deseleccionar');
  close.innerHTML = icon('close');
  close.addEventListener('click', (e) => { e.stopPropagation(); setSelection([]); });
  bar.appendChild(close);

  function render() {
    const list = objs();
    const n = list.length;
    buttons.forEach(({ a, b }) => { b.style.display = !a.when || a.when(list) ? '' : 'none'; });
    bar.classList.toggle('show', n > 0);
    count.textContent = n === 1 ? '1 objeto' : `${n} objetos`;
    const sw = bar.querySelector('.selbar-swatch');
    if (sw) sw.style.background = getState().brushColor;
  }
  subscribe(render, (s) => [s.selectedIds, s.brushColor, s.layers]);
  subscribeHistory(render); // deshacer puede sacar/poner lo seleccionado
  render();

  // En teléfono, justo debajo de la fila superior (abajo ya están la barra
  // de herramientas y la de planos; una tercera fila chocaba con el slider)
  register({ id, slot: { wide: 'edge-top-center', narrow: 'overlay-top-center' }, order: -1, el: bar });
  return { el: bar, refresh: render };
}
