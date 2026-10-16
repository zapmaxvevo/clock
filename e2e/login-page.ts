/**
 * Localizadores y textos de `/login`. Como en las demás páginas, todo se busca
 * por rol y por texto accesible.
 */
import type { Locator, Page } from "@playwright/test";

/** EQ-91: el texto para `sin_invitacion`. */
export const NO_INVITATION =
  "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.";

/** D-E1b-2: el texto para `dominio_no_habilitado`. */
export const DOMAIN_DENIED = "La cuenta no es la de Google Workspace de la empresa.";

/** D-E1a-14: el texto para un motivo que no conoce. */
export const LOGIN_FAILED = "No se pudo iniciar sesión. Volvé a intentar.";

/** El aviso del motivo, dentro de `main` para no tomar el anunciador de rutas de Next. */
export function loginNotice(page: Page): Locator {
  return page.getByRole("main").getByRole("alert");
}

/** El botón de entrar, que sigue a la vista con el aviso. */
export function googleButton(page: Page): Locator {
  return page.getByRole("button", { name: "Entrar con Google" });
}
