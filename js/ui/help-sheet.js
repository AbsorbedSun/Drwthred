// ============================================================================
// HELP SHEET — hoja de ayuda con los gestos. Reemplaza al panel de
// documentación que ocupaba el centro del lienzo al abrir la app: en una
// tablet eso tapaba justo donde uno quiere empezar a dibujar. Ahora se
// muestra una sola vez (primera visita) y después vive en Ajustes.
// ============================================================================
import { icon } from './icons.js';

const SEEN_KEY = 'drwthred.helpSeen.v2';

const HTML = `
  <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
    <button class="sheet-close" aria-label="Cerrar">${icon('close')}</button>
    <h1 id="help-title">Dibujar en 3D sobre planos</h1>
    <p class="sheet-lede">Cada trazo cae sobre el <strong>plano activo</strong>. Elegilo en la barra de abajo:
      <b>Libre</b> (de frente a la cámara), <b>Frente</b>, <b>Lado</b> o <b>Suelo</b>.
      Girá la vista y vas a ver tus dibujos en el espacio.</p>

    <div class="sheet-grid">
      <section>
        <h2>Con lápiz</h2>
        <ul>
          <li><span class="g">Lápiz</span> dibuja (con presión)</li>
          <li><span class="g">1 dedo</span> orbita</li>
          <li><span class="g">2 dedos</span> mueven y hacen zoom</li>
          <li>La palma apoyada se ignora mientras dibujás</li>
        </ul>
      </section>
      <section>
        <h2>Solo con el dedo</h2>
        <ul>
          <li><span class="g">1 dedo</span> dibuja</li>
          <li><span class="g">2 dedos</span> orbitan y hacen zoom</li>
          <li><span class="g">3 dedos</span> mueven la vista</li>
          <li>O arrastrá el indicador de ejes</li>
        </ul>
      </section>
      <section>
        <h2>Siempre</h2>
        <ul>
          <li><span class="g">Toque 2 dedos</span> deshacer</li>
          <li><span class="g">Toque 3 dedos</span> rehacer</li>
          <li><span class="g">Tocar un eje</span> ver desde ahí</li>
          <li><span class="g">Mantener</span> una herramienta: variantes</li>
        </ul>
      </section>
      <section>
        <h2>Planos</h2>
        <ul>
          <li>Tocar el plano activo otra vez: verlo de frente</li>
          <li>Arrastrar el chip <b>‹ ›</b>: alejar/acercar el plano</li>
          <li>Herramienta <b>Plano</b>: arrastrá para moverlo, o tocá un trazo para llevarlo ahí</li>
          <li><b>Espejo</b>: simetría en X</li>
        </ul>
      </section>
    </div>
    <button class="sheet-ok">Empezar a dibujar</button>
  </div>`;

export function createHelpSheet({ autoOpen = true } = {}) {
  const el = document.createElement('div');
  el.className = 'help-sheet';
  el.innerHTML = HTML;
  document.body.appendChild(el);

  function open() { el.classList.add('open'); }
  function close() {
    el.classList.remove('open');
    try { localStorage.setItem(SEEN_KEY, '1'); } catch (err) { /* modo privado: no pasa nada */ }
  }
  el.querySelector('.sheet-close').addEventListener('click', close);
  el.querySelector('.sheet-ok').addEventListener('click', close);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  let seen = false;
  try { seen = localStorage.getItem(SEEN_KEY) === '1'; } catch (err) { /* */ }
  if (autoOpen && !seen) open();
  return { open, close, el };
}
