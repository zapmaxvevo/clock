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
  CANCEL,
  changedMessage,
  DEMOTE,
  FORBIDDEN_ROLE,
  isTeamPage,
  MEMBER_ROLE,
  memberHeader,
  memberRow,
  PROMOTE,
  roleButton,
  roleCell,
  SELF_DEMOTE_CONFIRM,
  SELF_MARK,
  selfDemoteDialog,
  TEAM_PATH,
  teamFeedback,
  teamHeading,
  teamNavLink,
  teamTable,
} from "./team-page";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * D-R8-11: el workspace es común, así que cada recorrido usa su propia persona
 * (U, la de la sesión, con el rol que le da `setRole`) y siembra a la persona
 * cuyo rol cambia (P) con un nombre único. Ninguna afirmación es sobre la
 * lista entera, que en una corrida tiene cientos de filas. El owner de la
 * suite no se toca.
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

test("un admin asciende y baja a otra persona, y la sesión abierta de esa persona sigue el rol", async ({
  page,
  email,
  browser,
}) => {
  const suffix = uniqueSuffix();
  const self = `Ulises ${suffix}`;
  const other = `Paula ${suffix}`;
  const otherEmail = await seedOtherPerson(other);
  await enterAs(page, email, "admin", self);

  // D-R8-2: P, member, ve solo sus horas y no tiene «Equipo».
  const otherPage = await openSecondTab(browser, otherEmail, REPORTS_PATH);
  await expect(otherPage.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(reportsNavLink(otherPage)).toBeVisible();
  await expect(teamNavLink(otherPage)).toHaveCount(0);

  // D-R8-3: U, admin, entra por la navegación y ve a P como «Miembro».
  await goToTeamByNav(page);
  await expect(teamNavLink(page)).toHaveAttribute("aria-current", "page");
  const row = memberRow(page, other);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(memberHeader(row)).toContainText(otherEmail);
  const promote = roleButton(page, PROMOTE, other);
  await expect(promote).toBeVisible();

  // §5.4: con el pedido en curso los botones de la tabla, también el de la
  // fila de U, quedan inactivos sin perder el texto, y un segundo clic no
  // manda nada. No se prueba con el de U: su fila abre la confirmación.
  const sent = recordActions(page);
  const release = await holdActionResponses(page, isTeamPage);
  await promote.click();
  await expect(promote).toHaveAttribute("aria-disabled", "true");
  await expect(roleButton(page, DEMOTE, self)).toHaveAttribute("aria-disabled", "true");
  await promote.click({ force: true });
  release();

  // El aviso, el rol y el botón cambian; el foco queda en el botón de la fila.
  await expect(teamFeedback(page)).toContainText(changedMessage(other, ADMIN_ROLE));
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  const demote = roleButton(page, DEMOTE, other);
  await expect(demote).toBeFocused();
  await expect(promote).toHaveCount(0);
  expect(sent).toHaveLength(1);

  await page.reload();
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  await expect(demote).toBeVisible();

  // D-R8-8: al recargar, P decide con el rol nuevo.
  await otherPage.reload();
  await expect(otherPage.getByText(SCOPE_EVERYONE, { exact: true })).toBeVisible();
  await expect(teamNavLink(otherPage)).toBeVisible();
  await otherPage.goto(TEAM_PATH);
  await expect(teamTable(otherPage)).toBeVisible();
  await expect(memberHeader(memberRow(otherPage, other))).toContainText(SELF_MARK);

  // U baja a P, que no es su fila: sin confirmación.
  await demote.click();
  await expect(teamFeedback(page)).toContainText(changedMessage(other, MEMBER_ROLE));
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(promote).toBeFocused();

  // D-R8-8: P, sin recargar, navega al reporte, que lee el rol en el pedido.
  await goToReportsByNav(otherPage);
  await expect(otherPage.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
  await expect(otherPage.getByText(SCOPE_EVERYONE, { exact: true })).toHaveCount(0);
  await otherPage.goto(TEAM_PATH);
  await expectForbidden(otherPage);
  await otherPage.context().close();
});

test("un admin se baja a sí mismo, con confirmación", async ({ page, email }) => {
  const self = `Úrsula ${uniqueSuffix()}`;
  await enterAs(page, email, "admin", self);
  await goToTeamByNav(page);

  const sent = recordActions(page);
  const row = memberRow(page, self);
  await expect(memberHeader(row)).toContainText(SELF_MARK);
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);

  // D-R8-5: la fila propia abre la confirmación y no manda nada.
  const demote = roleButton(page, DEMOTE, self);
  await demote.click();
  const dialog = selfDemoteDialog(page);
  await expect(dialog).toBeVisible();
  expect(sent).toHaveLength(0);

  // «Cancelar» cierra sin mandar y devuelve el foco al botón (§5.5).
  await dialog.getByRole("button", { name: CANCEL, exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(demote).toBeFocused();
  await expect(roleCell(row)).toHaveText(ADMIN_ROLE);
  expect(sent).toHaveLength(0);

  // D-R8-8: la action revalida el árbol entero, así que la pantalla y la
  // navegación cambian sin recargar.
  await demote.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: SELF_DEMOTE_CONFIRM, exact: true }).click();
  await expectForbidden(page);
  await expect(reportsNavLink(page)).toBeVisible();
  await expect(teamNavLink(page)).toHaveCount(0);
  expect(sent).toHaveLength(1);

  await goToReportsByNav(page);
  await expect(page.getByText(SCOPE_SELF, { exact: true })).toBeVisible();
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
