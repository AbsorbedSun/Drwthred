// ============================================================
// sidecol-floatcard.js
// Side column (detach/redock/scale) and the narrow-mode floating nav+gizmo card
// ============================================================
const stab=document.getElementById('stab');
const sidecol=document.getElementById('sidecol');

// Scale bounds. Cap at 1.0 (v6 baseline) — drag only shrinks.
var SC_MIN=0.7,SC_MAX=1.0;

// Persisted state (schema v11 — detached is now bool; each group has own pos)
var _scState={
  sideOpen:true,
  rside:true, // default to right-edge dock (thumb-reachable, tablet-app style)
  scale:1.0,             // sidecol zoom
  detached:false,        // v11: both groups detach/redock as a unit
  topLeft:40,topTop:80,  // per-group position (v11)
  botLeft:40,botTop:200,
  detachedScale:1.0,
  fcScale:1.0,
  detachedHidden:false,  // v11: user X'd the detached cards; show FAB to bring back
  gizmoFirst:false       // v44: nav↔gizmo swap persisted
};
try{
  var _saved=localStorage.getItem('sk3d_sc');
  if(_saved){
    var _p=JSON.parse(_saved);
    function _clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}
    if(typeof _p.scale==='number')_scState.scale=_clamp(_p.scale,SC_MIN,SC_MAX);
    if(typeof _p.detachedScale==='number')_scState.detachedScale=_clamp(_p.detachedScale,SC_MIN,SC_MAX);
    if(typeof _p.fcScale==='number')_scState.fcScale=_clamp(_p.fcScale,SC_MIN,SC_MAX);
    if(typeof _p.rside==='boolean')_scState.rside=_p.rside;
    if(typeof _p.sideOpen==='boolean')_scState.sideOpen=_p.sideOpen;
    // v11 schema
    if(typeof _p.detached==='boolean')_scState.detached=_p.detached;
    else if(_p.detached==='top'||_p.detached==='bottom')_scState.detached=true;  // v10 migration
    if(typeof _p.topLeft==='number')_scState.topLeft=_p.topLeft;
    if(typeof _p.topTop==='number')_scState.topTop=Math.max(52,_p.topTop);
    if(typeof _p.botLeft==='number')_scState.botLeft=_p.botLeft;
    if(typeof _p.botTop==='number')_scState.botTop=Math.max(52,_p.botTop);
    if(typeof _p.detachedHidden==='boolean')_scState.detachedHidden=_p.detachedHidden;
    if(typeof _p.gizmoFirst==='boolean')_scState.gizmoFirst=_p.gizmoFirst;
  }
}catch(e){}

function _saveScState(){try{localStorage.setItem('sk3d_sc',JSON.stringify(_scState));}catch(e){}}

// applyZoom: write `zoom` property on an element. Browsers render the element
// and its descendants (including <canvas> backing buffers) at that scale —
// no blur, no pixel-buffer recomputation needed. Vendor prefix for Safari < 16.
function applyZoom(el,scale){
  if(!el)return;
  el.style.zoom=String(scale);
}

// applyScale: use transform:scale for detached cards so top-left is guaranteed
// anchor. Unlike zoom, transform does not affect layout box — the card stays
// exactly at its left/top position while growing downward and to the right.
function applyDetachedScale(el,scale){
  if(!el)return;
  el.style.transform='scale('+scale+')';
  el.style.transformOrigin='top left';
}

// Position the stab at the inner edge of sidecol (accounts for zoom).
function positionStab(){
  if(document.body.classList.contains('narrow-mode'))return;
  var isRight=document.body.classList.contains('rside');
  var displayW=Math.round(176*_scState.scale);
  var gap=2;
  var scOffset=5; // sidecol left/right offset from screen edge (--SP / --SR)
  var offset=_scState.sideOpen?(scOffset+displayW+gap):(scOffset+gap);
  if(isRight){stab.style.right=offset+'px';stab.style.left='auto';}
  else{stab.style.left=offset+'px';stab.style.right='auto';}
}

// Position the floating LCL group just below sg-bottom (docked or detached).
function positionLclFloat(){
  var grp=document.getElementById('lcl-float-group');
  if(!grp)return;
  var isNarrow=document.body.classList.contains('narrow-mode');
  if(isNarrow){grp.style.display='none';return;}
  var isUiHidden=document.body.classList.contains('ui-hidden');
  if(isUiHidden){
    // In ui-hidden mode the sidecol is invisible; anchor to bottom-left above the mini-toolbar toggle.
    // Base bottom is 52px; CSS strip-shift rules override with !important when strips are open.
    grp.style.display='flex';
    grp.style.left='10px';
    grp.style.bottom=''; // clear inline bottom so CSS strip-shift rules apply cleanly
    grp.style.top='auto';
    grp.style.right='auto';
    return;
  }
  var sgBot=document.getElementById('sg-bottom');
  if(!sgBot||sgBot.style.display==='none'){grp.style.display='none';return;}
  // Check if sg-bottom is actually visible (may be inside hidden sidecol)
  var r=sgBot.getBoundingClientRect();
  if(r.width===0&&r.height===0){grp.style.display='none';return;}
  grp.style.display='flex';
  grp.style.left=Math.round(r.left)+'px';
  grp.style.top=Math.round(r.bottom+5)+'px';
  grp.style.bottom='auto';
  grp.style.right='auto';
}

