// ============================================================
// loft-primitives.js
// Loft (persistent plane from selected strokes) + primitives/reference objects system
// ============================================================
(function(){
  // Stored loft geometry + centroid — persists until newScene() or explicit clear
  window._loftGeo = null;
  window._loftCen = null;

  // Resample a stroke's world-space points to N evenly-spaced samples
  function resampleStroke(stroke, N){
    var wpts = stroke.pts.map(function(p){return p.clone().applyMatrix4(stroke.mesh.matrix);});
    if(wpts.length < 2) return null;
    var lens = [0];
    for(var i = 1; i < wpts.length; i++) lens.push(lens[i-1] + wpts[i].distanceTo(wpts[i-1]));
    var total = lens[lens.length-1];
    if(total < 1e-6) return null;
    var result = [];
    for(var s = 0; s < N; s++){
      var t = s / (N-1) * total;
      var lo = 0, hi = lens.length-2;
      while(lo < hi){ var mid = (lo+hi)>>1; if(lens[mid+1] < t) lo=mid+1; else hi=mid; }
      var seg = lo;
      var segLen = lens[seg+1] - lens[seg];
      var alpha = segLen < 1e-10 ? 0 : (t - lens[seg]) / segLen;
      result.push(wpts[seg].clone().lerp(wpts[seg+1], alpha));
    }
    return result;
  }

  function buildLoftGeo(rails, N){
    var M = rails.length;
    var pos = [], norms = [], idx = [];
    for(var ri = 0; ri < M; ri++){
      for(var pi = 0; pi < N; pi++){
        var p = rails[ri][pi];
        pos.push(p.x, p.y, p.z);
        norms.push(0, 1, 0);
      }
    }
    for(var ri = 0; ri < M-1; ri++){
      for(var pi = 0; pi < N-1; pi++){
        var a = ri*N + pi;
        var b = ri*N + pi+1;
        var c = (ri+1)*N + pi;
        var d = (ri+1)*N + pi+1;
        idx.push(a, b, c,  b, d, c);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // Apply stored _loftGeo to the active surfGroup
  window._activateLoft = function(){
    if(!window._loftGeo || !window._loftCen){ toast('No loft — select 2+ strokes → ⟁ Loft'); return; }
    var geo = window._loftGeo;
    var cen = window._loftCen;
    surfPos.copy(cen);
    surfEuler.set(0,0,0);
    surfScale = 1;
    surfScaleAxes.set(1,1,1);
    surfType = 'plane';
    curPlane = 'xz';
    buildSurf();
    if(surfMesh && surfMesh.geometry){ surfMesh.geometry.dispose(); surfMesh.geometry = geo.clone(); }
    if(_frostedMesh && _frostedMesh.geometry){ _frostedMesh.geometry.dispose(); _frostedMesh.geometry = geo.clone(); }
    if(_frostedGridMesh && _frostedGridMesh.geometry){ _frostedGridMesh.geometry.dispose(); _frostedGridMesh.geometry = geo.clone(); }
    surfType = 'loft';
    surfGroup.visible = true;
    surfGroup.position.copy(surfPos);
    surfGroup.rotation.copy(new THREE.Euler(0,0,0));
    surfGroup.scale.set(1,1,1);
    // Sync all surf cycle buttons
    ['pb-cyc-surf','pb-cyc-surf2','sb-cyc-surf'].forEach(function(id){
      var b=document.getElementById(id);if(b)b.textContent='Lft';
    });
    var bsurf=document.getElementById('bsurf');if(bsurf)bsurf.classList.add('on');
    markDirty();
    setMode('draw');
  };

  // Clear the stored loft and fall back to none
  window._clearLoft = function(){
    if(window._loftGeo){ window._loftGeo.dispose(); window._loftGeo=null; }
    window._loftCen = null;
    surfGroup.visible = false;
    surfType = 'none';
    ['pb-cyc-surf','pb-cyc-surf2','sb-cyc-surf'].forEach(function(id){
      var b=document.getElementById(id);if(b)b.textContent='Off';
    });
    var bsurf=document.getElementById('bsurf');if(bsurf)bsurf.classList.remove('on');
    markDirty();
    setMode('select');
    toast('Loft cleared · select strokes to build new loft');
  };

  function loftFromSelection(){
    if(selectedStrokes.length < 2){ toast('Select 2+ strokes to loft'); return; }
    var N = 48;
    var rails = [];
    for(var i = 0; i < selectedStrokes.length; i++){
      var r = resampleStroke(selectedStrokes[i], N);
      if(!r){ toast('Stroke too short to loft'); return; }
      rails.push(r);
    }

    // Align rail directions — reverse any rail whose points are closer to
    // the first rail when flipped (prevents bowtie/twist)
    var ref = rails[0];
    for(var ri = 1; ri < rails.length; ri++){
      var r = rails[ri];
      var distFwd = 0, distRev = 0;
      for(var pi = 0; pi < N; pi++){
        distFwd += ref[pi].distanceToSquared(r[pi]);
        distRev += ref[pi].distanceToSquared(r[N-1-pi]);
      }
      if(distRev < distFwd) r.reverse();
    }

    var cen = new THREE.Vector3();
    var total = 0;
    rails.forEach(function(r){ r.forEach(function(p){ cen.add(p); total++; }); });
    cen.divideScalar(total);

    var geo = buildLoftGeo(rails, N);
    var posArr = geo.attributes.position.array;
    for(var i = 0; i < posArr.length; i+=3){
      posArr[i]   -= cen.x;
      posArr[i+1] -= cen.y;
      posArr[i+2] -= cen.z;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();

    // Dispose old stored geo if present
    if(window._loftGeo){ window._loftGeo.dispose(); }
    window._loftGeo = geo;
    window._loftCen = cen.clone();

    // Activate immediately
    window._activateLoft();
    clearSelection();
    toast('Loft built · draw on it · cycle Lft again to clear');
  }

  // sg-loft button: build from selection
  document.getElementById('sg-loft').addEventListener('click', function(){
    // If already on loft with a stored geo, tapping again clears it
    if(surfType === 'loft' && selectedStrokes.length === 0 && window._loftGeo){
      window._clearLoft();
    } else {
      loftFromSelection();
    }
  });
})();


// ================================================================
//  PRIMITIVES / REF OBJECTS — 3D reference shapes on a Ref layer
//  Hard cap: 10 objects. Per-page storage. Layer index 4.
// ================================================================
(function(){
  var PRIM_MAX = 20;
  var primitives = [];
  var _primSelectMode = false;
  var _selectedPrim = null;
  var _refLayerVisible = true;
  var _primIdCounter = 1;

  // Expose for page switch / save / load
  window._primitives = primitives;
  window._primSelectMode = false;

  // ── Precision mode (show distance/angle during transforms) ──
  // Uses window._precisionMode set by ruler popup toggle

  // ── Shape icons for strip rows ──
  var SHAPE_ICONS = {box:'◻',sphere:'○',cylinder:'◎',cone:'△',plane:'▭',loft:'~'};

  // ── Geometry factories ──
  function makeGeometry(type){
    if(type==='box') return new THREE.BoxGeometry(2,2,2);
    if(type==='sphere') return new THREE.SphereGeometry(1.2,24,16);
    if(type==='cylinder') return new THREE.CylinderGeometry(1,1,2.5,28);
    if(type==='cone') return new THREE.ConeGeometry(1,2.5,28);
    if(type==='plane') return new THREE.PlaneGeometry(4,4);
    return new THREE.BoxGeometry(2,2,2);
  }

  // Base dimensions (unscaled) for each prim type
  function _getPrimBaseSize(type){
    if(type==='box') return {x:2,y:2,z:2};
    if(type==='sphere') return {x:2.4,y:2.4,z:2.4};
    if(type==='cylinder') return {x:2,y:2.5,z:2};
    if(type==='cone') return {x:2,y:2.5,z:2};
    if(type==='plane') return {x:4,y:4,z:0};
    return {x:2,y:2,z:2};
  }

  function makePrimGroup(geo, color, opacity){
    var op = opacity != null ? opacity : 1;
    var isTransparent = op < 1;
    var mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color || '#ffffff'),
      transparent: isTransparent, opacity: op,
      depthWrite: !isTransparent,
      side: THREE.DoubleSide,
      roughness: 0.85, wireframe: false
    });
    var mesh = new THREE.Mesh(geo, mat);
    var edgeGeo = new THREE.EdgesGeometry(geo, 15);
    // Subtle outline: darken the fill color for edges
    var ec = new THREE.Color(color || '#ffffff');
    ec.r = Math.max(0, ec.r * 0.55);
    ec.g = Math.max(0, ec.g * 0.55);
    ec.b = Math.max(0, ec.b * 0.55);
    var edgeMat = new THREE.LineBasicMaterial({
      color: ec, transparent: true, opacity: 0.4, depthTest: true
    });
    var edges = new THREE.LineSegments(edgeGeo, edgeMat);
    var grp = new THREE.Group();
    mesh.renderOrder = 2;
    edges.renderOrder = 3;
    grp.add(mesh);
    grp.add(edges);
    return grp;
  }

  // ── Add primitive ──
  function addPrimitive(type){
    if(primitives.length >= PRIM_MAX){ toast('Ref cap reached ('+PRIM_MAX+')'); return; }
    var geo = makeGeometry(type);
    var grp = makePrimGroup(geo, '#ffffff');
    // Spawn at surfGroup position + small random offset
    grp.position.copy(surfGroup.position);
    grp.position.x += (Math.random()-0.5)*0.5;
    grp.position.y += (Math.random()-0.5)*0.5;
    grp.position.z += (Math.random()-0.5)*0.5;
    scene.add(grp);
    var entry = {
      id: _primIdCounter++,
      type: type,
      mesh: grp,
      color: '#ffffff',
      opacity: 1,
      visible: true,

      _rowEl: null
    };
    primitives.push(entry);
    addPrimRow(entry);
    updatePrimCount();
    showRefLayerRow();
    pushUndo({type:'prim_add', prim: entry});
    selectPrimitive(entry);
    markDirty();
  }

  // ── Remove primitive ──
  function removePrimitive(id){
    var idx = -1;
    for(var i=0;i<primitives.length;i++){if(primitives[i].id===id){idx=i;break;}}
    if(idx===-1) return;
    var entry = primitives[idx];
    if(_selectedPrim && _selectedPrim.id === id) deselectPrimitive();
    scene.remove(entry.mesh);
    entry.mesh.traverse(function(c){if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});
    primitives.splice(idx,1);
    if(entry._rowEl && entry._rowEl.parentNode) entry._rowEl.parentNode.removeChild(entry._rowEl);
    updatePrimCount();
    showRefLayerRow();
    pushUndo({type:'prim_delete', prim: entry, index: idx});
    markDirty();
  }

  // ── Duplicate primitive ──
  function duplicatePrimitive(prim){
    if(primitives.length >= PRIM_MAX){ toast('Ref cap reached ('+PRIM_MAX+')'); return; }
    var geo;
    if(prim.type === 'loft' && prim.profilePts){
      // Reconstruct loft geometry
      var N = prim.profilePts[0] ? prim.profilePts[0].length : 48;
      var M = prim.profilePts.length;
      var pos = [], norms = [], idx = [];
      for(var ri = 0; ri < M; ri++){
        for(var pi = 0; pi < N; pi++){
          var pt = prim.profilePts[ri][pi];
          pos.push(pt[0], pt[1], pt[2]);
          norms.push(0, 1, 0);
        }
      }
      for(var ri = 0; ri < M-1; ri++){
        for(var pi = 0; pi < N-1; pi++){
          var a = ri*N + pi, b = ri*N + pi+1, c = (ri+1)*N + pi, d = (ri+1)*N + pi+1;
          idx.push(a, b, c, b, d, c);
        }
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
    } else {
      geo = makeGeometry(prim.type);
    }
    var grp = makePrimGroup(geo, prim.color, prim.opacity);
    grp.position.copy(prim.mesh.position);
    grp.position.x += 0.5;
    grp.quaternion.copy(prim.mesh.quaternion);
    grp.scale.copy(prim.mesh.scale);
    grp.updateMatrix(); grp.matrixAutoUpdate = false;
    scene.add(grp);
    var entry = {
      id: _primIdCounter++,
      type: prim.type,
      mesh: grp,
      color: prim.color,
      opacity: prim.opacity != null ? prim.opacity : 1,
      visible: true,

      _rowEl: null
    };
    if(prim.type === 'loft' && prim.profilePts) entry.profilePts = prim.profilePts;
    primitives.push(entry);
    addPrimRow(entry);
    updatePrimCount();
    showRefLayerRow();
    pushUndo({type:'prim_add', prim: entry});
    selectPrimitive(entry);
    markDirty();
    toast('Duplicated');
  }

  // ── Popup row management (like layers-pop) ──
  function addPrimRow(entry){
    var stack = document.getElementById('prim-stack');
    var row = document.createElement('div');
    row.className = 'prim-row';
    row.id = 'prim-row-'+entry.id;

    var eye = document.createElement('button');
    eye.className = 'prim-eye' + (entry.visible?' vis':'');
    eye.textContent = entry.visible ? '◉' : '○';
    eye.addEventListener('click', function(e){
      e.stopPropagation();
      entry.visible = !entry.visible;
      entry.mesh.visible = entry.visible && _refLayerVisible;
      eye.textContent = entry.visible ? '◉' : '○';
      eye.classList.toggle('vis', entry.visible);
      markDirty();
    });
    row.appendChild(eye);

    var swatch = document.createElement('div');
    swatch.className = 'prim-swatch';
    swatch.style.background = entry.color;
    row.appendChild(swatch);

    var label = document.createElement('span');
    label.className = 'prim-label';
    var typeLabel = entry.type.charAt(0).toUpperCase() + entry.type.slice(1);
    label.textContent = typeLabel;
    row.appendChild(label);

    var del = document.createElement('button');
    del.className = 'prim-del';
    del.textContent = '×';
    del.title = 'Delete';
    del.addEventListener('click', function(e){
      e.stopPropagation();
      removePrimitive(entry.id);
    });
    row.appendChild(del);

    // Click row to select primitive
    row.addEventListener('click', function(){
      selectPrimitive(entry);
    });

    entry._rowEl = row;
    stack.appendChild(row);
  }

  function rebuildPrimRows(){
    var stack = document.getElementById('prim-stack');
    while(stack.firstChild) stack.removeChild(stack.firstChild);
    for(var i=0;i<primitives.length;i++) addPrimRow(primitives[i]);
  }

  function updatePrimCount(){
    var el = document.getElementById('prim-obj-count');
    if(el) el.textContent = primitives.length > 0 ? primitives.length + '/' + PRIM_MAX : '';
  }

  function showRefLayerRow(){
    var row = document.getElementById('tb-lrow4');
    if(row) row.style.display = primitives.length > 0 ? '' : 'none';
  }

  // ── Selection ──
  function selectPrimitive(prim){
    if(_selectedPrim && _selectedPrim.id === prim.id) return;
    deselectPrimitive();
    _selectedPrim = prim;
    // Enable prim-select mode so taps on scene can hit prims
    _primSelectMode = true;
    window._primSelectMode = true;
    // Highlight
    prim.mesh.traverse(function(c){
      if(c.isMesh && c.material && c.material.emissive){
        c.material.emissive = new THREE.Color(0xf5c842);
        c.material.emissiveIntensity = 0.4;
        c.material.needsUpdate = true;
      }
    });
    // Sync popup row highlight
    var rows = document.querySelectorAll('#prim-stack .prim-row');
    rows.forEach(function(r){ r.classList.toggle('on', r.id === 'prim-row-'+prim.id); });
    // Show pgizmo
    positionPrimGizmo();
    document.getElementById('pgizmo').classList.add('vis');document.getElementById('pgizmo').classList.add('gc-hosted');
    // Sync color swatches
    syncPgColors(prim.color);
    // Sync opacity slider
    syncPgOpacity(prim.opacity != null ? prim.opacity : 1);
    // Sync plane button (global toggle state)
    var ppb = document.getElementById('pg-useplane');
    if(ppb) ppb.classList.toggle('on', _primsAsPlane);
    var apb = document.getElementById('prim-asplane-btn');
    if(apb) apb.classList.toggle('on', _primsAsPlane);
    if(window._pgGcDraw) window._pgGcDraw();
    if(window._updateGhudSel)window._updateGhudSel();
    markDirty();
  }

  function deselectPrimitive(){
    if(!_selectedPrim) return;
    _selectedPrim.mesh.traverse(function(c){
      if(c.isMesh && c.material && c.material.emissive){
        c.material.emissive = new THREE.Color(0x000000);
        c.material.emissiveIntensity = 0;
        c.material.needsUpdate = true;
      }
    });
    _selectedPrim = null;
    _primSelectMode = false;
    window._primSelectMode = false;
    // Clear popup row highlights
    var rows = document.querySelectorAll('#prim-stack .prim-row');
    rows.forEach(function(r){ r.classList.remove('on'); });
    // Clear popup buttons
    var sb = document.getElementById('prim-sel-btn');
    if(sb) sb.classList.remove('on');
    var apb = document.getElementById('prim-asplane-btn');
    if(apb) apb.classList.remove('on');
    document.getElementById('pgizmo').classList.remove('vis');document.getElementById('pgizmo').classList.remove('gc-hosted');
    if(window._updateGhudSel)window._updateGhudSel();
    markDirty();
  }

  function syncPgColors(hex){
    var swatches = document.querySelectorAll('#pg-colors .pg-csw');
    var found = false;
    swatches.forEach(function(s){
      var match = s.dataset.pc === hex;
      s.classList.toggle('active', match);
      if(match) found = true;
    });
    var pick = document.getElementById('pg-cpick');
    if(pick){
      pick.value = hex;
      if(!found) pick.style.borderColor = 'var(--ink)';
      else pick.style.borderColor = '';
    }
  }

  // ── Color ──
  function setPrimColor(prim, hex){
    var ec = new THREE.Color(hex);
    ec.r = Math.max(0, ec.r * 0.55);
    ec.g = Math.max(0, ec.g * 0.55);
    ec.b = Math.max(0, ec.b * 0.55);
    prim.mesh.traverse(function(c){
      if(c.isMesh && c.material){
        c.material.color.set(hex);
        c.material.needsUpdate = true;
      }
      if(c.isLineSegments && c.material){
        c.material.color.copy(ec);
        c.material.needsUpdate = true;
      }
    });
    prim.color = hex;
    if(prim._rowEl){
      var sw = prim._rowEl.querySelector('.prim-swatch');
      if(sw) sw.style.background = hex;
    }
    syncPgColors(hex);
    markDirty();
  }

  // ── Opacity ──
  function setPrimOpacity(prim, op){
    prim.opacity = op;
    var isTransparent = op < 1;
    prim.mesh.traverse(function(c){
      if(c.isMesh && c.material){
        c.material.transparent = isTransparent;
        c.material.opacity = op;
        c.material.depthWrite = !isTransparent;
        c.material.needsUpdate = true;
      }
    });
    markDirty();
  }

  function syncPgOpacity(op){
    var sl = document.getElementById('pg-opacity');
    var vl = document.getElementById('pg-op-val');
    if(sl) sl.value = Math.round(op * 100);
    if(vl) vl.textContent = Math.round(op * 100);
  }

  // ── Use as Plane ──
  // ── Global "use prims as plane" toggle ──
  var _primsAsPlane = false;
  window._primsAsPlane = false;
  var _savedSurfState = null;

  function togglePrimsAsPlane(on){
    _primsAsPlane = on;
    window._primsAsPlane = on;
    var ppb = document.getElementById('pg-useplane');
    if(ppb) ppb.classList.toggle('on', on);
    var apb = document.getElementById('prim-asplane-btn');
    if(apb) apb.classList.toggle('on', on);

    if(on){
      // Save current surface state
      _savedSurfState = {
        type: surfType, plane: curPlane,
        px: surfPos.x, py: surfPos.y, pz: surfPos.z,
        rx: surfEuler.x, ry: surfEuler.y, rz: surfEuler.z,
        sc: surfScale,
        sax: surfScaleAxes.x, say: surfScaleAxes.y, saz: surfScaleAxes.z
      };
      // Hide the scene drawing plane visuals
      surfGroup.traverse(function(c){ if(c.isMesh) c.visible = false; });
    } else {
      // Restore saved surface state
      if(_savedSurfState){
        surfType = _savedSurfState.type;
        curPlane = _savedSurfState.plane;
        surfPos.set(_savedSurfState.px, _savedSurfState.py, _savedSurfState.pz);
        surfEuler.set(_savedSurfState.rx, _savedSurfState.ry, _savedSurfState.rz);
        surfScale = _savedSurfState.sc;
        surfScaleAxes.set(_savedSurfState.sax, _savedSurfState.say, _savedSurfState.saz);
        _savedSurfState = null;
      }
      surfGroup.traverse(function(c){ if(c.isMesh) c.visible = true; });
      buildSurf();
      // Sync surface type / plane UI labels
      document.querySelectorAll('[data-surf]').forEach(function(b){b.classList.toggle('on',b.dataset.surf===surfType);});
      document.querySelectorAll('[data-plane]').forEach(function(b){b.classList.toggle('on',b.dataset.plane===curPlane);});
      var _pl={'xz':'Front','xy':'Top','yz':'Side'};
      ['pb-cyc-plane','pb-cyc-plane2','sb-cyc-plane'].forEach(function(id){var b=document.getElementById(id);if(b)b.textContent=_pl[curPlane]||curPlane;});
    }
    syncSurf();
    markDirty();
  }

  // ── Raycast hook: s2w checks prim meshes when _primsAsPlane is on ──
  window._primRaycast = function(raycaster){
    if(!_primsAsPlane) return null;
    var bestHit = null;
    for(var i = 0; i < primitives.length; i++){
      var p = primitives[i];
      if(!p.mesh.visible) continue;
      p.mesh.traverse(function(c){
        if(!c.isMesh) return;
        var prev = c.material.side;
        c.material.side = THREE.DoubleSide;
        var hits = raycaster.intersectObject(c, false);
        c.material.side = prev;
        if(hits.length > 0 && (!bestHit || hits[0].distance < bestHit.distance)){
          bestHit = hits[0];
        }
      });
    }
    return bestHit;
  };

  // ── Ref layer visibility ──
  function setRefLayerVisible(v){
    _refLayerVisible = v;
    for(var i=0;i<primitives.length;i++){
      primitives[i].mesh.visible = v && primitives[i].visible;
    }
    markDirty();
  }

  // ── Raycast against primitives ──
  var _primRaycaster = new THREE.Raycaster();
  function findNearestPrimitive(px, py){
    _refreshRect();
    var r = _cachedRect;
    var ndcX = ((px - r.left) / r.width) * 2 - 1;
    var ndcY = -((py - r.top) / r.height) * 2 + 1;
    var ac = activeCam();
    _primRaycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), ac);
    var bestPrim = null, bestDist = Infinity;
    for(var i=0;i<primitives.length;i++){
      var p = primitives[i];
      if(!p.mesh.visible) continue;
      // Bounding sphere pre-check
      p.mesh.traverse(function(c){
        if(!c.isMesh) return;
        if(!c.geometry.boundingSphere) c.geometry.computeBoundingSphere();
      });
      var hits = _primRaycaster.intersectObject(p.mesh, true);
      if(hits.length > 0 && hits[0].distance < bestDist){
        bestDist = hits[0].distance;
        bestPrim = p;
      }
    }
    return bestPrim;
  }

  // ── Pgizmo positioning ──
  var _pgizmoDragged = false;
  function positionPrimGizmo(){
    var pg = document.getElementById('pgizmo');
    if(!_pgizmoDragged){
      // Top-right, below bhide+bprims+sc-fab stack (avoids overlap with sidecol)
      pg.style.left = '';
      pg.style.right = '8px';
      pg.style.top = '120px';
    }
    pg.style.maxHeight = 'calc(100dvh - 120px)';
  }

  // ── Pgizmo drag handle ──
  (function(){
    var pg = document.getElementById('pgizmo');
    var handle = document.getElementById('pgizmo-handle');
    if(!pg || !handle) return;
    var dragState = null;
    function onStart(e){
      e.preventDefault(); e.stopPropagation();
      var src = e.touches ? e.touches[0] : e;
      var r = pg.getBoundingClientRect();
      dragState = {ox: src.clientX - r.left, oy: src.clientY - r.top};
    }
    function onMove(e){
      if(!dragState) return;
      e.preventDefault();
      var src = e.touches ? e.touches[0] : e;
      var nx = src.clientX - dragState.ox;
      var ny = src.clientY - dragState.oy;
      var sw = pg.offsetWidth, sh = pg.offsetHeight;
      nx = Math.max(0, Math.min(window.innerWidth - sw, nx));
      ny = Math.max(0, Math.min(window.innerHeight - sh, ny));
      pg.style.right = ''; pg.style.left = nx + 'px'; pg.style.top = ny + 'px';
      _pgizmoDragged = true;
    }
    function onEnd(){ dragState = null; }
    handle.addEventListener('touchstart', onStart, {passive: false});
    handle.addEventListener('touchmove', onMove, {passive: false});
    handle.addEventListener('touchend', onEnd);
    handle.addEventListener('mousedown', onStart);
    document.addEventListener('mousemove', function(e){ if(dragState) onMove(e); });
    document.addEventListener('mouseup', onEnd);
  })();

  // ── Pgizmo canvas — unified gizmo design (matches sgizmo exactly) ──
  var pgc = document.getElementById('pg-gc');
  var pgCtx = pgc.getContext('2d');
  var PG_W = pgc.width, PG_H = pgc.height, PG_CX = PG_W/2, PG_CY = PG_H/2;
  var PG_COLORS = {x:'#e03040', y:'#22bb55', z:'#3377ee'};
  var pgDrag = null, pgHov = null;
  var _pgMode = 'all'; // 'all','move','rotate','scale'
  var _pgScaleMode = false;
  var _pgGrabT = 0;

  // Proportional sizing (same ratios as sgizmo)
  var _PG_R = Math.min(PG_CX, PG_CY);
  var PG_RING_R2 = Math.round(_PG_R * 0.68);
  var PG_GAP2 = 0.22;
  var PG_ARC_BOUNDS2 = {x:['z','y'], y:['z','x'], z:['x','y']};
  var PG_ARROW = Math.round(_PG_R * 0.76);
  var PG_HEAD_S = Math.round(_PG_R * 0.10);
  var PG_HEAD_L = Math.round(_PG_R * 0.14);
  var PG_BOX_S = Math.round(_PG_R * 0.10);
  var PG_CENTER_R = Math.round(_PG_R * 0.16);
  var _pgLayout = null;

  function pgGetQuat(){
    return _selectedPrim ? _selectedPrim.mesh.quaternion.clone() : new THREE.Quaternion();
  }

  function _pgComputeLayout(){
    var q = pgGetQuat();
    var ac = activeCam();
    var cen = new THREE.Vector3();
    if(_selectedPrim) _selectedPrim.mesh.getWorldPosition(cen);
    var cv = cen.clone().project(ac);
    var camDir = new THREE.Vector3().subVectors(ac.position, cen).normalize();
    var axisAngles = {}, flipped = {};
    ['x','y','z'].forEach(function(ax){
      var dir = WORLD[ax].clone().applyQuaternion(q).normalize();
      flipped[ax] = dir.dot(camDir) < 0;
      if(flipped[ax]) dir.negate();
      var tipV = cen.clone().addScaledVector(dir, 1).project(ac);
      axisAngles[ax] = Math.atan2(-(tipV.y - cv.y), (tipV.x - cv.x));
    });
    function N(a){ return ((a % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); }
    var arcs = {};
    ['x','y','z'].forEach(function(ax){
      var bA = PG_ARC_BOUNDS2[ax][0], bB = PG_ARC_BOUNDS2[ax][1];
      var s = N(axisAngles[bA]), e = N(axisAngles[bB]), own = N(axisAngles[ax]);
      var spanCCW = (e - s + Math.PI*2) % (Math.PI*2);
      var ownInCCW = ((own - s + Math.PI*2) % (Math.PI*2)) < spanCCW;
      var arcStart, arcEnd;
      if(!ownInCCW){ arcStart = s + PG_GAP2; arcEnd = s + spanCCW - PG_GAP2; }
      else { arcStart = e + PG_GAP2; arcEnd = e + (Math.PI*2 - spanCCW) - PG_GAP2; }
      arcs[ax] = {start: arcStart, end: arcEnd};
    });
    _pgLayout = {cx: PG_CX, cy: PG_CY, axisAngles: axisAngles, flipped: flipped, arcs: arcs};
  }

  function pgDraw(){
    // Freeze layout during rotate drag
    if(pgDrag && pgDrag.h && pgDrag.h[0] === 'r' && pgDrag.frozenLayout){
      _pgLayout = pgDrag.frozenLayout;
    } else {
      _pgComputeLayout();
    }
    pgCtx.clearRect(0, 0, PG_W, PG_H);
    if(!_pgLayout || !_selectedPrim) return;
    var cx = _pgLayout.cx, cy = _pgLayout.cy;
    var axisAngles = _pgLayout.axisAngles, arcs = _pgLayout.arcs, flipped = _pgLayout.flipped;
    var activeDrag = pgDrag ? pgDrag.h : null;
    var showArcs = (_pgMode === 'all' || _pgMode === 'rotate');
    var showArrows = (_pgMode === 'all' || _pgMode === 'move' || _pgMode === 'scale');

    ['x','y','z'].forEach(function(ax){
      var col = PG_COLORS[ax], arc = arcs[ax], angle = axisAngles[ax];
      var ax2c = Math.cos(angle), ay2s = Math.sin(angle);
      var arcHlit = (pgHov === 'r'+ax) || (activeDrag === 'r'+ax);
      var arwHlit = (pgHov === 'a'+ax || pgHov === 's'+ax) || (activeDrag === 'a'+ax || activeDrag === 's'+ax);

      // Arc
      if(showArcs){
        pgCtx.save();
        if(arcHlit){ pgCtx.shadowColor = col; pgCtx.shadowBlur = 9; }
        pgCtx.beginPath(); pgCtx.arc(cx, cy, PG_RING_R2, arc.start, arc.end);
        pgCtx.strokeStyle = col;
        pgCtx.lineWidth = arcHlit ? Math.round(_PG_R*0.09) : Math.round(_PG_R*0.065);
        pgCtx.lineCap = 'round';
        pgCtx.globalAlpha = arcHlit ? 1 : 0.45; pgCtx.stroke();
        pgCtx.restore();
      }

      // Shaft + head
      if(!showArrows) return;
      var shaftS = PG_RING_R2 * 0.55;
      var ex = cx + ax2c*PG_ARROW, ey = cy + ay2s*PG_ARROW;
      pgCtx.save();
      if(arwHlit){ pgCtx.shadowColor = col; pgCtx.shadowBlur = 7; }
      pgCtx.globalAlpha = arwHlit ? 1 : 0.85;
      pgCtx.strokeStyle = col;
      pgCtx.lineWidth = arwHlit ? Math.round(_PG_R*0.055) : Math.round(_PG_R*0.04);
      pgCtx.lineCap = 'round';
      pgCtx.beginPath(); pgCtx.moveTo(cx+ax2c*shaftS, cy+ay2s*shaftS); pgCtx.lineTo(ex, ey); pgCtx.stroke();
      pgCtx.beginPath(); pgCtx.arc(cx+ax2c*shaftS, cy+ay2s*shaftS, arwHlit?Math.round(_PG_R*0.055):Math.round(_PG_R*0.03), 0, Math.PI*2);
      pgCtx.fillStyle = col; pgCtx.fill();
      if(_pgScaleMode){
        var bx = ex + ax2c*(PG_HEAD_L*0.5), by = ey + ay2s*(PG_HEAD_L*0.5);
        var hs = arwHlit ? PG_BOX_S*1.2 : PG_BOX_S;
        pgCtx.save(); pgCtx.translate(bx, by); pgCtx.rotate(angle + Math.PI/4);
        pgCtx.globalAlpha = arwHlit ? 0.9 : 0.65;
        pgCtx.fillStyle = col; pgCtx.fillRect(-hs, -hs, hs*2, hs*2);
        pgCtx.restore();
      } else {
        var px2 = ay2s, py2 = -ax2c;
        pgCtx.beginPath();
        pgCtx.moveTo(ex+ax2c*PG_HEAD_L, ey+ay2s*PG_HEAD_L);
        pgCtx.lineTo(ex+px2*PG_HEAD_S, ey+py2*PG_HEAD_S);
        pgCtx.lineTo(ex-px2*PG_HEAD_S, ey-py2*PG_HEAD_S);
        pgCtx.closePath(); pgCtx.fillStyle = col; pgCtx.fill();
      }
      pgCtx.restore();
      // Label
      pgCtx.save(); pgCtx.font = 'bold '+Math.round(_PG_R*0.12)+'px DM Mono,monospace';
      pgCtx.textAlign = 'center'; pgCtx.textBaseline = 'middle';
      pgCtx.fillStyle = col; pgCtx.globalAlpha = arwHlit ? 1 : 0.88;
      var lblDist = PG_ARROW + PG_HEAD_L + Math.round(_PG_R*0.06);
      var slx = cx+ax2c*lblDist, sly = cy+ay2s*lblDist;
      var sm = 6; slx = Math.max(sm, Math.min(PG_W-sm, slx)); sly = Math.max(sm, Math.min(PG_H-sm, sly));
      pgCtx.fillText((flipped[ax]?'-':'')+ax.toUpperCase(), slx, sly);
      pgCtx.restore();
    });

    // Center
    var cenHlit = (pgHov === 'su') || (activeDrag === 'su');
    pgCtx.save();
    if(_pgScaleMode){
      pgCtx.translate(cx, cy); pgCtx.rotate(Math.PI/4);
      var ds2 = cenHlit ? Math.round(_PG_R*0.12) : Math.round(_PG_R*0.09);
      pgCtx.fillStyle = 'rgba(255,255,255,0.92)'; pgCtx.fillRect(-ds2, -ds2, ds2*2, ds2*2);
      pgCtx.fillStyle = cenHlit ? 'rgba(255,220,60,1)' : 'rgba(255,200,60,0.85)';
      var di2 = cenHlit ? Math.round(_PG_R*0.09) : Math.round(_PG_R*0.065);
      pgCtx.fillRect(-di2, -di2, di2*2, di2*2);
    } else {
      pgCtx.beginPath(); pgCtx.arc(cx, cy, cenHlit ? Math.round(_PG_R*0.09) : Math.round(_PG_R*0.065), 0, Math.PI*2);
      pgCtx.fillStyle = 'rgba(255,255,255,0.90)'; pgCtx.fill();
      pgCtx.beginPath(); pgCtx.arc(cx, cy, cenHlit ? Math.round(_PG_R*0.065) : Math.round(_PG_R*0.05), 0, Math.PI*2);
      pgCtx.fillStyle = 'rgba(80,80,110,0.65)'; pgCtx.fill();
    }
    pgCtx.restore();
  }
  window._pgGcDraw = pgDraw;

  function pgHitTest(x, y, isTouch){
    if(!_selectedPrim) return null;
    _pgComputeLayout();
    if(!_pgLayout) return null;
    var pgl = _pgLayout;
    var dx = x - pgl.cx, dy = y - pgl.cy;
    var dist = Math.sqrt(dx*dx + dy*dy);
    var sang = Math.atan2(dy, dx);
    var axes = ['x','y','z'];
    var hitArcs = (_pgMode === 'all' || _pgMode === 'rotate');
    var hitArrows = (_pgMode === 'all' || _pgMode === 'move');
    var hitScale = (_pgMode === 'all' || _pgMode === 'scale');
    var arcTol = isTouch ? 18 : 9;
    var pgW = isTouch ? 48 : 14;
    var inArcZone = Math.abs(dist - PG_RING_R2) < arcTol;
    // Center (uniform scale)
    if((_pgMode === 'all' || _pgMode === 'scale') && dist <= PG_CENTER_R + (isTouch ? 8 : 0)) return 'su';
    // Touch: test arrows first outside arc zone
    if(isTouch && (hitArrows || hitScale) && !inArcZone){
      for(var sk = 0; sk < axes.length; sk++){
        var sak = axes[sk], sangk = pgl.axisAngles[sak];
        var sacsk = Math.cos(sangk), sask = Math.sin(sangk);
        var salk = dx*sacsk + dy*sask;
        var sperk = Math.abs(dx*(-sask) + dy*sacsk);
        if(salk >= PG_RING_R2*0.4 && salk <= PG_ARROW + PG_HEAD_L && sperk < pgW){
          var useScaleK = (_pgMode === 'scale') || (_pgMode === 'all' && _pgScaleMode);
          return useScaleK ? 's'+sak : 'a'+sak;
        }
      }
    }
    // Arc hits
    if(hitArcs && inArcZone){
      function normA(a){ return ((a % (Math.PI*2)) + Math.PI*2) % (Math.PI*2); }
      for(var si = 0; si < axes.length; si++){
        var sax2 = axes[si], sarc2 = pgl.arcs[sax2];
        var ss2 = normA(sarc2.start), se2 = normA(sarc2.end), sa2 = normA(sang);
        var shit2 = (se2 >= ss2) ? (sa2 >= ss2 && sa2 <= se2) : (sa2 >= ss2 || sa2 <= se2);
        if(shit2){ _pgGrabT = sang; return 'r'+sax2; }
      }
    }
    // Arrow / scale hits
    if(hitArrows || hitScale){
      for(var sj = 0; sj < axes.length; sj++){
        var sax3 = axes[sj], sang3 = pgl.axisAngles[sax3];
        var sacos = Math.cos(sang3), sasin = Math.sin(sang3);
        var salong = dx*sacos + dy*sasin;
        var saperp = Math.abs(dx*(-sasin) + dy*sacos);
        if(salong >= PG_RING_R2*0.4 && salong <= PG_ARROW + PG_HEAD_L && saperp < pgW){
          var useScale = (_pgMode === 'scale') || (_pgMode === 'all' && _pgScaleMode);
          return useScale ? 's'+sax3 : 'a'+sax3;
        }
      }
    }
    return null;
  }

  function pgGetPos(e){
    var r = pgc.getBoundingClientRect();
    var src = e.touches ? e.touches[0] : e;
    return {x: (src.clientX - r.left) * (148 / r.width), y: (src.clientY - r.top) * (148 / r.height)};
  }

  function pgApplyDrag(p){
    if(!pgDrag || !_selectedPrim) return;
    var dx = p.x - pgDrag.sx, dy = p.y - pgDrag.sy, h = pgDrag.h;
    var mesh = _selectedPrim.mesh;

    // Restore from saved start
    mesh.position.copy(pgDrag.oPos);
    mesh.quaternion.copy(pgDrag.oQuat);
    mesh.scale.copy(pgDrag.oScale);

    var _precVal = '';
    var _pgFL = pgDrag.frozenLayout || _pgLayout;

    if(h.startsWith('a')){
      var ax = h[1];
      var sgang = _pgFL ? _pgFL.axisAngles[ax] : 0;
      var proj = (dx*Math.cos(sgang) + dy*Math.sin(sgang)) * 0.028;
      var dir = WORLD[ax].clone().applyQuaternion(pgDrag.oQuat).normalize();
      if(_pgFL && _pgFL.flipped[ax]) dir.negate();
      mesh.position.addScaledVector(dir, proj);
      if(window._precisionMode){
        _precVal = ax.toUpperCase()+' Δ'+formatDist(proj);
      }
    } else if(h.startsWith('r')){
      var ax = h[1];
      var grabAngle = pgDrag.grabT;
      var tx = -Math.sin(grabAngle), ty = Math.cos(grabAngle);
      var proj = (dx*tx + dy*ty) * 0.022;
      var angle = ax === 'z' ? -proj : proj;
      var q = new THREE.Quaternion();
      if(ax==='x') q.setFromAxisAngle(new THREE.Vector3(1,0,0), angle);
      if(ax==='y') q.setFromAxisAngle(new THREE.Vector3(0,1,0), angle);
      if(ax==='z') q.setFromAxisAngle(new THREE.Vector3(0,0,1), angle);
      mesh.quaternion.premultiply(q);
      if(window._precisionMode){
        var deg = (angle * 180 / Math.PI);
        _precVal = ax.toUpperCase()+': '+deg.toFixed(1)+'°';
      }
    } else if(h.startsWith('s') && h !== 'su'){
      var ax = h[1];
      var sgang = _pgFL ? _pgFL.axisAngles[ax] : 0;
      var proj = 1 + (dx*Math.cos(sgang) + dy*Math.sin(sgang)) * 0.015;
      proj = Math.max(0.05, proj);
      if(ax==='x') mesh.scale.x = pgDrag.oScale.x * proj;
      if(ax==='y') mesh.scale.y = pgDrag.oScale.y * proj;
      if(ax==='z') mesh.scale.z = pgDrag.oScale.z * proj;
      if(window._precisionMode){
        var _bs = _getPrimBaseSize(_selectedPrim.type);
        var sx = mesh.scale.x * _bs.x, sy = mesh.scale.y * _bs.y, sz = mesh.scale.z * _bs.z;
        _precVal = ax.toUpperCase()+': ×'+proj.toFixed(2)+' · '+formatSize(sx,sy,sz);
      }
    } else if(h === 'su'){
      var sc = Math.max(0.05, 1 - dy * 0.012);
      mesh.scale.copy(pgDrag.oScale).multiplyScalar(sc);
      if(window._precisionMode){
        var _bs = _getPrimBaseSize(_selectedPrim.type);
        var sx = mesh.scale.x * _bs.x, sy = mesh.scale.y * _bs.y, sz = mesh.scale.z * _bs.z;
        _precVal = '×'+sc.toFixed(2)+' · '+formatSize(sx,sy,sz);
      }
    }
    mesh.updateMatrix(); mesh.matrixAutoUpdate = false;

    // Show precision readout
    var pel = document.getElementById('pg-precision');
    if(pel){
      if(window._precisionMode && _precVal){
        pel.textContent = _precVal;
        pel.style.display = '';
      } else {
        pel.style.display = 'none';
      }
    }
    // Also show in ghud-sel card (gc-hosted mode)
    if(window._precisionMode && _precVal && window._setSelPrecision) window._setSelPrecision(_precVal);

    pgDraw();
    markDirty();
  }

  function pgStartDrag(p, h, clientX, clientY){
    if(!h || !_selectedPrim) return;
    var mesh = _selectedPrim.mesh;
    pushUndo({type:'prim_transform', prim:_selectedPrim,
      oldPos: mesh.position.clone(), oldQuat: mesh.quaternion.clone(), oldScale: mesh.scale.clone()});
    _pgComputeLayout();
    pgDrag = {h:h, sx:p.x, sy:p.y, grabT: _pgGrabT,
      oPos: mesh.position.clone(), oQuat: mesh.quaternion.clone(), oScale: mesh.scale.clone(),
      frozenLayout: _pgLayout ? JSON.parse(JSON.stringify(_pgLayout)) : null,
      _scx: clientX, _scy: clientY};
    pgHov = h; pgDraw();
  }

  pgc.addEventListener('mousedown', function(e){
    e.stopPropagation();
    var p = pgGetPos(e), h = pgHitTest(p.x, p.y, false);
    pgStartDrag(p, h, e.clientX, e.clientY);
  });
  pgc.addEventListener('mousemove', function(e){
    e.stopPropagation();
    var p = pgGetPos(e);
    if(!pgDrag){ var h = pgHitTest(p.x, p.y, false); if(h !== pgHov){ pgHov = h; pgDraw(); } return; }
    pgApplyDrag(p);
  });
  pgc.addEventListener('mouseup', function(e){
    if(pgDrag && pgDrag.h === 'su'){
      var ddx = e.clientX - (pgDrag._scx||0), ddy = e.clientY - (pgDrag._scy||0);
      if(Math.hypot(ddx, ddy) < 5){ _pgScaleMode = !_pgScaleMode; pgDrag = null; pgDraw(); return; }
    }
    pgDrag = null; pgDraw();
    var _ppel=document.getElementById('pg-precision');if(_ppel)_ppel.style.display='none';
    if(window._setSelPrecision)window._setSelPrecision(null);
  });
  pgc.addEventListener('mouseleave', function(){ if(!pgDrag){ pgHov = null; pgDraw(); } });
  pgc.addEventListener('touchstart', function(e){
    e.preventDefault(); e.stopPropagation();
    var p = pgGetPos(e), h = pgHitTest(p.x, p.y, true);
    pgStartDrag(p, h, e.touches[0].clientX, e.touches[0].clientY);
  }, {passive: false});
  pgc.addEventListener('touchmove', function(e){
    e.preventDefault(); e.stopPropagation();
    if(pgDrag) pgApplyDrag(pgGetPos(e));
  }, {passive: false});
  pgc.addEventListener('touchend', function(e){
    if(pgDrag && pgDrag.h === 'su' && e.changedTouches.length){
      var t = e.changedTouches[0];
      var ddx = t.clientX - (pgDrag._scx||0), ddy = t.clientY - (pgDrag._scy||0);
      if(Math.hypot(ddx, ddy) < 8){ _pgScaleMode = !_pgScaleMode; pgDrag = null; pgHov = null; pgDraw(); return; }
    }
    pgDrag = null; pgHov = null; pgDraw();
    var _ppel2=document.getElementById('pg-precision');if(_ppel2)_ppel2.style.display='none';
    if(window._setSelPrecision)window._setSelPrecision(null);
  });

  // ── Pgizmo color swatches ──
  document.querySelectorAll('#pg-colors .pg-csw').forEach(function(sw){
    sw.addEventListener('click', function(){
      if(!_selectedPrim) return;
      setPrimColor(_selectedPrim, sw.dataset.pc);
    });
  });
  document.getElementById('pg-cpick').addEventListener('input', function(){
    if(!_selectedPrim) return;
    setPrimColor(_selectedPrim, this.value);
  });

  // ── Opacity slider ──
  document.getElementById('pg-opacity').addEventListener('input', function(){
    if(!_selectedPrim) return;
    var op = parseInt(this.value) / 100;
    setPrimOpacity(_selectedPrim, op);
    var vl = document.getElementById('pg-op-val');
    if(vl) vl.textContent = this.value;
  });

  // ── Pgizmo buttons ──
  document.getElementById('pg-del').addEventListener('click', function(){
    if(_selectedPrim) removePrimitive(_selectedPrim.id);
  });
  document.getElementById('pg-useplane').addEventListener('click', function(){
    togglePrimsAsPlane(!_primsAsPlane);
  });
  document.getElementById('pg-close').addEventListener('click', function(){
    deselectPrimitive();
  });

  // ── Pgizmo mode buttons (including All, matching sgizmo) ──
  ['all','move','rotate','scale'].forEach(function(m){
    var btn = document.getElementById('pg-'+m);
    if(!btn) return;
    btn.addEventListener('click', function(){
      _pgMode = m;
      document.querySelectorAll('#pgizmo .srow .mode').forEach(function(b){ b.classList.remove('on'); });
      btn.classList.add('on');
      pgDraw();
    });
  });

  // ── Pgizmo Dup button ──
  document.getElementById('pg-dup').addEventListener('click', function(){
    if(!_selectedPrim) return;
    duplicatePrimitive(_selectedPrim);
  });

  // Expose for gc canvas delegation when prim selected
  window._pgHitTest = function(x,y,isTouch){ return pgHitTest(x,y,isTouch); };
  window._pgStartDrag = function(p,h,cx,cy){ pgStartDrag(p,h,cx,cy); };
  window._pgApplyDrag = function(p){ pgApplyDrag(p); };
  window._pgEndDrag = function(){ pgDrag=null; pgHov=null; pgDraw(); var el=document.getElementById('pg-precision');if(el)el.style.display='none'; if(window._setSelPrecision)window._setSelPrecision(null); };
  window._pgSetHov = function(h){ if(h!==pgHov){pgHov=h;pgDraw();} };
  window._pgScaleModeToggle = function(){ _pgScaleMode=!_pgScaleMode; pgDrag=null; pgDraw(); };
  window._pgGetDrag = function(){ return pgDrag; };
  window._pgSetMode = function(m){ _pgMode=m; document.querySelectorAll('#pgizmo .srow .mode').forEach(function(b){b.classList.remove('on');}); var btn=document.getElementById('pg-'+m); if(btn)btn.classList.add('on'); pgDraw(); };
  window._selectedPrim_get = function(){ return _selectedPrim; };
  window._setPrimColorExt = function(col){ if(_selectedPrim) setPrimColor(_selectedPrim,col); };
  window._setPrimOpacityExt = function(op){ if(_selectedPrim) setPrimOpacity(_selectedPrim,op); };
  window._deselectPrimExt = function(){ deselectPrimitive(); };
  window._duplicatePrimExt = function(){ if(_selectedPrim) duplicatePrimitive(_selectedPrim); };
  window._removePrimExt = function(){ if(_selectedPrim) removePrimitive(_selectedPrim.id); };
  window._togglePrimsAsPlaneExt = function(){ togglePrimsAsPlane(!_primsAsPlane); };

  // ── Hamburger toggles the single-line toolbar ──
  var primBar = document.getElementById('prim-bar');
  var primsBtn = document.getElementById('bprims');
  var primsPop = document.getElementById('prims-pop');
  var primListBtn = document.getElementById('prim-list-btn');

  primsBtn.addEventListener('click', function(e){
    e.stopPropagation();
    var open = primBar.classList.toggle('open');
    primsBtn.classList.toggle('on', open);
    if(open && window._hideGviewSlider) window._hideGviewSlider();
    if(!open){
      primsPop.classList.remove('open');
      primListBtn.classList.remove('on');
    }
  });

  // ── Obj button toggles sub-popup (object list) ──
  function openPrimsPop(){
    primsPop.classList.add('open');
    primListBtn.classList.add('on');
    var br = primListBtn.getBoundingClientRect();
    primsPop.style.top = (br.bottom + 4) + 'px';
    primsPop.style.left = Math.max(4, Math.min(br.left, window.innerWidth - 170)) + 'px';
  }
  primListBtn.addEventListener('click', function(e){
    e.stopPropagation();
    if(primsPop.classList.contains('open')){ primsPop.classList.remove('open'); primListBtn.classList.remove('on'); }
    else if(primitives.length > 0){ openPrimsPop(); }
    else { toast('No objects yet — add one first'); }
  });
  document.addEventListener('click', function(e){
    if(primsPop.classList.contains('open') && !primsPop.contains(e.target) && e.target !== primListBtn){
      primsPop.classList.remove('open');
      primListBtn.classList.remove('on');
    }
  });

  // ── Add buttons ──
  ['box','sphere','cylinder','cone','plane'].forEach(function(type){
    document.getElementById('prim-add-'+type).addEventListener('click', function(){
      addPrimitive(type);
    });
  });

  // ── SEL button (toggle prim-select mode) ──
  var primSelBtn = document.getElementById('prim-sel-btn');
  primSelBtn.addEventListener('click', function(){
    _primSelectMode = !_primSelectMode;
    window._primSelectMode = _primSelectMode;
    primSelBtn.classList.toggle('on', _primSelectMode);
    if(!_primSelectMode) deselectPrimitive();
    else toast('Tap a ref object in scene');
  });

  // ── As Plane toggle (global) ──
  var asPlaneBtn = document.getElementById('prim-asplane-btn');
  asPlaneBtn.addEventListener('click', function(){
    if(primitives.length === 0){ toast('Add a ref object first'); return; }
    togglePrimsAsPlane(!_primsAsPlane);
  });

  // ── Ref layer eye toggle (layers-pop + toolbar eye button) ──
  var refEye = document.getElementById('tb-leye4');
  var primEyeBtn = document.getElementById('prim-eye-btn');
  function syncRefEyeUI(){
    if(refEye){
      refEye.textContent = _refLayerVisible ? '◉' : '○';
      refEye.classList.toggle('vis', _refLayerVisible);
    }
    if(primEyeBtn) primEyeBtn.classList.toggle('on', _refLayerVisible);
  }
  function toggleRefVis(){
    _refLayerVisible = !_refLayerVisible;
    setRefLayerVisible(_refLayerVisible);
    syncRefEyeUI();
  }
  if(refEye) refEye.addEventListener('click', toggleRefVis);
  if(primEyeBtn) primEyeBtn.addEventListener('click', toggleRefVis);

  // ── Intercept select mode for primitive selection ──
  // Monkey-patch selectStroke to also check primitives when prim-select is on
  window._primSelectOnTap = function(px, py){
    if(!_primSelectMode) return false;
    var hit = findNearestPrimitive(px, py);
    if(hit){
      selectPrimitive(hit);
      return true;
    }
    deselectPrimitive();
    return false; // let tap fall through to normal draw/erase/select
  };

  // ── Loft solid from selected strokes ──
  window._createLoftSolid = function(selectedStrokes){
    if(primitives.length >= PRIM_MAX){ toast('Ref cap reached ('+PRIM_MAX+')'); return; }
    if(selectedStrokes.length < 2){ toast('Select 2+ strokes for loft solid'); return; }
    var N = 48;
    var rails = [];
    var profilePts = [];
    for(var i = 0; i < selectedStrokes.length; i++){
      var s = selectedStrokes[i];
      // Resample to world-space points
      var wpts = s.pts.map(function(p){ return p.clone().applyMatrix4(s.mesh.matrixWorld); });
      if(wpts.length < 2){ toast('Stroke too short for loft solid'); return; }
      var lens = [0];
      for(var j = 1; j < wpts.length; j++) lens.push(lens[j-1] + wpts[j].distanceTo(wpts[j-1]));
      var total = lens[lens.length-1];
      if(total < 1e-6){ toast('Stroke too short for loft solid'); return; }
      var resampled = [];
      for(var si = 0; si < N; si++){
        var t = si / (N-1) * total;
        var lo = 0, hi = lens.length - 2;
        while(lo < hi){ var mid = (lo+hi)>>1; if(lens[mid+1] < t) lo = mid+1; else hi = mid; }
        var seg = lo;
        var segLen = lens[seg+1] - lens[seg];
        var alpha = segLen < 1e-10 ? 0 : (t - lens[seg]) / segLen;
        resampled.push(wpts[seg].clone().lerp(wpts[seg+1], alpha));
      }
      rails.push(resampled);
      profilePts.push(resampled.map(function(p){ return [p.x, p.y, p.z]; }));
    }
    // Centroid
    var cen = new THREE.Vector3();
    var ct = 0;
    rails.forEach(function(r){ r.forEach(function(p){ cen.add(p); ct++; }); });
    cen.divideScalar(ct);

    // Build geometry (same algo as loft IIFE)
    var M = rails.length;
    var pos = [], norms = [], idx = [];
    for(var ri = 0; ri < M; ri++){
      for(var pi = 0; pi < N; pi++){
        var p = rails[ri][pi];
        pos.push(p.x - cen.x, p.y - cen.y, p.z - cen.z);
        norms.push(0, 1, 0);
      }
    }
    for(var ri = 0; ri < M-1; ri++){
      for(var pi = 0; pi < N-1; pi++){
        var a = ri*N + pi, b = ri*N + pi+1, c = (ri+1)*N + pi, d = (ri+1)*N + pi+1;
        idx.push(a, b, c, b, d, c);
      }
    }
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();

    var grp = makePrimGroup(geo, '#ffffff');
    grp.position.copy(cen);
    scene.add(grp);
    var entry = {
      id: _primIdCounter++,
      type: 'loft',
      mesh: grp,
      color: '#ffffff',
      opacity: 1,
      visible: true,

      profilePts: profilePts,
      _rowEl: null
    };
    primitives.push(entry);
    addPrimRow(entry);
    updatePrimCount();
    showRefLayerRow();
    pushUndo({type:'prim_add', prim: entry});
    markDirty();
    toast('Loft solid added to Ref layer');
  };

  // sg-loft-solid button wiring
  document.getElementById('sg-loft-solid').addEventListener('click', function(){
    window._createLoftSolid(selectedStrokes);
  });

  // ── Show/hide loft-solid button based on selection count ──
  window._syncLoftSolidBtn = function(){
    var show = selectedStrokes.length >= 2;
    var btn = document.getElementById('sg-loft-solid');
    if(btn) btn.style.display = show ? '' : 'none';
    // Also toggle the ghud-sel / pb-ghud-sel loft-solid buttons
    document.querySelectorAll('[data-selact="loft-solid"]').forEach(function(b){
      b.style.display = show ? '' : 'none';
    });
  };

  // ── Serialization ──
  window._serializePrimitives = function(){
    return primitives.map(function(p){
      var obj = {
        id: p.id,
        type: p.type,
        color: p.color,
        opacity: p.opacity != null ? p.opacity : 1,
        visible: p.visible,
        position: [p.mesh.position.x, p.mesh.position.y, p.mesh.position.z],
        quaternion: [p.mesh.quaternion.x, p.mesh.quaternion.y, p.mesh.quaternion.z, p.mesh.quaternion.w],
        scale: [p.mesh.scale.x, p.mesh.scale.y, p.mesh.scale.z]
      };
      if(p.type === 'loft' && p.profilePts) obj.profilePts = p.profilePts;
      return obj;
    });
  };

  window._deserializePrimitives = function(arr){
    // Clear existing
    window._clearAllPrimitives();
    if(!arr || !arr.length) return;
    for(var i = 0; i < arr.length; i++){
      var d = arr[i];
      if(primitives.length >= PRIM_MAX) break;
      var grp;
      if(d.type === 'loft' && d.profilePts){
        // Reconstruct loft geometry from profile points
        var N = d.profilePts[0] ? d.profilePts[0].length : 48;
        var M = d.profilePts.length;
        var pos = [], norms = [], idx = [];
        for(var ri = 0; ri < M; ri++){
          for(var pi = 0; pi < N; pi++){
            var pt = d.profilePts[ri][pi];
            pos.push(pt[0], pt[1], pt[2]);
            norms.push(0, 1, 0);
          }
        }
        for(var ri = 0; ri < M-1; ri++){
          for(var pi = 0; pi < N-1; pi++){
            var a = ri*N + pi, b = ri*N + pi+1, c = (ri+1)*N + pi, dd2 = (ri+1)*N + pi+1;
            idx.push(a, b, c, b, dd2, c);
          }
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        grp = makePrimGroup(geo, d.color || '#ffffff', d.opacity != null ? d.opacity : 1);
      } else {
        var geo = makeGeometry(d.type);
        grp = makePrimGroup(geo, d.color || '#ffffff', d.opacity != null ? d.opacity : 1);
      }
      if(d.position) grp.position.set(d.position[0], d.position[1], d.position[2]);
      if(d.quaternion) grp.quaternion.set(d.quaternion[0], d.quaternion[1], d.quaternion[2], d.quaternion[3]);
      if(d.scale) grp.scale.set(d.scale[0], d.scale[1], d.scale[2]);
      grp.updateMatrix(); grp.matrixAutoUpdate = false;
      grp.visible = d.visible !== false;
      scene.add(grp);
      var entry = {
        id: d.id || _primIdCounter++,
        type: d.type,
        mesh: grp,
        color: d.color || '#ffffff',
        opacity: d.opacity != null ? d.opacity : 1,
        visible: d.visible !== false,
  
        _rowEl: null
      };
      if(d.type === 'loft' && d.profilePts) entry.profilePts = d.profilePts;
      if(d.id >= _primIdCounter) _primIdCounter = d.id + 1;
      primitives.push(entry);
    }
    rebuildPrimRows();
    updatePrimCount();
    showRefLayerRow();
  };

  window._clearAllPrimitives = function(){
    deselectPrimitive();
    if(_primsAsPlane) togglePrimsAsPlane(false);
    while(primitives.length){
      var p = primitives.pop();
      scene.remove(p.mesh);
      p.mesh.traverse(function(c){if(c.geometry)c.geometry.dispose();if(c.material)c.material.dispose();});
    }
    var stack = document.getElementById('prim-stack');
    while(stack.firstChild) stack.removeChild(stack.firstChild);
    updatePrimCount();
    showRefLayerRow();
    // Reset select mode
    _primSelectMode = false;
    window._primSelectMode = false;
  };

  // ── Undo/redo support ──
  window._primUndoAdd = function(entry){
    // Undo of prim_add: remove the mesh
    scene.remove(entry.mesh);
    var idx = primitives.indexOf(entry);
    if(idx > -1) primitives.splice(idx, 1);
    if(entry._rowEl && entry._rowEl.parentNode) entry._rowEl.parentNode.removeChild(entry._rowEl);
    if(_selectedPrim && _selectedPrim.id === entry.id) deselectPrimitive();
    updatePrimCount();
    showRefLayerRow();
    markDirty();
  };
  window._primRedoAdd = function(entry){
    // Redo of prim_add: re-add
    scene.add(entry.mesh);
    primitives.push(entry);
    addPrimRow(entry);
    updatePrimCount();
    showRefLayerRow();
    markDirty();
  };
  window._primUndoDelete = function(entry, index){
    // Undo of prim_delete: restore
    scene.add(entry.mesh);
    primitives.splice(index, 0, entry);
    rebuildPrimRows();
    updatePrimCount();
    showRefLayerRow();
    markDirty();
  };
  window._primRedoDelete = function(entry){
    // Redo of prim_delete: remove again
    scene.remove(entry.mesh);
    var idx = primitives.indexOf(entry);
    if(idx > -1) primitives.splice(idx, 1);
    if(entry._rowEl && entry._rowEl.parentNode) entry._rowEl.parentNode.removeChild(entry._rowEl);
    if(_selectedPrim && _selectedPrim.id === entry.id) deselectPrimitive();
    updatePrimCount();
    showRefLayerRow();
    markDirty();
  };
  window._primUndoTransform = function(prim, oldPos, oldQuat, oldScale){
    prim.mesh.position.copy(oldPos);
    prim.mesh.quaternion.copy(oldQuat);
    prim.mesh.scale.copy(oldScale);
    prim.mesh.updateMatrix(); prim.mesh.matrixAutoUpdate = false;
    if(window._pgGcDraw) window._pgGcDraw();
    markDirty();
  };

  // ── Expose for page switching ──
  window._savePrimitivesForPage = function(){
    return window._serializePrimitives();
  };
  window._loadPrimitivesForPage = function(arr){
    window._deserializePrimitives(arr || []);
  };

  // ── Close prims strip in newScene ──
  window._closePrimsStrip = function(){
    var bar = document.getElementById('prim-bar');
    if(bar) bar.classList.remove('open');
    var pop = document.getElementById('prims-pop');
    if(pop) pop.classList.remove('open');
    var btn = document.getElementById('bprims');
    if(btn) btn.classList.remove('on');
    var lb = document.getElementById('prim-list-btn');
    if(lb) lb.classList.remove('on');
  };

  // ── Initial state ──
  updatePrimCount();
  showRefLayerRow();
})();


// ================================================================
//  NAVCUBE — XYZ axis orientation gizmo (Blender-style)
//  Three coloured arms from centre, label dots at tips.
//  Tap a tip dot to snap to that view. Drag to orbit.
// ================================================================
