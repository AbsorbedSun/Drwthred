// ============================================================
// narrow-ui-bindings.js
// Narrow-screen cycle buttons, core UI bindings, hidden-UI toolbar, theme/background pickers, file menu, New Scene reset, brush size/opacity pickers
// ============================================================
(function(){
  const PLANES=['xz','xy','yz'];
  const PLANE_LABELS={xz:'Front',xy:'Top',yz:'Side'};
  const SURFS=['plane','cube','cylinder','sphere','cone','loft','none'];
  const SURF_LABELS={plane:'Pln',cube:'Cube',cylinder:'Cyl',sphere:'Sph',cone:'Cone',loft:'Lft',none:'Off'};
  const AXES=['all','x','y','z'];

  let openPop=null;

  function closeAllPops(){
    ['pop-plane','pop-surf','pop-axis','pop-mode','pop-plane2','pop-axis2','pop-surf2'].forEach(function(id){
      const p=document.getElementById(id);if(p)p.classList.remove('open');
    });
    openPop=null;
  }
  document.addEventListener('click',function(e){
    if(openPop&&!e.target.closest('.cyc-pop')&&!e.target.closest('.cyc-btn'))closeAllPops();
  });

  function positionPop(pop,btn){
    const br=btn.getBoundingClientRect();
    pop.style.bottom=(window.innerHeight-br.top+4)+'px';
    pop.style.left=Math.max(4,Math.min(br.left,window.innerWidth-pop.offsetWidth-4))+'px';
    pop.style.top='auto';
  }

  function openPop2(popId,btn){
    closeAllPops();
    const pop=document.getElementById(popId);if(!pop)return;
    pop.classList.add('open');
    openPop=popId;
    positionPop(pop,btn);
    // Mark current item
    pop.querySelectorAll('.cyc-pop-item').forEach(function(it){it.classList.remove('cur');});
  }

  function makeCycBtn(btnId,popId,getItems,getCur,applyCur,getLabel){
    const btn=document.getElementById(btnId);if(!btn)return;
    let holdTimer=null;
    function onStart(e){
      e.preventDefault();e.stopPropagation();
      holdTimer=setTimeout(function(){
        holdTimer=null;
        openPop2(popId,btn);
      },400);
    }
    function onEnd(e){
      e.stopPropagation();
      if(holdTimer){
        clearTimeout(holdTimer);holdTimer=null;
        // Short tap — cycle to next
        const items=getItems();const cur=getCur();
        const next=items[(items.indexOf(cur)+1)%items.length];
        applyCur(next);
        btn.textContent=getLabel(next);
        closeAllPops();
      }
    }
    btn.addEventListener('mousedown',onStart);
    btn.addEventListener('touchstart',onStart,{passive:false});
    btn.addEventListener('mouseup',onEnd);
    btn.addEventListener('touchend',onEnd);
    btn.addEventListener('mouseleave',function(){if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}});
    btn.addEventListener('touchcancel',function(){if(holdTimer){clearTimeout(holdTimer);holdTimer=null;}});
  }

  // ── Plane cycle ──────────────────────────────────────────────────
  makeCycBtn('pb-cyc-plane','pop-plane',
    function(){return PLANES;},
    function(){return curPlane;},
    function(v){
      curPlane=v;
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===v);});
      if(surfFillMat)surfFillMat.color.setHex(_activeSurfTrace());
      if(surfWireMat)surfWireMat.color.setHex(_activeSurfTrace());
      syncSurf();
      const btn=document.getElementById('pb-cyc-plane');if(btn)btn.textContent=PLANE_LABELS[v]||v.toUpperCase();
    },
    function(v){return PLANE_LABELS[v]||v.toUpperCase();}
  );
  document.querySelectorAll('[data-cyc-plane]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycPlane;
      curPlane=v;
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===v);});
      syncSurf();
      const btn=document.getElementById('pb-cyc-plane');if(btn)btn.textContent=PLANE_LABELS[v]||v.toUpperCase();
      closeAllPops();
    });
  });

  // ── Shared surf type application — handles none/loft/standard ────
  // Exposed on window so bindings outside this IIFE (data-surf buttons) can call it
  function applySurfType(v){
    if(v==='none'){
      // Hide surface entirely — no drawing surface active
      surfType='none';
      surfGroup.visible=false;
      document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.remove('on');});
      var bsurf=document.getElementById('bsurf');if(bsurf)bsurf.classList.remove('on');
      _updateLoftDelBtn();
      markDirty();
      toast('No active plane · drawing disabled');
      return;
    }
    if(v==='loft'){
      // Tap while already on loft with stored geo → clear it
      if(surfType==='loft' && window._loftGeo){
        if(window._clearLoft) window._clearLoft();
        _updateLoftDelBtn();
        return;
      }
      document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.remove('on');});
      if(window._loftGeo){
        // Activate stored loft geometry
        if(window._activateLoft) window._activateLoft();
      } else {
        // No loft built yet — switch to select mode so user can pick strokes
        surfType='loft';
        surfGroup.visible=false;
        var bsurf2=document.getElementById('bsurf');if(bsurf2)bsurf2.classList.remove('on');
        markDirty();
        setMode('select');
        toast('Select 2+ strokes · then tap ⟁ Loft');
      }
      _updateLoftDelBtn();
      return;
    }
    // Standard surf types
    surfType=v;
    surfGroup.visible=true;
    var bsurf3=document.getElementById('bsurf');if(bsurf3)bsurf3.classList.add('on');
    document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.toggle('on',b.dataset.surf===v);});
    buildSurf();
    _updateLoftDelBtn();
  }
  window._applySurfType=applySurfType;

  // Show/hide the topbar "Delete loft" button based on current surface state.
  // Visible only when a loft surface is active.
  function _updateLoftDelBtn(){
    var btn=document.getElementById('bdelloft');
    if(!btn)return;
    var isActiveLoft=(surfType==='loft')&&!!window._loftGeo;
    btn.style.display=isActiveLoft?'':'none';
  }
  window._updateLoftDelBtn=_updateLoftDelBtn;
  // Wire the delete button
  (function(){
    var btn=document.getElementById('bdelloft');
    if(!btn)return;
    btn.addEventListener('click',function(){
      if(window._clearLoft)window._clearLoft();
      _updateLoftDelBtn();
      toast('Loft deleted');
    });
  })();

  // ── Surface type cycle ───────────────────────────────────────────
  makeCycBtn('pb-cyc-surf','pop-surf',
    function(){return SURFS;},
    function(){return surfType;},
    function(v){
      applySurfType(v);
      const btn=document.getElementById('pb-cyc-surf');if(btn)btn.textContent=SURF_LABELS[v]||v;
    },
    function(v){return SURF_LABELS[v]||v;}
  );
  document.querySelectorAll('[data-cyc-surf]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycSurf;
      applySurfType(v);
      const btn=document.getElementById('pb-cyc-surf');if(btn)btn.textContent=SURF_LABELS[v]||v;
      closeAllPops();
    });
  });

  // ── Axis cycle ───────────────────────────────────────────────────
  makeCycBtn('pb-cyc-axis','pop-axis',
    function(){return AXES;},
    function(){return document.getElementById('ga-all')&&document.getElementById('ga-all').classList.contains('on')?'all':['x','y','z'].find(function(a){const b=document.getElementById('ga-'+a);return b&&b.classList.contains('on');})||'all';},
    function(v){
      if(window._setAxisFilter)window._setAxisFilter(v);
      const btn=document.getElementById('pb-cyc-axis');if(btn)btn.textContent=v==='all'?'All':v.toUpperCase();
    },
    function(v){return v==='all'?'All':v.toUpperCase();}
  );
  document.querySelectorAll('[data-cyc-axis]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycAxis;
      if(window._setAxisFilter)window._setAxisFilter(v);
      const btn=document.getElementById('pb-cyc-axis');if(btn)btn.textContent=v==='all'?'All':v.toUpperCase();
      closeAllPops();
    });
  });

  // ── Gizmo panel 4-button cycle row ───────────────────────────────
  // Helper: get current gizmo mode label
  function getGizmoModeLabel(m){return m==='all'?'All':m==='move'?'Mv':m==='rotate'?'Rot':'Sc';}
  function getCurMode(){return window._getGizmoMode?window._getGizmoMode():'all';}

  // Mode button
  makeCycBtn('pb-cyc-mode','pop-mode',
    function(){return['all','move','rotate','scale'];},
    getCurMode,
    function(v){
      if(window._setGizmoMode)window._setGizmoMode(v);
      const btn=document.getElementById('pb-cyc-mode');if(btn)btn.textContent=getGizmoModeLabel(v);
    },
    getGizmoModeLabel
  );
  document.querySelectorAll('[data-cyc-mode]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycMode;
      if(window._setGizmoMode)window._setGizmoMode(v);
      const btn=document.getElementById('pb-cyc-mode');if(btn)btn.textContent=getGizmoModeLabel(v);
      closeAllPops();
    });
  });

  // Plane button (gizmo panel)
  makeCycBtn('pb-cyc-plane2','pop-plane2',
    function(){return PLANES;},
    function(){return curPlane;},
    function(v){
      curPlane=v;
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===v);});
      syncSurf();
      const btn=document.getElementById('pb-cyc-plane2');if(btn)btn.textContent=PLANE_LABELS[v]||v.toUpperCase();
      const sb=document.getElementById('sb-cyc-plane');if(sb)sb.textContent=PLANE_LABELS[v]||v.toUpperCase();
      // sync old cycle bar button if still present
      const b2=document.getElementById('pb-cyc-plane');if(b2)b2.textContent=PLANE_LABELS[v]||v.toUpperCase();
    },
    function(v){return PLANE_LABELS[v]||v.toUpperCase();}
  );
  document.querySelectorAll('[data-cyc-plane2]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycPlane2;
      curPlane=v;
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===v);});
      syncSurf();
      const btn=document.getElementById('pb-cyc-plane2');if(btn)btn.textContent=PLANE_LABELS[v]||v.toUpperCase();
      const sb=document.getElementById('sb-cyc-plane');if(sb)sb.textContent=PLANE_LABELS[v]||v.toUpperCase();
      closeAllPops();
    });
  });

  // Axis button (gizmo panel)
  makeCycBtn('pb-cyc-axis2','pop-axis2',
    function(){return AXES;},
    function(){return document.getElementById('ga-all')&&document.getElementById('ga-all').classList.contains('on')?'all':['x','y','z'].find(function(a){const b=document.getElementById('ga-'+a);return b&&b.classList.contains('on');})||'all';},
    function(v){
      if(window._setAxisFilter)window._setAxisFilter(v);
      const btn=document.getElementById('pb-cyc-axis2');if(btn)btn.textContent=v==='all'?'All':v.toUpperCase();
    },
    function(v){return v==='all'?'All':v.toUpperCase();}
  );
  document.querySelectorAll('[data-cyc-axis2]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycAxis2;
      if(window._setAxisFilter)window._setAxisFilter(v);
      const btn=document.getElementById('pb-cyc-axis2');if(btn)btn.textContent=v==='all'?'All':v.toUpperCase();
      closeAllPops();
    });
  });

  // Surface button (gizmo panel)
  makeCycBtn('pb-cyc-surf2','pop-surf2',
    function(){return SURFS;},
    function(){return surfType;},
    function(v){
      applySurfType(v);
      const btn=document.getElementById('pb-cyc-surf2');if(btn)btn.textContent=SURF_LABELS[v]||v;
      const sb=document.getElementById('sb-cyc-surf');if(sb)sb.textContent=SURF_LABELS[v]||v;
    },
    function(v){return SURF_LABELS[v]||v;}
  );
  document.querySelectorAll('[data-cyc-surf2]').forEach(function(it){
    it.addEventListener('click',function(){
      const v=this.dataset.cycSurf2;
      applySurfType(v);
      const btn=document.getElementById('pb-cyc-surf2');if(btn)btn.textContent=SURF_LABELS[v]||v;
      const sb=document.getElementById('sb-cyc-surf');if(sb)sb.textContent=SURF_LABELS[v]||v;
      closeAllPops();
    });
  });

  // ── Sidebar gizmo 4-button cycle row ─────────────────────────────
  // Mode
  makeCycBtn('sb-cyc-mode','pop-mode',
    function(){return['all','move','rotate','scale'];},
    getCurMode,
    function(v){
      if(window._setGizmoMode)window._setGizmoMode(v);
      const btn=document.getElementById('sb-cyc-mode');if(btn)btn.textContent=getGizmoModeLabel(v);
    },
    getGizmoModeLabel
  );
  // Plane
  makeCycBtn('sb-cyc-plane','pop-plane2',
    function(){return PLANES;},
    function(){return curPlane;},
    function(v){
      curPlane=v;
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===v);});
      syncSurf();
      const btn=document.getElementById('sb-cyc-plane');if(btn)btn.textContent=PLANE_LABELS[v]||v.toUpperCase();
      var b2=document.getElementById('pb-cyc-plane2');if(b2)b2.textContent=PLANE_LABELS[v]||v.toUpperCase();
    },
    function(v){return PLANE_LABELS[v]||v.toUpperCase();}
  );
  // Axis
  makeCycBtn('sb-cyc-axis','pop-axis2',
    function(){return AXES;},
    function(){return document.getElementById('ga-all')&&document.getElementById('ga-all').classList.contains('on')?'all':(['x','y','z'].find(function(a){var b=document.getElementById('ga-'+a);return b&&b.classList.contains('on');})||'all');},
    function(v){
      if(window._setAxisFilter)window._setAxisFilter(v);
      var btn=document.getElementById('sb-cyc-axis');if(btn)btn.textContent=v==='all'?'All':v.toUpperCase();
    },
    function(v){return v==='all'?'All':v.toUpperCase();}
  );
  // Surface type
  makeCycBtn('sb-cyc-surf','pop-surf2',
    function(){return SURFS;},
    function(){return surfType;},
    function(v){
      applySurfType(v);
      var btn=document.getElementById('sb-cyc-surf');if(btn)btn.textContent=SURF_LABELS[v]||v;
      var b2=document.getElementById('pb-cyc-surf2');if(b2)b2.textContent=SURF_LABELS[v]||v;
    },
    function(v){return SURF_LABELS[v]||v;}
  );

  // Keep sidebar surface button in sync when narrow buttons change plane state
  // (plane sync is handled directly in each applyCur callback above)
})();

