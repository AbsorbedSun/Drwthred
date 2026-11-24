// ============================================================================
// LAYERS PANEL — panel de capas completo, pensado para dedo y lápiz:
//
//   [⠿] [👁] [🔒] Nombre de la capa           [⋯]
//
//  · Tocar la fila activa la capa; tocar el NOMBRE de la capa ya activa
//    la renombra.
//  · Manija ⠿: arrastrar para reordenar (la de más arriba se ve encima).
//  · ⋯ despliega, debajo de la fila: opacidad, renombrar, duplicar, eliminar.
//
// No guarda estado propio salvo qué fila está desplegada: lee y escribe el
// store vía drawing/layers.js, y se redibuja solo cuando cambian las capas.
// ============================================================================
import { register } from '../hud-manager.js';
import { attachPopover } from '../popover.js';
import { getState, subscribe } from '../../core/store.js';
import {
  addLayer, setActiveLayer, toggleLayerVisibility, toggleLayerLock, renameLayer,
  setLayerOpacity, moveLayer, deleteLayer, duplicateLayer, layerObjects, normalizeLayer,
} from '../../drawing/layers.js';
import { confirmDialog, promptDialog } from '../dialog.js';
import { icon } from '../icons.js';

export function createLayersPanel({ id, slot, order, scene, onToast }) {
  const trigger = document.createElement('button');
  trigger.className = 'hud-fab';
  trigger.innerHTML = icon('layers');
  trigger.title = 'Capas';
  trigger.setAttribute('aria-label', 'Capas');

  const panel = document.createElement('div');
  panel.className = 'hud-panel layers-panel';

  let expanded = null; // id de la capa con opciones desplegadas
  let sliding = false;  // arrastrando la opacidad: no redibujar (destruiría el slider en pleno gesto)
  const toast = (m) => onToast && onToast(m);

  async function rename(layer) {
    const name = await promptDialog('Renombrar capa', layer.name, { ok: 'Renombrar' });
    if (name) renameLayer(layer.id, name);
  }
  async function remove(layer) {
    if (getState().layers.length <= 1) { toast('Tiene que quedar al menos una capa'); return; }
    const n = scene ? layerObjects(scene, layer.id).length : 0;
    if (n > 0) {
      const ok = await confirmDialog(`¿Eliminar "${layer.name}"?`,
        `Se borran también ${n === 1 ? 'el objeto' : `los ${n} objetos`} que tiene. Se puede deshacer.`, { ok: 'Eliminar', danger: true });
      if (!ok) return;
    }
    expanded = null;
    deleteLayer(scene, layer.id);
  }

  function iconBtn(name, title, onClick, extraClass = '') {
    const b = document.createElement('button');
    b.className = `layer-icon ${extraClass}`;
    b.innerHTML = icon(name);
    b.title = title;
    b.setAttribute('aria-label', title);
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function optionsRow(layer) {
    const box = document.createElement('div');
    box.className = 'layer-options';
    const op = document.createElement('label');
    op.className = 'layer-opacity';
    const pct = Math.round(layer.opacity * 100);
    op.innerHTML = `<span>Opacidad</span><input type="range" min="0" max="100" step="1" value="${pct}"><output>${pct}%</output>`;
    const range = op.querySelector('input');
    const out = op.querySelector('output');
    let from = null;
    range.addEventListener('pointerdown', () => { from = normalizeLayer(layer).opacity; });
    range.addEventListener('input', () => {
      if (from == null) from = normalizeLayer(layer).opacity;
      sliding = true;
      out.textContent = `${range.value}%`;
      setLayerOpacity(layer.id, range.value / 100, { record: false }); // en vivo, sin historial
    });
    range.addEventListener('change', () => {
      sliding = false;
      setLayerOpacity(layer.id, range.value / 100, { record: true, from }); // un solo paso de deshacer
      from = null;
      render();
    });
    const actions = document.createElement('div');
    actions.className = 'layer-actions';
    const act = (ic, label, fn, cls = '') => {
      const b = document.createElement('button');
      b.className = `layer-action ${cls}`;
      b.innerHTML = `${icon(ic)}<span>${label}</span>`;
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    };
    actions.append(
      act('rename', 'Renombrar', () => rename(layer)),
      act('duplicate', 'Duplicar', () => { duplicateLayer(scene, layer.id); toast('Capa duplicada'); }),
      act('trash', 'Eliminar', () => remove(layer), 'danger'),
    );
    box.append(op, actions);
    return box;
  }

  // ── Reordenar arrastrando la manija ──
  function startDrag(e, layer, row, list) {
    e.preventDefault();
    e.stopPropagation();
    const rows = [...list.querySelectorAll('.layer-row')];
    const startIdx = rows.indexOf(row);
    const rowH = row.getBoundingClientRect().height + 2;
    const y0 = e.clientY;
    let target = startIdx;
    row.classList.add('dragging');
    const handle = e.currentTarget;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* */ }
    const move = (ev) => {
      const dy = ev.clientY - y0;
      row.style.transform = `translateY(${dy}px)`;
      target = Math.max(0, Math.min(rows.length - 1, startIdx + Math.round(dy / rowH)));
      rows.forEach((r, i) => {
        if (r === row) return;
        let shift = 0;
        if (startIdx < target && i > startIdx && i <= target) shift = -rowH;
        if (startIdx > target && i < startIdx && i >= target) shift = rowH;
        r.style.transform = shift ? `translateY(${shift}px)` : '';
      });
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      rows.forEach((r) => { r.style.transform = ''; });
      row.classList.remove('dragging');
      // La lista se muestra invertida (la de más arriba primero)
      const n = getState().layers.length;
      if (target !== startIdx) moveLayer(layer.id, n - 1 - target);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
  }

  function render() {
    if (sliding) return;
    const { layers, activeLayerId } = getState();
    panel.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.textContent = 'CAPAS';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'layers-list';
    // Más nueva arriba — convención de la mayoría de editores de capas
    layers.slice().reverse().map(normalizeLayer).forEach((layer) => {
      const wrap = document.createElement('div');
      wrap.className = 'layer-item';
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === activeLayerId ? ' active' : '') +
        (layer.locked ? ' locked' : '') + (!layer.visible ? ' hidden' : '');

      const grip = document.createElement('button');
      grip.className = 'layer-icon layer-grip';
      grip.innerHTML = icon('grip');
      grip.title = 'Arrastrar para reordenar';
      grip.setAttribute('aria-label', 'Reordenar');
      grip.addEventListener('pointerdown', (e) => startDrag(e, layer, row, list));
      grip.addEventListener('click', (e) => e.stopPropagation());

      const eye = iconBtn(layer.visible ? 'eyeOpen' : 'eyeClosed', layer.visible ? 'Ocultar' : 'Mostrar', () => toggleLayerVisibility(layer.id));
      const lock = iconBtn(layer.locked ? 'lock' : 'unlock', layer.locked ? 'Desbloquear' : 'Bloquear', () => {
        toggleLayerLock(layer.id);
        toast(layer.locked ? `"${layer.name}" desbloqueada` : `"${layer.name}" bloqueada: no se puede tocar su contenido`);
      }, layer.locked ? 'on' : '');

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;
      if (layer.opacity < 1) {
        const o = document.createElement('small');
        o.textContent = ` ${Math.round(layer.opacity * 100)}%`;
        name.appendChild(o);
      }

      const more = iconBtn('more', 'Opciones de la capa', () => {
        expanded = expanded === layer.id ? null : layer.id;
        render();
      }, expanded === layer.id ? 'on' : '');

      row.append(grip, eye, lock, name, more);
      row.addEventListener('click', () => {
        if (layer.id === activeLayerId) rename(layer);
        else setActiveLayer(layer.id);
      });
      wrap.appendChild(row);
      if (expanded === layer.id) wrap.appendChild(optionsRow(layer));
      list.appendChild(wrap);
    });
    panel.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'layer-add-btn';
    addBtn.innerHTML = icon('plus') + '<span>Nueva capa</span>';
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); addLayer(); });
    panel.appendChild(addBtn);
  }

  subscribe(render, (s) => [s.layers, s.activeLayerId]);
  render();

  // Sin auto-cierre: capas es un panel de trabajo (varios toques seguidos)
  attachPopover({ trigger, panel, onClose: () => { if (expanded) { expanded = null; render(); } } });

  register({ id, slot, order, el: trigger });
  return { el: trigger };
}
