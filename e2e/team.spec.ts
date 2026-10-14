import { randomUUID } from "node:crypto";

import type { Page } from "@playwright/test";

import { seedPerson, setDisplayName, setRole } from "./database";
import { holdActionResponses, openSecondTab, recordActions } from "./network";
import {
  goToReportsByNav,
  REPORTS_PATH,
  reportsNavLink,
  SCOPE_EVERYONE,
  SCOPE_SELF,
} from "./reports-page";
import { expect, TEST_EMAIL_DOMAIN, test } from "./session";
import {
  ADMIN_ROLE,
  changedMessage,
  DEMOTE,
  FORBIDDEN_ROLE,
  isTeamPage,
  MEMBER_ROLE,
  memberHeader,
  memberRow,
  OWNER_EMAIL,
  PROMOTE,
  roleButton,
  roleCell,
  rowButtons,
  SELF_MARK,
  TEAM_PATH,
  teamFeedback,
  teamHeading,
  teamNavLink,
  teamTable,
} from "./team-page";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * D-R8-11: el workspace es común, así que cada recorrido usa su propia persona
 * (U, la de la sesión, con el rol que le da `setRole`) y siembra a las
 * personas cuyo rol cambia (P, Q) con un nombre único. Ninguna afirmación es
 * sobre la lista entera, que en una corrida tiene cientos de filas. La
 * membresía del owner de la suite no se toca: el recorrido del owner entra con
 * su cuenta, en un contexto propio, y cambia la fila de U.
 */

/**
 * Entra a una pantalla, que es lo que le crea la membresía a la persona de la
 * sesión: sin ella no se le puede cambiar el rol ni el nombre.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
}

/**
 * U entra con `role` y un nombre único. La navegación es del layout (D-R8-8):
 * después de `setRole`, la carga completa de `/` la dibuja con el rol nuevo.
 */
async function enterAs(
  page: Page,
  email: string,
  role: "admin" | "member",
  name: string,
): Promise<void> {
  await enterApp(page);
  await setRole(email, role);
  await setDisplayName(email, name);
  await enterApp(page);
  await expect(reportsNavLink(page)).toBeVisible();
}

