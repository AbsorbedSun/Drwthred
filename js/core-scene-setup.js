// ============================================================
// core-scene-setup.js
// Core scene setup: renderer/camera/scene, global gesture guards, export-scale cage, ground surface, shared axis/gizmo math helpers
// ============================================================
// ================================================================
//  DRWTHRED v4.1
// ================================================================
window._precisionMode = false;

// Block browser native pinch-to-zoom and Ctrl+scroll zoom — these scale
// the entire page including UI panels. We handle zoom ourselves on the canvas.
document.addEventListener('wheel', function(e){
  if(e.ctrlKey) e.preventDefault();
}, {passive: false});
// Block Safari/iOS pinch gesture events
document.addEventListener('gesturestart', function(e){ e.preventDefault(); }, {passive: false});
document.addEventListener('gesturechange', function(e){ e.preventDefault(); }, {passive: false});

const container=document.getElementById('cc');
const scene=new THREE.Scene();
scene.background=new THREE.Color(0xf4f1ea);
scene.fog=new THREE.FogExp2(0xf4f1ea,.012);
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,.01,2000);
let orthoZoom=8;
const ortho=new THREE.OrthographicCamera(-orthoZoom,orthoZoom,orthoZoom,-orthoZoom,-2000,4000);
let useOrtho=false;
function activeCam(){return useOrtho?ortho:camera;}
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(innerWidth,innerHeight);
renderer.setClearColor(0xf4f1ea,1);
renderer.sortObjects=true;
container.appendChild(renderer.domElement);

// ── Render dirty flag — declare early so syncSurf/updCam/etc can call markDirty ──
let _renderDirty=true;
function markDirty(){_renderDirty=true;}
scene.add(new THREE.AmbientLight(0xffffff,.9));
const sun=new THREE.DirectionalLight(0xffffff,.5);sun.position.set(5,4,8);scene.add(sun);
const gridH=new THREE.GridHelper(20,20,0xa08858,0xc8aa78);gridH.rotation.x=Math.PI/2;gridH.renderOrder=-1;scene.add(gridH);
const axisGroup=new THREE.Group();scene.add(axisGroup);
(function(){const L=8;[[new THREE.Vector3(L,0,0),'#e03040'],[new THREE.Vector3(0,L,0),'#22bb55'],[new THREE.Vector3(0,0,L),'#3377ee']].forEach(([tip,col])=>{const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),tip]);axisGroup.add(new THREE.Line(g,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.55})));const g2=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),tip.clone().negate()]);axisGroup.add(new THREE.Line(g2,new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.18})));});})();
let axisLinesOn=true;

// ── Export Scale ─────────────────────────────────────────────────
// Scale steps: each value = real-world meters that 1 grid square represents
// "1 square = Xm" is the mental model
const SCALE_STEPS=[null,0.0001,0.0005,0.001,0.005,0.01,0.05,0.1,0.5,1,5,10,50,100,200,500,1000];
const SCALE_LABELS=['OFF','0.1mm','0.5mm','1mm','5mm','1cm','5cm','10cm','50cm','1m','5m','10m','50m','100m','200m','500m','1km'];
let exportScaleIdx=0;
function exportScaleMult(){return SCALE_STEPS[exportScaleIdx]||1;}
function formatDist(sceneUnits){
  var sm=SCALE_STEPS[exportScaleIdx];
  var sign=sceneUnits>=0?'+':'';
  if(sm===null||sm===undefined) return sign+sceneUnits.toFixed(3)+' u';
  var m=sceneUnits*sm;
  if(Math.abs(m)<0.001) return sign+(m*1000000).toFixed(1)+'µm';
  if(Math.abs(m)<0.01) return sign+(m*1000).toFixed(2)+'mm';
  if(Math.abs(m)<1) return sign+(m*100).toFixed(2)+'cm';
  if(Math.abs(m)<1000) return sign+m.toFixed(3)+'m';
  return sign+(m/1000).toFixed(3)+'km';
}
function formatSize(x,y,z){
  var sm=SCALE_STEPS[exportScaleIdx];
  if(sm===null||sm===undefined) return x.toFixed(2)+'×'+y.toFixed(2)+'×'+z.toFixed(2)+' u';
  var mx=x*sm,my=y*sm,mz=z*sm;
  if(Math.max(Math.abs(mx),Math.abs(my),Math.abs(mz))<0.01) return (mx*1000).toFixed(1)+'×'+(my*1000).toFixed(1)+'×'+(mz*1000).toFixed(1)+'mm';
  if(Math.max(Math.abs(mx),Math.abs(my),Math.abs(mz))<1) return (mx*100).toFixed(1)+'×'+(my*100).toFixed(1)+'×'+(mz*100).toFixed(1)+'cm';
  return mx.toFixed(2)+'×'+my.toFixed(2)+'×'+mz.toFixed(2)+'m';
}

