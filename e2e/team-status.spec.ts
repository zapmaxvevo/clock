import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import {
  entryEndedAt,
  inviteForSignIn,
  membershipStatusOf,
  runningEntryOf,
  seedGoogleAccount,
  seedPerson,
  seedRunningEntry,
  sessionCountOf,
  setDisplayName,
  setRole,
} from "./database";
import { OWNER_EMAIL } from "./environment";
import { googleButton, loginNotice, MEMBERSHIP_INACTIVE } from "./login-page";
import {
  dropActionRequests,
  holdActionResponses,
  openSecondTab,
  recordActions,
} from "./network";
import {
  expect,
  guestPage,
  signIn,
  signInRejected,
  TEST_EMAIL_DOMAIN,
  test,
} from "./session";
import {
  ADMIN_ROLE,
  ADMIN_STATUS_OWNER_ONLY,
  chooseRowAction,
  chooseStatusFilter,
  closeMenu,
  DEACTIVATE,
  DEACTIVATE_WARNING,
  deactivateDialog,
  deactivatedMessage,
  deactivateFailedTitle,
  DEMOTE,
  dialogButton,
  domainEmail,
  enterTeamAsAdmin,
  expectRowActions,
  inactiveMark,
  invitationRow,
  isNameStruck,
  isTeamFilterUrl,
  isTeamPage,
  MEMBER_ROLE,
  memberRow,
  menuItem,
  noAccountNote,
  ownerRow,
  PROMOTE,
  REACTIVATE,
  reactivatedMessage,
  RELEASE_EMAIL,
  RETRY,
  roleButton,
  roleCell,
  rowActionsButton,
  rowButtons,
  SELF_MARK,
  STATUS_FILTERS,
  statusFilter,
  statusFilterOption,
  TEAM_PATH,
  teamFeedback,
  UNEXPECTED_BODY,
  teamTable,
} from "./team-page";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * E2, §9.3: como en R8, E1a y E1b, el workspace es común, así que cada
 * recorrido siembra a las personas cuyo estado cambia, con un nombre y un
 * correo únicos, y nunca afirma sobre la tabla entera ni sobre un vacío. La
 * membresía del owner de la suite no se toca: desactiva y reactiva con su
 * cuenta, en un contexto propio, filas de personas del recorrido. Quien actúa
 * como admin es la persona de la sesión, con el rol que le da `setRole`.
 */