// ── Sidecol-level apply ──
function applySidecol(){
  document.body.classList.toggle('rside',_scState.rside);
  sidecol.classList.toggle('collapsed',!_scState.sideOpen);
  applyZoom(sidecol,_scState.scale);
  positionStab();
  positionLclFloat();
  var sgTop=document.getElementById('sg-top');
  var sgBot=document.getElementById('sg-bottom');
  // Restore nav↔gizmo swap order
  if(sgBot)sgBot.classList.toggle('gizmo-first',_scState.gizmoFirst);
  // If detached: both groups float independently at their own positions.
  // If docked: both sit in sidecol with zoom=1 (inherit sidecol zoom).
  [sgTop,sgBot].forEach(function(g){if(!g)return;
    var isDetached=g.classList.contains('detached');
    if(isDetached)applyDetachedScale(g,_scState.detachedScale);
    else{applyZoom(g,1);g.style.transform='';g.style.transformOrigin='';}
  });
  if(_scState.detached){
    if(sgTop){sgTop.style.left=_scState.topLeft+'px';sgTop.style.top=_scState.topTop+'px';}
    if(sgBot){sgBot.style.left=_scState.botLeft+'px';sgBot.style.top=_scState.botTop+'px';}
    // If user hid the detached cards, hide them; otherwise show
    var hide=_scState.detachedHidden;
    if(sgTop)sgTop.style.display=hide?'none':'';
    if(sgBot)sgBot.style.display=hide?'none':'';
  }
  // Float-card zoom (narrow mode)
  var fc=document.getElementById('pb-float-card');
  if(fc)applyZoom(fc,_scState.fcScale);
}

// ── Detach / redock — BOTH groups together (v11) ──
// When undocked, both groups detach simultaneously and keep their visual
// positions (captured from getBoundingClientRect before the hoist). When
// docked, both return to sidecol in correct DOM order.
function detachAll(){
  if(_scState.detached)return;
  var sgTop=document.getElementById('sg-top');
  var sgBot=document.getElementById('sg-bottom');
  if(!sgTop||!sgBot)return;
  // Capture current on-screen positions BEFORE hoisting (so we can place them
  // exactly where they were visually — no jump).
  var rTop=sgTop.getBoundingClientRect();
  var rBot=sgBot.getBoundingClientRect();
  _scState.topLeft=Math.round(rTop.left);_scState.topTop=Math.round(rTop.top);
  _scState.botLeft=Math.round(rBot.left);_scState.botTop=Math.round(rBot.top);
  // Ensure cards don't start above the topbar (top ≥ 52px)
  var TB_MIN=52;
  if(_scState.topTop<TB_MIN)_scState.topTop=TB_MIN;
  if(_scState.botTop<TB_MIN)_scState.botTop=TB_MIN;
  // (No nudge: the drag itself moves the card from its exact visual position)
  // Match detached zoom to current sidecol zoom so cards don't jump size on detach.
  _scState.detachedScale=_scState.scale;
  // Add detached class + hoist to body (escape sidecol zoom)
  sgTop.classList.add('detached');
  sgBot.classList.add('detached');
  document.body.appendChild(sgTop);
  document.body.appendChild(sgBot);
  // Set positions synchronously BEFORE any paint — prevents single-frame jump to 0,0
  sgTop.style.left=_scState.topLeft+'px'; sgTop.style.top=_scState.topTop+'px';
  sgBot.style.left=_scState.botLeft+'px'; sgBot.style.top=_scState.botTop+'px';
  applyDetachedScale(sgTop,_scState.detachedScale);
  applyDetachedScale(sgBot,_scState.detachedScale);
  document.body.classList.add('sc-detached');  // hides #stab via CSS
  _scState.detached=true;
  _scState.detachedHidden=false;
  applySidecol();
  _saveScState();
}
function redockAll(save){
  if(!_scState.detached)return;
  var sgTop=document.getElementById('sg-top');
  var sgBot=document.getElementById('sg-bottom');
  var sc=document.getElementById('sidecol');
  if(!sgTop||!sgBot||!sc)return;
  sgTop.classList.remove('detached','dock-snap-ready');
  sgBot.classList.remove('detached','dock-snap-ready');
  sgTop.style.left='';sgTop.style.top='';sgTop.style.display='';sgTop.style.transform='';sgTop.style.transformOrigin='';
  sgBot.style.left='';sgBot.style.top='';sgBot.style.display='';sgBot.style.transform='';sgBot.style.transformOrigin='';
  // Restore DOM order: sg-bottom FIRST (column-reverse places first at visual bottom),
  // sg-top SECOND (visual top).
  sc.insertBefore(sgBot,sc.firstChild);
  sc.appendChild(sgTop);
  document.body.classList.remove('sc-detached');  // shows #stab again
  _scState.detached=false;
  _scState.detachedHidden=false;
  applySidecol();
  if(save!==false)_saveScState();
}

// ── Grab-handle drag: tap-move > 8px in sidecol → detach; once detached → reposition ──
// Snap zone: 10 px. Only the card's screen-facing edge (the edge closest to the
// screen border, away from the viewport interior) needs to be within 10 px of
// the corresponding screen edge. This means the user drags the card back toward
// the side of the screen — not just anywhere near the sidecol.
var SNAP_REDOCK=10;

// Check if a detached group's screen-facing edge is within SNAP_REDOCK px of
// the screen edge where the sidecol lives. Returns true → redock on release.
function _shouldRedock(g){
  var gr=g.getBoundingClientRect();
  var onRight=document.body.classList.contains('rside');
  if(onRight){
    // Sidecol is on the right. Card's far (right) edge must be near right screen edge.
    return (window.innerWidth-gr.right)<=SNAP_REDOCK;
  }else{
    // Sidecol is on the left. Card's far (left) edge must be near left screen edge.
    return gr.left<=SNAP_REDOCK;
  }
}

// Redock arms after the drag has been in progress for REDOCK_ARM_MS.
// Prevents the user's initial detach-drag from immediately re-docking when
// they're still adjacent to the sidecol edge, but allows a quick wiggle-and-
// return to redock (which the old distance-travelled gate blocked).
var REDOCK_ARM_MS=250;

