# Qué cambió respecto al original

Regla que seguí en todo momento: **cero cambios de comportamiento**. Cada
cambio de abajo fue verificado automáticamente (parseo con AST de verdad,
no con ojo/regex a mano) antes de aceptarlo. Nada de esto se hizo "a ojo".

## 1. Estructura de archivos

- `index.html` (12,834 líneas, CSS y JS inline) → dividido en:
  - `index.html` (solo estructura + marcado de UI, sin cambios de contenido)
  - `style.css` (todo el CSS)
  - `js/*.js` (12 archivos, ~900 líneas promedio, divididos por sistema:
    escena/cámara, gizmo de plano local, render+trazos, input/gestos,
    páginas/vistas/export, grabación+gizmo de superficie, gizmo de trazo,
    loft+primitivas, navegación, bindings de UI, columna lateral, selección+regla)
- Se eliminó `index obsolete .html` (616 KB) — una copia vieja del mismo
  archivo, claramente un resto de un commit anterior, sin ninguna referencia
  desde ningún lado.
- Se eliminaron los 8 PNG de íconos duplicados que estaban sueltos en la raíz
  del proyecto (`icon-72.png` … `icon-512.png`). Ni `manifest.json` ni
  `index.html` los referencian — ambos apuntan siempre a `icons/icon-*.png`.
  Se conservó únicamente la carpeta `icons/`.

**Cómo se dividió el JS sin riesgo:** en vez de cortar por número de línea a
ojo, parseé todo el script con un parser real de JavaScript (acorn) y corté
únicamente en los límites de sentencias de nivel superior — nunca a mitad de
una función. Después de cada división reconstruí el archivo completo y lo
comparé byte a byte contra el original para confirmar que era idéntico.

## 2. Código muerto eliminado (JS)

Encontré 25 funciones que no se llamaban desde ningún lado — ni una sola vez
en todo el proyecto (script + HTML), verificado por nombre exacto. La mayoría
son una implementación vieja de los gizmos de selección, reemplazada por un
sistema de dibujo unificado (`_sgUnifiedDraw`) que sí está en uso; el propio
autor dejó un comentario confirmándolo: `drawNewSgArc(){} // stub —
_sgUnifiedDraw handles everything`.

Eliminadas (24 de las 25 — ver nota abajo):
`_einkDesat`, `_fpsIsOnUI`, `_handleAngle`, `_localAxisWorld`,
`_sgComputeArcs`, `_sgHandleAngle`, `_signedBoxPos`, `_syncWorldGroup`,
`aTip`, `addStroke`, `boxPos2`, `drawArrow`, `drawAxisShaft`, `drawBox`,
`drawNewSgArc`, `drawSgArc`, `drawSgArrow`, `drawSgBox`, `drawSgUniform`,
`drawUniformDot`, `getDrawPlane`, `rebuildStrokeMaterials`, `ringAxes`,
`signedDist`.

Dejé `resetDepthColors(){}` intacta a pesar de que tampoco se usa, porque el
propio código tiene un comentario justo ahí que dice *"Stubs kept for
undo/redo references"* — no quise pasar por encima de una nota explícita del
autor aunque mi análisis no encontrara ninguna referencia real.

Verificación: antes de borrar cada una confirmé que el nombre no aparece ni
una vez más en todo el proyecto (ni como llamada, ni como string, ni vía
`window[...]`/`this[...]` — tampoco existe ese patrón de despacho dinámico en
el código). Después de borrar, re-parseé el archivo completo para confirmar
que seguía siendo JS válido.

## 3. Código repetido consolidado (JS)

Cuatro funciones y una constante estaban copiadas y pegadas *exactamente
iguales* en dos gizmos distintos (superficie y trazo): `cameraLookDir`,
`axisDir2D`, `aDir`, `ringAxes3D` y la constante `WORLD` (esta última estaba
triplicada, también en el módulo de primitivas). Confirmé que `WORLD` nunca
se muta en ningún lado (solo se lee), así que es seguro compartir una única
copia. Ahora viven una sola vez, en `core-scene-setup.js`, como funciones
globales — el resto del código las sigue llamando exactamente igual porque
JavaScript resuelve el nombre por el scope de todas formas.

(Dejé sin tocar otro grupo de nombres duplicados como `onMove`, `onUp`,
`getPos`, `clamp` — esos *no* son código repetido real, son handlers locales
con el mismo nombre pero lógica distinta dentro de cada gizmo/joystick, así
que fusionarlos habría sido arriesgado para cero beneficio real.)

## 4. CSS — repetición eliminada + tokens

- El patrón `rgba(var(--ink-r),var(--ink-g),var(--ink-b),ALPHA)` aparecía
  **63 veces** con 17 valores de opacidad distintos. Lo reemplacé por
  `color-mix(in srgb, var(--ink) X%, transparent)`, que es matemáticamente
  equivalente (mismo resultado visual) pero no necesita las tres variables
  de canal por separado. Esto permitió borrar `--ink-r/--ink-g/--ink-b` de
  los 4 bloques de tema (default/dark/light/eink).
