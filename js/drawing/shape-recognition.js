// ============================================================================
// SHAPE RECOGNITION — "formas rápidas": un trazo hecho a mano se convierte
// en la forma perfecta que se quiso dibujar (como QuickShape de Procreate).
// Trabaja en 2D (coordenadas sobre el plano de dibujo); el enrutador de
// herramientas proyecta el trazo, llama a recognizeShape y vuelve a 3D.
//
// Orden de las pruebas (de la más exigente a la más permisiva):
//   abierto → línea (casi no se aparta de la recta entre sus puntas)
//           → arco (un círculo por inicio, medio y final ajusta bien)
//   cerrado → elipse/círculo (ajuste por componentes principales)
//           → triángulo / rectángulo (simplificación Ramer-Douglas-Peucker;
//             el rectángulo se "cuadra" si sus esquinas son casi rectas)
// Si nada ajusta lo suficiente, devuelve null y el trazo queda como está.
// ============================================================================

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function pathLength(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  return L;
}

function pointLineDistance(p, a, b) {
  const L = dist(a, b);
  if (L < 1e-12) return dist(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / L;
}

/** Simplificación Ramer–Douglas–Peucker (polilínea abierta). */
export function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = pointLineDistance(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const left = rdp(pts.slice(0, idx + 1), eps);
  const right = rdp(pts.slice(idx), eps);
  return left.slice(0, -1).concat(right);
}

function lerpPts(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: a.x + (b.x - a.x) * (i / n), y: a.y + (b.y - a.y) * (i / n) });
  return out;
}

/** Polígono cerrado densificado (para que la cinta tenga puntos en cada lado). */
function polygonPoints(corners, perSide = 12) {
  const out = [];
  for (let i = 0; i < corners.length; i++) out.push(...lerpPts(corners[i], corners[(i + 1) % corners.length], perSide));
  out.push({ ...corners[0] });
  return out;
}

function circleFrom3(a, b, c) {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
  const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
  const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
  return { x, y, r: Math.hypot(a.x - x, a.y - y) };
}

/** Punto a mitad de camino (por largo de recorrido). */
function midpointByLength(pts) {
  const half = pathLength(pts) / 2;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= half) {
      const t = (half - acc) / (d || 1);
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += d;
  }
  return pts[pts.length - 1];
}

function angleAt(prev, p, next) {
  const ax = prev.x - p.x, ay = prev.y - p.y, bx = next.x - p.x, by = next.y - p.y;
  const c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
  return Math.acos(Math.max(-1, Math.min(1, c)));
}

/** Ejes principales: centro, direcciones y desvío estándar en cada una. */
function pca(pts) {
  const n = pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / n, cy = pts.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  pts.forEach((p) => { const dx = p.x - cx, dy = p.y - cy; xx += dx * dx; yy += dy * dy; xy += dx * dy; });
  xx /= n; yy /= n; xy /= n;
  const ang = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(ang), uy = Math.sin(ang);
  let su = 0, sv = 0;
  pts.forEach((p) => {
    const dx = p.x - cx, dy = p.y - cy;
    su += (dx * ux + dy * uy) ** 2;
    sv += (-dx * uy + dy * ux) ** 2;
  });
  return { cx, cy, ux, uy, su: Math.sqrt(su / n), sv: Math.sqrt(sv / n) };
}

/**
 * @param {{x:number,y:number}[]} pts - el trazo, en 2D
 * @returns {{kind: string, label: string, points: {x,y}[], closed: boolean}|null}
 */
