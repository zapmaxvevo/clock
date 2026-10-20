import { randomUUID } from "node:crypto";

import {
  accountCountOf,
  type AccountLink,
  accountLinkOf,
  ensureOwnerGoogleAccount,
  invitationStatusOf,
  membershipStatusOf,
  seedExpiredAccountLink,
  seedGoogleAccount,
  seedPerson,
  setDisplayName,
  setRole,
  userEmailOfMember,
  userIdOf,
} from "./database";
import { PERSON_TIMEZONE } from "./calendar-page";
import { OWNER_EMAIL } from "./environment";
import {
  ACCOUNT_NOT_LINKED,
  googleButton,
  LOGIN_FAILED,
  loginNotice,
} from "./login-page";
import { openSecondTab, recordActions } from "./network";
import { expect, guestPage, TEST_EMAIL_DOMAIN, test } from "./session";
import {
  anyLinkNote,
  CANCEL_LINK,
  chooseRowAction,
  chooseStatusFilter,
  closeMenu,
  DEACTIVATE,
  dialogButton,
  emailReleasedMessage,
  enterTeamAsAdmin,
  expectRowActions,
  externalLinkWarning,
  inactiveMark,
  inviteOne,
  isNameStruck,
  LINK_CONFIRM,
  linkCancelledMessage,
  linkExpiredNote,
  linkFirstWarning,
  linkNoteDates,
  linkPendingFirstNote,
  linkPendingReplaceNote,
  linkReplaceWarning,
  linkRequestedMessage,
  memberHeader,
  memberRow,
  menuItem,
  menuItems,
  noAccountNote,
  ownerRow,
  REACTIVATE,
  reactivateDialog,
  reactivatedWithLinkMessage,
  RELEASE_EMAIL,
  releasedEmailNote,
  releaseEmailDialog,
  releaseEmailWarning,
  RENEW_LINK,
  REQUEST_LINK,
  REQUEST_OTHER_LINK,
  requestLinkDialog,
  requestOtherLinkDialog,
  rowActionsButton,
  rowButtons,
  rowMenuButton,
  rowNote,
  SELF_MARK,
  TEAM_PATH,
  teamFeedback,
} from "./team-page";
import { uniqueSuffix } from "./tracker-page";

/*
 * E2b, §9.3: como en E2, el workspace es común, así que cada recorrido siembra
 * a las personas cuya vinculación o correo cambia, con un nombre y un correo
 * únicos, y nunca afirma sobre la tabla entera ni sobre un vacío. El ingreso
 * por Google no corre en el navegador de pruebas: lo que pasa después de pedir
 * la vinculación lo prueba la integración por `auth.handler` (§9.4), y acá se
 * afirma en la base. La membresía del owner de la suite no se toca: pide y
 * libera, en un contexto propio, sobre personas del recorrido.
 */

/** Otra persona del workspace, `member`, con un correo del dominio salvo que se pida otro. */
async function seedLinkPerson(
  displayName: string,
  status: "active" | "inactive" = "active",
  domain = TEST_EMAIL_DOMAIN,
): Promise<string> {
  const email = `e2e-vinculo-${randomUUID()}@${domain}`;
  await seedPerson({ email, displayName, status });
  return email;
}

/** El dominio de un externo: fuera de `TEST_EMAIL_DOMAIN`, como en `invitations.spec.ts`. */
const EXTERNAL_DOMAIN = "externo-e2e.test";

/** La vinculación de una persona, que el recorrido acaba de dejar: sin ella, se corta. */
async function requestedLinkOf(email: string): Promise<AccountLink> {
  const link = await accountLinkOf(email);
  if (link === null) {
    throw new Error(`${email} no tiene una vinculación pedida.`);
  }
  return link;
}

