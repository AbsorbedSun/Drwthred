# DrwThred — build local

Fork personal de [sketchbook-v8](https://github.com/notebysebas/sketchbook-v8)
de **notebysebas** — todo el crédito del motor de dibujo 3D original es
suyo. Este proyecto solo reorganiza y reestiliza la interfaz para uso propio.

Este proyecto ahora está separado en `index.html` / `style.css` / `js/*.js`
en vez de un único archivo de 12,800 líneas. Ver `CHANGES.md` para el detalle
completo de qué se tocó y qué no.

## Cómo correrlo

**Opción recomendada — servidor local** (necesario para que el Service
Worker funcione y la app sea instalable como PWA offline):

```bash
cd drwthred
python3 -m http.server 8000
# abre http://localhost:8000 en el navegador
```

Alternativas si no tienes Python: `npx serve .` o la extensión "Live Server"
de VS Code (clic derecho sobre `index.html` → "Open with Live Server").

**Opción rápida — sin servidor:** también puedes abrir `index.html`
directamente con doble clic. Todo funciona igual (dibujo, gizmos,
exportar/guardar, IndexedDB), *excepto* el Service Worker, que los
navegadores no permiten registrar sobre `file://`. Esto ya pasaba en el
archivo original de una sola pieza — no es una regresión de este refactor.

## Estructura

```
index.html              ← estructura de la página + toda la UI (igual que antes)
style.css                ← todo el CSS, con escalas de tamaño/radio centralizadas
sw.js                    ← service worker (cache offline), actualizado con la nueva lista de archivos
manifest.json             ← metadata de la PWA (sin cambios)
icons/                    ← íconos de la app (sin cambios)
js/
  core-scene-setup.js     ← escena/cámara/renderer, helpers de ejes compartidos
  local-plane-gizmo.js    ← gizmo 2D del plano de dibujo activo
  rendering-strokes.js    ← raycasting, temas, materiales, física de trazo, selección, capas
  input-gestures.js       ← toast, gestos, ratón/touch/stylus unificado
  pages-views-io.js       ← páginas, vistas guardadas, exportar PNG, guardar/cargar, autosave
  record-surface-gizmo.js ← grabación de vistas (webm) + gizmo de superficie
  stroke-gizmo.js         ← mover/rotar/escalar trazos seleccionados
  loft-primitives.js      ← loft + primitivas/objetos de referencia
  navigation-controls.js  ← NavCube, joystick, navegación FPS
  narrow-ui-bindings.js   ← botones de ciclo, wiring general de UI, menú de archivo
  sidecol-floatcard.js    ← columna lateral y tarjeta flotante en modo angosto
  selection-ruler.js      ← controles de selección + regla de medición
```

Los archivos `js/*.js` se cargan como `<script>` normales (no ES modules) en
el mismo orden en que aparecían en el archivo original, así que comparten
el mismo scope global de siempre — nada de la lógica interna cambió.
