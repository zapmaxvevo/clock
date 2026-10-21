import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { setMembershipStatus, setRole, workspaceNameOf } from "./database";
import {
  dropActionRequests,
  loseActionResponses,
  recordActions,
  withServerAction,
} from "./network";
import { reportsNavLink } from "./reports-page";
import { expect, test } from "./session";
import {
  DURATION_FORMAT_OPTIONS,
  DURATION_FORMAT_TEXTS,
  durationFormatControl,
  durationFormatOption,
  durationFormatOptions,
  enterAsAdmin,
  FORBIDDEN_ROLE,
  GENERAL_SECTION,
  generalSection,
  INACTIVE_BODY,
  inactiveNotice,
  isSettingsPage,
  mainNav,
  NAME_REQUIRED,
  nameNotice,
  NETWORK_FAILURE,
  retryButton,
  sectionHeadings,
  SETTINGS_LINK,
  SETTINGS_PATH,
  settingsHeading,
  settingsNavLink,
  TIME_TRACKING_SECTION,
  timeTrackingSection,
  WORKSPACE_NAME,
  workspaceHeaderName,
  workspaceNameField,
} from "./settings-page";
import { documentIsMarked, markDocument, trackerBar } from "./tracker-page";

/*
 * §9.3 del contrato de WS1 y §9.3 del de WS2b. Renombrar cambia el encabezado
 * de toda la base común, así que los recorridos de este archivo no corren a la
 * vez entre sí. Cada uno escribe un nombre propio y afirma solo el que
 * escribió; el de partida se lee de la base, porque es el que dejó el
 * recorrido anterior o una corrida anterior. El formato de duración no se
 * cambia acá: `chromium` corre con el compacto, y lo que lo escribe va en
 * `duration-format.switch.spec.ts` (D-WS2b-12).
 */
test.describe.configure({ mode: "serial" });

/** Un nombre que no escribió nadie más, dentro del tope de 100 (WS-05). */
function uniqueWorkspaceName(): string {
  return `e2e-ws-${randomUUID()}`;
}

/**
 * Entra a una pantalla, que es lo que le crea la membresía a la persona de la
 * sesión: sin ella no se le puede cambiar el rol ni el estado.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
}

/** Abre `/configuracion` y espera el campo con el nombre guardado. */
async function openSettings(page: Page): Promise<string> {
  const saved = await workspaceNameOf();
  await page.goto(SETTINGS_PATH);
  await expect(workspaceNameField(page)).toHaveValue(saved);
  return saved;
}

/** WS-50 y WS-51: el título, sin ninguna de las dos secciones ni sus campos. */
async function expectNoSettings(page: Page): Promise<void> {
  await expect(settingsHeading(page)).toBeVisible();
  await expect(generalSection(page)).toHaveCount(0);
  await expect(workspaceNameField(page)).toHaveCount(0);
  await expect(timeTrackingSection(page)).toHaveCount(0);
  await expect(durationFormatControl(page)).toHaveCount(0);
}

test("un admin renombra el workspace desde la navegación y el encabezado lo muestra sin recargar", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);

  // WS-01: «Configuración» va al final de la navegación, después de «Equipo».
  await expect(mainNav(page).getByRole("link").last()).toHaveText(SETTINGS_LINK);
  await markDocument(page);
  await settingsNavLink(page).click();
  await expect(page).toHaveURL((url) => url.pathname === SETTINGS_PATH);
  await expect(settingsNavLink(page)).toHaveAttribute("aria-current", "page");

  // WS-03, WS-05: el título, «General» y el nombre actual, el del encabezado.
  const saved = await workspaceNameOf();
  await expect(settingsHeading(page)).toBeVisible();
  const field = generalSection(page).getByRole("textbox", {
    name: WORKSPACE_NAME,
    exact: true,
  });
  await expect(field).toHaveValue(saved);
  await expect(field).toHaveAttribute("maxlength", "100");
  await expect(workspaceHeaderName(page, saved)).toBeVisible();

  // WS-04, WS-64: Enter guarda el recortado y el encabezado lo muestra con la
  // respuesta, sin recargar.
  const renamed = uniqueWorkspaceName();
  await field.fill(`  ${renamed}  `);
  await withServerAction(page, () => field.press("Enter"));
  await expect(workspaceHeaderName(page, renamed)).toBeVisible();
  await expect(workspaceHeaderName(page, saved)).toHaveCount(0);
  await expect(field).toHaveValue(renamed);
  expect(await workspaceNameOf()).toBe(renamed);
  expect(await documentIsMarked(page)).toBe(true);

  // WS-06: una carga nueva lo conserva.
  await page.reload();
  await expect(workspaceNameField(page)).toHaveValue(renamed);
  await expect(workspaceHeaderName(page, renamed)).toBeVisible();
});

test("un admin ve «Registro de tiempo» con el formato del workspace, y elegir el mismo no manda nada", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  await openSettings(page);

  // WS-03, criterio 13: «General» y después «Registro de tiempo», con el
  // selector adentro y el valor guardado, el compacto de `chromium`.
  await expect(sectionHeadings(page)).toHaveText([
    GENERAL_SECTION,
    TIME_TRACKING_SECTION,
  ]);
  const control = durationFormatControl(timeTrackingSection(page));
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);

  // WS-15: las dos opciones, el completo primero.
  const sent = recordActions(page);
  await control.click();
  await expect(durationFormatOptions(page)).toHaveText([...DURATION_FORMAT_OPTIONS]);

  // WS-04: elegir el que ya está cierra la lista sin mandar nada. El pedido
  // saldría con el clic, antes de que la lista se cierre y de recargar.
  await durationFormatOption(page, "compact").click();
  await expect(page.getByRole("listbox")).toBeHidden();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);
  await page.reload();
  await expect(durationFormatControl(page)).toHaveText(DURATION_FORMAT_TEXTS.compact);
  expect(sent).toHaveLength(0);
});