export function recognizeShape(pts) {
  if (!pts || pts.length < 6) return null;
  const L = pathLength(pts);
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const diag = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (L < 1e-6 || diag < 1e-6) return null;
  const first = pts[0], last = pts[pts.length - 1];
  const closed = dist(first, last) < 0.2 * L && L > 2.2 * diag * 0.9;

  if (!closed) {
    // ── Línea ──
    const chord = dist(first, last);
    const maxDev = Math.max(...pts.map((p) => pointLineDistance(p, first, last)));
    if (chord > 0.5 * L && maxDev / chord < 0.07) {
      return { kind: 'line', label: 'línea', closed: false, points: [...lerpPts(first, last, 24), { ...last }] };
    }
    // ── Arco ──
    const mid = midpointByLength(pts);
    const c = circleFrom3(first, mid, last);
    if (c && c.r < 3 * Math.max(chord, diag)) {
      const resid = pts.reduce((s, p) => s + Math.abs(Math.hypot(p.x - c.x, p.y - c.y) - c.r), 0) / pts.length / c.r;
      if (resid < 0.06) {
        const a0 = Math.atan2(first.y - c.y, first.x - c.x);
        const am = Math.atan2(mid.y - c.y, mid.x - c.x);
        let a1 = Math.atan2(last.y - c.y, last.x - c.x);
        // Recorrer en el sentido que pasa por el punto medio
        const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        const ccw = norm(am - a0) < norm(a1 - a0);
        const sweep = ccw ? norm(a1 - a0) : -norm(a0 - a1);
        // El recorrido a mano tiene que medir parecido al arco: un garabato
        // puede quedar "cerca" de un círculo enorme, pero recorre mucho más
        if (Math.abs(L / (c.r * Math.abs(sweep)) - 1) > 0.15) return null;
        const n = Math.max(12, Math.ceil(Math.abs(sweep) / 0.08));
        const out = [];
        for (let i = 0; i <= n; i++) { const a = a0 + (sweep * i) / n; out.push({ x: c.x + c.r * Math.cos(a), y: c.y + c.r * Math.sin(a) }); }
        return { kind: 'arc', label: 'arco', closed: false, points: out };
      }
    }
    return null;
  }

  // ── Cerrado: elipse / círculo ──
  const P = pca(pts);
  const a = Math.SQRT2 * P.su, b = Math.SQRT2 * P.sv; // semiejes de una elipse recorrida pareja
  if (a > 1e-9 && b > 1e-9) {
    const resid = pts.reduce((s, p) => {
      const dx = p.x - P.cx, dy = p.y - P.cy;
      const u = dx * P.ux + dy * P.uy, v = -dx * P.uy + dy * P.ux;
      return s + Math.abs(Math.hypot(u / a, v / b) - 1);
    }, 0) / pts.length;
    if (resid < 0.085) {
      const isCircle = Math.min(a, b) / Math.max(a, b) > 0.86;
      const ra = isCircle ? (a + b) / 2 : a, rb = isCircle ? (a + b) / 2 : b;
      const out = [];
      const n = 64;
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * 2 * Math.PI;
        const u = ra * Math.cos(t), v = rb * Math.sin(t);
        out.push({ x: P.cx + u * P.ux - v * P.uy, y: P.cy + u * P.uy + v * P.ux });
      }
      return { kind: isCircle ? 'circle' : 'ellipse', label: isCircle ? 'círculo' : 'elipse', closed: true, points: out };
    }
  }

  // ── Cerrado: polígonos ──
  const ring = pts.concat([first]);
  let corners = rdp(ring, 0.06 * diag).slice(0, -1);
  // Unir esquinas casi alineadas (lados que se partieron de más)
  for (let changed = true; changed && corners.length > 3;) {
    changed = false;
    for (let i = 0; i < corners.length; i++) {
      const prev = corners[(i - 1 + corners.length) % corners.length], next = corners[(i + 1) % corners.length];
      if (angleAt(prev, corners[i], next) > Math.PI * 0.82) { corners.splice(i, 1); changed = true; break; }
    }
  }
  if (corners.length === 3) {
    return { kind: 'triangle', label: 'triángulo', closed: true, points: polygonPoints(corners) };
  }
  if (corners.length === 4) {
    const angles = corners.map((p, i) => angleAt(corners[(i + 3) % 4], p, corners[(i + 1) % 4]));
    if (angles.every((ang) => Math.abs(ang - Math.PI / 2) < 0.3)) {
      // Rectángulo cuadrado: caja orientada según los ejes principales
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      corners.forEach((p) => {
        const dx = p.x - P.cx, dy = p.y - P.cy;
        const u = dx * P.ux + dy * P.uy, v = -dx * P.uy + dy * P.ux;
        minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
      });
      // Si la caja quedó casi en 45° respecto de las esquinas (rombo), usar las esquinas tal cual
      const box = [[minU, minV], [maxU, minV], [maxU, maxV], [minU, maxV]]
        .map(([u, v]) => ({ x: P.cx + u * P.ux - v * P.uy, y: P.cy + u * P.uy + v * P.ux }));
      const fit = corners.reduce((s, c) => s + Math.min(...box.map((q) => dist(q, c))), 0) / 4 / diag;
      const square = Math.min(maxU - minU, maxV - minV) / Math.max(maxU - minU, maxV - minV) > 0.9;
      return { kind: 'rectangle', label: square ? 'cuadrado' : 'rectángulo', closed: true, points: polygonPoints(fit < 0.08 ? box : corners) };
    }
    return { kind: 'quad', label: 'cuadrilátero', closed: true, points: polygonPoints(corners) };
  }
  return null;
}
