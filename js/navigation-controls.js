// ============================================================
// navigation-controls.js
// Navigation: NavCube (tap-to-align) + FPS mode (touch-gesture look/walk)
// ============================================================
(function(){
  // Axis definitions: world direction, snap config, colour, label
  const AXES=[
    {dir:[1,0,0],  col:'#e03040',lbl:'X', snap:{phi:Math.PI/2,theta:Math.PI},       neg:{phi:Math.PI/2,theta:0}},
    {dir:[-1,0,0], col:'#e03040',lbl:'-X',snap:{phi:Math.PI/2,theta:0},              neg:{phi:Math.PI/2,theta:Math.PI}},
    {dir:[0,1,0],  col:'#22bb55',lbl:'Y', snap:{phi:Math.PI/2,theta:Math.PI/2},     neg:{phi:Math.PI/2,theta:-Math.PI/2}},
    {dir:[0,-1,0], col:'#22bb55',lbl:'-Y',snap:{phi:Math.PI/2,theta:-Math.PI/2},    neg:{phi:Math.PI/2,theta:Math.PI/2}},
    {dir:[0,0,1],  col:'#3377ee',lbl:'Z', snap:{phi:0.001,theta:-Math.PI/2},         neg:{phi:Math.PI-0.001,theta:-Math.PI/2}},
    {dir:[0,0,-1], col:'#3377ee',lbl:'-Z',snap:{phi:Math.PI-0.001,theta:-Math.PI/2}, neg:{phi:0.001,theta:-Math.PI/2}},
  ];
  const LABELS_MAP={
    'X':'RGT','-X':'LFT','Y':'BCK','-Y':'FRT','Z':'TOP','-Z':'BTM'
  };

  function setupNavCube(nc,W,H){
    // ── Tear down previous listeners if this canvas was already set up ──
    if(nc._ncCleanup) nc._ncCleanup();

    const ctx=nc.getContext('2d'),CX=W/2,CY=H/2;
    const ARM=Math.min(W,H)*0.37; // arm length in canvas px
    const DOT=Math.min(W,H)*0.10; // dot radius
    let ncDrag=null,ncLastTap=0,hovAxis=null;

    // Project a 3D world direction vector to 2D canvas coords
    function projectDir(dx,dy,dz){
      const sinPhi=Math.sin(cam.phi),cosPhi=Math.cos(cam.phi);
      const sinTheta=Math.sin(cam.theta),cosTheta=Math.cos(cam.theta);
      const rx=-sinTheta, ry=cosTheta, rz=0;
      const fx=sinPhi*cosTheta,fy=sinPhi*sinTheta,fz=cosPhi;
      const ux=fy*rz-fz*ry, uy=fz*rx-fx*rz, uz=fx*ry-fy*rx;
      const cx2=dx*rx+dy*ry+dz*rz;
      const cy2=dx*ux+dy*uy+dz*uz;
      return{x:CX+cx2*ARM, y:CY-cy2*ARM};
    }

    function hitAxis(mx,my){
      let best=-1,bestD=Infinity;
      AXES.forEach((ax,i)=>{
        const p=projectDir(ax.dir[0],ax.dir[1],ax.dir[2]);
        const d=Math.hypot(mx-p.x,my-p.y);
        if(d<DOT*2.2&&d<bestD){bestD=d;best=i;}
      });
      return best;
    }

    function isAlignedTo(phi,theta){
      var dp=Math.abs(cam.phi-phi),dt=Math.abs(cam.theta-theta);
      while(dt>Math.PI)dt=Math.abs(dt-Math.PI*2);
      return dp<0.08&&dt<0.08;
    }

    function snapTo(axIdx,goOrtho){
      var ax=AXES[axIdx];
      var targetPhi=ax.snap.phi,targetTheta=ax.snap.theta;
      if(isAlignedTo(targetPhi,targetTheta)){
        targetPhi=ax.neg.phi;targetTheta=ax.neg.theta;
      }
      cam.phi=targetPhi;cam.theta=targetTheta;
      updCam();
      if(goOrtho)setOrtho(true);
      else if(useOrtho)setOrtho(false);
      toast(LABELS_MAP[ax.lbl]||ax.lbl);
    }

    function draw(){
      ctx.clearRect(0,0,W,H);
      const projected=AXES.map((ax,i)=>{
        const p=projectDir(ax.dir[0],ax.dir[1],ax.dir[2]);
        const depth=ax.dir[0]*Math.sin(cam.phi)*Math.cos(cam.theta)+
                    ax.dir[1]*Math.sin(cam.phi)*Math.sin(cam.theta)+
                    ax.dir[2]*Math.cos(cam.phi);
        return{ax,i,p,depth};
      }).sort((a,b)=>a.depth-b.depth);

      ctx.save();
      ctx.strokeStyle=_themeInk(.08);ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(CX,CY,Math.min(W,H)/2-1,0,Math.PI*2);ctx.stroke();
      ctx.restore();

      projected.forEach(({ax,i,p,depth})=>{
        const isFront=depth>=-0.01;
        const isHov=hovAxis===i;
        const alpha=isFront?(isHov?1:.85):(isHov?.55:.28);
        const col=ax.col;
        const dotR=DOT*(isFront?1:.7);

        ctx.save();
        ctx.strokeStyle=col;ctx.lineWidth=isFront?2:1.2;ctx.globalAlpha=alpha*0.7;
        ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(CX,CY);ctx.lineTo(p.x,p.y);ctx.stroke();

        ctx.globalAlpha=alpha;
        ctx.fillStyle=isFront?(isHov?col:col):_themeInk(.2);
        ctx.beginPath();ctx.arc(p.x,p.y,dotR,0,Math.PI*2);ctx.fill();
        if(isFront&&isHov){
          ctx.strokeStyle=_themeHilight;ctx.lineWidth=1.2;ctx.globalAlpha=.7;
          ctx.beginPath();ctx.arc(p.x,p.y,dotR,0,Math.PI*2);ctx.stroke();
        }

        if(isFront){
          ctx.globalAlpha=isHov?1:.75;
          ctx.fillStyle=isHov?_themeHilight:col;
          ctx.font=(isHov?'600 ':'')+(dotR>6?'7px':'6px')+' DM Mono,monospace';
          ctx.textAlign='center';ctx.textBaseline='middle';
          ctx.fillText(ax.lbl,p.x,p.y+.5);
        }
        ctx.restore();
      });

      ctx.save();ctx.fillStyle=_themeInk(.25);
      ctx.beginPath();ctx.arc(CX,CY,2.5,0,Math.PI*2);ctx.fill();ctx.restore();
    }

    // ── getPos: map from visual CSS space → canvas logical space ──
    // Handles CSS zoom, transform:scale, and any CSS size ≠ logical size.
    function getPos(e){
      const r=nc.getBoundingClientRect();
      const src=e.touches&&e.touches.length>0?e.touches[0]:e.changedTouches&&e.changedTouches.length>0?e.changedTouches[0]:e;
      const rw=r.width||1, rh=r.height||1;
      return{x:(src.clientX-r.left)*(W/rw), y:(src.clientY-r.top)*(H/rh)};
    }

    var ncHoldTimer=null;

    // ── Named handler functions (removable) ──
    function onMouseDown(e){e.stopPropagation();const p=getPos(e);ncDrag={sx:p.x,sy:p.y,st:cam.theta,sp:cam.phi,moved:false};}
    function onMouseMove(e){
      const p=getPos(e);
      const h=ncDrag?-1:hitAxis(p.x,p.y);
      if(!ncDrag&&h!==hovAxis){hovAxis=h;draw();}
      if(!ncDrag)return;
      const dx=p.x-ncDrag.sx,dy=p.y-ncDrag.sy;
      if(Math.hypot(dx,dy)>4){ncDrag.moved=true;}
      if(ncDrag.moved){cam.theta=ncDrag.st+dx*.022;cam.phi=Math.max(.05,Math.min(Math.PI-.05,ncDrag.sp-dy*.022));updCam();draw();}
    }
    function onMouseUp(e){
      if(!ncDrag)return;
      if(!ncDrag.moved){const p=getPos(e);const h=hitAxis(p.x,p.y);if(h>-1)snapTo(h,false);}
      ncDrag=null;draw();
    }
    function onMouseLeave(){hovAxis=null;ncDrag=null;draw();}
    function onTouchStart(e){
      e.preventDefault();e.stopPropagation();
      const p=getPos(e);
      ncDrag={sx:p.x,sy:p.y,st:cam.theta,sp:cam.phi,moved:false,startT:Date.now()};
      if(ncHoldTimer)clearTimeout(ncHoldTimer);
      ncHoldTimer=setTimeout(function(){
        if(ncDrag&&!ncDrag.moved){
          const pp=getPos(e);const h=hitAxis(pp.x,pp.y);
          if(h>-1){snapTo(h,true);ncDrag.consumed=true;draw();}
        }
        ncHoldTimer=null;
      },400);
    }
    function onTouchMove(e){
      e.preventDefault();e.stopPropagation();
      if(!ncDrag)return;
      const p=getPos(e);const dx=p.x-ncDrag.sx,dy=p.y-ncDrag.sy;
      if(Math.hypot(dx,dy)>4){ncDrag.moved=true;if(ncHoldTimer){clearTimeout(ncHoldTimer);ncHoldTimer=null;}}
      if(ncDrag.moved){cam.theta=ncDrag.st+dx*.022;cam.phi=Math.max(.05,Math.min(Math.PI-.05,ncDrag.sp-dy*.022));updCam();draw();}
    }
    function onTouchEnd(e){
      e.stopPropagation();
      if(ncHoldTimer){clearTimeout(ncHoldTimer);ncHoldTimer=null;}
      if(ncDrag&&!ncDrag.moved&&!ncDrag.consumed){
        const p=getPos(e);const h=hitAxis(p.x,p.y);
        if(h>-1)snapTo(h,false);
      }
      ncDrag=null;draw();
    }

    nc.addEventListener('mousedown',onMouseDown);
    nc.addEventListener('mousemove',onMouseMove);
    nc.addEventListener('mouseup',onMouseUp);
    nc.addEventListener('mouseleave',onMouseLeave);
    nc.addEventListener('touchstart',onTouchStart,{passive:false});
    nc.addEventListener('touchmove',onTouchMove,{passive:false});
    nc.addEventListener('touchend',onTouchEnd);

    // ── Store cleanup function so next setupNavCube call can remove these ──
    nc._ncCleanup=function(){
      if(ncHoldTimer){clearTimeout(ncHoldTimer);ncHoldTimer=null;}
      nc.removeEventListener('mousedown',onMouseDown);
      nc.removeEventListener('mousemove',onMouseMove);
      nc.removeEventListener('mouseup',onMouseUp);
      nc.removeEventListener('mouseleave',onMouseLeave);
      nc.removeEventListener('touchstart',onTouchStart);
      nc.removeEventListener('touchmove',onTouchMove);
      nc.removeEventListener('touchend',onTouchEnd);
    };

    draw();return draw;
  }

  const nc=document.getElementById('navcube');window._ncDraw=setupNavCube(nc,nc.width,nc.height);
  const pnc=document.getElementById('pb-navcube');if(pnc)window._pbNcDraw=setupNavCube(pnc,pnc.width,pnc.height);
  window._pbNcReinit=function(){var c=document.getElementById('pb-navcube');if(c)window._pbNcDraw=setupNavCube(c,c.width,c.height);};
})();