// ── UI bindings ───────────────────────────────────────────────────
document.getElementById('sdraw').addEventListener('click',function(){setMode('draw');});
document.getElementById('sselect').addEventListener('click',function(){setMode('select');});
document.getElementById('pb-draw').addEventListener('click',function(){setMode('draw');});
document.getElementById('pb-select').addEventListener('click',function(){setMode('select');});

// Erase buttons: tap = setMode('erase'), long-press = toggle partial erase
(function(){
  var LONG_MS=450;
  function _syncEraseVisual(){
    var ids=['serase','pb-erase','scx-erase'];
    for(var i=0;i<ids.length;i++){
      var b=document.getElementById(ids[i]);
      if(b)b.classList.toggle('partial-erase',_partialErase);
    }
  }
  function wireEraseLongPress(id){
    var btn=document.getElementById(id);if(!btn)return;
    var _lpTimer=null,_didLong=false;
    function onStart(e){
      _didLong=false;
      _lpTimer=setTimeout(function(){
        _didLong=true;
        _partialErase=!_partialErase;
        _syncEraseVisual();
        toast(_partialErase?'Partial erase':'Line erase');
        if(mode!=='erase')setMode('erase');
      },LONG_MS);
    }
    function onEnd(e){
      clearTimeout(_lpTimer);
      if(!_didLong){setMode('erase');}
    }
    function onCancel(){clearTimeout(_lpTimer);_didLong=false;}
    btn.addEventListener('pointerdown',onStart);
    btn.addEventListener('pointerup',onEnd);
    btn.addEventListener('pointercancel',onCancel);
    btn.addEventListener('pointerleave',onCancel);
    // Suppress click so it doesn't fire after pointerup
    btn.addEventListener('click',function(e){e.stopImmediatePropagation();e.preventDefault();});
  }
  wireEraseLongPress('serase');
  wireEraseLongPress('pb-erase');
  wireEraseLongPress('scx-erase');
  window._syncEraseVisual=_syncEraseVisual;
})();

document.getElementById('sflat').addEventListener('click',function(){flatBrush=!flatBrush;this.classList.toggle('on',flatBrush);var pb=document.getElementById('pb-flat');if(pb)pb.classList.toggle('on',flatBrush);var scx=document.getElementById('scx-flat');if(scx)scx.classList.toggle('on',flatBrush);toast(flatBrush?'Marker brush':'Round brush');});
document.getElementById('pb-flat').addEventListener('click',()=>document.getElementById('sflat').click());

document.getElementById('ssmooth').addEventListener('click',function(){smoothingOn=!smoothingOn;LAZY=smoothingOn?LAZY_ON:LAZY_OFF;this.classList.toggle('on',smoothingOn);var pb=document.getElementById('pb-smooth');if(pb)pb.classList.toggle('on',smoothingOn);var scx=document.getElementById('scx-smooth');if(scx)scx.classList.toggle('on',smoothingOn);toast(smoothingOn?'Smoothing on':'Raw tracking');});
document.getElementById('pb-smooth').addEventListener('click',()=>document.getElementById('ssmooth').click());