/** Otra persona del workspace, `member` y activa, con un email del dominio. */
async function seedOtherPerson(displayName: string): Promise<string> {
  const email = `e2e-equipo-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
  await seedPerson({ email, displayName });
  return email;
}

/** Entra a «Equipo» por la navegación, sin recargar, y espera la tabla. */
async function goToTeamByNav(page: Page): Promise<void> {
  await teamNavLink(page).click();
  await expect(page).toHaveURL((url) => url.pathname === TEAM_PATH);
  await expect(teamTable(page)).toBeVisible();
}

/** D-R8-2: el título y el aviso sin permiso, sin tabla. */
async function expectForbidden(page: Page): Promise<void> {
  await expect(teamHeading(page)).toBeVisible();
  await expect(page.getByText(FORBIDDEN_ROLE, { exact: true })).toBeVisible();
  await expect(teamTable(page)).toHaveCount(0);
}

test("un admin asciende a otra persona, no puede bajarla, y la sesión abierta de esa persona sigue el rol", async ({
  page,
  email,
  browser,
}) => {
  const suffix = uniqueSuffix();
  const self = `Ulises ${suffix}`;
  const other = `Paula ${suffix}`;
  const third = `Quique ${suffix}`;
  const otherEmail = await seedOtherPerson(other);
  await seedOtherPerson(third);
  await enterAs(page, email, "admin", self);

  // D-R8-2: P, member, ve solo sus horas y no tiene «Equipo».
  const otherPage = await openSecondTab(browser, otherEmail, REPORTS_PATH);
  await expect(otherPage.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(reportsNavLink(otherPage)).toBeVisible();
  await expect(teamNavLink(otherPage)).toHaveCount(0);

  // D-R8-3, D-R8-5: U, admin, entra por la navegación. Su fila no tiene
  // botón; la de P, «Miembro», tiene el de ascenderla.
  await goToTeamByNav(page);
  await expect(teamNavLink(page)).toHaveAttribute("aria-current", "page");
  const selfRow = memberRow(page, self);
  await expect(memberHeader(selfRow)).toContainText(SELF_MARK);
  await expect(roleCell(selfRow)).toHaveText(ADMIN_ROLE);
  await expect(rowButtons(selfRow)).toHaveCount(0);
  const row = memberRow(page, other);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(memberHeader(row)).toContainText(otherEmail);
  const promote = roleButton(page, PROMOTE, other);
  await expect(promote).toBeVisible();

  // §5.4: con el pedido en curso los botones de la tabla, también el de Q,
  // quedan inactivos sin perder el texto, y un segundo clic no manda nada.
  const sent = recordActions(page);
  const release = await holdActionResponses(page, isTeamPage);
  await promote.click();
  await expect(promote).toHaveAttribute("aria-disabled", "true");
  await expect(roleButton(page, PROMOTE, third)).toHaveAttribute("aria-disabled", "true");
  await promote.click({ force: true });
  release();

  // D-R8-5: un admin no quita el rol de admin, así que la fila se queda sin
  // botón y el foco pasa a su encabezado de fila (§5.4).
  await expect(teamFeedback(page)).toContainText(changedMessage(other, ADMIN_ROLE));
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  await expect(rowButtons(row)).toHaveCount(0);
  await expect(roleButton(page, DEMOTE, other)).toHaveCount(0);
  await expect(memberHeader(row)).toBeFocused();
  expect(sent).toHaveLength(1);

  await page.reload();
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  await expect(rowButtons(row)).toHaveCount(0);

  // D-R8-8: al recargar, P decide con el rol nuevo. Como admin, tampoco tiene
  // botón en su fila ni en la de U.
  await otherPage.reload();
  await expect(otherPage.getByText(SCOPE_EVERYONE, { exact: true })).toBeVisible();
  await expect(teamNavLink(otherPage)).toBeVisible();
  await otherPage.goto(TEAM_PATH);
  await expect(teamTable(otherPage)).toBeVisible();
  const ownRow = memberRow(otherPage, other);
  await expect(memberHeader(ownRow)).toContainText(SELF_MARK);
  await expect(rowButtons(ownRow)).toHaveCount(0);
  await expect(rowButtons(memberRow(otherPage, self))).toHaveCount(0);
  await otherPage.context().close();
});

test("el owner baja a un admin, y la sesión abierta del admin sigue el rol", async ({
  page,
  email,
  browser,
}) => {
  const self = `Úrsula ${uniqueSuffix()}`;
  await enterAs(page, email, "admin", self);
  await goToTeamByNav(page);

  // D-R8-5: solo el owner quita el rol de admin. Entra con su cuenta y cambia
  // la fila de U, nunca la suya (D-R8-11).
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL, TEAM_PATH);
  const row = memberRow(ownerPage, self);
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  const demote = roleButton(ownerPage, DEMOTE, self);
  await expect(demote).toBeVisible();

  // §5.4: la fila sigue con botón, que cambia el texto y conserva el foco.
  const sent = recordActions(ownerPage);
  await demote.click();
  await expect(teamFeedback(ownerPage)).toContainText(changedMessage(self, MEMBER_ROLE));
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(roleButton(ownerPage, PROMOTE, self)).toBeFocused();
  await expect(demote).toHaveCount(0);
  expect(sent).toHaveLength(1);
  await ownerPage.context().close();

  // D-R8-8: U, sin recargar, navega al reporte, que lee el rol en el pedido.
  await goToReportsByNav(page);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(page.getByText(SCOPE_EVERYONE, { exact: true })).toHaveCount(0);
  await page.goto(TEAM_PATH);
  await expectForbidden(page);
  await page.reload();
  await expect(reportsNavLink(page)).toBeVisible();
  await expect(teamNavLink(page)).toHaveCount(0);
});

test("un member no ve el equipo", async ({ page, email }) => {
  await enterAs(page, email, "member", `Uriel ${uniqueSuffix()}`);

  // D-R8-2: sin la entrada y, por la URL, la vista sin permiso.
  await expect(teamNavLink(page)).toHaveCount(0);
  await page.goto(TEAM_PATH);
  await expectForbidden(page);
});