(function(){
  var TAP=8;
  function wireGrab(grab){
    var which=grab.dataset.group;  // 'top' or 'bottom'
    var state=null;
    function onDown(e){
      // Don't start a drag if the target is a button (dock/close)
      if(e.target.tagName==='BUTTON')return;
      e.preventDefault();e.stopPropagation();
      var src=e.touches?e.touches[0]:e;
      var g=document.getElementById('sg-'+which);
      var r=g.getBoundingClientRect();
      state={sx:src.clientX,sy:src.clientY,ox:src.clientX-r.left,oy:src.clientY-r.top,
             moved:false,which:which,startT:Date.now()};
    }
    function onMove(e){
      if(!state)return;e.preventDefault();
      var src=e.touches?e.touches[0]:e;
      var dx=src.clientX-state.sx,dy=src.clientY-state.sy;
      if(!state.moved&&Math.hypot(dx,dy)<TAP)return;
      if(!state.moved){
        state.moved=true;
        // First threshold crossing — detach BOTH groups (they move together)
        // keeping their visual positions; then this specific group follows
        // the cursor while the other stays where it was.
        if(!_scState.detached)detachAll();
      }
      // Reposition THIS group only — no position clamping, cards can go anywhere
      var g=document.getElementById('sg-'+state.which);
      var nx=src.clientX-state.ox,ny=src.clientY-state.oy;
      g.style.left=nx+'px';g.style.top=ny+'px';
      if(state.which==='top'){_scState.topLeft=nx;_scState.topTop=ny;}
      else{_scState.botLeft=nx;_scState.botTop=ny;}
      positionLclFloat();
      // Redock arms after a short delay — gives the user a chance to move
      // the card away from the initial detach position before the snap engages
      var armed=(Date.now()-state.startT)>REDOCK_ARM_MS;
      var snapReady=armed&&_shouldRedock(g);
      g.classList.toggle('dock-snap-ready',snapReady);
      markDirty();renderer.render(scene,activeCam());_renderDirty=false;
    }
    function onEnd(){
      if(!state)return;
      var g=document.getElementById('sg-'+state.which);
      if(g)g.classList.remove('dock-snap-ready');
      if(state.moved){
        // Redock ALL if this group came close to sidecol edge (and gate armed)
        var armed=(Date.now()-state.startT)>REDOCK_ARM_MS;
        if(g&&armed&&_shouldRedock(g)){
          redockAll(true);
        }else{
          _saveScState();
        }
        positionLclFloat();
      }
      state=null;
    }
    grab.addEventListener('mousedown',onDown);
    grab.addEventListener('touchstart',onDown,{passive:false});
    document.addEventListener('mousemove',function(e){if(state)onMove(e);});
    document.addEventListener('mouseup',function(){if(state)onEnd();});
    grab.addEventListener('touchmove',onMove,{passive:false});
    grab.addEventListener('touchend',onEnd);
    grab.addEventListener('touchcancel',onEnd);
  }
  document.querySelectorAll('.sc-grab').forEach(wireGrab);
})();

// ── Close buttons on either detached group → hide both with FAB recall ──
// Close (X) doesn't redock — it hides the detached cards and shows a FAB
// to bring them back. Redocking happens via the 5 px edge snap or programmatic
// redockAll. This matches the narrow-mode float card behavior.
document.querySelectorAll('.sc-close').forEach(function(btn){
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    _scState.detachedHidden=true;
    applySidecol();
    _updateScFab();
    _saveScState();
  });
});

// ── Dock buttons on either detached group → redock both ──
// Dock (⊞) triggers full redock. Matches narrow-mode float-card dock button
// so users have consistent "bring it back to its home" affordance.
document.querySelectorAll('.sc-dock').forEach(function(btn){
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    redockAll(true);
  });
});

// ── FAB to restore hidden detached cards (wide-mode ui-hidden or not) ──
function _updateScFab(){
  var fab=document.getElementById('sc-fab');
  if(!fab)return;
  var show=_scState.detached&&_scState.detachedHidden;
  fab.style.display=show?'flex':'none';
}
(function(){
  var fab=document.getElementById('sc-fab');
  if(!fab)return;
  fab.addEventListener('click',function(){
    _scState.detachedHidden=false;
    applySidecol();
    _updateScFab();
    _saveScState();
  });
})();

// ── Scale dots: drag diagonally → change zoom of target card ──
// Uses Pointer Events + setPointerCapture so the drag stays live even if
// the finger/cursor moves off the small dot. No press-and-hold required —
// the drag starts the instant pointerdown fires.
(function(){
  function wireDot(dot){
    var targetId=dot.dataset.scaletarget;
    var state=null;
    function currentScale(){
      if(targetId==='pb-float-card')return _scState.fcScale;
      if(targetId==='sgizmo')return _scState.sgScale||1;
      return _scState.detachedScale;
    }
    function setScale(v){
      v=Math.max(SC_MIN,Math.min(SC_MAX,v));
      if(targetId==='pb-float-card'){
        _scState.fcScale=v;
        var target=document.getElementById(targetId);
        if(target)applyZoom(target,v);
      }else if(targetId==='sgizmo'){
        _scState.sgScale=v;
        var target=document.getElementById(targetId);
        if(target)applyDetachedScale(target,v);
      }else{
        _scState.detachedScale=v;
        // Use transform:scale with top-left origin so card stays anchored.
        var target=document.getElementById(targetId);
        if(target)applyDetachedScale(target,v);
      }
      markDirty();
    }
    dot.addEventListener('pointerdown',function(e){
      e.preventDefault();e.stopPropagation();
      // Capture all future pointer events to this element — finger can move
      // anywhere and we still get pointermove/pointerup.
      try{dot.setPointerCapture(e.pointerId);}catch(ex){}
      state={sx:e.clientX,sy:e.clientY,startScale:currentScale()};
      dot.classList.add('dragging');
    });
    dot.addEventListener('pointermove',function(e){
      if(!state)return;
      e.preventDefault();
      // Right-edge strip: drag right = grow, drag left = shrink.
      // Use dx only (vertical drag on a side strip does nothing).
      var dx=e.clientX-state.sx;
      setScale(state.startScale+dx*0.007);
    });
    dot.addEventListener('pointerup',function(e){
      if(!state)return;
      state=null;
      dot.classList.remove('dragging');
      _saveScState();
    });
    dot.addEventListener('pointercancel',function(){
      if(!state)return;
      state=null;
      dot.classList.remove('dragging');
    });
  }
  document.querySelectorAll('.scale-dot').forEach(wireDot);
})();

