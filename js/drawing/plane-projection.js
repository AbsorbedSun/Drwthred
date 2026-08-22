// ============================================================================
// PLANE PROJECTION — convierte un punto de puntero (coords normalizadas de
// dispositivo, -1..1) en un punto 3D, proyectándolo sobre un plano.
// Matemática pura: no escucha eventos, no toca el DOM. Se puede probar con
// Node sin WebGL (ver tests/plane-projection.test.js).
// ============================================================================
import * as THREE from '../vendor/three.module.js';

/**
 * Crea un plano que mira hacia la cámara, ubicado en un punto dado.
 * Se llama una sola vez al EMPEZAR un trazo — el plano no se vuelve a
 * recalcular mientras se dibuja, para que el trazo no se deforme si la
 * cámara se mueve (cosa que además no puede pasar: navegar necesita 2+
 * dedos, y 1 dedo dibujando bloquea esa transición).
 */
export function planeFacingCamera(camera, atPoint) {
  const normal = new THREE.Vector3();
  camera.getWorldDirection(normal);
  return new THREE.Plane().setFromNormalAndCoplanarPoint(normal, atPoint);
}

/**
 * Proyecta un punto de puntero (NDC) sobre un plano, devolviendo el punto
 * 3D de intersección. Devuelve null si el rayo no toca el plano (raro,
 * solo pasa si el plano queda exactamente de canto respecto a la cámara).
 */
export function projectToPlane(camera, ndcX, ndcY, plane) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(plane, point);
  return hit ? point : null;
}
