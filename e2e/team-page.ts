/**
 * Localizadores de `/equipo` (R8 del núcleo de reportes). Como en
 * `reports-page.ts`, todo se busca por rol y por texto accesible: la tabla se
 * nombra por el título y cada persona es una fila con su encabezado de fila,
 * que empieza con el nombre y sigue con «(vos)» y el email.
 */
import type { Locator, Page } from "@playwright/test";

import { escapeRegExp } from "./tracker-page";

export const TEAM_PATH = "/equipo";

/** §5.6: el título de la pantalla, que también nombra la tabla. */
export const TEAM_HEADING = "Equipo";

/** §5.6: la vista sin `team.manage`. */
export const FORBIDDEN_ROLE = "No tenés permiso para administrar el equipo.";

/** §5.6: la marca de la fila de quien mira. */
export const SELF_MARK = "(vos)";

/** §5.6: las dos acciones del botón de una fila (D-R8-10). */
export const PROMOTE = "Hacer administrador";
export const DEMOTE = "Quitar administrador";
export type RoleAction = typeof PROMOTE | typeof DEMOTE;

/** §5.6: los rótulos de los dos roles que cambia la pantalla. */
export const ADMIN_ROLE = "Administrador";
export const MEMBER_ROLE = "Miembro";
export type RoleLabel = typeof ADMIN_ROLE | typeof MEMBER_ROLE;

/** §5.5: la confirmación de bajarse a sí mismo. */
export const SELF_DEMOTE_TITLE = "¿Dejar de ser administrador?";
export const SELF_DEMOTE_CONFIRM = "Dejar de ser administrador";
export const CANCEL = "Cancelar";

/** §5.6: el aviso de un cambio que salió bien. */
export function changedMessage(name: string, role: RoleLabel): string {
  return `Rol de ${name}: ${role}.`;
}

/** Los pedidos de la pantalla de equipo, para retener sus actions. */
export function isTeamPage(url: URL): boolean {
  return url.pathname === TEAM_PATH;
}

/** «Equipo» en la navegación principal, solo con `team.manage` (D-R8-2). */
export function teamNavLink(page: Page): Locator {
  return page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: TEAM_HEADING, exact: true });
}

export function teamHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 1, name: TEAM_HEADING, exact: true });
}

/** La tabla de las membresías, nombrada por el título (§5.4). */
export function teamTable(page: Page): Locator {
  return page.getByRole("table", { name: TEAM_HEADING, exact: true });
}

/**
 * La fila de una persona, por el comienzo de su encabezado de fila. Los
 * nombres de los recorridos llevan un sufijo propio, así que en una lista de
 * cientos de filas no hay otro que empiece igual.
 */
export function memberRow(page: Page, name: string): Locator {
  return teamTable(page)
    .getByRole("row")
    .filter({
      has: page.getByRole("rowheader", {
        name: new RegExp(`^${escapeRegExp(name)}(?:\\s|$)`),
      }),
    });
}

/** El encabezado de fila de una persona: el nombre, «(vos)» y el email. */
export function memberHeader(row: Locator): Locator {
  return row.getByRole("rowheader");
}

/** La celda «Rol» de una fila, la primera después del encabezado de fila. */
export function roleCell(row: Locator): Locator {
  return row.getByRole("cell").first();
}

/** El botón de una fila por su nombre accesible, «{acción}: {nombre}» (§5.4). */
export function roleButton(page: Page, action: RoleAction, name: string): Locator {
  return teamTable(page).getByRole("button", { name: `${action}: ${name}`, exact: true });
}

export function selfDemoteDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: SELF_DEMOTE_TITLE, exact: true });
}

/**
 * El aviso único de la tabla (§5.4): `status` después de un cambio, `alert`
 * después de una falla. Dentro de `main`, para no tomar el anunciador de rutas
 * de Next.
 */
export function teamFeedback(page: Page): Locator {
  const main = page.getByRole("main");
  return main.getByRole("status").or(main.getByRole("alert"));
}
