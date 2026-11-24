// ============================================================================
// PLANE GUIDE — la grilla translúcida que muestra el plano de dibujo activo
// (y el plano de simetría, si el espejo está prendido). Solo visual: no
// tiene userData de trazo ni de figura, así que selección, goma y guardado
// la ignoran solas.
//
// update(target) se llama en cada frame: la grilla se centra en el punto
// del plano más cercano a donde mira la cámara — se siente infinita sin
// dibujar una grilla infinita. El centro se redondea a la celda, así que
// al hacer pan las líneas quedan quietas en el mundo, no "patinan".
// ============================================================================
import * as THREE from '../vendor/three.module.js';
import { getState } from '../core/store.js';
import { PLANE_PRESETS, CUSTOM_COLOR, normalOf, planeCenter, isFixedPlane } from './draw-planes.js';

const SIZE = 6;
const DIV = 24;
const CELL = SIZE / DIV;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

function buildGridGroup() {
  const group = new THREE.Group();
  const fillMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false,
  });
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), fillMat);

  const h = SIZE / 2;
  const pts = [];
  for (let i = 0; i <= DIV; i++) {
    const t = -h + i * CELL;
    pts.push(t, -h, 0, t, h, 0, -h, t, 0, h, t, 0);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeo, gridMat);

  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.Float32BufferAttribute(
    [-h, -h, 0, h, -h, 0, h, -h, 0, h, h, 0, h, h, 0, -h, h, 0, -h, h, 0, -h, -h, 0], 3));
  const borderMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false });
  const border = new THREE.LineSegments(borderGeo, borderMat);

  group.add(fill, grid, border);
  group.renderOrder = 10;
  group.traverse((o) => { o.renderOrder = 10; });
  return {
    group,
    setColor(hex) { fillMat.color.setHex(hex); gridMat.color.setHex(hex); borderMat.color.setHex(hex); },
  };
}

export function createPlaneGuide(scene) {
  const plane = buildGridGroup();
  const mirror = buildGridGroup();
  mirror.setColor(0xe07ab8);
  mirror.group.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(1, 0, 0));
  plane.group.name = 'plane-guide';
  mirror.group.name = 'mirror-guide';
  scene.add(plane.group, mirror.group);

  const local = new THREE.Vector3();
  const inv = new THREE.Quaternion();

  function snapToCells(group, center) {
    // Redondear en coordenadas LOCALES del plano (x,y), no del mundo
    inv.copy(group.quaternion).invert();
    local.copy(center).applyQuaternion(inv);
    local.x = Math.round(local.x / CELL) * CELL;
    local.y = Math.round(local.y / CELL) * CELL;
    group.position.copy(local.applyQuaternion(group.quaternion));
  }

  function update(target) {
    const { drawPlane, mirror: mirrorOn } = getState();
    const fixed = isFixedPlane(drawPlane);
    plane.group.visible = fixed;
    if (fixed) {
      const n = normalOf(drawPlane);
      plane.group.quaternion.setFromUnitVectors(Z_AXIS, n);
      snapToCells(plane.group, planeCenter(drawPlane, target));
      const preset = PLANE_PRESETS[drawPlane.mode];
      plane.setColor(preset ? preset.color : CUSTOM_COLOR);
    }
    mirror.group.visible = mirrorOn;
    if (mirrorOn) snapToCells(mirror.group, new THREE.Vector3(0, target.y, target.z));
  }

  return { update, group: plane.group, mirrorGroup: mirror.group };
}