- Los tamaños de fuente (14 valores distintos, de 5px a 16px, repetidos 52
  veces) y los border-radius (12 valores, repetidos 86 veces) ahora son
  variables centralizadas (`--fs-*`, `--r-*`) declaradas una sola vez en
  `:root`. Ningún valor visual cambió — es exactamente la misma escala de
  antes, solo que ahora está en un solo lugar si en algún momento la quieres
  ajustar.
- Verificación: parseé el CSS final con un parser real (no regex) para
  confirmar que sigue siendo válido — 513 reglas, cero errores.

## 5. Retoque visual (lo único "nuevo")

Lo único que agregué visualmente, más allá de ordenar: un viñeteado muy
sutil en los bordes del lienzo 3D (`radial-gradient` al 10% de opacidad),
para que el canvas se sienta más como una página de cuaderno que como un
plano infinito. Se desactiva en el tema e-ink (que debe quedarse blanco
puro, sin sombreados). Es puramente decorativo — un `::before` nuevo que no
afecta ningún elemento interactivo.

Todo lo demás (paleta de colores, tamaños de botones, layout, posiciones)
se dejó igual a propósito: ya era una identidad visual con carácter propio
(el canvas/kraft cálido + tinta azul marino no es la paleta genérica que
sueles ver en herramientas hechas con IA), y tocar tamaños o posiciones en
una UI táctil tan afinada como esta es donde más fácil se rompe algo sin
querer.

## 6. `sw.js`

Actualicé la lista de archivos a cachear para que incluya `style.css` y los
12 archivos de `js/` (antes no hacía falta porque todo estaba inline en el
único HTML). Sin este cambio, el modo offline se hubiera roto con la nueva
estructura de archivos — no es una funcionalidad nueva, es necesaria para
mantener la que ya existía.

## Segunda ronda de cambios (rebautizo + rediseño)

