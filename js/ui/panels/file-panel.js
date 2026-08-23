// ============================================================================
// FILE PANEL — categoría 2 del sistema de HUD. Igual que views-panel.js,
// necesita referencias directas (scene, strokeEngine, renderer) que no
// viven en el store — por eso se arma en scene-demo.js.
// ============================================================================
import { register } from '../hud-manager.js';
import { downloadProject, pickAndLoadProject, exportImage } from '../../persistence/save-load.js';
import { icon } from '../icons.js';

export function createFilePanel({ id, slot, order, scene, strokeEngine, renderer, onToast }) {
  const wrap = document.createElement('div');
  wrap.className = 'hud-context-panel file-panel';

  const trigger = document.createElement('button');
  trigger.className = 'hud-trigger';
  trigger.innerHTML = icon('save');
  trigger.title = 'Guardar / Cargar / Exportar';

  const panel = document.createElement('div');
  panel.className = 'hud-panel-detail file-panel-detail';
  panel.innerHTML = `
    <button class="file-action" data-action="save">${icon('save')}<span>Guardar proyecto</span></button>
    <button class="file-action" data-action="load">${icon('load')}<span>Cargar proyecto</span></button>
    <button class="file-action" data-action="export">${icon('image')}<span>Exportar imagen</span></button>
  `;
  wrap.append(trigger, panel);

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('.file-action');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'save') {
      downloadProject(scene);
      if (onToast) onToast('Proyecto descargado');
    } else if (action === 'load') {
      pickAndLoadProject(scene, strokeEngine, (err) => {
        if (onToast) onToast(err ? 'No se pudo cargar el archivo' : 'Proyecto cargado');
      });
    } else if (action === 'export') {
      exportImage(renderer);
      if (onToast) onToast('Imagen exportada');
    }
    close();
  });

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
