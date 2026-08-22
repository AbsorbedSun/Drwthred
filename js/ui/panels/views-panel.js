// ============================================================================
// VIEWS PANEL — categoría 2 del sistema de HUD. A diferencia de
// layers-panel.js (que solo toca el store), este panel recibe `camCtl`
// como parámetro — guardar/aplicar una vista necesita la posición real de
// la cámara, que no vive en el store (ver core/views.js). Por eso se
// arma en scene-demo.js, donde camCtl ya existe, en vez de en demo.js
// junto con los demás paneles — no por descuido, es la dependencia real
// la que decide dónde vive cada cosa.
// ============================================================================
import { register } from '../hud-manager.js';
import { getState, subscribe } from '../../core/store.js';
import { saveView, applyView, deleteView } from '../../core/views.js';

export function createViewsPanel({ id, slot, order, camCtl }) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-context-panel views-panel';

  const trigger = document.createElement('button');
  trigger.className = 'hud-trigger';
  trigger.textContent = '⛶';
  trigger.title = 'Vistas guardadas';

  const panel = document.createElement('div');
  panel.className = 'hud-panel-detail views-panel-detail';

  wrap.append(trigger, panel);

  function render() {
    const { savedViews } = getState();
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'layers-title';
    title.textContent = 'VISTAS';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'layers-list';
    savedViews.slice().reverse().forEach((view) => {
      const row = document.createElement('div');
      row.className = 'layer-row view-row';

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = view.name;
      name.title = 'Tocar para saltar a esta vista';
      name.addEventListener('click', () => applyView(camCtl, view.id));

      const del = document.createElement('button');
      del.className = 'layer-eye';
      del.textContent = '×';
      del.title = 'Borrar vista';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteView(view.id);
      });

      row.append(name, del);
      list.appendChild(row);
    });
    panel.appendChild(list);

    if (savedViews.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'views-empty';
      empty.textContent = 'Todavía no guardaste ninguna vista.';
      panel.appendChild(empty);
    }

    const addBtn = document.createElement('button');
    addBtn.className = 'layer-add-btn';
    addBtn.textContent = '+ Guardar vista actual';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveView(camCtl);
    });
    panel.appendChild(addBtn);
  }

  subscribe(render);
  render();

  function open() { wrap.classList.add('open'); }
  function close() { wrap.classList.remove('open'); }
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    wrap.classList.contains('open') ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (wrap.classList.contains('open') && !wrap.contains(e.target)) close();
  });

  register({ id, slot, order, el: wrap });
  return { el: wrap };
}