test("salir del campo guarda, Esc descarta y el mismo nombre no manda nada", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  await openSettings(page);
  const field = workspaceNameField(page);
  const sent = recordActions(page);

  // WS-04: escribir y salir del campo guarda, con un pedido.
  const first = uniqueWorkspaceName();
  await field.fill(first);
  await withServerAction(page, () => field.press("Tab"));
  await expect(field).toHaveValue(first);
  await expect(workspaceHeaderName(page, first)).toBeVisible();
  expect(sent).toHaveLength(1);

  // Esc vuelve al guardado.
  await field.fill(uniqueWorkspaceName());
  await field.press("Escape");
  await expect(field).toHaveValue(first);

  // El guardado con espacios alrededor, al salir, es el guardado.
  await field.fill(`  ${first}  `);
  await field.press("Tab");
  await expect(field).toHaveValue(first);

  // Entrar y salir sin escribir.
  await field.click();
  await field.press("Tab");
  await expect(field).toHaveValue(first);

  // Un último cambio que sí guarda: las actions salen en orden, así que
  // cuando llega su respuesta ya salió cualquiera de los pasos de arriba.
  // Que el total sea dos dice que ninguno pidió nada.
  const second = uniqueWorkspaceName();
  await field.fill(second);
  await withServerAction(page, () => field.press("Enter"));
  await expect(workspaceHeaderName(page, second)).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(await workspaceNameOf()).toBe(second);
});

test("un nombre vacío no se guarda y el aviso no ofrece reintentar", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  const saved = await openSettings(page);
  const field = workspaceNameField(page);

  // WS-53, WS-62: el aviso de dos partes, sin «Reintentar», y el campo y el
  // encabezado en lo guardado.
  await field.fill("");
  await withServerAction(page, () => field.press("Enter"));
  const notice = nameNotice(page);
  await expect(notice).toContainText(NAME_REQUIRED);
  await expect(retryButton(notice)).toHaveCount(0);
  await expect(field).toHaveValue(saved);
  await expect(workspaceHeaderName(page, saved)).toBeVisible();
  expect(await workspaceNameOf()).toBe(saved);
});

test("si el cambio no llega o se pierde su respuesta, Reintentar lo guarda", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  const saved = await openSettings(page);
  const field = workspaceNameField(page);

  // WS-62: el pedido se corta antes de salir, y el servidor no lo recibe.
  const restoreRequests = await dropActionRequests(page, isSettingsPage);
  const dropped = uniqueWorkspaceName();
  await field.fill(dropped);
  await field.press("Enter");
  const notice = nameNotice(page);
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = retryButton(notice);
  await expect(retry).toBeVisible();
  await expect(field).toHaveValue(saved);
  expect(await workspaceNameOf()).toBe(saved);

  await restoreRequests();
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(field).toHaveValue(dropped);
  await expect(workspaceHeaderName(page, dropped)).toBeVisible();
  expect(await workspaceNameOf()).toBe(dropped);

  // El servidor guarda y la respuesta no llega: «Reintentar» manda el mismo
  // nombre, que ya es el guardado, y responde éxito.
  const restoreResponses = await loseActionResponses(page, isSettingsPage);
  const lost = uniqueWorkspaceName();
  await field.fill(lost);
  await field.press("Enter");
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retry).toBeVisible();
  await expect.poll(() => workspaceNameOf()).toBe(lost);

  await restoreResponses();
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(field).toHaveValue(lost);
  await expect(workspaceHeaderName(page, lost)).toBeVisible();
  expect(await workspaceNameOf()).toBe(lost);
});

test("un member no ve «Configuración» y la dirección le dice que no tiene permiso", async ({
  page,
}) => {
  await enterApp(page);
  await expect(reportsNavLink(page)).toBeVisible();
  await expect(settingsNavLink(page)).toHaveCount(0);

  // WS-50.
  await page.goto(SETTINGS_PATH);
  await expectNoSettings(page);
  await expect(page.getByText(FORBIDDEN_ROLE, { exact: true })).toBeVisible();
});

test("un admin con la membresía desactivada ve el aviso de TT-92 y ningún campo", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  await setMembershipStatus(email, "inactive");

  // WS-51, WS-72: `can()` corta por estado, así que tampoco ve el enlace.
  await page.goto(SETTINGS_PATH);
  await expectNoSettings(page);
  const notice = inactiveNotice(page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(INACTIVE_BODY);
  await expect(settingsNavLink(page)).toHaveCount(0);
});

test("un admin que pierde el rol con la pantalla abierta no renombra y ve que no tiene permiso", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  const saved = await openSettings(page);
  await setRole(email, "member");

  // D-WS1-6: la respuesta `forbidden` llega con el árbol revalidado.
  const field = workspaceNameField(page);
  await field.fill(uniqueWorkspaceName());
  await withServerAction(page, () => field.press("Enter"));
  await expect(page.getByText(FORBIDDEN_ROLE, { exact: true })).toBeVisible();
  await expectNoSettings(page);
  await expect(settingsNavLink(page)).toHaveCount(0);
  await expect(workspaceHeaderName(page, saved)).toBeVisible();
  expect(await workspaceNameOf()).toBe(saved);
});
