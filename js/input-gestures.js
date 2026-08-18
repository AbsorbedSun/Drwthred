// ============================================================
// input-gestures.js
// Input handling: toast, gesture-mode swap, unified pointer/touch/mouse/stylus routing, draw/erase mode
// ============================================================
let toastTimer=null;
function toast(msg,dur=1400){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),dur);}

// ── Gesture swap ─────────────────────────────────────────────────
// twoFingerMode: 'orbit' (default) | 'draw' (2-finger=pan, 1-finger=draw but on canvas only)
let twoFingerMode='orbit';
function updateGestLabel(){
  var txt;
  if(stylusOnly){
    txt=twoFingerMode==='orbit'?'1F=ORB':'1F=PAN';
  } else {
    txt=twoFingerMode==='orbit'?'2F=ORB':'2F=PAN';
  }
  const b=document.getElementById('bgestswap');if(b)b.textContent=txt;
  var pb=document.getElementById('pb-gestswap');if(pb)pb.textContent=txt;
}
// stylusOnly: when true, finger touch = navigate (1F orbit, 2F pan); only pen draws
let stylusOnly=false;
function updateStylusLabel(){
  var txt=stylusOnly?'STYLUS':'FINGER';
  var b=document.getElementById('bstylus');if(b){b.textContent=txt;if(stylusOnly){b.classList.add('on');}else{b.classList.remove('on');}}
  var pb=document.getElementById('pb-stylus');if(pb){pb.textContent=txt;if(stylusOnly){pb.classList.add('on');}else{pb.classList.remove('on');}}
}

// ── Pointer / gesture handling ────────────────────────────────────
// Store the identifier of the finger that started drawing so we track the right finger even if indices shift
let _drawTouchId=null;
// _touchDragMode: tracks active touch drag in erase/select ('erase'|'select'|null)
var _touchDragMode=null;
// _dragSelectMode: 'add'|'remove' — set on first stroke touched, held for entire drag
var _dragSelectMode=null;
function ppos(e){
  if(e.touches){
    // If we have a stored drawing touch ID, find it specifically
    if(_drawTouchId!==null){
      for(let i=0;i<e.touches.length;i++){if(e.touches[i].identifier===_drawTouchId)return{x:e.touches[i].clientX,y:e.touches[i].clientY};}
    }
    return{x:e.touches[0].clientX,y:e.touches[0].clientY};
  }
  return{x:e.clientX,y:e.clientY};
}
let lastPD=null,lastTouchTime=0;
// Gesture lock for 2-finger: 'none' | 'zoom' | 'navigate'
let _twoFingerLock='none',_twoFingerStartD=0,_twoFingerStartCX=0,_twoFingerStartCY=0;
function pinchD(e){return Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);}
let threeFingerPan=false,tf3Anchor=null,tf3TargetAtStart=null;

// ── FPS touch gestures (replaces the old on-screen joysticks) ──────
// 2-finger drag = look around · 3-finger drag = walk (phantom joystick,
// anchored wherever the 3 fingers land) · 1-finger keeps drawing.
let _fpsLookActive=false,_fpsLookSX=0,_fpsLookSY=0,_fpsLookST=0,_fpsLookSP=0;
let _fpsMoveActive=false,_fpsMoveAX=0,_fpsMoveAY=0,_fpsMoveCX=0,_fpsMoveCY=0,_fpsMoveRaf=null;
const FPS_TOUCH_MOVE_MAXD=72,FPS_TOUCH_MOVE_DEADZONE=0.12;
function _fpsLookStart(cx,cy){_fpsLookActive=true;_fpsLookSX=cx;_fpsLookSY=cy;_fpsLookST=cam.theta;_fpsLookSP=cam.phi;}
function _fpsLookMove(cx,cy){
  if(!_fpsLookActive)return;
  cam.theta=_fpsLookST-(cx-_fpsLookSX)*.013;
  cam.phi=Math.max(.05,Math.min(Math.PI-.05,_fpsLookSP+(cy-_fpsLookSY)*.013));
  updCam();
}
function _fpsLookEnd(){_fpsLookActive=false;}
function _fpsMoveLoop(){
  if(!_fpsMoveActive){_fpsMoveRaf=null;return;}
  var dx=_fpsMoveCX-_fpsMoveAX,dy=_fpsMoveCY-_fpsMoveAY;
  var d=Math.hypot(dx,dy);
  if(d>FPS_TOUCH_MOVE_MAXD){var s=FPS_TOUCH_MOVE_MAXD/d;dx*=s;dy*=s;d=FPS_TOUCH_MOVE_MAXD;}
  if(window._fpsUpdateMoveHint)window._fpsUpdateMoveHint(dx,dy);
  var norm=d/FPS_TOUCH_MOVE_MAXD;
  if(norm>=FPS_TOUCH_MOVE_DEADZONE){
    var eff=(norm-FPS_TOUCH_MOVE_DEADZONE)/(1-FPS_TOUCH_MOVE_DEADZONE);
    var nx=d>0?(dx/d)*eff:0,ny=d>0?(dy/d)*eff:0;
    if(window._fpsMoveTick)window._fpsMoveTick(nx,ny,eff);
  }
  _fpsMoveRaf=requestAnimationFrame(_fpsMoveLoop);
}
function _fpsMoveStart(cx,cy){
  _fpsMoveActive=true;_fpsMoveAX=cx;_fpsMoveAY=cy;_fpsMoveCX=cx;_fpsMoveCY=cy;
  if(window._fpsShowMoveHint)window._fpsShowMoveHint(cx,cy);
  if(!_fpsMoveRaf)_fpsMoveRaf=requestAnimationFrame(_fpsMoveLoop);
}
function _fpsMoveUpdate(cx,cy){_fpsMoveCX=cx;_fpsMoveCY=cy;}
function _fpsMoveEnd(){
  _fpsMoveActive=false;
  if(window._fpsHideMoveHint)window._fpsHideMoveHint();
}
window._fpsResetTouchGestures=function(){_fpsLookEnd();_fpsMoveEnd();};

