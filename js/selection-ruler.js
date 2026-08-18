// ============================================================
// selection-ruler.js
// In-card selection controls (GHUD-SEL) + ruler overlay (screen-space & world-space)
// ============================================================
(function(){
  var ghudBottom=document.getElementById('ghud-bottom');
  var ghudSel=document.getElementById('ghud-sel');
  var ghudSelPrim=document.getElementById('ghud-sel-prim');
  var ghudSelHint=document.getElementById('ghud-sel-hint');
  if(!ghudBottom||!ghudSel)return;

  // Show/hide the selection panel based on current selection state
  function _updateGhudSel(){
    var hasSel=selectedStrokes.length>0;
    var hasPrim=window._selectedPrim_get&&window._selectedPrim_get();
    var active=hasSel||hasPrim;
    // Sidecol card
    if(active){
      ghudBottom.style.display='none';
      ghudSel.style.display='flex';
      if(ghudSelPrim)ghudSelPrim.style.display=hasPrim?'flex':'none';
      if(ghudSelHint)ghudSelHint.textContent=hasSel?(selectedStrokes.length+' stroke'+(selectedStrokes.length>1?'s':'')+ ' · use tool cards for color/size/op'):(hasPrim?'ref object':'');
      _syncGhudSelControls();
    }else{
      ghudBottom.style.display='';
      ghudSel.style.display='none';
    }
    // Narrow bar (pb-gc bottom)
    var pbBottom=document.getElementById('pb-ghud-bottom');
    var pbSel=document.getElementById('pb-ghud-sel');
    if(pbBottom)pbBottom.style.display=active?'none':'flex';
    if(pbSel)pbSel.style.display=active?'flex':'none';
    // Refresh canvases
    if(window._gDraw)window._gDraw();
    if(window._pbGcDraw)window._pbGcDraw();
  }
  window._updateGhudSel=_updateGhudSel;

  // Precision readout for selection drags (shown in ghud-sel and pb-ghud-sel)
  var _selPrec=document.getElementById('ghud-sel-prec');
  var _pbSelPrec=document.getElementById('pb-ghud-sel-prec');
  window._setSelPrecision=function(text){
    if(_selPrec){
      if(text){_selPrec.textContent=text;_selPrec.style.display='';}
      else{_selPrec.style.display='none';_selPrec.textContent='';}
    }
    if(_pbSelPrec){
      if(text){_pbSelPrec.textContent=text;_pbSelPrec.style.display='';}
      else{_pbSelPrec.style.display='none';_pbSelPrec.textContent='';}
    }
  };

  // Sync inline controls to current selection
  function _syncGhudSelControls(){
    // Stroke color/size/opacity is handled by existing tool cards (.cw, [data-sz], [data-op])
    // Only need to sync prim-specific controls here
    if(window._selectedPrim_get&&window._selectedPrim_get()){
      var prim=window._selectedPrim_get();
      document.querySelectorAll('.gc-pc').forEach(function(sw){sw.classList.toggle('active',sw.dataset.pc===prim.color);});
      var pcp=document.getElementById('gc-pcpick');if(pcp)pcp.value=prim.color;
      var pos=document.getElementById('gc-popacity');var pov=document.getElementById('gc-pop-val');
      if(pos){pos.value=Math.round(prim.opacity*100);if(pov)pov.textContent=Math.round(prim.opacity*100);}
    }
  }

  // Wire action buttons
  document.querySelectorAll('.gc-sel-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.stopPropagation();
      var act=this.dataset.selact;
      if(selectedStrokes.length>0){
        if(act==='all'||act==='move'||act==='rotate'||act==='scale'){
          var sgBtn=document.getElementById('sg-'+act);if(sgBtn)sgBtn.click();
        }
        if(act==='dup'){duplicateSelected();}
        if(act==='loft'){var sgL=document.getElementById('sg-loft');if(sgL)sgL.click();}
        if(act==='loft-solid'){var sgLS=document.getElementById('sg-loft-solid');if(sgLS)sgLS.click();}
        if(act==='del'){deleteSelected();}
        if(act==='close'){clearSelection();setMode('draw');}
      }else if(window._selectedPrim_get&&window._selectedPrim_get()){
        if(act==='all'||act==='move'||act==='rotate'||act==='scale'){
          if(window._pgSetMode)window._pgSetMode(act);
        }
        if(act==='dup'&&window._duplicatePrimExt)window._duplicatePrimExt();
        if(act==='del'&&window._removePrimExt)window._removePrimExt();
        if(act==='close'&&window._deselectPrimExt)window._deselectPrimExt();
        if(act==='useplane'&&window._togglePrimsAsPlaneExt)window._togglePrimsAsPlaneExt();
      }
      _updateGhudSel();
    });
  });

  // Wire prim color swatches
  document.querySelectorAll('.gc-pc').forEach(function(sw){
    sw.addEventListener('click',function(){
      if(!window._selectedPrim_get||!window._selectedPrim_get())return;
      if(window._setPrimColorExt)window._setPrimColorExt(this.dataset.pc);
      _syncGhudSelControls();
    });
  });
  var gcPcpick=document.getElementById('gc-pcpick');
  if(gcPcpick)gcPcpick.addEventListener('input',function(){
    if(window._setPrimColorExt)window._setPrimColorExt(this.value);
    _syncGhudSelControls();
  });
  var gcPop=document.getElementById('gc-popacity');
  if(gcPop)gcPop.addEventListener('input',function(){
    if(window._setPrimOpacityExt)window._setPrimOpacityExt(parseInt(this.value)/100);
    var pov=document.getElementById('gc-pop-val');if(pov)pov.textContent=this.value;
  });
})();