document.getElementById('svel').addEventListener('click',function(){velocityTaper=!velocityTaper;this.classList.toggle('on',velocityTaper);var pb=document.getElementById('pb-vel');if(pb)pb.classList.toggle('on',velocityTaper);var scx=document.getElementById('scx-vel');if(scx)scx.classList.toggle('on',velocityTaper);toast(velocityTaper?'Velocity taper on':'Uniform thickness');});
document.getElementById('pb-vel').addEventListener('click',()=>document.getElementById('svel').click());

// ── Hidden-UI mini-toolbar wiring (v14.2) ───────────────────────────
// Toggle button shows/hides the bar. All tool buttons delegate to existing sidecol handlers.
(function(){
  var tgl=document.getElementById('sc-hidden-toggle');
  var bar=document.getElementById('sc-hidden-bar');
  if(!tgl||!bar)return;
  tgl.addEventListener('click',function(){
    var open=bar.classList.toggle('scx-open');
    tgl.classList.toggle('lit',open);
  });
  // Mode buttons → delegate to sidecol equivalents
  var pairs=[['scx-draw','sdraw'],['scx-select','sselect'],
             ['scx-flat','sflat'],['scx-smooth','ssmooth'],['scx-vel','svel'],
             ['scx-undo','s-undo'],['scx-redo','s-redo'],
             ['sz-trig-scx','sz-trig-sb'],['op-trig-scx','op-trig-sb']];
  pairs.forEach(function(p){
    var src=document.getElementById(p[0]),tgt=document.getElementById(p[1]);
    if(src&&tgt)src.addEventListener('click',function(e){e.stopPropagation();tgt.click();});
  });
  // data-sz / data-op / .cw clicks are already handled by the global querySelectorAll
  // listeners, so no per-button wiring needed — they dispatch directly.
  // When the UI toggles from hidden→shown, auto-close the bar to avoid stale state
  var _mo=new MutationObserver(function(){
    if(!document.body.classList.contains('ui-hidden')){
      bar.classList.remove('scx-open');
      tgl.classList.remove('lit');
    }
  });
  _mo.observe(document.body,{attributes:true,attributeFilter:['class']});
})();

document.getElementById('bundo').addEventListener('click',undo);
document.getElementById('bredo').addEventListener('click',redo);
document.getElementById('pb-undo').addEventListener('click',undo);
document.getElementById('pb-redo').addEventListener('click',redo);
document.getElementById('s-undo').addEventListener('click',undo);
document.getElementById('s-redo').addEventListener('click',redo);
document.getElementById('bclear').addEventListener('click',()=>{if(confirm('Clear all strokes?'))clearAll();});

// Visibility helper functions (called from view-pop and narrow-bar)
function toggleAxis(on){axisLinesOn=on;axisGroup.visible=on;var b=document.getElementById('baxis');if(b)b.classList.toggle('on',on);var pb=document.getElementById('pb-axis');if(pb)pb.classList.toggle('on',on);if(window._syncViewToggle)window._syncViewToggle();markDirty();}

// Depth plane opacity — affects tint mesh only, not grid dots/lines
function cycleDepthOp(){
  _depthOpIdx=(_depthOpIdx+1)%_depthOpSteps.length;
  var op=_depthOpSteps[_depthOpIdx];
  var lbl=_depthOpLabels[_depthOpIdx];
  if(_frostedMat){_frostedMat.opacity=op;_frostedMat.needsUpdate=true;}
  if(_fpsFrosted){_fpsFrosted.material.opacity=op;_fpsFrosted.material.needsUpdate=true;}
  var tb=document.getElementById('bdepth-op');if(tb)tb.textContent='Depth: '+lbl;
  var pb=document.getElementById('pb-depthop');if(pb)pb.textContent=lbl;
  markDirty();toast('Plane '+lbl);
}
document.getElementById('pb-depthop').addEventListener('click',cycleDepthOp);

// Surface grid cycle — DOT → GRD → OFF (outline always stays)
function cycleSurfGrid(){
  _surfGridMode=(_surfGridMode+1)%3;
  var lbl=_surfGridLabels[_surfGridMode];
  var isOn=_surfGridMode>0;
  var tb=document.getElementById('bsurfgrid');if(tb){tb.textContent='Grid: '+lbl;tb.classList.toggle('on',isOn);}
  var pb=document.getElementById('pb-surfgrid');if(pb){pb.textContent=lbl;pb.classList.toggle('on',isOn);}
  applyFrostedGridTex();
  toast('Grid '+lbl);
}
document.getElementById('pb-surfgrid').addEventListener('click',cycleSurfGrid);

function togglePersp(){
  setOrtho(!useOrtho);
}
var _orthoLerp=null;
function setOrtho(on){
  if(on===useOrtho){return;}
  // Cancel any in-progress ortho lerp
  if(_orthoLerp){cancelAnimationFrame(_orthoLerp);_orthoLerp=null;}
  var CAM_FOV_HALF_TAN=Math.tan(27.5*Math.PI/180);
  var dur=400;
  var startT=performance.now();
  if(on){
    // Persp → Ortho: flip immediately, lerp zoom from perspective-matching to target
    useOrtho=true;
    var startZoom=cam.radius*CAM_FOV_HALF_TAN;
    var endZoom=orthoZoom; // current orthoZoom is the target (last saved value)
    orthoZoom=startZoom;
    syncOrtho();
    function stepToOrtho(){
      var t=Math.min(1,(performance.now()-startT)/dur);
      var e=t<1?t*(2-t):1;
      orthoZoom=startZoom+(endZoom-startZoom)*e;
      syncOrtho();updCam();markDirty();
      if(t<1){_orthoLerp=requestAnimationFrame(stepToOrtho);}
      else{_orthoLerp=null;orthoZoom=endZoom;syncOrtho();updCam();}
    }
    _orthoLerp=requestAnimationFrame(stepToOrtho);
  } else {
    // Ortho → Persp: keep ortho, lerp zoom toward persp-matching, flip at end
    var startZoom2=orthoZoom;
    var endZoom2=cam.radius*CAM_FOV_HALF_TAN;
    function stepToPersp(){
      var t=Math.min(1,(performance.now()-startT)/dur);
      var e=t<1?t*(2-t):1;
      orthoZoom=startZoom2+(endZoom2-startZoom2)*e;
      syncOrtho();updCam();markDirty();
      if(t<1){_orthoLerp=requestAnimationFrame(stepToPersp);}
      else{_orthoLerp=null;useOrtho=false;syncOrtho();updCam();}
    }
    _orthoLerp=requestAnimationFrame(stepToPersp);
  }
  var txt=on?'ORTHO':'PERSP';
  ['bpersp','nav-persp','pb-nav-persp'].forEach(function(id){
    var b=document.getElementById(id);
    if(b){b.textContent=txt;b.classList.toggle('on',on);}
  });
}
document.getElementById('nav-persp').addEventListener('click',togglePersp);
document.getElementById('pb-nav-persp').addEventListener('click',togglePersp);

// Narrow-bar delegates — scene toggles
document.getElementById('pb-depth').addEventListener('click',function(){document.getElementById('bdepth').click();});
document.getElementById('pb-surf').addEventListener('click',function(){document.getElementById('bsurf').click();});
document.getElementById('pb-grid').addEventListener('click',function(){document.getElementById('bgrid').click();});
document.getElementById('pb-axis').addEventListener('click',function(){document.getElementById('baxis').click();});
// Narrow-bar delegates — input modes
document.getElementById('pb-gestswap').addEventListener('click',function(){document.getElementById('bgestswap').click();});
document.getElementById('pb-stylus').addEventListener('click',function(){stylusOnly=!stylusOnly;updateStylusLabel();updateGestLabel();toast(stylusOnly?'Stylus mode: pen draws, finger navigates':'Stylus mode off');});
document.getElementById('bstylus').addEventListener('click',function(){stylusOnly=!stylusOnly;updateStylusLabel();updateGestLabel();toast(stylusOnly?'Stylus mode: pen draws, finger navigates':'Stylus mode off');});
// Narrow-bar delegates — actions
document.getElementById('pb-clear').addEventListener('click',function(){document.getElementById('bclear').click();});
document.getElementById('pb-bg').addEventListener('click',function(e){
  e.stopPropagation();
  var pop=document.getElementById('bgpop');
  var isOpen=pop.classList.toggle('open');
  document.getElementById('bbg').classList.toggle('on',isOpen);
  if(isOpen){
    var br=this.getBoundingClientRect();
    var left=Math.max(4,Math.min(br.left,window.innerWidth-180));
    var top=br.top-54;
    if(top<4)top=br.bottom+4;
    pop.style.top=top+'px';pop.style.left=left+'px';
  }
});
document.getElementById('pb-new').addEventListener('click',function(){document.getElementById('bnew').click();});
// Narrow-bar delegates — file operations
document.getElementById('pb-save').addEventListener('click',saveFile);
document.getElementById('pb-load').addEventListener('click',loadFile);
document.getElementById('pb-exp').addEventListener('click',function(e){
  e.stopPropagation();
  var menu=document.getElementById('expmenu');
  var open=menu.classList.toggle('vis');
  if(open){
    var br=this.getBoundingClientRect();
    var mw=140;
    var left=Math.max(4,Math.min(br.left,window.innerWidth-mw-4));
    var top=br.top-150;
    if(top<4)top=br.bottom+4;
    menu.style.top=top+'px';
    menu.style.right='auto';
    menu.style.left=left+'px';
  }
});
document.getElementById('pb-png').addEventListener('click',expPNG);