**Nombre y crédito:** renombrado a **DrwThred** en título, manifest.json,
nombres de archivo de exportación por defecto, comentarios y metadata
embebida en archivos exportados (glTF/OBJ/USD). Se agregó un comentario de
atribución al inicio de `index.html` con el link al repo original de
**notebysebas** (https://github.com/notebysebas/sketchbook-v8).

Lo único que **NO** se tocó a propósito: el nombre interno de la base de
datos IndexedDB (`indexedDB.open('sketch3d',1)`, en `pages-views-io.js`).
Cambiarlo habría creado una base de datos nueva y vacía, huérfano de
cualquier autoguardado que ya exista bajo el nombre viejo.

**Paleta más clara:** el fondo por defecto pasó de café/kraft (`#cdb899`) a
un blanco cálido de papel (`#f4f1ea`) — no solo la variable CSS del tema,
sino también el color real de la escena 3D (`scene.background`,
`scene.fog`, `renderer.setClearColor`), que es lo que de verdad se ve todo
el tiempo mientras se dibuja. Se actualizó también el preset "fondo" del
selector de color (antes "Tan", ahora "Paper") y el `theme_color`/
`background_color` del manifest, para que el splash screen de la PWA
coincida. Se dejó sin tocar un swatch de color de trazo que por coincidencia
usaba el mismo tono café — es una opción de dibujo independiente, no algo
de fondo.

De paso corregí un detalle propio: el viñeteado que agregué en la ronda
anterior usaba `var(--ink)`, que en el tema oscuro es un color claro — eso
habría aclarado las esquinas del lienzo en vez de oscurecerlas. Lo dejé fijo
hacia negro para que funcione igual en cualquier tema.

**Navegación:** nuevo ajuste persistente (`View → NAV: GESTURES/JOYSTICKS`).
Por defecto la app usa solo gestos táctiles para orbitar/mover/zoom (que ya
existían) y el botón de ciclo NavCube↔Joystick↔FPS queda oculto; el NavCube
se mantiene fijo como acceso rápido para alinear la vista con un tap. El
ajuste puede revertirse en cualquier momento — nada del código de
Joystick/FPS se borró, solo se esconde.

**Agrupación de herramientas:** resulta que el autor original ya había
agrupado pincel/borrador/selección/tamaño/opacidad/color en un sistema de
tarjetas arrastrables (`sidecol`) — no hubo que reconstruir nada ahí. Lo que
sí cambié: por defecto ahora se acopla al **lado derecho** de la pantalla
(alcanzable con el pulgar, estilo Procreate/Concepts) en vez del izquierdo.
Esto usa un mecanismo de "flip de lado" que el propio autor ya había
construido y probado — solo cambié cuál es el valor por defecto.

*Pendiente si lo quieres:* el mockup mostraba un dock ultra angosto de solo
íconos en columna vertical. Lo que se implementó aquí es acoplar las
tarjetas existentes (que muestran los botones en filas horizontales) al
lado derecho — visualmente similar en espíritu, pero no idéntico al mockup
pixel por pixel. Si quieres esa versión más angosta/vertical, es un ajuste
de CSS adicional sobre esta misma base.

## Lo que NO toqué

- Ninguna posición, tamaño, z-index, ni breakpoint de la UI táctil.
- Ninguna lógica de dibujo, gizmos, cámara, export, guardado o IndexedDB.
- Los 4 temas de color (default/dark/light/eink) y sus valores hex.
- Los colores de eje X/Y/Z (rojo/verde/azul) — es una convención de
  herramientas 3D, cambiarlos rompería la memoria muscular de cualquiera
  que ya use el programa.

# Rediseño táctil para tablets (agosto 2026)

A diferencia de las secciones anteriores, este bloque **sí cambia
comportamiento** — fue un pedido explícito del usuario, no un refactor.
Se hizo por encima del trabajo previo (que ya había dejado el toggle
`NAV: GESTURES/JOYSTICKS` oculto por defecto sin borrar código). Esta vez
se pidió ir más lejos: eliminar los joysticks del todo, incluido el modo
FPS, y forzar la interfaz táctil en tablets.

## 1. Joysticks reemplazados por gestos táctiles

- **Joystick de paneo** (`navjoy`/`pb-navjoy`, ~160 líneas de fábrica de
  canvas) — eliminado por completo. Era redundante: el paneo por gesto
  directo sobre el canvas (2 y 3 dedos) ya existía y era la vía por
  defecto desde el cambio anterior.
- **Joysticks de modo FPS** (mirar + caminar) — eliminados y reemplazados
  por gestos multitáctiles nuevos en `input-gestures.js`:
  - **2 dedos** = mirar alrededor (arrastre relativo, mismo lenguaje que
    el resto de la app)
  - **3 dedos** = caminar — "joystick fantasma": el ancla se fija donde
    tocas, no hay widget fijo en pantalla; aparece un anillo semitransparente
    bajo los dedos como feedback y se desvanece al soltar
    (`#fps-move-hint` en `style.css`)
  - **1 dedo** sigue dibujando, igual que fuera del modo FPS — se
    preservó la posibilidad de dibujar mientras se camina
  - La física de movimiento (`fpsMoveTick`) no cambió, solo cómo se
    capturan los gestos que la alimentan
- El toggle de navegación pasó de 3 estados (Cubo/Joystick/FPS) a 2
  (Cubo/FPS) — ya no hay nada a lo que ciclar en el estado intermedio.
- El botón `NAV: GESTURES/JOYSTICKS` del popover de vista se eliminó
  (junto con su handler en `narrow-ui-bindings.js`) — ya no existe un modo
  "joysticks" al que alternar.
- Botones verticales de subir/bajar en FPS: antes había **3 pares
  duplicados** (uno en el joystick de mover, uno en el de mirar, uno en
  modo escritorio) — se consolidó a **un solo par**, más grande, dentro
  del panel FPS.

## 2. Layout táctil forzado en tablets

- `sidecol-floatcard.js` → `updateLayoutMode()`: el layout de paneles
  flotantes contextuales (`narrow-bar` + `pb-float-card`, que aparecen/
  desaparecen al tocar) antes solo se activaba con `ancho/alto < 2/3`
  — es decir, pantallas muy verticales tipo teléfono. En una tablet
  normal (4:3, 3:4, 16:10…) la app mostraba en cambio el layout de
  escritorio (`sidecol`/`topbar`), denso y pensado para mouse/hover.
  Ahora ese layout táctil es el **único**, sin importar la proporción de
  pantalla — coherente con que esta app ya no apunta a mouse/escritorio.
- Mismo ajuste espejado en `narrow-ui-bindings.js` (la función que
  decide si mostrar la float card al ocultar la UI).
- El layout de escritorio (`sidecol`/`topbar`) no se borró — simplemente
  no se activa nunca. Revertible cambiando una línea si en el futuro se
  quiere volver a soportar mouse.

## 3. Tamaños de toque y tipografía

- Escala de tipografía (`--fs-*`) subida ~2px en cada escalón — el
  original iba de 5px a 16px, pensado para lectura de cerca con mouse;
  ahora va de 7px a 18px.
- Radios de esquina (`--r-*`) suavizados ligeramente.
- `.btn-sm` 30→38px, `.btn-md` 34→42px (el mínimo recomendado por Apple/
  Google para blanco de toque es ~44px; quedamos cerca sin romper el
  layout horizontal de la barra de herramientas).
- Íconos SVG dentro de esos botones agrandados de 13px a 16px vía CSS.
- Fila de colores/tamaño/opacidad (`#pb-colors`, la fila siempre visible
  en la parte inferior): swatches de 26→38px, botones de tamaño/opacidad
  de 26×30→38×42px, sus etiquetas de texto de 5px→9px (ilegibles antes
  en una tablet a distancia de brazo).
- Botones de texto sueltos en la barra (`2F=ORB`, `FINGER`, `PGS`, `VWS`,
  `DOT`, `50%`) de 5-6px → 9-10px de fuente.

## Lo que NO se tocó en este bloque

- La física/matemática de cámara y movimiento (orbit, pan, zoom, FPS)
  — solo cambió qué gesto la dispara.
- El sistema de tarjetas arrastrables/acopladas (`sidecol`) en sí mismo
  — sigue existiendo en el DOM y en el CSS, solo que ya no se activa.
- Guardado, export, gizmos de dibujo, temas de color.

