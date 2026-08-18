// ============================================================
// rendering-strokes.js
// Rendering + strokes: raycasting, theme system, materials, stroke physics/eraser, selection & hover visuals, layers
// ============================================================
updCam();

// ── Renderer rect cache — getBoundingClientRect is a forced layout; cache it ──
var _cachedRect={left:0,top:0,width:innerWidth,height:innerHeight};
function _refreshRect(){_cachedRect=renderer.domElement.getBoundingClientRect();}
_refreshRect();
// Keep rect fresh on resize / orientation change
window.addEventListener('resize',function(){
  _syncRenderer();
  if(typeof updateLayoutMode==='function')updateLayoutMode();
});
// visualViewport fires in PWA standalone when window.resize doesn't (e.g. Android system bar settle)
if(window.visualViewport){
  window.visualViewport.addEventListener('resize',function(){
    _syncRenderer();
    if(typeof updateLayoutMode==='function')updateLayoutMode();
  });
}

// ── Raycasting ───────────────────────────────────────────────────
const drawRC=new THREE.Raycaster();
function s2w(px,py){
  var r=_cachedRect;
  var ndcX=((px-r.left)/r.width)*2-1, ndcY=-((py-r.top)/r.height)*2+1;
  var ndc=new THREE.Vector2(ndcX,ndcY);
  if(_fpsMode&&_fpsSurfMode===1&&_fpsPlaneFill){
    drawRC.setFromCamera(ndc,activeCam());
    _fpsPlaneFill.material.side=THREE.DoubleSide;
    var fhits=drawRC.intersectObject(_fpsPlaneFill,false);
    return fhits.length?fhits[0].point.clone():null;
  }
  // Prims-as-plane mode: raycast against all prim meshes
  if(window._primsAsPlane && window._primRaycast){
    drawRC.setFromCamera(ndc,activeCam());
    var ph=window._primRaycast(drawRC);
    if(ph) return ph.point.clone();
    return null;
  }
  if(!surfMesh)return null;
  if(surfType==='none')return null;
  if(surfType==='loft'&&!window._loftGeo)return null;
  drawRC.setFromCamera(ndc,activeCam());
  var prev=surfMesh.material.side;surfMesh.material.side=THREE.DoubleSide;
  var shits=drawRC.intersectObject(surfMesh,false);surfMesh.material.side=prev;
  return shits.length?shits[0].point.clone():null;
}
const hoverRC=new THREE.Raycaster();
function checkHover(px,py){
  var r=_cachedRect;
  var ndcX=((px-r.left)/r.width)*2-1, ndcY=-((py-r.top)/r.height)*2+1;
  var ndc=new THREE.Vector2(ndcX,ndcY);
  if(_fpsMode&&_fpsSurfMode===1&&_fpsPlaneFill){
    hoverRC.setFromCamera(ndc,activeCam());
    _fpsPlaneFill.material.side=THREE.DoubleSide;
    var fhits=hoverRC.intersectObject(_fpsPlaneFill,false);
    return fhits.length>0;
  }
  // Prims-as-plane mode: hover check against prim meshes
  if(window._primsAsPlane && window._primRaycast){
    hoverRC.setFromCamera(ndc,activeCam());
    var ph=window._primRaycast(hoverRC);
    return ph !== null;
  }
  if(!surfMesh)return false;
  if(surfType==='none')return false;
  if(surfType==='loft'&&!window._loftGeo)return false;
  hoverRC.setFromCamera(ndc,activeCam());
  var prev=surfMesh.material.side;surfMesh.material.side=THREE.DoubleSide;
  var shits=hoverRC.intersectObject(surfMesh,false);surfMesh.material.side=prev;
  return shits.length>0;
}

// ── Depth system — frosted glass (v5.6) ──────────────────────────
// Depth cue is now the _frostedMesh in surfGroup. No per-vertex recoloring.
const BG_COL=new THREE.Color(0xf4f1ea);

// ── UI Theme System ─────────────────────────────────────────────
// _uiTheme: 'default' | 'dark' | 'light'
var _uiTheme='default';
// JS-side ink RGB for canvas drawing — updated by setUITheme
var _inkRGB={r:26,g:26,b:46};
// Helper: returns 'rgba(r,g,b, alpha)' for canvas drawing
function _themeInk(a){return 'rgba('+_inkRGB.r+','+_inkRGB.g+','+_inkRGB.b+','+a+')';}
// Contrasting highlight color for canvas hover overlays
var _themeHilight='#fff';
// E-ink desaturation: convert any CSS color to grayscale luminance when eink theme active

// Sync world grid + surface + drawing plane colors for eink vs normal themes
var SURF_TRACE_EINK=0x888888;
function _activeSurfTrace(){return _uiTheme==='eink'?SURF_TRACE_EINK:_curSurfTrace;}

// Track surface grid HSL for texture generation
var _surfGridHSL=null;

// Derive grid/plane colors from bg color (non-eink themes)
function _syncGridToBg(bgCol){
  var hsl={};bgCol.getHSL(hsl);
  var isDark=hsl.l<0.3;
  // Surface trace: shift lightness toward mid, push harder on very light bgs
  // For near-white achromatic bgs, use same gray as eink
  var isNearWhite=hsl.l>0.9&&hsl.s<0.1;
  if(isNearWhite){
    var traceL=0.53;var traceS=0;
  } else {
    var lOff=isDark?0.22:0.22;
    var traceL=isDark?Math.min(hsl.l+lOff,0.5):Math.max(hsl.l-lOff,0.3);
    var traceS=Math.min(hsl.s*1.3+0.05,0.6);
  }
  var traceCol=new THREE.Color().setHSL(hsl.h,traceS,traceL);
  var traceHex=traceCol.getHex();
  _curSurfTrace=traceHex;
  if(surfFillMat)surfFillMat.color.setHex(traceHex);
  if(surfWireMat)surfWireMat.color.setHex(traceHex);
  if(surfGroup){surfGroup.children.forEach(function(c){
    if(c.isLineSegments&&c.material&&c.renderOrder===8)c.material.color.setHex(traceHex);
  });}
  if(_fpsPlaneFill&&_fpsPlaneFill.material)_fpsPlaneFill.material.color.setHex(traceHex);
  // World grid: two shades — center line darker, grid lines lighter
  if(isNearWhite){
    var g1L=0.6;var g2L=0.7;var gS=0;
  } else {
    var g1Off=isDark?0.15:0.18;
    var g2Off=isDark?0.10:0.10;
    var g1L=isDark?Math.min(hsl.l+g1Off,0.45):Math.max(hsl.l-g1Off,0.35);
    var g2L=isDark?Math.min(hsl.l+g2Off,0.38):Math.max(hsl.l-g2Off,0.42);
    var gS=Math.min(hsl.s*1.1+0.03,0.5);
  }
  var gS=Math.min(hsl.s*1.1+0.03,0.5);
  var gc1=new THREE.Color().setHSL(hsl.h,gS,g1L);
  var gc2=new THREE.Color().setHSL(hsl.h,gS,g2L);
  var newGrid=new THREE.GridHelper(20,20,gc1.getHex(),gc2.getHex());
  gridH.geometry.dispose();
  gridH.geometry=newGrid.geometry;
  if(gridH.material.vertexColors===undefined)gridH.material.vertexColors=true;
  gridH.material.needsUpdate=true;
  newGrid.material.dispose();
  // Store HSL for surface grid texture
  _surfGridHSL={h:hsl.h,s:traceS,l:traceL};
  applyFrostedGridTex();
  markDirty();
}
function _syncGridColors(eink){
  if(eink){
    _curSurfTrace=SURF_TRACE_EINK;
    _surfGridHSL=null;
    // World grid gray
    var newGrid=new THREE.GridHelper(20,20,0x999999,0xcccccc);
    gridH.geometry.dispose();
    gridH.geometry=newGrid.geometry;
    if(gridH.material.vertexColors===undefined)gridH.material.vertexColors=true;
    gridH.material.needsUpdate=true;
    newGrid.material.dispose();
    // Surface/plane materials gray
    if(surfFillMat)surfFillMat.color.setHex(SURF_TRACE_EINK);
    if(surfWireMat)surfWireMat.color.setHex(SURF_TRACE_EINK);
    if(surfGroup){surfGroup.children.forEach(function(c){
      if(c.isLineSegments&&c.material&&c.renderOrder===8)c.material.color.setHex(SURF_TRACE_EINK);
    });}
    if(_fpsPlaneFill&&_fpsPlaneFill.material)_fpsPlaneFill.material.color.setHex(SURF_TRACE_EINK);
    applyFrostedGridTex();
    markDirty();
  } else {
    // Re-derive from current bg
    var bgCol=scene.background||new THREE.Color(0xf4f1ea);
    _syncGridToBg(bgCol);
  }
}