// Reusable temp vectors for panUnproject — avoids per-call GC pressure
var _puOrigin=new THREE.Vector3(),_puDir=new THREE.Vector3(),_puFwd=new THREE.Vector3(),_puTmp=new THREE.Vector3(),_puResult=new THREE.Vector3();
function panUnproject(sx,sy){
  var r=_cachedRect;
  const ndcX=(sx/r.width)*2-1,ndcY=-(sy/r.height)*2+1;
  if(useOrtho){
    // For ortho: unproject NDC directly to world space on the Z=target.z plane
    const ac=ortho;
    _puResult.set(ndcX,ndcY,0).unproject(ac);
    return _puResult;
  }
  const ac=camera;
  _puOrigin.setFromMatrixPosition(ac.matrixWorld);
  _puDir.set(ndcX,ndcY,.5).unproject(ac).sub(_puOrigin).normalize();
  _puFwd.subVectors(cam.target,_puOrigin).normalize();
  const denom=_puFwd.dot(_puDir);if(Math.abs(denom)<1e-6)return cam.target.clone();
  const t=_puFwd.dot(_puTmp.subVectors(cam.target,_puOrigin))/denom;
  _puResult.copy(_puOrigin).addScaledVector(_puDir,t);
  return _puResult;
}
function resetGesture(){cam.active=false;cam.panActive=false;lastPD=null;threeFingerPan=false;tf3Anchor=null;_twoFingerLock='none';_touchDragMode=null;_dragSelectMode=null;}
function cancelDraw(){if(isDrawing){isDrawing=false;rawPts=[];smoothPts=[];velHistory=[];lazyPos=null;_drawTouchId=null;prevLine.visible=false;_prevGeo.setDrawRange(0,0);if(window._rulerStrokeEnd) window._rulerStrokeEnd();}; _touchDragMode=null;_dragSelectMode=null;}
function startOrbit(e){const p=ppos(e);cam.active=true;cam.sx=p.x;cam.sy=p.y;cam.st=cam.theta;cam.sp=cam.phi;
}
function startPan(e){const p=ppos(e);cam.panActive=true;cam.panAnchor=panUnproject(p.x,p.y).clone();cam.panTargetAtStart.copy(cam.target);cam._panPrevX=p.x;cam._panPrevY=p.y;}
function doOrbit(e){const p=ppos(e);
  if(_fpsMode){
    // FPS: drag right → look right → decrease theta; drag up → look up → decrease phi
    cam.theta=cam.st-(p.x-cam.sx)*.013;
    cam.phi=Math.max(.05,Math.min(Math.PI-.05,cam.sp+(p.y-cam.sy)*.013));
  } else {
    cam.theta=cam.st+(p.x-cam.sx)*.013;
    cam.phi=Math.max(.05,Math.min(Math.PI-.05,cam.sp-(p.y-cam.sy)*.013));
  }
  updCam();
}
function doPan(e,overrideCX,overrideCY){
  var cx,cy;
  if(overrideCX!=null){cx=overrideCX;cy=overrideCY;}
  else{const p=ppos(e);cx=p.x;cy=p.y;}
  var prevX=cam._panPrevX!=null?cam._panPrevX:cx;
  var prevY=cam._panPrevY!=null?cam._panPrevY:cy;
  var dx=cx-prevX,dy=cy-prevY;
  cam._panPrevX=cx;cam._panPrevY=cy;
  if(Math.abs(dx)<0.5&&Math.abs(dy)<0.5)return;
  var r=_cachedRect;
  if(useOrtho){
    var ac=ortho;
    var worldW=(ac.right-ac.left);var worldH=(ac.top-ac.bottom);
    // Extract camera right and up vectors from matrixWorld for correct
    // panning at any viewing angle (old code only moved X/Y, ignoring Z)
    var me=ac.matrixWorld.elements;
    var rightX=me[0],rightY=me[1],rightZ=me[2];
    var upX=me[4],upY=me[5],upZ=me[6];
    var panX=(dx/r.width)*worldW;
    var panY=(dy/r.height)*worldH;
    // Subtract right (screen X matches camera right) but ADD up
    // because screen Y increases downward, opposite to camera up
    cam.target.x-=rightX*panX-upX*panY;
    cam.target.y-=rightY*panX-upY*panY;
    cam.target.z-=rightZ*panX-upZ*panY;
  } else {
    var wBefore=panUnproject((cx-dx)-r.left,(cy-dy)-r.top).clone();
    var wAfter=panUnproject(cx-r.left,cy-r.top);
    cam.target.add(_puTmp.subVectors(wBefore,wAfter));
  }
  updCam();
}

