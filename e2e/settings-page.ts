/**
 * Localizadores de `/configuracion` (WS1 y WS2b de la fase 2). Como en
 * `team-page.ts`, todo se busca por rol y por texto accesible: cada sección es
 * una región nombrada por su `<h2>`, el nombre es un cuadro de texto nombrado
 * por su rótulo y el formato de duración, un combobox que empieza con el suyo.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import type { DurationFormat } from "@/server/time";

import { setRole } from "./database";
import { withServerAction } from "./network";
import { trackerBar } from "./tracker-page";

export const SETTINGS_PATH = "/configuracion";

/** WS-01: el enlace de la navegación principal. */
export const SETTINGS_LINK = "Configuración";

/** §5.5: el título de la pantalla. */
export const SETTINGS_HEADING = "Configuración del workspace";

/** §5.5 de WS1: la primera sección (D-WS1-7). */
export const GENERAL_SECTION = "General";

/** §5.2 de WS2b, WS-03: la segunda sección, después de «General». */
export const TIME_TRACKING_SECTION = "Registro de tiempo";

/** §5.6 de WS2b, WS-15: el rótulo del selector del formato. */
const DURATION_FORMAT = "Formato de duración";

/**
 * D-WS2b-6, PF-31: cómo se nombra cada formato, en el disparador, en la lista
 * y en el perfil. Es el único lugar de los e2e con estos textos: si la
 * pregunta 2 del contrato de WS2b se responde de otra forma, cambian acá.
 */
export const DURATION_FORMAT_TEXTS = {
  full: "Completo (hh:mm:ss)",
  compact: "Compacto (h:mm)",
} as const satisfies Record<DurationFormat, string>;

/** WS-15: las opciones del selector, completo primero. */
export const DURATION_FORMAT_OPTIONS = [
  DURATION_FORMAT_TEXTS.full,
  DURATION_FORMAT_TEXTS.compact,
] as const;

/** WS-62: el título del aviso de un formato que no se cambió. */
const DURATION_NOT_SAVED = "No se pudo cambiar el formato de duración.";

/** WS-73: el error de la pantalla, sin la fila de ajustes. */
const SETTINGS_LOAD_FAILED = "No se pudo cargar la configuración.";

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

/**
 * La persona de la sesión entra, que es lo que le crea la membresía, y pasa a
 * admin, como `enterTeamAsAdmin`. La navegación es del layout: la carga
 * completa de `/` la dibuja con el rol nuevo.
 */
export async function enterAsAdmin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setRole(email, "admin");
  await page.goto("/");
  await expect(settingsNavLink(page)).toBeVisible();
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

/** La sección «Registro de tiempo» (§5.2 de WS2b). */
export function timeTrackingSection(page: Page): Locator {
  return page.getByRole("region", { name: TIME_TRACKING_SECTION, exact: true });
}

/** Los títulos de las secciones, en el orden de la pantalla (WS-03). */
export function sectionHeadings(page: Page): Locator {
  return page.getByRole("main").getByRole("heading", { level: 2 });
}

/**
 * El disparador del selector del formato (WS-15), en la página o dentro de
 * `scope`. Su nombre empieza con el rótulo y sigue con el valor, como los de
 * las preferencias del perfil.
 */
export function durationFormatControl(scope: Page | Locator): Locator {
  return scope.getByRole("combobox", { name: new RegExp(`^${DURATION_FORMAT}`) });
}

/** Las opciones de la lista abierta, que va en un portal. */
export function durationFormatOptions(page: Page): Locator {
  return page.getByRole("listbox").getByRole("option");
}

/** Una opción de la lista abierta, por su nombre entero. */
export function durationFormatOption(page: Page, format: DurationFormat): Locator {
  return page.getByRole("option", { name: DURATION_FORMAT_TEXTS[format], exact: true });
}

/**
 * Elige un formato en el selector y espera la respuesta del servidor; el
 * disparador termina diciéndolo.
 */
export async function chooseDurationFormat(
  page: Page,
  format: DurationFormat,
): Promise<void> {
  const control = durationFormatControl(page);
  await control.click();
  await withServerAction(page, () => durationFormatOption(page, format).click());
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS[format]);
}

/** El aviso de un cambio de formato que no se guardó, por su título (WS-62). */
export function durationNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: DURATION_NOT_SAVED });
}

/** El error de la pantalla de WS-73, con su «Reintentar». */
export function loadFailedNotice(page: Page): Locator {
  return page.getByRole("alert").filter({ hasText: SETTINGS_LOAD_FAILED });
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
