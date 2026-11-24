// ============================================================================
// SERVICE WORKER — hace que la app funcione SIN CONEXIÓN y se pueda instalar.
// La primera visita guarda todos los archivos de la app; después se abre
// desde esa copia aunque no haya internet.
//
// La lista y la versión las genera `node tools/update-sw.mjs` — no editar a
// mano. Al cambiar la versión, el navegador baja la app nueva en segundo
// plano y la usa en la próxima apertura.
// ============================================================================
const VERSION = '6b3088cb1e';
const CACHE = `drwthred-${VERSION}`;
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "manifest.webmanifest",
  "fonts/dm-mono-latin-400-normal.woff2",
  "fonts/dm-mono-latin-500-normal.woff2",
  "fonts/dm-sans-latin-400-normal.woff2",
  "fonts/dm-sans-latin-500-normal.woff2",
  "fonts/dm-sans-latin-700-normal.woff2",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/icon.svg",
  "js/app.js",
  "js/core/camera-controller.js",
  "js/core/history.js",
  "js/core/scene.js",
  "js/core/store.js",
  "js/core/views.js",
  "js/drawing/brushes.js",
  "js/drawing/draw-planes.js",
  "js/drawing/eraser.js",
  "js/drawing/layers.js",
  "js/drawing/object-actions.js",
  "js/drawing/plane-guide.js",
  "js/drawing/plane-projection.js",
  "js/drawing/primitives.js",
  "js/drawing/references.js",
  "js/drawing/selection.js",
  "js/drawing/shape-recognition.js",
  "js/drawing/snapping.js",
  "js/drawing/stroke-engine.js",
  "js/drawing/transform.js",
  "js/input/gestures.js",
  "js/input/tool-router.js",
  "js/persistence/autosave.js",
  "js/persistence/export.js",
  "js/persistence/save-load.js",
  "js/ui/dialog.js",
  "js/ui/export-dialog.js",
  "js/ui/help-sheet.js",
  "js/ui/hud-manager.js",
  "js/ui/icons.js",
  "js/ui/panels/file-panel.js",
  "js/ui/panels/layers-panel.js",
  "js/ui/panels/nav-gizmo.js",
  "js/ui/panels/plane-bar.js",
  "js/ui/panels/selection-bar.js",
  "js/ui/panels/settings-panel.js",
  "js/ui/panels/size-slider.js",
  "js/ui/panels/toolbar.js",
  "js/ui/panels/views-panel.js",
  "js/ui/popover.js",
  "js/ui/toast.js",
  "js/vendor/addons/GLTFExporter.js",
  "js/vendor/addons/OBJExporter.js",
  "js/vendor/addons/USDZExporter.js",
  "js/vendor/libs/fflate.module.js",
  "js/vendor/three.core.min.js",
  "js/vendor/three.module.js"
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('drwthred-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Primero la copia guardada (rápido y funciona offline); si no está, la red
// (y se guarda para la próxima).
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone(); // antes de devolverla: después el cuerpo ya se leyó
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