function onDown(e){
  // ── FPS mode: 2-finger drag = look, 3-finger drag = walk. Takes priority
  // over every other multi-finger interpretation while flying/walking. ──
  if(_fpsMode&&e.touches&&e.touches.length===2){
    e.preventDefault();cancelDraw();
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    _fpsLookStart(cx,cy);
    return;
  }
  if(_fpsMode&&e.touches&&e.touches.length===3){
    e.preventDefault();cancelDraw();
    const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3;
    const my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;
    _fpsMoveStart(mx,my);
    return;
  }
  // ── Stylus-only mode: finger touches always navigate, only pen draws ──
  // iPad Apple Pencil can arrive via touch pipeline with touchType='stylus'
  // — must NOT be treated as a finger navigate gesture.
  if(stylusOnly&&e.touches){
    var _isStylusTouch=e.touches.length===1&&e.touches[0].touchType==='stylus';
    if(!_isStylusTouch){
      if(e.touches.length===1){
        // 1 finger: orbit or pan depending on gesture swap
        cancelDraw();
        if(twoFingerMode==='orbit'){startOrbit(e);}
        else{startPan(e);}
        return;
      }
      if(e.touches.length===2){
        // 2 finger: pan or orbit depending on gesture swap (+ pinch zoom always)
        cancelDraw();
        cam.active=false;cam.panActive=false;threeFingerPan=false;tf3Anchor=null;
        const d=pinchD(e);
        lastPD=d;_twoFingerLock='none';_twoFingerStartD=d;
        const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
        _twoFingerStartCX=cx;_twoFingerStartCY=cy;
        // Arm navigate immediately — pan or orbit depending on swap
        if(twoFingerMode==='orbit'){
          // 2F=orbit mode → 2F navigates as pan in stylus
          cam.panActive=true;cam._panPrevX=cx;cam._panPrevY=cy;
        } else {
          // 2F=pan mode → 2F navigates as orbit in stylus
          cam.active=true;cam.sx=cx;cam.sy=cy;cam.st=cam.theta;cam.sp=cam.phi;
        }
        return;
      }
    }
    // _isStylusTouch falls through to normal draw/erase/select below
  }
  // ── Two-finger: lock resolves in onMove (zoom vs navigate). Do NOT pre-set
  // cam.active/cam.panActive here — that state leaks if the gesture resolves
  // to pure zoom. Orbit/pan origin is armed lazily when lock becomes 'navigate'.
  if(e.touches&&e.touches.length===2){
    cancelDraw();
    // Clear any prior multi-touch state so a 3→2 step-down starts clean
    cam.active=false;cam.panActive=false;threeFingerPan=false;tf3Anchor=null;
    const d=pinchD(e);
    lastPD=d;
    _twoFingerLock='none';
    _twoFingerStartD=d;
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    _twoFingerStartCX=cx;_twoFingerStartCY=cy;
    return;
  }
  // ── Three-finger: pan (or orbit when swapped). Clear any 2-finger state first
  // so a 2→3 step-up starts clean — previously lastPD/_twoFingerLock/cam.active
  // could leak from the preceding two-finger gesture.
  if(e.touches&&e.touches.length===3){
    cancelDraw();
    cam.active=false;cam.panActive=false;
    lastPD=null;_twoFingerLock='none';
    const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3;
    const my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;
    if(twoFingerMode==='orbit'){threeFingerPan=true;cam._panPrevX=mx;cam._panPrevY=my;}
    else{cam.active=true;cam.sx=mx;cam.sy=my;cam.st=cam.theta;cam.sp=cam.phi;}
    return;
  }
  if(e.button===1){startPan(e);e.preventDefault();return;}
  if(e.button===2){startOrbit(e);return;}
  if(mode==='orbit'){startOrbit(e);return;}
  if(mode==='pan'){startPan(e);return;}
  // ── Primitive select mode intercept (before mode-specific routing) ──
  if(window._primSelectMode && window._primSelectOnTap){
    var _pp = ppos(e);
    if(window._primSelectOnTap(_pp.x, _pp.y)) return;
  }
  if(mode==='erase'){setHoverStroke(null);_touchDragMode=e.touches?'erase':null;tryErase(e.clientX||ppos(e).x,e.clientY||ppos(e).y);return;}
  if(mode==='select'){
    const p=ppos(e);
    _touchDragMode=e.touches?'select':null;
    // Determine drag direction from first stroke hit: already selected → remove, else → add
    var firstHit=findNearestStroke(p.x,p.y);
    _dragSelectMode=firstHit&&selectedStrokes.indexOf(firstHit)>-1?'remove':'add';
    selectStroke(p.x,p.y,e.shiftKey||_selAddMode);
    return;
  }
  if(mode==='draw'){
    const p=ppos(e);let pt=s2w(p.x,p.y);
    if(!pt)return;
    if(window._rulerSnapPt) pt = window._rulerSnapPt(pt, p.x, p.y) || pt;
    if(window._rulerBlocksPt && window._rulerBlocksPt(p.x, p.y)) { cancelDraw(); return; }
    // Record which finger is drawing so ppos() tracks the right one if indices shift
    if(e.touches&&e.touches.length>0)_drawTouchId=e.touches[0].identifier;
    isDrawing=true;setSurfHover(false);rawPts=[pt];smoothPts=[pt];velHistory=[0];lazyPos=pt.clone();updPrev(smoothPts);
    if(window._hideGviewSlider)window._hideGviewSlider();
  }
}
function onMove(e){
  e.preventDefault();
  if(_fpsMode&&e.touches&&e.touches.length===2&&_fpsLookActive){
    const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
    _fpsLookMove(cx,cy);
    return;
  }
  if(_fpsMode&&e.touches&&e.touches.length===3&&_fpsMoveActive){
    const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3;
    const my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;
    _fpsMoveUpdate(mx,my);
    return;
  }
  const p=ppos(e);
  if(e.touches&&e.touches.length>=2){
    if(e.touches.length===2){
      // Clear 3-finger state on 3→2 step-down (touchend for lifted finger
      // doesn't re-call onDown, so threeFingerPan can leak from prior gesture)
      if(threeFingerPan){threeFingerPan=false;cam.active=false;cam.panActive=false;}
      const d=pinchD(e);
      const cx=(e.touches[0].clientX+e.touches[1].clientX)/2;
      const cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      // Stylus-only: 2-finger navigate respects gesture swap (pinch-zoom always works)
      if(stylusOnly){
        if(_twoFingerLock==='none'){
          const pinchDelta=Math.abs(d-_twoFingerStartD);
          const moveDelta=Math.hypot(cx-_twoFingerStartCX,cy-_twoFingerStartCY);
          if(pinchDelta>8)_twoFingerLock='zoom';
          else if(moveDelta>8){
            _twoFingerLock='navigate';
            // Arm navigate based on gesture swap: orbit → 2F=pan, pan → 2F=orbit
            if(twoFingerMode==='orbit'){
              if(!cam.panActive){cam.panActive=true;cam._panPrevX=cx;cam._panPrevY=cy;}
            } else {
              if(!cam.active){cam.active=true;cam.sx=cx;cam.sy=cy;cam.st=cam.theta;cam.sp=cam.phi;}
            }
          }
        }
        if(_twoFingerLock==='zoom'||_twoFingerLock==='none'){
          if(lastPD!==null){
            const delta=lastPD-d;
            var midXs=cx-_cachedRect.left,midYs=cy-_cachedRect.top;
            var wBs=panUnproject(midXs,midYs).clone();
            if(useOrtho){orthoZoom=Math.max(1,Math.min(50,orthoZoom+delta*.04));syncOrtho();updCam();var wAs=panUnproject(midXs,midYs);cam.target.add(_puTmp.subVectors(wBs,wAs));}
            else{var oldRs=cam.radius;cam.radius=Math.max(1,Math.min(40,cam.radius+delta*.04));var zFs=1-(cam.radius/Math.max(0.001,oldRs));cam.target.addScaledVector(_puTmp.subVectors(wBs,cam.target),zFs*0.35);}
            updCam();
          }
        }
        if(_twoFingerLock==='navigate'){
          if(twoFingerMode==='orbit'&&cam.panActive)doPan(null,cx,cy);
          else if(twoFingerMode==='pan'&&cam.active){cam.theta=cam.st+(cx-cam.sx)*.013;cam.phi=Math.max(.05,Math.min(Math.PI-.05,cam.sp-(cy-cam.sy)*.013));updCam();}
        }
        lastPD=d;
      } else {
      // Determine gesture lock if not yet set (threshold: 8px)
      if(_twoFingerLock==='none'){
        const pinchDelta=Math.abs(d-_twoFingerStartD);
        const moveDelta=Math.hypot(cx-_twoFingerStartCX,cy-_twoFingerStartCY);
        if(pinchDelta>8)_twoFingerLock='zoom';
        else if(moveDelta>8){
          _twoFingerLock='navigate';
          // Arm orbit/pan origin now — lazily, only once the lock is decided
          if(twoFingerMode==='orbit'){cam.active=true;cam.sx=cx;cam.sy=cy;cam.st=cam.theta;cam.sp=cam.phi;}
          else{cam.panActive=true;cam._panPrevX=cx;cam._panPrevY=cy;}
        }
      }
      if(_twoFingerLock==='zoom'||_twoFingerLock==='none'){
        // Only apply zoom
        if(lastPD!==null){
          const delta=lastPD-d;
          var midX=cx-_cachedRect.left, midY=cy-_cachedRect.top;
          var worldBefore2=panUnproject(midX,midY).clone();
          if(useOrtho){
            orthoZoom=Math.max(1,Math.min(50,orthoZoom+delta*.04));
            syncOrtho();updCam();
            var worldAfter2=panUnproject(midX,midY);
            cam.target.add(_puTmp.subVectors(worldBefore2,worldAfter2));
          } else {
            var oldR2=cam.radius;
            cam.radius=Math.max(1,Math.min(40,cam.radius+delta*.04));
            var zoomFrac2=1-(cam.radius/Math.max(0.001,oldR2));
            cam.target.addScaledVector(_puTmp.subVectors(worldBefore2,cam.target),zoomFrac2*0.35);
          }
          updCam();
        }
      }
      if(_twoFingerLock==='navigate'){
        // Only apply orbit or pan
        if(twoFingerMode==='orbit'&&cam.active){cam.theta=cam.st+(cx-cam.sx)*.013;cam.phi=Math.max(.05,Math.min(Math.PI-.05,cam.sp-(cy-cam.sy)*.013));updCam();}
        else if(twoFingerMode==='pan'&&cam.panActive)doPan(null,cx,cy);
      }
      lastPD=d;
      }
    }else if(e.touches.length===3){
      if(threeFingerPan){const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3,my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;doPan(null,mx,my);}
      else if(cam.active){const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3,my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;cam.theta=cam.st+(mx-cam.sx)*.013;cam.phi=Math.max(.05,Math.min(Math.PI-.05,cam.sp-(my-cam.sy)*.013));updCam();}
    }
    return;
  }
  if(mode==='draw'&&!isDrawing&&!cam.active&&!cam.panActive){
    // Only raycast hover when pointer is actually over the canvas, not UI elements above it
    var _hr=_cachedRect;
    if(p.x>=_hr.left&&p.x<=_hr.right&&p.y>=_hr.top&&p.y<=_hr.bottom){
      setSurfHover(checkHover(p.x,p.y));
    }
  }
  if(cam.panActive){doPan(e);return;}
  if(cam.active){doOrbit(e);return;}
  if((mode==='erase')&&(e.buttons||_touchDragMode==='erase')){tryErase(p.x,p.y);return;}
  if(mode==='select'&&(e.buttons||_touchDragMode==='select')&&!cam.active&&!cam.panActive){
    var ds=findNearestStroke(p.x,p.y);
    if(ds){
      var dsIdx=selectedStrokes.indexOf(ds);
      if(_dragSelectMode==='add'&&dsIdx===-1){
        selectedStrokes.push(ds);
        updateSelHighlights();
        positionStrokeGizmo();
        _showSgizmo();
        if(window._sgGcDraw)window._sgGcDraw();
        if(window._syncSgControls)window._syncSgControls();
      } else if(_dragSelectMode==='remove'&&dsIdx>-1){
        selectedStrokes.splice(dsIdx,1);
        updateSelHighlights();
        if(selectedStrokes.length===0)_hideSgizmo();
        if(window._sgGcDraw)window._sgGcDraw();
      }
    }
    return;
  }
  if(isDrawing&&mode==='draw'){
    var raw=s2w(p.x,p.y);if(!raw)return;
    if(window._rulerSnapPt) raw = window._rulerSnapPt(raw, p.x, p.y) || raw;
    if(!smoothingOn){
      // RAW mode (v14.2): bypass lazyPos entirely — push every point as-is.
      // Gate lowered .003 → .001 so micro-wiggles on slow/precise strokes survive.
      const last=smoothPts[smoothPts.length-1];
      if(last&&raw.distanceTo(last)>.001){smoothPts.push(raw.clone());rawPts.push(raw.clone());velHistory.push(raw.distanceTo(last));updPrev(smoothPts);}
    } else {
      // SMOOTH mode: adaptive lazy — reduce smoothing factor for tight/small strokes
      // AND for fast strokes (large step per event) so preview keeps up with finger.
      if(!lazyPos)lazyPos=raw.clone();
      var effectiveLazy=LAZY_ON;
      var _step=raw.distanceTo(smoothPts[smoothPts.length-1]||raw);
      if(smoothPts.length>2){
        var _p0=smoothPts[smoothPts.length-3],_p1=smoothPts[smoothPts.length-2],_p2=smoothPts[smoothPts.length-1];
        var _d1=new THREE.Vector3().subVectors(_p1,_p0).normalize();
        var _d2=new THREE.Vector3().subVectors(_p2,_p1).normalize();
        var _curve=1-Math.max(0,_d1.dot(_d2));
        var _tightness=Math.min(1,_curve*2+(_step<0.04?0.5:0));
        effectiveLazy=LAZY_ON+(1.0-LAZY_ON)*(_tightness*.72);
      }
      // Fast-stroke boost: if pointer moved > 0.12 units since last sample, the
      // finger is moving quickly — increase lazy toward 1.0 so preview doesn't
      // fall behind. At step=0.30 we're effectively raw. Prevents the "writing
      // fast stroke not keeping up" feeling.
      if(_step>0.12){
        var speedBoost=Math.min(1,(_step-0.12)/0.18);  // 0 at step=0.12, 1 at step=0.30+
        effectiveLazy=effectiveLazy+(1.0-effectiveLazy)*speedBoost;
      }
      lazyPos.lerp(raw,effectiveLazy);
      const last=smoothPts[smoothPts.length-1];
      if(last&&lazyPos.distanceTo(last)>.009){smoothPts.push(lazyPos.clone());rawPts.push(raw.clone());velHistory.push(lazyPos.distanceTo(last));updPrev(smoothPts);}
    }
  }
}
function onUp(e){
  // ── FPS mode: only intercept if a look/walk gesture was actually active —
  // otherwise fall through so a 1-finger draw stroke still finalizes normally. ──
  if(_fpsMode&&(_fpsLookActive||_fpsMoveActive)){
    _fpsLookEnd();_fpsMoveEnd();
    if(e&&e.touches&&e.touches.length===2){
      const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      _fpsLookStart(cx,cy);
      return;
    }
    if(e&&e.touches&&e.touches.length===3){
      const mx=(e.touches[0].clientX+e.touches[1].clientX+e.touches[2].clientX)/3;
      const my=(e.touches[0].clientY+e.touches[1].clientY+e.touches[2].clientY)/3;
      _fpsMoveStart(mx,my);
      return;
    }
    return; // 1 or 0 fingers left — gesture cleanly ended, nothing to finalize
  }
  // Step-down: if fingers remain on screen, re-anchor the continuing gesture
  // instead of nuking all state. Classic case: lifting one finger of a 3-finger
  // pan should leave a 2-finger gesture active, not cancel everything.
  if(e&&e.touches&&e.touches.length>0){
    var remaining=e.touches.length;
    if(remaining===2){
      // Re-anchor for 2-finger zoom/navigate
      const d=pinchD(e);
      lastPD=d;_twoFingerLock='none';_twoFingerStartD=d;
      const cx=(e.touches[0].clientX+e.touches[1].clientX)/2,cy=(e.touches[0].clientY+e.touches[1].clientY)/2;
      _twoFingerStartCX=cx;_twoFingerStartCY=cy;
      threeFingerPan=false;tf3Anchor=null;
      // Seed incremental pan prev position for the continuing gesture
      cam._panPrevX=cx;cam._panPrevY=cy;
      // Carry camera pose forward so navigate branch has a valid origin
      cam.active=false;cam.panActive=false;
      return;
    }
    if(remaining===1){
      // Down to 1 finger — end multi-touch navigation but don't re-arm drawing
      // (user didn't start with a single-finger touch; don't interpret mid-gesture leftover as a draw)
      lastPD=null;_twoFingerLock='none';threeFingerPan=false;tf3Anchor=null;
      cam.active=false;cam.panActive=false;
      _touchDragMode=null;_dragSelectMode=null;
      return;
    }
    // 3+ remaining: rarely hit; let the next touchmove re-anchor
    lastPD=null;_twoFingerLock='none';
    return;
  }
  const wasOrbit=cam.active,wasPan=cam.panActive,wasDraw=isDrawing;
  resetGesture();
  if(wasDraw&&!wasOrbit&&!wasPan){
    isDrawing=false;_drawTouchId=null;
    // In smooth mode: flush the true last raw position so the stroke ends where
    // the user lifted — lazy smoothing lags behind, causing end hooks on curves.
    if(smoothingOn&&rawPts.length>0&&smoothPts.length>0){
      var _lastRaw=rawPts[rawPts.length-1];
      var _lastSmooth=smoothPts[smoothPts.length-1];
      if(_lastRaw.distanceTo(_lastSmooth)>.003){smoothPts.push(_lastRaw.clone());}
    }
    finStroke();
  }
  else if(wasDraw){isDrawing=false;_drawTouchId=null;rawPts=[];smoothPts=[];velHistory=[];lazyPos=null;prevLine.visible=false;_prevGeo.setDrawRange(0,0);}
  if(window._rulerStrokeEnd) window._rulerStrokeEnd();
  // Pan/orbit modes are now sticky — user must manually switch back via buttons or keyboard
}
renderer.domElement.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('contextmenu',function(e){e.preventDefault();});
document.addEventListener('selectstart',function(e){if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;e.preventDefault();});

