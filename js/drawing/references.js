// ============================================================================
// REFERENCES — imágenes de referencia para calcar en 3D: una foto o boceto
// se coloca sobre el plano activo, semitransparente, y se dibuja encima.
//
//  · Se seleccionan, mueven, escalan y rotan como cualquier objeto.
//  · Por defecto NO salen al exportar (son una ayuda, no parte del dibujo).
//  · Se guardan DENTRO del proyecto (data URL), reducidas a 2048 px como
//    máximo: un solo archivo, que el autoguardado también conserva.
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { pushAction } from '../core/history.js';
import { isFixedPlane, normalOf, planeCenter } from './draw-planes.js';

export const MAX_SIDE = 2048;
export const DEFAULT_OPACITY = 0.6;

/**
 * Lee un archivo de imagen y lo devuelve reducido como data URL.
 * PNG si tiene transparencia posible (PNG/GIF/WebP de origen); si no, JPEG (pesa mucho menos).
 * @returns {Promise<{src: string, width: number, height: number}>}
 */
export function loadImageFile(file, maxSide = MAX_SIDE) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const keepAlpha = /png|gif|webp/.test(file.type);
      resolve({ src: c.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.85), width: w, height: h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')); };
    img.src = url;
  });
}

function textureFrom(src) {
  const tex = new THREE.Texture();
  tex.colorSpace = THREE.SRGBColorSpace;
  if (typeof Image !== 'undefined') {
    const img = new Image();
    img.onload = () => { tex.image = img; tex.needsUpdate = true; if (onTextureReady) onTextureReady(); };
    img.src = src;
  }
  return tex;
}
let onTextureReady = null;
/** Aviso cuando termina de cargar una imagen (para redibujar con render bajo demanda). */
export function setReferenceReadyHandler(fn) { onTextureReady = fn; }

/** Crea el mesh de una referencia (sin agregarlo a la escena). */
export function createReferenceMesh({ src, width, height, layerId, opacity = DEFAULT_OPACITY, size = 1.5 }) {
  const aspect = width / height;
  const w = aspect >= 1 ? size : size * aspect;
  const h = aspect >= 1 ? size / aspect : size;
  const mat = new THREE.MeshBasicMaterial({
    map: textureFrom(src), transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.userData = { reference: true, src, width, height, layerId, refOpacity: opacity, refSize: size };
  return mesh;
}

/**
 * Agrega una referencia sobre el plano activo (o de frente a la cámara en
 * plano libre/superficie), centrada donde se está mirando. Deshacible.
 */
export function addReference(scene, image, { spec, camera, target, layerId, size = null }) {
  // Tamaño según el zoom: quien llama pasa `size` (en app.js, a partir del
  // radio de la órbita). La distancia real de la cámara no sirve: en vista
  // ortográfica la cámara se aleja a 30 unidades y la imagen salía gigante.
  const s = size || Math.max(0.5, camera.position.distanceTo(target) * 0.45);
  const mesh = createReferenceMesh({ ...image, layerId, size: s });
  if (isFixedPlane(spec)) {
    const n = normalOf(spec);
    // Que la imagen quede "derecha" respecto a la pantalla: su lado de arriba
    // apunta lo más posible hacia el arriba de la cámara
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    up.addScaledVector(n, -up.dot(n));
    if (up.lengthSq() < 1e-8) up.set(0, 0, -1);
    up.normalize();
    const right = new THREE.Vector3().crossVectors(up, n).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, n));
    // Un pelito DETRÁS del plano (del lado opuesto a la cámara): los trazos
    // dibujados encima quedan delante — se ven y se tocan primero
    const center = planeCenter(spec, target);
    const away = Math.sign(n.dot(new THREE.Vector3().subVectors(camera.position, center))) || 1;
    mesh.position.copy(center).addScaledVector(n, -0.004 * away);
  } else {
    mesh.quaternion.copy(camera.quaternion);
    mesh.position.copy(target);
  }
  mesh.renderOrder = -1; // debajo del dibujo
  scene.add(mesh);
  pushAction({ undo: () => scene.remove(mesh), redo: () => scene.add(mesh) });
  return mesh;
}

/** Opacidad propia de la referencia (combinada después con la de su capa). */
export function setReferenceOpacity(meshes, opacity, { record = true, from = null } = {}) {
  const refs = meshes.filter((m) => m.userData.reference);
  if (!refs.length) return false;
  const before = from != null ? refs.map(() => from) : refs.map((m) => m.userData.refOpacity);
  const set = (vals) => refs.forEach((m, i) => {
    m.userData.refOpacity = vals[i];
    // La capa guarda el valor "base" del material: actualizarlo ahí también
    const mu = m.material.userData;
    if (mu.base) mu.base.opacity = vals[i];
    m.material.opacity = vals[i] * (mu.layerOpacity ?? 1);
  });
  const after = refs.map(() => opacity);
  set(after);
  if (record) pushAction({ undo: () => set(before), redo: () => set(after) });
  return true;
}

export function serializeReferences(scene) {
  return scene.children.filter((o) => o.userData && o.userData.reference).map((o) => ({
    src: o.userData.src, width: o.userData.width, height: o.userData.height, layerId: o.userData.layerId,
    opacity: o.userData.refOpacity, size: o.userData.refSize,
    position: o.position.toArray(), quaternion: o.quaternion.toArray(), scale: o.scale.toArray(),
  }));
}

export function loadReferences(scene, list = []) {
  list.forEach((r) => {
    const mesh = createReferenceMesh({ ...r, opacity: r.opacity ?? DEFAULT_OPACITY });
    if (r.position) mesh.position.fromArray(r.position);
    if (r.quaternion) mesh.quaternion.fromArray(r.quaternion);
    if (r.scale) mesh.scale.fromArray(r.scale);
    mesh.renderOrder = -1;
    scene.add(mesh);
  });
}

export function referenceMeshes(scene) {
  return scene.children.filter((o) => o.userData && o.userData.reference);
}

