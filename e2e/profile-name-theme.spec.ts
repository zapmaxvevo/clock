import type { Page, Route } from "@playwright/test";

import { withServerAction } from "./network";
import { expect, test } from "./session";
import {
  accountMenu,
  accountMenuButton,
  chooseTheme,
  documentIsMarked,
  documentThemeClass,
  goToTrackerByNav,
  markDocument,
  nameField,
  openProfileFromMenu,
  pageBackground,
  surfaceBackground,
  themeControl,
  themeOption,
} from "./tracker-page";

/**
 * Recorridos del slice 7b: el nombre editable y el tema (§7 del contrato).
 * Cada recorrido entra con una persona propia, que nace sin preferencias: el
 * nombre es el de la cuenta y el tema, «Seguir al sistema». La membresía no
 * activa (PF-46) no se prueba acá, por lo mismo que en el 7.
 */

/** El nombre con que `signIn` crea a la persona. */
const PERSON_NAME = "Persona de prueba";

/**
 * Los fondos de `globals.css` llevados a sRGB, como los devuelve
 * `surfaceBackground`: `--background` de la página en claro, `oklch(1 0 0)`,
 * y en oscuro, `oklch(0.145 0 0)`; y `--popover` del contenido de un `Select`
 * en oscuro, `oklch(0.205 0 0)`.
 */
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";
const DARK_POPOVER = "#171717";

/** PF-32: el aviso de la falla nombra lo que no se cambió. */
const NAME_NOT_SAVED = "No se pudo cambiar el nombre.";
const THEME_NOT_SAVED = "No se pudo cambiar el tema.";

/** PF-35: el nombre vacío o con solo espacios. */
const NAME_REQUIRED = "Escribí un nombre.";

/** El texto de `unexpected`, el de una falla de red. */
const NETWORK_FAILURE = "No se pudo guardar. Revisá la conexión y volvé a intentar.";

function isProfilePage(url: URL): boolean {
  return url.pathname === "/perfil";
}

/**
 * Cuenta las server actions que salen de la página desde ahora. Afirmar
 * sobre el total al final del recorrido, después de pedidos y recargas que
 * sí se esperan, muestra que lo que no debía pedir nada no pidió, sin esperar
 * un tiempo fijo.
 */
function countServerActions(page: Page): () => number {
  let count = 0;
  page.on("request", (request) => {
    if (request.headers()["next-action"] !== undefined) {
      count += 1;
    }
  });
  return () => count;
}

/** Las clases del `<html>` de un documento que mandó el servidor. */
function htmlClassesIn(document: string): string[] {
  const tag = /<html\b[^>]*>/.exec(document)?.[0] ?? "";
  const classes = /\sclass="([^"]*)"/.exec(tag)?.[1] ?? "";
  return classes.split(/\s+/).filter((name) => name !== "");
}

/** Abre el menú de la cuenta, afirma el nombre que muestra y lo cierra. */
async function expectNameInMenu(page: Page, name: string): Promise<void> {
  await accountMenuButton(page).click();
  await expect(accountMenu(page)).toContainText(name);
  await page.keyboard.press("Escape");
  await expect(accountMenu(page)).toBeHidden();
}

test("el nombre se edita en el perfil y llega al menú de la cuenta sin recargar", async ({
  page,
}) => {
  const actions = countServerActions(page);
  await page.goto("/");
  await openProfileFromMenu(page);
  const field = nameField(page);
  await expect(field).toHaveValue(PERSON_NAME);
  await markDocument(page);

  // PF-07, PF-32 y PF-33: salir del campo guarda, y el encabezado lo muestra
  // con sus iniciales sin recargar.
  await field.fill("Ana Prueba");
  await withServerAction(page, () => field.press("Tab"));
  await expect(accountMenuButton(page)).toHaveText("AP");
  await expectNameInMenu(page, "Ana Prueba");
  expect(await documentIsMarked(page)).toBe(true);

  // `Esc` descarta lo escrito, sin pedido.
  await field.fill("Otro nombre");
  await field.press("Escape");
  await expect(field).toHaveValue("Ana Prueba");

  // PF-35: el rechazo deja el aviso, sin «Reintentar», y el campo vuelve al
  // guardado aunque siga con el foco.
  await field.fill("  ");
  await withServerAction(page, () => field.press("Enter"));
  const notice = page.getByRole("alert").filter({ hasText: NAME_NOT_SAVED });
  await expect(notice).toContainText(NAME_REQUIRED);
  await expect(notice.getByRole("button", { name: "Reintentar" })).toHaveCount(0);
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Ana Prueba");
  expect(actions()).toBe(2);

  // Enter guarda el nombre recortado y el campo, con el foco, lo muestra así.
  await field.fill(" Ana María ");
  await withServerAction(page, () => field.press("Enter"));
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Ana María");
  await expect(accountMenuButton(page)).toHaveText("AM");

  // Enter y salir del campo con el nombre guardado no piden nada.
  await field.press("Enter");
  await expectNameInMenu(page, "Ana María");

  // PF-36: una carga nueva trae el nombre guardado.
  await page.reload();
  await expect(nameField(page)).toHaveValue("Ana María");
  await expect(accountMenuButton(page)).toHaveText("AM");
  await expectNameInMenu(page, "Ana María");
  expect(actions()).toBe(3);
});

