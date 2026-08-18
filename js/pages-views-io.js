// ============================================================
// pages-views-io.js
// Pages, saved views, PNG/JSON export, save & load, IndexedDB autosave
// ============================================================
const pages=[];let curPage=0;
function snapThumb(){renderer.render(scene,activeCam());return renderer.domElement.toDataURL('image/jpeg',.35);}
function saveCurPage(){
  var existingViews=pages[curPage]&&pages[curPage].views||[];
  pages[curPage]={strokes:strokes.map(s=>({pts:s.pts.map(p=>({x:p.x,y:p.y,z:p.z})),color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer!=null?s.layer:1,mx:s.mesh.matrix.elements.slice()})),thumb:snapThumb(),views:existingViews,primitives:window._savePrimitivesForPage?window._savePrimitivesForPage():[]};
  refreshPageStrip();
}
function loadPage(idx){saveCurPage();clearAll();if(window._clearAllPrimitives)window._clearAllPrimitives();curPage=idx;const pg=pages[idx];if(pg&&pg.strokes)loadData({strokes:pg.strokes,primitives:pg.primitives});refreshPageStrip();refreshViewStrip();}
function addPage(){saveCurPage();clearAll();if(window._clearAllPrimitives)window._clearAllPrimitives();pages.push({strokes:[],thumb:null,primitives:[]});curPage=pages.length-1;refreshPageStrip();toast('Page '+(curPage+1));}
function deletePage(idx){
  if(pages.length<=1){toast('Need at least 1 page');return;}
  if(idx===curPage)saveCurPage();
  pages.splice(idx,1);
  if(curPage>=pages.length)curPage=pages.length-1;
  clearAll();
  if(window._clearAllPrimitives)window._clearAllPrimitives();
  const pg=pages[curPage];if(pg&&pg.strokes)loadData({strokes:pg.strokes,primitives:pg.primitives});
  refreshPageStrip();
  toast('Page deleted');
}
// Pages edit mode — off by default, long-press thumbnail to toggle
var _pgEditMode=false;
var _pgEditIdx=-1; // which thumb is selected for reorder (-1=none)
function setPgEditMode(on){
  _pgEditMode=on;
  _pgEditIdx=-1;
  refreshPageStrip();
  if(on)toast('Tap to reorder · tap away to exit');
}
function movePage(from,to){
  if(to<0||to>=pages.length)return;
  var pg=pages.splice(from,1)[0];
  pages.splice(to,0,pg);
  if(curPage===from)curPage=to;
  else if(from<curPage&&to>=curPage)curPage--;
  else if(from>curPage&&to<=curPage)curPage++;
  _pgEditIdx=to;
  refreshPageStrip();
}

function refreshPageStrip(){
  var strip=document.getElementById('pages');
  strip.querySelectorAll('.pg-thumb').forEach(function(x){x.remove();});
  var addBtn=document.getElementById('pg-add');
  pages.forEach(function(pg,i){
    var d=document.createElement('div');
    d.className='pg-thumb'+(i===curPage?' on':'');
    if(_pgEditMode&&_pgEditIdx===i)d.className+=' editing';
    if(pg.thumb){var img=new Image();img.src=pg.thumb;d.appendChild(img);}
    var num=document.createElement('span');num.className='pg-num';num.textContent=i+1;d.appendChild(num);
    if(_pgEditMode&&pages.length>1){
      // In edit mode: show delete badge always; if this thumb is selected, show reorder arrows
      var del=document.createElement('button');
      del.textContent='×';
      del.style.cssText='position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:4px;border:none;background:rgba(176,48,32,.85);color:#fff;font-size:10px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:10';
      (function(idx){del.addEventListener('click',function(e){e.stopPropagation();deletePage(idx);});})(i);
      d.appendChild(del);
      if(_pgEditIdx===i){
        if(i>0){
          var al=document.createElement('button');al.className='reorder-arrow arr-l';al.textContent='◀';
          (function(idx){al.addEventListener('click',function(e){e.stopPropagation();movePage(idx,idx-1);});})(i);
          d.appendChild(al);
        }
        if(i<pages.length-1){
          var ar=document.createElement('button');ar.className='reorder-arrow arr-r';ar.textContent='▶';
          (function(idx){ar.addEventListener('click',function(e){e.stopPropagation();movePage(idx,idx+1);});})(i);
          d.appendChild(ar);
        }
      }
      // Tap on thumb in edit mode selects it for reorder
      (function(idx){d.addEventListener('click',function(e){
        e.stopPropagation();
        _pgEditIdx=(_pgEditIdx===idx)?-1:idx;
        refreshPageStrip();
      });})(i);
    } else {
      d.addEventListener('click',function(){loadPage(i);});
    }
    strip.insertBefore(d,addBtn);
  });
}
pages.push({strokes:[],thumb:null,primitives:[]});refreshPageStrip();