function setUITheme(theme){
  _uiTheme=theme||'default';
  if(_uiTheme==='dark'){
    _inkRGB={r:224,g:224,b:228};
    _themeHilight='#333';
    document.body.setAttribute('data-theme','dark');
  } else if(_uiTheme==='light'){
    _inkRGB={r:26,g:26,b:46};
    _themeHilight='#fff';
    document.body.setAttribute('data-theme','light');
  } else if(_uiTheme==='eink'){
    _inkRGB={r:0,g:0,b:0};
    _themeHilight='#ccc';
    document.body.setAttribute('data-theme','eink');
    _syncGridColors(true);
  } else {
    _inkRGB={r:26,g:26,b:46};
    _themeHilight='#fff';
    document.body.removeAttribute('data-theme');
  }
  if(_uiTheme!=='eink')_syncGridColors(false);
  // Update meta theme-color
  var mt=document.querySelector('meta[name="theme-color"]');
  if(mt){
    var st=getComputedStyle(document.documentElement);
    mt.setAttribute('content',st.getPropertyValue('--bg').trim());
  }
  // Redraw all canvases
  if(window._gDraw)window._gDraw();
  if(window._pbGcDraw)window._pbGcDraw();
  if(window._ncDraw)window._ncDraw();
  if(window._pbNcDraw)window._pbNcDraw();
  if(window._sgGcDraw)window._sgGcDraw();
  if(window._pgGcDraw)window._pgGcDraw();
  if(window._brushRedraw)window._brushRedraw();
  markDirty();
}

// Stubs kept for undo/redo references
var _lastPlaneKey='';
function updateDepth(){}
function resetDepthColors(){}

// ── Material cache ────────────────────────────────────────────────
const _matCache=new Map();
function getStrokeMat(color,op,flat){
  const key=color+'|'+op.toFixed(3)+'|'+(flat?'1':'0');
  if(_matCache.has(key))return _matCache.get(key);
  const col=new THREE.Color(color);
  const mat=new THREE.MeshBasicMaterial({
    color:col,transparent:op<1,opacity:op,
    side:THREE.DoubleSide
  });
  _matCache.set(key,mat);
  return mat;
}
function getStrokeMatForMesh(color,op,flat){return getStrokeMat(color,op,flat);}

// ── Stroke physics ───────────────────────────────────────────────
function computeVels(pts){
  var v=[0];
  for(var i=1;i<pts.length;i++)v.push(pts[i].distanceTo(pts[i-1]));
  // 7-point gaussian-weighted smoothing kernel [1,4,8,12,8,4,1]/38
  var s=v.slice();
  var weights=[1,4,8,12,8,4,1],half=3;
  for(var i=0;i<s.length;i++){
    var sum=0,wUsed=0;
    for(var j=-half;j<=half;j++){
      var idx=i+j;
      if(idx>=0&&idx<v.length){sum+=v[idx]*weights[j+half];wUsed+=weights[j+half];}
    }
    s[i]=sum/wUsed;
  }
  // Clamp velocity on last 3 points to avoid whipping artifact on pen lift
  var tail=Math.min(3,s.length-1);
  if(s.length>2){
    var refV=s[s.length-1-tail]||s[0];
    for(var j=s.length-tail;j<s.length;j++)s[j]=Math.min(s[j],refV*1.5);
  }
  // Also clamp first 3 points to avoid start whip
  var head=Math.min(3,s.length-1);
  if(s.length>2){
    var refVH=s[head]||s[s.length-1];
    for(var k=0;k<head;k++)s[k]=Math.min(s[k],refVH*1.5);
  }
  return s;
}

// velocityTaper: when false, uniform radius (no speed-based taper)
let velocityTaper=true;

