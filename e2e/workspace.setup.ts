import { expect, test as setup } from "@playwright/test";

import { TEST_EMAIL_DOMAIN } from "./environment";
import { signIn } from "./session";

/**
 * El workspace lo crea la primera sesión que entra. Si eso pasara dentro de
 * los tests, dos que arrancan a la vez crearían uno cada uno y la lectura del
 * workspace dejaría de ser determinista. Entrar una vez acá, antes de que
 * arranque el paralelo, deja uno solo.
 */
setup("el workspace existe antes de los tests", async ({ page }) => {
  await signIn(page.context(), `owner@${TEST_EMAIL_DOMAIN}`);
  await page.goto("/");

  await expect(page.getByRole("region", { name: "Rastreador" })).toBeVisible();
});