// Long-press any thumbnail to toggle delete mode; tap empty area to exit
(function(){
  var strip=document.getElementById('pages');
  var _lpt=null;
  function startLong(){
    _lpt=setTimeout(function(){_lpt=null;setPgEditMode(!_pgEditMode);},500);
  }
  function cancelLong(){if(_lpt){clearTimeout(_lpt);_lpt=null;}}
  strip.addEventListener('touchstart',function(e){
    var el=e.touches[0],target=document.elementFromPoint(el.clientX,el.clientY);
    while(target&&target!==strip){if(target.classList.contains('pg-thumb')){startLong();return;}target=target.parentElement;}
    // Tapped empty area of strip — exit edit mode
    if(_pgEditMode){setPgEditMode(false);}
  },{passive:true});
  strip.addEventListener('touchend',cancelLong);
  strip.addEventListener('touchcancel',cancelLong);
  strip.addEventListener('touchmove',cancelLong,{passive:true});
  strip.addEventListener('mousedown',function(e){
    var el=e.target;
    while(el&&el!==strip){if(el.classList.contains('pg-thumb')){startLong();return;}el=el.parentElement;}
    // Clicked empty area — exit edit mode
    if(_pgEditMode){setPgEditMode(false);}
  });
  strip.addEventListener('mouseup',cancelLong);
  strip.addEventListener('mouseleave',cancelLong);
}());
function togglePages(){
  var pb=document.getElementById('narrow-bar');
  if(pb&&pb.classList.contains('active')){
    var h=pb.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--pb-h',h+'px');
  }
  var open=document.getElementById('pages').classList.toggle('open');
  document.body.classList.toggle('pages-open',open);
  document.getElementById('pgbtn').classList.toggle('on',open);
  var pbBtn=document.getElementById('pb-pgbtn');if(pbBtn)pbBtn.classList.toggle('on',open);
  if(open)refreshPageStrip();
  var vs=document.getElementById('views');
  if(vs.classList.contains('open')){
    if(open){vs.classList.add('pages-also-open');}
    else{vs.classList.remove('pages-also-open');}
  }
  setTimeout(positionLclFloat,50);
}
document.getElementById('pgbtn').addEventListener('click',togglePages);
document.getElementById('pb-pgbtn').addEventListener('click',togglePages);
document.getElementById('pg-add').addEventListener('click',addPage);

// ── Saved Views ───────────────────────────────────────────────────
// Each page has a views[] array: [{cam, surf, thumb}, ...]
// Views are per-page, saved in JSON inside pages[]

function snapViewThumb(){renderer.render(scene,activeCam());return renderer.domElement.toDataURL('image/jpeg',.35);}

function saveView(){
  if(!pages[curPage])return;
  if(!pages[curPage].views)pages[curPage].views=[];
  var v={
    cam:{theta:cam.theta,phi:cam.phi,radius:cam.radius,tx:cam.target.x,ty:cam.target.y,tz:cam.target.z,ortho:useOrtho,orthoZoom:orthoZoom},
    surf:{type:surfType,plane:curPlane,px:surfPos.x,py:surfPos.y,pz:surfPos.z,rx:surfEuler.x,ry:surfEuler.y,rz:surfEuler.z,sc:surfScale,sax:surfScaleAxes.x,say:surfScaleAxes.y,saz:surfScaleAxes.z},
    thumb:snapViewThumb()
  };
  pages[curPage].views.push(v);
  refreshViewStrip();
  toast('View saved');
}

function deleteView(idx){
  if(!pages[curPage]||!pages[curPage].views)return;
  pages[curPage].views.splice(idx,1);
  refreshViewStrip();
}