function buildTube(pts,vels,color,sz,op,flat){
  if(pts.length<2)return null;
  const f=[pts[0]],fv=[vels[0]];
  for(let i=1;i<pts.length;i++){if(f[f.length-1].distanceTo(pts[i])>.003){f.push(pts[i]);fv.push(vels[i]);}}
  if(f.length<2)return null;
  var maxV=0,minV=Infinity;for(var _vi=0;_vi<fv.length;_vi++){if(fv[_vi]>maxV)maxV=fv[_vi];if(fv[_vi]<minV)minV=fv[_vi];}
  if(maxV===0)maxV=1;const range=maxV-minV||1;
  const N=f.length,baseR=sz*.011;
  const mat=getStrokeMatForMesh(color,op,flat);
  if(flat){
    const curve=new THREE.CatmullRomCurve3(f),segs=Math.max(N*3,12);
    // Fallback normal: group orientation (correct for planes, used when ray misses)
    const groupNorm=new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
    // Raycaster for sampling local surface normal per segment point
    const _flatRC=new THREE.Raycaster();
    const _flatRCOrigin=new THREE.Vector3();
    const pos=[],norms=[],idx=[];
    for(let i=0;i<=segs;i++){
      const t=i/segs;
      const vIdx=Math.min(Math.floor(t*(N-1)),N-1);
      const vn=velocityTaper?(fv[vIdx]-minV)/range*0.75:0;
      const velZone=t<.08?t/.08:t>.92?(1-t)/.08:1;
      var vw=1-vn*velZone*.65;
      var w=baseR*4*vw,h=baseR*.5;
      const pt=curve.getPoint(t),tang=curve.getTangent(t).normalize();
      // Sample local normal: cast ray from slightly above pt along inverted group normal
      let up=groupNorm.clone();
      if(surfMesh&&surfMesh.geometry){
        _flatRCOrigin.copy(pt).addScaledVector(groupNorm,0.1);
        _flatRC.set(_flatRCOrigin,groupNorm.clone().negate());
        _flatRC.near=0;_flatRC.far=0.5;
        const prevSide=surfMesh.material.side;
        surfMesh.material.side=THREE.DoubleSide;
        const hits=_flatRC.intersectObject(surfMesh,false);
        surfMesh.material.side=prevSide;
        if(hits.length>0&&hits[0].face){
          // Transform face normal from mesh local space to world space
          const fn=hits[0].face.normal.clone()
            .applyQuaternion(surfGroup.quaternion).normalize();
          // Ensure normal points same way as group normal (not inward)
          if(fn.dot(groupNorm)<0)fn.negate();
          up=fn;
        }
      }
      let side=new THREE.Vector3().crossVectors(tang,up).normalize();
      if(side.lengthSq()<.001){
        // tang parallel to up — pick an arbitrary perpendicular
        side.set(1,0,0);
        if(Math.abs(up.x)>.9)side.set(0,1,0);
        side.crossVectors(side,up).normalize();
      }
      pos.push(pt.x+side.x*w+up.x*h,pt.y+side.y*w+up.y*h,pt.z+side.z*w+up.z*h,pt.x-side.x*w+up.x*h,pt.y-side.y*w+up.y*h,pt.z-side.z*w+up.z*h,pt.x+side.x*w-up.x*h,pt.y+side.y*w-up.y*h,pt.z+side.z*w-up.z*h,pt.x-side.x*w-up.x*h,pt.y-side.y*w-up.y*h,pt.z-side.z*w-up.z*h);
      const un=up.toArray(),dn=up.clone().negate().toArray();norms.push(...un,...un,...dn,...dn);
    }
    for(let i=0;i<segs;i++){const b=i*4;idx.push(b,b+4,b+1,b+1,b+4,b+5,b+2,b+3,b+6,b+3,b+7,b+6,b,b+2,b+4,b+2,b+6,b+4,b+1,b+5,b+3,b+3,b+5,b+7);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new THREE.Float32BufferAttribute(norms,3));geo.setIndex(idx);geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,mat);m.renderOrder=3;m.userData.radSeg=4;return m;
  }
  try{
    const curve=new THREE.CatmullRomCurve3(f),segs=Math.max(N*3,12),radSeg=Math.min(8,Math.max(5,segs>>2));
    const geo=new THREE.TubeGeometry(curve,segs,baseR,radSeg,false);
    const pa=geo.attributes.position,rc2=segs+1;
    for(let ring=0;ring<rc2;ring++){
      const t=ring/(rc2-1);
      const vIdx=Math.min(Math.floor(t*(N-1)),N-1);
      // Velocity min floor: scale vn by 0.75 so fastest sections thin to ~55% base radius
      const vn=velocityTaper?(fv[vIdx]-minV)/range*0.75:0;
      // Velocity influence fades to 0 in cap zones (first/last 12%) so caps always match full weight
      const velZone=t<.12?t/.12:t>.88?(1-t)/.12:1;
      var sc=1-vn*velZone*.6;
      // Scale from actual ring centroid (not re-sampled curve point) to avoid lateral geometry shift
      const rs=ring*radSeg;
      let cx=0,cy=0,cz=0,cnt=0;
      for(let s=0;s<radSeg;s++){const vi=rs+s;if(vi>=pa.count)break;cx+=pa.getX(vi);cy+=pa.getY(vi);cz+=pa.getZ(vi);cnt++;}
      if(cnt>0){cx/=cnt;cy/=cnt;cz/=cnt;}
      for(let s=0;s<radSeg;s++){const vi=rs+s;if(vi>=pa.count)break;pa.setXYZ(vi,cx+(pa.getX(vi)-cx)*sc,cy+(pa.getY(vi)-cy)*sc,cz+(pa.getZ(vi)-cz)*sc);}
    }
    pa.needsUpdate=true;geo.computeVertexNormals();
    const m=new THREE.Mesh(geo,mat);m.renderOrder=3;m.userData.radSeg=radSeg;return m;
  }catch(e){return null;}
}

// ── End cap: sphere at start & end, matching full stroke radius ──
function buildCap(pt,color,sz,op){
  const r=sz*.011;
  const mat=getStrokeMatForMesh(color,op,false);
  const m=new THREE.Mesh(new THREE.SphereGeometry(r,8,6),mat);
  m.position.copy(pt);m.renderOrder=3;return m;
}

// ── State ────────────────────────────────────────────────────────
let mode='draw',flatBrush=false;
var _partialErase=false; // false=whole-line erase (default), true=partial erase (split)
let prevDrawMode='draw'; // tracks last draw/erase/select mode for returning from nav modes
let curColor='#000000',brushSz=1,brushOp=.95;
let isDrawing=false,rawPts=[],smoothPts=[],velHistory=[],lazyPos=null;
const LAZY_ON=.18,LAZY_OFF=1.0;let smoothingOn=false,LAZY=LAZY_OFF;

// Layers
// Layers declared below in layer system section

// Strokes + undo/redo
const strokes=[],redoStack=[];


var _UNDO_MAX=100;
function pushUndo(action){_redoStack.length=0;redoStack.length=0;_undoStack.push(action);if(_undoStack.length>_UNDO_MAX)_undoStack.shift();}
const _undoStack=[];
const _redoStack=[];

