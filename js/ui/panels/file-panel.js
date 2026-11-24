// ============================================================================
// FILE PANEL — menú Archivo. No sabe qué hace cada acción: recibe la lista
// desde app.js ({ id, icon, label, run, separatorBefore }). Así sumar una
// acción (exportar 3D, imagen de referencia...) no toca este archivo.
// ============================================================================
import { register } from '../hud-manager.js';
import { attachPopover } from '../popover.js';
import { icon } from '../icons.js';

export function createFilePanel({ id, slot, order, actions, footer = null }) {
  const trigger = document.createElement('button');
  trigger.className = 'hud-fab';
  trigger.innerHTML = icon('folder');
  trigger.title = 'Archivo';
  trigger.setAttribute('aria-label', 'Archivo');

  const panel = document.createElement('div');
  panel.className = 'hud-panel file-panel';
  panel.innerHTML = '<div class="panel-title">ARCHIVO</div>';
  actions.forEach((a) => {
    if (a.separatorBefore) {
      const sep = document.createElement('div');
      sep.className = 'panel-sep';
      panel.appendChild(sep);
    }
    const b = document.createElement('button');
    b.className = 'panel-action' + (a.danger ? ' danger' : '');
    b.dataset.action = a.id;
    b.innerHTML = `${icon(a.icon)}<span>${a.label}</span>`;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      pop.close();
      a.run();
    });
    panel.appendChild(b);
  });
  let footerEl = null;
  if (footer) {
    footerEl = document.createElement('div');
    footerEl.className = 'panel-footer';
    panel.appendChild(footerEl);
  }

  const pop = attachPopover({ trigger, panel, onOpen: () => { if (footerEl) footerEl.textContent = footer(); } });

  register({ id, slot, order, el: trigger });
  return { el: trigger };
}
