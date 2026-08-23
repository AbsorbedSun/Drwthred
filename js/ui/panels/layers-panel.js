// ============================================================================
// LAYERS PANEL — categoría 2 del sistema de HUD (oculto por defecto, se
// abre al tocar). No mantiene estado propio: lee/escribe directo al store
// vía drawing/layers.js, y se re-dibuja solo cuando el store cambia.
// ============================================================================
import { register } from '../hud-manager.js';
import { getState, subscribe } from '../../core/store.js';
import { addLayer, setActiveLayer, toggleLayerVisibility } from '../../drawing/layers.js';
import { icon } from '../icons.js';

export function createLayersPanel({ id, slot, order }) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-context-panel layers-panel';

  const trigger = document.createElement('button');
  trigger.className = 'hud-trigger';
  trigger.innerHTML = icon('layers');
  trigger.title = 'Capas';

  const panel = document.createElement('div');
  panel.className = 'hud-panel-detail layers-panel-detail';

  wrap.append(trigger, panel);

  function render() {
    const { layers, activeLayerId } = getState();
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'layers-title';
    title.textContent = 'CAPAS';
    panel.appendChild(title);

    const list = document.createElement('div');
    list.className = 'layers-list';
    // Más nueva arriba — convención de la mayoría de editores de capas.
    layers.slice().reverse().forEach((layer) => {
      const row = document.createElement('div');
      row.className = 'layer-row' + (layer.id === activeLayerId ? ' active' : '');

      const eye = document.createElement('button');
      eye.className = 'layer-eye';
      eye.innerHTML = layer.visible ? icon('eyeOpen') : icon('eyeClosed');
      eye.title = layer.visible ? 'Ocultar' : 'Mostrar';
      eye.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleLayerVisibility(layer.id);
      });

      const name = document.createElement('span');
      name.className = 'layer-name';
      name.textContent = layer.name;

      row.append(eye, name);
      row.addEventListener('click', () => setActiveLayer(layer.id));
      list.appendChild(row);
    });
    panel.appendChild(list);

    const addBtn = document.createElement('button');
    addBtn.className = 'layer-add-btn';
    addBtn.innerHTML = icon('plus') + '<span>Nueva capa</span>';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addLayer();
    });
    panel.appendChild(addBtn);
  }

  subscribe(render);
  render();

  // Sin auto-cierre por tiempo: capas es un panel de trabajo — se puede
  // tocar varias veces seguidas (agregar, ocultar, activar) y no tiene
  // sentido que se cierre solo a mitad de esa secuencia.
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