function undo(){
  if(_undoStack.length){
    const a=_undoStack.pop();
    if(a.type==='stroke_add'){const i=strokes.indexOf(a.stroke);if(i>-1){strokes.splice(i,1);scene.remove(a.stroke.mesh);}_redoStack.push(a);clearSelection();_lastPlaneKey='';markDirty();return;}
    if(a.type==='stroke_delete'){scene.add(a.stroke.mesh);strokes.splice(a.index,0,a.stroke);_redoStack.push(a);_lastPlaneKey='';showMergeLayerRow(strokes.some(function(s){return s.layer===3;}));markDirty();return;}
    if(a.type==='stroke_transform'){
      const redo_a={type:'stroke_transform',stroke:a.stroke,oldMatrix:a.stroke.mesh.matrix.clone()};
      a.stroke.mesh.matrix.copy(a.oldMatrix);
      a.stroke.mesh.matrix.decompose(a.stroke.mesh.position,a.stroke.mesh.quaternion,a.stroke.mesh.scale);
      _redoStack.push(redo_a);
      markDirty();updateSelHighlights();if(window._sgGcDraw)window._sgGcDraw();return;
    }
    if(a.type==='stroke_transform_multi'){
      const redo_a={type:'stroke_transform_multi',strokes:a.strokes,oldMatrices:a.strokes.map(s=>s.mesh.matrix.clone())};
      a.strokes.forEach((s,i)=>{s.mesh.matrix.copy(a.oldMatrices[i]);s.mesh.matrix.decompose(s.mesh.position,s.mesh.quaternion,s.mesh.scale);});
      _redoStack.push(redo_a);
      markDirty();updateSelHighlights();if(window._sgGcDraw)window._sgGcDraw();return;
    }
    if(a.type==='stroke_duplicate'){
      const i=strokes.indexOf(a.newStroke);if(i>-1){strokes.splice(i,1);scene.remove(a.newStroke.mesh);}_redoStack.push(a);clearSelection();markDirty();return;
    }
    if(a.type==='stroke_split'){
      // Remove the split halves
      a.newStrokes.forEach(function(ns){var si=strokes.indexOf(ns);if(si>-1)strokes.splice(si,1);scene.remove(ns.mesh);ns.mesh.traverse(function(c){if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});});
      // Restore original
      scene.add(a.original.mesh);strokes.splice(a.originalIndex,0,a.original);
      _redoStack.push(a);clearSelection();markDirty();return;
    }
    if(a.type==='merge_layer'){
      // Remove merged stroke from scene
      var mi=strokes.indexOf(a.mergedStroke);if(mi>-1){strokes.splice(mi,1);}scene.remove(a.mergedStroke.mesh);
      // Restore replaced merged strokes if any
      a.replacedMerged.forEach(function(s){scene.add(s.mesh);strokes.push(s);});
      // Restore originals in order
      var sorted=a.origStrokes.slice().map(function(s,ii){return{s:s,idx:a.savedOrigIndices[ii]};});
      sorted.sort(function(x,y){return x.idx-y.idx;});
      sorted.forEach(function(item){scene.add(item.s.mesh);strokes.splice(item.idx,0,item.s);});
      _redoStack.push(a);
      showMergeLayerRow(strokes.some(function(s){return s.layer===3;}));
      applyLayerVisibility();markDirty();return;
    }
    if(a.type==='prim_add'){
      // Undo adding a prim: save current state for redo, then remove
      var curPos=a.prim.mesh.position.clone(),curQ=a.prim.mesh.quaternion.clone(),curS=a.prim.mesh.scale.clone();
      if(window._primUndoAdd)window._primUndoAdd(a.prim);
      _redoStack.push({type:'prim_add',prim:a.prim,savedPos:curPos,savedQuat:curQ,savedScale:curS});
      return;
    }
    if(a.type==='prim_delete'){
      if(window._primUndoDelete)window._primUndoDelete(a.prim, a.index);
      _redoStack.push(a);
      return;
    }
    if(a.type==='prim_transform'){
      var curPos=a.prim.mesh.position.clone(),curQ=a.prim.mesh.quaternion.clone(),curS=a.prim.mesh.scale.clone();
      if(window._primUndoTransform)window._primUndoTransform(a.prim, a.oldPos, a.oldQuat, a.oldScale);
      _redoStack.push({type:'prim_transform',prim:a.prim,oldPos:curPos,oldQuat:curQ,oldScale:curS});
      return;
    }
  }
  // No-op when there are no typed undo actions (e.g. just after initial load).
  // The legacy redoStack fallback was removed — undoing into restored content was
  // surprising and left redo in an inconsistent state.
}
function redo(){
  // Handle typed actions from _redoStack first
  if(_redoStack.length){
    const a=_redoStack.pop();
    if(a.type==='stroke_add'){scene.add(a.stroke.mesh);strokes.push(a.stroke);_undoStack.push(a);_lastPlaneKey='';markDirty();return;}
    if(a.type==='stroke_delete'){const i=strokes.indexOf(a.stroke);if(i>-1){strokes.splice(i,1);scene.remove(a.stroke.mesh);}else{scene.remove(a.stroke.mesh);}_undoStack.push(a);_lastPlaneKey='';showMergeLayerRow(strokes.some(function(s){return s.layer===3;}));markDirty();return;}
    if(a.type==='stroke_transform'){
      const undo_a={type:'stroke_transform',stroke:a.stroke,oldMatrix:a.stroke.mesh.matrix.clone()};
      a.stroke.mesh.matrix.copy(a.oldMatrix);
      a.stroke.mesh.matrix.decompose(a.stroke.mesh.position,a.stroke.mesh.quaternion,a.stroke.mesh.scale);
      _undoStack.push(undo_a);
      markDirty();updateSelHighlights();if(window._sgGcDraw)window._sgGcDraw();return;
    }
    if(a.type==='stroke_transform_multi'){
      const undo_a={type:'stroke_transform_multi',strokes:a.strokes,oldMatrices:a.strokes.map(s=>s.mesh.matrix.clone())};
      a.strokes.forEach((s,i)=>{s.mesh.matrix.copy(a.oldMatrices[i]);s.mesh.matrix.decompose(s.mesh.position,s.mesh.quaternion,s.mesh.scale);});
      _undoStack.push(undo_a);
      markDirty();updateSelHighlights();if(window._sgGcDraw)window._sgGcDraw();return;
    }
    if(a.type==='stroke_duplicate'){scene.add(a.newStroke.mesh);strokes.push(a.newStroke);_undoStack.push(a);markDirty();return;}
    if(a.type==='stroke_split'){
      // Re-remove original, re-add split halves
      var oi=strokes.indexOf(a.original);if(oi>-1)strokes.splice(oi,1);scene.remove(a.original.mesh);
      a.newStrokes.forEach(function(ns){
        // Rebuild mesh if it was disposed during undo
        if(!ns.mesh.parent){
          var rg=new THREE.Group();
          var rt=buildTube(ns.pts,ns.vels,ns.color,ns.sz,ns.op,ns.flat);if(rt)rg.add(rt);
          if(!ns.flat){rg.add(buildCap(ns.pts[0],ns.color,ns.sz,ns.op));rg.add(buildCap(ns.pts[ns.pts.length-1],ns.color,ns.sz,ns.op));}
          rg.matrix.copy(a.original.mesh.matrix);rg.matrix.decompose(rg.position,rg.quaternion,rg.scale);rg.matrixAutoUpdate=false;
          ns.mesh=rg;
        }
        scene.add(ns.mesh);strokes.push(ns);
      });
      _undoStack.push(a);clearSelection();markDirty();return;
    }
    if(a.type==='merge_layer'){
      // Re-remove originals
      a.origStrokes.forEach(function(s){var idx=strokes.indexOf(s);if(idx>-1)strokes.splice(idx,1);scene.remove(s.mesh);});
      // Re-remove any replaced merged strokes
      a.replacedMerged.forEach(function(s){var idx=strokes.indexOf(s);if(idx>-1)strokes.splice(idx,1);scene.remove(s.mesh);});
      // Re-add merged stroke
      scene.add(a.mergedStroke.mesh);strokes.push(a.mergedStroke);
      _undoStack.push(a);
      showMergeLayerRow(true);applyLayerVisibility();markDirty();return;
    }
    if(a.type==='prim_add'){
      if(window._primRedoAdd)window._primRedoAdd(a.prim);
      // Restore saved transform if present
      if(a.savedPos){a.prim.mesh.position.copy(a.savedPos);a.prim.mesh.quaternion.copy(a.savedQuat);a.prim.mesh.scale.copy(a.savedScale);a.prim.mesh.updateMatrix();a.prim.mesh.matrixAutoUpdate=false;}
      _undoStack.push({type:'prim_add',prim:a.prim});
      return;
    }
    if(a.type==='prim_delete'){
      if(window._primRedoDelete)window._primRedoDelete(a.prim);
      _undoStack.push(a);
      return;
    }
    if(a.type==='prim_transform'){
      var curPos=a.prim.mesh.position.clone(),curQ=a.prim.mesh.quaternion.clone(),curS=a.prim.mesh.scale.clone();
      if(window._primUndoTransform)window._primUndoTransform(a.prim, a.oldPos, a.oldQuat, a.oldScale);
      _undoStack.push({type:'prim_transform',prim:a.prim,oldPos:curPos,oldQuat:curQ,oldScale:curS});
      return;
    }
  }
  // No-op when _redoStack is empty. Legacy redoStack fallback was removed (see undo()).
}
function clearAll(){
  clearSelection();
  while(strokes.length){const s=strokes.pop();scene.remove(s.mesh);s.mesh.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});}
  redoStack.length=0;_undoStack.length=0;_redoStack.length=0;showMergeLayerRow(false);markDirty();
}