// Scale cue — 3-arm cross at scene origin, hidden until user enables scale
let scaleBarGroup=new THREE.Group();scaleBarGroup.visible=false;scene.add(scaleBarGroup);

// Scale label — flat plane mesh lying on XZ grid, not a billboard sprite
let _sbCanvas=document.createElement('canvas');_sbCanvas.width=192;_sbCanvas.height=32;
let _sbCtx=_sbCanvas.getContext('2d');
let _sbTex=new THREE.CanvasTexture(_sbCanvas);
// PlaneGeometry rotated to lie flat on XZ (like the grid)
let _sbMesh=new THREE.Mesh(
  new THREE.PlaneGeometry(1.6,0.18),
  new THREE.MeshBasicMaterial({map:_sbTex,transparent:true,depthWrite:false,side:THREE.DoubleSide})
);
// Rotate to lie flat on XZ plane (PlaneGeometry faces Z by default; grid is XZ so rotate -90° on X)
_sbMesh.rotation.x=-Math.PI/2;
_sbMesh.renderOrder=3;_sbMesh.visible=false;
scene.add(_sbMesh);

function buildScaleBar(){
  while(scaleBarGroup.children.length){
    const c=scaleBarGroup.children[0];
    if(c.geometry)c.geometry.dispose();
    if(c.material)c.material.dispose();
    scaleBarGroup.remove(c);
  }
  if(SCALE_STEPS[exportScaleIdx]===null){
    scaleBarGroup.visible=false;_sbMesh.visible=false;markDirty();return;
  }
  scaleBarGroup.visible=true;
  const mat=new THREE.LineBasicMaterial({color:0x1a1a2e,transparent:true,opacity:.3,depthWrite:false});
  // Bar along X, 1 world-unit, flat on XZ grid plane
  scaleBarGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0),new THREE.Vector3(1,0,0)]),mat));
  // End ticks perpendicular in Z
  const tk=0.06;
  scaleBarGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,-tk),new THREE.Vector3(0,0,tk)]),mat));
  scaleBarGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(1,0,-tk),new THREE.Vector3(1,0,tk)]),mat));
  scaleBarGroup.position.set(0,0,0);scaleBarGroup.renderOrder=3;
  markDirty();
}

function updateScaleBarLabel(){
  _sbCtx.clearRect(0,0,192,32);
  if(SCALE_STEPS[exportScaleIdx]===null){
    _sbMesh.visible=false;_sbTex.needsUpdate=true;markDirty();return;
  }
  _sbMesh.visible=true;
  _sbCtx.fillStyle=_themeInk(.45);_sbCtx.font='11px monospace';
  _sbCtx.textAlign='left';_sbCtx.textBaseline='middle';
  _sbCtx.fillText(SCALE_LABELS[exportScaleIdx]+' · 1u='+exportScaleMult()+'m',4,16);
  _sbTex.needsUpdate=true;
  // Position flat on grid, just past the X arm tip — Y=0 is on the grid
  _sbMesh.position.set(1.9,0,0);
  markDirty();
}

// Don't call buildScaleBar/updateScaleBarLabel at init — starts OFF, nothing to show

