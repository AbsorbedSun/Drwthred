// ============================================================================
// ICONS — un solo lugar para todos los íconos del HUD. Antes cada botón
// usaba un glifo Unicode suelto (✎, ⌫, ◆...) — se veían inconsistentes
// entre sí (peso visual distinto, algunos ni renderizaban bien según la
// fuente del sistema). Acá todos comparten el mismo viewBox, grosor de
// trazo y estilo de línea — un set real, no un collage de emojis.
// ============================================================================
const WRAP = (inner) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

const PATHS = {
  // Herramientas principales
  pencil: `<path d="M14.5 4.5l5 5L8 21H3v-5z"/><path d="M12.5 6.5l5 5"/>`,
  eraser: `<path d="M18 13l-7.5 7.5a2 2 0 0 1-2.8 0L3 15.8a2 2 0 0 1 0-2.8L13 3a2 2 0 0 1 2.8 0L20 7.2a2 2 0 0 1 0 2.8L15 15"/><path d="M8 21h11"/>`,
  shapes: `<circle cx="8" cy="8" r="4.5"/><rect x="13" y="13" width="8" height="8" rx="1"/>`,
  cursor: `<path d="M5 3l6 17 2.4-7.1L20.5 10.5z"/>`,

  // Variantes de pincel
  pencilThin: `<path d="M14.5 4.5l5 5L8 21H3v-5z"/>`,
  marker: `<rect x="8" y="3" width="8" height="6" rx="1"/><path d="M9 9l3 4 3-4"/><path d="M12 13v8"/>`,
  airbrush: `<rect x="6" y="9" width="6" height="11" rx="1"/><path d="M9 9V6a2 2 0 0 1 2-2h2"/><circle cx="17" cy="7" r=".7" fill="currentColor" stroke="none"/><circle cx="19.5" cy="10" r=".7" fill="currentColor" stroke="none"/><circle cx="16.5" cy="11.5" r=".7" fill="currentColor" stroke="none"/>`,

  // Variantes de goma
  eraseFull: `<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 9l6 6M15 9l-6 6"/>`,
  erasePartial: `<path d="M18 13l-7.5 7.5a2 2 0 0 1-2.8 0L3 15.8a2 2 0 0 1 0-2.8L13 3a2 2 0 0 1 2.8 0L20 7.2a2 2 0 0 1 0 2.8L15 15"/><path stroke-dasharray="2 3" d="M8 21h11"/>`,

  // Variantes de figuras
  plane: `<rect x="4" y="7" width="16" height="10" rx="1"/>`,
  cube: `<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5L12 12l8-4.5M12 12v9"/>`,
  sphere: `<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2"/>`,
  cylinder: `<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12a7 3 0 0 0 14 0V6"/>`,
  cone: `<ellipse cx="12" cy="19" rx="7" ry="2.5"/><path d="M12 3l6.2 16"/><path d="M12 3L5.8 19"/>`,

  // Variantes de selección
  selectSingle: `<circle cx="12" cy="12" r="7"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/>`,
  selectLasso: `<path d="M12 4c-5 0-8.5 3-8.5 6.5 0 2.6 2 4.7 4.8 5.5-.5.8-.3 1.7.5 2 1 .4 1.7-.3 1.7-1.2 2.7.3 5.5-1.6 5.5-6.3C20.5 7 16.8 4 12 4z"/>`,

  // Acciones / navegación
  undo: `<path d="M7 7H16a5 5 0 0 1 0 10h-5"/><path d="M10.5 3.5L7 7l3.5 3.5"/>`,
  redo: `<path d="M17 7H8a5 5 0 0 0 0 10h5"/><path d="M13.5 3.5L17 7l-3.5 3.5"/>`,
  views: `<path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"/><circle cx="12" cy="12" r="3.3"/>`,
  save: `<path d="M5 3h11l5 5v13H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>`,
  load: `<path d="M5 3h11l5 5v13H5z"/><path d="M12 17v-7M9 13l3-3 3 3"/>`,
  image: `<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 15l-5-5-4 4-3-3-6 6"/>`,
  layers: `<path d="M12 3l8 4.5-8 4.5-8-4.5z"/><path d="M4 12l8 4.5 8-4.5M4 16.5L12 21l8-4.5"/>`,

  // Utilitarios
  eyeOpen: `<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`,
  eyeClosed: `<path d="M3 3l18 18"/><path d="M10.6 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3.4 4.2M6.6 6.6C4 8.3 2 12 2 12s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  close: `<path d="M6 6l12 12M18 6L6 18"/>`,
  gear: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>`,
};

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
