/**
 * La paleta de proyectos (P-30). Se guarda la clave y no el valor, para poder
 * ajustar un tono sin migrar datos. El `check` de `project.color` en la base
 * repite estas claves.
 */
export const PALETTE_KEYS = [
  "red",
  "orange",
  "amber",
  "lime",
  "green",
  "teal",
  "cyan",
  "blue",
  "indigo",
  "violet",
  "pink",
  "slate",
] as const;

export type PaletteKey = (typeof PALETTE_KEYS)[number];

/** Estrecha un texto a una clave de la paleta, en el servidor y en el navegador. */
export function isPaletteKey(value: string): value is PaletteKey {
  const keys: readonly string[] = PALETTE_KEYS;
  return keys.includes(value);
}

export type PaletteColor = {
  readonly key: PaletteKey;
  /** Nombre accesible del color. */
  readonly label: string;
  readonly value: string;
};

// Tonos 600: se distinguen en un punto de ocho píxeles sobre fondo claro y oscuro.
const colors: { readonly [K in PaletteKey]: Omit<PaletteColor, "key"> } = {
  red: { label: "Rojo", value: "#DC2626" },
  orange: { label: "Naranja", value: "#EA580C" },
  amber: { label: "Ámbar", value: "#D97706" },
  lime: { label: "Lima", value: "#65A30D" },
  green: { label: "Verde", value: "#16A34A" },
  teal: { label: "Verde azulado", value: "#0D9488" },
  cyan: { label: "Cian", value: "#0891B2" },
  blue: { label: "Azul", value: "#2563EB" },
  indigo: { label: "Índigo", value: "#4F46E5" },
  violet: { label: "Violeta", value: "#7C3AED" },
  pink: { label: "Rosa", value: "#DB2777" },
  slate: { label: "Pizarra", value: "#475569" },
};

/** Los doce colores, en el orden de la paleta. */
export const PALETTE: readonly PaletteColor[] = PALETTE_KEYS.map((key) => ({
  key,
  ...colors[key],
}));

export function paletteColor(key: PaletteKey): PaletteColor {
  return { key, ...colors[key] };
}

/**
 * El color de un proyecto que no eligió ninguno (PR-15): el que sigue en la
 * paleta según cuántos proyectos tiene el workspace. Dos altas simultáneas
 * pueden recibir el mismo, y no pasa nada.
 */
export function nextPaletteColor(projectCount: number): PaletteKey {
  return PALETTE_KEYS[projectCount % PALETTE_KEYS.length];
}
