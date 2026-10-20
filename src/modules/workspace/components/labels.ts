/**
 * Textos de la pantalla de configuración. Los mensajes de error de la action no
 * viven acá: salen de `workspaceSettingsMessages`, en el esquema del módulo. La
 * entrada «Configuración» de la navegación va en `app-nav.tsx`, con las demás.
 */
export const workspaceSettingsLabels = {
  /** WS-01: el título, en los tres estados. */
  heading: "Configuración del workspace",
  /** WS-03: la única sección de WS1; «Registro de tiempo» llega con WS2b (D-WS1-7). */
  general: "General",
  name: "Nombre del workspace",
  /** TT-90, WS-62: el aviso nombra la operación que no se hizo. */
  nameFailed: "No se pudo cambiar el nombre del workspace.",
  /** WS-50: un `project_manager`, un `team_manager` o un member activos. */
  forbiddenRole: "No tenés permiso para cambiar la configuración del workspace.",
  /** WS-51, WS-72: el cuerpo del aviso de membresía desactivada, propio de esta pantalla. */
  forbiddenBody: "No podés cambiar la configuración del workspace.",
} as const;
