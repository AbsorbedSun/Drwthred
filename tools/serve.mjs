// node tools/serve.mjs [puerto]  — servidor estático mínimo, sin dependencias.
// Sirve la app para probarla localmente (http://localhost:8080) y lo usan
// las pruebas de integración. localhost cuenta como "seguro": el service
// worker (modo sin conexión) también funciona acá.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

export function serve(port = 8080) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      let file = join(ROOT, path);
      if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && process.argv[1].endsWith('serve.mjs')) {
  const port = +(process.argv[2] || process.env.PORT || 8080);
  serve(port).then(() => console.log(`Drwthred en http://localhost:${port}`));
}
