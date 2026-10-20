/**
 * Localizadores de `/equipo` (R8 del núcleo de reportes, E1a de la fase 2).
 * Como en `reports-page.ts`, todo se busca por rol y por texto accesible: la
 * tabla se nombra por el título y cada persona es una fila con su encabezado
 * de fila, que empieza con el nombre y sigue con «(vos)» o «(inactiva)» y el
 * email. Una invitada es una fila al final, cuyo encabezado empieza con el
 * correo y sigue con sus marcas.
 */
import { randomUUID } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

import {
  ACCOUNT_LINK_TTL_DAYS,
  type AccountLink,
  type DateDisplay,
  setRole,
} from "./database";
import { dateLabel, dayOfInstantIn } from "./days";
import { OWNER_EMAIL, TEST_EMAIL_DOMAIN } from "./environment";
import { escapeRegExp, isTextStruck, trackerBar } from "./tracker-page";

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

/**
 * La fila del owner de la suite. Su nombre no lo fija la suite, así que se la
 * busca por el correo de su encabezado de fila.
 */
export function ownerRow(page: Page): Locator {
  return teamTable(page)
    .getByRole("row")
    .filter({ has: page.getByRole("rowheader").filter({ hasText: OWNER_EMAIL }) });
}

/** El encabezado de fila de una persona: el nombre, «(vos)» y el email. */
export function memberHeader(row: Locator): Locator {
  return row.getByRole("rowheader");
}

/** La celda «Rol» de una fila, la primera después del encabezado de fila. */
export function roleCell(row: Locator): Locator {
  return row.getByRole("cell").first();
}

/**
 * Los botones de una fila: el de rol, si quien mira puede cambiárselo, y el
 * menú «Acciones de {nombre}», si puede desactivarla o reactivarla (D-E2-9 de
 * E2). Una fila sin ninguna de las dos acciones no tiene botones.
 */
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

/** Abre «Invitar», escribe `emails` y manda el pedido. Devuelve el paso de carga. */
export async function sendInvitation(page: Page, emails: string): Promise<Locator> {
  await inviteButton(page).click();
  const dialog = inviteDialog(page);
  await emailsField(dialog).fill(emails);
  await dialogButton(dialog, INVITE).click();
  return dialog;
}

/**
 * Invita a `email`, espera que el resultado lo dé por invitado y cierra el
 * diálogo con «Listo». La revalidación trae su fila sin recargar (criterio 23
 * de E1a).
 */
export async function inviteOne(page: Page, email: string): Promise<void> {
  await sendInvitation(page, email);
  const result = resultDialog(page);
  await expect(outcomeLabel(outcomeItem(result, email), INVITED)).toBeVisible();
  await dialogButton(result, "Listo").click();
  await expect(result).toBeHidden();
  await expect(invitationRow(page, email)).toBeVisible();
}

