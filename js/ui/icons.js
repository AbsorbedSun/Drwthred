// ============================================================================
// ICONS — un solo lugar para todos los íconos de la interfaz.
//
// Estilo del set (v2): líneas de 1.9 con puntas y uniones REDONDEADAS,
// esquinas suaves, y un relleno "duotono" (el mismo color al 18%) en la
// forma principal de cada ícono — se leen mejor a 20-22px en una tablet
// que los contornos finos, sin perder la simpleza. Todos comparten viewBox
// 24×24 y heredan el color del botón (currentColor), así que el estado
// activo/inactivo los colorea solo.
// ============================================================================
const WRAP = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Relleno duotono: misma forma, sin trazo, al 18% del color. */
const D = (d) => `<path d="${d}" fill="currentColor" fill-opacity=".18" stroke="none"/>`;
/** Forma con relleno duotono + contorno. */
const S = (d) => `${D(d)}<path d="${d}"/>`;

const TRAY = 'M4.5 15.5v2A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-2';

const PATHS = {
  // ── Herramientas principales ──
  brush: `${S('M9.7 13.4c-2.1-.1-3.8 1.4-3.8 3.4 0 1-.6 2-1.9 2.6 3.9 1.5 7.8-.3 7.7-4.2z')}<path d="M19.6 4.4c-2.6 1-7.2 5.7-8.6 7.6l1.9 1.9c1.9-1.4 6.6-6 7.6-8.6a.7.7 0 0 0-.9-.9z"/>`,
  eraser: `${S('M13.3 4.2a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8l-7.3 7.3a3 3 0 0 1-2.1.9H7.6a2 2 0 0 1-1.4-.6l-2-2a2 2 0 0 1 0-2.8z')}<path d="M8.8 8.7l6.5 6.5"/><path d="M14 19.9h6"/>`,
  cursor: S('M5.6 4.3l13.2 5.3a.6.6 0 0 1 0 1.1l-5.5 2.1-2.1 5.5a.6.6 0 0 1-1.1 0L4.8 5.1a.6.6 0 0 1 .8-.8z'),
  shapes: `<circle cx="8.5" cy="8.5" r="4.6"/>${S('M14.2 12.2h4.6a2 2 0 0 1 2 2v4.6a2 2 0 0 1-2 2h-4.6a2 2 0 0 1-2-2v-4.6a2 2 0 0 1 2-2z')}`,
  planeTool: `${S('M7.4 14.5h12.1a.6.6 0 0 1 .5 1l-2.8 3.6a1.5 1.5 0 0 1-1.2.6H4.5a.6.6 0 0 1-.5-1l2.2-3.6a1.5 1.5 0 0 1 1.2-.6z')}<path d="M12 11.5V3.8M8.8 7l3.2-3.2L15.2 7"/>`,

  // ── Pinceles ──
  pencil: `${S('M16.1 4.6a2 2 0 0 1 2.8 0l.5.5a2 2 0 0 1 0 2.8L8.8 18.5l-4.1.8.8-4.1z')}<path d="M14.1 6.6l3.3 3.3"/>`,
  ink: `${S('M12 3.6l5 6.3a1.5 1.5 0 0 1 .2 1.5L12 20.4l-5.2-9a1.5 1.5 0 0 1 .2-1.5z')}<path d="M12 12.5v7.9"/><circle cx="12" cy="10.6" r="1.2" fill="currentColor"/>`,
  marker: `${S('M14.6 4.3a1.5 1.5 0 0 1 2.1 0l3 3a1.5 1.5 0 0 1 0 2.1l-7.3 7.3-5.1-5.1z')}<path d="M7.3 11.6l-2.1 2.1a1 1 0 0 0-.3.7v2.7l2.1 2.1h2.7a1 1 0 0 0 .7-.3l2.1-2.1"/>`,
  softBrush: `${S('M9.7 13.4c-2.1-.1-3.8 1.4-3.8 3.4 0 1-.6 2-1.9 2.6 3.9 1.5 7.8-.3 7.7-4.2z')}<path d="M19.6 4.4c-2.6 1-7.2 5.7-8.6 7.6l1.9 1.9c1.9-1.4 6.6-6 7.6-8.6a.7.7 0 0 0-.9-.9z"/>`,
  calligraphy: `<path d="M4.6 17.8c2.4.6 4.1-1.3 5.6-4.7S13.6 6 16.3 6.2c1.3.1 2.4.8 3 1.8-1.2-.4-2.4-.2-3.4.5-1.8 1.3-2.4 4.7-4.2 7.4-1.7 2.6-4.6 3.4-7.1 1.9z" fill="currentColor" fill-opacity=".9" stroke-width="1.2"/>`,
  neon: `<path d="M3.8 14.5l4-5.2 4.2 6 4.2-6 4 5.2" stroke-width="5.5" stroke-opacity=".2"/><path d="M3.8 14.5l4-5.2 4.2 6 4.2-6 4 5.2"/>`,
  watercolor: `${S('M12 3.8c3.1 3.7 5.6 6.7 5.6 9.8a5.6 5.6 0 0 1-11.2 0c0-3.1 2.5-6.1 5.6-9.8z')}<path d="M9.4 14.2a2.7 2.7 0 0 0 2.2 2.5" stroke-opacity=".7"/>`,
  dashed: `<path d="M4 17.5c4-1.2 5-9.5 8-10.4s4 6.2 8 5.1" stroke-dasharray="3.2 3.4"/>`,
  chalk: `${S('M13.7 3.9a2 2 0 0 1 2.8.4l1.6 2.2a2 2 0 0 1-.4 2.8l-6.5 4.8-4-5.4z')}<path d="M7.2 8.7l4 5.4"/><path d="M4.5 19.6h.01M7.6 18.6h.01M10.6 19.9h.01M13.7 18.8h.01M16.8 19.7h.01M19.6 18.7h.01" stroke-width="2.4"/>`,
  // Alias viejos (proyectos/configs que todavía los nombren)
  pencilThin: '', airbrush: '',

  // ── Goma ──
  eraseFull: `<path d="M3.5 13.5c2.3-3.6 4.2-3.6 5.6 0s3.3 3.6 5.6 0 3.3-3.6 5.8-.4" stroke-opacity=".35"/>${D('M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z')}<path d="M9 9l6 6M15 9l-6 6"/>`,
  erasePartial: `<path d="M3.6 14.5c1.5-2.4 3-2.9 4.4-1.7"/><path d="M16 12.8c1.4 1.2 2.9.7 4.4-1.7"/>${D('M12 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6z')}<circle cx="12" cy="13" r="3" stroke-dasharray="1.6 2.2"/>`,

  // ── Figuras ──
  cube: `${D('M12 3.6l7.4 4.2L12 12 4.6 7.8z')}<path d="M12 3.6l7.4 4.2v8.4L12 20.4l-7.4-4.2V7.8z"/><path d="M4.6 7.8L12 12l7.4-4.2M12 12v8.4"/>`,
  sphere: `${S('M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8z')}<path d="M3.7 12c1.3 1.7 4.6 2.9 8.3 2.9s7-1.2 8.3-2.9"/>`,
  cylinder: `${D('M5 6.2c0-1.5 3.1-2.7 7-2.7s7 1.2 7 2.7v11.6c0 1.5-3.1 2.7-7 2.7s-7-1.2-7-2.7z')}<ellipse cx="12" cy="6.2" rx="7" ry="2.7"/><path d="M5 6.2v11.6c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7V6.2"/>`,
  cone: `${D('M12 3.6l7 14.2c0 1.5-3.1 2.6-7 2.6s-7-1.1-7-2.6z')}<path d="M5 17.8L12 3.6l7 14.2"/><path d="M5 17.8c0 1.5 3.1 2.6 7 2.6s7-1.1 7-2.6-3.1-2.6-7-2.6-7 1.1-7 2.6z"/>`,
  plane: S('M7.6 6.5h11.5a.8.8 0 0 1 .8 1l-2.3 9.4a1.5 1.5 0 0 1-1.5 1.1H4.6a.8.8 0 0 1-.8-1l2.3-9.4a1.5 1.5 0 0 1 1.5-1.1z'),

  // ── Acciones / navegación ──
  undo: `<path d="M9 14.5L4.5 10 9 5.5"/><path d="M4.5 10H15a4.5 4.5 0 0 1 0 9h-3"/>`,
  redo: `<path d="M15 14.5l4.5-4.5L15 5.5"/><path d="M19.5 10H9a4.5 4.5 0 0 0 0 9h3"/>`,
  views: `${S('M6.5 7h11A3.5 3.5 0 0 1 21 10.5v6a3.5 3.5 0 0 1-3.5 3.5h-11A3.5 3.5 0 0 1 3 16.5v-6A3.5 3.5 0 0 1 6.5 7z')}<path d="M8.5 7l1.1-1.9A2 2 0 0 1 11.3 4h1.4a2 2 0 0 1 1.7 1.1L15.5 7"/><circle cx="12" cy="13.5" r="3.2"/>`,
  folder: S('M3.5 8A2.5 2.5 0 0 1 6 5.5h3.1a2 2 0 0 1 1.4.6l1.4 1.4H18A2.5 2.5 0 0 1 20.5 10v7.5A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5z'),
  save: `<path d="M12 4v10.5M7.8 10.3L12 14.5l4.2-4.2"/><path d="${TRAY}"/>`,
  load: `<path d="M12 15V4.5M7.8 8.7L12 4.5l4.2 4.2"/><path d="${TRAY}"/>`,
  image: `${S('M7 4.5h10A3.5 3.5 0 0 1 20.5 8v8a3.5 3.5 0 0 1-3.5 3.5H7A3.5 3.5 0 0 1 3.5 16V8A3.5 3.5 0 0 1 7 4.5z')}<circle cx="9" cy="10" r="1.7"/><path d="M20.3 15.3l-4-4a1.5 1.5 0 0 0-2.1 0L6.4 19.2"/>`,
  layers: `${S('M12 3.8l8.2 4.3-8.2 4.3-8.2-4.3z')}<path d="M3.8 12.2l8.2 4.3 8.2-4.3"/><path d="M3.8 16.2l8.2 4.3 8.2-4.3"/>`,
  home: `${D('M6 9.3V18.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V9.3L12 4.6z')}<path d="M4 10.6l8-6.4 8 6.4"/><path d="M6 9.3v9.2A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V9.3"/><path d="M10 20v-4.5a2 2 0 0 1 4 0V20"/>`,

  // ── Utilitarios ──
  eyeOpen: `${D('M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z')}<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>`,
  eyeClosed: `<path d="M3.5 9.5C5.3 12 8.3 14 12 14s6.7-2 8.5-4.5"/><path d="M6.2 12.3L4.5 15M12 14v3.2M17.8 12.3l1.7 2.7"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  close: `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
  gear: `<path d="M4 7h8.5M18.5 7H20M4 17h1.5M11.5 17H20"/>${S('M15.5 4.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z')}${S('M8.5 14.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8z')}`,
  help: `${S('M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z')}<path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1.1.8-1.1 1.5v.4"/><circle cx="12" cy="16.6" r=".4" fill="currentColor" stroke-width="1.4"/>`,

  // ── Selección y acciones ──
  lasso: `${D('M12 4.5c4.7 0 8.5 2.6 8.5 5.9s-3.8 5.9-8.5 5.9-8.5-2.6-8.5-5.9 3.8-5.9 8.5-5.9z')}<path d="M8.6 15.8c-3-.9-5.1-3-5.1-5.4 0-3.3 3.8-5.9 8.5-5.9s8.5 2.6 8.5 5.9-3.8 5.9-8.5 5.9c-.8 0-1.6-.1-2.3-.2"/><path d="M8.6 15.8c-1 1.1-.7 2.6.6 3.2.9.4 1.3 1.1.9 1.9"/>`,
  duplicate: `${S('M10 9h8a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 18 21h-8a2.5 2.5 0 0 1-2.5-2.5v-7A2.5 2.5 0 0 1 10 9z')}<path d="M16.5 9V6.5A2.5 2.5 0 0 0 14 4H6.5A2.5 2.5 0 0 0 4 6.5V14a2.5 2.5 0 0 0 2.5 2.5h1"/><path d="M14 12.5v5M11.5 15h5"/>`,
  trash: `<path d="M4 7h16"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/>${S('M6 7h12l-.8 11.6a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9z')}<path d="M10 11v5.5M14 11v5.5"/>`,
  paint: `${S('M5.4 10.4L11 4.8l7 7-5.6 5.6a2 2 0 0 1-2.8 0l-4.2-4.2a2 2 0 0 1 0-2.8z')}<path d="M8.6 7.6L6.6 5.6a1.6 1.6 0 0 1 2.3-2.3l2.1 2.1"/><path d="M5 12h12.6"/><path d="M19.6 15.4s1.6 1.9 1.6 3a1.6 1.6 0 0 1-3.2 0c0-1.1 1.6-3 1.6-3z" fill="currentColor"/>`,
  toLayer: `${S('M12 3.8l8.2 4.3-8.2 4.3-8.2-4.3z')}<path d="M3.8 13.4L12 17.7l8.2-4.3"/><path d="M12 21v-6"/><path d="M9.6 18.6L12 21l2.4-2.4" />`,

  // ── Planos de dibujo ──
  rotatePlane: `${S('M7.4 14.5h12.1a.6.6 0 0 1 .5 1l-2.8 3.6a1.5 1.5 0 0 1-1.2.6H4.5a.6.6 0 0 1-.5-1l2.2-3.6a1.5 1.5 0 0 1 1.2-.6z')}<path d="M6.5 9.5a6.2 6.2 0 0 1 10.6-3.7"/><path d="M17.6 2.6l-.4 3.4-3.3-.5"/>`,
  surface: `${S('M12 3.6a8.4 8.4 0 1 1 0 16.8 8.4 8.4 0 0 1 0-16.8z')}<path d="M6.6 13.6c1.6-2.6 3.2-2.7 4.7-.6s3.2 2.1 5.3-1" stroke-width="2.4"/>`,
  planeFree: `<rect x="4" y="4" width="16" height="16" rx="4" stroke-dasharray="2.6 3"/><circle cx="12" cy="12" r="1.7" fill="currentColor" stroke="none"/>`,
  planeFront: `${S('M7.5 4.5h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9a3 3 0 0 1 3-3z')}<path d="M4.5 12h15M12 4.5v15" stroke-opacity=".4"/>`,
  planeSide: `${S('M8.9 4.1l6.3 2.8a1.5 1.5 0 0 1 .9 1.4v11.1a.8.8 0 0 1-1.1.7L8.7 17.3a1.5 1.5 0 0 1-.9-1.4V4.8a.8.8 0 0 1 1.1-.7z')}<path d="M7.8 10.6l8.3 3.7" stroke-opacity=".4"/>`,
  planeGround: `${S('M8.1 9.5h12a.6.6 0 0 1 .5 1l-4.3 5a1.5 1.5 0 0 1-1.1.5h-12a.6.6 0 0 1-.5-1l4.3-5a1.5 1.5 0 0 1 1.1-.5z')}<path d="M9.4 16l5.6-6.5" stroke-opacity=".4"/>`,
  planeCustom: `${S('M10.1 4.3l8.5 3.6a.8.8 0 0 1 .4 1.1l-4.5 9.6a1.5 1.5 0 0 1-1.9.7L4.1 15.7a.8.8 0 0 1-.4-1.1l4.5-9.6a1.5 1.5 0 0 1 1.9-.7z')}<path d="M6 10l11 4.7" stroke-opacity=".4"/>`,
  mirror: `<path d="M12 3.5v17" stroke-dasharray="1.2 3"/>${D('M15 7.5l4.8 8.6a.6.6 0 0 1-.5.9H15z')}<path d="M9 7.5l-4.8 8.6a.6.6 0 0 0 .5.9H9z"/><path d="M15 7.5l4.8 8.6a.6.6 0 0 1-.5.9H15z"/>`,
  alignView: `${D('M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z')}<circle cx="12" cy="12" r="6.5"/><path d="M12 2.8v2.7M12 18.5v2.7M2.8 12h2.7M18.5 12h2.7"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/>`,
};

// Alias: nombres viejos → íconos nuevos
PATHS.pencilThin = PATHS.pencil;
PATHS.airbrush = PATHS.watercolor;
PATHS.selectSingle = PATHS.cursor;

/** Devuelve el markup SVG de un ícono por nombre. */
export function icon(name) {
  const inner = PATHS[name];
  if (!inner) {
    console.warn(`[icons] no existe el ícono "${name}"`);
    return WRAP(PATHS.close);
  }
  return WRAP(inner);
}

export const ICON_NAMES = Object.keys(PATHS);