// ── 3D Scale Cage — 1×1×1 unit wireframe cube with dimension labels ──
// Always 1 scene unit = 1 grid square. Label shows real-world dimension.
// Centered on the drawing plane origin. Always visible (depthTest off).
let _gscaleGroup=new THREE.Group();
_gscaleGroup.visible=false;
scene.add(_gscaleGroup);
let _gscaleOn=false;
let _gscaleLastIdx=-1; // cache to avoid rebuilding when scale hasn't changed

// Label sprite helper — text always faces camera
function _makeLabel(text,fontSize){
  var cv=document.createElement('canvas');cv.width=256;cv.height=64;
  var ctx=cv.getContext('2d');
  ctx.clearRect(0,0,256,64);
  ctx.fillStyle=_themeInk(.7);
  ctx.font='bold '+(fontSize||20)+'px monospace';
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText(text,128,32);
  var tex=new THREE.CanvasTexture(cv);
  tex.minFilter=THREE.LinearFilter;
  var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:false,sizeAttenuation:true}));
  sp.renderOrder=10;
  return sp;
}

function _formatDim(meters){
  if(meters>=1000)return (meters/1000)+'km';
  if(meters>=1)return meters+'m';
  if(meters>=0.01)return Math.round(meters*100)+'cm';
  return Math.round(meters*1000)+'mm';
}