/** Otra persona del workspace, `member`, con un correo del dominio. */
async function seedOtherPerson(
  displayName: string,
  status: "active" | "inactive" = "active",
): Promise<string> {
  const email = `e2e-estado-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  await seedPerson({ email, displayName, status });
  return email;
}

/** El botón que arranca o detiene el timer de la barra del rastreador. */
function timerButton(page: Page, name: "Iniciar" | "Detener"): Locator {
  return trackerBar(page).getByRole("button", { name, exact: true });
}

test("el owner desactiva a una persona con un timer en curso y la deja afuera en el acto", async ({
  browser,
}) => {
  const suffix = uniqueSuffix();
  const name = `Delia ${suffix}`;
  const description = `Timer de Delia ${suffix}`;
  const person = domainEmail("desactivar");

  // P entra, que es lo que le crea la membresía, y tiene su cuenta de Google:
  // sin ella la fila inactiva tendría la nota de D-E2-7, y reactivarla
  // pediría la vinculación (D-E2b-5 de E2b).
  const personPage = await openSecondTab(browser, person);
  await expect(trackerBar(personPage)).toBeVisible();
  await setDisplayName(person, name);
  await seedGoogleAccount(person);
  const entryId = await seedRunningEntry(person, description);
  await personPage.reload();
  await expect(timerButton(personPage, "Detener")).toBeVisible();
  expect(await sessionCountOf(person)).toBe(1);

  // EQ-03: el owner ve el menú de la fila de P, que ofrece «Desactivar» y no
  // «Reactivar»; con cuenta, también «Vincular otra cuenta de Google» (§5.3 de
  // E2b).
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL, TEAM_PATH);
  await expect(statusFilter(ownerPage)).toContainText("Activas");
  const row = memberRow(ownerPage, name);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(inactiveMark(row)).toHaveCount(0);
  expect(await isNameStruck(row, name)).toBe(false);
  const menu = rowActionsButton(ownerPage, name);
  await menu.click();
  await expect(menuItem(ownerPage, DEACTIVATE)).toBeVisible();
  await expect(menuItem(ownerPage, REACTIVATE)).toHaveCount(0);

  // EQ-46: desactivar confirma. «Cancelar» cierra sin mandar nada.
  const sent = recordActions(ownerPage);
  await menuItem(ownerPage, DEACTIVATE).click();
  const dialog = deactivateDialog(ownerPage, name);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(DEACTIVATE_WARNING, { exact: true })).toBeVisible();
  await expect(dialogButton(dialog, "Cancelar")).toBeVisible();
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();
  expect(sent).toHaveLength(0);
  expect(await membershipStatusOf(person)).toBe("active");

  // Confirmar cierra el diálogo y manda el pedido.
  await chooseRowAction(ownerPage, name, DEACTIVATE);
  await dialogButton(dialog, DEACTIVATE).click();
  await expect(dialog).toBeHidden();

  // EQ-11, §5.4: la fila se queda en «Activas», tachada, con «(inactiva)», el
  // mismo rol sin botón (EQ-37), el aviso con el nombre y el foco en su menú,
  // que ahora ofrece «Reactivar» y no «Desactivar»; también «Liberar el
  // correo» (§5.3 de E2b).
  await expect(teamFeedback(ownerPage)).toContainText(deactivatedMessage(name));
  await expect(inactiveMark(row)).toBeVisible();
  expect(await isNameStruck(row, name)).toBe(true);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(roleButton(ownerPage, PROMOTE, name)).toHaveCount(0);
  await expect(rowButtons(row)).toHaveCount(1);
  await expect(menu).toBeFocused();
  await menu.click();
  await expect(menuItem(ownerPage, REACTIVATE)).toBeVisible();
  await expect(menuItem(ownerPage, DEACTIVATE)).toHaveCount(0);
  await ownerPage.keyboard.press("Escape");
  await expect(menuItem(ownerPage, REACTIVATE)).toBeHidden();
  expect(sent).toHaveLength(1);

  // D-E2-5: en la base, la membresía inactiva, el timer cerrado (la misma
  // fila, con su fin) y ninguna sesión.
  expect(await membershipStatusOf(person)).toBe("inactive");
  expect(await runningEntryOf(person)).toBeNull();
  expect(await entryEndedAt(entryId)).not.toBeNull();
  expect(await sessionCountOf(person)).toBe(0);

  // EQ-41: la página de P, al recargar, no tiene sesión y va a `/login`; una
  // sesión nueva se rechaza (EQ-92).
  await personPage.reload();
  await expect(personPage).toHaveURL(/\/login$/);
  await expect(googleButton(personPage)).toBeVisible();
  await signInRejected(personPage.context(), person);
  expect(await sessionCountOf(person)).toBe(0);

  // EQ-11, §5.2: cambiar el filtro, sin recargar, olvida la fila que se
  // quedaba y el aviso. P está en «Inactivas», con cuenta: sin la nota y con
  // el menú; de vuelta en «Activas», ya no está.
  await chooseStatusFilter(ownerPage, "Inactivas");
  await expect(inactiveMark(row)).toBeVisible();
  expect(await isNameStruck(row, name)).toBe(true);
  await expect(noAccountNote(row)).toHaveCount(0);
  await expect(menu).toBeVisible();
  await expect(
    ownerPage.getByText(deactivatedMessage(name), { exact: true }),
  ).toHaveCount(0);
  await chooseStatusFilter(ownerPage, "Activas");
  await expect(teamTable(ownerPage)).toBeVisible();
  await expect(row).toHaveCount(0);

  // Al recargar, tampoco.
  await ownerPage.reload();
  await expect(teamTable(ownerPage)).toBeVisible();
  await expect(row).toHaveCount(0);

  await personPage.context().close();
  await ownerPage.context().close();
});

test("el owner reactiva a una admin inactiva sin confirmar, y vuelve a entrar con su rol y sin timer", async ({
  browser,
}) => {
  const name = `Renata ${uniqueSuffix()}`;
  const person = await seedOtherPerson(name, "inactive");
  await setRole(person, "admin");
  await seedGoogleAccount(person);

  // EQ-92: inactiva, no entra.
  const guest = await guestPage(browser);
  await signInRejected(guest.context(), person);

  // P-07: solo el owner reactiva a una admin. En «Inactivas», la fila tachada
  // muestra el rol sin botón (EQ-37) y el menú con «Reactivar».
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL, TEAM_PATH);
  await chooseStatusFilter(ownerPage, "Inactivas");
  const row = memberRow(ownerPage, name);
  await expect(inactiveMark(row)).toBeVisible();
  expect(await isNameStruck(row, name)).toBe(true);
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  await expect(roleButton(ownerPage, DEMOTE, name)).toHaveCount(0);

  // EQ-47: reactivar no confirma.
  const sent = recordActions(ownerPage);
  await chooseRowAction(ownerPage, name, REACTIVATE);
  await expect(teamFeedback(ownerPage)).toContainText(reactivatedMessage(name));
  await expect(ownerPage.getByRole("dialog")).toHaveCount(0);
  expect(sent).toHaveLength(1);

  // EQ-11: la fila se queda en «Inactivas», sin tachar, con el mismo rol y,
  // activa, el botón de R8; el foco va a su menú (§5.4).
  await expect(inactiveMark(row)).toHaveCount(0);
  expect(await isNameStruck(row, name)).toBe(false);
  await expect(roleCell(row)).toContainText(ADMIN_ROLE);
  await expect(roleButton(ownerPage, DEMOTE, name)).toBeVisible();
  const menu = rowActionsButton(ownerPage, name);
  await expect(menu).toBeFocused();
  expect(await membershipStatusOf(person)).toBe("active");

  // EQ-43: vuelve a entrar al rastreador, sin ningún timer corriendo.
  await signIn(guest.context(), person);
  await guest.goto("/");
  await expect(trackerBar(guest)).toBeVisible();
  await expect(timerButton(guest, "Iniciar")).toBeVisible();
  expect(await runningEntryOf(person)).toBeNull();

  await guest.context().close();
  await ownerPage.context().close();
});

test("el filtro de estado vive en la URL", async ({ page, email }) => {
  const suffix = uniqueSuffix();
  const active = `Abril ${suffix}`;
  const inactive = `Ignacio ${suffix}`;
  await seedOtherPerson(active);
  await seedOtherPerson(inactive, "inactive");
  const invited = domainEmail("filtro");
  await inviteForSignIn(invited);
  await enterTeamAsAdmin(page, email);

  const activeRow = memberRow(page, active);
  const inactiveRow = memberRow(page, inactive);
  const invitedRow = invitationRow(page, invited);

  // EQ-06: sin parámetro, «Activas», con las invitadas.
  await expect(statusFilter(page)).toContainText("Activas");
  await expect(activeRow).toBeVisible();
  await expect(invitedRow).toBeVisible();
  await expect(inactiveRow).toHaveCount(0);

  // §5.2: las cuatro opciones, en su orden.
  await statusFilter(page).click();
  await expect(page.getByRole("option")).toHaveText(Object.keys(STATUS_FILTERS));
  await statusFilterOption(page, "Inactivas").click();
  await expect(page).toHaveURL(isTeamFilterUrl("Inactivas"));
  // §5.2: la página nueva no le quita el foco al selector.
  await expect(statusFilter(page)).toBeFocused();

  // EQ-05, D-E2-7: la inactiva sin cuenta, tachada y con la nota; ni la
  // activa ni la invitada.
  await expect(inactiveMark(inactiveRow)).toBeVisible();
  expect(await isNameStruck(inactiveRow, inactive)).toBe(true);
  await expect(noAccountNote(inactiveRow)).toBeVisible();
  await expect(activeRow).toHaveCount(0);
  await expect(invitedRow).toHaveCount(0);

  // D-E2b-4: es un member, así que el admin que mira ve su menú, con
  // «Reactivar» y «Liberar el correo». Hasta E2 no tenía menú (D-E2-7).
  await expectRowActions(page, inactive, [REACTIVATE, RELEASE_EMAIL]);
  await closeMenu(page);

  // EQ-100: recargar conserva el filtro.
  await page.reload();
  await expect(page).toHaveURL(isTeamFilterUrl("Inactivas"));
  await expect(statusFilter(page)).toContainText("Inactivas");
  await expect(inactiveMark(inactiveRow)).toBeVisible();

  await chooseStatusFilter(page, "Invitadas");
  await expect(statusFilter(page)).toBeFocused();
  await expect(invitedRow).toBeVisible();
  await expect(activeRow).toHaveCount(0);
  await expect(inactiveRow).toHaveCount(0);

  await chooseStatusFilter(page, "Todas");
  await expect(statusFilter(page)).toBeFocused();
  await expect(activeRow).toBeVisible();
  await expect(inactiveMark(inactiveRow)).toBeVisible();
  await expect(invitedRow).toBeVisible();

  await chooseStatusFilter(page, "Activas");
  await expect(statusFilter(page)).toBeFocused();
  await expect(activeRow).toBeVisible();
  await expect(inactiveRow).toHaveCount(0);

  // EQ-100: un valor inválido o repetido se ignora y queda «Activas».
  for (const search of ["?estado=otro", "?estado=inactivas&estado=todas"]) {
    await page.goto(`${TEAM_PATH}${search}`);
    await expect(statusFilter(page)).toContainText("Activas");
    await expect(activeRow).toBeVisible();
    await expect(inactiveRow).toHaveCount(0);
  }
});

test("un admin ve el menú de un member y no el de otra admin, el del owner ni el propio, y el servidor decide con el rol de la base", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const self = `Úrsula ${suffix}`;
  const member = `Mateo ${suffix}`;
  const admin = `Alma ${suffix}`;
  const memberEmail = await seedOtherPerson(member);
  const adminEmail = await seedOtherPerson(admin);
  await setRole(adminEmail, "admin");
  await enterTeamAsAdmin(page, email);
  await setDisplayName(email, self);
  await page.reload();

  // EQ-38: el menú de un member, con «Desactivar».
  await expect(rowActionsButton(page, member)).toBeVisible();

  // P-07, D-E2-9: sin menú en la fila de otra admin, en la del owner ni en la
  // propia; ninguna de las tres tiene tampoco el botón de rol.
  await expect(rowActionsButton(page, admin)).toHaveCount(0);
  await expect(rowButtons(memberRow(page, admin))).toHaveCount(0);
  await expect(ownerRow(page)).toHaveCount(1);
  await expect(rowButtons(ownerRow(page))).toHaveCount(0);
  const selfRow = memberRow(page, self);
  await expect(selfRow).toContainText(SELF_MARK);
  await expect(rowButtons(selfRow)).toHaveCount(0);

  // EQ-85: si el member pasa a admin con la confirmación abierta, el servidor
  // decide con el rol de la base y la tabla avisa con el nombre, sin
  // «Reintentar», que es solo de una falla de red.
  await chooseRowAction(page, member, DEACTIVATE);
  const dialog = deactivateDialog(page, member);
  await expect(dialog).toBeVisible();
  await setRole(memberEmail, "admin");
  await dialogButton(dialog, DEACTIVATE).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(deactivateFailedTitle(member));
  await expect(alert).toContainText(ADMIN_STATUS_OWNER_ONLY);
  await expect(alert.getByRole("button", { name: RETRY })).toHaveCount(0);
  expect(await membershipStatusOf(memberEmail)).toBe("active");

  // Al recargar, ya admin, su fila tampoco tiene menú.
  await page.reload();
  await expect(roleCell(memberRow(page, member))).toHaveText(ADMIN_ROLE);
  await expect(rowActionsButton(page, member)).toHaveCount(0);
});

test("con un cambio de estado en curso, la tabla no manda otro pedido", async ({
  page,
  email,
}) => {
  const suffix = uniqueSuffix();
  const first = `Fermín ${suffix}`;
  const second = `Sara ${suffix}`;
  const firstEmail = await seedOtherPerson(first);
  const secondEmail = await seedOtherPerson(second);
  // Con cuenta, la fila desactivada conserva el menú, con «Reactivar».
  await seedGoogleAccount(firstEmail);
  await enterTeamAsAdmin(page, email);

  // §5.4: con la respuesta retenida, el menú de la fila, el de otra y su botón
  // de rol quedan inactivos, y un segundo clic no manda nada.
  const sent = recordActions(page);
  const release = await holdActionResponses(page, isTeamPage);
  await chooseRowAction(page, first, DEACTIVATE);
  await dialogButton(deactivateDialog(page, first), DEACTIVATE).click();
  await expect(deactivateDialog(page, first)).toBeHidden();
  const firstMenu = rowActionsButton(page, first);
  await expect(firstMenu).toHaveAttribute("aria-disabled", "true");
  await expect(rowActionsButton(page, second)).toHaveAttribute("aria-disabled", "true");
  const promote = roleButton(page, PROMOTE, second);
  await expect(promote).toHaveAttribute("aria-disabled", "true");
  await promote.click({ force: true });
  release();

  await expect(teamFeedback(page)).toContainText(deactivatedMessage(first));
  const firstRow = memberRow(page, first);
  await expect(inactiveMark(firstRow)).toBeVisible();
  await expect(firstMenu).toBeFocused();
  await expect(firstMenu).not.toHaveAttribute("aria-disabled", "true");
  await expect(promote).not.toHaveAttribute("aria-disabled", "true");
  expect(sent).toHaveLength(1);
  expect(await membershipStatusOf(firstEmail)).toBe("inactive");
  expect(await membershipStatusOf(secondEmail)).toBe("active");
  await expect(roleCell(memberRow(page, second))).toContainText(MEMBER_ROLE);
});

test("«Reintentar» vuelve a mandar una desactivación que no llegó al servidor", async ({
  page,
  email,
}) => {
  const name = `Tobías ${uniqueSuffix()}`;
  const person = await seedOtherPerson(name);
  await enterTeamAsAdmin(page, email);

  // TT-89: el pedido se corta antes de salir, así que el servidor no escribe y
  // la tabla avisa con el nombre, el cuerpo de una falla de red y «Reintentar».
  const sent = recordActions(page);
  const restore = await dropActionRequests(page, isTeamPage);
  await chooseRowAction(page, name, DEACTIVATE);
  await dialogButton(deactivateDialog(page, name), DEACTIVATE).click();
  const alert = page.getByRole("main").getByRole("alert");
  await expect(alert).toContainText(deactivateFailedTitle(name));
  await expect(alert).toContainText(UNEXPECTED_BODY);
  expect(await membershipStatusOf(person)).toBe("active");
  await restore();

  // «Reintentar» manda el mismo cambio de estado, sin volver a confirmar.
  await alert.getByRole("button", { name: RETRY, exact: true }).click();
  await expect(teamFeedback(page)).toContainText(deactivatedMessage(name));
  await expect(inactiveMark(memberRow(page, name))).toBeVisible();
  await expect(deactivateDialog(page, name)).toHaveCount(0);
  expect(await membershipStatusOf(person)).toBe("inactive");
  expect(sent).toHaveLength(2);
});

test("/login con membresia_inactiva explica que el acceso está desactivado", async ({
  browser,
}) => {
  // Sin sesión: con una, `/login` lleva a `/`.
  const guest = await guestPage(browser);
  await guest.goto("/login?error=membresia_inactiva");
  await expect(loginNotice(guest)).toHaveText(MEMBERSHIP_INACTIVE);
  await expect(googleButton(guest)).toBeVisible();
  await guest.context().close();
});
