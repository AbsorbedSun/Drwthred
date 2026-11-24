// ============================================================================
// SETTINGS PANEL — cómo se comporta la entrada: quién dibuja (lápiz o
// dedo), suavizado del trazo y presión. Todo vive en el store; gestures.js
// y tool-router.js lo leen en el momento, sin que nadie les avise.
// ============================================================================
import { register } from '../hud-manager.js';
import { attachPopover } from '../popover.js';
import { icon } from '../icons.js';
import { getState, setState, subscribe } from '../../core/store.js';

const SMOOTHING = [
  { id: 'off', label: 'No', value: 0 },
  { id: 'low', label: 'Bajo', value: 0.35 },
  { id: 'high', label: 'Alto', value: 0.65 },
];
const INPUT = [
  { id: 'auto', label: 'Auto' },
  { id: 'pen', label: 'Lápiz' },
  { id: 'touch', label: 'Dedo' },
];

export function isPenMode(st = getState()) {
  return st.inputMode === 'pen' || (st.inputMode === 'auto' && st.penDetected);
}

function segmented(options, onPick) {
  const el = document.createElement('div');
  el.className = 'seg-control';
  options.forEach((o) => {
    const b = document.createElement('button');
    b.dataset.id = o.id;
    b.textContent = o.label;
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick(o); });
    el.appendChild(b);
  });
  return el;
}

export function createSettingsPanel({ id = 'settings', slot = 'corner-top-left', order = 3, onHelp }) {
  const trigger = document.createElement('button');
  trigger.className = 'hud-fab';
  trigger.innerHTML = icon('gear');
  trigger.title = 'Ajustes';
  trigger.setAttribute('aria-label', 'Ajustes');

  const panel = document.createElement('div');
  panel.className = 'hud-panel settings-panel';
  panel.innerHTML = '<div class="panel-title">ENTRADA</div>';

  const input = segmented(INPUT, (o) => setState({ inputMode: o.id }));
  const inputHint = document.createElement('p');
  inputHint.className = 'panel-hint';

  const smoothTitle = document.createElement('div');
  smoothTitle.className = 'panel-title';
  smoothTitle.textContent = 'SUAVIZADO DEL TRAZO';
  const smooth = segmented(SMOOTHING, (o) => setState({ smoothing: o.value }));

  const pressureRow = document.createElement('label');
  pressureRow.className = 'switch-row';
  pressureRow.innerHTML = '<span>Presión del lápiz</span><input type="checkbox" role="switch"><span class="switch"></span>';
  const pressureInput = pressureRow.querySelector('input');
  pressureInput.addEventListener('change', () => setState({ pressure: pressureInput.checked }));

  const helpBtn = document.createElement('button');
  helpBtn.className = 'panel-action';
  helpBtn.innerHTML = `${icon('help')}<span>Ver gestos y atajos</span>`;
  helpBtn.addEventListener('click', (e) => { e.stopPropagation(); pop.close(); if (onHelp) onHelp(); });

  panel.append(input, inputHint, smoothTitle, smooth, pressureRow, helpBtn);
  const pop = attachPopover({ trigger, panel });

  function render(st) {
    input.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.id === st.inputMode));
    const nearest = SMOOTHING.reduce((a, b) => (Math.abs(b.value - st.smoothing) < Math.abs(a.value - st.smoothing) ? b : a));
    smooth.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.id === nearest.id));
    pressureInput.checked = !!st.pressure;
    inputHint.textContent = isPenMode(st)
      ? 'El lápiz dibuja · 1 dedo orbita · 2 dedos mueven y hacen zoom.'
      : 'El dedo dibuja · 2 dedos orbitan y hacen zoom · 3 dedos mueven.' +
        (st.inputMode === 'auto' ? ' (Cambia solo al detectar un lápiz.)' : '');
  }
  subscribe(render, (s) => [s.inputMode, s.penDetected, s.smoothing, s.pressure]);
  render(getState());

  register({ id, slot, order, el: trigger });
  return { el: trigger };
}
