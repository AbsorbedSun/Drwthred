// node tools/update-sw.mjs
// Regenera la lista de archivos que el service worker (sw.js) guarda para
// usar la app sin conexión, y le cambia la versión (así los navegadores
// descargan la actualización). Correrlo después de agregar/quitar archivos;
// tests/pwa.test.js falla si la lista quedó desactualizada.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname;
const INCLUDE_DIRS = ['js', 'fonts', 'icons'];
const ROOT_FILES = ['index.html', 'style.css', 'manifest.webmanifest'];
const SKIP = (p) => /\.(map|md|txt)$/.test(p) || p.endsWith('LICENSE') || p.includes('/vendor/three.core.min.js.map');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function assetList() {
  const files = INCLUDE_DIRS.flatMap((d) => walk(join(ROOT, d))).map((p) => relative(ROOT, p)).filter((p) => !SKIP(p));
  return ['./', ...ROOT_FILES, ...files.sort()];
}

export function contentHash(list) {
  const h = createHash('sha256');
  list.filter((f) => f !== './').forEach((f) => h.update(f).update(readFileSync(join(ROOT, f))));
  return h.digest('hex').slice(0, 10);
}

if (process.argv[1] && process.argv[1].endsWith('update-sw.mjs')) {
  const list = assetList();
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8')
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${contentHash(list)}';`)
    .replace(/const ASSETS = \[[\s\S]*?\];/, `const ASSETS = ${JSON.stringify(list, null, 2)};`);
  writeFileSync(join(ROOT, 'sw.js'), sw);
  console.log(`sw.js: ${list.length} archivos, versión ${contentHash(list)}`);
}
