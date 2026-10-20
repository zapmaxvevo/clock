/**
 * Localizadores y textos de `/login`. Como en las demás páginas, todo se busca
 * por rol y por texto accesible.
 */
import type { Locator, Page } from "@playwright/test";

/** EQ-91: el texto para `sin_invitacion`. */
export const NO_INVITATION =
  "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.";

/** EQ-92: el texto para `membresia_inactiva` (D-E2-1 de E2). */
export const MEMBERSHIP_INACTIVE =
  "Tu acceso al workspace está desactivado. Pedile a quien administra el equipo que te vuelva a activar.";

/** D-E1b-2: el texto para `dominio_no_habilitado`. */
export const DOMAIN_DENIED = "La cuenta no es la de Google Workspace de la empresa.";

/**
 * EQ-122: el texto para `account_not_linked`, el rechazo de Better Auth a una
 * cuenta de Google nueva con un correo en uso (D-E2b-10 de E2b).
 */
export const ACCOUNT_NOT_LINKED =
  "Ya hay una persona en Clock con ese correo. Pedile a quien administra el equipo que revise tu acceso.";

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