// ── Unified pointer input routing ─────────────────────────────────
// Pointer Events carry pointerType ('mouse'|'touch'|'pen') so we can
// distinguish stylus from finger for the STYLUS mode toggle.
// Strategy:
//   pen   → routed through pointerdown/move/up directly into onDown/onMove/onUp.
//            Touch events fired by the same pen contact are suppressed via _penActive.
//   touch → routed through touchstart/move/end as before (multi-touch needs e.touches).
//   mouse → routed through mousedown/move/up as before, with synthetic-mouse guard.
// touch-action:none on the canvas is required for pointer events to fire on Android.
renderer.domElement.style.touchAction='none';

// ── iPad Apple Pencil fix: capture-phase preventDefault on stylus touches ──
// iPadOS fires touch events for Apple Pencil contacts. Without preventDefault,
// iPadOS can claim the gesture for system use (scroll, swipe) and suppress
// subsequent events. This must fire in capture phase, BEFORE any other handler
// (including the ruler's document-level capture listeners), so we register on
// the canvas element with capture:true. touchType='stylus' is iPad-only;
// Android doesn't set it, so this is a no-op on other platforms.
renderer.domElement.addEventListener('touchstart',function(e){
  if(e.touches){for(var i=0;i<e.touches.length;i++){if(e.touches[i].touchType==='stylus'){e.preventDefault();return;}}}
},{capture:true,passive:false});
renderer.domElement.addEventListener('touchmove',function(e){
  if(e.touches){for(var i=0;i<e.touches.length;i++){if(e.touches[i].touchType==='stylus'){e.preventDefault();return;}}}
},{capture:true,passive:false});

