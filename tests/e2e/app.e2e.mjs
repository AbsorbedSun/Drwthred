// npm run test:e2e  (o: node tests/e2e/app.e2e.mjs)
// Pruebas de integración: la app real en Chromium (Playwright), con gestos
// simulados. Reemplazan a las viejas pruebas en Python. Levanta su propio
// servidor (tools/serve.mjs): no hace falta nada más.
import { createRequire } from 'node:module';
// require (no import): encuentra Playwright tanto instalado con npm en el
// proyecto como instalado globalmente
const { chromium } = createRequire(import.meta.url)('playwright');
import { serve } from '../../tools/serve.mjs';

let pass = 0, fail = 0;
function assert(cond, msg) { cond ? pass++ : (fail++, console.error('FALLÓ:', msg)); }
const section = (t) => console.log(`\n· ${t}`);

const PORT = 8000 + Math.floor(Math.random() * 900);
const server = await serve(PORT);
const URL = `http://localhost:${PORT}/index.html`;
const browser = await chromium.launch();

async function openApp(viewport = { width: 1180, height: 820 }, { fresh = true, mobile = false } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: mobile, acceptDownloads: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  if (fresh) {
    await page.evaluate(() => new Promise((r) => { const q = indexedDB.deleteDatabase('drwthred'); q.onsuccess = q.onerror = q.onblocked = r; }));
    await page.reload({ waitUntil: 'networkidle' });
  }
  if (await page.locator('.help-sheet.open').count()) await page.click('.sheet-ok');
  return { ctx, page };
}

/** Dispara una secuencia de eventos de puntero sobre el lienzo. [tipo, id, x, y, pointerType?, presión?] */
const fire = (page, seq) => page.evaluate((seq) => {
  const el = document.getElementById('scene-canvas');
  for (const [type, id, x, y, pt = '', p = 0.5] of seq) {
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType: pt, pressure: p, buttons: type === 'pointerup' ? 0 : 1, bubbles: true, cancelable: true }));
  }
}, seq);
const line = (id, x0, y0, x1, y1, n = 12, pt = '') => [
  ['pointerdown', id, x0, y0, pt], ...Array.from({ length: n }, (_, i) => ['pointermove', id, x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n, pt]), ['pointerup', id, x1, y1, pt],
];
const count = (page, kind) => page.evaluate((k) => window.__scene.children.filter((o) => o.userData[k]).length, kind);
const cam = (page) => page.evaluate(() => ({ theta: window.__camCtl.state.theta, radius: window.__camCtl.state.radius, target: window.__camCtl.state.target.toArray() }));

