// node tests/history.test.js
import { pushAction, undo, redo, canUndo, canRedo, subscribeHistory, _clearHistory } from '../js/core/history.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

_clearHistory();
assert(!canUndo(), 'al inicio no debe haber nada para deshacer');
assert(!canRedo(), 'al inicio no debe haber nada para rehacer');
assert(undo() === false, 'undo() sin acciones debe devolver false, no explotar');
assert(redo() === false, 'redo() sin acciones debe devolver false, no explotar');

// ── Ciclo básico: push → undo → redo ──
let value = 0;
pushAction({ undo: () => { value -= 1; }, redo: () => { value += 1; } });
value = 1; // simula que la acción original ya se ejecutó antes de registrarse
assert(canUndo(), 'tras pushAction debe poder deshacerse');
assert(!canRedo(), 'tras pushAction todavía no debe poder rehacerse');

const undone = undo();
assert(undone === true, 'undo() con una acción pendiente debe devolver true');
assert(value === 0, `undo() debe haber ejecutado la función de deshacer (value=${value})`);
assert(!canUndo(), 'tras deshacer la única acción, no debe quedar más para deshacer');
assert(canRedo(), 'tras deshacer, debe poder rehacerse');

const redone = redo();
assert(redone === true, 'redo() debe devolver true');
assert(value === 1, `redo() debe haber vuelto a aplicar la acción (value=${value})`);
assert(canUndo(), 'tras rehacer, debe poder deshacerse de nuevo');
assert(!canRedo(), 'tras rehacer todo, no debe quedar más para rehacer');

// ── Una acción nueva invalida el "rehacer" pendiente ──
_clearHistory();
pushAction({ undo: () => {}, redo: () => {} });
undo();
assert(canRedo(), 'debe poder rehacerse tras deshacer');
pushAction({ undo: () => {}, redo: () => {} }); // acción nueva mientras había un redo pendiente
assert(!canRedo(), 'una acción nueva debe invalidar el redo pendiente (como en cualquier editor)');

// ── Suscripción ──
_clearHistory();
let notifications = [];
const unsub = subscribeHistory((info) => notifications.push({ ...info }));
pushAction({ undo: () => {}, redo: () => {} });
assert(notifications.length === 1, `pushAction debe notificar, hubo ${notifications.length} notificaciones`);
assert(notifications[0].canUndo === true && notifications[0].canRedo === false, 'la notificación debe reflejar el estado correcto');
undo();
assert(notifications.length === 2, 'undo() también debe notificar');
assert(notifications[1].canUndo === false && notifications[1].canRedo === true, 'tras undo, canUndo=false y canRedo=true');
unsub();
redo();
assert(notifications.length === 2, 'tras des-suscribirse, no debe seguir notificando');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
