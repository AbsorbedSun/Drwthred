// ============================================================================
// DIALOG — confirmaciones y formularios chicos con el estilo de la app.
// En iPad, window.confirm() bloquea la página y se ve como un error del
// sistema; acá es una hoja que respeta el tema y los tamaños táctiles.
// ============================================================================

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'app-dialog';
  document.body.appendChild(host);
  return host;
}

/**
 * Hoja de diálogo genérica. `body` es un nodo (o HTML) con el contenido;
 * `buttons` = [{ label, value, kind: 'primary'|'danger'|'' }].
 * @returns {Promise<any>} el `value` del botón elegido (null si se cancela)
 */
export function openDialog({ title, message = '', body = null, buttons }) {
  const h = ensureHost();
  return new Promise((resolve) => {
    h.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'dialog-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const t = document.createElement('h2');
    t.textContent = title;
    card.appendChild(t);
    if (message) {
      const p = document.createElement('p');
      p.textContent = message;
      card.appendChild(p);
    }
    if (body) {
      if (typeof body === 'string') card.insertAdjacentHTML('beforeend', body);
      else card.appendChild(body);
    }
    const row = document.createElement('div');
    row.className = 'dialog-buttons';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      h.classList.remove('open');
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    buttons.forEach((b) => {
      const btn = document.createElement('button');
      btn.className = 'dialog-btn' + (b.kind ? ` ${b.kind}` : '');
      btn.textContent = b.label;
      btn.addEventListener('click', (e) => { e.stopPropagation(); finish(typeof b.value === 'function' ? b.value() : b.value); });
      row.appendChild(btn);
    });
    card.appendChild(row);
    h.appendChild(card);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); finish(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
        const primary = buttons.find((b) => b.kind === 'primary' || b.kind === 'danger');
        if (primary) { e.preventDefault(); finish(typeof primary.value === 'function' ? primary.value() : primary.value); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    h.onpointerdown = (e) => { if (e.target === h) finish(null); };
    requestAnimationFrame(() => {
      h.classList.add('open');
      const first = card.querySelector('input, select') || row.querySelector('.primary, .danger');
      if (first) first.focus();
    });
  });
}

/** Confirmación sí/no. @returns {Promise<boolean>} */
export async function confirmDialog(title, message, { ok = 'Aceptar', danger = false } = {}) {
  const v = await openDialog({
    title, message,
    buttons: [{ label: 'Cancelar', value: false }, { label: ok, value: true, kind: danger ? 'danger' : 'primary' }],
  });
  return v === true;
}

/** Pide un texto (ej: renombrar). @returns {Promise<string|null>} */
export async function promptDialog(title, initial = '', { ok = 'Aceptar', placeholder = '' } = {}) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'dialog-input';
  input.value = initial;
  input.placeholder = placeholder;
  input.maxLength = 60;
  const v = await openDialog({
    title, body: input,
    buttons: [{ label: 'Cancelar', value: null }, { label: ok, value: () => input.value.trim(), kind: 'primary' }],
  });
  return v ? v : null;
}
