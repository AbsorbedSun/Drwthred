import { createScene } from './core/scene.js';
import { createCameraController } from './core/camera-controller.js';
import { attachGestures } from './input/gestures.js';
import { createStrokeEngine } from './drawing/stroke-engine.js';
import { syncLayerVisibility } from './drawing/layers.js';
import { syncSelectionHighlight } from './drawing/selection.js';
import { createTransformController } from './drawing/transform.js';
import { createToolRouter } from './input/tool-router.js';
import { createViewsPanel } from './ui/panels/views-panel.js';
import { createFilePanel } from './ui/panels/file-panel.js';
import { toast } from './ui/toast.js';

const canvas = document.getElementById('scene-canvas');
const { scene, camera, renderer, render } = createScene(canvas);
const camCtl = createCameraController(camera);
const strokeEngine = createStrokeEngine(scene, camera);

syncLayerVisibility(scene);     // reactivo — no hace falta llamarlo de nuevo nunca
syncSelectionHighlight(scene);  // idem, para el resaltado de selección

const transform = createTransformController({ scene, camera });

createViewsPanel({ id: 'views-panel', slot: 'edge-top-center', order: 0, camCtl });
createFilePanel({ id: 'file-panel', slot: 'corner-bottom-right', order: 0, scene, strokeEngine, renderer, onToast: toast });

const toolRouter = createToolRouter({ scene, camera, camCtl, strokeEngine, transform });
attachGestures(canvas, camCtl, toolRouter, transform);

// Expuesto para la prueba automática — no es parte de la app final
window.__camCtl = camCtl;
window.__strokeEngine = strokeEngine;
window.__scene = scene;

(function loop() {
  render();
  requestAnimationFrame(loop);
})();
