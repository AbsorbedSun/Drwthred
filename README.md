# Drwthred

Dibujo 3D sobre planos, pensado para **tablet y lápiz** (inspirado en Feather).
Cada trazo cae sobre un plano —libre, frente, lado, suelo, uno propio o la
superficie de una figura— y al girar la vista el dibujo existe en el espacio.

Es un **sitio estático**: HTML, CSS y módulos JavaScript, sin paso de
compilación. Three.js y las demás piezas están incluidas en `js/vendor/`.
Se puede **instalar** desde el navegador ("Agregar a pantalla de inicio") y
funciona **sin conexión**.

## Qué tiene

- **Planos de dibujo**: libre, frente/lado/suelo, propio (se mueve y se gira),
  y modo superficie (el trazo se pega a las figuras). Espejo en X.
- **9 pinceles**: lápiz, tinta, marcador, pincel, caligrafía, neón, acuarela,
  punteado y tiza; presión del lápiz, puntas afinadas, curvas suaves.
- **Ayudas**: formas rápidas (quieto al final del trazo → forma perfecta),
  imán entre trazos, vista previa al acercar el lápiz, vista ortográfica.
- **Selección**: tocar o lazo; mover/escalar/rotar en grupo; duplicar,
  pintar, cambiar grosor o pincel, espejar, mandar a otra capa, eliminar.
- **Capas**: renombrar, reordenar, duplicar, eliminar, ocultar, bloquear y opacidad.
- **Imágenes de referencia** para calcar.
- **Archivo**: autoguardado, abrir/descargar proyecto (.json), exportar
  PNG (hasta 4×, fondo transparente) y 3D (GLB, USDZ, OBJ).
- Todo se puede **deshacer** (también con un toque de 2 dedos; 3 dedos = rehacer).

## Gestos

| | Con lápiz | Solo con el dedo |
|---|---|---|
| Dibujar | lápiz | 1 dedo |
| Orbitar | 1 dedo | 2 dedos |
| Mover la vista / zoom | 2 dedos | 3 dedos / pellizco |
| Deshacer / rehacer | toque con 2 / 3 dedos | toque con 2 / 3 dedos |

El modo cambia solo al detectar un lápiz (se puede fijar en Ajustes).
Mientras el lápiz toca la pantalla, la palma se ignora.

## Correrlo en tu computadora

```bash
npm start
```

Abre `http://localhost:8080`. No hace falta instalar nada para esto (solo Node 20+).

## Pruebas

```bash
npm test
```

Más de 500 comprobaciones de lógica, sin navegador (unos segundos).

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

La app real en Chromium: gestos, lápiz, lazo, autoguardado, modo sin
conexión, exportación y diseño en 4 tamaños de pantalla. GitHub Actions corre
las dos en cada push (`.github/workflows/tests.yml`).

## Publicar en GitHub Pages

En el repositorio: *Settings → Pages → Deploy from a branch*, elegir la rama
(por ejemplo `main`) y la carpeta raíz. Todas las rutas son relativas, así
que funciona en `usuario.github.io/Drwthred/`.

**Importante al cambiar archivos:** el modo sin conexión guarda una copia de
la app. Después de agregar, quitar o modificar archivos, regenerar la lista:

```bash
npm run update-sw
```

Eso actualiza `sw.js` con la lista de archivos y una versión nueva (así los
navegadores descargan la actualización). `npm test` avisa si te olvidaste.

## Estructura

```
index.html, style.css, sw.js, manifest.webmanifest
js/app.js              punto de entrada: arma escena, entrada e interfaz
js/core/               escena, cámara, store (estado), historial, vistas
js/input/              gestos (puntero → acciones) y enrutador de herramientas
js/drawing/            trazos, pinceles, planos, selección, goma, capas,
                       figuras, referencias, formas rápidas, imán
js/persistence/        guardar/abrir, autoguardado, exportar
js/ui/                 HUD, paneles, íconos, diálogos
js/vendor/             Three.js r185 y exportadores (MIT)
fonts/                 DM Sans / DM Mono (OFL)
tests/                 pruebas unitarias (*.test.js) y de integración (e2e/)
tools/                 servidor local y generador de la lista del modo offline
```

## Formato de proyecto

`.json` versión 3. Abre también archivos de las versiones 1 y 2. Las imágenes
de referencia van dentro del archivo (reducidas a 2048 px como máximo).