// ── Stab: tap → collapse; horizontal drag → scale sidecol (0.7–1.0) ──
// Drag TOWARD screen edge = shrink (column gets thinner).
// Drag TOWARD screen center = grow (back up to 1.0).
(function(){
  var state=null;
  var TAP_THRESH=8;
  function onDown(e){
    e.preventDefault();
    var src=e.touches?e.touches[0]:e;
    state={sx:src.clientX,sy:src.clientY,startScale:_scState.scale,moved:false};
    stab.classList.add('resizing');
  }
  function onMove(e){
    if(!state)return;
    e.preventDefault();
    var src=e.touches?e.touches[0]:e;
    var dx=src.clientX-state.sx,dy=src.clientY-state.sy;
    if(!state.moved&&Math.hypot(dx,dy)<TAP_THRESH)return;
    state.moved=true;
    // Horizontal drag: sign depends on which side the sidecol is on.
    // Left side: positive dx = moving right (toward center) = grow.
    // Right side: negative dx = moving left (toward center) = grow.
    var isRight=document.body.classList.contains('rside');
    var growDir=isRight?-dx:dx;
    var scaleDelta=growDir*0.003;
    var newScale=Math.max(SC_MIN,Math.min(SC_MAX,state.startScale+scaleDelta));
    _scState.scale=newScale;
    applyZoom(sidecol,_scState.scale);
    positionStab();positionLclFloat();
    markDirty();renderer.render(scene,activeCam());_renderDirty=false;
  }
  function onEnd(){
    if(!state)return;
    stab.classList.remove('resizing');
    if(!state.moved){
      _scState.sideOpen=!_scState.sideOpen;
      sidecol.classList.toggle('collapsed',!_scState.sideOpen);
      positionStab();positionLclFloat();
    }
    _saveScState();
    state=null;
  }
  stab.addEventListener('mousedown',onDown);
  document.addEventListener('mousemove',function(e){if(state)onMove(e);});
  document.addEventListener('mouseup',function(){if(state)onEnd();});
  stab.addEventListener('touchstart',onDown,{passive:false});
  stab.addEventListener('touchmove',onMove,{passive:false});
  stab.addEventListener('touchend',onEnd);
  stab.addEventListener('touchcancel',onEnd);
})();

// ── Side-switch button in status bar ──
var _sbSideBtn=document.getElementById('sb-sideswitch');
if(_sbSideBtn){
  _sbSideBtn.addEventListener('click',function(){
    _scState.rside=!_scState.rside;
    applySidecol();
    _saveScState();
  });
}

// Apply initial state
applySidecol();
// If both groups were persisted as detached, restore (hoist to body)
if(_scState.detached){
  var sgT=document.getElementById('sg-top');
  var sgB=document.getElementById('sg-bottom');
  if(sgT){sgT.classList.add('detached');document.body.appendChild(sgT);}
  if(sgB){sgB.classList.add('detached');document.body.appendChild(sgB);}
  document.body.classList.add('sc-detached');
  applySidecol();
  _updateScFab();
}
window.addEventListener('resize',positionStab);

// ── Swap nav ↔ gizmo in control card ──
(function(){
  var btn=document.getElementById('sg-swap');
  if(!btn)return;
  btn.addEventListener('click',function(e){
    e.stopPropagation();
    var sgB=document.getElementById('sg-bottom');
    if(sgB){sgB.classList.toggle('gizmo-first');_scState.gizmoFirst=sgB.classList.contains('gizmo-first');_saveScState();}
  });
})();
if(window.visualViewport)window.visualViewport.addEventListener('resize',positionStab);


// ================================================================
//  FLOAT CARD — narrow nav+gizmo panel system
// ================================================================

window._cardDetached=false;
window._cardHidden=false;

var _syncRafId=null;
function _syncRenderer(){
  // Debounce via RAF: if called multiple times in a frame (e.g. resize + visualViewport
  // both firing), only execute once after the browser has committed the new layout.
  // This also ensures visualViewport.width/height are the final settled values, not
  // mid-transition values from Android freeform→fullscreen expansion.
  if(_syncRafId)cancelAnimationFrame(_syncRafId);
  _syncRafId=requestAnimationFrame(function(){
    _syncRafId=null;
    var _vvp=window.visualViewport;
    var vw=_vvp?_vvp.width:window.innerWidth;
    var vh=_vvp?_vvp.height:window.innerHeight;
    renderer.setSize(vw,vh);
    camera.aspect=vw/vh;
    camera.updateProjectionMatrix();
    syncOrtho();
    _refreshRect();
    // Render synchronously at the new size so the canvas doesn't show a black
    // gap during window-resize reflows. markDirty alone waits for the next
    // rAF (up to ~32ms lag after RAF-debounce + animate tick) — enough for a
    // visible flash when the URL bar animates on Android Chrome.
    renderer.render(scene,activeCam());
    _renderDirty=false;
  });
}