test("el owner reactiva a una persona sin cuenta, que confirma y le pide la vinculación", async ({
  browser,
}) => {
  const name = `Valentina ${uniqueSuffix()}`;
  const person = await seedLinkPerson(name, "inactive");

  // D-E2b-4: en «Inactivas», la fila sin cuenta tiene la nota de D-E2-7 y el
  // menú con «Reactivar» y «Liberar el correo», en ese orden (§5.3).
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL, TEAM_PATH);
  await chooseStatusFilter(ownerPage, "Inactivas");
  const row = memberRow(ownerPage, name);
  await expect(inactiveMark(row)).toBeVisible();
  await expect(noAccountNote(row)).toBeVisible();
  await expectRowActions(ownerPage, name, [REACTIVATE, RELEASE_EMAIL]);

  // D-E2b-5: reactivar sin cuenta confirma, con el correo, el nombre y los
  // días; un correo del dominio no suma el párrafo del externo (D-E2b-8).
  // «Cancelar» cierra sin mandar nada.
  const sent = recordActions(ownerPage);
  await menuItem(ownerPage, REACTIVATE).click();
  const dialog = reactivateDialog(ownerPage, name);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(linkFirstWarning(person, name), { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(externalLinkWarning(person, name), { exact: true }),
  ).toHaveCount(0);
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();
  expect(sent).toHaveLength(0);
  expect(await membershipStatusOf(person)).toBe("inactive");

  // Confirmar cierra el diálogo y manda un pedido.
  await chooseRowAction(ownerPage, name, REACTIVATE);
  await dialogButton(dialog, REACTIVATE).click();
  await expect(dialog).toBeHidden();

  // §5.5: el aviso con el nombre; la fila se queda en «Inactivas» (EQ-11), sin
  // tachar, con la nota de la vinculación en lugar de la de D-E2-7, y el foco
  // en su menú.
  await expect(teamFeedback(ownerPage)).toContainText(reactivatedWithLinkMessage(name));
  await expect(inactiveMark(row)).toHaveCount(0);
  expect(await isNameStruck(row, name)).toBe(false);
  await expect(rowActionsButton(ownerPage, name)).toBeFocused();
  expect(sent).toHaveLength(1);

  // En la base, activa y con la marca vigente pedida por el owner.
  expect(await membershipStatusOf(person)).toBe("active");
  const link = await requestedLinkOf(person);
  expect(link).toMatchObject({ valid: true, requestedBy: OWNER_EMAIL });
  const dates = linkNoteDates(link, PERSON_TIMEZONE);
  await expect(
    rowNote(row, linkPendingFirstNote(dates.requested, dates.expires)),
  ).toBeVisible();
  await expect(noAccountNote(row)).toHaveCount(0);

  // §4.6: con una marca vigente, el menú ofrece cancelarla y no pedirla.
  await expectRowActions(ownerPage, name, [DEACTIVATE, CANCEL_LINK]);
  await closeMenu(ownerPage);

  await ownerPage.context().close();
});

test("un admin pide otra cuenta de Google para un member con cuenta y la cancela sin confirmar", async ({
  page,
  email,
}) => {
  const name = `Benjamín ${uniqueSuffix()}`;
  const person = await seedLinkPerson(name);
  await seedGoogleAccount(person);
  await enterTeamAsAdmin(page, email);
  const row = memberRow(page, name);

  // §5.3: con cuenta, «Vincular otra cuenta de Google», después de «Desactivar».
  await expectRowActions(page, name, [DEACTIVATE, REQUEST_OTHER_LINK]);

  // §5.4: confirma con el texto del reemplazo.
  const sent = recordActions(page);
  await menuItem(page, REQUEST_OTHER_LINK).click();
  const dialog = requestOtherLinkDialog(page, name);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(linkReplaceWarning(person, name), { exact: true }),
  ).toBeVisible();
  await expect(dialogButton(dialog, "Cancelar")).toBeVisible();
  await dialogButton(dialog, LINK_CONFIRM).click();
  await expect(dialog).toBeHidden();

  await expect(teamFeedback(page)).toContainText(linkRequestedMessage(name));
  await expect(rowActionsButton(page, name)).toBeFocused();
  expect(sent).toHaveLength(1);

  // D-E2b-6: la marca vigente, pedida por el admin; la nota del reemplazo.
  const link = await requestedLinkOf(person);
  expect(link).toMatchObject({ valid: true, requestedBy: email });
  const dates = linkNoteDates(link, PERSON_TIMEZONE);
  await expect(
    rowNote(row, linkPendingReplaceNote(dates.requested, dates.expires)),
  ).toBeVisible();

  // §5.4: cancelar no confirma; limpia la marca y la nota.
  await expectRowActions(page, name, [DEACTIVATE, CANCEL_LINK]);
  await menuItem(page, CANCEL_LINK).click();
  await expect(teamFeedback(page)).toContainText(linkCancelledMessage(name));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(anyLinkNote(row)).toHaveCount(0);
  await expect(rowActionsButton(page, name)).toBeFocused();
  expect(sent).toHaveLength(2);
  expect(await accountLinkOf(person)).toBeNull();

  // Sin marca, el menú vuelve a ofrecer pedirla.
  await expectRowActions(page, name, [DEACTIVATE, REQUEST_OTHER_LINK]);
  await closeMenu(page);
});