// ── Preview line — pre-allocated geometry, updated in-place each point ──────
// Avoids creating new BufferGeometry + LineBasicMaterial on every touchmove.
// Buffer is sized for MAX_PREV_PTS; drawRange tells Three.js how many to draw.
var MAX_PREV_PTS=2048;
var _prevBuf=new Float32Array(MAX_PREV_PTS*3);
var _prevGeo=new THREE.BufferGeometry();
_prevGeo.setAttribute('position',new THREE.BufferAttribute(_prevBuf,3));
_prevGeo.setDrawRange(0,0);
var _prevMat=new THREE.LineBasicMaterial({color:0x1a1a2e,transparent:true,opacity:.75,linewidth:2});
var prevLine=new THREE.Line(_prevGeo,_prevMat);
prevLine.renderOrder=4;
prevLine.frustumCulled=false;
// Not added to scene until first draw; toggled via visible flag
prevLine.visible=false;
scene.add(prevLine);

function updPrev(pts){
  var n=Math.min(pts.length,MAX_PREV_PTS);
  if(n<2){prevLine.visible=false;markDirty();return;}
  // Sync material color/opacity to current brush
  _prevMat.color.set(curColor);
  _prevMat.opacity=brushOp*.75;
  // Write positions into pre-allocated buffer
  for(var i=0;i<n;i++){_prevBuf[i*3]=pts[i].x;_prevBuf[i*3+1]=pts[i].y;_prevBuf[i*3+2]=pts[i].z;}
  _prevGeo.attributes.position.needsUpdate=true;
  _prevGeo.setDrawRange(0,n);
  prevLine.visible=true;
  markDirty();
}

function finStroke(){
  prevLine.visible=false;_prevGeo.setDrawRange(0,0);
  var pts=(smoothPts.length>=2?smoothPts:rawPts).slice();
  rawPts=[];smoothPts=[];velHistory=[];lazyPos=null;
  if(pts.length<1)return;
  // Single-point tap: duplicate with micro-offset so buildTube can make a dot
  if(pts.length===1){var dp=pts[0].clone();dp.x+=0.002;pts.push(dp);}
  // Trim trailing points that reverse or hook at end of stroke.
  // Smooth mode: trim shallow hooks too (dot < 0.15) since lazy smoothing can
  // leave a lagging tail. Raw mode (v14.2): trim disabled entirely (-1.1) so
  // even full reversals survive — preserves the user's original line shape.
  var _trimThresh=smoothingOn?0.15:-1.1;
  if(pts.length>3){
    var _safety=0;
    while(pts.length>3&&_safety<12){
      _safety++;
      var _n=pts.length;
      var _d1=new THREE.Vector3().subVectors(pts[_n-2],pts[_n-3]).normalize();
      var _d2=new THREE.Vector3().subVectors(pts[_n-1],pts[_n-2]).normalize();
      if(_d1.dot(_d2)<_trimThresh){pts=pts.slice(0,_n-1);}
      else{break;}
    }
  }
  const vels=computeVels(pts);
  const g=new THREE.Group();
  const tube=buildTube(pts,vels,curColor,brushSz,brushOp,flatBrush);if(tube)g.add(tube);
  // Always add caps for non-flat strokes (start cap = rounded nib, end cap = rounded tail)
  if(!flatBrush){
    g.add(buildCap(pts[0],curColor,brushSz,brushOp));
    g.add(buildCap(pts[pts.length-1],curColor,brushSz,brushOp));
  }
  const s={pts,vels,color:curColor,sz:brushSz,op:brushOp,flat:flatBrush,layer:activeLayer,mesh:g,_depthKey:''};
  g.matrixAutoUpdate=false;g.updateMatrix();
  scene.add(g);strokes.push(s);
  // New stroke needs depth color assigned — mark it dirty so updateDepth picks it up next frame
  s._depthKey='';
  pushUndo({type:'stroke_add',stroke:s});
  markDirty();
}

// ── Eraser ───────────────────────────────────────────────────────
function tryErase(px,py){
  _refreshRect();
  var r=_cachedRect;
  const sx=px-r.left,sy=py-r.top,W=r.width,H=r.height,ac=activeCam();
  const THRESH=22,tmpV=new THREE.Vector3();
  var bestI=-1,bestDist=THRESH,bestPtIdx=-1;
  for(let i=strokes.length-1;i>=0;i--){
    const s=strokes[i];
    if(!s.mesh.visible)continue;
    s.mesh.updateMatrixWorld(false);
    var mw=s.mesh.matrixWorld;
    const step=Math.max(1,Math.floor(s.pts.length/60));
    var minDist=Infinity,nearMiss=false,minPtIdx=0;
    // Coarse pass
    for(let j=0;j<s.pts.length;j+=step){
      tmpV.copy(s.pts[j]).applyMatrix4(mw);tmpV.project(ac);
      var d=Math.hypot((tmpV.x*.5+.5)*W-sx,(-tmpV.y*.5+.5)*H-sy);
      if(d<minDist){minDist=d;minPtIdx=j;}
      if(d<THRESH*2)nearMiss=true;
    }
    // Dense pass if coarse pass was close — scan the full point list to get true minimum
    if(nearMiss){
      for(let jj=0;jj<s.pts.length;jj++){
        tmpV.copy(s.pts[jj]).applyMatrix4(mw);tmpV.project(ac);
        var dd=Math.hypot((tmpV.x*.5+.5)*W-sx,(-tmpV.y*.5+.5)*H-sy);
        if(dd<minDist){minDist=dd;minPtIdx=jj;}
      }
    }
    if(minDist<bestDist){bestDist=minDist;bestI=i;bestPtIdx=minPtIdx;}
  }
  if(bestI>-1){
    const s=strokes[bestI];const i=bestI;
    if(s===_hoverStroke)setHoverStroke(null);

    if(_partialErase){
      // Partial erase: remove points within screen radius around touch, split remainder
      s.mesh.updateMatrixWorld(false);
      var mw2=s.mesh.matrixWorld;
      var ERASE_R=12+brushSz*3; // sz1→15, sz3→21, sz6→30
      // Use bestPtIdx as center — find contiguous range of points near the touch
      var keepL=[],keepR=[],hitZone=false,pastZone=false;
      for(var pi=0;pi<s.pts.length;pi++){
        tmpV.copy(s.pts[pi]).applyMatrix4(mw2);tmpV.project(ac);
        var pd=Math.hypot((tmpV.x*.5+.5)*W-sx,(-tmpV.y*.5+.5)*H-sy);
        if(pd<ERASE_R){hitZone=true;}
        else if(hitZone&&!pastZone){pastZone=true;keepR.push(s.pts[pi]);}
        else if(pastZone){keepR.push(s.pts[pi]);}
        else{keepL.push(s.pts[pi]);}
      }
      // If no points in radius, do nothing (don't fall through to whole delete)
      if(!hitZone)return false;
      // If entire stroke is within radius, delete the whole thing
      if(!keepL.length&&!keepR.length){
        pushUndo({type:'stroke_delete',stroke:s,index:i});
        strokes.splice(i,1);scene.remove(s.mesh);
        s.mesh.traverse(function(c){if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});
        markDirty();return true;
      }
      // Remove original stroke from scene (keep mesh alive for undo)
      scene.remove(s.mesh);
      strokes.splice(i,1);
      // Build halves from remaining points
      var newStrokes=[];
      var halves=[keepL,keepR];
      for(var hi=0;hi<halves.length;hi++){
        var hp=halves[hi];
        if(hp.length<2)continue;
        var hpts=hp.map(function(p){return p.clone();});
        var hvels=computeVels(hpts);
        var hg=new THREE.Group();
        var htube=buildTube(hpts,hvels,s.color,s.sz,s.op,s.flat);
        if(htube)hg.add(htube);
        if(!s.flat){
          hg.add(buildCap(hpts[0],s.color,s.sz,s.op));
          hg.add(buildCap(hpts[hpts.length-1],s.color,s.sz,s.op));
        }
        // Copy original stroke transform
        hg.matrix.copy(s.mesh.matrix);
        hg.matrix.decompose(hg.position,hg.quaternion,hg.scale);
        hg.matrixAutoUpdate=false;
        var ns={pts:hpts,vels:hvels,color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer,mesh:hg,_depthKey:''};
        scene.add(hg);strokes.push(ns);
        newStrokes.push(ns);
      }
      pushUndo({type:'stroke_split',original:s,originalIndex:i,newStrokes:newStrokes});
      markDirty();return true;
    }

    // Whole-line erase (default)
    pushUndo({type:'stroke_delete',stroke:s,index:i});
    strokes.splice(i,1);scene.remove(s.mesh);
    s.mesh.traverse(function(c){if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});
    markDirty();return true;
  }
  return false;
}

