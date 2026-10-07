/**
 * Localizadores y acciones de `/proyectos`, compartidos por los recorridos de
 * sus altas (slice 9), del facturable por defecto (11a) y de las etiquetas
 * (11b). Como en `tracker-page.ts`, todo se busca por rol y por texto
 * accesible.
 */
import { expect, type Locator, type Page } from "@playwright/test";

export const PROJECTS_PATH = "/proyectos";

/** Entra a `/proyectos` y espera su título. */
export async function openProjects(page: Page): Promise<void> {
  await page.goto(PROJECTS_PATH);
  await expect(page.getByRole("heading", { level: 1, name: "Proyectos" })).toBeVisible();
}

/** El campo «Nombre» de un diálogo de alta. */
export function nameField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Nombre", exact: true });
}

/** «Guardar» de un diálogo: el de un alta o el de la edición masiva. */
export function saveButton(dialog: Locator): Locator {
  return dialog.getByRole("button", { name: "Guardar", exact: true });
}
