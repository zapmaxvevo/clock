import { expect, test as setup } from "@playwright/test";

import { backdateWorkspace } from "./database";
import { TEST_EMAIL_DOMAIN } from "./environment";
import { signIn } from "./session";

/**
 * El workspace lo crea la primera sesión que entra. Si eso pasara dentro de
 * los tests, dos que arrancan a la vez crearían uno cada uno y la lectura del
 * workspace dejaría de ser determinista. Entrar una vez acá, antes de que
 * arranque el paralelo, deja uno solo.
 *
 * Después se atrasa su piso: recién creado, no admite horas anteriores a hoy,
 * y los recorridos que cargan días viejos tienen que pasar igual en una base
 * nueva que en una que lleva meses. Se hace acá, una vez y antes del paralelo,
 * porque el workspace es de todos los tests y ninguno debería tocarlo.
 */
setup("el workspace existe antes de los tests", async ({ page }) => {
  await signIn(page.context(), `owner@${TEST_EMAIL_DOMAIN}`);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Rastreador" })).toBeVisible();

  await backdateWorkspace();
});