// Smooth lerp to saved view — duration scales with distance (1s–3s)
var _vwLerp=null;
function recallView(v){
  // Restore plane instantly
  if(v.surf){
    surfType=v.surf.type||surfType;curPlane=v.surf.plane||curPlane;
    surfPos.set(v.surf.px||0,v.surf.py||0,v.surf.pz||0);
    surfEuler.set(v.surf.rx||0,v.surf.ry||0,v.surf.rz||0);
    surfScale=v.surf.sc||1;surfScaleAxes.set(v.surf.sax||1,v.surf.say||1,v.surf.saz||1);
    buildSurf();syncSurf();
    document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.toggle('on',b.dataset.surf===surfType);});
    document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===curPlane);});
  }
  // Smooth lerp camera
  var c=v.cam;
  var startTheta=cam.theta,startPhi=cam.phi,startRadius=cam.radius;
  var startTx=cam.target.x,startTy=cam.target.y,startTz=cam.target.z;
  var endTheta=c.theta,endPhi=c.phi,endRadius=c.radius;
  var endTx=c.tx||0,endTy=c.ty||0,endTz=c.tz||0;
  // Scale duration by how far the camera needs to travel (1s–3s)
  var dTheta=Math.abs(endTheta-startTheta),dPhi=Math.abs(endPhi-startPhi);
  var dTarget=Math.sqrt(Math.pow(endTx-startTx,2)+Math.pow(endTy-startTy,2)+Math.pow(endTz-startTz,2));
  var dRadius=Math.abs(endRadius-startRadius);
  var angularDist=Math.sqrt(dTheta*dTheta+dPhi*dPhi); // radians
  var totalDist=angularDist/Math.PI+dTarget/5+dRadius/10; // normalised 0..1+
  var dur=Math.min(3000,Math.max(1000,totalDist*2500));

  // ── Smooth ortho/persp transition ──
  // Instead of snapping useOrtho at the end, lerp orthoZoom to/from a value
  // that matches the perspective frustum, so the visual transition is gradual.
  var targetOrtho=c.ortho||false;
  var targetOrthoZoom=c.orthoZoom||8;
  var startOrthoZoom=orthoZoom;
  var needsOrthoTransition=targetOrtho!==useOrtho;
  var CAM_FOV_HALF_TAN=Math.tan(27.5*Math.PI/180); // half of 55° FOV

  if(needsOrthoTransition){
    if(targetOrtho){
      // Persp → Ortho: switch to ortho immediately with zoom matching perspective
      useOrtho=true;
      startOrthoZoom=startRadius*CAM_FOV_HALF_TAN;
      orthoZoom=startOrthoZoom;
      syncOrtho();
    } else {
      // Ortho → Persp: keep ortho during animation, lerp zoom toward perspective-matching
      // value, then flip at the very end
      startOrthoZoom=orthoZoom;
      targetOrthoZoom=endRadius*CAM_FOV_HALF_TAN;
    }
  } else if(useOrtho){
    // Both ortho — just lerp zoom directly
    startOrthoZoom=orthoZoom;
  }

  if(_vwLerp)cancelAnimationFrame(_vwLerp);
  if(_orthoLerp){cancelAnimationFrame(_orthoLerp);_orthoLerp=null;}
  var startT=performance.now();
  function step(){
    var t=Math.min(1,(performance.now()-startT)/dur);
    var e=t<1?t*(2-t):1; // ease out quad
    cam.theta=startTheta+(endTheta-startTheta)*e;
    cam.phi=startPhi+(endPhi-startPhi)*e;
    cam.radius=startRadius+(endRadius-startRadius)*e;
    cam.target.x=startTx+(endTx-startTx)*e;
    cam.target.y=startTy+(endTy-startTy)*e;
    cam.target.z=startTz+(endTz-startTz)*e;
    // Lerp orthoZoom during transition
    if(needsOrthoTransition&&!targetOrtho&&useOrtho&&e>=0.85){
      // Ortho→Persp: flip to persp slightly before end so remaining motion masks the switch
      useOrtho=false;
    }
    if(useOrtho){
      orthoZoom=startOrthoZoom+(targetOrthoZoom-startOrthoZoom)*e;
      syncOrtho();
    }
    updCam();markDirty();
    if(t<1){_vwLerp=requestAnimationFrame(step);}
    else{
      _vwLerp=null;
      // Finalize ortho state
      if(needsOrthoTransition&&!targetOrtho){
        // Ortho→Persp: now flip to persp
        useOrtho=false;
      }
      orthoZoom=targetOrtho?(c.orthoZoom||8):orthoZoom;
      syncOrtho();updCam();
      var txt=useOrtho?'ORTHO':'PERSP';
      ['bpersp','nav-persp','pb-nav-persp'].forEach(function(id){
        var b=document.getElementById(id);
        if(b){b.textContent=txt;b.classList.toggle('on',useOrtho);}
      });
      markDirty();
    }
  }
  step();
}

// Views edit mode — off by default, long-press thumbnail to toggle
var _vwEditMode=false;
var _vwEditIdx=-1; // which view thumb is selected for reorder
function setVwEditMode(on){
  _vwEditMode=on;
  _vwEditIdx=-1;
  refreshViewStrip();
  if(on)toast('Tap to reorder · tap away to exit');
}
function moveView(from,to){
  var views=pages[curPage]&&pages[curPage].views;
  if(!views||to<0||to>=views.length)return;
  var v=views.splice(from,1)[0];
  views.splice(to,0,v);
  _vwEditIdx=to;
  refreshViewStrip();
}

function refreshViewStrip(){
  var strip=document.getElementById('views');
  strip.querySelectorAll('.vw-thumb').forEach(function(x){x.remove();});
  var addBtn=document.getElementById('vw-add');
  var views=pages[curPage]&&pages[curPage].views||[];
  views.forEach(function(v,i){
    var d=document.createElement('div');
    d.className='vw-thumb';
    if(_vwEditMode&&_vwEditIdx===i)d.className+=' editing';
    if(v.thumb){var img=new Image();img.src=v.thumb;d.appendChild(img);}
    var num=document.createElement('span');num.className='vw-num';num.textContent=i+1;d.appendChild(num);
    if(_vwEditMode){
      var del=document.createElement('button');
      del.textContent='×';
      del.style.cssText='position:absolute;top:2px;right:2px;width:18px;height:18px;border-radius:4px;border:none;background:rgba(176,48,32,.85);color:#fff;font-size:10px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;z-index:10';
      (function(idx){del.addEventListener('click',function(e){e.stopPropagation();deleteView(idx);});})(i);
      d.appendChild(del);
      if(_vwEditIdx===i){
        if(i>0){
          var al=document.createElement('button');al.className='reorder-arrow arr-l';al.textContent='◀';
          (function(idx){al.addEventListener('click',function(e){e.stopPropagation();moveView(idx,idx-1);});})(i);
          d.appendChild(al);
        }
        if(i<views.length-1){
          var ar=document.createElement('button');ar.className='reorder-arrow arr-r';ar.textContent='▶';
          (function(idx){ar.addEventListener('click',function(e){e.stopPropagation();moveView(idx,idx+1);});})(i);
          d.appendChild(ar);
        }
      }
      (function(idx){d.addEventListener('click',function(e){
        e.stopPropagation();
        _vwEditIdx=(_vwEditIdx===idx)?-1:idx;
        refreshViewStrip();
      });})(i);
    } else {
      d.addEventListener('click',function(){recallView(v);});
    }
    strip.insertBefore(d,addBtn);
  });
}