// ================================================================
//  NAV CUBE controls — reset view, zoom buttons, NavCube↔FPS toggle
// ================================================================
(function(){
  // ── Reset view ───────────────────────────────────────────────────
  const CAM_DEFAULT={theta:-Math.PI/2,phi:Math.PI/2,radius:10};
  function resetView(){
    // If in FPS, exit without restoring saved cam (we want full reset)
    if(_fpsMode){
      _fpsMode=false;
      document.body.classList.remove('fps-active');
      _fpsSavedCam=null;
      _disposeFpsPlane();
      surfGroup.visible=true;
      navState=0;
      applyNavToggle();
    }
    cam.theta=CAM_DEFAULT.theta;cam.phi=CAM_DEFAULT.phi;cam.radius=CAM_DEFAULT.radius;
    cam.target.set(0,0,0);updCam();toast('View reset');
  }
  ['nav-reset','pb-nav-reset'].forEach(function(id){
    const b=document.getElementById(id);if(b)b.addEventListener('click',resetView);
  });

  // ── Zoom +/− buttons ─────────────────────────────────────────────
  // Tap = one step (~5%). Hold = continuous zoom via RAF.
  const ZOOM_STEP=0.05; // fraction of current radius per tap
  const ZOOM_HOLD_DELAY=180; // ms before continuous starts
  function applyZoom(dir){
    // dir: +1 = zoom in (reduce radius), -1 = zoom out (increase radius)
    if(useOrtho){
      orthoZoom=Math.max(1,Math.min(50,orthoZoom*(1-dir*ZOOM_STEP)));
      syncOrtho();
    } else {
      cam.radius=Math.max(1,Math.min(40,cam.radius*(1-dir*ZOOM_STEP)));
    }
    updCam();markDirty();
  }
  function setupZoomBtn(inId,outId){
    [
      {id:inId,dir:1},
      {id:outId,dir:-1}
    ].forEach(function(cfg){
      const b=document.getElementById(cfg.id);
      if(!b)return;
      let rafId=null,holdTimer=null;
      function startZoom(e){
        e.preventDefault();e.stopPropagation();
        applyZoom(cfg.dir);
        holdTimer=setTimeout(function(){
          function loop(){applyZoom(cfg.dir);rafId=requestAnimationFrame(loop);}
          rafId=requestAnimationFrame(loop);
        },ZOOM_HOLD_DELAY);
      }
      function stopZoom(){
        clearTimeout(holdTimer);holdTimer=null;
        if(rafId){cancelAnimationFrame(rafId);rafId=null;}
      }
      b.addEventListener('mousedown',startZoom);
      b.addEventListener('touchstart',startZoom,{passive:false});
      b.addEventListener('mouseup',stopZoom);
      b.addEventListener('mouseleave',stopZoom);
      b.addEventListener('touchend',stopZoom);
      b.addEventListener('touchcancel',stopZoom);
    });
  }
  setupZoomBtn('nav-zoom-in','nav-zoom-out');
  setupZoomBtn('pb-nav-zoom-in','pb-nav-zoom-out');


  // Pan joystick removed — panning already happens via direct-canvas touch
  // gestures (2-finger pan / 3-finger pan), so a dedicated widget was redundant.
  // NavCube stays for tap-to-align only.

  // ── Toggle NavCube ↔ FPS ──────────────────────────────────────────
  // navState: 0=NavCube, 2=FPS (state 1 "Joystick" removed — touch gestures
  // handle panning/orbiting directly on canvas, so there's nothing left to
  // cycle to there).
  var navState=0;
  var NAV_LABELS={0:'⬡ NAV',2:'👁 FPS'};

  function _createFpsPlane(){
    if(_fpsPlaneGroup)return;
    _fpsPlaneGroup=new THREE.Group();
    var sz=_fpsPlaneSz;
    // Fill mesh — same style as surfFillMat
    var fillMat=new THREE.MeshBasicMaterial({
      color:_activeSurfTrace(),transparent:true,opacity:0.16,
      side:THREE.DoubleSide,depthWrite:false
    });
    _fpsPlaneFill=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),fillMat);
    _fpsPlaneFill.renderOrder=7;
    _fpsPlaneGroup.add(_fpsPlaneFill);
    // Frosted depth-cue mesh
    var bgHex=scene.background?('#'+scene.background.getHexString()):'#f4f1ea';
    var froMat=new THREE.MeshBasicMaterial({
      color:new THREE.Color(bgHex),
      transparent:true,opacity:_depthOpSteps[_depthOpIdx],
      side:THREE.DoubleSide,depthWrite:false,depthTest:true
    });
    _fpsFrosted=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),froMat);
    _fpsFrosted.renderOrder=5;
    _fpsFrosted.visible=depthCuesOn;
    _fpsPlaneGroup.add(_fpsFrosted);
    // Grid mesh
    var gridMat=new THREE.MeshBasicMaterial({
      color:0xffffff,transparent:true,
      side:THREE.DoubleSide,depthWrite:false,depthTest:true
    });
    if(_surfGridMode>0){gridMat.map=buildSurfGridTex();gridMat.map.repeat.set(sz*2,sz*2);gridMat.map.needsUpdate=true;}
    _fpsFrostedGrid=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),gridMat);
    _fpsFrostedGrid.renderOrder=6;
    _fpsFrostedGrid.visible=depthCuesOn&&_surfGridMode>0;
    _fpsPlaneGroup.add(_fpsFrostedGrid);
    scene.add(_fpsPlaneGroup);
  }

  // Rebuild follow-plane geometries when size changes (avoids full dispose/recreate)
  function _rebuildFpsPlaneGeo(){
    if(!_fpsPlaneGroup)return;
    var sz=_fpsPlaneSz;
    var newGeo=new THREE.PlaneGeometry(sz,sz);
    [_fpsPlaneFill,_fpsFrosted,_fpsFrostedGrid].forEach(function(m){
      if(!m)return;
      if(m.geometry)m.geometry.dispose();
      m.geometry=newGeo.clone();
    });
    newGeo.dispose();
    // Rescale grid texture repeat
    if(_fpsFrostedGrid&&_fpsFrostedGrid.material.map){
      _fpsFrostedGrid.material.map.repeat.set(sz*2,sz*2);
      _fpsFrostedGrid.material.map.needsUpdate=true;
    }
    markDirty();
  }

  function _disposeFpsPlane(){
    if(!_fpsPlaneGroup)return;
    scene.remove(_fpsPlaneGroup);
    _fpsPlaneGroup.children.slice().forEach(function(m){
      if(m.geometry)m.geometry.dispose();
      if(m.material){if(m.material.map)m.material.map.dispose();m.material.dispose();}
    });
    _fpsPlaneGroup=null;_fpsPlaneFill=null;_fpsFrosted=null;_fpsFrostedGrid=null;
  }

  // Apply _fpsSurfMode: 0=NONE 1=FOLLOW 2=SCENE
  function _applyFpsSurfMode(){
    // surfGroup visibility
    surfGroup.visible=(_fpsSurfMode===2);
    // follow-plane group visibility
    if(_fpsPlaneGroup)_fpsPlaneGroup.visible=(_fpsSurfMode===1);
    markDirty();
    // sync button label
    var btn=document.getElementById('fps-plane-toggle');
    var labels=['○ NONE','✦ FOLLOW','⬡ SCENE'];
    if(btn){
      btn.textContent=labels[_fpsSurfMode];
      btn.classList.toggle('on',_fpsSurfMode>0);
    }
    // dist slider: only relevant in FOLLOW mode
    var distWrap=document.getElementById('fps-plane-dist-wrap');
    if(distWrap)distWrap.style.display=(_fpsSurfMode===1)?'flex':'none';
  }
  window._applyFpsSurfMode=_applyFpsSurfMode;

  // Called when depth cues toggle changes — update follow-plane frosted meshes
  window._syncFpsDepth=function(){
    if(!_fpsPlaneGroup)return;
    if(_fpsFrosted)_fpsFrosted.visible=depthCuesOn;
    if(_fpsFrostedGrid)_fpsFrostedGrid.visible=depthCuesOn&&_surfGridMode>0;
    markDirty();
  };

  function enterFps(){
    if(_fpsMode)return;
    // Save radius only for restore reference; we won't snap camera back
    _fpsSavedCam={radius:cam.radius};
    // Compute orbit eye position → set as FPS eye
    var sinP=Math.sin(cam.phi),cosP=Math.cos(cam.phi);
    var sinT=Math.sin(cam.theta),cosT=Math.cos(cam.theta);
    var eyeX=cam.target.x+cam.radius*sinP*cosT;
    var eyeY=cam.target.y+cam.radius*sinP*sinT;
    var eyeZ=cam.target.z+cam.radius*cosP;
    cam.target.set(eyeX,eyeY,eyeZ);
    // Flip look direction: was orbit eye→target, now look toward original target
    cam.theta=cam.theta+Math.PI;
    cam.phi=Math.PI-cam.phi;
    cam.phi=Math.max(0.05,Math.min(Math.PI-0.05,cam.phi));
    _fpsMode=true;
    document.body.classList.add('fps-active');
    _createFpsPlane();
    _fpsSurfMode=2; // default: SCENE
    _applyFpsSurfMode();
    updCam();
    // Re-sync card gizmo visibility — _syncButtons hides it when LCL is on,
    // but in FPS mode we keep it visible for plane positioning
    if(window._syncLclButtons)window._syncLclButtons();
    // Resize control card canvases so look panel gets properly sized
    setTimeout(function(){if(window._fcResizeCanvases)window._fcResizeCanvases();},30);
    var stxtEl=document.getElementById('stxt');
    if(stxtEl)stxtEl.textContent='DRAW · 2F look · 3F walk';
    toast('FPS mode · 2-finger look · 3-finger walk');
  }

  function exitFps(){
    if(!_fpsMode)return;
    // Compute orbit state from current FPS eye+direction (item 1: no view snap)
    var sinP=Math.sin(cam.phi),cosP=Math.cos(cam.phi);
    var sinT=Math.sin(cam.theta),cosT=Math.cos(cam.theta);
    var radius=(_fpsSavedCam&&_fpsSavedCam.radius)||cam.radius||10;
    // Orbit target = eye + forward * radius  (place target in front of eye)
    var fx=sinP*cosT,fy=sinP*sinT,fz=cosP;
    cam.target.set(
      cam.target.x+fx*radius,
      cam.target.y+fy*radius,
      cam.target.z+fz*radius
    );
    // Orbit theta/phi = opposite of FPS (orbit camera is behind the target)
    cam.theta=cam.theta-Math.PI;
    cam.phi=Math.PI-cam.phi;
    cam.phi=Math.max(0.05,Math.min(Math.PI-0.05,cam.phi));
    cam.radius=radius;
    _fpsMode=false;
    _fpsSavedCam=null;
    document.body.classList.remove('fps-active');
    _disposeFpsPlane();
    surfGroup.visible=true; // always restore surface visibility
    updCam();
    // Re-sync card gizmo visibility — LCL may still be on, re-apply hide
    if(window._syncLclButtons)window._syncLclButtons();
    // Resize control card canvases — look panel hidden, nav/gizmo reclaim space
    setTimeout(function(){if(window._fcResizeCanvases)window._fcResizeCanvases();},30);
    if(window._fpsResetTouchGestures)window._fpsResetTouchGestures();
    var stxtEl2=document.getElementById('stxt');
    if(stxtEl2)stxtEl2.textContent='DRAW · 2F orbit · 3F pan';
    toast('Orbit mode');
  }
  window._exitFps=exitFps;
  window._enterFps=enterFps;

  // FPS follow-plane UI wiring
  (function(){
    var toggleBtn=document.getElementById('fps-plane-toggle');
    var distSlider=document.getElementById('fps-plane-dist');
    var sizeSlider=document.getElementById('fps-plane-size');
    if(toggleBtn){
      toggleBtn.addEventListener('click',function(){
        if(!_fpsMode)return;
        // Cycle: SCENE(2) → FOLLOW(1) → NONE(0) → SCENE(2)
        _fpsSurfMode=_fpsSurfMode===2?1:_fpsSurfMode===1?0:2;
        _applyFpsSurfMode();
      });
    }
    if(distSlider){
      distSlider.value=_fpsPlaneDist;
      distSlider.addEventListener('input',function(){
        _fpsPlaneDist=parseFloat(distSlider.value);
        updCam();
      });
    }
    if(sizeSlider){
      sizeSlider.value=_fpsPlaneSz;
      sizeSlider.addEventListener('input',function(){
        _fpsPlaneSz=parseFloat(sizeSlider.value);
        _rebuildFpsPlaneGeo();
      });
    }
  })();

  function applyNavToggle(){
    var isFps=(navState===2);
    var ids=[
      {nc:'navcube',btn:'nav-toggle'},
      {nc:'pb-navcube',btn:'pb-nav-toggle'}
    ];
    ids.forEach(function(g){
      var nc=document.getElementById(g.nc);
      var btn=document.getElementById(g.btn);
      if(nc)nc.style.display=(navState===0)?'block':'none';
      if(btn){
        btn.textContent=NAV_LABELS[navState];
        btn.classList.toggle('on',navState>0);
      }
    });
    if(navState===0){if(window._ncDraw)window._ncDraw();if(window._pbNcDraw)window._pbNcDraw();}
    if(isFps) enterFps();
    else exitFps();
  }

  // Simple 2-way toggle: NavCube ↔ FPS. Panning/orbiting/zooming outside FPS
  // happen directly via touch gestures on canvas, so there's no third state.
  function toggleNav(){navState=(navState===0)?2:0;applyNavToggle();}
  window._applyNavToggle=applyNavToggle;
  window._resetNavState=function(){navState=0;applyNavToggle();};
  var t1=document.getElementById('nav-toggle');if(t1)t1.addEventListener('click',toggleNav);
  var t2=document.getElementById('pb-nav-toggle');if(t2)t2.addEventListener('click',toggleNav);

  // FPS exit button
  var fpsExitBtn=document.getElementById('fps-exit');
  if(fpsExitBtn)fpsExitBtn.addEventListener('click',function(){navState=0;applyNavToggle();});

  applyNavToggle();
})();