function updateLayoutMode(){
  // Use visualViewport when available — gives correct dimensions in PWA standalone
  // before window.innerWidth/Height have settled after launch
  var _vvp=window.visualViewport;
  var _vw=_vvp?_vvp.width:window.innerWidth;
  var _vh=_vvp?_vvp.height:window.innerHeight;
  // Touch-first redesign: the contextual floating-panel layout (narrow-bar +
  // pb-float-card) is now the ONLY layout, regardless of aspect ratio — this
  // app targets touch/tablet exclusively, so the old dense mouse-oriented
  // sidecol/topbar layout is never shown. (Previously: _vw/_vh<(2/3), i.e.
  // only phone-portrait screens got this treatment; tablets fell through to
  // the desktop layout, which is what this redesign replaces.)
  var isNarrow=true;
  var isUiHidden=document.body.classList.contains('ui-hidden');
  var pb=document.getElementById('narrow-bar');
  var sc=document.getElementById('sidecol');
  var sb=document.getElementById('sbar');
  var card=document.getElementById('pb-float-card');
  var fab=document.getElementById('pb-fab');
  if(isNarrow){
    pb.classList.add('active');
    document.body.classList.add('narrow-mode');
    if(sc)sc.style.display='none';
    if(sb)sb.style.display='none';
    stab.style.display='none';
    // Hide any detached sc-group (they're parented on body, not sidecol, so
    // sidecol.display='none' doesn't cascade to them)
    document.querySelectorAll('.sc-group.detached').forEach(function(g){g.style.display='none';});
    _fcReparent();
    if(!window._fcEverActivated){
      window._fcEverActivated=true;
      // Only dock on first activation if UI is visible
      if(!isUiHidden){
        if(card)card.classList.add('fc-docked-bottom');
        var dockBtn2=document.getElementById('fc-dock-btn');
        if(dockBtn2)dockBtn2.textContent='✦';
      }
    }
    if(!window._cardHidden){
      if(card)card.classList.add('fc-visible');
      if(fab)fab.classList.remove('fab-visible');
    } else {
      if(fab)fab.classList.add('fab-visible');
    }
    setTimeout(function(){
      _syncRenderer();
      _fcResizeCanvases();
      var h=pb.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--pb-h',h+'px');
      // Re-sync surface group so plane isn't stale after canvas resize
      if(typeof syncSurf==='function')syncSurf();
      if(window._gDraw)window._gDraw();
      if(window._pbGcDraw)window._pbGcDraw();
      positionLclFloat();
    },50);
  } else {
    pb.classList.remove('active');
    document.body.classList.remove('narrow-mode');
    // Tablet mode: show float card only when UI is hidden
    if(isUiHidden){
      _fcReparent();
      if(!window._fcEverActivated){window._fcEverActivated=true;}
      if(!window._cardHidden){
        if(card)card.classList.add('fc-visible');
        if(fab)fab.classList.remove('fab-visible');
      } else {
        if(fab)fab.classList.add('fab-visible');
      }
      setTimeout(function(){
        _syncRenderer();_fcResizeCanvases();
        if(typeof syncSurf==='function')syncSurf();
        if(window._gDraw)window._gDraw();
        if(window._pbGcDraw)window._pbGcDraw();
        positionLclFloat();
      },50);
    } else {
      if(sc)sc.style.display='';
      if(sb)sb.style.display='';
      stab.style.display='';
      // Restore any detached sc-group visibility
      document.querySelectorAll('.sc-group.detached').forEach(function(g){g.style.display='';});
      _fcReturn();
      if(card)card.classList.remove('fc-visible');
      if(fab)fab.classList.remove('fab-visible');
      window._cardHidden=false;
      document.documentElement.style.setProperty('--pb-h','0px');
      // Sync renderer + surface after sidecol becomes visible — layout change doesn't fire resize in PWA
      setTimeout(function(){
        _syncRenderer();
        if(typeof syncSurf==='function')syncSurf();
        if(window._gDraw)window._gDraw();
        if(window._pbGcDraw)window._pbGcDraw();
        positionLclFloat();
      },50);
    }
  }
}

function _fcReparent(){
  var fcPanels=document.getElementById('fc-panels');
  var navPanel=document.getElementById('pb-panel-nav');
  var gizPanel=document.getElementById('pb-panel-gizmo');
  var lookPanel=document.getElementById('pb-panel-look');
  if(!fcPanels||!navPanel||!gizPanel)return;
  if(navPanel.parentNode!==fcPanels)fcPanels.appendChild(navPanel);
  if(gizPanel.parentNode!==fcPanels)fcPanels.appendChild(gizPanel);
  if(lookPanel&&lookPanel.parentNode!==fcPanels)fcPanels.appendChild(lookPanel);
  window._cardDetached=true;
}

function _fcReturn(){
  var pbPanels=document.getElementById('pb-panels');
  var navPanel=document.getElementById('pb-panel-nav');
  var gizPanel=document.getElementById('pb-panel-gizmo');
  var lookPanel=document.getElementById('pb-panel-look');
  if(!pbPanels||!navPanel||!gizPanel)return;
  if(navPanel.parentNode!==pbPanels)pbPanels.appendChild(navPanel);
  if(gizPanel.parentNode!==pbPanels)pbPanels.appendChild(gizPanel);
  if(lookPanel&&lookPanel.parentNode!==pbPanels)pbPanels.appendChild(lookPanel);
  window._cardDetached=false;
}