// Long-press any thumbnail to toggle delete mode; tap empty area to exit
(function(){
  var strip=document.getElementById('views');
  var _lpt=null;
  function startLong(){
    _lpt=setTimeout(function(){_lpt=null;setVwEditMode(!_vwEditMode);},500);
  }
  function cancelLong(){if(_lpt){clearTimeout(_lpt);_lpt=null;}}
  strip.addEventListener('touchstart',function(e){
    var el=e.touches[0],target=document.elementFromPoint(el.clientX,el.clientY);
    while(target&&target!==strip){if(target.classList.contains('vw-thumb')){startLong();return;}target=target.parentElement;}
    if(_vwEditMode){setVwEditMode(false);}
  },{passive:true});
  strip.addEventListener('touchend',cancelLong);
  strip.addEventListener('touchcancel',cancelLong);
  strip.addEventListener('touchmove',cancelLong,{passive:true});
  strip.addEventListener('mousedown',function(e){
    var el=e.target;
    while(el&&el!==strip){if(el.classList.contains('vw-thumb')){startLong();return;}el=el.parentElement;}
    if(_vwEditMode){setVwEditMode(false);}
  });
  strip.addEventListener('mouseup',cancelLong);
  strip.addEventListener('mouseleave',cancelLong);
}());

function toggleViews(){
  var viewsStrip=document.getElementById('views');
  var pagesStrip=document.getElementById('pages');
  var isHidden=document.body.classList.contains('ui-hidden');
  var open;
  if(isHidden){
    // In screen-recording mode: use recording-open class, always bottom:0
    open=viewsStrip.classList.toggle('recording-open');
    viewsStrip.classList.toggle('open',open);
  } else {
    open=viewsStrip.classList.toggle('open');
    viewsStrip.classList.remove('recording-open');
  }
  document.body.classList.toggle('views-open',open);
  document.getElementById('vwbtn').classList.toggle('on',open);
  var pbBtn=document.getElementById('pb-vwbtn');if(pbBtn)pbBtn.classList.toggle('on',open);
  var hvBtn=document.getElementById('bviews-hidden');if(hvBtn)hvBtn.classList.toggle('on',open);
  if(open){
    refreshViewStrip();
    if(!isHidden&&pagesStrip.classList.contains('open')){viewsStrip.classList.add('pages-also-open');}
    else{viewsStrip.classList.remove('pages-also-open');}
  }
  setTimeout(positionLclFloat,50);
}
document.getElementById('vwbtn').addEventListener('click',toggleViews);
document.getElementById('pb-vwbtn').addEventListener('click',toggleViews);
document.getElementById('bviews-hidden').addEventListener('click',toggleViews);
document.getElementById('vw-add').addEventListener('click',saveView);

// Narrow bar hide tab
document.getElementById('pb-tab').addEventListener('click',function(){
  var pb=document.getElementById('narrow-bar');
  var collapsed=pb.classList.toggle('pb-collapsed');
  // After toggle, re-measure and update --pb-h so pages strip / pgbtn stay above bar
  setTimeout(function(){
    var h=pb.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--pb-h',h+'px');
  },50);
  toast(collapsed?'Panel hidden':'Panel shown',900);
});

// ── Export filename prompt ──────────────────────────────────────
// Generic prompt for export filename — reuses its own modal (#export-name-modal).
// ext includes the dot, e.g. '.glb'. callback receives (name) with no ext.
function promptExportName(defaultName, ext, callback){
  var enmod=document.getElementById('export-name-modal');
  var inp=document.getElementById('export-name-input');
  var extSpan=document.getElementById('export-name-ext');
  inp.value=defaultName||'drwthred';
  extSpan.textContent=ext;
  enmod._expCallback=callback;
  enmod._expExt=ext;
  enmod.classList.add('vis');
  inp.focus();inp.select();
}

// ── PNG export ────────────────────────────────────────────────────
function expPNG(){var _sg=gridH.visible,_sa=axisGroup.visible,_ss=surfGroup.visible;gridH.visible=false;axisGroup.visible=false;surfGroup.visible=false;renderer.render(scene,activeCam());const url=renderer.domElement.toDataURL('image/png');const a=document.createElement('a');a.href=url;a.download='drwthred.png';a.click();gridH.visible=_sg;axisGroup.visible=_sa;surfGroup.visible=_ss;markDirty();toast('PNG saved');}

