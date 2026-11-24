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
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const list = objs();
      if (list.length) a.run(list);
    });
    bar.appendChild(b);
    return b;
  });

  const close = document.createElement('button');
  close.className = 'selbar-btn selbar-close';
  close.title = 'Deseleccionar';
  close.setAttribute('aria-label', 'Deseleccionar');
  close.innerHTML = icon('close');
  close.addEventListener('click', (e) => { e.stopPropagation(); setSelection([]); });
  bar.appendChild(close);

  function render() {
    const n = objs().length;
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