function _fcResizeCanvases(){
  if(window._cardDetached){
    var navPanel=document.getElementById('pb-panel-nav');
    var gizPanel=document.getElementById('pb-panel-gizmo');
    if(!navPanel||!gizPanel)return;
    var nw=navPanel.clientWidth-2;if(nw<60)nw=60;
    var nh=Math.round(nw*0.88);
    var nc=document.getElementById('pb-navcube');
    if(nc){nc.width=nw;nc.height=nh;nc.style.width=nw+'px';nc.style.height=nh+'px';}
    var gw=gizPanel.clientWidth-6;if(gw<50)gw=50;
    var gh=Math.round(gw*0.80);
    var gc2=document.getElementById('pb-gc');
    if(gc2){gc2.width=gw;gc2.height=gh;gc2.style.width=gw+'px';gc2.style.height=gh+'px';}
    var hintRow=document.getElementById('pb-greset');
    if(hintRow&&hintRow.parentElement)hintRow.parentElement.style.width=gw+'px';
  } else {
    var navPanel2=document.getElementById('pb-panel-nav');
    var gizPanel2=document.getElementById('pb-panel-gizmo');
    if(navPanel2){
      var nw2=navPanel2.clientWidth-2;var nh2=Math.round(nw2*0.88);
      var nc2=document.getElementById('pb-navcube');
      if(nc2){nc2.width=nw2;nc2.height=nh2;nc2.style.width=nw2+'px';nc2.style.height=nh2+'px';}
    }
    if(gizPanel2){
      var gw2=gizPanel2.clientWidth-6;var gh2=Math.round(gw2*0.80);
      var gc3=document.getElementById('pb-gc');
      if(gc3){gc3.width=gw2;gc3.height=gh2;gc3.style.width=gw2+'px';gc3.style.height=gh2+'px';}
      var hintRow2=document.getElementById('pb-greset');
      if(hintRow2&&hintRow2.parentElement)hintRow2.parentElement.style.width=gw2+'px';
    }
  }
  if(window._pbNcReinit)window._pbNcReinit();
  if(window._applyNavToggle)window._applyNavToggle();
  if(window._pbNcDraw)window._pbNcDraw();
  if(window._pbGcDraw)window._pbGcDraw();
}

// ── Narrow float card interactions ─────────────────────────────
(function(){
  var card=document.getElementById('pb-float-card');
  var handle=document.getElementById('fc-handle');
  var closeBtn=document.getElementById('fc-close');
  var dockBtn=document.getElementById('fc-dock-btn');
  var resizeEl=document.getElementById('fc-resize');
  var snapHint=document.getElementById('fc-snap-hint');
  var fab=document.getElementById('pb-fab');
  if(!card||!handle)return;

  var SNAP_DIST=5;  // narrow range — only snap-redock when almost back to docked position
  var DEFAULT_W=Math.min(window.innerWidth-16,340);
  card.style.width=DEFAULT_W+'px';card.style.left='8px';card.style.top='52px';

  function isDocked(){return card.classList.contains('fc-docked-bottom');}
  function undock(){
    card.classList.remove('fc-docked-bottom');
    card.style.left=(window._fcLastLeft||8)+'px';
    card.style.top=(window._fcLastTop||52)+'px';
    card.style.width=(window._fcLastW||DEFAULT_W)+'px';
    card.style.right='';card.style.bottom='';
    if(dockBtn)dockBtn.textContent='⊞';
    setTimeout(_fcResizeCanvases,30);
  }
  function dockTo(edge){
    if(!isDocked()){
      window._fcLastLeft=parseInt(card.style.left)||8;
      window._fcLastTop=parseInt(card.style.top)||52;
      window._fcLastW=card.offsetWidth||DEFAULT_W;
    }
    card.classList.remove('fc-docked-bottom');
    if(edge==='bottom')card.classList.add('fc-docked-bottom');
    card.style.right='';card.style.bottom='';
    if(isDocked()&&window._fcNavResizeReset)window._fcNavResizeReset();
    if(dockBtn)dockBtn.textContent=isDocked()?'✦':'⊞';
    setTimeout(_fcResizeCanvases,30);
  }
  window._fcDockTo=dockTo;window._fcUndock=undock;
  if(dockBtn)dockBtn.addEventListener('click',function(e){e.stopPropagation();if(isDocked()){undock();}else if(!document.body.classList.contains('ui-hidden')){dockTo('bottom');}});

  var dragState=null;
  function snapEdge(nx,ny){
    // Never snap to bottom when UI is hidden — card must stay floating
    if(document.body.classList.contains('ui-hidden'))return null;
    var ch=card.offsetHeight,ih=window.innerHeight;
    // Dock only when bottom edge is within SNAP_DIST px of the viewport bottom.
    // Do NOT use --pb-h — that var is set to the card's own docked height,
    // making the threshold circular and causing premature snapping.
    if(ny+ch>ih-SNAP_DIST)return'bottom';
    return null;
  }
  function onDragStart(e){
    if(e.target===closeBtn||e.target===dockBtn)return;
    if(isDocked())undock();
    e.preventDefault();
    var src=e.touches?e.touches[0]:e,r=card.getBoundingClientRect();
    dragState={ox:src.clientX-r.left,oy:src.clientY-r.top};
  }
  function onDragMove(e){
    if(!dragState)return;e.preventDefault();
    var src=e.touches?e.touches[0]:e;
    var nx=src.clientX-dragState.ox,ny=src.clientY-dragState.oy;
    var cw=card.offsetWidth,ch=card.offsetHeight;
    // No clamping — card moves freely anywhere on screen.
    card.style.left=nx+'px';card.style.top=ny+'px';
    if(snapHint){if(snapEdge(nx,ny))snapHint.classList.add('show');else snapHint.classList.remove('show');}
  }
  function onDragEnd(){
    if(!dragState)return;
    var nx=parseInt(card.style.left)||0,ny=parseInt(card.style.top)||0;
    var edge=snapEdge(nx,ny);
    if(edge){dockTo(edge);}else{window._fcLastLeft=nx;window._fcLastTop=ny;window._fcLastW=card.offsetWidth;}
    if(snapHint)snapHint.classList.remove('show');
    dragState=null;
  }
  handle.addEventListener('touchstart',onDragStart,{passive:false});
  handle.addEventListener('touchmove',onDragMove,{passive:false});
  handle.addEventListener('touchend',onDragEnd);
  handle.addEventListener('mousedown',onDragStart);
  document.addEventListener('mousemove',function(e){if(dragState)onDragMove(e);});
  document.addEventListener('mouseup',function(){if(dragState)onDragEnd();});

  // Width resize — right edge
  var resizeState=null;
  function onResizeStart(e){
    if(isDocked())return;e.preventDefault();e.stopPropagation();
    var src=e.touches?e.touches[0]:e;
    resizeState={sx:src.clientX,sw:card.offsetWidth};
  }
  function onResizeMove(e){
    if(!resizeState)return;e.preventDefault();
    var src=e.touches?e.touches[0]:e;
    var nw=Math.max(200,Math.min(window.innerWidth-16,resizeState.sw+(src.clientX-resizeState.sx)));
    card.style.width=nw+'px';
    var cx=parseInt(card.style.left)||0;
    if(cx+nw>window.innerWidth)card.style.left=Math.max(0,window.innerWidth-nw)+'px';
    _fcResizeCanvases();
  }
  function onResizeEnd(){if(resizeState)window._fcLastW=card.offsetWidth;resizeState=null;_fcResizeCanvases();}
  if(resizeEl){
    resizeEl.addEventListener('touchstart',onResizeStart,{passive:false});
    resizeEl.addEventListener('touchmove',onResizeMove,{passive:false});
    resizeEl.addEventListener('touchend',onResizeEnd);
    resizeEl.addEventListener('mousedown',onResizeStart);
    document.addEventListener('mousemove',function(e){if(resizeState)onResizeMove(e);});
    document.addEventListener('mouseup',function(){if(resizeState)onResizeEnd();});
  }

  if(closeBtn)closeBtn.addEventListener('click',function(e){e.stopPropagation();card.classList.remove('fc-visible');window._cardHidden=true;if(fab)fab.classList.add('fab-visible');});

  var fabDrag=null;
  if(fab){
    fab.style.left='8px';fab.style.top='52px';
    fab.addEventListener('touchstart',function(e){var src=e.touches[0],r=fab.getBoundingClientRect();fabDrag={ox:src.clientX-r.left,oy:src.clientY-r.top,moved:false};},{passive:true});
    fab.addEventListener('touchmove',function(e){if(!fabDrag)return;e.preventDefault();fabDrag.moved=true;var src=e.touches[0];var nx=Math.max(0,Math.min(window.innerWidth-36,src.clientX-fabDrag.ox)),ny=Math.max(0,Math.min(window.innerHeight-36,src.clientY-fabDrag.oy));fab.style.left=nx+'px';fab.style.top=ny+'px';},{passive:false});
    fab.addEventListener('touchend',function(){if(fabDrag&&!fabDrag.moved){window._cardHidden=false;card.classList.add('fc-visible');fab.classList.remove('fab-visible');setTimeout(_fcResizeCanvases,30);}fabDrag=null;});
    fab.addEventListener('click',function(){window._cardHidden=false;card.classList.add('fc-visible');fab.classList.remove('fab-visible');setTimeout(_fcResizeCanvases,30);});
  }
})();