function expSVG(expName){
  if(!strokes.length){alert('Nothing to export.');return;}
  _refreshRect();
  var r=_cachedRect;
  var W=r.width,H=r.height,ac=activeCam();
  ac.updateMatrixWorld(false);
  var tmpV=new THREE.Vector3();
  var paths=[];
  for(var i=0;i<strokes.length;i++){
    var s=strokes[i];
    if(!s.mesh.visible)continue;
    if(s.pts.length<2)continue;
    s.mesh.updateMatrixWorld(false);
    var mw=s.mesh.matrixWorld;
    // Project all points to screen space
    var proj=[];
    for(var j=0;j<s.pts.length;j++){
      tmpV.copy(s.pts[j]).applyMatrix4(mw);tmpV.project(ac);
      // Skip points behind camera
      if(tmpV.z>1)continue;
      proj.push({x:(tmpV.x*.5+.5)*W,y:(-tmpV.y*.5+.5)*H});
    }
    if(proj.length<2)continue;
    // Build SVG path data
    var d='M'+proj[0].x.toFixed(2)+' '+proj[0].y.toFixed(2);
    for(var k=1;k<proj.length;k++){
      d+=' L'+proj[k].x.toFixed(2)+' '+proj[k].y.toFixed(2);
    }
    // Stroke width: map brush size to screen pixels (approximate)
    // s.sz=1 → baseR=0.011 in world units; project a small offset to estimate pixel width
    var midIdx=Math.floor(s.pts.length/2);
    var p0=tmpV.copy(s.pts[midIdx]).applyMatrix4(mw);
    var sx0=new THREE.Vector3().copy(p0).project(ac);
    var baseR=s.sz*0.011;
    var p1=new THREE.Vector3(p0.x+baseR,p0.y,p0.z);
    var sx1=p1.project(ac);
    var sw=Math.abs((sx1.x-sx0.x)*0.5*W)*2;
    if(sw<0.5)sw=0.5;
    if(sw>50)sw=50;
    // Opacity
    var op=s.op!==undefined?s.op:1;
    paths.push('<path d="'+d+'" fill="none" stroke="'+s.color+'" stroke-width="'+sw.toFixed(2)+'" stroke-linecap="round" stroke-linejoin="round" stroke-opacity="'+op.toFixed(2)+'"/>');
  }
  if(!paths.length){alert('No visible strokes to export.');return;}
  var svg='<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">\n<rect width="100%" height="100%" fill="none"/>\n'+paths.join('\n')+'\n</svg>';
  var blob=new Blob([svg],{type:'image/svg+xml'});
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a');a.href=url;a.download=(expName||'drwthred')+'.svg';a.click();
  URL.revokeObjectURL(url);toast('SVG exported');
}

