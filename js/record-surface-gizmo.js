// ============================================================
// record-surface-gizmo.js
// View recording (webm capture) + surface gizmo (drag handles for the active drawing plane)
// ============================================================
var _recState=null; // {recorder, chunks, cancelled}
function startRecordViews(){
  var views=pages[curPage]&&pages[curPage].views;
  if(!views||views.length<2){toast('Need 2+ saved views to record');return;}
  // Check MediaRecorder support
  var canvasEl=renderer.domElement;
  if(typeof canvasEl.captureStream!=='function'){toast('Recording not supported on this device');return;}
  // Try MP4 first (Safari), then WebM (Chrome/Firefox)
  var mimeType='';var fileExt='.mp4';
  var tryTypes=['video/mp4','video/mp4;codecs=avc1','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  for(var ti=0;ti<tryTypes.length;ti++){
    try{if(MediaRecorder.isTypeSupported(tryTypes[ti])){mimeType=tryTypes[ti];break;}}catch(ex){}
  }
  if(!mimeType){toast('Recording not supported on this device');return;}
  if(mimeType.indexOf('webm')>=0)fileExt='.webm';

  // Save overlay visibility and hide for clean recording
  var _recOverlayState={grid:gridH.visible,axis:axisGroup.visible,surf:surfGroup.visible};
  window._recOverlayState=_recOverlayState;
  gridH.visible=false;axisGroup.visible=false;surfGroup.visible=false;markDirty();

  // Hide UI for clean recording
  if(!document.body.classList.contains('ui-hidden')){
    document.getElementById('bhide').click();
  }
  // Close any open strips
  document.getElementById('views').classList.remove('open','recording-open','pages-also-open');
  document.getElementById('pages').classList.remove('open');
  document.body.classList.remove('views-open','pages-open');

  // Start capture
  var stream;
  try{stream=canvasEl.captureStream(30);}catch(ex){toast('Recording failed: '+ex.message);return;}
  var recorder;
  try{recorder=new MediaRecorder(stream,{mimeType:mimeType,videoBitsPerSecond:4000000});}catch(ex){toast('Recording failed: '+ex.message);return;}
  var chunks=[];
  _recState={recorder:recorder,chunks:chunks,cancelled:false};
  recorder.ondataavailable=function(e){if(e.data&&e.data.size>0)chunks.push(e.data);};
  recorder.onstop=function(){
    if(_recState&&_recState.cancelled){_recState=null;toast('Recording cancelled');return;}
    var recChunks=_recState?_recState.chunks:chunks;
    _recState=null;
    if(!recChunks.length){toast('No recording data');return;}
    var blob=new Blob(recChunks,{type:mimeType});
    promptExportName('drwthred-views',fileExt,function(name){
      var url=URL.createObjectURL(blob);
      var a=document.createElement('a');a.href=url;a.download=name+fileExt;a.click();
      URL.revokeObjectURL(url);toast('Recording saved');
    });
  };
  recorder.onerror=function(){
    _recState=null;
    document.getElementById('rec-stop-btn').classList.remove('vis');
    toast('Recording error');
  };
  recorder.start();
  // Show stop button
  document.getElementById('rec-stop-btn').classList.add('vis');
  toast('Recording started');

  // Render one initial frame then begin sequencing views
  renderer.render(scene,activeCam());markDirty();
  // Small delay before starting the animation sequence
  setTimeout(function(){_recPlayViews(views,0);},500);
}

function _recPlayViews(views,idx){
  if(!_recState||_recState.cancelled)return;
  if(idx>=views.length){
    // All views played — hold final frame for 1s then stop
    setTimeout(function(){stopRecordViews(false);},1000);
    return;
  }
  // Recall this view (triggers smooth lerp animation)
  recallView(views[idx]);
  // Wait for the animation to complete (recallView duration is 1-3s, we poll _vwLerp)
  function waitForLerp(){
    if(!_recState||_recState.cancelled)return;
    if(_vwLerp!=null){
      // Animation still in progress
      requestAnimationFrame(waitForLerp);
    } else {
      // Animation complete — hold for 800ms then move to next view
      setTimeout(function(){_recPlayViews(views,idx+1);},800);
    }
  }
  // Start polling after a frame to let recallView kick off
  requestAnimationFrame(waitForLerp);
}

function stopRecordViews(cancel){
  if(!_recState)return;
  if(cancel)_recState.cancelled=true;
  document.getElementById('rec-stop-btn').classList.remove('vis');
  // Cancel any in-progress view lerp
  if(_vwLerp){cancelAnimationFrame(_vwLerp);_vwLerp=null;}
  try{if(_recState.recorder.state!=='inactive')_recState.recorder.stop();}catch(ex){}
  // Restore overlay visibility
  if(window._recOverlayState){
    gridH.visible=window._recOverlayState.grid;
    axisGroup.visible=window._recOverlayState.axis;
    surfGroup.visible=window._recOverlayState.surf;
    window._recOverlayState=null;
    // Sync button states
    var bg=document.getElementById('bgrid');if(bg)bg.classList.toggle('on',gridH.visible);
    var ba=document.getElementById('baxis');if(ba)ba.classList.toggle('on',axisGroup.visible);
    var bs=document.getElementById('bsurf');if(bs)bs.classList.toggle('on',surfGroup.visible);
    var pbg=document.getElementById('pb-grid');if(pbg)pbg.classList.toggle('on',gridH.visible);
    var pba=document.getElementById('pb-axis');if(pba)pba.classList.toggle('on',axisGroup.visible);
    var pbs=document.getElementById('pb-surf');if(pbs)pbs.classList.toggle('on',surfGroup.visible);
    markDirty();
  }
  // Restore UI
  if(document.body.classList.contains('ui-hidden')){
    document.getElementById('bhide').click();
  }
}

// ================================================================
//  SURFACE GIZMO (unchanged from v4)
// ================================================================
// ── Shared snap state (used by both card gizmo and local overlay gizmo) ──
var snapEnabled=true;
var SNAP_STEP=Math.PI/4,SNAP_THRESH=Math.PI/16;
function snapAngle(raw){var sn=Math.round(raw/SNAP_STEP)*SNAP_STEP;return Math.abs(raw-sn)<SNAP_THRESH?sn:raw;}
function isSnapped(raw){return Math.abs(raw-Math.round(raw/SNAP_STEP)*SNAP_STEP)<SNAP_THRESH;}
// Expose so lcl-float snap button can toggle
window._getSnapEnabled=function(){return snapEnabled;};
window._setSnapEnabled=function(v){
  snapEnabled=v;
  // sync both snap buttons
  var gs=document.getElementById('gsnap');if(gs)gs.classList.toggle('on',v);
  var ps=document.getElementById('pb-gsnap');if(ps)ps.classList.toggle('on',v);
  var lf=document.getElementById('lcl-snap');if(lf)lf.classList.toggle('on',v);
};

