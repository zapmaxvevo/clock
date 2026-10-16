/**
 * Localizadores de `/equipo` (R8 del núcleo de reportes, E1a de la fase 2).
 * Como en `reports-page.ts`, todo se busca por rol y por texto accesible: la
 * tabla se nombra por el título y cada persona es una fila con su encabezado
 * de fila, que empieza con el nombre y sigue con «(vos)» y el email. Una
 * invitada es una fila al final, cuyo encabezado empieza con el correo y sigue
 * con sus marcas.
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

/** Los botones de una fila: uno si quien mira puede cambiarle el rol, si no ninguno. */
export function rowButtons(row: Locator): Locator {
  return row.getByRole("button");
}

/** El botón de una fila por su nombre accesible, «{acción}: {nombre}» (§5.4). */
export function roleButton(page: Page, action: RoleAction, name: string): Locator {
  return teamTable(page).getByRole("button", { name: `${action}: ${name}`, exact: true });
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

/** E1a, §5.2: «Invitar», junto al título; el diálogo tiene su propio «Invitar». */
export const INVITE = "Invitar";

/**
 * «Invitar» junto al título, dentro de `main`. Con el diálogo abierto, el resto
 * de la página queda fuera del árbol accesible, así que no se confunde con el
 * botón del diálogo. Con quien mira solo en el equipo, el vacío de EQ-93 suma
 * un segundo «Invitar» debajo de la tabla: el del título es el primero.
 */
export function inviteButton(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("button", { name: INVITE, exact: true })
    .first();
}

/** EQ-93: el vacío, con quien mira solo en el equipo y sin invitadas. */
export const NO_INVITATIONS_YET = "Todavía no invitaste a nadie.";

/** E1a, §5.3: el paso de carga del diálogo. */
export function inviteDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Invitar personas", exact: true });
}

/** El campo de los correos del paso de carga. */
export function emailsField(dialog: Locator): Locator {
  return dialog.getByRole("textbox", { name: "Correos", exact: true });
}

/** Un botón de un diálogo por su texto. */
export function dialogButton(dialog: Locator, name: string): Locator {
  return dialog.getByRole("button", { name, exact: true });
}

/** El aviso del diálogo: los rechazos o la falla de red, con «Reintentar». */
export function dialogAlert(dialog: Locator): Locator {
  return dialog.getByRole("alert");
}

/** E1a, §5.3: el título del aviso de un pedido rechazado (ADR 0011). */
export const NOBODY_INVITED = "No se invitó a nadie.";

/** EQ-76: un correo que no es válido. */
export function invalidEmailMessage(email: string): string {
  return `${email} no es un correo válido.`;
}

/** EQ-79: el correo de una persona desactivada. */
export function inactiveMemberMessage(email: string): string {
  return `${email} está desactivada: reactivala desde la lista.`;
}

/** E1a, §5.3: deja en el campo solo los correos sin rechazo. */
export const DROP_FAILING = "Quitar los que fallan";

/** E1a, §5.3: el paso de resultado del diálogo. */
export function resultDialog(page: Page): Locator {
  return page.getByRole("dialog", { name: "Invitaciones", exact: true });
}

/** P-04: Clock no manda correos, así que el resultado lo dice. */
export const NO_EMAIL_SENT =
  "Clock no manda correos: avisale a cada persona con este texto.";

/** E1a, §5.3: el resultado de cada correo (D-E1a-7). */
export const INVITED = "Invitada";
export const ALREADY_INVITED = "Ya estaba invitada";
export type InviteOutcomeLabel = typeof INVITED | typeof ALREADY_INVITED;

/** D-E1a-10: el aviso para copiar, con la dirección de `BETTER_AUTH_URL`. */
export function noticeText(appUrl: string, email: string): string {
  return `Entrá a ${appUrl} con tu cuenta de Google ${email}.`;
}

/**
 * El renglón de un correo en el paso de resultado. Los correos de los
 * recorridos llevan un id único, así que ningún otro renglón lo nombra.
 */
export function outcomeItem(dialog: Locator, email: string): Locator {
  return dialog.getByRole("listitem").filter({ hasText: email });
}

/** El resultado de un renglón, por su texto completo. */
export function outcomeLabel(item: Locator, label: InviteOutcomeLabel): Locator {
  return item.getByText(label, { exact: true });
}

/** «Copiar» de un renglón, con el correo en el nombre (§5.3). */
export function copyButton(dialog: Locator, email: string): Locator {
  return dialog.getByRole("button", { name: `Copiar aviso para ${email}`, exact: true });
}

/** Lo que anuncia «Copiar» cuando el portapapeles lo aceptó. */
export const NOTICE_COPIED = "Aviso copiado.";

/** E1a, §5.4: las marcas del encabezado de fila de una invitada (EQ-04, EQ-22). */
export const INVITED_MARK = "Invitada";
export const EXTERNAL_MARK = "Externa";

/**
 * La fila de una invitación pendiente, por el comienzo de su encabezado de
 * fila, que es el correo. La de una persona empieza con el nombre, así que
 * la invitada que entró deja de encontrarse por acá.
 */
export function invitationRow(page: Page, email: string): Locator {
  return memberRow(page, email);
}

/** «Revocar invitación» de una fila, con el correo en el nombre (§5.4). */
export function revokeButton(page: Page, email: string): Locator {
  return teamTable(page).getByRole("button", {
    name: `Revocar invitación: ${email}`,
    exact: true,
  });
}

/** E1a, §5.4: la confirmación de una revocación. */
export function revokeDialog(page: Page, email: string): Locator {
  return page.getByRole("dialog", {
    name: `¿Revocar la invitación de ${email}?`,
    exact: true,
  });
}

/** El texto de la confirmación. */
export const REVOKE_WARNING =
  "No va a poder entrar con esta invitación. Podés volver a invitar a este correo cuando quieras.";

/** El aviso de la tabla después de revocar. */
export function revokedMessage(email: string): string {
  return `Invitación de ${email} revocada.`;
}