// Hide UI
document.getElementById('bhide').addEventListener('click',function(){
  const hidden=document.body.classList.toggle('ui-hidden');
  // Swap icon between eye and eye-off
  this.innerHTML=hidden
    ?'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="12" y2="12"/><path d="M5 4.5Q6 4 7 4Q11 4 13 7Q10.5 9.8 7.5 10"/><path d="M1 7Q2.5 4.5 5 3.5"/><circle cx="7" cy="7" r="2" stroke-dasharray="1 2"/></svg>'
    :'<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 7Q3 4 7 4Q11 4 13 7Q11 10 7 10Q3 10 1 7Z"/><circle cx="7" cy="7" r="2"/></svg>';
  // Close strips when hiding UI so canvas is fully clear
  if(hidden){
    document.getElementById('pages').classList.remove('open');
    document.getElementById('views').classList.remove('open','recording-open','pages-also-open');
    document.body.classList.remove('pages-open','views-open');
    document.getElementById('pgbtn').classList.remove('on');
    document.getElementById('vwbtn').classList.remove('on');
    var pbp=document.getElementById('pb-pgbtn');if(pbp)pbp.classList.remove('on');
    var pbv=document.getElementById('pb-vwbtn');if(pbv)pbv.classList.remove('on');
  }
  // Float card: show/hide based on UI state and layout mode
  var _vvp2=window.visualViewport;
  // Touch-first redesign: narrow/floating-panel layout is always active now
  // (see updateLayoutMode in sidecol-floatcard.js), so read that instead of
  // recomputing the old aspect-ratio check independently.
  var isNarrow=document.body.classList.contains('narrow-mode');
  var card=document.getElementById('pb-float-card');
  var fab=document.getElementById('pb-fab');
  if(hidden){
    // UI turning off: show float card in both narrow and tablet mode
    // Undock if currently docked (card must be floating when UI is off)
    if(card&&card.classList.contains('fc-docked-bottom')){
      card.classList.remove('fc-docked-bottom');
      card.style.left=(window._fcLastLeft||8)+'px';
      card.style.top=(window._fcLastTop||52)+'px';
      card.style.width=(window._fcLastW||Math.min(window.innerWidth-16,340))+'px';
      card.style.right='';card.style.bottom='';
      var db=document.getElementById('fc-dock-btn');
      if(db)db.textContent='⊞';
    }
    // In tablet mode: reparent panels into float card now
    // …unless the user has already detached sc-groups — those serve the role
    // of the float card and showing both would duplicate UI.
    if(!isNarrow&&!_scState.detached){
      _fcReparent();
      if(!window._fcEverActivated){window._fcEverActivated=true;}
    }
    if(!window._cardHidden&&!(_scState.detached&&!isNarrow)){
      if(card)card.classList.add('fc-visible');
      if(fab)fab.classList.remove('fab-visible');
    }
    // If wide + ui-hidden + detached: show detached cards (they're already visible
    // unless user hid them) and FAB if they were hidden.
    if(!isNarrow&&_scState.detached){
      applySidecol();
      _updateScFab();
    }
    setTimeout(_fcResizeCanvases,50);
  } else {
    // UI turning on: in tablet mode, hide float card and return panels to sidebar
    if(!isNarrow){
      if(card)card.classList.remove('fc-visible');
      if(fab)fab.classList.remove('fab-visible');
      window._cardHidden=false;
      _fcReturn();
    }
    // In narrow mode, card visibility is already managed by updateLayoutMode/narrow state
  }
  // Sync LCL float position to new ui-hidden state.
  // Docked path never called applySidecol(), so LCL would stay at its old
  // sg-bottom position and overlap the ≡ toggle. Call immediately on hide;
  // defer on show so sidecol layout is restored before measuring sg-bottom.
  if(hidden){positionLclFloat();}else{setTimeout(positionLclFloat,0);}
});

// ── Background color ──────────────────────────────────────────────
var BG_PRESETS={beige:'#f4f1ea',white:'#ffffff',black:'#2a2a2e'};
var _curBgKey='beige';
function setBgColor(hex,key){
  var c=new THREE.Color(hex);
  scene.background=c;
  scene.fog.color=c;
  renderer.setClearColor(c,1);
  BG_COL.set(hex);
  if(_frostedMat)_frostedMat.color.set(hex);
  if(_fpsFrosted&&_fpsFrosted.material)_fpsFrosted.material.color.set(hex);
  document.documentElement.style.setProperty('--bg',hex);
  markDirty();
  // Sync swatch active state — both bgpop and view-pop
  _curBgKey=key||'custom';
  document.querySelectorAll('.bgpop-swatch').forEach(function(sw){sw.classList.remove('on');});
  var pick=document.getElementById('bgpop-pick');if(pick)pick.classList.remove('on');
  var vpPick=document.getElementById('vp-bgpick');if(vpPick)vpPick.classList.remove('on');
  if(key){
    var sw=document.getElementById('bgpop-'+key);if(sw)sw.classList.add('on');
    var vp=document.getElementById('vp-bg-'+key);if(vp)vp.classList.add('on');
  } else {
    if(pick)pick.classList.add('on');
    if(vpPick)vpPick.classList.add('on');
  }
  // Auto-select UI theme based on BG luminance (skip if user chose eink)
  if(_uiTheme!=='eink'){
    var lum=0.299*c.r+0.587*c.g+0.114*c.b;
    if(lum<0.25) setUITheme('dark');
    else if(lum>0.82) setUITheme('light');
    else setUITheme('default');
    // Adapt grid/plane colors to match bg hue
    _syncGridToBg(c);
  }
  // Sync theme selector if exists
  _syncThemeBtns();
}
(function(){
  var btn=document.getElementById('bbg');
  var pop=document.getElementById('bgpop');
  if(!btn||!pop)return;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    var isOpen=pop.classList.toggle('open');
    btn.classList.toggle('on',isOpen);
    if(isOpen){
      var br=btn.getBoundingClientRect();
      var left=Math.max(4,Math.min(br.left,window.innerWidth-180));
      var top=br.bottom+4;
      if(top+50>window.innerHeight)top=br.top-54;
      pop.style.top=top+'px';pop.style.left=left+'px';
    }
  });
  document.getElementById('bgpop-beige').addEventListener('click',function(){setBgColor('#f4f1ea','beige');});
  document.getElementById('bgpop-white').addEventListener('click',function(){setBgColor('#ffffff','white');});
  document.getElementById('bgpop-black').addEventListener('click',function(){setBgColor('#2a2a2e','black');});
  var customInput=document.getElementById('bgpop-custom');
  if(customInput)customInput.addEventListener('input',function(){setBgColor(this.value,null);});
  document.addEventListener('click',function(e){
    if(pop.classList.contains('open')&&!pop.contains(e.target)&&e.target!==btn){
      pop.classList.remove('open');btn.classList.remove('on');
    }
  });
})();

// ── UI Theme buttons wiring ──────────────────────────────────────
function _syncThemeBtns(){
  document.querySelectorAll('.theme-btn').forEach(function(b){
    b.classList.toggle('on',b.getAttribute('data-theme')===_uiTheme);
  });
}
document.querySelectorAll('.theme-btn').forEach(function(b){
  b.addEventListener('click',function(e){
    e.stopPropagation();
    var th=b.getAttribute('data-theme');
    setUITheme(th);
    _syncThemeBtns();
    if(th==='eink'){
      setBgColor('#ffffff','eink');
    }
  });
});