try {
  // ── Gestos con el dedo (modo táctil) ──
  section('Gestos con el dedo');
  {
    const { ctx, page } = await openApp();
    const c0 = await cam(page);
    await fire(page, [['pointerdown', 1, 400, 300], ['pointerdown', 2, 460, 300], ['pointermove', 1, 480, 300], ['pointermove', 2, 540, 300], ['pointerup', 1, 480, 300], ['pointerup', 2, 540, 300]]);
    const c1 = await cam(page);
    assert(c1.theta !== c0.theta, '2 dedos orbitan');
    await fire(page, [['pointerdown', 1, 300, 300], ['pointerdown', 2, 360, 300], ['pointerdown', 3, 420, 300], ['pointermove', 1, 260, 340], ['pointermove', 2, 320, 340], ['pointermove', 3, 380, 340], ['pointerup', 1, 260, 340], ['pointerup', 2, 320, 340], ['pointerup', 3, 380, 340]]);
    const c2 = await cam(page);
    assert(JSON.stringify(c2.target) !== JSON.stringify(c1.target), '3 dedos mueven la vista (pan)');
    await fire(page, [['pointerdown', 1, 440, 300], ['pointerdown', 2, 460, 300], ['pointermove', 1, 340, 300], ['pointermove', 2, 560, 300], ['pointerup', 1, 340, 300], ['pointerup', 2, 560, 300]]);
    assert((await cam(page)).radius < c2.radius, 'pellizco = zoom');
    const s0 = await count(page, 'strokePoints');
    await fire(page, line(1, 400, 300, 520, 330));
    assert((await count(page, 'strokePoints')) === s0 + 1, '1 dedo dibuja');
    await fire(page, [['pointerdown', 1, 300, 500], ['pointermove', 1, 340, 520], ['pointerdown', 2, 400, 500], ['pointermove', 1, 360, 540], ['pointerup', 1, 360, 540], ['pointerup', 2, 420, 520]]);
    assert(!(await page.evaluate(() => window.__strokeEngine.isDrawing())), 'un 2º dedo a mitad de trazo no deja el trazo colgado');
    const before = await count(page, 'strokePoints');
    await fire(page, [['pointerdown', 7, 500, 300], ['pointerdown', 8, 560, 300], ['pointerup', 7, 500, 300], ['pointerup', 8, 560, 300]]);
    assert((await count(page, 'strokePoints')) === before - 1, 'toque con 2 dedos = deshacer');
    assert(page.errors.length === 0, `sin errores de página (${page.errors.join(' | ')})`);
    await ctx.close();
  }

  // ── Lápiz ──
  section('Lápiz');
  {
    const { ctx, page } = await openApp();
    await page.click('.plane-ground');
    await fire(page, line(10, 400, 450, 700, 470, 30, 'pen'));
    const info = await page.evaluate(() => ({ pen: window.__store.getState().penDetected, last: window.__scene.children.filter((o) => o.userData.strokePoints).at(-1).userData }));
    assert(info.pen, 'se detecta el lápiz');
    assert(info.last.strokeFaceNormal && info.last.strokeFaceNormal[1] === 1, 'el trazo queda apoyado en el plano Suelo');
    const t0 = (await cam(page)).theta;
    const n0 = await count(page, 'strokePoints');
    await fire(page, line(20, 500, 400, 600, 400, 10, 'touch'));
    assert((await cam(page)).theta !== t0 && (await count(page, 'strokePoints')) === n0, 'con lápiz, el dedo orbita y no dibuja');
    await ctx.close();
  }

  // ── Hover del lápiz ──
  section('Hover del lápiz');
  {
    const { ctx, page } = await openApp();
    const hover = (x, y) => page.evaluate(([x, y]) => document.getElementById('scene-canvas').dispatchEvent(
      new PointerEvent('pointermove', { pointerId: 30, pointerType: 'pen', buttons: 0, clientX: x, clientY: y, bubbles: true })), [x, y]);
    await hover(500, 400);
    await page.waitForTimeout(80);
    assert(await page.locator('.hover-dot.show').count() === 1, 'acercar el lápiz sin tocar muestra dónde caería el trazo');
    await fire(page, line(31, 400, 350, 600, 350, 12, 'pen'));
    await hover(601, 352);
    await page.waitForTimeout(80);
    assert(await page.locator('.hover-dot.snapped').count() === 1, 'cerca de la punta de otro trazo, avisa que el imán va a enganchar');
    await page.evaluate(() => window.__store.setState({ activeTool: 'eraser' }));
    await hover(500, 500);
    await page.waitForTimeout(80);
    assert(await page.locator('.hover-dot.show').count() === 0, 'con otras herramientas no se muestra');
    await ctx.close();
  }

  // ── Selección, lazo y acciones ──
  section('Lazo y acciones');
  {
    const { ctx, page } = await openApp();
    await page.evaluate(() => window.__store.setState({ activeTool: 'shapes', activeVariant: 'cube' }));
    await fire(page, [['pointerdown', 1, 520, 400, 'pen'], ['pointerup', 1, 520, 400, 'pen']]);
    await fire(page, [['pointerdown', 1, 660, 400, 'pen'], ['pointerup', 1, 660, 400, 'pen']]);
    await page.evaluate(() => window.__store.setState({ activeTool: 'select', activeVariant: 'select-lasso', selectedIds: [] }));
    const loop = Array.from({ length: 40 }, (_, i) => { const a = (i / 39) * Math.PI * 2; return [590 + Math.cos(a) * 200, 400 + Math.sin(a) * 120]; });
    await fire(page, [['pointerdown', 2, ...loop[0], 'pen'], ...loop.slice(1).map((p) => ['pointermove', 2, ...p, 'pen']), ['pointerup', 2, ...loop[39], 'pen']]);
    assert((await page.evaluate(() => window.__store.getState().selectedIds.length)) === 2, 'el lazo selecciona las 2 figuras');
    assert(await page.locator('.hud-selbar.show').count() === 1, 'aparece la barra de acciones');
    await page.click('.selbar-btn[aria-label="Duplicar"]');
    assert((await count(page, 'primitiveKind')) === 4, 'duplicar');
    await page.click('.selbar-btn[aria-label="Eliminar"]');
    assert((await count(page, 'primitiveKind')) === 2, 'eliminar');
    await page.click('.hud-fab[aria-label="Deshacer"]');
    assert((await count(page, 'primitiveKind')) === 4, 'deshacer');
    await ctx.close();
  }

  // ── Autoguardado y sin conexión ──
  section('Autoguardado y sin conexión');
  {
    const { ctx, page } = await openApp();
    await fire(page, line(4, 400, 400, 700, 420, 20, 'pen'));
    await page.waitForTimeout(2600);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    assert((await count(page, 'strokePoints')) === 1, 'el dibujo sobrevive a recargar la página');
    await ctx.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(600);
    assert(await page.evaluate(() => !!window.__scene && document.fonts.check('16px "DM Sans"')), 'sin conexión la app abre igual, con sus fuentes');
    await ctx.setOffline(false);
    await ctx.close();
  }

  // ── Exportar ──
  section('Exportar');
  {
    const { ctx, page } = await openApp({ width: 900, height: 600 });
    await fire(page, line(4, 300, 300, 600, 300, 20, 'pen'));
    for (const [f, sig] of [['png', '\x89PNG'], ['glb', 'glTF'], ['usdz', 'PK\x03\x04']]) {
      await page.click('.hud-fab[aria-label="Archivo"]');
      await page.click('.panel-action[data-action="export"]');
      if (f !== 'png') await page.click(`.export-formats button[data-f="${f}"]`);
      const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.dialog-btn.primary')]);
      const buf = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c));
      assert(dl.suggestedFilename().endsWith(f) && buf.toString('latin1', 0, 4) === sig, `exporta ${f.toUpperCase()} válido`);
    }
    await ctx.close();
  }

  // ── Diseño en 4 tamaños ──
  section('Diseño (tablet y teléfono)');
  for (const [name, w, h, mobile] of [['iPad horizontal', 1180, 820], ['iPad vertical', 820, 1180], ['teléfono', 390, 844, true], ['teléfono acostado', 844, 390, true]]) {
    const { ctx, page } = await openApp({ width: w, height: h }, { mobile });
    await page.evaluate(() => window.__store.setState({ activeTool: 'shapes', activeVariant: 'cube' }));
    await fire(page, [['pointerdown', 1, w / 2, h / 2, 'pen'], ['pointerup', 1, w / 2, h / 2, 'pen']]); // así aparece la barra de selección
    await page.waitForTimeout(250);
    const rects = await page.evaluate(() => [...document.querySelectorAll('.hud-item')].filter((e) => e.offsetWidth && getComputedStyle(e).opacity !== '0')
      .map((e) => { const r = e.getBoundingClientRect(); return { c: e.className.split(' ')[0], x: r.left, y: r.top, r: r.right, b: r.bottom }; }));
    const overlaps = [];
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => { if (a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b) overlaps.push(`${a.c}×${b.c}`); }));
    const outside = rects.filter((r) => r.x < 0 || r.y < 0 || r.r > w || r.b > h).map((r) => r.c);
    assert(overlaps.length === 0, `${name}: nada se superpone (${overlaps.join(', ')})`);
    assert(outside.length === 0, `${name}: nada se sale de la pantalla (${outside.join(', ')})`);
    assert(page.errors.length === 0, `${name}: sin errores`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n${pass} pasaron, ${fail} fallaron`);
process.exit(fail > 0 ? 1 : 0);
