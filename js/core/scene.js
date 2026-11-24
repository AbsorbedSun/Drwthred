// ============================================================================
// SCENE — setup puro de Three.js. No sabe nada de gestos, HUD, ni store.
//
// Render bajo demanda: antes se dibujaba la escena 60 veces por segundo
// aunque nada cambiara — en una tablet eso es batería y calor de gratis.
// Ahora `invalidate()` marca la escena como sucia y `renderIfNeeded()`
// solo dibuja en ese caso. Además se detecta solo cualquier movimiento de
// cámara (comparando su matriz), así que las animaciones de vista no
// necesitan avisar a nadie.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1815);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const grid = new THREE.GridHelper(10, 20, 0x3a352c, 0x2a2620);
  grid.name = 'floor-grid';
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 5, 2);
  scene.add(ambient, dir);

  let dirty = true;
  const lastCam = new THREE.Matrix4();
  lastCam.elements[0] = NaN; // fuerza el primer render

  function invalidate() { dirty = true; }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    invalidate();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  /** Dibuja ya, sin preguntar (lo usa la exportación de imagen). */
  function render() {
    renderer.render(scene, camera);
    dirty = false;
    lastCam.copy(camera.matrixWorld);
  }

  /** @param {Function} [beforeRender] se ejecuta solo si de verdad se va a dibujar */
  function renderIfNeeded(beforeRender) {
    camera.updateMatrixWorld();
    if (!dirty && camera.matrixWorld.equals(lastCam)) return false;
    if (beforeRender) beforeRender();
    render();
    return true;
  }

  return { scene, camera, renderer, render, renderIfNeeded, invalidate };
}