// ── Selection & hover visuals ─────────────────────────────────────
// selectedStrokes: strokes currently selected (yellow line + emissive tint)
// _hoverStroke:    stroke under pointer in select mode (blue/green line, no touch)
//
// All highlight lines use depthTest:false so they always show above geometry.
// Hover: blue = will be added to selection; green = will be removed (already selected).

let selectedStrokes=[],selHighlights=[];
var _hoverStroke=null,_hoverHighlight=null;

var _matSelLine  =new THREE.LineBasicMaterial({color:0xf5c842,transparent:true,opacity:.9,depthTest:false,depthWrite:false});
var _matHoverBlue=new THREE.LineBasicMaterial({color:0x3a9eff,transparent:true,opacity:.85,depthTest:false,depthWrite:false});
var _matHoverGreen=new THREE.LineBasicMaterial({color:0x22dd66,transparent:true,opacity:.85,depthTest:false,depthWrite:false});

function _strokeOverlay(s,mat){
  // Clone each mesh in the stroke group with geometry baked into world space.
  // Uses matrixWorld (not matrix) so it works correctly regardless of scene hierarchy.
  // depthTest:false ensures overlay always shows above all other geometry.
  s.mesh.updateMatrixWorld(true);
  var grp=new THREE.Group();
  grp.frustumCulled=false;
  s.mesh.traverse(function(c){
    if(!c.isMesh||!c.geometry)return;
    var geo=c.geometry.clone();
    // Build combined world matrix: group world * child local matrix
    var worldMat=new THREE.Matrix4();
    worldMat.multiplyMatrices(s.mesh.matrixWorld,c.matrix);
    geo.applyMatrix4(worldMat);
    var m=new THREE.Mesh(geo,mat);
    m.renderOrder=9;m.frustumCulled=false;
    grp.add(m);
  });
  return grp;
}

function _disposeObj(obj){
  if(!obj)return;
  obj.traverse(function(c){
    if(c.geometry)c.geometry.dispose();
    // Don't dispose shared materials (_matSelLine etc) — only per-object ones
  });
  scene.remove(obj);
}

// ── Selected highlights ───────────────────────────────────────────
function updateSelHighlights(){
  selHighlights.forEach(_disposeObj);
  selHighlights=[];
  var mat=new THREE.MeshBasicMaterial({color:0xf5c842,transparent:true,opacity:.75,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  selectedStrokes.forEach(function(s){
    var grp=_strokeOverlay(s,mat);
    grp.renderOrder=8;
    scene.add(grp);selHighlights.push(grp);
  });
  // Refresh hover color (blue↔green) after selection changes
  var pending=_hoverStroke;
  _hoverStroke=null;
  _updateHoverLine(pending);
  applySelectionTint();
  markDirty();
}

// ── Hover highlight ───────────────────────────────────────────────
function _updateHoverLine(s){
  _disposeObj(_hoverHighlight);
  _hoverHighlight=null;
  _hoverStroke=s||null;
  if(!s){markDirty();return;}
  var col;
  if(mode==='erase'){
    col=0xff2233; // red — will be erased
  } else {
    var isSelected=selectedStrokes.indexOf(s)>-1;
    col=isSelected?0x22dd66:0x3a9eff; // green = deselect, blue = select
  }
  var mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.82,side:THREE.DoubleSide,depthTest:false,depthWrite:false});
  var grp=_strokeOverlay(s,mat);
  grp.renderOrder=9;
  scene.add(grp);_hoverHighlight=grp;
  markDirty();
}

function setHoverStroke(s){
  var isSel=s&&selectedStrokes.indexOf(s)>-1;
  var isErase=mode==='erase';
  // Skip if same stroke and same color would result
  if(s===_hoverStroke&&_hoverHighlight){
    var curColor=_hoverHighlight.children&&_hoverHighlight.children[0]&&
      _hoverHighlight.children[0].material&&
      _hoverHighlight.children[0].material.color.getHex();
    var wantColor=isErase?0xff2233:(isSel?0x22dd66:0x3a9eff);
    if(curColor===wantColor)return;
  } else if(s===_hoverStroke&&!_hoverHighlight&&!s){
    return;
  }
  _updateHoverLine(s);
}