// ── Save / Load / Export ──────────────────────────────────────────
function sceneData(){
  const allPages=pages.map(function(pg,i){
    var pgViews=pg.views||[];
    if(i===curPage){
      return{strokes:strokes.map(s=>({pts:s.pts.map(p=>({x:p.x,y:p.y,z:p.z})),color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer!=null?s.layer:1,mx:s.mesh.matrix.elements.slice()})),views:pgViews,primitives:window._serializePrimitives?window._serializePrimitives():[]};
    }
    return{strokes:(pg.strokes||[]),views:pgViews,primitives:pg.primitives||[]};
  });
  return{version:4.4,curPage:curPage,pages:allPages,strokes:strokes.map(s=>({pts:s.pts.map(p=>({x:p.x,y:p.y,z:p.z})),color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer!=null?s.layer:1,mx:s.mesh.matrix.elements.slice()})),primitives:window._serializePrimitives?window._serializePrimitives():[],surf:{type:(surfType==='loft'||surfType==='none')?'plane':surfType,plane:curPlane,px:surfPos.x,py:surfPos.y,pz:surfPos.z,rx:surfEuler.x,ry:surfEuler.y,rz:surfEuler.z,sc:surfScale,sax:surfScaleAxes.x,say:surfScaleAxes.y,saz:surfScaleAxes.z}};
}
function loadData(data){
  clearAll();
  if(data.surf){surfType=data.surf.type||'plane';curPlane=data.surf.plane||'xz';surfPos.set(data.surf.px||0,data.surf.py||0,data.surf.pz||0);surfEuler.set(data.surf.rx||0,data.surf.ry||0,data.surf.rz||0);surfScale=data.surf.sc||1;surfScaleAxes.set(data.surf.sax||1,data.surf.say||1,data.surf.saz||1);buildSurf();document.querySelectorAll('[data-surf]').forEach(b=>b.classList.toggle('on',b.dataset.surf===surfType));document.querySelectorAll('[data-plane]').forEach(b=>b.classList.toggle('on',b.dataset.plane===curPlane));var _pl={'xz':'Front','xy':'Top','yz':'Side'};['pb-cyc-plane','pb-cyc-plane2','sb-cyc-plane'].forEach(function(id){var b=document.getElementById(id);if(b)b.textContent=_pl[curPlane]||curPlane;});}
  if(data.strokes){
    data.strokes.forEach(s=>{
      const pts=s.pts.map(p=>new THREE.Vector3(p.x,p.y,p.z)),vels=computeVels(pts),g=new THREE.Group();
      const tube=buildTube(pts,vels,s.color,s.sz,s.op,s.flat||false);if(tube)g.add(tube);
      if(!(s.flat||false)){g.add(buildCap(pts[0],s.color,s.sz,s.op));g.add(buildCap(pts[pts.length-1],s.color,s.sz,s.op));}
      if(s.mx){g.matrix.fromArray(s.mx);g.matrix.decompose(g.position,g.quaternion,g.scale);g.matrixAutoUpdate=false;}
      scene.add(g);
      strokes.push({pts,vels,color:s.color,sz:s.sz,op:s.op,flat:s.flat||false,layer:s.layer!=null?s.layer:1,mesh:g,_depthKey:''});
    });
  }
  applyLayerVisibility();
  // Show merge layer row if any strokes are on layer 3
  showMergeLayerRow(strokes.some(function(s){return s.layer===3;}));
  // Load primitives
  if(data.primitives && window._deserializePrimitives) window._deserializePrimitives(data.primitives);
}
function loadAllPages(data){
  if(data.pages&&data.pages.length){
    pages.length=0;
    data.pages.forEach(function(pg){pages.push({strokes:pg.strokes||[],thumb:null,views:pg.views||[],primitives:pg.primitives||[]});});
    curPage=Math.min(data.curPage||0,pages.length-1);
    clearAll();
    if(window._clearAllPrimitives)window._clearAllPrimitives();
    const pg=pages[curPage];if(pg&&pg.strokes)loadData(Object.assign({},data,{strokes:pg.strokes,primitives:pg.primitives}));
    refreshPageStrip();
    refreshViewStrip();
  } else {
    loadData(data);
    pages[0]={strokes:strokes.map(s=>({pts:s.pts.map(p=>({x:p.x,y:p.y,z:p.z})),color:s.color,sz:s.sz,op:s.op,flat:s.flat,layer:s.layer!=null?s.layer:1,mx:s.mesh.matrix.elements.slice()})),thumb:null,views:[],primitives:window._savePrimitivesForPage?window._savePrimitivesForPage():[]};
    refreshPageStrip();
    refreshViewStrip();
  }
}
function _doSaveFile(name){renderer.render(scene,activeCam());var src=renderer.domElement;var tmp=document.createElement('canvas');tmp.width=120;tmp.height=84;var tc=tmp.getContext('2d');tc.drawImage(src,0,0,120,84);var thumb=tmp.toDataURL('image/jpeg',0.5);var data=sceneData();data.thumb=thumb;var b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});var u=URL.createObjectURL(b);var a=document.createElement('a');a.href=u;a.download=(name||'drwthred')+'.json';a.click();URL.revokeObjectURL(u);toast('Saved');}
function saveFileWithName(defaultName,onComplete){var snmod=document.getElementById('save-name-modal');var inp=document.getElementById('save-name-input');inp.value=defaultName||'drwthred';snmod._onComplete=onComplete||null;snmod.classList.add('vis');inp.focus();inp.select();}
function saveFile(){saveFileWithName('drwthred',null);}
function loadFile(){document.getElementById('filein').click();}
document.getElementById('filein').addEventListener('change',function(){const f=this.files[0];if(!f)return;const r=new FileReader();r.onload=function(ev){try{loadAllPages(JSON.parse(ev.target.result));toast('Loaded');}catch(e){alert('Invalid file.');}};r.readAsText(f);this.value='';});
// ── IndexedDB auto-save (replaces localStorage) ────────────────────
// Same 30s interval, same JSON format, much higher quota
// Falls back to localStorage if IndexedDB unavailable
var _idb=null;
var _idbReadyCallbacks=[];
function _onIdbReady(cb){if(_idb){cb(_idb);}else{_idbReadyCallbacks.push(cb);}}
(function(){
  try{
    var req=indexedDB.open('sketch3d',1);
    req.onupgradeneeded=function(e){
      var db=e.target.result;
      if(!db.objectStoreNames.contains('autosave'))db.createObjectStore('autosave');
    };
    req.onsuccess=function(e){
      _idb=e.target.result;
      // One-time migration from localStorage
      try{
        var old=localStorage.getItem('sk3d_auto');
        if(old){
          var tx=_idb.transaction('autosave','readwrite');
          tx.objectStore('autosave').put(old,'sk3d_auto');
          localStorage.removeItem('sk3d_auto');
        }
      }catch(e2){}
      // Fire all waiting callbacks
      var cbs=_idbReadyCallbacks.splice(0);
      for(var i=0;i<cbs.length;i++){try{cbs[i](_idb);}catch(e3){}}
    };
    req.onerror=function(){_idb=null;};
  }catch(e){_idb=null;}
})();

function idbSave(dataStr){
  if(_idb){
    try{
      var tx=_idb.transaction('autosave','readwrite');
      tx.objectStore('autosave').put(dataStr,'sk3d_auto');
      return;
    }catch(e){}
  }
  try{localStorage.setItem('sk3d_auto',dataStr);}catch(e){}
}

function idbLoad(cb){
  if(_idb){
    try{
      var tx=_idb.transaction('autosave','readonly');
      var req=tx.objectStore('autosave').get('sk3d_auto');
      req.onsuccess=function(e){cb(e.target.result||null);};
      req.onerror=function(){cb(null);};
      return;
    }catch(e){}
  }
  // Fallback to localStorage
  try{cb(localStorage.getItem('sk3d_auto'));}catch(e){cb(null);}
}

var _sceneDirtyForSave=false;
var _origMarkDirty=markDirty;
markDirty=function(){_sceneDirtyForSave=true;_origMarkDirty();};
setInterval(function(){if(!_sceneDirtyForSave)return;_sceneDirtyForSave=false;try{idbSave(JSON.stringify(sceneData()));}catch(e){}},30000);