// _penActive: true while a pen pointer is in contact, used to suppress
// the redundant touch events that Android also fires for stylus contacts.
var _penActive=false;

// ── Double-tap stylus removed — barrel button is the only toggle mechanism ──

renderer.domElement.addEventListener('pointerdown',function(e){
  if(e.pointerType!=='pen')return;
  e.preventDefault();
  _penActive=true;
  try{renderer.domElement.setPointerCapture(e.pointerId);}catch(ex){}

  // Barrel / side button on Android stylus (e.button=2 or 5) toggles draw↔erase
  // Some styli report button=0 but buttons=2 or buttons=32; also check for eraser tip (button=5)
  var _isBarrel=e.button!==0||(e.button===0&&e.buttons>1);
  if(_isBarrel){
    var newMode2=(mode==='draw')?'erase':(mode==='erase'?'draw':'draw');
    setMode(newMode2);
    toast(newMode2==='draw'?'Pen':'Eraser');
    _penActive=false;
    try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(ex){}
    return;
  }

  onDown(e);
},{passive:false});

renderer.domElement.addEventListener('pointermove',function(e){
  if(e.pointerType==='pen'){
    // Prevent iPadOS from stealing pen contacts mid-stroke
    e.preventDefault();
    if(_penActive&&e.buttons>0){
      onMove(e);
      // Also feed hover preview for pens in select/erase mode — many Android
      // styli lack hover-above-screen, so this is the only pointermove they get.
      if(mode==='select'||mode==='erase'){
        _hoverPending={pointerType:e.pointerType,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY};
        if(_hoverRafId==null)_hoverRafId=requestAnimationFrame(_runHover);
      }
    } else {
      // Pen hovering (buttons=0) — feed hover preview
      _hoverPending={pointerType:e.pointerType,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY};
      if(_hoverRafId==null)_hoverRafId=requestAnimationFrame(_runHover);
    }
    return;
  }
  // mouse hover preview
  if(e.pointerType==='mouse'){
    _hoverPending={pointerType:e.pointerType,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY};
    if(_hoverRafId==null)_hoverRafId=requestAnimationFrame(_runHover);
  }
},{passive:false});