function buildScaleCage(){
  // Clear old
  while(_gscaleGroup.children.length){
    var c=_gscaleGroup.children[0];
    if(c.geometry)c.geometry.dispose();
    if(c.material){if(c.material.map)c.material.map.dispose();c.material.dispose();}
    _gscaleGroup.remove(c);
  }
  if(!_gscaleOn||SCALE_STEPS[exportScaleIdx]===null){
    _gscaleGroup.visible=false;_gscaleLastIdx=-1;markDirty();return;
  }
  // Skip rebuild if same scale
  if(exportScaleIdx===_gscaleLastIdx){_gscaleGroup.visible=true;return;}
  _gscaleLastIdx=exportScaleIdx;

  var mult=exportScaleMult(); // meters per scene unit (per grid square)
  var dimStr=_formatDim(mult);
  var s=1; // always 1 scene unit = 1 grid square

  var lm=new THREE.LineBasicMaterial({color:0x1a1a2e,transparent:true,opacity:0.4,depthWrite:false,depthTest:false});
  var lmSub=new THREE.LineBasicMaterial({color:0x1a1a2e,transparent:true,opacity:0.2,depthWrite:false,depthTest:false});
  var h=s/2; // half-size

  // Outer 12 edges
  var edges=[
    [[-h,-h,-h],[h,-h,-h]],[[-h,h,-h],[h,h,-h]],[[-h,-h,h],[h,-h,h]],[[-h,h,h],[h,h,h]],
    [[-h,-h,-h],[-h,h,-h]],[[h,-h,-h],[h,h,-h]],[[-h,-h,h],[-h,h,h]],[[h,-h,h],[h,h,h]],
    [[-h,-h,-h],[-h,-h,h]],[[h,-h,-h],[h,-h,h]],[[-h,h,-h],[-h,h,h]],[[h,h,-h],[h,h,h]]
  ];
  for(var i=0;i<edges.length;i++){
    var a=edges[i][0],b=edges[i][1];
    _gscaleGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(a[0],a[1],a[2]),new THREE.Vector3(b[0],b[1],b[2])
    ]),lm));
  }

  // Subdivision lines — 2×2×2 grid = midpoint lines on each face + through interior
  // Face midpoint lines (each face gets a cross dividing it into 4)
  // Plus internal cross-sections at x=0, y=0, z=0
  var subEdges=[
    // X-axis midpoints (vertical lines at x=0 on all 4 Y-Z faces + internal)
    [[0,-h,-h],[0,h,-h]],[[0,-h,h],[0,h,h]],   // front/back faces at x=0
    [[0,-h,-h],[0,-h,h]],[[0,h,-h],[0,h,h]],    // top/bottom faces at x=0
    // Y-axis midpoints (horizontal lines at y=0)
    [[-h,0,-h],[h,0,-h]],[[-h,0,h],[h,0,h]],    // front/back faces at y=0
    [[-h,0,-h],[-h,0,h]],[[h,0,-h],[h,0,h]],    // left/right faces at y=0
    // Z-axis midpoints (depth lines at z=0)
    [[-h,-h,0],[h,-h,0]],[[-h,h,0],[h,h,0]],    // top/bottom faces at z=0
    [[-h,-h,0],[-h,h,0]],[[h,-h,0],[h,h,0]],    // left/right faces at z=0
    // Internal cross: connecting opposite face centers through the cube interior
    [[0,0,-h],[0,0,h]],  // front↔back
    [[-h,0,0],[h,0,0]],  // left↔right
    [[0,-h,0],[0,h,0]]   // bottom↔top
  ];
  for(var si=0;si<subEdges.length;si++){
    var sa=subEdges[si][0],sb=subEdges[si][1];
    _gscaleGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(sa[0],sa[1],sa[2]),new THREE.Vector3(sb[0],sb[1],sb[2])
    ]),lmSub));
  }

  // Corner dots
  var dotGeo=new THREE.SphereGeometry(0.018,6,6);
  var dotMat=new THREE.MeshBasicMaterial({color:0x1a1a2e,transparent:true,opacity:0.3,depthWrite:false,depthTest:false});
  var corners=[[-h,-h,-h],[h,-h,-h],[-h,h,-h],[h,h,-h],[-h,-h,h],[h,-h,h],[-h,h,h],[h,h,h]];
  for(var j=0;j<corners.length;j++){
    var dot=new THREE.Mesh(dotGeo,dotMat);
    dot.position.set(corners[j][0],corners[j][1],corners[j][2]);
    dot.renderOrder=10;
    _gscaleGroup.add(dot);
  }
  // Center dot
  var cdot=new THREE.Mesh(dotGeo,dotMat);
  cdot.position.set(0,0,0);cdot.renderOrder=10;
  _gscaleGroup.add(cdot);

  // Dimension label on each axis
  var lblS=0.45;
  var lx=_makeLabel(dimStr,26);
  lx.position.set(0,-h-0.12,-h);
  lx.scale.set(lblS,lblS*0.22,1);
  _gscaleGroup.add(lx);
  var ly=_makeLabel(dimStr,26);
  ly.position.set(-h-0.12,0,-h);
  ly.scale.set(lblS,lblS*0.22,1);
  _gscaleGroup.add(ly);
  var lz=_makeLabel(dimStr,26);
  lz.position.set(-h,-h-0.12,0);
  lz.scale.set(lblS,lblS*0.22,1);
  _gscaleGroup.add(lz);

  // Half-dimension labels at midpoints
  var halfStr=_formatDim(mult*0.5);
  var lmidX=_makeLabel(halfStr,18);
  lmidX.position.set(-h/2,-h-0.08,-h);
  lmidX.scale.set(lblS*0.6,lblS*0.16,1);
  _gscaleGroup.add(lmidX);
  var lmidY=_makeLabel(halfStr,18);
  lmidY.position.set(-h-0.08,-h/2,-h);
  lmidY.scale.set(lblS*0.6,lblS*0.16,1);
  _gscaleGroup.add(lmidY);

  // "1 sq = Xm" label at top
  var topStr='1 sq = '+dimStr;
  var scLbl=_makeLabel(topStr,20);
  scLbl.position.set(0,0,h+0.14);
  scLbl.scale.set(lblS*1.1,lblS*0.22,1);
  _gscaleGroup.add(scLbl);

  // Position: centered on drawing plane origin
  _gscaleGroup.position.copy(surfPos);
  _gscaleGroup.quaternion.copy(surfGroup.quaternion);

  _gscaleGroup.visible=true;
  markDirty();
}

function updateScaleCage(){
  if(!_gscaleOn||SCALE_STEPS[exportScaleIdx]===null)return;
  _gscaleLastIdx=-1; // force rebuild
  buildScaleCage();
}