test("una vinculación vencida se ve en la fila y volver a pedirla la deja vigente", async ({
  page,
  email,
}) => {
  const name = `Camila ${uniqueSuffix()}`;
  const person = await seedLinkPerson(name);
  await seedExpiredAccountLink(person);
  const expired = await requestedLinkOf(person);
  expect(expired.valid).toBe(false);
  await enterTeamAsAdmin(page, email);
  const row = memberRow(page, name);

  // D-E2b-11, §5.2: la fila dice cuándo se pidió y cuándo venció.
  const old = linkNoteDates(expired, PERSON_TIMEZONE);
  await expect(rowNote(row, linkExpiredNote(old.requested, old.expires))).toBeVisible();

  // §4.6: vencida, el menú ofrece volver a pedirla y cancelarla.
  await expectRowActions(page, name, [DEACTIVATE, RENEW_LINK, CANCEL_LINK]);

  // §5.4: sin cuenta, la confirmación es la de la primera cuenta.
  await menuItem(page, RENEW_LINK).click();
  const dialog = requestLinkDialog(page, name);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(linkFirstWarning(person, name), { exact: true }),
  ).toBeVisible();
  await dialogButton(dialog, LINK_CONFIRM).click();
  await expect(dialog).toBeHidden();
  await expect(teamFeedback(page)).toContainText(linkRequestedMessage(name));

  // D-E2b-6: renovarla es una fecha nueva, vigente, pedida por el admin.
  const renewed = await requestedLinkOf(person);
  expect(renewed).toMatchObject({ valid: true, requestedBy: email });
  expect(renewed.requestedAt.getTime()).toBeGreaterThan(expired.requestedAt.getTime());
  const fresh = linkNoteDates(renewed, PERSON_TIMEZONE);
  await expect(
    rowNote(row, linkPendingFirstNote(fresh.requested, fresh.expires)),
  ).toBeVisible();
  await expect(rowNote(row, linkExpiredNote(old.requested, old.expires))).toHaveCount(0);
  await expectRowActions(page, name, [DEACTIVATE, CANCEL_LINK]);
  await closeMenu(page);
});

test("un admin libera el correo de un member inactivo con cuenta, y el correo se puede invitar", async ({
  page,
  email,
}) => {
  const name = `Lucía ${uniqueSuffix()}`;
  const person = await seedLinkPerson(name, "inactive");
  await seedGoogleAccount(person);
  const userId = await userIdOf(person);
  await enterTeamAsAdmin(page, email);
  await chooseStatusFilter(page, "Inactivas");
  const row = memberRow(page, name);

  // D-E2b-4: un admin libera el correo de un member inactivo.
  await expectRowActions(page, name, [REACTIVATE, RELEASE_EMAIL]);

  // §5.4: liberar confirma. «Cancelar» cierra sin mandar nada.
  const sent = recordActions(page);
  await menuItem(page, RELEASE_EMAIL).click();
  const dialog = releaseEmailDialog(page, name);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(releaseEmailWarning(person, name), { exact: true }),
  ).toBeVisible();
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();
  expect(sent).toHaveLength(0);

  await chooseRowAction(page, name, RELEASE_EMAIL);
  await dialogButton(dialog, RELEASE_EMAIL).click();
  await expect(dialog).toBeHidden();

  // §5.2, §5.5: «Correo liberado» en lugar del correo, sin nota, tachada, sin
  // menú (ni reactivar ni vincular, EQ-121), y el foco en su encabezado.
  await expect(teamFeedback(page)).toContainText(emailReleasedMessage(name));
  await expect(releasedEmailNote(row)).toBeVisible();
  await expect(memberHeader(row)).not.toContainText(person);
  await expect(noAccountNote(row)).toHaveCount(0);
  await expect(inactiveMark(row)).toBeVisible();
  expect(await isNameStruck(row, name)).toBe(true);
  await expect(rowButtons(row)).toHaveCount(0);
  await expect(memberHeader(row)).toBeFocused();
  expect(sent).toHaveLength(1);

  // D-E2b-9: en la base, el correo liberado y ninguna cuenta.
  const released = await userEmailOfMember(name);
  expect(released).toMatch(/@liberado\.invalid$/);
  expect(released).toBe(`${userId}@liberado.invalid`);
  expect(await accountCountOf(userId)).toBe(0);
  expect(await membershipStatusOf(person)).toBeNull();

  // La dirección queda libre: invitarla desde la misma pantalla responde
  // «Invitada», como un correo nuevo. Las invitadas se ven en «Activas».
  await chooseStatusFilter(page, "Activas");
  await inviteOne(page, person);
  expect(await invitationStatusOf(person)).toBe("pending");

  // La fila liberada sigue, con su nombre.
  await chooseStatusFilter(page, "Inactivas");
  await expect(releasedEmailNote(row)).toBeVisible();
  await expect(rowButtons(row)).toHaveCount(0);
});