test("el tema sigue al sistema o al elegido sin recargar, y «Salir» vuelve al sistema", async ({
  page,
}) => {
  // PF-23 y PF-24: sin tema elegido, `<html>` no lleva clase y el fondo sigue
  // al sistema, también cuando cambia con la pantalla abierta.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/perfil");
  await expect(themeControl(page)).toContainText("Seguir al sistema");
  expect(await documentThemeClass(page)).toBeNull();
  await expect.poll(() => pageBackground(page)).toBe(DARK_BACKGROUND);
  await markDocument(page);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_BACKGROUND);

  // «Oscuro» con el sistema claro: llega con la respuesta, sin recargar.
  await chooseTheme(page, "Oscuro");
  await expect.poll(() => documentThemeClass(page)).toBe("dark");
  await expect.poll(() => pageBackground(page)).toBe(DARK_BACKGROUND);
  expect(await documentIsMarked(page)).toBe(true);

  // El contenido del selector se dibuja en un portal y sigue al tema.
  await themeControl(page).click();
  const list = page.getByRole("listbox");
  await expect(themeOption(page, "Oscuro")).toBeVisible();
  await expect.poll(() => surfaceBackground(list)).toBe(DARK_POPOVER);
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();

  // Se conserva al navegar, y el servidor ya lo dibuja en el documento.
  await goToTrackerByNav(page);
  await expect.poll(() => pageBackground(page)).toBe(DARK_BACKGROUND);
  const response = await page.request.get("/");
  expect(response.ok(), `la pantalla respondió ${response.status()}`).toBeTruthy();
  const classes = htmlClassesIn(await response.text());
  expect(classes).toContain("dark");
  expect(classes).not.toContain("light");

  // «Claro» con el sistema oscuro.
  await openProfileFromMenu(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await chooseTheme(page, "Claro");
  await expect.poll(() => documentThemeClass(page)).toBe("light");
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_BACKGROUND);

  // Volver a «Seguir al sistema» quita la clase y el fondo sigue al sistema.
  await chooseTheme(page, "Seguir al sistema");
  await expect.poll(() => documentThemeClass(page)).toBeNull();
  await expect.poll(() => pageBackground(page)).toBe(DARK_BACKGROUND);
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_BACKGROUND);
  expect(await documentIsMarked(page)).toBe(true);

  // D2: después de «Salir», `/login` no hereda el tema de quien salió.
  await chooseTheme(page, "Oscuro");
  await expect.poll(() => documentThemeClass(page)).toBe("dark");
  await accountMenuButton(page).click();
  await accountMenu(page).getByRole("menuitem", { name: "Salir", exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/login");
  await expect(page.getByRole("heading", { name: "Clock", exact: true })).toBeVisible();
  await expect.poll(() => documentThemeClass(page)).toBeNull();
  await expect.poll(() => pageBackground(page)).toBe(LIGHT_BACKGROUND);
});

test("si el cambio de tema no llega al servidor el selector y los colores vuelven, y Reintentar lo guarda", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/perfil");
  const control = themeControl(page);
  await expect(control).toContainText("Seguir al sistema");

  // El pedido se corta antes de salir: el servidor no lo recibe.
  const abort = async (route: Route): Promise<void> => {
    if (route.request().headers()["next-action"] === undefined) {
      await route.fallback();
      return;
    }
    await route.abort();
  };
  await page.route(isProfilePage, abort);

  await control.click();
  await themeOption(page, "Oscuro").click();

  // PF-32: el aviso de dos partes, y el selector y `<html>` en lo guardado.
  const notice = page.getByRole("alert").filter({ hasText: THEME_NOT_SAVED });
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = notice.getByRole("button", { name: "Reintentar" });
  await expect(retry).toBeVisible();
  await expect(control).toContainText("Seguir al sistema");
  expect(await documentThemeClass(page)).toBeNull();
  expect(await pageBackground(page)).toBe(LIGHT_BACKGROUND);

  await page.unroute(isProfilePage, abort);
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(control).toContainText("Oscuro");
  await expect.poll(() => documentThemeClass(page)).toBe("dark");

  // PF-36: una carga nueva ya viene oscura.
  await page.reload();
  await expect(themeControl(page)).toContainText("Oscuro");
  expect(await documentThemeClass(page)).toBe("dark");
  await expect.poll(() => pageBackground(page)).toBe(DARK_BACKGROUND);
});