// ── View toggle (tap=all on/off, long-press=popover) ─────────────
(function(){
  var btn=document.getElementById('bview-toggle');
  var arrow=document.getElementById('bview-arrow');
  var pop=document.getElementById('view-pop');
  if(!btn||!pop)return;
  // Track individual saved states for restore
  var _viewSaved={surf:true,grid:true,axis:true,depth:true};
  var _viewAllOn=true;

  function syncToggleIcon(){
    var anyOn=surfGroup.visible||gridH.visible||axisLinesOn||depthCuesOn;
    btn.classList.toggle('on',anyOn);
  }

  function openPop(){
    // Sync .on states with current visibility
    document.getElementById('bsurf').classList.toggle('on',surfGroup.visible);
    document.getElementById('bgrid').classList.toggle('on',gridH.visible);
    document.getElementById('baxis').classList.toggle('on',axisLinesOn);
    document.getElementById('bdepth').classList.toggle('on',depthCuesOn);
    pop.classList.add('open');
    var br=(arrow||btn).getBoundingClientRect();
    pop.style.top=(br.bottom+4)+'px';
    pop.style.left=Math.max(4,Math.min(br.left,window.innerWidth-pop.offsetWidth-4))+'px';
    if(arrow)arrow.classList.add('on');
  }
  function closePop(){pop.classList.remove('open');if(arrow)arrow.classList.remove('on');}

  // Tap eye: toggle all 4 on/off
  function tapToggle(){
    var anyOn=surfGroup.visible||gridH.visible||axisLinesOn||depthCuesOn;
    if(anyOn){
      // Save current states, then turn all off
      _viewSaved.surf=surfGroup.visible;
      _viewSaved.grid=gridH.visible;
      _viewSaved.axis=axisLinesOn;
      _viewSaved.depth=depthCuesOn;
      _viewAllOn=false;
      surfGroup.visible=false;gridH.visible=false;
      axisLinesOn=false;axisGroup.visible=false;
      depthCuesOn=false;
      if(_frostedMesh)_frostedMesh.visible=false;
      if(_frostedGridMesh)_frostedGridMesh.visible=false;
      if(window._syncFpsDepth)window._syncFpsDepth();
    } else {
      // Restore saved states
      surfGroup.visible=_viewSaved.surf;
      gridH.visible=_viewSaved.grid;
      axisLinesOn=_viewSaved.axis;axisGroup.visible=_viewSaved.axis;
      depthCuesOn=_viewSaved.depth;
      if(_frostedMesh)_frostedMesh.visible=depthCuesOn;
      if(_frostedGridMesh)_frostedGridMesh.visible=depthCuesOn&&_surfGridMode>0;
      if(window._syncFpsDepth)window._syncFpsDepth();
      _viewAllOn=true;
    }
    // Sync all buttons
    document.getElementById('bsurf').classList.toggle('on',surfGroup.visible);
    document.getElementById('bgrid').classList.toggle('on',gridH.visible);
    document.getElementById('baxis').classList.toggle('on',axisLinesOn);
    document.getElementById('bdepth').classList.toggle('on',depthCuesOn);
    var pb;
    pb=document.getElementById('pb-surf');if(pb)pb.classList.toggle('on',surfGroup.visible);
    pb=document.getElementById('pb-grid');if(pb)pb.classList.toggle('on',gridH.visible);
    pb=document.getElementById('pb-axis');if(pb)pb.classList.toggle('on',axisLinesOn);
    pb=document.getElementById('pb-depth');if(pb)pb.classList.toggle('on',depthCuesOn);
    syncToggleIcon();
    markDirty();
    toast(anyOn?'View off':'View on');
  }

  // Eye icon tap = toggle all
  btn.addEventListener('click',function(e){e.stopPropagation();tapToggle();});

  // Arrow button = open/close popover
  if(arrow){
    arrow.addEventListener('click',function(e){
      e.stopPropagation();
      if(pop.classList.contains('open')){closePop();}
      else{openPop();}
    });
  }

  // Close popover when tapping canvas (starting a draw/orbit action)
  renderer.domElement.addEventListener('pointerdown',function(){
    if(pop.classList.contains('open'))closePop();
  });

  // Individual toggle clicks inside view-pop
  document.getElementById('bsurf').addEventListener('click',function(e){
    e.stopPropagation();
    surfGroup.visible=!surfGroup.visible;
    this.classList.toggle('on',surfGroup.visible);
    var pb=document.getElementById('pb-surf');if(pb)pb.classList.toggle('on',surfGroup.visible);
    syncToggleIcon();markDirty();
  });
  document.getElementById('bgrid').addEventListener('click',function(e){
    e.stopPropagation();
    gridH.visible=!gridH.visible;
    this.classList.toggle('on',gridH.visible);
    var pb=document.getElementById('pb-grid');if(pb)pb.classList.toggle('on',gridH.visible);
    syncToggleIcon();markDirty();
  });
  document.getElementById('baxis').addEventListener('click',function(e){
    e.stopPropagation();
    toggleAxis(!axisLinesOn);
    syncToggleIcon();
  });
  document.getElementById('bdepth').addEventListener('click',function(e){
    e.stopPropagation();
    depthCuesOn=!depthCuesOn;
    this.classList.toggle('on',depthCuesOn);
    var pb=document.getElementById('pb-depth');if(pb)pb.classList.toggle('on',depthCuesOn);
    if(_frostedMesh)_frostedMesh.visible=depthCuesOn;
    if(_frostedGridMesh)_frostedGridMesh.visible=depthCuesOn&&_surfGridMode>0;
    if(window._syncFpsDepth)window._syncFpsDepth();
    syncToggleIcon();markDirty();
    toast(depthCuesOn?'Depth on':'Depth off');
  });
  document.getElementById('bdepth-op').addEventListener('click',function(e){
    e.stopPropagation();cycleDepthOp();
  });
  document.getElementById('bsurfgrid').addEventListener('click',function(e){
    e.stopPropagation();cycleSurfGrid();
  });
  document.getElementById('bpersp').addEventListener('click',function(e){
    e.stopPropagation();togglePersp();
    this.textContent=useOrtho?'ORTHO':'PERSP';
  });
  document.getElementById('bgestswap').addEventListener('click',function(e){
    e.stopPropagation();
    twoFingerMode=twoFingerMode==='orbit'?'pan':'orbit';
    updateGestLabel();
    if(stylusOnly){
      toast('1-finger = '+(twoFingerMode==='orbit'?'orbit':'pan'));
    } else {
      toast('2-finger = '+(twoFingerMode==='orbit'?'orbit':'pan'));
    }
  });
  // Scale overlay toggle
  document.getElementById('bscaleoverlay').addEventListener('click',function(e){
    e.stopPropagation();
    toggleGraphicScale(!_gscaleOn);
    toast(_gscaleOn?'Scale cage on':'Scale cage off');
  });
  // Scale select — opens scale picker
  document.getElementById('bscaleselect').addEventListener('click',function(e){
    e.stopPropagation();
    openScalePicker(this);
  });
  // View-pop BG swatches
  document.getElementById('vp-bg-beige').addEventListener('click',function(e){e.stopPropagation();setBgColor('#f4f1ea','beige');});
  document.getElementById('vp-bg-white').addEventListener('click',function(e){e.stopPropagation();setBgColor('#ffffff','white');});
  document.getElementById('vp-bg-black').addEventListener('click',function(e){e.stopPropagation();setBgColor('#2a2a2e','black');});
  var vpCustom=document.getElementById('vp-bg-custom');
  if(vpCustom)vpCustom.addEventListener('input',function(e){e.stopPropagation();setBgColor(this.value,null);});

  // Close popover on outside click (but not on view-pop itself or toggle buttons)
  document.addEventListener('click',function(e){
    if(pop.classList.contains('open')&&!pop.contains(e.target)&&e.target!==btn&&e.target!==arrow&&!btn.contains(e.target)&&!(arrow&&arrow.contains(e.target))){
      closePop();
    }
  });
  // Also close view-pop in newScene
  window._closeViewPop=closePop;
  window._syncViewToggle=syncToggleIcon;
})();