var _fnsVFrustum=new THREE.Frustum();
var _fnsVProjMat=new THREE.Matrix4();
function findNearestStroke(px,py){
  _refreshRect();
  var r=_cachedRect;
  var sx=px-r.left,sy=py-r.top,W=r.width,H=r.height,ac=activeCam();
  // Build frustum for culling
  ac.updateMatrixWorld(false);
  _fnsVProjMat.multiplyMatrices(ac.projectionMatrix,ac.matrixWorldInverse);
  _fnsVFrustum.setFromProjectionMatrix(_fnsVProjMat);
  var THRESH=32,tmpV=new THREE.Vector3();
  var bestStroke=null,bestDist=THRESH;
  for(var i=strokes.length-1;i>=0;i--){
    var s=strokes[i];
    if(!s.mesh.visible)continue;
    s.mesh.updateMatrixWorld(false);
    var mw=s.mesh.matrixWorld;
    // Quick frustum cull using bounding sphere of stroke points
    if(s.pts.length>4){
      var mid=s.pts[Math.floor(s.pts.length/2)];
      tmpV.copy(mid).applyMatrix4(mw);
      if(!_fnsVFrustum.containsPoint(tmpV)){
        // Check endpoints too before skipping
        tmpV.copy(s.pts[0]).applyMatrix4(mw);
        var ep0In=_fnsVFrustum.containsPoint(tmpV);
        if(!ep0In){
          tmpV.copy(s.pts[s.pts.length-1]).applyMatrix4(mw);
          if(!_fnsVFrustum.containsPoint(tmpV))continue;
        }
      }
    }
    var step=Math.max(1,Math.floor(s.pts.length/60));
    var minDist=Infinity,nearMiss=false;
    for(var j=0;j<s.pts.length;j+=step){
      tmpV.copy(s.pts[j]).applyMatrix4(mw);tmpV.project(ac);
      var d=Math.hypot((tmpV.x*.5+.5)*W-sx,(-tmpV.y*.5+.5)*H-sy);
      if(d<minDist)minDist=d;
      if(d<THRESH){nearMiss=false;break;}
      if(d<THRESH*2)nearMiss=true;
    }
    // Dense pass if coarse pass was close but not inside threshold
    if(nearMiss){
      for(var jj=0;jj<s.pts.length;jj++){
        tmpV.copy(s.pts[jj]).applyMatrix4(mw);tmpV.project(ac);
        var dd=Math.hypot((tmpV.x*.5+.5)*W-sx,(-tmpV.y*.5+.5)*H-sy);
        if(dd<minDist)minDist=dd;
      }
    }
    if(minDist<bestDist){bestDist=minDist;bestStroke=s;}
  }
  return bestStroke;
}

// ── Emissive tint for selected strokes ────────────────────────────
var SEL_EMISSIVE=new THREE.Color(0xf5c842);
var SEL_EMISSIVE_INT=0.35;
function applySelectionTint(){
  strokes.forEach(function(s){
    var isSel=selectedStrokes.indexOf(s)>-1;
    s.mesh.traverse(function(c){
      if(!c.isMesh||!c.material||!c.material.emissive)return;
      c.material.emissive=isSel?SEL_EMISSIVE.clone():new THREE.Color(0x000000);
      c.material.emissiveIntensity=isSel?SEL_EMISSIVE_INT:0;
      c.material.needsUpdate=true;
    });
  });
  markDirty();
}

// ── clearSelection ────────────────────────────────────────────────
function clearSelection(){
  selectedStrokes=[];
  selHighlights.forEach(_disposeObj);selHighlights=[];
  _updateHoverLine(null);
  applySelectionTint();
  _hideSgizmo();
  if(window._sgGcDraw)window._sgGcDraw();
  if(window._syncLoftSolidBtn)window._syncLoftSolidBtn();
  markDirty();
}

// ── selectStroke (on click/tap) ───────────────────────────────────
function selectStroke(px,py,addToSelection){
  if(!addToSelection)clearSelection();
  var bestStroke=findNearestStroke(px,py);
  if(bestStroke){
    var idx=selectedStrokes.indexOf(bestStroke);
    if(idx>-1)selectedStrokes.splice(idx,1);
    else selectedStrokes.push(bestStroke);
    updateSelHighlights();
    if(selectedStrokes.length>0){
      positionStrokeGizmo();
      _showSgizmo();
      if(window._sgGcDraw)window._sgGcDraw();
      if(window._syncLoftSolidBtn)window._syncLoftSolidBtn();
      if(window._syncSgControls)window._syncSgControls();
    } else {
      _hideSgizmo();
    }
    return true;
  }
  if(!addToSelection)_hideSgizmo();
  if(window._syncLoftSolidBtn)window._syncLoftSolidBtn();
  return false;
}
var _sgizmoDragged=false;
function positionStrokeGizmo(){
  const sg=document.getElementById('sgizmo');
  if(!_sgizmoDragged){
    sg.style.left='10px';sg.style.top='52px';sg.style.right='';
  }
  sg.style.maxHeight='calc(100dvh - 120px)';
}
// Show/hide sgizmo — when visible, add gc-hosted class to hide canvas
// (gc canvas renders the gizmo instead), show only property controls
function _showSgizmo(){
  var sg=document.getElementById('sgizmo');
  sg.classList.add('vis');
  sg.classList.add('gc-hosted');
  if(window._updateGhudSel)window._updateGhudSel();
}
function _hideSgizmo(){
  var sg=document.getElementById('sgizmo');
  sg.classList.remove('vis');
  sg.classList.remove('gc-hosted');
  if(window._updateGhudSel)window._updateGhudSel();
}

// ── Sgizmo drag ──
(function(){
  var sg=document.getElementById('sgizmo');
  var handle=document.getElementById('sgizmo-handle');
  if(!sg||!handle)return;
  var dragState=null;
  function onStart(e){
    e.preventDefault();e.stopPropagation();
    var src=e.touches?e.touches[0]:e;
    var r=sg.getBoundingClientRect();
    dragState={ox:src.clientX-r.left,oy:src.clientY-r.top};
  }
  function onMove(e){
    if(!dragState)return;
    e.preventDefault();
    var src=e.touches?e.touches[0]:e;
    var nx=src.clientX-dragState.ox;
    var ny=src.clientY-dragState.oy;
    var sw=sg.offsetWidth,sh=sg.offsetHeight;
    nx=Math.max(0,Math.min(window.innerWidth-sw,nx));
    ny=Math.max(0,Math.min(window.innerHeight-sh,ny));
    sg.style.left=nx+'px';sg.style.top=ny+'px';
    _sgizmoDragged=true;
  }
  function onEnd(){dragState=null;}
  handle.addEventListener('touchstart',onStart,{passive:false});
  handle.addEventListener('touchmove',onMove,{passive:false});
  handle.addEventListener('touchend',onEnd);
  handle.addEventListener('mousedown',onStart);
  document.addEventListener('mousemove',function(e){if(dragState)onMove(e);});
  document.addEventListener('mouseup',onEnd);
})();