renderer.domElement.addEventListener('pointerup',function(e){
  if(e.pointerType!=='pen')return;
  _penActive=false;
  try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(ex){}
  onUp(e);
});

renderer.domElement.addEventListener('pointercancel',function(e){
  if(e.pointerType!=='pen')return;
  _penActive=false;
  try{renderer.domElement.releasePointerCapture(e.pointerId);}catch(ex){}
  cancelDraw();resetGesture();
});

renderer.domElement.addEventListener('pointerover',function(e){
  if(e.pointerType==='touch')return;
  _hoverPending={pointerType:e.pointerType,buttons:e.buttons,clientX:e.clientX,clientY:e.clientY};
  if(_hoverRafId==null)_hoverRafId=requestAnimationFrame(_runHover);
});

renderer.domElement.addEventListener('pointerleave',function(e){
  if(e.pointerType!=='touch')setHoverStroke(null);
});

// ── Hover preview rAF throttle (shared by pen + mouse pointermove above) ──
// rAF throttle — coalesce high-frequency pointermove events into one
// hit-test per animation frame. findNearestStroke is O(strokes × points)
// and was being called at pointer event rate (~120Hz on stylus).
var _hoverPending=null,_hoverRafId=null;
function _runHover(){
  _hoverRafId=null;
  var e=_hoverPending;_hoverPending=null;
  if(!e)return;
  if(e.pointerType==='touch')return;
  var inSelect=mode==='select'&&!cam.active&&!cam.panActive;
  var inErase=mode==='erase'&&!cam.active&&!cam.panActive;
  if((inSelect||inErase)&&(e.buttons===0||(e.pointerType==='pen'&&!isDrawing))){
    setHoverStroke(findNearestStroke(e.clientX,e.clientY));
  } else if(_hoverStroke){
    setHoverStroke(null);
  }
}