// ================================================================
//  FPS NAV CONTROLS — touch gestures, vertical buttons, canvas drag,
//  keyboard WASD/arrows, scroll wheel vertical
//
//  Activated when navState===2 (FPS toggle). All UI is inside
//  #fps-overlay and only receives events when body.fps-active.
//  Navigation is gesture-only (see input-gestures.js): 2-finger drag
//  looks around, 3-finger drag walks — a soft ring fades in under the
//  fingers as feedback ("phantom joystick", no fixed widget on screen).
//  1-finger keeps drawing, same as outside FPS mode.
// ================================================================
(function(){
  // ── Constants ──
  var FPS_MOVE_SPEED=0.012;
  var FPS_MOVE_BOOST=0.028;
  var FPS_VT_SPEED=0.015;
  var FPS_ORBIT_SENS=0.004;
  var FPS_KB_LOOK_RATE=0.015;

  // ── Ground movement — called continuously by the 3-finger touch gesture
  //    in input-gestures.js (nx,ny = walk direction, norm = 0..1 how far the
  //    gesture has been dragged from its anchor) and by keyboard WASD. ──
  function fpsMoveTick(nx,ny,norm){
    if(!_fpsMode)return;
    var sinT=Math.sin(cam.theta),cosT=Math.cos(cam.theta);
    var sinP=Math.sin(cam.phi);
    // Ground-projected forward (XY plane, Z-up)
    var fx=sinP*cosT,fy=sinP*sinT;
    var gfLen=Math.sqrt(fx*fx+fy*fy);
    var gfx,gfy;
    if(gfLen<0.001){gfx=cosT;gfy=sinT;}
    else{gfx=fx/gfLen;gfy=fy/gfLen;}
    // Ground right: perpendicular on XY plane
    var grx=gfy,gry=-gfx;
    // Acceleration curve
    var curved=norm*norm;
    var speed=FPS_MOVE_SPEED+curved*FPS_MOVE_BOOST;
    // drag up (ny<0) → forward, drag right (nx>0) → strafe right
    cam.target.x+=(-ny*gfx+nx*grx)*speed;
    cam.target.y+=(-ny*gfy+nx*gry)*speed;
    updCam();
  }
  window._fpsMoveTick=fpsMoveTick;

  // ── Soft "phantom joystick" ring — appears under the 3 fingers while
  //    walking, fades on release. Purely visual feedback; nothing is drawn
  //    on screen while idle, unlike a fixed joystick widget. ──
  var _fpsHintEl=null,_fpsHintKnob=null;
  function _fpsHintEnsure(){
    if(_fpsHintEl)return;
    var overlay=document.getElementById('fps-overlay');
    if(!overlay)return;
    _fpsHintEl=document.createElement('div');
    _fpsHintEl.id='fps-move-hint';
    _fpsHintEl.innerHTML='<div id="fps-move-hint-ring"></div><div id="fps-move-hint-knob"></div>';
    overlay.appendChild(_fpsHintEl);
    _fpsHintKnob=_fpsHintEl.querySelector('#fps-move-hint-knob');
  }
  window._fpsShowMoveHint=function(cx,cy){
    _fpsHintEnsure();
    if(!_fpsHintEl)return;
    _fpsHintEl.style.left=cx+'px';
    _fpsHintEl.style.top=cy+'px';
    _fpsHintEl.classList.add('show');
    if(_fpsHintKnob)_fpsHintKnob.style.transform='translate(0px,0px)';
  };
  window._fpsUpdateMoveHint=function(dx,dy){
    if(_fpsHintKnob)_fpsHintKnob.style.transform='translate('+dx+'px,'+dy+'px)';
  };
  window._fpsHideMoveHint=function(){
    if(_fpsHintEl)_fpsHintEl.classList.remove('show');
  };

  // ── Vertical buttons — hold to move up/down (kept as simple buttons,
  //    not a joystick — there's no natural touch-drag gesture for "up") ──
  function wireFpsVtBtn(id,dir){
    var btn=document.getElementById(id);
    if(!btn)return;
    var rafId2=null,holdTimer=null,held=false;
    function step(){
      if(!_fpsMode)return;
      cam.target.z+=dir*FPS_VT_SPEED;
      updCam();
      rafId2=requestAnimationFrame(step);
    }
    function onDown(e){
      e.preventDefault();e.stopPropagation();
      if(!_fpsMode)return;
      held=true;btn.classList.add('held');
      cam.target.z+=dir*FPS_VT_SPEED;
      updCam();
      holdTimer=setTimeout(function(){
        if(held)rafId2=requestAnimationFrame(step);
      },150);
    }
    function onUp(e){
      if(e)e.stopPropagation();
      held=false;btn.classList.remove('held');
      clearTimeout(holdTimer);holdTimer=null;
      if(rafId2){cancelAnimationFrame(rafId2);rafId2=null;}
    }
    btn.addEventListener('mousedown',onDown);
    btn.addEventListener('mouseup',onUp);
    btn.addEventListener('mouseleave',onUp);
    btn.addEventListener('touchstart',onDown,{passive:false});
    btn.addEventListener('touchend',onUp);
    btn.addEventListener('touchcancel',onUp);
  }
  wireFpsVtBtn('pb-fps-vt-up',1);
  wireFpsVtBtn('pb-fps-vt-down',-1);

  // ── Canvas look/move gestures ──
  // Touch: 2-finger drag = look, 3-finger drag = walk (see input-gestures.js).
  // Desktop (kept as a fallback, not required): right-click drag orbit
  // (doOrbit has an FPS branch), keyboard WASD move / arrows look.


  // Scroll wheel = vertical movement in FPS (handled in main wheel handler via _fpsMode check)

  // ── Keyboard — WASD move, Arrow look, Q/E vertical ──
  var _fpsKeys={};
  window.addEventListener('keydown',function(e){
    if(!_fpsMode)return;
    if(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')return;
    _fpsKeys[e.key.toLowerCase()]=true;
    if(e.code)_fpsKeys[e.code]=true;
  });
  window.addEventListener('keyup',function(e){
    _fpsKeys[e.key.toLowerCase()]=false;
    if(e.code)_fpsKeys[e.code]=false;
  });

  // FPS keyboard tick — runs every frame
  function fpsTick(){
    requestAnimationFrame(fpsTick);
    if(!_fpsMode)return;
    var moved=false;
    // Movement (WASD)
    var fwd=0,strafe=0;
    if(_fpsKeys['w'])fwd+=1;
    if(_fpsKeys['s'])fwd-=1;
    if(_fpsKeys['d'])strafe+=1;
    if(_fpsKeys['a'])strafe-=1;

    if(fwd!==0||strafe!==0){
      var sinT=Math.sin(cam.theta),cosT=Math.cos(cam.theta);
      var sinP=Math.sin(cam.phi);
      var fx=sinP*cosT,fy=sinP*sinT;
      var gfLen=Math.sqrt(fx*fx+fy*fy);
      var gfx,gfy;
      if(gfLen<0.001){gfx=cosT;gfy=sinT;}
      else{gfx=fx/gfLen;gfy=fy/gfLen;}
      var grx=gfy,gry=-gfx;
      var len=Math.sqrt(fwd*fwd+strafe*strafe);
      var nfwd=fwd/len,nstrafe=strafe/len;
      cam.target.x+=(nfwd*gfx+nstrafe*grx)*FPS_MOVE_SPEED;
      cam.target.y+=(nfwd*gfy+nstrafe*gry)*FPS_MOVE_SPEED;
      moved=true;
    }
    // Vertical (Q up, E down)
    if(_fpsKeys['q']){cam.target.z+=FPS_MOVE_SPEED*0.5;moved=true;}
    if(_fpsKeys['e']){cam.target.z-=FPS_MOVE_SPEED*0.5;moved=true;}
    // Look (arrows)
    if(_fpsKeys['arrowleft']){cam.theta+=FPS_KB_LOOK_RATE;moved=true;}
    if(_fpsKeys['arrowright']){cam.theta-=FPS_KB_LOOK_RATE;moved=true;}
    if(_fpsKeys['arrowup']){cam.phi=Math.max(0.05,cam.phi-FPS_KB_LOOK_RATE);moved=true;}
    if(_fpsKeys['arrowdown']){cam.phi=Math.min(Math.PI-0.05,cam.phi+FPS_KB_LOOK_RATE);moved=true;}

    if(moved)updCam();
  }
  fpsTick();

})();

// ================================================================
//  NARROW CYCLE BUTTONS — plane / surf / axis
//  Tap = cycle to next. Long-press (400ms) = open popover upward.
//  Popover auto-dismisses on selection or outside tap.
// ================================================================