// ── Scale Picker popup ───────────────────────────────────────────
(function(){
  var pop=document.getElementById('scale-pop');
  if(!pop)return;
  // Build items — show "1 sq = Xm" for each scale
  var html='<div class="sp-hdr">1 SQUARE =</div>';
  for(var i=0;i<SCALE_LABELS.length;i++){
    var lbl=SCALE_LABELS[i];
    var displayLbl=i===0?'OFF':'1 sq = '+lbl;
    var cls='sp-item'+(i===exportScaleIdx?' active':'');
    html+='<button class="'+cls+'" data-si="'+i+'">'+displayLbl+'</button>';
  }
  pop.innerHTML=html;

  function syncActive(){
    pop.querySelectorAll('.sp-item').forEach(function(b){
      b.classList.toggle('active',parseInt(b.dataset.si)===exportScaleIdx);
    });
    var isOff=SCALE_STEPS[exportScaleIdx]===null;
    var sqLbl=isOff?'OFF':'1 sq = '+SCALE_LABELS[exportScaleIdx];
    // Sync the view-pop label
    var lbl=document.getElementById('bscaleselect');
    if(lbl)lbl.textContent=sqLbl;
    // Sync em-scale in file menu
    var em=document.getElementById('em-scale');
    if(em){
      em.textContent='Scale: '+(isOff?'OFF':SCALE_LABELS[exportScaleIdx]);
      em.style.opacity=isOff?'0.45':'';
    }
  }

  pop.addEventListener('click',function(e){
    var btn=e.target.closest('.sp-item');
    if(!btn)return;
    e.stopPropagation();
    var idx=parseInt(btn.dataset.si);
    exportScaleIdx=idx;
    syncActive();
    buildScaleBar();updateScaleBarLabel();
    if(_gscaleOn)updateScaleCage();
    // Sync hidden bscale
    var bs=document.getElementById('bscale');
    if(bs){var isOff=SCALE_STEPS[idx]===null;bs.textContent=SCALE_LABELS[idx];bs.style.opacity=isOff?'0.45':'';bs.classList.toggle('on',!isOff);}
    toast(SCALE_STEPS[idx]===null?'Scale off':'1 sq = '+SCALE_LABELS[idx]);
    closeScalePicker();
  });

  function closeScalePicker(){pop.classList.remove('open');}

  window.openScalePicker=function(anchor){
    syncActive();
    pop.classList.add('open');
    var br=anchor.getBoundingClientRect();
    // Position to the right of the anchor or below
    var left=br.right+6;
    var top=br.top;
    // If goes off right edge, position below
    if(left+120>window.innerWidth){left=Math.max(4,br.left);top=br.bottom+4;}
    // If goes off bottom, scroll up
    if(top+320>window.innerHeight)top=Math.max(4,window.innerHeight-324);
    pop.style.top=top+'px';
    pop.style.left=left+'px';
  };
  window.closeScalePicker=closeScalePicker;

  // Close on outside click
  document.addEventListener('click',function(e){
    if(pop.classList.contains('open')&&!pop.contains(e.target)){
      closeScalePicker();
    }
  });
  // Close on canvas tap
  renderer.domElement.addEventListener('pointerdown',function(){
    if(pop.classList.contains('open'))closeScalePicker();
  });
})();

// ── Look around button ───────────────────────────────────────────
(function(){
  var btn=document.getElementById('blook');
  if(!btn)return;
  btn.addEventListener('click',function(){
    if(mode==='orbit'){
      // Return to previous draw mode
      setMode(prevDrawMode||'draw');
      btn.classList.remove('on');
    } else {
      // Enter look-around mode (orbit)
      setMode('orbit');
      btn.classList.add('on');
    }
  });
  // Keep look button in sync when mode changes from other sources (keyboard, etc.)
  window._syncLookBtn=function(){
    if(btn)btn.classList.toggle('on',mode==='orbit');
  };
})();

// ── File menu button ─────────────────────────────────────────────
(function(){
  var btn=document.getElementById('bfile');
  if(!btn)return;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    var menu=document.getElementById('expmenu');
    var open=menu.classList.toggle('vis');
    if(open){
      var br=btn.getBoundingClientRect();
      var mw=160;
      var left=Math.max(4,Math.min(br.left,window.innerWidth-mw-4));
      var top=br.bottom+4;
      if(top+300>window.innerHeight)top=br.top-4;
      menu.style.top=top+'px';
      menu.style.right='auto';
      menu.style.left=left+'px';
    }
  });
  // Wire new file menu items
  document.getElementById('em-save').addEventListener('click',function(){document.getElementById('expmenu').classList.remove('vis');saveFile();});
  document.getElementById('em-load').addEventListener('click',function(){document.getElementById('expmenu').classList.remove('vis');loadFile();});
  document.getElementById('em-png').addEventListener('click',function(){document.getElementById('expmenu').classList.remove('vis');expPNG();});
  document.getElementById('em-svg').addEventListener('click',function(){document.getElementById('expmenu').classList.remove('vis');promptExportName('drwthred','.svg',expSVG);});
  var emScale=document.getElementById('em-scale');
  var _emScaleLpTimer=null;
  var _emScaleDidLp=false;
  emScale.addEventListener('pointerdown',function(e){
    _emScaleDidLp=false;
    var self=this;
    _emScaleLpTimer=setTimeout(function(){
      _emScaleDidLp=true;
      document.getElementById('expmenu').classList.remove('vis');
      openScalePicker(self);
    },400);
  });
  emScale.addEventListener('pointerup',function(){clearTimeout(_emScaleLpTimer);});
  emScale.addEventListener('pointercancel',function(){clearTimeout(_emScaleLpTimer);});
  emScale.addEventListener('contextmenu',function(e){e.preventDefault();});
  emScale.addEventListener('click',function(e){
    if(_emScaleDidLp){_emScaleDidLp=false;return;}
    e.stopPropagation();
    exportScaleIdx=(exportScaleIdx+1)%SCALE_STEPS.length;
    var lbl=SCALE_LABELS[exportScaleIdx];
    var isOff=SCALE_STEPS[exportScaleIdx]===null;
    this.textContent='Scale: '+(isOff?'OFF':lbl);
    this.style.opacity=isOff?'0.45':'';
    // Sync hidden bscale element
    var bs=document.getElementById('bscale');
    if(bs){bs.textContent=isOff?'OFF':lbl;bs.style.opacity=isOff?'0.45':'';bs.classList.toggle('on',!isOff);}
    // Sync view-pop label
    var vps=document.getElementById('bscaleselect');
    if(vps)vps.textContent=isOff?'OFF':'1 sq = '+lbl;
    buildScaleBar();updateScaleBarLabel();
    if(_gscaleOn)updateScaleCage();
    toast(isOff?'Scale off':'1 sq = '+lbl);
  });
})();

