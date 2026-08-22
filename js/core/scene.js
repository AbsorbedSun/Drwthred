// ============================================================================
// SCENE — setup puro de Three.js. No sabe nada de gestos, HUD, ni store.
// Su única responsabilidad: escena, cámara, renderer, y mantenerlos en
// sincro con el tamaño de la ventana.
// ============================================================================
import * as THREE from '../vendor/three.module.js';

export function createScene(canvas) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1815);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 100);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Piso de referencia + ejes, para tener noción de espacio mientras no hay trazos
  const grid = new THREE.GridHelper(10, 20, 0x3a352c, 0x2a2620);
  scene.add(grid);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  const dir = new THREE.DirectionalLight(0xffffff, 0.6);
  dir.position.set(3, 5, 2);
  scene.add(ambient, dir);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  function render() {
    renderer.render(scene, camera);
  }

  return { scene, camera, renderer, render };
}