(function(){
  const gc=document.getElementById('gc'),ctx=gc.getContext('2d');
  const W=gc.width,H=gc.height,CX=W/2,CY=H/2;
  const COL={x:'#e03040',y:'#22bb55',z:'#3377ee'};
  // Geometry scales with canvas half-size — same proportions as local overlay gizmo
  const _R=Math.min(CX,CY);
  const AL=Math.round(_R*0.68);
  const HIT_MOUSE=14,HIT_TOUCH=48;
  const RING_RADIUS=Math.round(_R*0.68);
  const RING_R={x:RING_RADIUS,y:RING_RADIUS,z:RING_RADIUS};
  let drag=null,hov=null;
  let _grabT=0;
  let gizmoMode='all',axisFilter='all';
  let _gcAxisLocal=true;
  let snapFlash=null;
  // snapEnabled / SNAP_STEP / SNAP_THRESH / snapAngle / isSnapped now at module scope
  function setGizmoMode(m){gizmoMode=m;['move','rotate','scale'].forEach(id=>{const b=document.getElementById('gm-'+id);if(b)b.classList.toggle('on',id===m);const p=document.getElementById('pb-gm-'+id);if(p)p.classList.toggle('on',id===m);});const hints={all:'move · rotate · scale',move:'drag arrows to move',rotate:'drag arcs to rotate',scale:'drag boxes to scale'};const h=document.getElementById('ghint');if(h)h.textContent=hints[m]||'';const lbl=m==='all'?'All':m==='move'?'Mv':m==='rotate'?'Rot':'Sc';const mc=document.getElementById('pb-cyc-mode');if(mc)mc.textContent=lbl;const sc=document.getElementById('sb-cyc-mode');if(sc)sc.textContent=lbl;draw();if(window._pbGcDraw)window._pbGcDraw();}
  function setAxisFilter(a){axisFilter=a;['all','x','y','z'].forEach(id=>{const b=document.getElementById('ga-'+id);if(b)b.classList.toggle('on',id===a);const p=document.getElementById('pb-ax-'+id);if(p)p.classList.toggle('on',id===a);});const albl=a==='all'?'All':a.toUpperCase();const sca=document.getElementById('sb-cyc-axis');if(sca)sca.textContent=albl;draw();if(window._pbGcDraw)window._pbGcDraw();}
  window._setAxisFilter=setAxisFilter;
  window._setGizmoMode=setGizmoMode;
  window._getGizmoMode=function(){return gizmoMode;};
  window._gcToggleAxisMode=function(){
    _gcAxisLocal=!_gcAxisLocal;
    var lbl=_gcAxisLocal?'LCL':'WLD';
    ['gc-axmode','pb-gc-axmode'].forEach(function(id){
      var b=document.getElementById(id);
      if(b){b.textContent=lbl; b.classList.toggle('on',_gcAxisLocal);}
    });
    draw();if(window._pbGcDraw)window._pbGcDraw();
  };
  ['move','rotate','scale'].forEach(m=>{const b=document.getElementById('gm-'+m);if(b)b.addEventListener('click',()=>setGizmoMode(m));const p=document.getElementById('pb-gm-'+m);if(p)p.addEventListener('click',()=>setGizmoMode(m));});
  ['all','x','y','z'].forEach(a=>{const b=document.getElementById('ga-'+a);if(b)b.addEventListener('click',()=>setAxisFilter(a));const p=document.getElementById('pb-ax-'+a);if(p)p.addEventListener('click',()=>setAxisFilter(a));});
  // Perspective projection — ONLY used for applyDrag delta math, never for drawing
  // v17: ALL drawing uses orthographic projection via camera right/up.
  // This guarantees rings are perfect circles and handles sit exactly on them.
  function _od(worldAxis){
    const ac=activeCam();
    const rx=worldAxis.dot(new THREE.Vector3().setFromMatrixColumn(ac.matrixWorld,0));
    const ry=worldAxis.dot(new THREE.Vector3().setFromMatrixColumn(ac.matrixWorld,1));
    return{nx:rx,ny:-ry}; // NOT normalised — preserves true screen scale for rings
  }
  // Ortho ring bases: da,db are raw (un-normalised) screen offsets per unit world distance
  function _ora(ax){const p={x:['y','z'],y:['x','z'],z:['x','y']};const[a,b]=p[ax];return{da:_od(WORLD[a]),db:_od(WORLD[b])};}
  // Ortho signed axis direction for shafts/arrows/boxes (unit-length for consistent AL distance)
  function _oDir(ax){const d=_od(WORLD[ax]);const len=Math.sqrt(d.nx*d.nx+d.ny*d.ny)||1;return{nx:d.nx/len,ny:d.ny/len};}
  // v17: arrow/box always points toward camera hemisphere
  function _axisSign(ax){const c=cameraLookDir(),w=WORLD[ax];return(w.x*c.x+w.y*c.y+w.z*c.z)>=0?1:-1;}
  function _signedTip(ax){const s=_axisSign(ax),d=_oDir(ax);return{x:CX+d.nx*s*AL,y:CY+d.ny*s*AL,s,d};}
  // v17: 120° handle placement — aspect-ratio-corrected angle matching.
  // v19: handle at most camera-facing point on its ring, then slide along arc to avoid overlap.
  // Returns {x,y,t,tx,ty} — screen position, ring angle, and tangent direction at that point.
  // MIN_SEP: minimum screen-pixel separation between any two handles before sliding kicks in.
  const HANDLE_MIN_SEP=28;
  function _handleAngles(){
    const camDir=cameraLookDir();
    const axes=['x','y','z'];
    // Step 1: unconstrained best-t for each ring (most camera-facing point)
    const result={};
    axes.forEach(function(ax){
      const{da3,db3}=ringAxes3D(ax);
      const STEPS=64;var bestT=0,bestDot=-Infinity;
      for(var i=0;i<STEPS;i++){
        const t=(i/STEPS)*Math.PI*2,ct=Math.cos(t),st=Math.sin(t);
        const fw=(da3.x*ct+db3.x*st)*camDir.x+(da3.y*ct+db3.y*st)*camDir.y+(da3.z*ct+db3.z*st)*camDir.z;
        if(fw>bestDot){bestDot=fw;bestT=t;}
      }
      result[ax]={t:bestT};
    });
    // Step 2: compute screen positions using ortho ring bases
    function screenPos(ax,t){
      const{da,db}=_ora(ax),ct=Math.cos(t),st=Math.sin(t);
      return{x:CX+da.nx*ct*RING_RADIUS+db.nx*st*RING_RADIUS,
             y:CY+da.ny*ct*RING_RADIUS+db.ny*st*RING_RADIUS};
    }
    // Step 3: slide handles apart if too close — one pass over all 3 pairs
    const pairs=[['x','y'],['x','z'],['y','z']];
    pairs.forEach(function(pair){
      const a=pair[0],b=pair[1];
      var pa=screenPos(a,result[a].t),pb=screenPos(b,result[b].t);
      var dist=Math.hypot(pa.x-pb.x,pa.y-pb.y);
      if(dist>=HANDLE_MIN_SEP)return;
      // Slide the handle that's less "optimally placed" (lower dot product with camDir)
      // We slide it along its ring in the direction that increases separation.
      const{da3:da3a,db3:db3a}=ringAxes3D(a);
      const{da3:da3b,db3:db3b}=ringAxes3D(b);
      const dotA=(da3a.x*Math.cos(result[a].t)+db3a.x*Math.sin(result[a].t))*camDir.x+
                 (da3a.y*Math.cos(result[a].t)+db3a.y*Math.sin(result[a].t))*camDir.y+
                 (da3a.z*Math.cos(result[a].t)+db3a.z*Math.sin(result[a].t))*camDir.z;
      const dotB=(da3b.x*Math.cos(result[b].t)+db3b.x*Math.sin(result[b].t))*camDir.x+
                 (da3b.y*Math.cos(result[b].t)+db3b.y*Math.sin(result[b].t))*camDir.y+
                 (da3b.z*Math.cos(result[b].t)+db3b.z*Math.sin(result[b].t))*camDir.z;
      // Slide the one with lower dot (less ideally placed) since it costs less visibility
      const slideAx=(dotA<=dotB)?a:b;
      const{da,db}=_ora(slideAx);
      const step=0.06; // radians per nudge
      var t=result[slideAx].t;
      for(var iter=0;iter<52;iter++){
        // Try both +step and -step, pick the one that increases separation more
        const tp=t+step,tm=t-step;
        const pp=screenPos(slideAx,tp),pm=screenPos(slideAx,tm);
        const otherAx=(slideAx===a)?b:a;
        const po=screenPos(otherAx,result[otherAx].t);
        const dp=Math.hypot(pp.x-po.x,pp.y-po.y);
        const dm=Math.hypot(pm.x-po.x,pm.y-po.y);
        t=(dp>=dm)?tp:tm;
        if(Math.hypot(screenPos(slideAx,t).x-po.x,screenPos(slideAx,t).y-po.y)>=HANDLE_MIN_SEP)break;
      }
      result[slideAx].t=t;
    });
    // Step 4: attach screen position and tangent to each result
    axes.forEach(function(ax){
      const{da,db}=_ora(ax),t=result[ax].t,ct=Math.cos(t),st=Math.sin(t);
      result[ax].x=CX+da.nx*ct*RING_RADIUS+db.nx*st*RING_RADIUS;
      result[ax].y=CY+da.ny*ct*RING_RADIUS+db.ny*st*RING_RADIUS;
      // Tangent at t: d/dt of (da*cos+db*sin)*R = (-da*sin+db*cos)*R — normalise for orientation
      const tx=-da.nx*st+db.nx*ct,ty=-da.ny*st+db.ny*ct;
      const tl=Math.sqrt(tx*tx+ty*ty)||1;
      result[ax].tx=tx/tl;result[ax].ty=ty/tl;
    });
    return result;
  }
  // Thin wrapper for hit test (returns just t per axis)
  // v17: shaft drawn with ortho direction — consistent with rings
  // v17: arrow uses ortho direction — tip, shaft and head all consistent
  // v21: FLAT 2D PIE SEGMENTS — three equal 120° arcs on screen.
  // Assignment: each segment angle is compared against projected 3D axes;
  // the axis whose projected screen direction is closest to that segment gets it.
  // Returns [{ax, midAngle, startAngle, endAngle}, ...] sorted by draw order.
  // ── New arc system (v28) ────────────────────────────────────────
  var GC_RING_R   = Math.round(_R*0.68); // ring radius — proportional to half-canvas
  var GC_GAP      = 0.22;
  var GC_ARC_BOUNDS = {x:['z','y'], y:['z','x'], z:['x','y']};
  var GC_ARROW    = Math.round(_R*0.76); // arrow tip stays within canvas with margin
  var GC_HEAD_S   = Math.round(_R*0.11);
  var GC_HEAD_L   = Math.round(_R*0.15);
  var GC_BOX_S    = Math.round(_R*0.11);
  var GC_CENTER_R = Math.round(_R*0.17);
  var _gcLayout   = null;
  var _gcScale    = false; // false=move arrows, true=scale squares

  function _gcComputeLayout(){
    // Reuse camera matrixWorld columns (same as _od) — correct canvas-space projection
    // Supports local quaternion by pre-rotating each world axis
    var q = _gcAxisLocal ? surfGroup.quaternion : new THREE.Quaternion();
    var ac = activeCam();
    var camR = new THREE.Vector3().setFromMatrixColumn(ac.matrixWorld, 0); // right
    var camU = new THREE.Vector3().setFromMatrixColumn(ac.matrixWorld, 1); // up
    var camDir = new THREE.Vector3().subVectors(ac.position, surfPos).normalize();

    var axisAngles={}, flipped={};
    ['x','y','z'].forEach(function(ax){
      var dir = WORLD[ax].clone().applyQuaternion(q).normalize();
      flipped[ax] = dir.dot(camDir) < 0;
      if(flipped[ax]) dir.negate();
      // Canvas-space direction: project onto camera right and up
      var nx = dir.dot(camR);
      var ny = -dir.dot(camU); // flip Y for canvas
      axisAngles[ax] = Math.atan2(ny, nx);
    });
    function N(a){return((a%(Math.PI*2))+Math.PI*2)%(Math.PI*2);}
    var arcs={};
    ['x','y','z'].forEach(function(ax){
      var bA=GC_ARC_BOUNDS[ax][0], bB=GC_ARC_BOUNDS[ax][1];
      var s=N(axisAngles[bA]), e=N(axisAngles[bB]), own=N(axisAngles[ax]);
      var spanCCW=(e-s+Math.PI*2)%(Math.PI*2);
      var ownInCCW=((own-s+Math.PI*2)%(Math.PI*2))<spanCCW;
      var arcStart,arcEnd;
      if(!ownInCCW){arcStart=s+GC_GAP; arcEnd=s+spanCCW-GC_GAP;}
      else          {arcStart=e+GC_GAP; arcEnd=e+(Math.PI*2-spanCCW)-GC_GAP;}
      arcs[ax]={start:arcStart, end:arcEnd};
    });
    _gcLayout={cx:CX, cy:CY, axisAngles:axisAngles, flipped:flipped, arcs:arcs};
  }


  function _gcComputeArcs(){
    // _oDir/_axisSign already handle hemisphere flip — use them directly
    var axisAngles={};
    ['x','y','z'].forEach(function(ax){
      var d=_oDir(ax), s=_axisSign(ax);
      axisAngles[ax]=Math.atan2(d.ny*s, d.nx*s);
    });
    function N(a){return((a%(Math.PI*2))+Math.PI*2)%(Math.PI*2);}
    var arcs={};
    ['x','y','z'].forEach(function(ax){
      var bA=GC_ARC_BOUNDS[ax][0], bB=GC_ARC_BOUNDS[ax][1];
      var s=N(axisAngles[bA]), e=N(axisAngles[bB]), own=N(axisAngles[ax]);
      var spanCCW=(e-s+Math.PI*2)%(Math.PI*2);
      var ownInCCW=((own-s+Math.PI*2)%(Math.PI*2))<spanCCW;
      var arcStart,arcEnd;
      if(!ownInCCW){arcStart=s+GC_GAP; arcEnd=s+spanCCW-GC_GAP;}
      else         {arcStart=e+GC_GAP; arcEnd=e+(Math.PI*2-spanCCW)-GC_GAP;}
      arcs[ax]={start:arcStart, end:arcEnd};
    });
    return{axisAngles:axisAngles, arcs:arcs};
  }

  function _gcDraw(){
    // During a rotate drag, freeze the layout so arrows/arcs don't jitter as plane moves
    if(drag&&drag.h&&drag.h[0]==='r'&&drag.frozenLayout){
      _gcLayout=drag.frozenLayout;
    } else {
      _gcComputeLayout();
    }
    ctx.clearRect(0,0,W,H);
    if(!_gcLayout) return;
    var cx=_gcLayout.cx, cy=_gcLayout.cy;
    var axisAngles=_gcLayout.axisAngles, arcs=_gcLayout.arcs, flipped=_gcLayout.flipped;
    var axes=axisFilter==='all'?['x','y','z']:[axisFilter];
    var activeDrag=drag?drag.h:null;

    var showArcs  =(gizmoMode==='all'||gizmoMode==='rotate');
    var showArrows=(gizmoMode==='all'||gizmoMode==='move'||gizmoMode==='scale');

    axes.forEach(function(ax){
      var col=COL[ax];
      var arc=arcs[ax];
      var angle=axisAngles[ax];
      var ax2c=Math.cos(angle), ay2s=Math.sin(angle);
      var arcHlit=(hov==='r'+ax)||(activeDrag==='r'+ax);
      var arwHlit=(hov==='a'+ax||hov==='s'+ax)||(activeDrag==='a'+ax||activeDrag==='s'+ax);

      // ── Arc ──
      if(showArcs){
        ctx.save();
        if(arcHlit){ctx.shadowColor=col;ctx.shadowBlur=10;}
        ctx.beginPath();
        ctx.arc(cx,cy,GC_RING_R,arc.start,arc.end);
        ctx.strokeStyle=col;
        ctx.lineWidth=arcHlit?Math.round(_R*0.09):Math.round(_R*0.065);
        ctx.lineCap='round';
        ctx.globalAlpha=arcHlit?1:0.45;
        ctx.stroke();
        ctx.restore();
      }

      // ── Arrow shaft + head / scale box ──
      if(showArrows){
        var shaftS=GC_RING_R*0.55;
        var ex=cx+ax2c*GC_ARROW, ey=cy+ay2s*GC_ARROW;
        ctx.save();
        if(arwHlit){ctx.shadowColor=col;ctx.shadowBlur=8;}
        ctx.globalAlpha=arwHlit?1:0.85;
        ctx.strokeStyle=col;
        ctx.lineWidth=arwHlit?Math.round(_R*0.055):Math.round(_R*0.04);
        ctx.lineCap='round';
        ctx.beginPath();
        ctx.moveTo(cx+ax2c*shaftS, cy+ay2s*shaftS);
        ctx.lineTo(ex, ey); ctx.stroke();
        // tail dot
        ctx.beginPath();
        ctx.arc(cx+ax2c*shaftS,cy+ay2s*shaftS,arwHlit?Math.round(_R*0.055):Math.round(_R*0.03),0,Math.PI*2);
        ctx.fillStyle=col; ctx.fill();

        if(_gcScale||gizmoMode==='scale'){
          var bx2=ex+ax2c*(GC_HEAD_L*0.5), by2=ey+ay2s*(GC_HEAD_L*0.5);
          var hs=arwHlit?GC_BOX_S*1.2:GC_BOX_S;
          ctx.save(); ctx.translate(bx2,by2); ctx.rotate(angle+Math.PI/4);
          ctx.globalAlpha=arwHlit?0.9:0.65;
          ctx.fillStyle=col; ctx.fillRect(-hs,-hs,hs*2,hs*2); ctx.restore();
        } else {
          var px=ay2s, py=-ax2c;
          ctx.beginPath();
          ctx.moveTo(ex+ax2c*GC_HEAD_L, ey+ay2s*GC_HEAD_L);
          ctx.lineTo(ex+px*GC_HEAD_S, ey+py*GC_HEAD_S);
          ctx.lineTo(ex-px*GC_HEAD_S, ey-py*GC_HEAD_S);
          ctx.closePath(); ctx.fillStyle=col; ctx.fill();
        }
        ctx.restore();

        // Label — clamped to canvas bounds
        ctx.save();
        ctx.font='bold '+Math.round(_R*0.12)+'px DM Mono,monospace';
        ctx.textAlign='center'; ctx.textBaseline='middle';
        ctx.fillStyle=col; ctx.globalAlpha=arwHlit?1:0.88;
        var lblDist=GC_ARROW+GC_HEAD_L+Math.round(_R*0.05);
        var lx2=cx+ax2c*lblDist, ly2=cy+ay2s*lblDist;
        var mg=6; lx2=Math.max(mg,Math.min(W-mg,lx2)); ly2=Math.max(mg,Math.min(H-mg,ly2));
        ctx.fillText((flipped[ax]?'-':'')+ax.toUpperCase(), lx2, ly2);
        ctx.restore();
      }
    });

    // ── Center button ──
    var cenHlit=(hov==='su')||(activeDrag==='su'||activeDrag==='cd');
    ctx.save();
    if(_gcScale){
      ctx.translate(cx,cy); ctx.rotate(Math.PI/4);
      var ds=cenHlit?Math.round(_R*0.12):Math.round(_R*0.09);
      ctx.fillStyle='rgba(255,255,255,0.92)'; ctx.fillRect(-ds,-ds,ds*2,ds*2);
      ctx.fillStyle=cenHlit?'rgba(255,220,60,1)':'rgba(255,200,60,0.85)';
      var di=cenHlit?Math.round(_R*0.09):Math.round(_R*0.065); ctx.fillRect(-di,-di,di*2,di*2);
    } else {
      ctx.beginPath(); ctx.arc(cx,cy,cenHlit?Math.round(_R*0.09):Math.round(_R*0.065),0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.90)'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx,cy,cenHlit?Math.round(_R*0.065):Math.round(_R*0.05),0,Math.PI*2);
      ctx.fillStyle='rgba(80,80,110,0.65)'; ctx.fill();
    }
    ctx.restore();

    // LCL/WLD indicator
    ctx.save();
    ctx.font='bold '+Math.round(_R*0.10)+'px DM Mono,monospace';
    ctx.textAlign='left'; ctx.textBaseline='top';
    ctx.fillStyle=_gcAxisLocal?'rgba(255,220,100,0.85)':'rgba(160,200,255,0.85)';
    ctx.fillText(_gcAxisLocal?'LCL':'WLD', 4, 4);
    ctx.restore();

    // Snap flash
    if(snapFlash&&(performance.now()-snapFlash.t)<500){
      var sfa=1-(performance.now()-snapFlash.t)/500;
      ctx.save(); ctx.globalAlpha=sfa*0.7;
      ctx.strokeStyle=COL[snapFlash.ax]; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(cx,cy,GC_RING_R,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }
  }

  function draw(){
    // When strokes are selected, draw the selection gizmo on gc canvas instead
    if(selectedStrokes.length > 0 && window._sgGcDraw){
      window._sgGcDraw();
      var sgCanvas = document.getElementById('sg-gc');
      if(sgCanvas){
        ctx.clearRect(0,0,W,H);
        var fitSz = Math.min(W,H);
        var ox = (W - fitSz)/2, oy = (H - fitSz)/2;
        ctx.drawImage(sgCanvas, ox, oy, fitSz, fitSz);
      }
      return;
    }
    // When a primitive is selected, draw the pgizmo on gc canvas instead
    if(window._selectedPrim_get && window._selectedPrim_get() && window._pgGcDraw){
      window._pgGcDraw();
      var pgCanvas = document.getElementById('pg-gc');
      if(pgCanvas){
        ctx.clearRect(0,0,W,H);
        var fitSz2 = Math.min(W,H);
        var ox2 = (W - fitSz2)/2, oy2 = (H - fitSz2)/2;
        ctx.drawImage(pgCanvas, ox2, oy2, fitSz2, fitSz2);
      }
      return;
    }
    _gcDraw();
  }
  function hitTest(mx,my,isTouch){
    var axes=axisFilter==='all'?['x','y','z']:[axisFilter];
    var showArcs  =(gizmoMode==='all'||gizmoMode==='rotate');
    var showArrows=(gizmoMode==='all'||gizmoMode==='move'||gizmoMode==='scale'||_gcScale);
    var arrowW=isTouch?HIT_TOUCH:HIT_MOUSE; // perpendicular hit width for arrows
    var dist=Math.hypot(mx-CX,my-CY);
    var angle=Math.atan2(my-CY,mx-CX);
    var arcTol = isTouch ? 18 : 9; // arc ring tolerance

    // 1. Center dot — uniform scale / mode toggle
    if(showArrows && dist<=GC_CENTER_R+(isTouch?10:2)) return 'su';

    var shaftStart=GC_RING_R*0.45;
    var shaftEnd=GC_ARROW+GC_HEAD_L;
    var inArcZone = dist>=(GC_RING_R-arcTol) && dist<=(GC_RING_R+arcTol);

    // For touch: test arrows first when clearly outside the arc ring zone
    // (prevents arcs from stealing taps aimed at arrow shafts)
    if(isTouch && showArrows && !inArcZone && _gcLayout){
      for(var ia=0;ia<axes.length;ia++){
        var axa=axes[ia];
        var anga=_gcLayout.axisAngles[axa];
        var acosa=Math.cos(anga),asina=Math.sin(anga);
        var alonga=(mx-CX)*acosa+(my-CY)*asina;
        var perpa =Math.abs((mx-CX)*(-asina)+(my-CY)*acosa);
        if(alonga>=shaftStart&&alonga<=shaftEnd&&perpa<arrowW){
          return (_gcScale||gizmoMode==='scale')?'s'+axa:'a'+axa;
        }
      }
    }

    // 2. Arc ring — rotate
    // Use _gcLayout.arcs (same data as drawing). _gcComputeArcs() used a different
    // projection path (_oDir/_axisSign) that disagreed with _gcComputeLayout() (camR/camU),
    // so hit zones were misaligned from the drawn arcs — rotate was broken on touch.
    if(showArcs && inArcZone && _gcLayout){
      function normA3(a){return((a%(Math.PI*2))+Math.PI*2)%(Math.PI*2);}
      for(var i3=0;i3<axes.length;i3++){
        var ax3=axes[i3];
        var arc3=_gcLayout.arcs[ax3];
        var s3=normA3(arc3.start),e3=normA3(arc3.end),a3=normA3(angle);
        var hit3=(e3>=s3)?(a3>=s3&&a3<=e3):(a3>=s3||a3<=e3);
        if(hit3){_grabT=angle;return'r'+ax3;}
      }
    }

    // 3. Arrow shafts — move / scale
    if(showArrows&&_gcLayout){
      for(var i=0;i<axes.length;i++){
        var ax=axes[i];
        var ang=_gcLayout.axisAngles[ax];
        var acos=Math.cos(ang),asin=Math.sin(ang);
        // Project pointer onto axis direction and perpendicular
        var along=(mx-CX)*acos+(my-CY)*asin;
        var perp =Math.abs((mx-CX)*(-asin)+(my-CY)*acos);
        if(along>=shaftStart&&along<=shaftEnd&&perp<arrowW){
          return (_gcScale||gizmoMode==='scale')?'s'+ax:'a'+ax;
        }
      }
    }

    return null;
  }
  function getPos(e){const r=gc.getBoundingClientRect(),src=e.touches&&e.touches.length>0?e.touches[0]:e.changedTouches&&e.changedTouches.length>0?e.changedTouches[0]:e;var rw=r.width||1,rh=r.height||1;return{x:(src.clientX-r.left)*(W/rw),y:(src.clientY-r.top)*(H/rh)};}
  function applyDrag(p){if(!drag)return;const dx=p.x-drag.sx,dy=p.y-drag.sy,h=drag.h;
  var _cgPrecVal='';
  if(h.startsWith('a')){
    const ax=h[1];
    var _aLayout=drag.frozenLayout||_gcLayout;
    if(_aLayout&&_aLayout.axisAngles){
      // Use frozen layout screen angle — consistent with drawn arrow, immune to drift
      var gang=_aLayout.axisAngles[ax];
      var proj=(dx*Math.cos(gang)+dy*Math.sin(gang))*0.028;
      var q=_gcAxisLocal?drag.oQuat:new THREE.Quaternion();
      var worldDir=WORLD[ax].clone().applyQuaternion(q).normalize();
      if(_aLayout.flipped[ax]) worldDir.negate();
      surfPos.copy(drag.oPos).addScaledVector(worldDir,proj);
      if(window._precisionMode) _cgPrecVal=ax.toUpperCase()+' Δ'+formatDist(proj);
    } else {
      const d=aDir(ax),proj=(dx*d.nx+dy*d.ny)*.032;
      surfPos.copy(drag.oPos);if(ax==='x')surfPos.x+=proj;if(ax==='y')surfPos.y+=proj;if(ax==='z')surfPos.z+=proj;
      if(window._precisionMode) _cgPrecVal=ax.toUpperCase()+' Δ'+formatDist(proj);
    }
    syncSurf();
  }else if(h.startsWith('r')){
    const ax=h[1];
    const grabAngle=drag.grabT;
    const tx=-Math.sin(grabAngle),ty=Math.cos(grabAngle);
    var proj=(dx*tx+dy*ty)*0.022;
    // Flip sign for z arc (arc direction convention)
    if(ax==='z') proj=-proj;
    // Flip if axis was shown flipped
    var _rLayout=drag.frozenLayout||_gcLayout;
    if(_rLayout&&_rLayout.flipped[ax]) proj=-proj;

    if(_gcAxisLocal){
      // LOCAL: rotate around the surface's own local axis — compose quaternion delta
      // Local axis in world space = WORLD[ax] rotated by current surfGroup quaternion
      var localAxis = WORLD[ax].clone().applyQuaternion(drag.oQuat).normalize();
      var doSnap2=snapEnabled||drag.shiftHeld;
      var rawProj=proj;
      if(doSnap2){
        // Snap the total accumulated angle
        var snapped=snapAngle(rawProj);
        var didSnap2=isSnapped(rawProj);
        if(didSnap2){snapFlash={ax,angle:snapped,t:performance.now()};proj=snapped;}
      }
      var delta=new THREE.Quaternion().setFromAxisAngle(localAxis, proj);
      var newQuat=drag.oQuat.clone().premultiply(delta).normalize();
      // Strip base-plane quaternion before decomposing to surfEuler
      // syncSurf will re-apply bq, so surfEuler must only hold the user rotation
      var bqCard=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),PNORMALS[curPlane]);
      var userQuat=newQuat.clone().multiply(bqCard.clone().invert());
      surfEuler.setFromQuaternion(userQuat.normalize(),'XYZ');
      if(window._precisionMode) _cgPrecVal=ax.toUpperCase()+': '+(proj*180/Math.PI).toFixed(1)+'°';
    } else {
      // WORLD: rotate around global axis (original behaviour)
      surfEuler.copy(drag.oEuler);
      var rawAngle;
      if(ax==='x')rawAngle=drag.oEuler.x+proj;
      if(ax==='y')rawAngle=drag.oEuler.y+proj;
      if(ax==='z')rawAngle=drag.oEuler.z+proj;
      const doSnap=snapEnabled||drag.shiftHeld,finalAngle=doSnap?snapAngle(rawAngle):rawAngle,didSnap=doSnap&&isSnapped(rawAngle);
      if(ax==='x')surfEuler.x=finalAngle;if(ax==='y')surfEuler.y=finalAngle;if(ax==='z')surfEuler.z=finalAngle;
      if(didSnap)snapFlash={ax,angle:finalAngle,t:performance.now()};
      const deg=Math.round(THREE.MathUtils.radToDeg(finalAngle)%360);
      document.getElementById('ghint').textContent=(didSnap?'⊙ ':'')+ax.toUpperCase()+': '+deg+'°'+(doSnap?'  [snapped]':'');
      if(window._precisionMode) _cgPrecVal=ax.toUpperCase()+': '+deg+'°';
    }
    syncSurf();
  }else if(h.startsWith('s')&&h!=='su'){
    const ax=h[1];
    var _sLayout2=drag.frozenLayout||_gcLayout;
    var sgang2=_sLayout2?_sLayout2.axisAngles[ax]:0;
    var sproj=(dx*Math.cos(sgang2)+dy*Math.sin(sgang2))*0.018;
    var sv=drag.oSA.clone();
    if(ax==='x')sv.x=Math.max(.05,sv.x+sproj);
    if(ax==='y')sv.y=Math.max(.05,sv.y+sproj);
    if(ax==='z')sv.z=Math.max(.05,sv.z+sproj);
    surfScaleAxes.copy(sv);syncSurf();
    if(window._precisionMode) _cgPrecVal=ax.toUpperCase()+': ×'+sv[ax].toFixed(2);
  }else if(h==='su'){surfScale=Math.max(.05,drag.oSc-dy*.01);syncSurf();
    if(window._precisionMode) _cgPrecVal='×'+surfScale.toFixed(2);
  }
  // Show precision in ghint when precision mode is active
  if(window._precisionMode && _cgPrecVal){
    document.getElementById('ghint').textContent=_cgPrecVal;
  }
  draw();}

  // ── Selection delegation: when strokes selected, gc canvas routes to sgizmo ──
  // Maps gc canvas coords (150×130) to sg-gc coords (148×148)
  function _gcToSgPos(gcX,gcY){
    var fitSz=Math.min(W,H); // 130
    var ox=(W-fitSz)/2, oy=(H-fitSz)/2;
    var sgW=148; // sg-gc canvas size
    return{x:(gcX-ox)/fitSz*sgW, y:(gcY-oy)/fitSz*sgW};
  }
  window._gcToSgPos=_gcToSgPos;
  var _gcSelDrag=false; // track if gc is currently routing a drag to sgizmo
  var _gcPrimDrag=false; // track if gc is currently routing a drag to pgizmo

  gc.addEventListener('mousedown',e=>{
    if(selectedStrokes.length>0 && window._sgHitTest){
      e.stopPropagation();var _sp=getPos(e),sp=_gcToSgPos(_sp.x,_sp.y);
      var h=window._sgHitTest(sp.x,sp.y,false);
      if(h){window._sgStartDrag(sp,h,e.clientX,e.clientY);_gcSelDrag=true;draw();}
      return;
    }
    if(window._selectedPrim_get && window._selectedPrim_get() && window._pgHitTest){
      e.stopPropagation();var _pp=getPos(e),pp=_gcToSgPos(_pp.x,_pp.y);
      var h2=window._pgHitTest(pp.x,pp.y,false);
      if(h2){window._pgStartDrag(pp,h2,e.clientX,e.clientY);_gcPrimDrag=true;draw();}
      return;
    }
    var p=getPos(e),h=hitTest(p.x,p.y,false);if(!h)return;e.stopPropagation();drag={h,sx:p.x,sy:p.y,grabT:_grabT,oPos:surfPos.clone(),oEuler:surfEuler.clone(),oQuat:surfGroup.quaternion.clone(),oSc:surfScale,oSA:surfScaleAxes.clone(),shiftHeld:e.shiftKey,_startClientX:e.clientX,_startClientY:e.clientY,frozenLayout:_gcLayout?JSON.parse(JSON.stringify(_gcLayout)):null};hov=h;draw();});
  window.addEventListener('keydown',e=>{if(drag&&e.key==='Shift')drag.shiftHeld=true;});window.addEventListener('keyup',e=>{if(drag&&e.key==='Shift')drag.shiftHeld=false;});
  gc.addEventListener('mousemove',e=>{
    if(selectedStrokes.length>0 && window._sgHitTest){
      e.stopPropagation();var _sp=getPos(e),sp=_gcToSgPos(_sp.x,_sp.y);
      if(_gcSelDrag && window._sgApplyDrag){window._sgApplyDrag(sp);draw();}
      else{var h=window._sgHitTest(sp.x,sp.y,false);if(window._sgSetHov)window._sgSetHov(h);draw();}
      return;
    }
    if(_gcPrimDrag || (window._selectedPrim_get && window._selectedPrim_get() && window._pgHitTest)){
      e.stopPropagation();var _pp=getPos(e),pp=_gcToSgPos(_pp.x,_pp.y);
      if(_gcPrimDrag && window._pgApplyDrag){window._pgApplyDrag(pp);draw();}
      else if(window._pgSetHov){window._pgSetHov(window._pgHitTest(pp.x,pp.y,false));draw();}
      return;
    }
    var p=getPos(e);if(!drag){var h=hitTest(p.x,p.y,false);if(h!==hov){hov=h;draw();}var hints={ax:'drag → move X',ay:'drag → move Y',az:'drag → move Z',rx:'drag → rotate X',ry:'drag → rotate Y',rz:'drag → rotate Z',sx:'drag → scale X',sy:'drag → scale Y',sz:'drag → scale Z',su:'drag ↕ uniform scale'};document.getElementById('ghint').textContent=h?(hints[h]||h):'move · rotate · scale';return;}e.stopPropagation();applyDrag(p);});
  gc.addEventListener('mouseup',e=>{
    if(_gcSelDrag){
      if(window._sgGetDrag){var sd=window._sgGetDrag();if(sd&&sd.h==='su'){var ddx=e.clientX-(sd._scx||0),ddy=e.clientY-(sd._scy||0);if(Math.hypot(ddx,ddy)<5){window._sgScaleModeToggle();_gcSelDrag=false;draw();return;}}}
      if(window._sgEndDrag)window._sgEndDrag();_gcSelDrag=false;draw();return;
    }
    if(_gcPrimDrag){
      if(window._pgGetDrag){var pd=window._pgGetDrag();if(pd&&pd.h==='su'){var ddx2=e.clientX-(pd._scx||0),ddy2=e.clientY-(pd._scy||0);if(Math.hypot(ddx2,ddy2)<5){window._pgScaleModeToggle();_gcPrimDrag=false;draw();return;}}}
      if(window._pgEndDrag)window._pgEndDrag();_gcPrimDrag=false;draw();return;
    }
    if(drag&&drag.h==='su'){
      var ddx=e.clientX-(drag._startClientX||0),ddy=e.clientY-(drag._startClientY||0);
      if(Math.hypot(ddx,ddy)<5){_gcScale=!_gcScale; drag=null; draw(); return;}
    }
    drag=null;draw();
  });gc.addEventListener('mouseleave',()=>{if(!drag){hov=null;draw();}});
  gc.addEventListener('touchstart',e=>{
    e.preventDefault();e.stopPropagation();
    if(selectedStrokes.length>0 && window._sgHitTest){
      var p=getPos(e),sp=_gcToSgPos(p.x,p.y);
      var h=window._sgHitTest(sp.x,sp.y,true);
      if(h){var tc=e.touches[0];window._sgStartDrag(sp,h,tc?tc.clientX:0,tc?tc.clientY:0);_gcSelDrag=true;draw();}
      return;
    }
    if(window._selectedPrim_get && window._selectedPrim_get() && window._pgHitTest){
      var p3=getPos(e),pp=_gcToSgPos(p3.x,p3.y);
      var h3=window._pgHitTest(pp.x,pp.y,true);
      if(h3){var tc3=e.touches[0];window._pgStartDrag(pp,h3,tc3?tc3.clientX:0,tc3?tc3.clientY:0);_gcPrimDrag=true;draw();}
      return;
    }
    var p2=getPos(e),h2=hitTest(p2.x,p2.y,true);if(!h2)return;var tc2=e.touches[0];drag={h:h2,sx:p2.x,sy:p2.y,grabT:_grabT,oPos:surfPos.clone(),oEuler:surfEuler.clone(),oQuat:surfGroup.quaternion.clone(),oSc:surfScale,oSA:surfScaleAxes.clone(),_startClientX:tc2?tc2.clientX:0,_startClientY:tc2?tc2.clientY:0,frozenLayout:_gcLayout?JSON.parse(JSON.stringify(_gcLayout)):null};hov=h2;draw();},{passive:false});
  gc.addEventListener('touchmove',e=>{e.preventDefault();e.stopPropagation();
    if(_gcSelDrag && window._sgApplyDrag){var p=getPos(e),sp=_gcToSgPos(p.x,p.y);window._sgApplyDrag(sp);draw();return;}
    if(_gcPrimDrag && window._pgApplyDrag){var p4=getPos(e),pp=_gcToSgPos(p4.x,p4.y);window._pgApplyDrag(pp);draw();return;}
    if(drag)applyDrag(getPos(e));},{passive:false});
  gc.addEventListener('touchend',e=>{
    if(_gcSelDrag){
      if(window._sgGetDrag&&e.changedTouches.length){var sd=window._sgGetDrag();if(sd&&sd.h==='su'){var t=e.changedTouches[0];var ddx=t.clientX-(sd._scx||0),ddy=t.clientY-(sd._scy||0);if(Math.hypot(ddx,ddy)<8){window._sgScaleModeToggle();_gcSelDrag=false;draw();return;}}}
      if(window._sgEndDrag)window._sgEndDrag();_gcSelDrag=false;draw();return;
    }
    if(_gcPrimDrag){
      if(window._pgGetDrag&&e.changedTouches.length){var pd=window._pgGetDrag();if(pd&&pd.h==='su'){var t2=e.changedTouches[0];var ddx2=t2.clientX-(pd._scx||0),ddy2=t2.clientY-(pd._scy||0);if(Math.hypot(ddx2,ddy2)<8){window._pgScaleModeToggle();_gcPrimDrag=false;draw();return;}}}
      if(window._pgEndDrag)window._pgEndDrag();_gcPrimDrag=false;draw();return;
    }
    if(drag&&drag.h==='su'&&e.changedTouches.length){
      var t=e.changedTouches[0];
      var ddx=t.clientX-(drag._startClientX||0),ddy=t.clientY-(drag._startClientY||0);
      if(Math.hypot(ddx,ddy)<8){_gcScale=!_gcScale; drag=null; hov=null; draw(); return;}
    }
    drag=null;hov=null;draw();
  });
  gc.addEventListener('wheel',e=>{e.preventDefault();e.stopPropagation();surfScale=Math.max(.05,Math.min(10,surfScale-e.deltaY*.0025));syncSurf();draw();},{passive:false});
  document.getElementById('greset').addEventListener('click',()=>{surfPos.set(0,0,0);surfEuler.set(0,0,0);surfScale=1;surfScaleAxes.set(1,1,1);syncSurf();draw();});
  document.getElementById('gsnap').addEventListener('click',function(){window._setSnapEnabled(!snapEnabled);document.getElementById('ghint').textContent=snapEnabled?'snap 45° ON':'snap OFF';setTimeout(()=>document.getElementById('ghint').textContent='move · rotate · scale',1200);draw();});

  // ── Align camera to face ─────────────────────────────────────────
  // For plane/loft: faces the plane's world normal head-on.
  // For cube: picks the face most currently facing the viewer; re-tap flips.
  // Cylinder/cone/sphere/none: disabled.
  var _faceAnimRaf=null;
  var _lastFaceNormal=null; // last normal we aligned to, used to flip on re-tap
  function cameraForward(){
    // Current camera look direction
    const{theta,phi,radius,target}=cam;
    if(_fpsMode){
      // FPS: camera at target, looks along spherical forward
      var sinP=Math.sin(phi),cosP=Math.cos(phi);
      var sinT=Math.sin(theta),cosT=Math.cos(theta);
      return new THREE.Vector3(sinP*cosT,sinP*sinT,cosP).normalize();
    }
    // Orbit: camera position = target + spherical, forward = target - camPos
    const px=target.x+radius*Math.sin(phi)*Math.cos(theta);
    const py=target.y+radius*Math.sin(phi)*Math.sin(theta);
    const pz=target.z+radius*Math.cos(phi);
    var f=new THREE.Vector3(target.x-px,target.y-py,target.z-pz);
    return f.normalize();
  }
  function surfaceWorldNormal(){
    // Normal of plane/loft surface = surfGroup quaternion applied to local +Z
    var n=new THREE.Vector3(0,0,1).applyQuaternion(surfGroup.quaternion);
    return n.normalize();
  }
  function cubeFaceNormals(){
    // 6 world-space face normals of the cube, using surfGroup's rotation
    var q=surfGroup.quaternion;
    var bases=[
      new THREE.Vector3(1,0,0),new THREE.Vector3(-1,0,0),
      new THREE.Vector3(0,1,0),new THREE.Vector3(0,-1,0),
      new THREE.Vector3(0,0,1),new THREE.Vector3(0,0,-1)
    ];
    return bases.map(function(v){return v.clone().applyQuaternion(q).normalize();});
  }
  function thetaPhiFromDir(dir){
    // Return {theta, phi} such that camera-to-target = -dir (i.e. camera looks along dir)
    // Camera position relative to target is at -dir * radius. In our spherical form:
    //   relPos = (sin(phi)cos(theta), sin(phi)sin(theta), cos(phi))
    // So relPos = -dir  =>  cos(phi) = -dir.z, and the xy projection points to (-dir.x,-dir.y)
    var relx=-dir.x,rely=-dir.y,relz=-dir.z;
    var phi=Math.acos(Math.max(-1,Math.min(1,relz)));
    // Avoid singularity at poles — when relx/rely near zero, keep current theta
    var xy=Math.hypot(relx,rely);
    var theta;
    if(xy<1e-4)theta=cam.theta;
    else theta=Math.atan2(rely,relx);
    return{theta:theta,phi:phi};
  }
  function shortAngleDelta(from,to){
    var d=to-from;
    while(d>Math.PI)d-=Math.PI*2;
    while(d<-Math.PI)d+=Math.PI*2;
    return d;
  }
  function animateCameraTo(targetTheta,targetPhi,targetCtr,onComplete){
    if(_faceAnimRaf){cancelAnimationFrame(_faceAnimRaf);_faceAnimRaf=null;}
    // Unwrap theta to take short path
    var dTheta=shortAngleDelta(cam.theta,targetTheta);
    var finalTheta=cam.theta+dTheta;
    var startTheta=cam.theta,startPhi=cam.phi;
    var startTgt=cam.target.clone();
    var DUR=250,t0=performance.now();
    function ease(t){return 1-Math.pow(1-t,3);} // ease-out cubic
    function step(){
      var t=(performance.now()-t0)/DUR;
      if(t>=1)t=1;
      var k=ease(t);
      cam.theta=startTheta+(finalTheta-startTheta)*k;
      cam.phi=startPhi+(targetPhi-startPhi)*k;
      cam.target.lerpVectors(startTgt,targetCtr,k);
      updCam();
      if(t<1)_faceAnimRaf=requestAnimationFrame(step);
      else{_faceAnimRaf=null;if(onComplete)onComplete();}
    }
    step();
  }
  function alignCameraToFace(){
    // Disabled for surfaces without a single well-defined face
    if(surfType==='cylinder'||surfType==='cone'||surfType==='sphere'||surfType==='none'){
      var hint=document.getElementById('ghint');
      if(hint){hint.textContent='FACE: not available for '+surfType;setTimeout(()=>{hint.textContent='move · rotate · scale';},1400);}
      return;
    }
    var normal,center=surfPos.clone();
    if(surfType==='cube'){
      var normals=cubeFaceNormals();
      // Find face most facing the viewer (dot with camera forward most negative: face normal opposes camera look dir)
      var fwd=cameraForward();
      var bestDot=Infinity,bestN=null;
      for(var i=0;i<normals.length;i++){
        var d=normals[i].dot(fwd);
        if(d<bestDot){bestDot=d;bestN=normals[i];}
      }
      normal=bestN;
    } else {
      // plane or loft
      normal=surfaceWorldNormal();
    }
    // Check if we're already aligned to this normal (front or back) — if so, flip
    var fwd2=cameraForward();
    var dotFwd=normal.dot(fwd2);
    // dotFwd ≈ -1 means camera looks along -normal (front side aligned)
    // dotFwd ≈ +1 means camera looks along +normal (back side aligned)
    var alreadyFront=dotFwd<-0.995;
    var alreadyBack=dotFwd>0.995;
    if(alreadyFront)normal=normal.clone().multiplyScalar(-1);
    else if(alreadyBack){/* normal stays — go back to front */}
    // Target spherical coords: camera sits along +normal from target, looking down -normal
    var tp=thetaPhiFromDir(normal.clone().multiplyScalar(-1));
    // Guard near poles — if phi is ~0 or ~PI, camera up (0,0,1) degenerates; nudge slightly
    if(tp.phi<0.02)tp.phi=0.02;
    if(tp.phi>Math.PI-0.02)tp.phi=Math.PI-0.02;
    animateCameraTo(tp.theta,tp.phi,center,function(){setOrtho(true);});
    _lastFaceNormal=normal.clone();
  }
  var gface=document.getElementById('gface');
  if(gface)gface.addEventListener('click',alignCameraToFace);
  var pbGface=document.getElementById('pb-gface');
  if(pbGface)pbGface.addEventListener('click',alignCameraToFace);
  window._alignCameraToFace=alignCameraToFace;
  window._animateCameraTo=animateCameraTo;

  // ── Align plane to view ────────────────────────────────────────────
  // Rotates + positions the plane so it faces the camera at a given distance.
  var _gviewDist=5;
  var _gviewFwd=null; // saved forward direction while slider is open
  var _gviewDistWrap=document.getElementById('gview-dist-wrap');
  var _gviewDistSlider=document.getElementById('gview-dist');
  var _gviewDistClose=document.getElementById('gview-dist-close');

  function alignPlaneToView(dist){
    if(surfType==='cylinder'||surfType==='cone'||surfType==='sphere'||surfType==='none'){
      var hint=document.getElementById('ghint');
      if(hint){hint.textContent='VIEW: not available for '+surfType;setTimeout(function(){hint.textContent='move · rotate · scale';},1400);}
      return false;
    }
    // Camera forward direction
    var fwd=cameraForward();
    _gviewFwd=fwd.clone();
    // Plane normal should face the camera => normal = -forward
    var normal=fwd.clone().multiplyScalar(-1);
    // Build a roll-free orientation: plane up should match camera up
    // Camera up = cross(right, forward). Camera right from spherical:
    //   cam pos relative to target = (sin(phi)cos(theta), sin(phi)sin(theta), cos(phi)) * radius
    //   right = cross(up_world, -fwd) but we use the Three.js camera's actual up
    // Simpler: compute camera right as cross(fwd, worldUp), then cam up as cross(right, fwd)
    var worldUp=new THREE.Vector3(0,0,1);
    var right=new THREE.Vector3().crossVectors(fwd,worldUp).normalize();
    // If camera is looking straight up/down, right degenerates — fall back
    if(right.lengthSq()<1e-6){
      right.set(1,0,0);
    }
    var camUp=new THREE.Vector3().crossVectors(right,fwd).normalize();
    // Plane geometry local frame: X=right, Y=up, Z=normal (PlaneGeometry lies in XY, normal +Z)
    // We want finalQ to map: local +Z → normal, local +Y → camUp, local +X → right
    // Build rotation matrix from these basis vectors
    var m4=new THREE.Matrix4();
    // Column-major: col0=right(X), col1=camUp(Y), col2=normal(Z)
    m4.set(
      right.x, camUp.x, normal.x, 0,
      right.y, camUp.y, normal.y, 0,
      right.z, camUp.z, normal.z, 0,
      0, 0, 0, 1
    );
    var finalQ=new THREE.Quaternion().setFromRotationMatrix(m4);
    // syncSurf applies: finalQ = Q(surfEuler) * bq
    // So Q(surfEuler) = finalQ * inverse(bq)
    var bq=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),PNORMALS[curPlane]);
    var bqInv=bq.clone().invert();
    var userQ=finalQ.clone().multiply(bqInv);
    var euler=new THREE.Euler().setFromQuaternion(userQ,'XYZ');
    surfEuler.copy(euler);
    // Position plane at dist units in front of camera target along forward
    surfPos.copy(cam.target).addScaledVector(fwd,dist);
    syncSurf();
    return true;
  }
  function showGviewSlider(){
    if(!_gviewDistWrap)return;
    _gviewDistSlider.value=_gviewDist;
    _gviewDistWrap.classList.add('show');
    if(window._closePrimsStrip) window._closePrimsStrip();
  }
  function hideGviewSlider(){
    if(!_gviewDistWrap)return;
    _gviewDistWrap.classList.remove('show');
    _gviewFwd=null;
  }
  function onGviewClick(){
    if(alignPlaneToView(_gviewDist)){
      showGviewSlider();
    }
  }
  if(_gviewDistSlider){
    _gviewDistSlider.addEventListener('input',function(){
      _gviewDist=parseFloat(this.value);
      if(!_gviewFwd)return;
      // Reposition plane along saved forward at new distance
      surfPos.copy(cam.target).addScaledVector(_gviewFwd,_gviewDist);
      syncSurf();
    });
  }
  if(_gviewDistClose){
    _gviewDistClose.addEventListener('click',hideGviewSlider);
  }
  // Hide slider when drawing starts
  window._hideGviewSlider=hideGviewSlider;

  var gview=document.getElementById('gview');
  if(gview)gview.addEventListener('click',onGviewClick);
  var pbGview=document.getElementById('pb-gview');
  if(pbGview)pbGview.addEventListener('click',onGviewClick);

  // Narrow gizmo panel RESET + snap
  const pbGrst=document.getElementById('pb-greset');if(pbGrst)pbGrst.addEventListener('click',()=>document.getElementById('greset').click());
  const pbGsnp=document.getElementById('pb-gsnap');if(pbGsnp)pbGsnp.addEventListener('click',function(){window._setSnapEnabled(!snapEnabled);const ph=document.getElementById('pb-ghint');if(ph)ph.textContent=snapEnabled?'snap ON':'snap OFF';setTimeout(()=>{if(ph)ph.textContent='move';},1200);});
  draw();window._gDraw=draw;
  window._resetGcScale=function(){_gcScale=false;draw();if(window._pbGcDraw)window._pbGcDraw();};
  window._pbGcDraw=function(){var pg2=document.getElementById('pb-gc');if(!pg2)return;
    var pgctx2=pg2.getContext('2d');
    if(selectedStrokes.length>0 && window._sgGcDraw){
      window._sgGcDraw();var sgCanvas=document.getElementById('sg-gc');
      if(sgCanvas){pgctx2.clearRect(0,0,pg2.width,pg2.height);var fitSz=Math.min(pg2.width,pg2.height);var ox=(pg2.width-fitSz)/2,oy=(pg2.height-fitSz)/2;pgctx2.drawImage(sgCanvas,ox,oy,fitSz,fitSz);}
      return;
    }
    if(window._selectedPrim_get && window._selectedPrim_get() && window._pgGcDraw){
      window._pgGcDraw();var pgCan=document.getElementById('pg-gc');
      if(pgCan){pgctx2.clearRect(0,0,pg2.width,pg2.height);var fs2=Math.min(pg2.width,pg2.height);var ox2=(pg2.width-fs2)/2,oy2=(pg2.height-fs2)/2;pgctx2.drawImage(pgCan,ox2,oy2,fs2,fs2);}
      return;
    }
    draw();pgctx2.clearRect(0,0,pg2.width,pg2.height);pgctx2.drawImage(gc,0,0,pg2.width,pg2.height);};
  const pbGc=document.getElementById('pb-gc');
  if(pbGc){var pbDrag=null,_pbSelDrag=false,_pbPrimDrag=false;
    function pbXY(e){var r=pbGc.getBoundingClientRect(),src=e.touches&&e.touches.length>0?e.touches[0]:e.changedTouches&&e.changedTouches.length>0?e.changedTouches[0]:e;return{x:(src.clientX-r.left)/r.width*W,y:(src.clientY-r.top)/r.height*H};}
    function _pbToSg(p){return window._gcToSgPos?window._gcToSgPos(p.x,p.y):{x:p.x,y:p.y};}
    function _pbHasSel(){return selectedStrokes.length>0&&window._sgHitTest;}
    function _pbHasPrim(){return window._selectedPrim_get&&window._selectedPrim_get()&&window._pgHitTest;}
    pbGc.addEventListener('mousedown',function(e){e.preventDefault();e.stopPropagation();
      var p=pbXY(e);
      if(_pbHasSel()){var sp=_pbToSg(p),h=window._sgHitTest(sp.x,sp.y,false);if(h){window._sgStartDrag(sp,h,e.clientX,e.clientY);_pbSelDrag=true;window._pbGcDraw&&window._pbGcDraw();}return;}
      if(_pbHasPrim()){var pp=_pbToSg(p),h2=window._pgHitTest(pp.x,pp.y,false);if(h2){window._pgStartDrag(pp,h2,e.clientX,e.clientY);_pbPrimDrag=true;window._pbGcDraw&&window._pbGcDraw();}return;}
      var h3=hitTest(p.x,p.y,false);if(!h3)return;pbDrag={h:h3,sx:p.x,sy:p.y,grabT:_grabT,oPos:surfPos.clone(),oEuler:surfEuler.clone(),oQuat:surfGroup.quaternion.clone(),oSc:surfScale,oSA:surfScaleAxes.clone(),shiftHeld:e.shiftKey,frozenLayout:_gcLayout?JSON.parse(JSON.stringify(_gcLayout)):null};hov=h3;draw();window._pbGcDraw&&window._pbGcDraw();});
    pbGc.addEventListener('mousemove',function(e){e.preventDefault();e.stopPropagation();var p=pbXY(e);
      if(_pbSelDrag&&window._sgApplyDrag){window._sgApplyDrag(_pbToSg(p));window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbPrimDrag&&window._pgApplyDrag){window._pgApplyDrag(_pbToSg(p));window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbHasSel()){var sp=_pbToSg(p),h=window._sgHitTest(sp.x,sp.y,false);if(window._sgSetHov)window._sgSetHov(h);window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbHasPrim()){var pp=_pbToSg(p),h2=window._pgHitTest(pp.x,pp.y,false);if(window._pgSetHov)window._pgSetHov(h2);window._pbGcDraw&&window._pbGcDraw();return;}
      if(!pbDrag){var h3=hitTest(p.x,p.y,false);if(h3!==hov){hov=h3;draw();window._pbGcDraw&&window._pbGcDraw();}return;}drag=pbDrag;applyDrag(p);drag=null;window._pbGcDraw&&window._pbGcDraw();});
    pbGc.addEventListener('mouseup',function(){
      if(_pbSelDrag){if(window._sgEndDrag)window._sgEndDrag();_pbSelDrag=false;window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbPrimDrag){if(window._pgEndDrag)window._pgEndDrag();_pbPrimDrag=false;window._pbGcDraw&&window._pbGcDraw();return;}
      pbDrag=null;draw();window._pbGcDraw&&window._pbGcDraw();});
    pbGc.addEventListener('touchstart',function(e){e.preventDefault();e.stopPropagation();var p=pbXY(e);
      if(_pbHasSel()){var sp=_pbToSg(p),h=window._sgHitTest(sp.x,sp.y,true);if(h){var tc=e.touches[0];window._sgStartDrag(sp,h,tc?tc.clientX:0,tc?tc.clientY:0);_pbSelDrag=true;window._pbGcDraw&&window._pbGcDraw();}return;}
      if(_pbHasPrim()){var pp=_pbToSg(p),h2=window._pgHitTest(pp.x,pp.y,true);if(h2){var tc2=e.touches[0];window._pgStartDrag(pp,h2,tc2?tc2.clientX:0,tc2?tc2.clientY:0);_pbPrimDrag=true;window._pbGcDraw&&window._pbGcDraw();}return;}
      var h3=hitTest(p.x,p.y,true);if(!h3)return;pbDrag={h:h3,sx:p.x,sy:p.y,grabT:_grabT,oPos:surfPos.clone(),oEuler:surfEuler.clone(),oQuat:surfGroup.quaternion.clone(),oSc:surfScale,oSA:surfScaleAxes.clone(),shiftHeld:false,frozenLayout:_gcLayout?JSON.parse(JSON.stringify(_gcLayout)):null};hov=h3;draw();window._pbGcDraw&&window._pbGcDraw();},{passive:false});
    pbGc.addEventListener('touchmove',function(e){e.preventDefault();e.stopPropagation();var p=pbXY(e);
      if(_pbSelDrag&&window._sgApplyDrag){window._sgApplyDrag(_pbToSg(p));window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbPrimDrag&&window._pgApplyDrag){window._pgApplyDrag(_pbToSg(p));window._pbGcDraw&&window._pbGcDraw();return;}
      if(!pbDrag)return;drag=pbDrag;applyDrag(p);drag=null;window._pbGcDraw&&window._pbGcDraw();},{passive:false});
    pbGc.addEventListener('touchend',function(e){e.stopPropagation();
      if(_pbSelDrag){if(window._sgEndDrag)window._sgEndDrag();_pbSelDrag=false;window._pbGcDraw&&window._pbGcDraw();return;}
      if(_pbPrimDrag){if(window._pgEndDrag)window._pgEndDrag();_pbPrimDrag=false;window._pbGcDraw&&window._pbGcDraw();return;}
      if(pbDrag&&pbDrag.h==='su'&&e.changedTouches.length){var ep=pbXY(e),ddx=ep.x-pbDrag.sx,ddy=ep.y-pbDrag.sy;if(Math.hypot(ddx,ddy)<10){_gcScale=!_gcScale;pbDrag=null;hov=null;draw();window._pbGcDraw&&window._pbGcDraw();return;}}pbDrag=null;draw();window._pbGcDraw&&window._pbGcDraw();});}
})();

// ================================================================
//  STROKE GIZMO — move/rotate/scale selected stroke via group matrix
// ================================================================