// ── New Scene ─────────────────────────────────────────────────────
function newScene(){
  // ── Cancel recording if active ──
  if(_recState)stopRecordViews(true);
  // ── Exit FPS mode if active ──
  if(_fpsMode&&window._exitFps)window._exitFps();
  // ── Reset navState to NavCube (fixes stale JOY/FPS label) ──
  if(window._resetNavState)window._resetNavState();
  // ── Exit hidden-UI mode ──
  if(document.body.classList.contains('ui-hidden')){
    document.getElementById('bhide').click();
  }
  // ── Close any open strips ──
  document.getElementById('pages').classList.remove('open');
  document.getElementById('views').classList.remove('open','recording-open','pages-also-open');
  document.body.classList.remove('pages-open','views-open');
  document.getElementById('pgbtn').classList.remove('on');
  document.getElementById('vwbtn').classList.remove('on');
  var _pbp=document.getElementById('pb-pgbtn');if(_pbp)_pbp.classList.remove('on');
  var _pbv=document.getElementById('pb-vwbtn');if(_pbv)_pbv.classList.remove('on');
  var _hvb=document.getElementById('bviews-hidden');if(_hvb)_hvb.classList.remove('on');
  // ── Close any open popovers / menus ──
  document.querySelectorAll('#bgpop,#sz-pop,#op-pop,#layers-pop,#prims-pop,#prim-bar,#view-pop,#scale-pop,#ruler-pop').forEach(function(p){p.classList.remove('open');});
  document.querySelectorAll('.cyc-pop').forEach(function(p){p.classList.remove('open');});
  var _exm=document.getElementById('expmenu');if(_exm)_exm.classList.remove('vis');
  document.getElementById('bbg').classList.remove('on');
  // ── Hide align-to-view slider ──
  if(window._hideGviewSlider)window._hideGviewSlider();
  // ── Reset page/view edit mode ──
  _pgEditMode=false;_pgEditIdx=-1;
  _vwEditMode=false;_vwEditIdx=-1;
  // ── Reset strokes + undo ──
  clearAll();
  _redoStack.length=0;redoStack.length=0;
  // ── Clear primitives ──
  if(window._clearAllPrimitives)window._clearAllPrimitives();
  if(window._closePrimsStrip)window._closePrimsStrip();
  // ── Reset pages ──
  pages.length=0;curPage=0;
  pages.push({strokes:[],thumb:null,views:[],primitives:[]});
  refreshPageStrip();refreshViewStrip();
  // ── Clear loft ──
  if(window._loftGeo){window._loftGeo.dispose();window._loftGeo=null;}
  window._loftCen=null;
  // ── Reset depth / frosted state before buildSurf ──
  depthCuesOn=true;
  document.querySelectorAll('#bdepth,#pb-depth').forEach(function(b){if(b)b.classList.add('on');});
  _depthOpIdx=0;
  var _bdop=document.getElementById('bdepth-op');if(_bdop)_bdop.textContent='Depth: '+_depthOpLabels[0];
  var _pbdop=document.getElementById('pb-depthop');if(_pbdop)_pbdop.textContent=_depthOpLabels[0];
  _surfGridMode=2;
  var _bsg=document.getElementById('bsurfgrid');if(_bsg){_bsg.textContent='Grid: '+_surfGridLabels[2];}
  var _pbsg=document.getElementById('pb-surfgrid');if(_pbsg)_pbsg.textContent=_surfGridLabels[2];
  // ── Reset surface to default plane XZ ──
  surfType='plane';curPlane='xz';
  surfPos.set(0,0,0);surfEuler.set(0,0,0);surfScale=1;surfScaleAxes.set(1,1,1);
  surfGroup.visible=true;
  buildSurf();
  document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.toggle('on',b.dataset.surf==='plane');});
  document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane==='xz');});
  ['pb-cyc-plane','pb-cyc-plane2','sb-cyc-plane'].forEach(function(id){
    var b=document.getElementById(id);if(b)b.textContent='Front';
  });
  ['pb-cyc-surf','pb-cyc-surf2','sb-cyc-surf'].forEach(function(id){
    var b=document.getElementById(id);if(b)b.textContent='Pln';
  });
  var bsurf=document.getElementById('bsurf');if(bsurf)bsurf.classList.add('on');
  // ── Reset grid + axis visibility ──
  gridH.visible=true;
  document.querySelectorAll('#bgrid,#pb-grid').forEach(function(b){if(b)b.classList.add('on');});
  axisLinesOn=true;axisGroup.visible=true;
  document.querySelectorAll('#baxis,#pb-axis').forEach(function(b){if(b)b.classList.add('on');});
  // ── Reset export scale to OFF ──
  exportScaleIdx=0;
  scaleBarGroup.visible=false;_sbMesh.visible=false;
  _gscaleOn=false;_gscaleGroup.visible=false;_gscaleLastIdx=-1;
  var _bso=document.getElementById('bscaleoverlay');if(_bso)_bso.classList.remove('on');
  var _bss=document.getElementById('bscaleselect');if(_bss)_bss.textContent='OFF';
  if(window.closeScalePicker)closeScalePicker();
  var _bscale=document.getElementById('bscale');
  if(_bscale){_bscale.textContent='OFF';_bscale.style.opacity='0.45';_bscale.classList.remove('on');}
  // ── Reset camera ──
  cam.theta=-Math.PI/2;cam.phi=Math.PI/2;cam.radius=10;cam.target.set(0,0,0);
  useOrtho=false;orthoZoom=8;
  document.querySelectorAll('#bpersp,#nav-persp,#pb-nav-persp').forEach(function(b){if(b){b.classList.remove('on');b.textContent='PERSP';}});
  updCam();
  // ── Reset bg color to beige ──
  setBgColor('#f4f1ea','beige');
  // ── Reset mode + brush ──
  setMode('draw');
  if(window._applySize) window._applySize(1);
  if(window._applyOpacity) window._applyOpacity(95);
  // ── Reset brush toggles ──
  flatBrush=false;
  document.querySelectorAll('#sflat,#pb-flat,#scx-flat').forEach(function(b){if(b)b.classList.remove('on');});
  smoothingOn=false;LAZY=LAZY_OFF;
  document.querySelectorAll('#ssmooth,#pb-smooth,#scx-smooth').forEach(function(b){if(b)b.classList.remove('on');});
  velocityTaper=true;
  document.querySelectorAll('#svel,#pb-vel,#scx-vel').forEach(function(b){if(b)b.classList.add('on');});
  // ── Reset color to black ──
  curColor='#000000';
  document.querySelectorAll('.cw').forEach(function(c){c.classList.toggle('on',c.dataset.c==='#000000');});
  var _cpBtn=document.getElementById('ccpick-btn');if(_cpBtn)_cpBtn.style.borderColor='';
  // ── Reset 2-finger gesture mode ──
  twoFingerMode='orbit';
  updateGestLabel();
  // ── Reset snap to ON ──
  if(window._setSnapEnabled)window._setSnapEnabled(true);
  // ── Reset layers ──
  setActiveLayer(1);
  for(var i=0;i<4;i++){layerVisible[i]=true;}
  applyLayerVisibility();
  showMergeLayerRow(false);
  // ── Reset ruler ──
  if(window._rulerToggle&&window._rulerIsOn&&window._rulerIsOn())window._rulerToggle();
  // ── Reset gizmo scale toggles ──
  if(window._resetGcScale)window._resetGcScale();
  if(window._resetSgScaleMode)window._resetSgScaleMode();
  // ── Clear IDB autosave ──
  try{idbSave(JSON.stringify(sceneData()));}catch(e){}
  // ── Sync view toggle + popover labels ──
  if(window._syncViewToggle)window._syncViewToggle();
  var _vpersp=document.getElementById('bpersp');if(_vpersp)_vpersp.textContent='PERSP';
  twoFingerMode='orbit';updateGestLabel();
  var _emsc=document.getElementById('em-scale');if(_emsc){_emsc.textContent='Scale: OFF';_emsc.style.opacity='0.45';}
  toast('New scene');
}
(function(){
  var modal=document.getElementById('new-scene-modal');
  function showModal(){modal.classList.add('vis');}
  function hideModal(){modal.classList.remove('vis');}
  document.getElementById('bnew').addEventListener('click',function(){
    if(strokes.length===0&&pages.length<=1){newScene();return;}
    showModal();
  });
  document.getElementById('nsm-save').addEventListener('click',function(){
    hideModal();saveFileWithName('drwthred',newScene);
  });
  document.getElementById('nsm-discard').addEventListener('click',function(){
    hideModal();newScene();
  });
  document.getElementById('nsm-cancel').addEventListener('click',hideModal);
  modal.addEventListener('click',function(e){if(e.target===modal)hideModal();});
})();
(function(){
  var snmod=document.getElementById('save-name-modal');
  var inp=document.getElementById('save-name-input');
  function hideSnm(){snmod.classList.remove('vis');}
  function confirm(){
    var name=inp.value.trim()||'drwthred';
    var cb=snmod._onComplete;
    snmod._onComplete=null;
    hideSnm();
    _doSaveFile(name);
    if(cb)cb();
  }
  function cancel(){
    snmod._onComplete=null;
    hideSnm();
  }
  document.getElementById('snm-save').addEventListener('click',confirm);
  document.getElementById('snm-cancel').addEventListener('click',cancel);
  snmod.addEventListener('click',function(e){if(e.target===snmod)cancel();});
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'){confirm();}
    if(e.key==='Escape'){cancel();}
  });
})();
// ── Export name modal handler ──
(function(){
  var enmod=document.getElementById('export-name-modal');
  var inp=document.getElementById('export-name-input');
  function hideEnm(){enmod.classList.remove('vis');}
  function confirm(){
    var name=inp.value.trim()||'drwthred';
    var cb=enmod._expCallback;
    enmod._expCallback=null;
    hideEnm();
    if(cb)cb(name);
  }
  function cancel(){
    enmod._expCallback=null;
    hideEnm();
  }
  document.getElementById('enm-export').addEventListener('click',confirm);
  document.getElementById('enm-cancel').addEventListener('click',cancel);
  enmod.addEventListener('click',function(e){if(e.target===enmod)cancel();});
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'){confirm();}
    if(e.key==='Escape'){cancel();}
  });
})();
document.addEventListener('click',()=>document.getElementById('expmenu').classList.remove('vis'));
document.getElementById('expmenu').addEventListener('click',e=>e.stopPropagation());
document.getElementById('exgltf').addEventListener('click',()=>{document.getElementById('expmenu').classList.remove('vis');promptExportName('drwthred','.glb',expGLTF);});
document.getElementById('exobj').addEventListener('click',()=>{document.getElementById('expmenu').classList.remove('vis');promptExportName('drwthred','.obj',expOBJ);});
document.getElementById('exusd').addEventListener('click',()=>{document.getElementById('expmenu').classList.remove('vis');promptExportName('drwthred','.usda',expUSD);});
document.getElementById('exusdz').addEventListener('click',()=>{document.getElementById('expmenu').classList.remove('vis');promptExportName('drwthred','.usdz',expUSDZ);});
document.getElementById('exjson').addEventListener('click',()=>{document.getElementById('expmenu').classList.remove('vis');saveFile();});
document.getElementById('exrecord').addEventListener('click',function(){document.getElementById('expmenu').classList.remove('vis');startRecordViews();});
document.getElementById('vw-rec').addEventListener('click',function(){startRecordViews();});
document.getElementById('rec-stop-btn').addEventListener('click',function(){stopRecordViews(false);});

// Surface / plane
document.querySelectorAll('[data-plane]').forEach(b=>b.addEventListener('click',function(){document.querySelectorAll('[data-plane]').forEach(x=>x.classList.remove('on'));this.classList.add('on');curPlane=this.dataset.plane;if(surfFillMat)surfFillMat.color.setHex(_activeSurfTrace());if(surfWireMat)surfWireMat.color.setHex(_activeSurfTrace());syncSurf();}));
document.querySelectorAll('[data-surf]').forEach(b=>b.addEventListener('click',function(){document.querySelectorAll('[data-surf]').forEach(x=>x.classList.remove('on'));this.classList.add('on');if(window._applySurfType)window._applySurfType(this.dataset.surf);}));