// ================================================================
//  RULER OVERLAY  v5  — screen-space + world-space modes
//  Mode switching via #bruler-arrow dropdown (not in-ruler button)
// ================================================================
(function(){

  // ── Mode ─────────────────────────────────────────────────────────
  var _mode = 'screen';   // 'screen' | 'world'

  // ── Screen-space state ───────────────────────────────────────────
  var _on     = false;
  var _cx     = window.innerWidth  * 0.5;
  var _cy     = window.innerHeight * 0.5;
  var _angle  = 0;
  var BODY_H  = 72;
  var SNAP_PX = 15;

  var _drag   = null;
  var _pinch  = null;

  var _angleSnap  = true;
  var _rotLastTap = 0;
  var ROT_DBL_MS  = 350;
  var _angleFull  = false; // false=±180°, true=0–360°

  var _rulerLocked   = false;
  var _rulerSide     = 0;
  var _rulerLastPt   = null;
  var _rulerBypassed = false;

  window._rulerStrokeEnd = function(){
    _rulerLocked = false; _rulerSide = 0;
    _rulerLastPt = null;  _rulerBypassed = false;
  };

  // ── World-space state ────────────────────────────────────────────
  var _wPos   = null;
  var _wAngle = 0;
  var WORLD_HALF_LEN   = 5.0;
  var WORLD_HALF_WIDTH = 0.3;

  var _wGroup = null;
  var _wMesh  = null;
  var _wRC    = new THREE.Raycaster();

  function _initWorldRuler(){
    if(_wGroup) return;
    _wGroup = new THREE.Group();
    var geo = new THREE.PlaneGeometry(WORLD_HALF_LEN*2, WORLD_HALF_WIDTH*2);
    _wMesh  = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      visible:false, side:THREE.DoubleSide
    }));
    _wGroup.add(_wMesh);
  }


  function _w2s(v3){
    var cam = activeCam();
    // Check if point is in front of camera before projecting
    var v4 = v3.clone().applyMatrix4(cam.matrixWorldInverse);
    var behind = v4.z > 0; // In view space, camera looks down -Z; z>0 = behind
    var v   = v3.clone().project(cam);
    return {
      x: ( v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      behind: behind
    };
  }

  function _screenToPlane(sx, sy){
    if(!surfMesh) return null;
    var r    = _cachedRect;
    var ndcX = ((sx - r.left) / r.width)  *  2 - 1;
    var ndcY = -((sy - r.top)  / r.height) *  2 + 1;
    _wRC.setFromCamera(new THREE.Vector2(ndcX, ndcY), activeCam());
    var prev = surfMesh.material.side; surfMesh.material.side = THREE.DoubleSide;
    var hits = _wRC.intersectObject(surfMesh, false);
    surfMesh.material.side = prev;
    if(!hits.length) return null;
    var pt = hits[0].point.clone();
    pt.sub(surfGroup.position);
    var q  = surfGroup.quaternion.clone().invert();
    pt.applyQuaternion(q);
    return { x: pt.x, y: pt.y, world: hits[0].point.clone() };
  }

  function _worldCorners(){
    if(!surfGroup) return null;
    var planeX  = new THREE.Vector3(1,0,0).applyQuaternion(surfGroup.quaternion);
    var planeY  = new THREE.Vector3(0,1,0).applyQuaternion(surfGroup.quaternion);
    var planeN  = new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
    var rulerX  = planeX.clone().multiplyScalar(Math.cos(_wAngle))
                    .addScaledVector(planeY, Math.sin(_wAngle));
    var rulerY  = planeX.clone().multiplyScalar(-Math.sin(_wAngle))
                    .addScaledVector(planeY, Math.cos(_wAngle));
    var origin  = surfGroup.position.clone()
                    .addScaledVector(planeX, _wPos.x)
                    .addScaledVector(planeY, _wPos.y)
                    .addScaledVector(planeN, 0.004);
    var corners = [
      origin.clone().addScaledVector(rulerX, -WORLD_HALF_LEN).addScaledVector(rulerY,  WORLD_HALF_WIDTH),
      origin.clone().addScaledVector(rulerX,  WORLD_HALF_LEN).addScaledVector(rulerY,  WORLD_HALF_WIDTH),
      origin.clone().addScaledVector(rulerX,  WORLD_HALF_LEN).addScaledVector(rulerY, -WORLD_HALF_WIDTH),
      origin.clone().addScaledVector(rulerX, -WORLD_HALF_LEN).addScaledVector(rulerY, -WORLD_HALF_WIDTH),
    ];
    return corners.map(function(w){ return { world:w, screen:_w2s(w) }; });
  }

  function _worldHandles(){
    if(!surfGroup) return null;
    var planeX = new THREE.Vector3(1,0,0).applyQuaternion(surfGroup.quaternion);
    var planeY = new THREE.Vector3(0,1,0).applyQuaternion(surfGroup.quaternion);
    var planeN = new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
    var rulerX = planeX.clone().multiplyScalar(Math.cos(_wAngle))
                   .addScaledVector(planeY, Math.sin(_wAngle));
    var origin = surfGroup.position.clone()
                   .addScaledVector(planeX, _wPos.x)
                   .addScaledVector(planeY, _wPos.y)
                   .addScaledVector(planeN, 0.008);
    var cen  = origin.clone();
    var rotH = origin.clone().addScaledVector(rulerX, 1.0);
    return {
      centre: { world:cen,  screen:_w2s(cen)  },
      rot:    { world:rotH, screen:_w2s(rotH) }
    };
  }

  function _closestOnSeg(ax,ay,bx,by,px,py){
    var dx=bx-ax, dy=by-ay, t=0;
    var len2=dx*dx+dy*dy;
    if(len2>0) t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
    return { x:ax+t*dx, y:ay+t*dy, t:t };
  }

  // ── Visual canvas ────────────────────────────────────────────────
  var _cvs = document.createElement('canvas');
  _cvs.id  = 'ruler-overlay';
  _cvs.style.cssText = 'position:fixed;inset:0;z-index:18;pointer-events:none;';
  document.body.appendChild(_cvs);
  var _ctx = _cvs.getContext('2d');
  var _dpr = 1;

  function _resize(){
    _dpr = window.devicePixelRatio || 1;
    _cvs.width  = window.innerWidth  * _dpr;
    _cvs.height = window.innerHeight * _dpr;
    _cvs.style.width  = window.innerWidth  + 'px';
    _cvs.style.height = window.innerHeight + 'px';
    _cx = Math.max(80, Math.min(window.innerWidth  - 80, _cx));
    _cy = Math.max(50, Math.min(window.innerHeight - 50, _cy));
  }
  _resize();
  window.addEventListener('resize', function(){ _resize(); _drawSync(); });

  // ── Ticks / scale (shared) ───────────────────────────────────────
  function _pxPerMeter(){
    try {
      var cam    = activeCam();
      var origin = surfGroup ? surfGroup.position.clone() : new THREE.Vector3();
      var right  = new THREE.Vector3(1,0,0);
      if(surfGroup) right.applyQuaternion(surfGroup.quaternion);
      var unitsPerMetre = 1.0;
      if(typeof exportScaleIdx !== 'undefined' &&
         typeof exportScaleMult === 'function' && exportScaleIdx > 0){
        var mult = exportScaleMult();
        if(mult > 0) unitsPerMetre = 1.0 / mult;
      }
      var p0 = origin.clone();
      var p1 = origin.clone().addScaledVector(right, unitsPerMetre);
      function w2sc(wv){
        var v = wv.clone().project(cam);
        return { x:( v.x*.5+.5)*window.innerWidth, y:(-v.y*.5+.5)*window.innerHeight };
      }
      var s0=w2sc(p0), s1=w2sc(p1);
      var ppm=Math.hypot(s1.x-s0.x,s1.y-s0.y);
      return (ppm>1&&ppm<100000)?ppm:null;
    } catch(ex){ return null; }
  }

  function _tickInterval(ppm){
    var base=0.0001;
    while(base*ppm<8) base*=10;
    var log=Math.floor(Math.log10(base)), pow=Math.pow(10,log);
    if(base/pow>=5) return 5*pow;
    else if(base/pow>=2) return 2*pow;
    else return pow;
  }

  function _fmt(m){
    if(m>=1000) return (m/1000).toFixed(0)+'km';
    if(m>=1)    return m.toFixed(0)+'m';
    if(m>=0.01) return Math.round(m*100)+'cm';
    return Math.round(m*1000)+'mm';
  }

  function _fmtAngle(rad){
    var deg = rad * 180 / Math.PI;
    if(_angleFull){
      deg = ((deg % 360) + 360) % 360; // 0–360
      return Math.round(deg) + '°';
    } else {
      // ±180
      while(deg > 180) deg -= 360;
      while(deg < -180) deg += 360;
      return Math.round(deg) + '°';
    }
  }

  // ── Draw screen-space ruler ──────────────────────────────────────
  function _drawScreen(){
    var W=window.innerWidth, H=window.innerHeight;
    var hw=Math.max(W,H)*0.65;
    _ctx.save();
    _ctx.translate(_cx*_dpr, _cy*_dpr);
    _ctx.scale(_dpr, _dpr);
    _ctx.rotate(_angle);

    _ctx.shadowColor='rgba(0,0,0,0.22)'; _ctx.shadowBlur=12; _ctx.shadowOffsetY=4;
    _ctx.fillStyle  ='rgba(245,238,210,0.38)';
    _ctx.strokeStyle='rgba(160,130,80,0.8)'; _ctx.lineWidth=1;
    var r=4;
    _ctx.beginPath();
    _ctx.moveTo(-hw+r,-BODY_H*.5);
    _ctx.arcTo(hw,-BODY_H*.5,hw,BODY_H*.5,r);
    _ctx.arcTo(hw,BODY_H*.5,-hw,BODY_H*.5,r);
    _ctx.arcTo(-hw,BODY_H*.5,-hw,-BODY_H*.5,r);
    _ctx.arcTo(-hw,-BODY_H*.5,hw,-BODY_H*.5,r);
    _ctx.closePath(); _ctx.fill();
    _ctx.shadowColor='transparent'; _ctx.stroke();

    _ctx.strokeStyle='rgba(110,80,30,0.45)'; _ctx.lineWidth=1.5;
    _ctx.beginPath(); _ctx.moveTo(-hw+r,-BODY_H*.5+.75); _ctx.lineTo(hw-r,-BODY_H*.5+.75); _ctx.stroke();

    var ppm=_pxPerMeter(), tickM=ppm?_tickInterval(ppm):null;
    _ctx.font='6.5px "DM Mono",ui-monospace,monospace';
    _ctx.textAlign='center'; _ctx.textBaseline='top';
    if(tickM&&ppm){
      var tickPx=tickM*ppm, nT=Math.ceil(hw/tickPx)+2;
      var majEvery=nT<=4?1:nT<=12?2:5;
      for(var i=-nT;i<=nT;i++){
        var tx=i*tickPx, isMaj=(i%majEvery===0), isMed=!isMaj&&(i%Math.max(1,Math.floor(majEvery/2))===0);
        var tH=isMaj?11:isMed?7:4;
        _ctx.strokeStyle='rgba(80,60,20,0.65)'; _ctx.lineWidth=isMaj?1.1:0.65;
        _ctx.beginPath(); _ctx.moveTo(tx,-BODY_H*.5+1.5); _ctx.lineTo(tx,-BODY_H*.5+1.5+tH); _ctx.stroke();
        if(isMaj){
          var lbl=_fmt(Math.abs(i*tickM)), lw=_ctx.measureText(lbl).width;
          if(tickPx*majEvery>=lw+4){ _ctx.fillStyle='rgba(70,50,15,0.75)'; _ctx.fillText(lbl,tx,-BODY_H*.5+14); }
        }
      }
    } else {
      var STEP=40,nT2=Math.ceil(hw/STEP)+1;
      for(var j=-nT2;j<=nT2;j++){
        var tx2=j*STEP,isMj=(j%5===0),isMd=(j%2===0)&&!isMj,tH2=isMj?11:isMd?7:4;
        _ctx.strokeStyle='rgba(80,60,20,0.45)'; _ctx.lineWidth=isMj?1.1:0.65;
        _ctx.beginPath(); _ctx.moveTo(tx2,-BODY_H*.5+1.5); _ctx.lineTo(tx2,-BODY_H*.5+1.5+tH2); _ctx.stroke();
      }
    }

    // Move handle
    _ctx.shadowColor='rgba(0,0,0,0.12)'; _ctx.shadowBlur=5;
    _ctx.fillStyle=_drag&&_drag.type==='move'?'rgba(80,55,15,0.35)':'rgba(130,100,45,0.22)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.arc(0,0,11,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
    _ctx.shadowColor='transparent';
    _ctx.strokeStyle='rgba(80,55,15,0.5)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.moveTo(-5,0); _ctx.lineTo(5,0); _ctx.moveTo(0,-5); _ctx.lineTo(0,5); _ctx.stroke();

    // Rotate handle — larger, shows numeric angle
    var RHX=56;
    _ctx.fillStyle=_drag&&_drag.type==='rot'?'rgba(80,55,15,0.38)':'rgba(130,100,45,0.22)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.arc(RHX,0,15,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
    // Angle text — stays upright but handle position moves with ruler
    _ctx.save();
    _ctx.translate(RHX, 0);
    _ctx.rotate(-_angle); // counter-rotate text only, position already placed by ruler transform
    _ctx.fillStyle='rgba(70,50,15,0.85)';
    _ctx.font='bold 7.5px "DM Mono",ui-monospace,monospace';
    _ctx.textAlign='center'; _ctx.textBaseline='middle';
    _ctx.fillText(_fmtAngle(_angle),0,0);
    _ctx.restore();
    // Snap dot
    _ctx.fillStyle=_angleSnap?'rgba(80,55,15,0.75)':'rgba(0,0,0,0)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=0.9;
    _ctx.beginPath(); _ctx.arc(RHX,10,2,0,Math.PI*2); _ctx.fill(); _ctx.stroke();

    _ctx.restore();
  }

  // ── Draw world-space ruler ───────────────────────────────────────
  function _drawWorld(){
    var corners = _worldCorners();
    if(!corners) return;
    var handles = _worldHandles();
    if(!handles) return;
    var sc = corners.map(function(c){ return c.screen; });

    // If ALL corners are behind the camera, skip entirely
    var allBehind = true;
    for(var ci=0;ci<sc.length;ci++){ if(!sc[ci].behind) allBehind=false; }
    if(allBehind) return;

    // Clip: for any behind-camera corner, interpolate toward adjacent in-front corner
    // so the quad stays drawable (partial visibility when close to plane at angle)
    var cam=activeCam();
    function _viewZ(v3){
      var v=v3.clone().applyMatrix4(cam.matrixWorldInverse);
      return v.z; // negative = in front, positive = behind
    }
    function _clipEdge(wA,sA,wB,sB){
      // wA is behind, wB is in front — find the 3D point on the near plane
      var zA=_viewZ(wA), zB=_viewZ(wB);
      var nearZ=-0.02; // slightly in front of near plane
      var t=(nearZ-zA)/(zB-zA);
      t=Math.max(0.01,Math.min(0.99,t));
      var wClip=wA.clone().lerp(wB,t);
      var sClip=_w2s(wClip);
      return sClip;
    }
    // Build clipped screen polygon
    var clippedSc=[];
    for(var ci2=0;ci2<4;ci2++){
      var ni=(ci2+1)%4;
      var curBehind=sc[ci2].behind, nextBehind=sc[ni].behind;
      if(!curBehind){
        clippedSc.push(sc[ci2]);
        if(nextBehind){
          clippedSc.push(_clipEdge(corners[ni].world,sc[ni],corners[ci2].world,sc[ci2]));
        }
      } else {
        if(!nextBehind){
          clippedSc.push(_clipEdge(corners[ci2].world,sc[ci2],corners[ni].world,sc[ni]));
        }
      }
    }
    if(clippedSc.length<3) return;

    _ctx.save();
    _ctx.scale(_dpr, _dpr);

    // Body polygon — same style as screen ruler
    _ctx.shadowColor='rgba(0,0,0,0.22)'; _ctx.shadowBlur=12; _ctx.shadowOffsetY=4;
    _ctx.fillStyle  ='rgba(245,238,210,0.38)';
    _ctx.strokeStyle='rgba(160,130,80,0.8)'; _ctx.lineWidth=1;
    _ctx.beginPath();
    _ctx.moveTo(clippedSc[0].x, clippedSc[0].y);
    for(var ci3=1;ci3<clippedSc.length;ci3++) _ctx.lineTo(clippedSc[ci3].x, clippedSc[ci3].y);
    _ctx.closePath(); _ctx.fill();
    _ctx.shadowColor='transparent'; _ctx.stroke();

    // Top drawing-edge accent (TL→TR) — only if both TL/TR in front
    if(!sc[0].behind && !sc[1].behind){
      _ctx.strokeStyle='rgba(110,80,30,0.45)'; _ctx.lineWidth=1.5;
      _ctx.beginPath(); _ctx.moveTo(sc[0].x,sc[0].y); _ctx.lineTo(sc[1].x,sc[1].y); _ctx.stroke();
    }

    // Bottom edge accent (BL→BR) — only if both in front
    if(!sc[3].behind && !sc[2].behind){
      _ctx.strokeStyle='rgba(110,80,30,0.3)'; _ctx.lineWidth=1;
      _ctx.beginPath(); _ctx.moveTo(sc[3].x,sc[3].y); _ctx.lineTo(sc[2].x,sc[2].y); _ctx.stroke();
    }

    // World-space ticks — always show grid-aligned divisions
    // Use scene scale to determine real-world unit per grid square
    var ppm=_pxPerMeter();
    // Determine world units per meter for label formatting
    var unitsPerMetre = 1.0;
    if(typeof exportScaleIdx !== 'undefined' &&
       typeof exportScaleMult === 'function' && exportScaleIdx > 0){
      var emult = exportScaleMult();
      if(emult > 0) unitsPerMetre = 1.0 / emult;
    }
    // Fixed world-space tick: 1 grid unit major, 0.5 sub-division, 0.1 minor
    // Choose subdivision density based on screen size of 1 unit
    var unitScreenPx = ppm ? ppm / unitsPerMetre : 40;
    var subDiv, minorDiv;
    if(unitScreenPx > 200){ subDiv = 0.1; minorDiv = 0.05; }
    else if(unitScreenPx > 80){ subDiv = 0.25; minorDiv = 0.25; }
    else if(unitScreenPx > 30){ subDiv = 0.5; minorDiv = 0.5; }
    else { subDiv = 1.0; minorDiv = 1.0; }
    {
      var planeX=new THREE.Vector3(1,0,0).applyQuaternion(surfGroup.quaternion);
      var planeY=new THREE.Vector3(0,1,0).applyQuaternion(surfGroup.quaternion);
      var planeN=new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
      var rulerX=planeX.clone().multiplyScalar(Math.cos(_wAngle))
                   .addScaledVector(planeY,Math.sin(_wAngle));
      var rulerYv=planeX.clone().multiplyScalar(-Math.sin(_wAngle))
                   .addScaledVector(planeY,Math.cos(_wAngle));
      var origin=surfGroup.position.clone()
                   .addScaledVector(planeX,_wPos.x)
                   .addScaledVector(planeY,_wPos.y)
                   .addScaledVector(planeN,0.006);
      var topEdgeY=WORLD_HALF_WIDTH;
      var botEdgeY=-WORLD_HALF_WIDTH;
      // Step through in subDiv increments
      var step = subDiv;
      var nT=Math.ceil(WORLD_HALF_LEN/step);
      _ctx.font='6.5px "DM Mono",ui-monospace,monospace';
      _ctx.textAlign='center'; _ctx.textBaseline='bottom';
      for(var i=-nT;i<=nT;i++){
        var wx=i*step;
        if(Math.abs(wx)>WORLD_HALF_LEN+0.001) continue;
        // Classify tick: major (integer unit), medium (half unit), minor
        var absWx=Math.abs(wx);
        var isUnit=Math.abs(Math.round(wx)-wx)<0.001;
        var isHalf=!isUnit && Math.abs(Math.round(wx*2)-wx*2)<0.001;
        var isMaj=isUnit, isMed=isHalf;

        var thFrac = isMaj?0.55:isMed?0.38:0.22;

        // Top edge ticks (inward from top)
        var tickTipTop = WORLD_HALF_WIDTH - WORLD_HALF_WIDTH*2*thFrac;
        var wBaseT = origin.clone().addScaledVector(rulerX,wx).addScaledVector(rulerYv,topEdgeY);
        var wTipT  = origin.clone().addScaledVector(rulerX,wx).addScaledVector(rulerYv,tickTipTop);
        var sBaseT = _w2s(wBaseT), sTipT = _w2s(wTipT);
        if(sBaseT.behind || sTipT.behind) continue;
        _ctx.strokeStyle='rgba(80,60,20,0.65)'; _ctx.lineWidth=isMaj?1.1:0.65;
        _ctx.beginPath(); _ctx.moveTo(sBaseT.x,sBaseT.y); _ctx.lineTo(sTipT.x,sTipT.y); _ctx.stroke();

        // Bottom edge ticks (inward from bottom) — shorter
        var thFracB = isMaj?0.35:isMed?0.22:0.12;
        var tickTipBot = -WORLD_HALF_WIDTH + WORLD_HALF_WIDTH*2*thFracB;
        var wBaseB = origin.clone().addScaledVector(rulerX,wx).addScaledVector(rulerYv,botEdgeY);
        var wTipB  = origin.clone().addScaledVector(rulerX,wx).addScaledVector(rulerYv,tickTipBot);
        var sBaseB = _w2s(wBaseB), sTipB = _w2s(wTipB);
        if(!sBaseB.behind && !sTipB.behind){
        _ctx.strokeStyle='rgba(80,60,20,0.4)'; _ctx.lineWidth=isMaj?0.9:0.5;
        _ctx.beginPath(); _ctx.moveTo(sBaseB.x,sBaseB.y); _ctx.lineTo(sTipB.x,sTipB.y); _ctx.stroke();
        }

        // Labels on major ticks (every integer unit)
        if(isMaj){
          var realM = Math.abs(wx) / unitsPerMetre;
          var lbl = _fmt(realM);
          _ctx.fillStyle='rgba(70,50,15,0.8)';
          var lx=sBaseT.x-(sBaseT.y-sTipT.y)*0.6, ly=sBaseT.y+(sBaseT.x-sTipT.x)*0.6;
          _ctx.fillText(lbl, lx, ly);
        }
      }
    }

    // Handles — only draw if in front of camera
    var cen = handles.centre.screen;
    var rot = handles.rot.screen;

    if(!cen.behind){
    // Move handle — same style as screen ruler
    _ctx.shadowColor='rgba(0,0,0,0.12)'; _ctx.shadowBlur=5;
    _ctx.fillStyle=_drag&&_drag.type==='move'?'rgba(80,55,15,0.35)':'rgba(130,100,45,0.22)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.arc(cen.x,cen.y,11,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
    _ctx.shadowColor='transparent';
    _ctx.strokeStyle='rgba(80,55,15,0.5)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.moveTo(cen.x-5,cen.y); _ctx.lineTo(cen.x+5,cen.y);
    _ctx.moveTo(cen.x,cen.y-5); _ctx.lineTo(cen.x,cen.y+5); _ctx.stroke();
    }

    if(!rot.behind){
    // Rotate handle — larger, shows numeric angle
    _ctx.fillStyle=_drag&&_drag.type==='rot'?'rgba(80,55,15,0.38)':'rgba(130,100,45,0.22)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=1;
    _ctx.beginPath(); _ctx.arc(rot.x,rot.y,15,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
    // Angle text
    _ctx.fillStyle='rgba(70,50,15,0.85)';
    _ctx.font='bold 7.5px "DM Mono",ui-monospace,monospace';
    _ctx.textAlign='center'; _ctx.textBaseline='middle';
    _ctx.fillText(_fmtAngle(_wAngle),rot.x,rot.y);
    // Snap dot
    var a2=Math.atan2(rot.y-cen.y, rot.x-cen.x);
    var da=a2+Math.PI/2;
    _ctx.fillStyle=_angleSnap?'rgba(80,55,15,0.75)':'rgba(0,0,0,0)';
    _ctx.strokeStyle='rgba(80,55,15,0.6)'; _ctx.lineWidth=0.9;
    _ctx.beginPath(); _ctx.arc(rot.x+Math.cos(da)*10,rot.y+Math.sin(da)*10,2,0,Math.PI*2); _ctx.fill(); _ctx.stroke();
    } // end if(!rot.behind)

    _ctx.restore();
  }

  // ── Main draw ────────────────────────────────────────────────────
  var _drawRaf=0;
  function _drawNow(){
    _drawRaf=0;
    _ctx.setTransform(_dpr,0,0,_dpr,0,0);
    _ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    if(!_on) return;
    _ctx.setTransform(1,0,0,1,0,0);
    if(_mode==='screen') _drawScreen();
    else                 _drawWorld();
  }
  function _draw(){
    if(!_drawRaf) _drawRaf=requestAnimationFrame(_drawNow);
  }
  // Immediate draw needed for clear-on-off and resize
  function _drawSync(){
    if(_drawRaf){ cancelAnimationFrame(_drawRaf); _drawRaf=0; }
    _drawNow();
  }

  // ── Hit test ─────────────────────────────────────────────────────
  function _hitTest(sx, sy){
    if(!_on) return null;
    if(_mode==='screen'){
      var cos=Math.cos(_angle), sin=Math.sin(_angle);
      var dx=sx-_cx, dy=sy-_cy;
      var lx= dx*cos+dy*sin, ly=-dx*sin+dy*cos;
      if(Math.hypot(lx-56,ly)<=20) return 'rot';
      if(Math.hypot(lx,ly)<=16)    return 'move';
    } else {
      var h=_worldHandles();
      if(!h) return null;
      if(Math.hypot(sx-h.rot.screen.x, sy-h.rot.screen.y)   <= 20) return 'rot';
      if(Math.hypot(sx-h.centre.screen.x,sy-h.centre.screen.y)<=18) return 'move';
    }
    return null;
  }

  function _onRuler(sx, sy){
    if(!_on) return false;
    if(_mode==='screen'){
      var cos=Math.cos(_angle), sin=Math.sin(_angle);
      var dx=sx-_cx, dy=sy-_cy;
      var lx= dx*cos+dy*sin, ly=-dx*sin+dy*cos;
      var hw=Math.max(window.innerWidth,window.innerHeight)*0.65;
      return Math.abs(lx)<=hw && Math.abs(ly)<=BODY_H*0.5+14;
    } else {
      // Check if near the ruler — inside quad OR within 20px of top/bottom edge
      var c=_worldCorners(); if(!c) return false;
      var sc=c.map(function(p){ return p.screen; });
      if(_ptInQuad(sx,sy,sc[0],sc[1],sc[2],sc[3])) return true;
      var dTop=_closestOnSeg(sc[0].x,sc[0].y,sc[1].x,sc[1].y,sx,sy);
      var dBot=_closestOnSeg(sc[3].x,sc[3].y,sc[2].x,sc[2].y,sx,sy);
      var distTop=Math.hypot(sx-dTop.x,sy-dTop.y);
      var distBot=Math.hypot(sx-dBot.x,sy-dBot.y);
      return distTop<=20 || distBot<=20;
    }
  }

  function _ptInQuad(px,py,a,b,c,d){
    function cross(o,u,v){ return (u.x-o.x)*(v.y-o.y)-(u.y-o.y)*(v.x-o.x); }
    var P={x:px,y:py};
    return cross(a,b,P)>=0 && cross(b,c,P)>=0 && cross(c,d,P)>=0 && cross(d,a,P)>=0;
  }

  // ── Event capture ────────────────────────────────────────────────
  function _onCaptureDown(e){
    if(!_on) return;

    var sx=e.clientX!==undefined?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:null);
    var sy=e.clientY!==undefined?e.clientY:(e.touches&&e.touches[0]?e.touches[0].clientY:null);

    // Two-finger ruler gesture
    if(e.type==='touchstart' && e.touches && e.touches.length===2){
      var t0=e.touches[0], t1=e.touches[1];
      if(_onRuler(t0.clientX,t0.clientY)||_onRuler(t1.clientX,t1.clientY)){
        e.preventDefault(); e.stopImmediatePropagation();
        var mx=(t0.clientX+t1.clientX)*0.5, my=(t0.clientY+t1.clientY)*0.5;
        if(_mode==='screen'){
          _pinch={mx:mx,my:my,
                  fingerAngle:Math.atan2(t1.clientY-t0.clientY,t1.clientX-t0.clientX),
                  origCx:_cx,origCy:_cy,origAngle:_angle};
        } else {
          // World mode: use screen-space two-finger gesture (same as screen ruler)
          // Raycast midpoint to get plane-local anchor
          var ppMid=_screenToPlane(mx,my);
          _pinch={mode:'world',mx:mx,my:my,
                  fingerAngle:Math.atan2(t1.clientY-t0.clientY,t1.clientX-t0.clientX),
                  origWx:_wPos.x,origWy:_wPos.y,origWAngle:_wAngle,
                  ppAnchor:ppMid};
        }
        _drag=null;
        if(typeof cancelDraw==='function') cancelDraw();
        _draw(); return;
      }
    }

    if(sx===null) return;
    if(_drag){ e.preventDefault(); e.stopImmediatePropagation(); return; }
    var h=_hitTest(sx,sy);
    if(!h) return;

    e.preventDefault(); e.stopImmediatePropagation();
    if(_mode==='screen'){
      _drag={type:h,pointerId:e.pointerId||0,
             startX:sx,startY:sy,origCx:_cx,origCy:_cy,origAngle:_angle,
             wasTap:true};
    } else {
      // World mode: use screen-space gestures (same as screen ruler)
      // Store the ruler's screen-space centre for rotation reference
      var wh=_worldHandles();
      var cenScreen=wh?wh.centre.screen:{x:sx,y:sy};
      // Cache ppStart once at drag start — avoids re-raycasting every frame
      var ppS=h==='move'?_screenToPlane(sx,sy):null;
      _drag={type:h,pointerId:e.pointerId||0,
             startX:sx,startY:sy,prevX:sx,prevY:sy,
             origWx:_wPos.x,origWy:_wPos.y,origWAngle:_wAngle,
             cenSX:cenScreen.x,cenSY:cenScreen.y,
             ppStart:ppS,
             wasTap:true};
    }
    _draw();
  }

  function _onCaptureMove(e){
    // Two-finger pinch
    if(_pinch&&e.type==='touchmove'&&e.touches&&e.touches.length>=2){
      e.preventDefault(); e.stopImmediatePropagation();
      var t0=e.touches[0],t1=e.touches[1];
      if(_mode==='screen'||!_pinch.mode){
        var mx=(t0.clientX+t1.clientX)*0.5,my=(t0.clientY+t1.clientY)*0.5;
        var fa=Math.atan2(t1.clientY-t0.clientY,t1.clientX-t0.clientX);
        _cx=_pinch.origCx+(mx-_pinch.mx); _cy=_pinch.origCy+(my-_pinch.my);
        _angle=_pinch.origAngle+(fa-_pinch.fingerAngle);
        if(_angleSnap) _snapAngle();
      } else {
        // World mode pinch: incremental translate via raycast delta, rotate via finger angle
        var cmx=(t0.clientX+t1.clientX)*0.5,cmy=(t0.clientY+t1.clientY)*0.5;
        var ppPrev=_screenToPlane(_pinch.mx,_pinch.my);
        var ppCur=_screenToPlane(cmx,cmy);
        if(ppPrev&&ppCur){
          _wPos.x+=(ppCur.x-ppPrev.x);
          _wPos.y+=(ppCur.y-ppPrev.y);
        } else if(_pinch.ppAnchor&&ppCur){
          // Fallback: absolute from original anchor
          _wPos.x=_pinch.origWx+(ppCur.x-_pinch.ppAnchor.x);
          _wPos.y=_pinch.origWy+(ppCur.y-_pinch.ppAnchor.y);
        }
        _pinch.mx=cmx; _pinch.my=cmy;
        var fa2=Math.atan2(t1.clientY-t0.clientY,t1.clientX-t0.clientX);
        _wAngle=_pinch.origWAngle+(fa2-_pinch.fingerAngle);
        if(_angleSnap) _snapAngle();
      }
      _draw(); return;
    }

    if(!_drag) return;
    var sx=e.clientX!==undefined?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:null);
    var sy=e.clientY!==undefined?e.clientY:(e.touches&&e.touches[0]?e.touches[0].clientY:null);
    if(sx===null) return;
    var pid=e.pointerId!==undefined?e.pointerId:0;
    if(e.pointerId!==undefined&&pid!==_drag.pointerId) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // If pointer moved significantly, not a tap
    if(_drag.wasTap && Math.hypot(sx-_drag.startX,sy-_drag.startY)>5) _drag.wasTap=false;

    if(_mode==='screen'){
      var dx=sx-_drag.startX,dy=sy-_drag.startY;
      if(_drag.type==='move'){ _cx=_drag.origCx+dx; _cy=_drag.origCy+dy; }
      else { _angle=Math.atan2(sy-_cy,sx-_cx); if(_angleSnap) _snapAngle(); }
    } else {
      // World mode: screen-space gestures converted to plane-local movement
      if(_drag.type==='move'){
        // Incremental: raycast current pos, compare to previous pos
        var ppPrev=_screenToPlane(_drag.prevX,_drag.prevY);
        var ppCur=_screenToPlane(sx,sy);
        if(ppPrev&&ppCur){
          _wPos.x+=(ppCur.x-ppPrev.x);
          _wPos.y+=(ppCur.y-ppPrev.y);
        } else if(_drag.ppStart&&ppCur){
          // Fallback: absolute from start if prev raycast missed
          _wPos.x=_drag.origWx+(ppCur.x-_drag.ppStart.x);
          _wPos.y=_drag.origWy+(ppCur.y-_drag.ppStart.y);
        }
        _drag.prevX=sx; _drag.prevY=sy;
      } else {
        // Rotate: use screen-space atan2 from ruler's projected centre (same gesture as screen ruler)
        var wh=_worldHandles();
        var csX=wh?wh.centre.screen.x:_drag.cenSX;
        var csY=wh?wh.centre.screen.y:_drag.cenSY;
        _wAngle=_drag.origWAngle+(Math.atan2(sy-csY,sx-csX)-Math.atan2(_drag.startY-_drag.cenSY,_drag.startX-_drag.cenSX));
        if(_angleSnap) _snapAngle();
      }
    }
    _draw();
  }

  var _rotSingleTimer = null;

  function _onCaptureUp(e){
    if(_pinch&&e.type==='touchend'){
      if(!e.touches||e.touches.length<2){ _pinch=null; _draw(); } return;
    }
    if(!_drag) return;
    var pid=e.pointerId!==undefined?e.pointerId:0;
    if(e.pointerId!==undefined&&pid!==_drag.pointerId) return;
    e.preventDefault(); e.stopImmediatePropagation();
    // Check if this was a tap on the rotate handle
    var wasTap = _drag.wasTap && _drag.type==='rot';
    _drag=null;
    if(wasTap){
      var now=Date.now();
      if(now-_rotLastTap<ROT_DBL_MS){
        // Double tap → toggle snap
        if(_rotSingleTimer){ clearTimeout(_rotSingleTimer); _rotSingleTimer=null; }
        _angleSnap=!_angleSnap;
        _rotLastTap=0;
      } else {
        // Potential single tap — defer until we know it's not a double
        _rotLastTap=now;
        _rotSingleTimer=setTimeout(function(){
          _angleFull=!_angleFull;
          _rotSingleTimer=null;
          _draw();
        }, ROT_DBL_MS);
      }
    }
    _draw();
  }

  function _snapAngle(){
    var ref = _mode==='screen' ? _angle : _wAngle;
    var S4=4*Math.PI/180;
    var snaps=[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,-Math.PI/4,-Math.PI/2,-3*Math.PI/4];
    for(var i=0;i<snaps.length;i++){
      if(Math.abs(ref-snaps[i])<S4){
        if(_mode==='screen') _angle=snaps[i]; else _wAngle=snaps[i];
        return;
      }
    }
  }

  var _O={capture:true,passive:false};
  document.addEventListener('pointerdown',  _onCaptureDown,_O);
  document.addEventListener('pointermove',  _onCaptureMove,_O);
  document.addEventListener('pointerup',    _onCaptureUp,  _O);
  document.addEventListener('pointercancel',_onCaptureUp,  _O);
  document.addEventListener('touchstart',   _onCaptureDown,_O);
  document.addEventListener('touchmove',    _onCaptureMove,_O);
  document.addEventListener('touchend',     _onCaptureUp,  _O);
  document.addEventListener('touchcancel',  _onCaptureUp,  _O);
  document.addEventListener('mousedown',    _onCaptureDown,_O);
  document.addEventListener('mousemove',    _onCaptureMove,_O);
  document.addEventListener('mouseup',      _onCaptureUp,  _O);

  // ── Snap hook ────────────────────────────────────────────────────
  window._rulerBlocksPt = function(screenX, screenY){
    if(!_on) return false;
    if(_mode==='screen'){
      var sinA=Math.sin(_angle),cosA=Math.cos(_angle);
      var dx=screenX-_cx, dy=screenY-_cy;
      var distToCenter=dx*(-sinA)+dy*cosA;
      var hw=Math.max(window.innerWidth,window.innerHeight)*0.65;
      var lx=dx*cosA+dy*sinA;
      var insideBody=Math.abs(distToCenter)<BODY_H*0.5&&Math.abs(lx)<hw;
      var nearEdge=Math.abs(Math.abs(distToCenter)-BODY_H*0.5)<=SNAP_PX;
      return insideBody&&!nearEdge;
    } else {
      var c=_worldCorners(); if(!c) return false;
      var sc=c.map(function(p){ return p.screen; });
      if(!_ptInQuad(screenX,screenY,sc[0],sc[1],sc[2],sc[3])) return false;
      var top=_closestOnSeg(sc[0].x,sc[0].y,sc[1].x,sc[1].y,screenX,screenY);
      var bot=_closestOnSeg(sc[3].x,sc[3].y,sc[2].x,sc[2].y,screenX,screenY);
      var dTop=Math.hypot(screenX-top.x,screenY-top.y);
      var dBot=Math.hypot(screenX-bot.x,screenY-bot.y);
      return dTop>SNAP_PX&&dBot>SNAP_PX;
    }
  };

  window._rulerSnapPt = function(worldPt, screenX, screenY){
    if(!_on||_rulerBypassed) return null;
    if(_mode==='screen'){
      var sinA=Math.sin(_angle),cosA=Math.cos(_angle);
      if(!_rulerLocked){
        var dx=screenX-_cx,dy=screenY-_cy;
        var dToC=dx*(-sinA)+dy*cosA;
        var dTop=Math.abs(dToC+BODY_H*0.5),dBot=Math.abs(dToC-BODY_H*0.5);
        var nTop=dTop<=SNAP_PX,nBot=dBot<=SNAP_PX;
        if(!nTop&&!nBot){ _rulerBypassed=true; return null; }
        _rulerSide=(nTop&&!nBot)?-1:(nBot&&!nTop)?1:(dToC<0?-1:1);
        _rulerLocked=true;
      }
      var eo=_rulerSide*(BODY_H*0.5);
      var ex=_cx+eo*(-sinA),ey=_cy+eo*(cosA);
      var ddx=screenX-ex,ddy=screenY-ey;
      var along=ddx*cosA+ddy*sinA;
      var res=s2w(ex+along*cosA,ey+along*sinA);
      if(res){ _rulerLastPt=res.clone(); return res; }
      return _rulerLastPt?_rulerLastPt.clone():null;
    } else {
      var corners=_worldCorners(); if(!corners) return null;
      var sc=corners.map(function(p){ return p.screen; });
      if(!_rulerLocked){
        var top2=_closestOnSeg(sc[0].x,sc[0].y,sc[1].x,sc[1].y,screenX,screenY);
        var bot2=_closestOnSeg(sc[3].x,sc[3].y,sc[2].x,sc[2].y,screenX,screenY);
        var dT=Math.hypot(screenX-top2.x,screenY-top2.y);
        var dB=Math.hypot(screenX-bot2.x,screenY-bot2.y);
        var nT=dT<=SNAP_PX,nB=dB<=SNAP_PX;
        if(!nT&&!nB){ _rulerBypassed=true; return null; }
        _rulerSide=(nT&&!nB)?-1:(nB&&!nT)?1:(dT<=dB?-1:1);
        _rulerLocked=true;
      }
      // Get the locked edge endpoints in world space (on the drawing plane)
      var ea,eb;
      if(_rulerSide===-1){ ea=corners[0]; eb=corners[1]; }
      else               { ea=corners[3]; eb=corners[2]; }
      // Remove the 0.004 normal offset so edge lies on the actual plane
      var planeN2=new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
      var edgeA=ea.world.clone().addScaledVector(planeN2,-0.004);
      var edgeB=eb.world.clone().addScaledVector(planeN2,-0.004);
      // Project worldPt onto the edge line in WORLD space (perspective-correct)
      var edgeDir=edgeB.clone().sub(edgeA);
      var edgeLen2=edgeDir.lengthSq();
      var t2=0;
      if(edgeLen2>0){
        t2=worldPt.clone().sub(edgeA).dot(edgeDir)/edgeLen2;
        t2=Math.max(0,Math.min(1,t2));
      }
      var snapWorld=edgeA.clone().lerp(edgeB,t2);
      _rulerLastPt=snapWorld.clone();
      return snapWorld;
    }
  };

  // ── Mode switch (called from dropdown) ──────────────────────────
  function _isPlane(){ return typeof surfType!=='undefined' && surfType==='plane'; }

  function _setMode(m){
    if(m===_mode) return;
    if(m==='world'){
      if(!_isPlane()) return; // world ruler only on plane
      _initWorldRuler();
      if(!_wPos){ _wPos={x:0,y:0}; _wAngle=0; }
    }
    _mode=m;
    window._rulerStrokeEnd();
    _syncModePop();
    _drawSync();
  }
  // Expose for dropdown
  window._rulerSetMode = _setMode;
  // Called when surface type changes — force back to screen if no longer plane
  window._rulerCheckSurf = function(){
    if(_mode==='world' && !_isPlane()) _setMode('screen');
    _syncModePop();
  };

  // ── Toggle ───────────────────────────────────────────────────────
  function _syncBtns(){
    var b=document.getElementById('bsruler'); if(b) b.classList.toggle('on',_on);
  }
  window._rulerToggle=function(){ _on=!_on; _syncBtns(); _drawSync(); };
  window._rulerIsOn=function(){ return _on; };

  // ── Dropdown (mode picker) ───────────────────────────────────────
  function _syncModePop(){
    var sBtn=document.getElementById('ruler-mode-screen');
    var wBtn=document.getElementById('ruler-mode-world');
    if(sBtn){ sBtn.classList.toggle('on',_mode==='screen'); }
    if(wBtn){
      wBtn.classList.toggle('on',_mode==='world');
      // Hide "On Plane" when surface is not a plane
      wBtn.style.display = _isPlane() ? '' : 'none';
    }
  }

  function _wireDropdown(){
    var arrow=document.getElementById('bruler-arrow');
    var pop=document.getElementById('ruler-pop');
    if(!arrow||!pop) return;
    arrow.addEventListener('click',function(e){
      e.stopPropagation();
      // Position popover below arrow
      var r=arrow.getBoundingClientRect();
      pop.style.top=(r.bottom+4)+'px';
      pop.style.left=Math.max(4,r.left-40)+'px';
      pop.classList.toggle('open');
      _syncModePop();
    });
    document.getElementById('ruler-mode-screen').addEventListener('click',function(){
      _setMode('screen'); pop.classList.remove('open');
    });
    document.getElementById('ruler-mode-world').addEventListener('click',function(){
      _setMode('world'); pop.classList.remove('open');
    });
    // Close on outside click
    document.addEventListener('click',function(e){
      if(!pop.classList.contains('open')) return;
      if(pop.contains(e.target)||arrow.contains(e.target)) return;
      pop.classList.remove('open');
    });

    // Precision mode toggle
    var precBtn=document.getElementById('bprecision');
    if(precBtn){
      precBtn.addEventListener('click',function(){
        window._precisionMode=!window._precisionMode;
        precBtn.classList.toggle('on',window._precisionMode);
        if(!window._precisionMode){
          var spel=document.getElementById('sg-precision');if(spel)spel.style.display='none';
          var ppel=document.getElementById('pg-precision');if(ppel)ppel.style.display='none';
          if(window._setSelPrecision)window._setSelPrecision(null);
        }
      });
    }
  }

  function _wire(){
    var b=document.getElementById('bsruler'); if(b) b.addEventListener('click',window._rulerToggle);
    _wireDropdown();
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',_wire);
  else _wire();

  (function _raf(){ requestAnimationFrame(_raf); if(_on) _draw(); })();

})();

