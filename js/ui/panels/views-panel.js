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
import { attachPopover } from '../popover.js';
import { getState, subscribe } from '../../core/store.js';
import { saveView, applyView, deleteView } from '../../core/views.js';
import { icon } from '../icons.js';

export function createViewsPanel({ id, slot, order, camCtl }) {
  const trigger = document.createElement('button');
  trigger.className = 'hud-fab';
  trigger.innerHTML = icon('views');
  trigger.title = 'Vistas guardadas';
  trigger.setAttribute('aria-label', 'Vistas guardadas');

  const panel = document.createElement('div');
  panel.className = 'hud-panel views-panel';

  function render() {
    const { savedViews } = getState();
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'panel-title';
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
      row.addEventListener('click', () => applyView(camCtl, view.id));

      const del = document.createElement('button');
      del.className = 'layer-eye';
      del.innerHTML = icon('close');
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
    addBtn.innerHTML = icon('plus') + '<span>Guardar vista actual</span>';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveView(camCtl);
    });
    panel.appendChild(addBtn);
  }

  subscribe(render, (s) => s.savedViews);
  render();

  attachPopover({ trigger, panel });

  register({ id, slot, order, el: trigger });
  return { el: trigger };
}
