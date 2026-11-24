// node tests/run-all.mjs  (o: npm test) — corre todas las pruebas unitarias
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const dir = new URL('.', import.meta.url).pathname;
const files = readdirSync(dir).filter((f) => f.endsWith('.test.js')).sort();
let passed = 0, failed = 0;
const broken = [];
for (const f of files) {
  const r = spawnSync(process.execPath, [dir + f], { encoding: 'utf8' });
  const m = (r.stdout + r.stderr).match(/(\d+) pasaron, (\d+) fallaron/);
  const p = m ? +m[1] : 0, fl = m ? +m[2] : 1;
  passed += p; failed += fl;
  const ok = r.status === 0 && fl === 0;
  console.log(`${ok ? '✓' : '✗'} ${f.padEnd(28)} ${m ? `${p} pasaron, ${fl} fallaron` : 'no terminó'}`);
  if (!ok) broken.push({ f, out: (r.stdout + r.stderr).split('\n').filter((l) => l.includes('FALLÓ') || l.includes('Error')).slice(0, 8).join('\n') });
}
broken.forEach(({ f, out }) => console.log(`\n── ${f} ──\n${out}`));
console.log(`\nTotal: ${passed} pasaron, ${failed} fallaron (${files.length} archivos)`);
process.exit(failed > 0 || broken.length ? 1 : 0);