// Reposition cage when surface moves (called from syncSurf)
function syncScaleCage(){
  if(!_gscaleOn||!_gscaleGroup.visible)return;
  _gscaleGroup.position.copy(surfPos);
  _gscaleGroup.quaternion.copy(surfGroup.quaternion);
}

function toggleGraphicScale(on){
  _gscaleOn=on;
  if(on&&SCALE_STEPS[exportScaleIdx]!==null){
    _gscaleLastIdx=-1;
    buildScaleCage();
  } else {
    _gscaleGroup.visible=false;markDirty();
  }
  var btn=document.getElementById('bscaleoverlay');
  if(btn)btn.classList.toggle('on',on);
}

// ── Surface ──────────────────────────────────────────────────────
const PNORMALS={xy:new THREE.Vector3(0,0,1),xz:new THREE.Vector3(0,1,0),yz:new THREE.Vector3(1,0,0)};
const SURF_TRACE=0x7a5c3a;
var _curSurfTrace=SURF_TRACE;
let curPlane='xz',surfType='plane';
const surfPos=new THREE.Vector3(),surfEuler=new THREE.Euler(0,0,0,'XYZ');
let surfScale=2.0;const surfScaleAxes=new THREE.Vector3(1,1,1);
const surfGroup=new THREE.Group();scene.add(surfGroup);
let surfMesh=null,surfFillMat=null,surfWireMat=null,isHovering=false;
let _frostedMat=null,_frostedMesh=null;
let _frostedGridMat=null,_frostedGridMesh=null;
// depthCuesOn declared early — buildSurf references it (TDZ safety)
let depthCuesOn=true;
// Surface overlay grid mode: 0=off, 1=grid lines, 2=dots
var _surfGridMode=2;
var _surfGridLabels=['OFF','GRD','DOT'];
var _depthOpSteps=[0.50,0.75,0.90];
var _depthOpLabels=['50%','75%','90%'];
var _depthOpIdx=0;
function _surfGridRGBA(alpha){
  if(_uiTheme==='eink')return 'rgba(80,80,80,'+alpha+')';
  if(_surfGridHSL){
    // Convert HSL to RGB for canvas
    var tc=new THREE.Color().setHSL(_surfGridHSL.h,_surfGridHSL.s,Math.max(_surfGridHSL.l-0.05,0.15));
    return 'rgba('+Math.round(tc.r*255)+','+Math.round(tc.g*255)+','+Math.round(tc.b*255)+','+alpha+')';
  }
  return 'rgba(100,68,38,'+alpha+')';
}
function buildSurfGridTex(){
  var sz=128;
  var cv=document.createElement('canvas');cv.width=sz;cv.height=sz;
  var ctx=cv.getContext('2d');
  ctx.clearRect(0,0,sz,sz);
  if(_surfGridMode===1){
    ctx.strokeStyle=_surfGridRGBA(0.7);ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(sz,0);ctx.stroke();
    ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,sz);ctx.stroke();
  } else if(_surfGridMode===2){
    ctx.fillStyle=_surfGridRGBA(0.85);var r=3;
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(sz,0,r,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(0,sz,r,0,Math.PI*2);ctx.fill();
    ctx.beginPath();ctx.arc(sz,sz,r,0,Math.PI*2);ctx.fill();
  }
  var tex=new THREE.CanvasTexture(cv);
  tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;
  // Plane: 40 local units, 1 dot per world unit. Repeat = 40 * surfScale to match grid squares.
  if(surfType==='plane'){
    var sx=surfScale*(surfScaleAxes?surfScaleAxes.x:1)||1;
    var sy=surfScale*(surfScaleAxes?surfScaleAxes.y:1)||1;
    var repX=40*sx,repY=40*sy;
    tex.repeat.set(repX,repY);
    tex.offset.set(-(0.5*repX%1),-(0.5*repY%1));
  } else {
    tex.repeat.set(6,6);
  }
  return tex;
}
function applyFrostedGridTex(){
  if(!_frostedGridMat||!_frostedGridMesh)return;
  if(_surfGridMode===0){
    _frostedGridMesh.visible=false;
  } else {
    if(_frostedGridMat.map)_frostedGridMat.map.dispose();
    _frostedGridMat.map=buildSurfGridTex();
    _frostedGridMat.needsUpdate=true;
    _frostedGridMesh.visible=depthCuesOn;
  }
  markDirty();
}
function buildSurf(){
  while(surfGroup.children.length){const c=surfGroup.children[0];if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();surfGroup.remove(c);}
  surfMesh=null;_frostedMesh=null;_frostedMat=null;_frostedGridMesh=null;_frostedGridMat=null;
  const tint=_activeSurfTrace();let geo;
  if(surfType==='plane')geo=new THREE.PlaneGeometry(10,10,8,8);
  else if(surfType==='cube')geo=new THREE.BoxGeometry(3,3,3,3,3,3);
  else if(surfType==='cylinder')geo=new THREE.CylinderGeometry(1.5,1.5,3,32);
  else if(surfType==='cone')geo=new THREE.ConeGeometry(1.5,3,32);
  else geo=new THREE.SphereGeometry(1.8,32,24);
  // Surface fill + wireframe (renderOrder 0/1) — always visible, never affected by depth toggle
  surfFillMat=new THREE.MeshStandardMaterial({color:tint,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false,roughness:.9});
  surfMesh=new THREE.Mesh(geo,surfFillMat);surfMesh.renderOrder=7;surfGroup.add(surfMesh);
  const wgeo=new THREE.EdgesGeometry(geo,15);
  surfWireMat=new THREE.LineBasicMaterial({color:tint,transparent:true,opacity:.55,depthWrite:false});
  const wire=new THREE.LineSegments(wgeo,surfWireMat);wire.renderOrder=8;surfGroup.add(wire);
  if(surfType==='plane'){const h=5,ep=[new THREE.Vector3(-h,-h,0),new THREE.Vector3(h,-h,0),new THREE.Vector3(h,-h,0),new THREE.Vector3(h,h,0),new THREE.Vector3(h,h,0),new THREE.Vector3(-h,h,0),new THREE.Vector3(-h,h,0),new THREE.Vector3(-h,-h,0)];const borderLine=new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ep),new THREE.LineBasicMaterial({color:tint,transparent:true,opacity:1,depthWrite:false}));borderLine.renderOrder=8;surfGroup.add(borderLine);}
  // Frosted tint mesh (renderOrder 5): bg-colour semi-transparent plane, depthTest:true
  // Renders after strokes — depth buffer shows strokes in front as already drawn,
  // so frosted mesh tints only what is BEHIND the draw plane. depthWrite:false = no depth holes.
  var fgeo;
  if(surfType==='plane')fgeo=new THREE.PlaneGeometry(40,40);
  else if(surfType==='cube')fgeo=new THREE.BoxGeometry(3.02,3.02,3.02);
  else if(surfType==='cylinder')fgeo=new THREE.CylinderGeometry(1.52,1.52,3.04,48);
  else if(surfType==='cone')fgeo=new THREE.ConeGeometry(1.52,3.04,48);
  else fgeo=new THREE.SphereGeometry(1.82,48,32);
  var bgHex=scene.background?('#'+scene.background.getHexString()):'#f4f1ea';
  _frostedMat=new THREE.MeshBasicMaterial({
    color:new THREE.Color(bgHex),
    transparent:true,opacity:_depthOpSteps[_depthOpIdx],
    side:THREE.DoubleSide,depthWrite:false,depthTest:true,
    polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1
  });
  _frostedMesh=new THREE.Mesh(fgeo,_frostedMat);
  _frostedMesh.renderOrder=5;
  _frostedMesh.visible=depthCuesOn;
  surfGroup.add(_frostedMesh);
  // Grid/dot overlay mesh (renderOrder 6): texture only, always full alpha, never fades with opacity
  var fgeo2;
  if(surfType==='plane')fgeo2=new THREE.PlaneGeometry(40,40);
  else if(surfType==='cube')fgeo2=new THREE.BoxGeometry(3.02,3.02,3.02);
  else if(surfType==='cylinder')fgeo2=new THREE.CylinderGeometry(1.52,1.52,3.04,48);
  else if(surfType==='cone')fgeo2=new THREE.ConeGeometry(1.52,3.04,48);
  else fgeo2=new THREE.SphereGeometry(1.82,48,32);
  _frostedGridMat=new THREE.MeshBasicMaterial({
    color:0xffffff,transparent:true,
    side:THREE.DoubleSide,depthWrite:false,depthTest:true
  });
  if(_surfGridMode>0){_frostedGridMat.map=buildSurfGridTex();}
  _frostedGridMesh=new THREE.Mesh(fgeo2,_frostedGridMat);
  _frostedGridMesh.renderOrder=6;
  _frostedGridMesh.visible=depthCuesOn&&_surfGridMode>0;
  surfGroup.add(_frostedGridMesh);
  // Rebuild scale cage if active (it tracks surfGroup position externally)
  if(_gscaleOn)updateScaleCage();
  if(window._rulerCheckSurf) window._rulerCheckSurf();
  syncSurf();
}
function syncSurf(){
  const bq=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),PNORMALS[curPlane]);
  surfGroup.quaternion.copy(new THREE.Quaternion().setFromEuler(surfEuler).multiply(bq));
  surfGroup.position.copy(surfPos);
  surfGroup.scale.set(surfScale*surfScaleAxes.x,surfScale*surfScaleAxes.y,surfScale*surfScaleAxes.z);
  // Scale-compensate grid texture on plane only — keeps 1-unit spacing constant
  // Dots must stay locked to plane center regardless of surfScale
  if(surfType==='plane'&&_frostedGridMat&&_frostedGridMat.map){
    var sx=surfScale*surfScaleAxes.x||1;
    var sy=surfScale*surfScaleAxes.y||1;
    var repX=40*sx, repY=40*sy;
    _frostedGridMat.map.repeat.set(repX,repY);
    // Lock dot pattern to plane center: UV 0.5 must always be a tile boundary.
    // effectiveUV = UV * repeat + offset. At UV=0.5: tile_pos = 0.5*R + offset.
    // For dot at center: (0.5*R + offset) must be integer → offset = -(0.5*R % 1)
    var offX=-(0.5*repX%1);
    var offY=-(0.5*repY%1);
    _frostedGridMat.map.offset.set(offX,offY);
    _frostedGridMat.map.needsUpdate=true;
  }
  markDirty();
  if(window._gDraw)window._gDraw();
  if(window._syncLocalGizmo)window._syncLocalGizmo();
  // Reposition scale cage when surface moves
  syncScaleCage();
}
function setSurfHover(on){if(!surfFillMat||!surfWireMat||on===isHovering)return;isHovering=on;surfFillMat.opacity=on?.38:.16;surfWireMat.opacity=on?.5:.28;}
buildSurf();


// ── Shared axis/gizmo math helpers ──────────────────────────────
// Used by the surface gizmo, stroke gizmo, and primitives gizmo (previously
// duplicated verbatim in each of those modules).
const WORLD={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
function cameraLookDir(){const ac=activeCam();return new THREE.Vector3().subVectors(ac.position,new THREE.Vector3(0,0,0)).normalize();}
function axisDir2D(worldAxis){const ac=activeCam(),o=new THREE.Vector3(0,0,0).project(ac),t=worldAxis.clone().normalize().project(ac);const dx=t.x-o.x,dy=-(t.y-o.y),len=Math.sqrt(dx*dx+dy*dy)||1;return{nx:dx/len,ny:dy/len};}
function aDir(ax){return axisDir2D(WORLD[ax]);}
function ringAxes3D(ax){const pairs={x:['y','z'],y:['x','z'],z:['x','y']};const[a,b]=pairs[ax];return{da3:WORLD[a],db3:WORLD[b]};}

// ================================================================
//  LOCAL PLANE GIZMO v29 — unified 2D overlay (prototype parity)
//  One gizmo: arcs=rotate, arrows=move/scale, center=tap to toggle
//  Mode: 0=off, 1=on (move arrows + rotate arcs + center btn)
// ================================================================
