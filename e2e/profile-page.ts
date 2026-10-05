/**
 * Localizadores y acciones de `/perfil` que suma el slice 7b: el nombre
 * editable y el tema. Como en `tracker-page.ts`, todo se busca por rol y por
 * texto accesible; la única excepción es `<html>`, que no tiene rol y lleva
 * la clase del tema.
 */
import { expect, type Locator, type Page } from "@playwright/test";

import { withServerAction } from "./network";
import { backgroundRgb } from "./tracker-page";

/** Los pedidos de la pantalla de perfil, para cortar o retener sus actions. */
export function isProfilePage(url: URL): boolean {
  return url.pathname === "/perfil";
}

/** El campo del nombre (PF-07), rotulado «Nombre». */
export function nameField(page: Page): Locator {
  return page.getByRole("textbox", { name: "Nombre", exact: true });
}

/** Los temas como los nombra el selector (PF-23). */
export type ThemeName = "Seguir al sistema" | "Claro" | "Oscuro";

/** El disparador del selector del tema, cuyo nombre empieza con «Tema». */
export function themeControl(page: Page): Locator {
  return page.getByRole("combobox", { name: /^Tema/ });
}

/**
 * Una opción del selector del tema abierto, por su nombre entero: los temas
 * no llevan ejemplo entre paréntesis. La lista va en un portal.
 */
export function themeOption(page: Page, theme: ThemeName): Locator {
  return page.getByRole("option", { name: theme, exact: true });
}

/**
 * Elige un tema y espera la respuesta del servidor, que es la que trae la
 * clase nueva de `<html>` (ADR 0015).
 */
export async function chooseTheme(page: Page, theme: ThemeName): Promise<void> {
  const control = themeControl(page);
  await control.click();
  await withServerAction(page, () => themeOption(page, theme).click());
  await expect(control).toContainText(theme);
}

/** La clase de tema que lleva `<html>`: `dark`, `light` o ninguna (PF-24). */
export async function documentThemeClass(page: Page): Promise<"dark" | "light" | null> {
  return page.locator("html").evaluate((html) => {
    const themes = (["dark", "light"] as const).filter((name) =>
      html.classList.contains(name),
    );
    if (themes.length > 1) {
      throw new Error(`<html> tiene las dos clases de tema: «${html.className}».`);
    }
    return themes[0] ?? null;
  });
}

/**
 * El fondo de la superficie de `element` en hexadecimal, sobre los canales de
 * `backgroundRgb`: la build reescribe los `oklch` de `globals.css` en `lab`
 * con decimales que dependen del compilador de CSS.
 */
export async function surfaceBackground(element: Locator): Promise<string> {
  const { red, green, blue } = await backgroundRgb(element);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** El fondo de la página, el de `body`. */
export async function pageBackground(page: Page): Promise<string> {
  return surfaceBackground(page.locator("body"));
}