// ── Touch events (finger multi-touch, and stylus on devices that don't
//    report pointerType='pen'). Suppressed while a pen pointer is active
//    to avoid double-firing on devices that send both.
renderer.domElement.addEventListener('touchstart',function(e){
  if(_penActive)return; // pen is handled via pointer events
  lastTouchTime=Date.now();onDown(e);
},{passive:false});
renderer.domElement.addEventListener('touchmove',function(e){
  if(_penActive)return;
  lastTouchTime=Date.now();onMove(e);
},{passive:false});
renderer.domElement.addEventListener('touchend',function(e){
  if(_penActive)return;
  lastTouchTime=Date.now();onUp(e);
});
renderer.domElement.addEventListener('touchcancel',function(e){
  if(_penActive)return;
  lastTouchTime=Date.now();cancelDraw();resetGesture();_fpsLookEnd();_fpsMoveEnd();
});

// ── Mouse events (desktop, guarded against synthetic mouse from touch) ──
function isSyntheticMouse(){return Date.now()-lastTouchTime<500;}
renderer.domElement.addEventListener('mousedown',e=>{if(!isSyntheticMouse())onDown(e);});
renderer.domElement.addEventListener('mousemove',e=>{if(!isSyntheticMouse())onMove(e);});
renderer.domElement.addEventListener('mouseup',  e=>{if(!isSyntheticMouse())onUp(e);});
renderer.domElement.addEventListener('mouseleave',function(){if(!isSyntheticMouse())setSurfHover(false);});
renderer.domElement.addEventListener('wheel',e=>{
  e.preventDefault();
  if(e.ctrlKey) return;
  if(_fpsMode){cam.target.z-=e.deltaY*0.003;updCam();return;}
  var mx=e.clientX, my=e.clientY;
  // World point under cursor before zoom (used to re-anchor target)
  var worldBefore=panUnproject(mx-_cachedRect.left, my-_cachedRect.top).clone();
  if(useOrtho){
    orthoZoom=Math.max(1,Math.min(50,orthoZoom+e.deltaY*.025));
    syncOrtho();updCam();
    // Re-anchor: shift target so worldBefore stays under cursor
    var worldAfter=panUnproject(mx-_cachedRect.left, my-_cachedRect.top);
    cam.target.add(_puTmp.subVectors(worldBefore,worldAfter));
  } else {
    var oldR=cam.radius;
    cam.radius=Math.max(1,Math.min(40,cam.radius+e.deltaY*.02));
    // Re-anchor toward cursor: lerp target toward worldBefore by zoom fraction
    var zoomFrac=1-(cam.radius/oldR);
    cam.target.addScaledVector(_puTmp.subVectors(worldBefore,cam.target),zoomFrac*0.35);
  }
  updCam();
},{passive:false});