// ── Multi-select add mode ─────────────────────────────────────────
// Always-on: every tap appends/toggles selection — no need to press +ADD.
// _selAddMode stays true permanently; clearSelection no longer resets it.
var _selAddMode=true;
function setSelAddMode(on){
  _selAddMode=on;
  var btn=document.getElementById('sg-addmode');
  if(btn)btn.classList.toggle('on',on);
}
function deleteSelected(){
  if(!selectedStrokes.length)return;
  const count=selectedStrokes.length;
  selectedStrokes.slice().forEach(s=>{
    const i=strokes.indexOf(s);
    if(i>-1){pushUndo({type:'stroke_delete',stroke:s,index:i});strokes.splice(i,1);scene.remove(s.mesh);s.mesh.traverse(c=>{if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});}
  });
  clearSelection();toast('Deleted '+count+' stroke'+(count>1?'s':''));
}
function duplicateSelected(){
  if(!selectedStrokes.length)return;
  const duped=[];
  selectedStrokes.forEach(s=>{
    const newG=new THREE.Group();
    const newPts=s.pts.map(p=>p.clone());
    const vels=computeVels(newPts);
    const tube=buildTube(newPts,vels,s.color,s.sz,s.op,s.flat);if(tube)newG.add(tube);
    if(!s.flat){newG.add(buildCap(newPts[0],s.color,s.sz,s.op));newG.add(buildCap(newPts[newPts.length-1],s.color,s.sz,s.op));}
    // Copy the source mesh's transform matrix exactly — duplicate lands on the original
    newG.matrix.copy(s.mesh.matrix);
    newG.matrix.decompose(newG.position,newG.quaternion,newG.scale);
    newG.matrixAutoUpdate=false;
    const ns={pts:newPts,vels,color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer,mesh:newG,_depthKey:''};
    scene.add(newG);strokes.push(ns);
    pushUndo({type:'stroke_duplicate',newStroke:ns});
    duped.push(ns);
  });
  // Re-select the duplicates
  clearSelection();
  selectedStrokes=duped;
  updateSelHighlights();
  if(selectedStrokes.length>0){positionStrokeGizmo();_showSgizmo();}
  if(window._sgGcDraw)window._sgGcDraw();
  if(window._syncSgControls)window._syncSgControls();
  toast('Duplicated');
}

// ── Layer system ─────────────────────────────────────────────────
// activeLayer = which layer new strokes go on (one at a time)
// layerVisible = eye toggle per layer (independent)
// Layer 3 = Merged (special, created by merge operation)
let activeLayer=0;const layerVisible=[true,true,true,true];

function setActiveLayer(i){
  activeLayer=i;
  [0,1,2,3].forEach(j=>{
    const tb=document.getElementById('tb-lrow'+j);if(tb)tb.classList.toggle('active',j===i);
  });
  // Sync narrow layer dot color
  var dotColors=['#b03020',_themeInk(1),'#1a9940','#8b5cf6'];
  var dot=document.getElementById('pb-layer-dot');
  if(dot)dot.style.background=dotColors[i]||_themeInk(1);
}
function setLayerVisible(i,v){
  layerVisible[i]=v;
  const tbeye=document.getElementById('tb-leye'+i);
  if(tbeye){tbeye.textContent=v?'◉':'○';tbeye.classList.toggle('vis',v);}
  applyLayerVisibility();
}
function applyLayerVisibility(){strokes.forEach(s=>{const layer=s.layer!=null?s.layer:1;s.mesh.visible=layerVisible[layer]!==false;});markDirty();}

function showMergeLayerRow(show){
  var row=document.getElementById('tb-lrow3');
  if(row)row.style.display=show?'flex':'none';
}

// ── Merge layer ────────────────────────────────────────────────────
function mergeLayer(srcLayer){
  var toMerge=strokes.filter(function(s){return(s.layer!=null?s.layer:1)===srcLayer;});
  if(!toMerge.length){toast('Nothing on layer');return;}

  // Build merged group with all geometry baked to world space
  var mergedGroup=new THREE.Group();
  toMerge.forEach(function(s){
    s.mesh.traverse(function(c){
      if(!c.isMesh||!c.geometry)return;
      var geo=c.geometry.clone();
      geo.applyMatrix4(s.mesh.matrix);
      var mat=c.material.clone();
      var m=new THREE.Mesh(geo,mat);
      m.renderOrder=3;
      mergedGroup.add(m);
    });
  });
  mergedGroup.matrixAutoUpdate=false;
  mergedGroup.updateMatrix();

  // Remove any existing merged stroke on layer 3
  var replacedMerged=strokes.filter(function(s){return s.layer===3;});
  replacedMerged.forEach(function(s){
    var idx=strokes.indexOf(s);
    if(idx>-1){strokes.splice(idx,1);}
    scene.remove(s.mesh);
  });

  // Remove originals
  var savedOrigIndices=[];
  toMerge.forEach(function(s){
    var idx=strokes.indexOf(s);
    if(idx>-1)savedOrigIndices.push(idx);
    scene.remove(s.mesh);
  });
  savedOrigIndices.sort(function(a,b){return b-a;}).forEach(function(i){strokes.splice(i,1);});

  scene.add(mergedGroup);
  var mergeColor=toMerge[0]?toMerge[0].color:'#1a1a2e';
  var mergedStroke={pts:[new THREE.Vector3()],vels:[0],color:mergeColor,sz:1,op:1,flat:false,layer:3,mesh:mergedGroup,_depthKey:''};
  strokes.push(mergedStroke);

  _undoStack.push({type:'merge_layer',srcLayer:srcLayer,origStrokes:toMerge,savedOrigIndices:savedOrigIndices,mergedStroke:mergedStroke,replacedMerged:replacedMerged});
  _redoStack.length=0;redoStack.length=0;

  showMergeLayerRow(true);
  applyLayerVisibility();
  markDirty();
  toast('Merged to layer 3');
}

[0,1,2,3].forEach(i=>{
  // Topbar layers popover — row click = set active layer
  const tblb=document.getElementById('tb-lrow'+i);
  if(tblb)tblb.addEventListener('click',function(e){
    if(e.target===document.getElementById('tb-leye'+i))return;
    if(e.target===document.getElementById('tb-merge'+i))return;
    setActiveLayer(i);
  });
  const tbeye=document.getElementById('tb-leye'+i);
  if(tbeye)tbeye.addEventListener('click',function(e){e.stopPropagation();setLayerVisible(i,!layerVisible[i]);});
  // Merge buttons (layers 0-2 only)
  const tbmerge=document.getElementById('tb-merge'+i);
  if(tbmerge)tbmerge.addEventListener('click',function(e){e.stopPropagation();mergeLayer(i);});
});

// Topbar LAYERS button — open/close popover below button
(function(){
  var btn=document.getElementById('blayers');
  var pop=document.getElementById('layers-pop');
  if(!btn||!pop)return;
  function openLayersPop(trigger){
    pop.classList.add('open');
    btn.classList.add('on');
    var br=trigger.getBoundingClientRect();
    pop.style.top=(br.bottom+6)+'px';
    pop.style.left=Math.max(4,Math.min(br.left,window.innerWidth-pop.offsetWidth-4))+'px';
  }
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    if(pop.classList.contains('open')){pop.classList.remove('open');btn.classList.remove('on');}
    else{openLayersPop(btn);}
  });
  // Narrow layer dot — also opens layers popover
  var dot=document.getElementById('pb-layer-dot');
  if(dot)dot.addEventListener('click',function(e){
    e.stopPropagation();
    if(pop.classList.contains('open')){pop.classList.remove('open');btn.classList.remove('on');}
    else{openLayersPop(dot);}
  });
  document.addEventListener('click',function(e){
    if(!pop.contains(e.target)&&e.target!==btn&&e.target!==dot){
      pop.classList.remove('open');
      btn.classList.remove('on');
    }
  });
})();

// ── Toast ─────────────────────────────────────────────────────────
