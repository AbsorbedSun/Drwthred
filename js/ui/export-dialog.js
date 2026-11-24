// ============================================================================
// EXPORT DIALOG — Archivo → Exportar…: elegir formato y opciones.
//   Imagen PNG: tamaño (1×/2×/4×), fondo transparente, incluir referencias
//   3D: GLB / OBJ / USDZ, solo lo seleccionado, incluir capas ocultas
// ============================================================================
import { openDialog } from './dialog.js';

const FORMATS = [
  { id: 'png', label: 'Imagen PNG', hint: 'Lo que se ve, como imagen.' },
  { id: 'glb', label: '3D · GLB', hint: 'Blender, visores 3D, realidad aumentada en Android.' },
  { id: 'usdz', label: '3D · USDZ', hint: 'Realidad aumentada en iPhone/iPad (Quick Look).' },
  { id: 'obj', label: '3D · OBJ', hint: 'Compatible con casi todo; solo forma, sin color.' },
];

/**
 * @param {Object} ctx { hasSelection: boolean, hasReferences: boolean, hasHidden: boolean }
 * @returns {Promise<null|{format, scale, transparent, includeReferences, onlySelection, includeHidden}>}
 */
export async function openExportDialog({ hasSelection = false, hasReferences = false, hasHidden = false } = {}) {
  const form = document.createElement('div');
  form.className = 'export-form';
  form.innerHTML = `
    <div class="seg-control export-formats">${FORMATS.map((f, i) => `<button type="button" data-f="${f.id}" class="${i ? '' : 'active'}">${f.label}</button>`).join('')}</div>
    <p class="export-hint"></p>
    <div class="export-opts" data-for="png">
      <div class="panel-title">TAMAÑO</div>
      <div class="seg-control export-scale">
        <button type="button" data-s="1">1× pantalla</button><button type="button" data-s="2" class="active">2×</button><button type="button" data-s="4">4×</button>
      </div>
      <label class="switch-row"><span>Fondo transparente</span><input type="checkbox" name="transparent"><span class="switch"></span></label>
      ${hasReferences ? '<label class="switch-row"><span>Incluir imágenes de referencia</span><input type="checkbox" name="refs"><span class="switch"></span></label>' : ''}
    </div>
    <div class="export-opts" data-for="3d" hidden>
      ${hasSelection ? '<label class="switch-row"><span>Solo lo seleccionado</span><input type="checkbox" name="onlySel"><span class="switch"></span></label>' : ''}
      ${hasHidden ? '<label class="switch-row"><span>Incluir capas ocultas</span><input type="checkbox" name="hidden"><span class="switch"></span></label>' : ''}
      ${!hasSelection && !hasHidden ? '<p class="export-hint">Se exportan todos los trazos y figuras visibles.</p>' : ''}
    </div>`;
  let format = 'png', scale = 2;
  const hint = form.querySelector('.export-hint');
  const sync = () => {
    form.querySelectorAll('.export-formats button').forEach((b) => b.classList.toggle('active', b.dataset.f === format));
    form.querySelectorAll('.export-scale button').forEach((b) => b.classList.toggle('active', +b.dataset.s === scale));
    hint.textContent = FORMATS.find((f) => f.id === format).hint;
    form.querySelector('[data-for="png"]').hidden = format !== 'png';
    form.querySelector('[data-for="3d"]').hidden = format === 'png';
  };
  form.querySelectorAll('.export-formats button').forEach((b) => b.addEventListener('click', () => { format = b.dataset.f; sync(); }));
  form.querySelectorAll('.export-scale button').forEach((b) => b.addEventListener('click', () => { scale = +b.dataset.s; sync(); }));
  sync();
  const checked = (name) => { const el = form.querySelector(`input[name="${name}"]`); return !!(el && el.checked); };
  return openDialog({
    title: 'Exportar',
    body: form,
    buttons: [
      { label: 'Cancelar', value: null },
      { label: 'Exportar', kind: 'primary', value: () => ({
        format, scale,
        transparent: checked('transparent'),
        includeReferences: checked('refs'),
        onlySelection: checked('onlySel'),
        includeHidden: checked('hidden'),
      }) },
    ],
  });
}
