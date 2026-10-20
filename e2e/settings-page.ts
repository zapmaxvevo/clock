/**
 * Localizadores de `/configuracion` (WS1 de la fase 2). Como en
 * `team-page.ts`, todo se busca por rol y por texto accesible: la sección es
 * una región nombrada por su `<h2>` y el campo, un cuadro de texto nombrado
 * por su rótulo.
 */
import type { Locator, Page } from "@playwright/test";

export const SETTINGS_PATH = "/configuracion";

/** WS-01: el enlace de la navegación principal. */
export const SETTINGS_LINK = "Configuración";

/** §5.5: el título de la pantalla. */
export const SETTINGS_HEADING = "Configuración del workspace";

/** §5.5: la única sección de WS1 (D-WS1-7). */
export const GENERAL_SECTION = "General";

/** §5.5: el rótulo del campo del nombre (WS-05). */
export const WORKSPACE_NAME = "Nombre del workspace";

/** WS-62: el título del aviso nombra lo que no se cambió. */
export const NAME_NOT_SAVED = "No se pudo cambiar el nombre del workspace.";

/** WS-53: el nombre vacío o con solo espacios. */
export const NAME_REQUIRED = "Escribí un nombre.";

/** El texto de `unexpected`, el de una falla de red (WS-62). */
export const NETWORK_FAILURE =
  "No se pudo guardar. Revisá la conexión y volvé a intentar.";

/** WS-50: la vista sin `workspace.settings.update`. */
export const FORBIDDEN_ROLE =
  "No tenés permiso para cambiar la configuración del workspace.";

/** WS-51, TT-92: el aviso de la membresía desactivada, con el cuerpo de esta pantalla. */
export const INACTIVE_TITLE = "Tu acceso al workspace está desactivado.";
export const INACTIVE_BODY = "No podés cambiar la configuración del workspace.";

export const RETRY = "Reintentar";

/** Los pedidos de la pantalla de configuración, para cortar o perder sus actions. */
export function isSettingsPage(url: URL): boolean {
  return url.pathname === SETTINGS_PATH;
}

/** La navegación principal del shell. */
export function mainNav(page: Page): Locator {
  return page.getByRole("navigation", { name: "Principal" });
}

/** «Configuración» en la navegación, solo con `workspace.settings.update` (WS-01). */
export function settingsNavLink(page: Page): Locator {
  return mainNav(page).getByRole("link", { name: SETTINGS_LINK, exact: true });
}

export function settingsHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: SETTINGS_HEADING, exact: true });
}

/** La sección «General», una región nombrada por su `<h2>` (§5.3). */
export function generalSection(page: Page): Locator {
  return page.getByRole("region", { name: GENERAL_SECTION, exact: true });
}

/** El campo del nombre del workspace (WS-05). */
export function workspaceNameField(page: Page): Locator {
  return page.getByRole("textbox", { name: WORKSPACE_NAME, exact: true });
}

/** El aviso de un cambio de nombre que no se guardó, por su título (WS-62). */
export function nameNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: NAME_NOT_SAVED });
}

export function retryButton(notice: Locator): Locator {
  return notice.getByRole("button", { name: RETRY, exact: true });
}

/** El aviso de TT-92 de una membresía desactivada (WS-51). */
export function inactiveNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: INACTIVE_TITLE });
}

/**
 * El nombre del workspace en el encabezado del shell (WS-06), por su texto
 * entero: el encabezado no lo rotula, y el resto de lo que muestra —la
 * navegación y las iniciales del menú de la cuenta— no se le parece a un
 * nombre de los recorridos.
 */
export function workspaceHeaderName(page: Page, name: string): Locator {
  return page.getByRole("banner").getByText(name, { exact: true });
}
