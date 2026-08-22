# App de dibujo 3D para tablet — Documento de diseño (v0.1, borrador)

> Mismo espíritu que el proyecto anterior (boceto libre en 3D, táctil, para tablet),
> construido desde cero con dos prioridades explícitas: **arquitectura de código
> limpia** y **una HUD diseñada de una vez, no parchada con el tiempo**.

---

## 1. Por qué desde cero (diagnóstico del proyecto anterior)

Vale la pena nombrar explícitamente qué causó fricción en el proyecto anterior,
porque son las reglas que este documento existe para evitar repetir:

- **Posicionamiento a mano, por elemento.** Cada botón flotante (`#bprims`,
  `#sc-fab`, `#sbar`, `#bhide`...) tenía su propio `top`/`right` fijo en CSS,
  escrito en un momento distinto, sin que nada supiera del resto. Resultado:
  cada vez que un elemento cambiaba de tamaño, otro quedaba tapado — pasamos
  varias rondas de esta conversación arreglando colisiones una por una.
- **Comunicación entre módulos por variables globales ad-hoc.** El patrón
  `window._algo = function(){...}` para que un archivo llame a otro funciona,
  pero no dice en ningún lado quién depende de quién. Difícil de rastrear,
  fácil de romper sin darse cuenta.
- **Un solo archivo de 12,800 líneas al inicio.** Se pudo dividir después,
  pero dividir después es más trabajo (y más riesgo) que empezar dividido.
- **HUD reactiva, no diseñada.** Cada pieza de interfaz se agregó cuando hizo
  falta, no como parte de un sistema. Por eso terminamos con 4 convenciones
  de posicionamiento distintas conviviendo mal entre sí.

Este documento propone resolver los cuatro puntos **desde el diseño**, no
como refactor posterior.

---

## 2. Principios de diseño (no negociables)

1. **Táctil desde el día uno.** No hay "modo escritorio" que se agranda después
   para tablet — el único layout que existe es el táctil.
2. **La HUD es un sistema, no una colección de elementos.** Ver sección 5.
3. **Cero variables globales para comunicación entre módulos.** Todo pasa por
   un store central explícito (sección 4).
4. **Módulos con una sola responsabilidad**, con dependencias declaradas
   (`import`/`export`), no implícitas.
5. **Gestos, no widgets fijos, para navegación en 3D** — esto ya lo validamos
   en el proyecto anterior (2 dedos mirar/orbitar, 3 dedos caminar/pan,
   1 dedo dibuja) y se hereda como base, no como algo a rediseñar.

---

## 3. Alcance funcional (V1)

Equivalente al proyecto anterior, sin recortar capacidades — el foco de esta
reescritura es *cómo* está construido y *cómo se ve la HUD*, no reducir qué
hace la app.

| Área | Funcionalidad |
|---|---|
| Dibujo | Trazo libre en 3D, tamaño y opacidad de pincel, color (paleta + selector libre) |
| Navegación | Orbit / pan / zoom por gesto; modo FPS (caminar) por gesto; NavCube para alinear vista |
| Capas | Múltiples capas, visibilidad independiente, capa activa |
| Primitivas | Librería de formas guía (cubo, esfera, cilindro, cono, etc.) |
| Selección/edición | Seleccionar, borrar (total/parcial), deshacer/rehacer |
| Vistas guardadas | Guardar y volver a ángulos de cámara específicos |
| Guardado/export | Guardar proyecto, exportar imagen/modelo |

**Recorte deliberado (no es un olvido):** "Páginas" (varios lienzos dentro
de un mismo proyecto) salió del alcance V1 — decisión explícita, no una
limitación técnica. Si hace falta más adelante, capas ya cubre buena parte
del mismo problema (organizar el trabajo en grupos independientes).

**Fuera de alcance para V1** (candidatas a V2, no bloquean el diseño actual):
colaboración multiusuario, animación/timeline, importar modelos externos.

---

## 4. Arquitectura de datos: un store central

En vez de que cada módulo lea/escriba variables globales de otros archivos,
un único store expone el estado y un mecanismo de suscripción:

