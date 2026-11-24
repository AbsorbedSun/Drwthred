// ============================================================================
// FILE PANEL — categoría 2 del sistema de HUD. Igual que views-panel.js,
// necesita referencias directas (scene, strokeEngine, renderer) que no
// viven en el store — por eso se arma en scene-demo.js.
// ============================================================================
import { register } from '../hud-manager.js';
import { attachPopover } from '../popover.js';
import { downloadProject, pickAndLoadProject, exportImage } from '../../persistence/save-load.js';
import { icon } from '../icons.js';

export function createFilePanel({ id, slot, order, scene, strokeEngine, renderer, onToast, exportOpts = {}, loadOpts }) {
  const trigger = document.createElement('button');
  trigger.className = 'hud-fab';
  trigger.innerHTML = icon('folder');
  trigger.title = 'Guardar / Cargar / Exportar';
  trigger.setAttribute('aria-label', 'Archivo');

  const panel = document.createElement('div');
  panel.className = 'hud-panel file-panel';
  panel.innerHTML = `
    <div class="panel-title">ARCHIVO</div>
    <button class="panel-action" data-action="save">${icon('save')}<span>Guardar proyecto</span></button>
    <button class="panel-action" data-action="load">${icon('load')}<span>Cargar proyecto</span></button>
    <button class="panel-action" data-action="export">${icon('image')}<span>Exportar imagen</span></button>
  `;

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('.panel-action');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.action;
    if (action === 'save') {
      downloadProject(scene);
      if (onToast) onToast('Proyecto descargado');
    } else if (action === 'load') {
      pickAndLoadProject(scene, strokeEngine, (err) => {
        if (onToast) onToast(err ? 'No se pudo cargar el archivo' : 'Proyecto cargado');
      }, loadOpts);
    } else if (action === 'export') {
      exportImage(renderer, exportOpts);
      if (onToast) onToast('Imagen exportada');
    }
    pop.close();
  });

  const pop = attachPopover({ trigger, panel });

  register({ id, slot, order, el: trigger });
  return { el: trigger };
}