// Save on tab/PWA visibility changes and page unload — Android aggressively
// backgrounds and reclaims PWAs; without these handlers, up to 30 seconds of
// work was lost between autosave ticks when the user swiped away.
(function(){
  var _lastSaveAt=0;
  function _flushSave(){
    try{
      // Rate-limit to once per 500ms so rapid visibility thrashes don't thrash IDB
      var now=Date.now();if(now-_lastSaveAt<500)return;
      _lastSaveAt=now;
      var str=JSON.stringify(sceneData());
      // Synchronous localStorage write is our safety net — IDB writes are async
      // and may not flush before the page is killed. localStorage always flushes.
      try{localStorage.setItem('sk3d_auto',str);}catch(e){}
      // Best-effort IDB write
      try{idbSave(str);}catch(e){}
    }catch(e){}
  }
  // visibilitychange fires when tab is hidden — Android PWA triggers this reliably
  document.addEventListener('visibilitychange',function(){
    if(document.visibilityState==='hidden')_flushSave();
  });
  // pagehide is the modern, reliable unload trigger — fires on iOS Safari too
  window.addEventListener('pagehide',_flushSave);
  // beforeunload for desktop browsers and legacy fallback
  window.addEventListener('beforeunload',_flushSave);
  // Expose for manual triggers (e.g. after destructive actions)
  window._flushAutosave=_flushSave;
})();