test("pedir la vinculación de un externo sin invitación avisa que lo registra, y lo registra", async ({
  page,
  email,
}) => {
  const name = `Elisa ${uniqueSuffix()}`;
  const person = await seedLinkPerson(name, "active", EXTERNAL_DOMAIN);
  expect(await invitationStatusOf(person)).toBeNull();
  await enterTeamAsAdmin(page, email);

  // §5.4, D-E2b-8: sin cuenta, la confirmación de la primera cuenta suma el
  // párrafo del externo.
  await chooseRowAction(page, name, REQUEST_LINK);
  const dialog = requestLinkDialog(page, name);
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(linkFirstWarning(person, name), { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText(externalLinkWarning(person, name), { exact: true }),
  ).toBeVisible();
  await dialogButton(dialog, LINK_CONFIRM).click();
  await expect(dialog).toBeHidden();
  await expect(teamFeedback(page)).toContainText(linkRequestedMessage(name));

  // En la base, la marca y la invitación `accepted` que la regla de ingreso
  // le pide a un externo.
  expect(await accountLinkOf(person)).toMatchObject({ valid: true, requestedBy: email });
  expect(await invitationStatusOf(person)).toBe("accepted");

  // Cancelarla no deshace el registro.
  await chooseRowAction(page, name, CANCEL_LINK);
  await expect(teamFeedback(page)).toContainText(linkCancelledMessage(name));
  expect(await accountLinkOf(person)).toBeNull();
  expect(await invitationStatusOf(person)).toBe("accepted");
});

test("un admin no tiene menú en la fila de otra admin, activa o inactiva sin cuenta, la del owner ni la propia; el owner sí, y en la suya vincula otra cuenta", async ({
  browser,
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const self = `Úrsula ${suffix}`;
  const activeAdmin = `Alma ${suffix}`;
  const inactiveAdmin = `Inés ${suffix}`;
  const inactiveMember = `Martín ${suffix}`;
  await setRole(await seedLinkPerson(activeAdmin), "admin");
  await setRole(await seedLinkPerson(inactiveAdmin, "inactive"), "admin");
  await seedLinkPerson(inactiveMember, "inactive");
  await enterTeamAsAdmin(page, email);
  await setDisplayName(email, self);
  await page.goto(`${TEAM_PATH}?estado=todas`);

  // D-E2b-4: en la fila de un member inactivo sin cuenta, el admin reactiva y
  // libera.
  await expectRowActions(page, inactiveMember, [REACTIVATE, RELEASE_EMAIL]);
  await closeMenu(page);

  // P-07: ningún botón en la fila de otra admin, activa o inactiva sin cuenta,
  // en la del owner ni en la propia.
  await expect(memberRow(page, activeAdmin)).toBeVisible();
  await expect(rowButtons(memberRow(page, activeAdmin))).toHaveCount(0);
  const inactiveAdminRow = memberRow(page, inactiveAdmin);
  await expect(inactiveMark(inactiveAdminRow)).toBeVisible();
  await expect(noAccountNote(inactiveAdminRow)).toBeVisible();
  await expect(rowButtons(inactiveAdminRow)).toHaveCount(0);
  await expect(ownerRow(page)).toHaveCount(1);
  await expect(rowButtons(ownerRow(page))).toHaveCount(0);
  const selfRow = memberRow(page, self);
  await expect(selfRow).toContainText(SELF_MARK);
  await expect(rowButtons(selfRow)).toHaveCount(0);

  // El owner tiene el menú de las dos admins y, en su propia fila, con
  // cuenta, solo «Vincular otra cuenta de Google» (§5.3).
  await ensureOwnerGoogleAccount();
  const ownerPage = await openSecondTab(
    browser,
    OWNER_EMAIL,
    `${TEAM_PATH}?estado=todas`,
  );
  await expectRowActions(ownerPage, activeAdmin, [DEACTIVATE, REQUEST_LINK]);
  await closeMenu(ownerPage);
  await expectRowActions(ownerPage, inactiveAdmin, [REACTIVATE, RELEASE_EMAIL]);
  await closeMenu(ownerPage);
  const own = ownerRow(ownerPage);
  await expect(own).toContainText(SELF_MARK);
  await rowMenuButton(own).click();
  await expect(menuItems(ownerPage)).toHaveText([REQUEST_OTHER_LINK]);
  await closeMenu(ownerPage);

  await ownerPage.context().close();
});

test("/login con account_not_linked explica que el correo ya está en uso, sin mostrar el código", async ({
  browser,
}) => {
  // Sin sesión: con una, `/login` lleva a `/`.
  const guest = await guestPage(browser);
  await guest.goto("/login?error=account_not_linked");
  await expect(loginNotice(guest)).toHaveText(ACCOUNT_NOT_LINKED);
  await expect(guest.getByText("account_not_linked")).toHaveCount(0);
  await expect(googleButton(guest)).toBeVisible();

  // D-E2b-3: `vinculacion_fallida` no es un motivo: el genérico.
  await guest.goto("/login?error=vinculacion_fallida");
  await expect(loginNotice(guest)).toHaveText(LOGIN_FAILED);
  await expect(guest.getByText("vinculacion_fallida")).toHaveCount(0);
  await guest.context().close();
});
