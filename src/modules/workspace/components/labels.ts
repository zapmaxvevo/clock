import type { DurationFormat } from "@/server/time";

/**
 * Textos de la pantalla de configuración. Los mensajes de error de la action no
 * viven acá: salen de `workspaceSettingsMessages`, en el esquema del módulo. La
 * entrada «Configuración» de la navegación va en `app-nav.tsx`, con las demás.
 */
export const workspaceSettingsLabels = {
  /** WS-01: el título, en los tres estados. */
  heading: "Configuración del workspace",
  /** WS-03: la primera sección, con el nombre (D-WS1-7). */
  general: "General",
  name: "Nombre del workspace",
  /** TT-90, WS-62: el aviso nombra la operación que no se hizo. */
  nameFailed: "No se pudo cambiar el nombre del workspace.",
  /** WS-03: la segunda sección, con el formato de duración (WS2b). */
  timeTracking: "Registro de tiempo",
  /** WS-15: el selector del formato. */
  durationFormat: "Formato de duración",
  /** WS-62: como el del nombre. */
  durationFailed: "No se pudo cambiar el formato de duración.",
  /** WS-73: la lectura de la pantalla falló, por ejemplo sin la fila de ajustes. */
  loadFailed: "No se pudo cargar la configuración.",
  /** WS-50: un `project_manager`, un `team_manager` o un member activos. */
  forbiddenRole: "No tenés permiso para cambiar la configuración del workspace.",
  /** WS-51, WS-72: el cuerpo del aviso de membresía desactivada, propio de esta pantalla. */
  forbiddenBody: "No podés cambiar la configuración del workspace.",
} as const;

/**
 * WS-15, PF-20, D-WS2b-6: cada formato por su nombre y su patrón. El selector
 * los escribe «Completo (hh:mm:ss)» y el perfil, con `durationFormatText`, igual
 * (PF-31). Viven acá, en el módulo dueño del ajuste.
 */
export const durationFormatNames = {
  full: "Completo",
  compact: "Compacto",
} as const satisfies Record<DurationFormat, string>;

export const durationFormatPatterns = {
  full: "hh:mm:ss",
  compact: "h:mm",
} as const satisfies Record<DurationFormat, string>;

/** PF-31: el formato como lo muestra el perfil, que no lo cambia. */
export function durationFormatText(format: DurationFormat): string {
  return `${durationFormatNames[format]} (${durationFormatPatterns[format]})`;
}

/** WS-15: el orden del selector, completo primero; no es el de `DURATION_FORMATS`. */
export const DURATION_FORMAT_ORDER = [
  "full",
  "compact",
] as const satisfies readonly DurationFormat[];