// ── Stylus hover highlight for UI buttons ──
(function(){
  var lastHovered=null;
  document.addEventListener('pointermove',function(e){
    if(e.pointerType!=='pen')return;
    var el=document.elementFromPoint(e.clientX,e.clientY);
    var btn=el?el.closest('.btn,.cyc-btn,.emb,.nsm-btn,.cw,.bprev-btn,.bprev-more,.cyc-pop-item,.bgpop-swatch,.tb-lrow,.fc-hdr-btn,.vp-row,.sp-item'):null;
    if(btn===lastHovered)return;
    if(lastHovered)lastHovered.classList.remove('hover');
    lastHovered=btn;
    if(btn)btn.classList.add('hover');
  },{passive:true});
  document.addEventListener('pointerleave',function(e){
    if(e.pointerType!=='pen')return;
    if(lastHovered){lastHovered.classList.remove('hover');lastHovered=null;}
  },{passive:true});
})();

// ── Mode ─────────────────────────────────────────────────────────
const STXT={draw:'DRAW',erase:'ERASE · click/drag to remove',orbit:'ORBIT · drag to rotate · press R or D to exit',pan:'PAN · drag to pan · press G or D to exit',select:'SELECT · tap a stroke'};
function _getEraseLabel(m){if(m==='erase')return _partialErase?'PARTIAL ERASE · drag to split':'ERASE · click/drag to remove';return STXT[m]||'';}
function setMode(m){
  if(m!=='select'){clearSelection();setHoverStroke(null);}
  else{setHoverStroke(null);}// also clear erase hover when entering select
  if(m==='draw'||m==='erase'||m==='select')prevDrawMode=m;
  mode=m;
  // Toggle all mode buttons: topbar and narrow bar
  // Topbar: pan + orbit only
  ['pan','orbit'].forEach(id=>{const b=document.getElementById('b'+id);if(b)b.classList.toggle('on',m===id);});
  // Sidebar: draw, erase, select
  ['draw','erase','select'].forEach(id=>{const b=document.getElementById('s'+id);if(b)b.classList.toggle('on',m===id);});
  // Narrow: draw, erase, select
  ['draw','erase','select'].forEach(id=>{const pb=document.getElementById('pb-'+id);if(pb)pb.classList.toggle('on',m===id);});
  // Hidden-UI bar (v14.2): draw, erase, select
  ['draw','erase','select'].forEach(id=>{const scx=document.getElementById('scx-'+id);if(scx)scx.classList.toggle('on',m===id);});
  var mdotEl=document.getElementById('mdot');
  var dotColors={erase:'#c0392b',orbit:'#e67e22',pan:'#2a9d8f',select:'#1a9940'};
  mdotEl.style.background=dotColors[m]||_themeInk(1);
  var _stxtLbl=_getEraseLabel(m)||'';
  if(m==='draw')_stxtLbl+=(_fpsMode?' · 2F look · 3F walk':' · 2F orbit · 3F pan');
  else if(_fpsMode)_stxtLbl+=' · FPS';
  document.getElementById('stxt').textContent=_stxtLbl;
  document.body.classList.toggle('erasing',m==='erase');
  document.body.classList.toggle('selecting',m==='select');
  renderer.domElement.style.cursor=m==='draw'?'crosshair':m==='pan'||m==='orbit'?'grab':'default';
  // Sync look button
  if(window._syncLookBtn)window._syncLookBtn();
}


// ── Pages ─────────────────────────────────────────────────────────
