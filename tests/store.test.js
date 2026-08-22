// node tests/store.test.js
import { getState, setState, subscribe } from '../js/core/store.js';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }

const s0 = getState();
assert(s0.activeTool === 'brush', `el estado inicial debe tener activeTool='brush', tiene '${s0.activeTool}'`);

setState({ activeTool: 'eraser' });
assert(getState().activeTool === 'eraser', 'setState debe reflejarse en el próximo getState()');
assert(getState().activeVariant === 'pencil', 'setState con patch parcial no debe pisar los otros campos');

let calls = 0, lastSeen = null;
const unsub = subscribe((s) => { calls++; lastSeen = s; });
setState({ brushWidth: 0.05 });
assert(calls === 1, `subscribe debe notificarse en cada setState, se llamó ${calls} veces`);
assert(lastSeen.brushWidth === 0.05, 'el listener debe recibir el estado ya actualizado');

unsub();
setState({ brushWidth: 0.1 });
assert(calls === 1, 'tras des-suscribirse, no debe seguir notificando');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