function expGLTF(expName){
  const meshes=[];
  const sc=exportScaleMult();
  strokes.forEach(s=>{if(s.pts.length<2)return;try{
    const wpts=s.pts.map(p=>p.clone().applyMatrix4(s.mesh.matrix).multiplyScalar(sc));
    const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts),Math.max(wpts.length*3,8),s.sz*.011*sc,6,false);
    const c=new THREE.Color(s.color);meshes.push({geo,col:[c.r,c.g,c.b],op:s.op});}catch(e){}});
  if(!meshes.length){alert('Nothing to export.');return;}
  const bvs=[],accs=[],mds=[],mts=[],cks=[];let bo=0;
  meshes.forEach((m,mi)=>{const pos=m.geo.attributes.position,idx=m.geo.index;const pb=new Float32Array(pos.array),ib=idx?new Uint32Array(idx.array):null;bvs.push({buffer:0,byteOffset:bo,byteLength:pb.byteLength,target:34962});let mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(let i=0;i<pos.array.length;i+=3){mn[0]=Math.min(mn[0],pos.array[i]);mn[1]=Math.min(mn[1],pos.array[i+1]);mn[2]=Math.min(mn[2],pos.array[i+2]);mx[0]=Math.max(mx[0],pos.array[i]);mx[1]=Math.max(mx[1],pos.array[i+1]);mx[2]=Math.max(mx[2],pos.array[i+2]);}accs.push({bufferView:bvs.length-1,componentType:5126,count:pos.count,type:'VEC3',min:mn,max:mx});cks.push(new Uint8Array(pb.buffer));bo+=pb.byteLength;let pr={attributes:{POSITION:accs.length-1},mode:4};if(ib){bvs.push({buffer:0,byteOffset:bo,byteLength:ib.byteLength,target:34963});accs.push({bufferView:bvs.length-1,componentType:5125,count:idx.count,type:'SCALAR'});pr.indices=accs.length-1;cks.push(new Uint8Array(ib.buffer));bo+=ib.byteLength;}pr.material=mi;mds.push({primitives:[pr]});mts.push({pbrMetallicRoughness:{baseColorFactor:[m.col[0],m.col[1],m.col[2],m.op],metallicFactor:.04,roughnessFactor:.55},alphaMode:m.op<1?'BLEND':'OPAQUE'});});
  const nodes=mds.map((_,i)=>({mesh:i}));const gltf={asset:{version:'2.0',generator:'DrwThred v4.1'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes:mds,materials:mts,accessors:accs,bufferViews:bvs,buffers:[{byteLength:bo}]};
  const jb=new TextEncoder().encode(JSON.stringify(gltf)),jl=jb.length,jp=(4-jl%4)%4;const bin=new Uint8Array(bo);let off=0;cks.forEach(c=>{bin.set(c,off);off+=c.byteLength;});const bl=bin.length,bp=(4-bl%4)%4,tot=12+8+(jl+jp)+8+(bl+bp);const out=new ArrayBuffer(tot);const dv=new DataView(out);let p=0;dv.setUint32(p,0x46546C67,true);p+=4;dv.setUint32(p,2,true);p+=4;dv.setUint32(p,tot,true);p+=4;dv.setUint32(p,jl+jp,true);p+=4;dv.setUint32(p,0x4E4F534A,true);p+=4;new Uint8Array(out,p).set(jb);for(let i=0;i<jp;i++)new Uint8Array(out)[p+jl+i]=0x20;p+=jl+jp;dv.setUint32(p,bl+bp,true);p+=4;dv.setUint32(p,0x004E4942,true);p+=4;new Uint8Array(out,p).set(bin);
  const blob=new Blob([out],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(expName||'drwthred')+'.glb';a.click();URL.revokeObjectURL(url);toast('GLB exported');
}
function expOBJ(expName){if(!strokes.length){alert('Nothing to export.');return;}
  const sc=exportScaleMult();
  const lines=['# DrwThred v5','# Export scale: '+SCALE_LABELS[exportScaleIdx],''];let vo=1;
  strokes.forEach((s,si)=>{if(s.pts.length<2)return;
    const wpts=s.pts.map(p=>p.clone().applyMatrix4(s.mesh.matrix).multiplyScalar(sc));
    let geo;try{geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts),Math.max(wpts.length*3,8),s.sz*.011*sc,6,false);}catch(e){return;}
    const pa=geo.attributes.position,ix=geo.index;lines.push('g stroke_'+si);
    for(let i=0;i<pa.count;i++)lines.push('v '+pa.getX(i).toFixed(5)+' '+pa.getY(i).toFixed(5)+' '+pa.getZ(i).toFixed(5));
    if(ix)for(let i=0;i<ix.count;i+=3)lines.push('f '+(ix.getX(i)+vo)+' '+(ix.getX(i+1)+vo)+' '+(ix.getX(i+2)+vo));
    vo+=pa.count;lines.push('');geo.dispose();});
  const blob=new Blob([lines.join('\n')],{type:'text/plain'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(expName||'drwthred')+'.obj';a.click();URL.revokeObjectURL(url);toast('OBJ exported ('+SCALE_LABELS[exportScaleIdx]+')');}
function buildUSDA(){
  const sc=exportScaleMult();
  const lines=['#usda 1.0','(','    defaultPrim = "DrwThred"','    upAxis = "Z"','    metersPerUnit = '+sc.toFixed(2),')','','def Xform "DrwThred" {'];
  strokes.forEach((s,si)=>{if(s.pts.length<2)return;
    const wpts=s.pts.map(p=>p.clone().applyMatrix4(s.mesh.matrix).multiplyScalar(sc));
    let geo;try{geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wpts),Math.max(wpts.length*3,8),s.sz*.011*sc,6,false);}catch(e){return;}
    const pa=geo.attributes.position,ix=geo.index,col=new THREE.Color(s.color);
    const pts=[];for(let i=0;i<pa.count;i++)pts.push('('+pa.getX(i).toFixed(4)+', '+pa.getY(i).toFixed(4)+', '+pa.getZ(i).toFixed(4)+')');
    const counts=[],indices=[];if(ix)for(let i=0;i<ix.count;i+=3){counts.push(3);indices.push(ix.getX(i),ix.getX(i+1),ix.getX(i+2));}
    lines.push('    def Mesh "stroke_'+si+'" {');
    lines.push('        point3f[] points = ['+pts.join(', ')+']');
    if(counts.length){lines.push('        int[] faceVertexCounts = ['+counts.join(', ')+']');lines.push('        int[] faceVertexIndices = ['+indices.join(', ')+']');}
    lines.push('        color3f[] primvars:displayColor = [('+col.r.toFixed(3)+', '+col.g.toFixed(3)+', '+col.b.toFixed(3)+')]');
    lines.push('        float primvars:displayOpacity = '+s.op.toFixed(3));
    lines.push('        uniform token subdivisionScheme = "none"');
    lines.push('    }');geo.dispose();});
  lines.push('}');return lines.join('\n');
}
function expUSD(expName){if(!strokes.length){alert('Nothing to export.');return;}const b=new Blob([buildUSDA()],{type:'model/vnd.usda'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=(expName||'drwthred')+'.usda';a.click();URL.revokeObjectURL(u);toast('USDA exported');}
function expUSDZ(expName){if(!strokes.length){alert('Nothing to export.');return;}
  const usda=buildUSDA(),enc=new TextEncoder(),data=enc.encode(usda),name=enc.encode('drwthred.usda');
  function u16(n){const b=new Uint8Array(2);new DataView(b.buffer).setUint16(0,n,true);return b;}
  function u32(n){const b=new Uint8Array(4);new DataView(b.buffer).setUint32(0,n,true);return b;}
  function crc32(buf){let c=0xFFFFFFFF;const t=new Uint32Array(256);for(let i=0;i<256;i++){let v=i;for(let j=0;j<8;j++)v=v&1?(0xEDB88320^(v>>>1)):(v>>>1);t[i]=v;}for(let i=0;i<buf.length;i++)c=t[(c^buf[i])&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;}
  function pad64(offset){return(64-offset%64)%64;}
  const crc=crc32(data);
  // Local file header (30 bytes) + filename
  const lhdrFixed=new Uint8Array([0x50,0x4B,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0]);
  // Pad so data starts on 64-byte boundary
  const lhdrLen=lhdrFixed.length+name.length;
  const dataOffset=lhdrLen+pad64(lhdrLen);
  const extraLen=dataOffset-lhdrLen;
  // Rebuild local header with correct extra field length
  const lhdr=new Uint8Array([0x50,0x4B,0x03,0x04,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(extraLen),...name,...new Uint8Array(extraLen)]);
  const cdOffset=lhdr.length+data.length;
  const cdhdr=new Uint8Array([0x50,0x4B,0x01,0x02,20,0,20,0,0,0,0,0,0,0,0,0,...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),0,0,0,0,0,0,0,0,0,0,0,0,...u32(0),...name]);
  const eocd=new Uint8Array([0x50,0x4B,0x05,0x06,0,0,0,0,1,0,1,0,...u32(cdhdr.length),...u32(cdOffset),0,0]);
  const total=new Uint8Array(lhdr.length+data.length+cdhdr.length+eocd.length);
  let off=0;[lhdr,data,cdhdr,eocd].forEach(b=>{total.set(b,off);off+=b.length;});
  const blob=new Blob([total],{type:'model/vnd.usdz+zip'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=(expName||'drwthred')+'.usdz';a.click();URL.revokeObjectURL(url);toast('USDZ exported');}

// ================================================================
//  RECORD VIEWS — auto-play all saved views and capture to webm
// ================================================================