// ── Narrow nav inter-panel resize grip ──────────────────────────
(function(){
  var navGrip=document.getElementById('fc-nav-resize');
  var navPanel=document.getElementById('pb-panel-nav');
  var gizPanel=document.getElementById('pb-panel-gizmo');
  if(!navGrip||!navPanel||!gizPanel)return;
  var navState=null;
  function onStart(e){
    if(document.getElementById('pb-float-card').classList.contains('fc-docked-bottom'))return;
    e.preventDefault();e.stopPropagation();
    var src=e.touches?e.touches[0]:e;
    navState={sx:src.clientX,nw:navPanel.offsetWidth,gw:gizPanel.offsetWidth};
  }
  function onMove(e){
    if(!navState)return;e.preventDefault();
    var src=e.touches?e.touches[0]:e,dx=src.clientX-navState.sx,total=navState.nw+navState.gw;
    var newNw=Math.max(80,Math.min(total-80,navState.nw+dx));
    navPanel.style.flex='none';navPanel.style.width=newNw+'px';
    gizPanel.style.flex='none';gizPanel.style.width=(total-newNw)+'px';
    _fcResizeCanvases();
  }
  function onEnd(){navState=null;_fcResizeCanvases();}
  navGrip.addEventListener('touchstart',onStart,{passive:false});
  navGrip.addEventListener('touchmove',onMove,{passive:false});
  navGrip.addEventListener('touchend',onEnd);
  navGrip.addEventListener('mousedown',onStart);
  document.addEventListener('mousemove',function(e){if(navState)onMove(e);});
  document.addEventListener('mouseup',function(){if(navState)onEnd();});
  window._fcNavResizeReset=function(){
    navPanel.style.flex='';navPanel.style.width='';
    gizPanel.style.flex='';gizPanel.style.width='';
    var lookPanel=document.getElementById('pb-panel-look');
    if(lookPanel){lookPanel.style.flex='';lookPanel.style.width='';}
  };
})();

// ── Narrow float card: pinch-to-scale ───────────────────────────
// Two-finger pinch on the card scales its width proportionally.
// Canvases are resized via _fcResizeCanvases after each step.
// Works whether card is docked or floating.
(function(){
  var card=document.getElementById('pb-float-card');
  if(!card)return;
  var pinch=null; // {dist, w}
  function dist(t){
    var dx=t[0].clientX-t[1].clientX,dy=t[0].clientY-t[1].clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }
  card.addEventListener('touchstart',function(e){
    if(e.touches.length===2){
      e.preventDefault();
      pinch={dist:dist(e.touches),w:card.offsetWidth};
    }
  },{passive:false});
  card.addEventListener('touchmove',function(e){
    if(pinch&&e.touches.length===2){
      e.preventDefault();
      var scale=dist(e.touches)/pinch.dist;
      var nw=Math.round(pinch.w*scale);
      nw=Math.max(200,Math.min(window.innerWidth-16,nw));
      card.style.width=nw+'px';
      // Keep card on screen
      if(!card.classList.contains('fc-docked-bottom')){
        var cx=parseInt(card.style.left)||0;
        if(cx+nw>window.innerWidth)card.style.left=Math.max(0,window.innerWidth-nw)+'px';
      }
      if(window._fcResizeCanvases)window._fcResizeCanvases();
    }
  },{passive:false});
  card.addEventListener('touchend',function(e){
    if(e.touches.length<2){
      if(pinch){window._fcLastW=card.offsetWidth;}
      pinch=null;
    }
  });
  card.addEventListener('touchcancel',function(){pinch=null;});
})();

