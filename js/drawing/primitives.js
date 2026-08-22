// ============================================================================
// PRIMITIVES — coloca formas geométricas simples en el punto tocado.
// A diferencia de los trazos (MeshBasicMaterial, no reacciona a la luz,
// como tinta), las primitivas usan MeshStandardMaterial para que se vean
// como objetos reales en el espacio — la escena ya tiene luces (scene.js).
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { pushAction } from '../core/history.js';

const BUILDERS = {
  plane: () => new THREE.PlaneGeometry(0.4, 0.4),
  cube: () => new THREE.BoxGeometry(0.3, 0.3, 0.3),
  sphere: () => new THREE.SphereGeometry(0.2, 20, 14),
  cylinder: () => new THREE.CylinderGeometry(0.15, 0.15, 0.4, 20),
  cone: () => new THREE.ConeGeometry(0.18, 0.4, 20),
};

export function placePrimitive(scene, kind, point, { color = '#e0a458', layerId } = {}) {
  const build = BUILDERS[kind] || BUILDERS.cube;
  const geo = build();
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(point);
  mesh.userData = { layerId, primitiveKind: kind };
  scene.add(mesh);

  pushAction({
    undo: () => scene.remove(mesh),
    redo: () => scene.add(mesh),
  });
  return mesh;
}