// Colors
document.querySelectorAll('.cw').forEach(sw=>sw.addEventListener('click',function(){
  var col=this.dataset.c;
  // If strokes selected, apply color to selection instead of brush
  if(selectedStrokes.length>0&&window._syncSgControls){
    var sgSw=document.querySelector('#sg-colors .pg-csw[data-sc="'+col+'"]');
    if(sgSw){sgSw.click();}else{var sgCp=document.getElementById('sg-cpick');if(sgCp){sgCp.value=col;sgCp.dispatchEvent(new Event('input'));}}
    if(window._updateGhudSel)window._updateGhudSel();
    return;
  }
  curColor=col;document.querySelectorAll('.cw').forEach(c=>c.classList.toggle('on',c.dataset.c===curColor));document.getElementById('ccpick-btn').style.borderColor='';
}));
document.getElementById('cpick').addEventListener('input',function(){
  var col=this.value;
  if(selectedStrokes.length>0&&window._syncSgControls){
    var sgCp=document.getElementById('sg-cpick');if(sgCp){sgCp.value=col;sgCp.dispatchEvent(new Event('input'));}
    if(window._updateGhudSel)window._updateGhudSel();
    return;
  }
  curColor=col;document.querySelectorAll('.cw').forEach(c=>c.classList.remove('on'));document.getElementById('ccpick-btn').style.borderColor='var(--ink)';
});
// Narrow-bar and hidden-bar custom color pickers — sync with cpick
function _syncAllColorPickers(col){
  document.getElementById('cpick').value=col;
  var pb=document.getElementById('pb-cpick');if(pb)pb.value=col;
  var scx=document.getElementById('scx-cpick');if(scx)scx.value=col;
}
document.getElementById('pb-cpick').addEventListener('input',function(){
  var col=this.value;
  if(selectedStrokes.length>0&&window._syncSgControls){
    var sgCp=document.getElementById('sg-cpick');if(sgCp){sgCp.value=col;sgCp.dispatchEvent(new Event('input'));}
    if(window._updateGhudSel)window._updateGhudSel();
    _syncAllColorPickers(col);
    return;
  }
  curColor=col;document.querySelectorAll('.cw').forEach(function(c){c.classList.remove('on');});
  document.getElementById('ccpick-btn').style.borderColor='var(--ink)';
  _syncAllColorPickers(col);
});
document.getElementById('scx-cpick').addEventListener('input',function(){
  var col=this.value;
  if(selectedStrokes.length>0&&window._syncSgControls){
    var sgCp=document.getElementById('sg-cpick');if(sgCp){sgCp.value=col;sgCp.dispatchEvent(new Event('input'));}
    if(window._updateGhudSel)window._updateGhudSel();
    _syncAllColorPickers(col);
    return;
  }
  curColor=col;document.querySelectorAll('.cw').forEach(function(c){c.classList.remove('on');});
  document.getElementById('ccpick-btn').style.borderColor='var(--ink)';
  _syncAllColorPickers(col);
});

// ── Brush preview canvases + size/opacity pickers ─────────────────
(function(){

  function drawSzCanvas(canvas,sz,color){
    if(!canvas)return;
    var ctx=canvas.getContext('2d');
    var W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    var r=Math.max(1,sz*0.42*Math.min(W,H)/20);
    ctx.beginPath();ctx.arc(W/2,H/2,r,0,Math.PI*2);
    ctx.fillStyle=color||_themeInk(1);ctx.fill();
  }

  function drawOpCanvas(canvas,op100,color){
    if(!canvas)return;
    var ctx=canvas.getContext('2d');
    var W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    var pad=Math.max(2,Math.round(W*0.12));
    ctx.globalAlpha=op100/100;
    ctx.beginPath();ctx.arc(W/2,H/2,W/2-pad,0,Math.PI*2);
    ctx.fillStyle=color||_themeInk(1);ctx.fill();
    ctx.globalAlpha=1;
  }

  function redrawAll(){
    var col=_themeInk(1); // adapts to theme for visibility
    var op=Math.round(brushOp*100);
    drawSzCanvas(document.getElementById('sz-p1'),1,col);
    drawSzCanvas(document.getElementById('sz-p3'),3,col);
    drawSzCanvas(document.getElementById('sz-p6'),6,col);
    drawOpCanvas(document.getElementById('op-p30'),30,col);
    drawOpCanvas(document.getElementById('op-p60'),60,col);
    drawOpCanvas(document.getElementById('op-p95'),95,col);
    drawSzCanvas(document.getElementById('sz-p1-pb'),1,col);
    drawSzCanvas(document.getElementById('sz-p3-pb'),3,col);
    drawSzCanvas(document.getElementById('sz-p6-pb'),6,col);
    drawOpCanvas(document.getElementById('op-p30-pb'),30,col);
    drawOpCanvas(document.getElementById('op-p60-pb'),60,col);
    drawOpCanvas(document.getElementById('op-p95-pb'),95,col);
    drawSzCanvas(document.getElementById('sz-p1-scx'),1,col);
    drawSzCanvas(document.getElementById('sz-p3-scx'),3,col);
    drawSzCanvas(document.getElementById('sz-p6-scx'),6,col);
    drawOpCanvas(document.getElementById('op-p30-scx'),30,col);
    drawOpCanvas(document.getElementById('op-p60-scx'),60,col);
    drawOpCanvas(document.getElementById('op-p95-scx'),95,col);
    drawSzCanvas(document.getElementById('sz-prev-pop'),brushSz,col);
    drawOpCanvas(document.getElementById('op-prev-pop'),op,col);
    document.querySelectorAll('[data-sz]').forEach(function(b){b.classList.toggle('cur',+b.dataset.sz===brushSz);});
    document.querySelectorAll('[data-op]').forEach(function(b){b.classList.toggle('cur',+b.dataset.op===op);});
  }
  window._brushRedraw=redrawAll;

  function applySize(v){
    v=Math.min(20,Math.max(1,+v));
    // If strokes selected, apply to selection instead of brush
    if(selectedStrokes.length>0){
      var sgW=document.getElementById('sg-width');if(sgW){sgW.value=v;sgW.dispatchEvent(new Event('input'));}
      if(window._updateGhudSel)window._updateGhudSel();
      return;
    }
    brushSz=v;
    var sld=document.getElementById('sz-sld');if(sld)sld.value=v;
    redrawAll();
  }
  function applyOpacity(v){
    v=Math.min(100,Math.max(10,+v));
    // If strokes selected, apply to selection instead of brush
    if(selectedStrokes.length>0){
      var sgO=document.getElementById('sg-opacity');if(sgO){sgO.value=v;sgO.dispatchEvent(new Event('input'));}
      if(window._updateGhudSel)window._updateGhudSel();
      return;
    }
    brushOp=v/100;
    var sld=document.getElementById('op-sld');if(sld)sld.value=v;
    redrawAll();
  }
  window._applySize=applySize;
  window._applyOpacity=applyOpacity;

  var openPopEl=null;
  function positionPop(pop,trigger){
    var br=trigger.getBoundingClientRect();
    var ph=pop.offsetHeight||120;
    var top=br.top>ph+12?br.top-ph-8:br.bottom+6;
    var left=Math.max(4,Math.min(br.left,window.innerWidth-pop.offsetWidth-4));
    pop.style.top=top+'px';pop.style.left=left+'px';
  }
  function openPop(pop,trigger){
    if(openPopEl&&openPopEl!==pop)openPopEl.classList.remove('open');
    redrawAll();pop.classList.add('open');openPopEl=pop;positionPop(pop,trigger);
  }
  function closePops(){if(openPopEl){openPopEl.classList.remove('open');openPopEl=null;}}
  document.addEventListener('click',function(e){
    if(openPopEl&&!openPopEl.contains(e.target)&&!e.target.closest('.bprev-more'))closePops();
  });

  document.querySelectorAll('[data-sz]').forEach(function(b){
    b.addEventListener('click',function(e){e.stopPropagation();applySize(+this.dataset.sz);closePops();});
  });
  document.querySelectorAll('[data-op]').forEach(function(b){
    b.addEventListener('click',function(e){e.stopPropagation();applyOpacity(+this.dataset.op);closePops();});
  });

  var szPop=document.getElementById('sz-pop');
  var opPop=document.getElementById('op-pop');
  ['sz-trig-sb','sz-trig-pb'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(e){e.stopPropagation();szPop.classList.contains('open')?closePops():openPop(szPop,this);});
  });
  ['op-trig-sb','op-trig-pb'].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.addEventListener('click',function(e){e.stopPropagation();opPop.classList.contains('open')?closePops():openPop(opPop,this);});
  });

  var szSld=document.getElementById('sz-sld');
  if(szSld)szSld.addEventListener('input',function(){applySize(+this.value);});
  var opSld=document.getElementById('op-sld');
  if(opSld)opSld.addEventListener('input',function(){applyOpacity(+this.value);});

  redrawAll();
})();

// ================================================================
//  SIDECOL — side toggle, scale via #stab (zoom), detach groups, scale dots
// ================================================================