```js
// core/store.js
let state = { /* ... */ };
const listeners = new Set();

export function getState() { return state; }
export function setState(patch) {
  state = { ...state, ...patch };
  listeners.forEach(fn => fn(state));
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

Cualquier módulo que necesite reaccionar a un cambio (cambio de capa activa,
cambio de modo de navegación, etc.) se suscribe explícitamente — queda
documentado en el propio código quién depende de qué, en vez de vivir
implícito en el orden de carga de los `<script>`.

---

## 5. Sistema de HUD (el corazón de esta reescritura)

Esto es lo que directamente ataca el problema que arreglamos a mano varias
veces en el proyecto anterior.

### 5.1 Slots, no coordenadas

En vez de que cada botón declare su propio `top`/`right` en píxeles, existe
un **HUD manager** con "slots" nombrados (zonas de anclaje):

```
corner-top-left · corner-top-right · corner-bottom-left · corner-bottom-right
edge-top-center · edge-bottom-center
```

Cada elemento de HUD se **registra** en un slot con una prioridad de orden,
y el manager calcula automáticamente su posición apilando los elementos de
ese slot con un espaciado consistente:

```js
hud.register({
  id: 'control-fab',
  slot: 'corner-top-right',
  order: 2,          // se apila después del elemento order:1 del mismo slot
  size: 32,           // alto, para que el manager calcule el siguiente offset
  render: () => /* ... */
});
```

Si mañana un botón crece de 30px a 38px, **todo lo que está apilado después
se corre solo** — la clase de bug que pasamos varios turnos arreglando a mano
(`#prim-bar` vs `#topbar`, `#bprims` vs `#sc-fab`) deja de poder pasar,
porque ningún elemento vuelve a hardcodear su posición absoluta.

### 5.2 Tres categorías de HUD, cada una con su propia regla de visibilidad

| Categoría | Comportamiento | Ejemplos |
|---|---|---|
| **Indicador persistente** | Mínimo, siempre visible, sin texto salvo al tocar | Punto de estado/modo (heredado del rediseño anterior) |
| **Panel contextual** | Oculto por defecto, aparece al tocar un disparador, se cierra solo o al tocar afuera | Capas, Control/gizmo, Navegación |
| **Notificación transitoria** | Aparece sola al ocurrir algo, se cierra sola — nunca requiere un toque para verse | Confirmaciones ("Guardado"), avisos de modo |

Esta tabla es una regla de diseño, no una lista cerrada — pero **todo
elemento nuevo de HUD tiene que encajar en una de las tres**, para no volver
a terminar con una cuarta convención inventada sobre la marcha.

### 5.3 Tamaños táctiles como constante del sistema, no ajuste posterior

```css
:root{
  --touch-min: 44px;   /* mínimo recomendado Apple/Google, no negociable */
  --hud-gap: 10px;      /* espaciado entre elementos apilados en un slot */
}
```

---

## 6. Estructura de módulos propuesta

```
/index.html
/style.css
/js/
  core/
    store.js            — estado central + suscripción
    scene.js             — setup de Three.js (escena, cámara, renderer)
    camera-controller.js — matemática de órbita/pan/zoom/FPS (sin DOM)
  input/
    gestures.js           — reconocedor de gestos táctiles → acciones semánticas
  drawing/
    stroke-engine.js       — creación de trazos, geometría de pincel
    layers.js
    pages.js
    primitives.js
    selection.js
  ui/
    hud-manager.js         — sistema de slots (sección 5)
    panels/
      nav-panel.js
      layers-panel.js
      control-panel.js
      color-panel.js
    toast.js
  persistence/
    save-load.js
    export.js
  main.js                  — arma todo explícitamente (sin wiring implícito)
```

Cada archivo exporta lo que otros necesitan (`export function ...`) e importa
lo que usa (`import { ... } from '...'`) — sin `window._algo`.

---

## 7. Stack técnico

| Decisión | Elección | Por qué |
|---|---|---|
| Motor 3D | Three.js | Ya probado en el proyecto anterior, capaz, buena documentación |
| Módulos | ES Modules nativos del navegador (`<script type="module">`) | Dependencias explícitas, sin bundler, sigue siendo archivos estáticos desplegables en GitHub Pages |
| Empaquetado | Ninguno (sin build step) | Simplicidad; se puede agregar Vite después si hace falta, no es un bloqueante ahora |
| Backend | Ninguno — todo cliente | Igual que antes; guardado local / export de archivos |
| Estado | Store propio minimalista (sección 4) | No hace falta un framework para esto |

**Nota práctica:** los módulos ES nativos no cargan si abrís `index.html`
haciendo doble clic (`file://`) — necesitás un servidor local mínimo para
probar (`npx serve`, extensión Live Server de VS Code, etc.). En GitHub
Pages esto no es un problema porque siempre se sirve por HTTP.

---

## 8. Lo que todavía necesito de vos

1. **Nombre del proyecto** (aunque sea provisorio).
2. ¿Confirmás la lista de funcionalidad V1 de la sección 3, o hay algo que
   sacarías/agregarías?
3. ¿Arrancamos por el sistema de HUD (sección 5) como prueba de concepto
   antes de tocar el motor de dibujo, o preferís al revés (motor de dibujo
   primero, HUD después)?
