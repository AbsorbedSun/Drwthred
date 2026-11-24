// node tests/pwa.test.js — la app instalable/offline está bien armada
import { readFileSync, existsSync } from 'node:fs';
import { assetList, contentHash } from '../tools/update-sw.mjs';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
const root = new URL('..', import.meta.url).pathname;

const sw = readFileSync(root + 'sw.js', 'utf8');
const listed = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1]);
const expected = assetList();
const missing = expected.filter((f) => !listed.includes(f));
const extra = listed.filter((f) => !expected.includes(f));
assert(missing.length === 0 && extra.length === 0,
  `la lista de sw.js está al día — correr "node tools/update-sw.mjs" (faltan: ${missing.join(', ') || '-'}; sobran: ${extra.join(', ') || '-'})`);
assert(sw.includes(`const VERSION = '${contentHash(expected)}';`), 'la versión de sw.js corresponde al contenido actual (si no, los navegadores no ven la actualización)');
assert(listed.every((f) => f === './' || existsSync(root + f)), 'todos los archivos listados existen');
assert(listed.includes('js/app.js') && listed.includes('js/vendor/three.module.js') && listed.includes('js/vendor/three.core.min.js'), 'incluye la app y Three.js');
assert(listed.every((f) => !f.startsWith('/')), 'rutas relativas (funciona en usuario.github.io/Drwthred/)');

const manifest = JSON.parse(readFileSync(root + 'manifest.webmanifest', 'utf8'));
assert(manifest.icons.every((i) => existsSync(root + i.src)), 'los íconos del manifiesto existen');
assert(manifest.icons.some((i) => i.purpose === 'maskable') && manifest.icons.some((i) => i.sizes === '512x512'), 'ícono de 512 y versión "maskable" (Android)');
assert(manifest.start_url === './' && manifest.scope === './', 'start_url/scope relativos');

const html = readFileSync(root + 'index.html', 'utf8');
assert(html.includes('rel="manifest"') && html.includes('apple-touch-icon'), 'index.html enlaza el manifiesto y el ícono de iOS');
const css = readFileSync(root + 'style.css', 'utf8');
assert(!/fonts\.googleapis|https?:\/\//.test(css), 'el CSS no depende de internet (fuentes locales)');
const fonts = [...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((m) => m[1]);
assert(fonts.length >= 5 && fonts.every((f) => existsSync(root + f)), 'las fuentes declaradas existen');

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