// Keyboard
window.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undo();return;}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='d'){e.preventDefault();duplicateSelected();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='s'){e.preventDefault();saveFile();return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='e'){e.preventDefault();var em=document.getElementById('expmenu');em.classList.toggle('vis');return;}
  if((e.ctrlKey||e.metaKey)&&e.key==='n'){e.preventDefault();document.getElementById('bnew').click();return;}
  if(e.key==='Delete'||e.key==='Backspace'){if(selectedStrokes.length){e.preventDefault();deleteSelected();return;}}
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA')return;
  // In FPS mode, WASD/QE/arrows are handled by FPS tick — suppress normal shortcuts
  if(_fpsMode){
    var k=e.key.toLowerCase();
    if(k==='escape'){if(window._exitFps)window._exitFps();return;}
    if('wasdqe'.indexOf(k)>=0)return;
    if(k==='arrowleft'||k==='arrowright'||k==='arrowup'||k==='arrowdown')return;
  }
  switch(e.key.toLowerCase()){
    case 'd':setMode('draw');break;case 'e':setMode('erase');break;case 'q':setMode('select');break;
    case 'g':setMode('pan');break;case 'r':setMode('orbit');break;
    case 'f':document.getElementById('sflat').click();break;
    case 'v':togglePersp();break;case 'x':document.getElementById('bdepth').click();break;
    case 'a':toggleAxis(!axisLinesOn);break;case 's':document.getElementById('ssmooth').click();break;
    case 'w':document.getElementById('svel').click();break;
    case 'l':if(window._rulerToggle) window._rulerToggle();break;
    case 'p':expPNG();break;case 'h':document.getElementById('bhide').click();break;
    case 'escape':clearSelection();setMode(prevDrawMode);break;
    // Brush size: ] increase, [ decrease
    case ']':case '}':var bsEl=document.getElementById('sz-sld');if(bsEl){bsEl.value=Math.min(20,Number(bsEl.value)+1);bsEl.dispatchEvent(new Event('input'));}break;
    case '[':case '{':var bsEl2=document.getElementById('sz-sld');if(bsEl2){bsEl2.value=Math.max(1,Number(bsEl2.value)-1);bsEl2.dispatchEvent(new Event('input'));}break;
    // Opacity: shift+] increase, shift+[ decrease — already handled by }/{ above
    // Pages/views toggle
    case 'n':togglePages();break;
    case 'm':toggleViews();break;
    // Zoom: +/= zoom in, -/_ zoom out
    case '=':case '+':if(useOrtho){orthoZoom=Math.max(1,orthoZoom-1);syncOrtho();}else{cam.radius=Math.max(1,cam.radius-1);}updCam();break;
    case '-':case '_':if(useOrtho){orthoZoom=Math.min(50,orthoZoom+1);syncOrtho();}else{cam.radius=Math.min(40,cam.radius+1);}updCam();break;
    // Save view
    case 'b':saveView();break;
    // Grid toggle
    case 'j':gridH.visible=!gridH.visible;document.getElementById('bgrid').classList.toggle('on',gridH.visible);markDirty();break;
    // Surface toggle
    case 'k':surfGroup.visible=!surfGroup.visible;document.getElementById('bsurf').classList.toggle('on',surfGroup.visible);markDirty();break;
    // FPS mode
    case 'c':if(window._enterFps)window._enterFps();break;
    // Numpad 1-9 for view recall
    case '1':case '2':case '3':case '4':case '5':case '6':case '7':case '8':case '9':
      var vi=parseInt(e.key)-1;var vws=pages[curPage]&&pages[curPage].views;
      if(vws&&vws[vi])recallView(vws[vi]);
      break;
  }
});

// Init
syncSurf();setMode('draw');
document.getElementById('bsurf').classList.add('on');

setActiveLayer(0);
updateGestLabel();updateLayoutMode();_syncRenderer();
// PWA standalone: viewport dimensions may not be final at script execution.
// Retry after paint and after system UI has settled to ensure correct narrow/wide layout.
// _syncRenderer retries ensure camera projection is correct after Android freeform->fullscreen.
setTimeout(updateLayoutMode,200);
setTimeout(updateLayoutMode,600);
setTimeout(_syncRenderer,250);
setTimeout(_syncRenderer,700);
setTimeout(positionLclFloat,220);
setTimeout(positionLclFloat,650);
// Restore from IndexedDB on load — uses _onIdbReady so it fires
// exactly when the DB is available, with localStorage fallback if DB fails
(function(){
  function doRestore(){
    idbLoad(function(saved){
      if(saved){try{var data=JSON.parse(saved);if(data.strokes&&data.strokes.length>0)loadAllPages(data);}catch(e){}}
    });
  }
  if(_idb){doRestore();}
  else{
    // Register callback — fires when DB opens (no fixed timeout)
    _onIdbReady(function(){doRestore();});
    // Fallback: if DB never opens (error/blocked), try localStorage after 2s
    setTimeout(function(){
      if(!_idb){
        try{var s=localStorage.getItem('sk3d_auto');if(s){var d=JSON.parse(s);if(d.strokes&&d.strokes.length>0)loadAllPages(d);}}catch(e){}
      }
    },2000);
  }
})();

function animate(){
  requestAnimationFrame(animate);
  if(_renderDirty||isDrawing||_hoverStroke||_recState){
    renderer.render(scene,activeCam());
    _renderDirty=false;
  }
  // Overlay canvas always synced to the same RAF tick as renderer.render —
  // eliminates the 1-frame phase offset that caused the local gizmo to wiggle during orbit.
  if(window._lgOverlayDraw) window._lgOverlayDraw();
}
animate();

// ================================================================
//  GHUD-SEL: in-card selection controls (replaces ghud-bottom)
// ================================================================
