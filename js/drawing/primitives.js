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

/**
 * @param {Object} [opts]
 * @param {boolean} [opts.record=true] - false al reconstruir desde un archivo (no entra al historial)
 */
export function placePrimitive(scene, kind, point, { color = '#e0a458', layerId, record = true } = {}) {
  const build = BUILDERS[kind] || BUILDERS.cube;
  const geo = build();
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(point);
  // El color "real" queda en userData: el resaltado de selección pisa
  // material.color, así que guardar desde el material podía guardar el turquesa.
  mesh.userData = { layerId, primitiveKind: kind, color: '#' + mat.color.getHexString() };
  scene.add(mesh);

  if (record) pushAction({
    undo: () => scene.remove(mesh),
    redo: () => scene.add(mesh),
  });
  return mesh;
}