/** Un correo del dominio que nadie más usa, con `label` para leer el recorrido. */
export function domainEmail(label: string): string {
  return `e2e-${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

/**
 * La persona de la sesión entra, que es lo que le crea la membresía, pasa a
 * admin y abre `/equipo`, que lee el rol en el pedido (D-R8-8). El owner de la
 * suite entró en el setup, así que quien mira nunca está solo y no aparece el
 * vacío de EQ-93, con su segundo «Invitar».
 */
export async function enterTeamAsAdmin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setRole(email, "admin");
  await page.goto(TEAM_PATH);
  await expect(teamTable(page)).toBeVisible();
  await expect(page.getByText(NO_INVITATIONS_YET, { exact: true })).toHaveCount(0);
}

/** E2, §5.2: el filtro de estado, con su etiqueta visible. */
export const STATUS_FILTER = "Estado";

/** E2, §5.2: las opciones del filtro, en su orden, y el valor de `?estado=` de cada una. */
export const STATUS_FILTERS = {
  Activas: null,
  Inactivas: "inactivas",
  Invitadas: "invitadas",
  Todas: "todas",
} as const;
export type StatusFilterLabel = keyof typeof STATUS_FILTERS;

/**
 * El disparador del filtro de estado. Es un `Select`: su nombre empieza con la
 * etiqueta y puede seguir con la opción elegida, que se lee con `toContainText`.
 */
export function statusFilter(page: Page): Locator {
  return page
    .getByRole("main")
    .getByRole("combobox", { name: new RegExp(`^${STATUS_FILTER}`) });
}

/** Una opción del filtro abierto. La lista va en un portal, así que se busca en `page`. */
export function statusFilterOption(page: Page, label: StatusFilterLabel): Locator {
  return page.getByRole("option", { name: label, exact: true });
}

/** La URL de `/equipo` con un filtro: «Activas» es la página sin parámetro (D-E2-8). */
export function isTeamFilterUrl(label: StatusFilterLabel): (url: URL) => boolean {
  const value = STATUS_FILTERS[label];
  return (url) =>
    url.pathname === TEAM_PATH &&
    (value === null ? url.search === "" : url.search === `?estado=${value}`);
}

/**
 * Elige un filtro de estado y espera la página que lo dibuja: elegir navega
 * (§5.2), así que la URL cambia y el disparador muestra la opción.
 */
export async function chooseStatusFilter(
  page: Page,
  label: StatusFilterLabel,
): Promise<void> {
  await statusFilter(page).click();
  await statusFilterOption(page, label).click();
  await expect(page).toHaveURL(isTeamFilterUrl(label));
  await expect(statusFilter(page)).toContainText(label);
}

/** EQ-05: la marca de una persona inactiva, después del nombre tachado. */
export const INACTIVE_MARK = "(inactiva)";

export function inactiveMark(row: Locator): Locator {
  return memberHeader(row).getByText(INACTIVE_MARK, { exact: true });
}

/** D-E2-7: debajo del correo de una persona sin `account`. */
export const NO_ACCOUNT = "Sin cuenta de Google vinculada.";

export function noAccountNote(row: Locator): Locator {
  return memberHeader(row).getByText(NO_ACCOUNT, { exact: true });
}

/** Si el nombre de una fila está tachado (EQ-05), hasta su encabezado de fila. */
export async function isNameStruck(row: Locator, name: string): Promise<boolean> {
  return isTextStruck(memberHeader(row).getByText(name, { exact: true }), "th");
}

/** E2, §5.3: el menú de una fila, con el nombre en el suyo (D-E2-9). */
export function rowActionsButton(page: Page, name: string): Locator {
  return teamTable(page).getByRole("button", {
    name: `Acciones de ${name}`,
    exact: true,
  });
}

/** El menú de una fila, para la del owner, cuyo nombre la suite no fija. */
export function rowMenuButton(row: Locator): Locator {
  return row.getByRole("button", { name: /^Acciones de / });
}

/** E2, §5.3: las dos entradas del menú de una fila que cambian el estado. */
export const DEACTIVATE = "Desactivar";
export const REACTIVATE = "Reactivar";
export type StatusAction = typeof DEACTIVATE | typeof REACTIVATE;

/**
 * E2b, §5.3: las entradas de la vinculación. Pedirla se rotula según la fila:
 * «otra» con cuenta, «una» sin cuenta y «Volver a pedir» con una marca vencida.
 */
export const REQUEST_LINK = "Vincular una cuenta de Google";
export const REQUEST_OTHER_LINK = "Vincular otra cuenta de Google";
export const RENEW_LINK = "Volver a pedir la vinculación";
export const CANCEL_LINK = "Cancelar la vinculación";
export type LinkAction =
  | typeof REQUEST_LINK
  | typeof REQUEST_OTHER_LINK
  | typeof RENEW_LINK
  | typeof CANCEL_LINK;

/** E2b, §5.3: la entrada de una inactiva con el correo sin liberar (D-E2b-9). */
export const RELEASE_EMAIL = "Liberar el correo";

export type RowAction = StatusAction | LinkAction | typeof RELEASE_EMAIL;

/** Una entrada del menú abierto, que vive en un portal. */
export function menuItem(page: Page, action: RowAction): Locator {
  return page.getByRole("menuitem", { name: action, exact: true });
}

/**
 * Las entradas del menú abierto, para afirmarlas todas y en su orden (§5.3 de
 * E2b) con `toHaveText`. Hay un solo menú abierto a la vez.
 */
export function menuItems(page: Page): Locator {
  return page.getByRole("menu").getByRole("menuitem");
}

/** Abre el menú de una fila y espera sus entradas, en su orden; lo deja abierto. */
export async function expectRowActions(
  page: Page,
  name: string,
  actions: readonly RowAction[],
): Promise<void> {
  await rowActionsButton(page, name).click();
  await expect(menuItems(page)).toHaveText([...actions]);
}

/** Cierra el menú abierto sin elegir nada. */
export async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
}

/** Abre el menú de una fila y elige una entrada. */
export async function chooseRowAction(
  page: Page,
  name: string,
  action: RowAction,
): Promise<void> {
  await rowActionsButton(page, name).click();
  await menuItem(page, action).click();
}

/** E2, §5.4: la confirmación de desactivar (EQ-46). */
export function deactivateDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name: `¿Desactivar a ${name}?`, exact: true });
}

/** El texto de la confirmación. */
export const DEACTIVATE_WARNING =
  "No va a poder entrar. Si tiene un timer en curso, se detiene. Sus horas quedan.";

/** E2, §5.4: el aviso de la tabla después de un cambio de estado. */
export function deactivatedMessage(name: string): string {
  return `Desactivaste a ${name}.`;
}

export function reactivatedMessage(name: string): string {
  return `Reactivaste a ${name}.`;
}

/** E2, §5.4: el título del aviso de un cambio de estado que falló. */
export function deactivateFailedTitle(name: string): string {
  return `No se pudo desactivar a ${name}.`;
}

/** EQ-85: un admin sobre otro admin. */
export const ADMIN_STATUS_OWNER_ONLY =
  "Solo el propietario desactiva o reactiva a un administrador.";

/**
 * TT-89, §5.4 de E2: el cuerpo del aviso de una falla de red, debajo del título
 * con el nombre, el mismo para cualquier pedido de la tabla.
 */
export const UNEXPECTED_BODY = "Revisá la conexión y volvé a intentar.";

/** TT-89: el botón del aviso de una falla de red. */
export const RETRY = "Reintentar";

/**
 * E2b, §5.2: la nota de una fila con una vinculación. Las fechas, con el
 * formato de fecha de quien mira (PF-12): las arma `linkNoteDates`.
 */
export function linkPendingFirstNote(requested: string, expires: string): string {
  return `Vinculación pedida el ${requested}, vence el ${expires}: falta su primer ingreso con Google.`;
}

export function linkPendingReplaceNote(requested: string, expires: string): string {
  return `Vinculación pedida el ${requested}, vence el ${expires}: la próxima cuenta de Google nueva con este correo reemplaza a la actual.`;
}

export function linkExpiredNote(requested: string, expires: string): string {
  return `La vinculación pedida el ${requested} venció el ${expires}.`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Las dos fechas de la nota de una vinculación, el pedido y el vencimiento,
 * en la zona de quien mira y con su formato de fecha, con el año (PF-12, ADR
 * 0012). Vence `ACCOUNT_LINK_TTL_DAYS` días después del pedido (D-E2b-11).
 */
export function linkNoteDates(
  link: AccountLink,
  viewer: DateDisplay,
): { readonly requested: string; readonly expires: string } {
  const expiresAt = new Date(link.requestedAt.getTime() + ACCOUNT_LINK_TTL_DAYS * DAY_MS);
  return {
    requested: dateLabel(
      dayOfInstantIn(link.requestedAt, viewer.timeZone),
      viewer.dateFormat,
    ),
    expires: dateLabel(dayOfInstantIn(expiresAt, viewer.timeZone), viewer.dateFormat),
  };
}

/** Una nota de la fila, debajo del correo, por su texto completo. */
export function rowNote(row: Locator, text: string): Locator {
  return memberHeader(row).getByText(text, { exact: true });
}

/**
 * Cualquier nota de vinculación de la fila, para afirmar que no queda ninguna.
 * Las tres empiezan igual salvo por el artículo.
 */
export function anyLinkNote(row: Locator): Locator {
  return memberHeader(row).getByText(/^(?:La v|V)inculación pedida el /);
}

/** E2b, §5.2: en lugar del correo, en una fila liberada (D-E2b-9). */
export const RELEASED_EMAIL = "Correo liberado";

export function releasedEmailNote(row: Locator): Locator {
  return rowNote(row, RELEASED_EMAIL);
}

/** E2b, §5.4: las confirmaciones de reactivar sin cuenta y de pedir una vinculación. */
export function reactivateDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", { name: `¿Reactivar a ${name}?`, exact: true });
}

export function requestLinkDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", {
    name: `¿Vincular una cuenta de Google a ${name}?`,
    exact: true,
  });
}

export function requestOtherLinkDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", {
    name: `¿Vincular otra cuenta de Google a ${name}?`,
    exact: true,
  });
}

/** El botón que confirma una vinculación; reactivar confirma con «Reactivar». */
export const LINK_CONFIRM = "Vincular";

/** El texto de la confirmación sin cuenta: la próxima cuenta es la primera. */
export function linkFirstWarning(email: string, name: string): string {
  return `En los próximos ${ACCOUNT_LINK_TTL_DAYS} días, la próxima cuenta de Google que entre con ${email} va a quedar vinculada a ${name}, con su rol y sus horas. Hacelo solo si ese correo sigue siendo suyo.`;
}

/** El texto de la confirmación con cuenta: la próxima cuenta nueva reemplaza a la actual. */
export function linkReplaceWarning(email: string, name: string): string {
  return `En los próximos ${ACCOUNT_LINK_TTL_DAYS} días, la próxima cuenta de Google nueva que entre con ${email} va a reemplazar a la actual, con el rol y las horas de ${name}. Hasta entonces, la cuenta actual sigue entrando. Hacelo solo si ese correo sigue siendo suyo.`;
}

/** El párrafo que suma la confirmación cuando pedirla registra a un externo (D-E2b-8). */
export function externalLinkWarning(email: string, name: string): string {
  return `${email} queda registrado como invitado externo, y sigue registrado aunque después canceles la vinculación o venza. Si ${name} ya tiene una cuenta de Google vinculada, vuelve a entrar con ella desde ahora.`;
}

/** E2b, §5.4: la confirmación de liberar el correo. */
export function releaseEmailDialog(page: Page, name: string): Locator {
  return page.getByRole("dialog", {
    name: `¿Liberar el correo de ${name}?`,
    exact: true,
  });
}

export function releaseEmailWarning(email: string, name: string): string {
  return `${email} deja de ser de ${name} y lo vas a poder invitar para otra persona. ${name} queda inactiva, con sus horas, y no va a poder volver a entrar ni reactivarse. No se puede deshacer.`;
}

/** E2b, §5.5: los avisos de la tabla después de un pedido que salió bien. */
export function reactivatedWithLinkMessage(name: string): string {
  return `Reactivaste a ${name}. Su cuenta de Google se vincula en su próximo ingreso.`;
}

export function linkRequestedMessage(name: string): string {
  return `Pediste vincular una cuenta de Google a ${name}.`;
}

export function linkCancelledMessage(name: string): string {
  return `Cancelaste la vinculación de ${name}.`;
}

export function emailReleasedMessage(name: string): string {
  return `Liberaste el correo de ${name}.`;
}
