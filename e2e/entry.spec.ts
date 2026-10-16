import { randomUUID } from "node:crypto";

import type { Browser, Locator, Page } from "@playwright/test";

import {
  hasMembership,
  invitationStatusOf,
  inviteForSignIn,
  revokeInvitationOf,
  setDisplayName,
  setRole,
} from "./database";
import {
  expect,
  signInRejected,
  signInUnseeded,
  TEST_EMAIL_DOMAIN,
  test,
} from "./session";
import {
  dialogButton,
  invitationRow,
  inviteOne,
  MEMBER_ROLE,
  memberHeader,
  memberRow,
  revokeButton,
  revokeDialog,
  revokedMessage,
  roleCell,
  TEAM_PATH,
  teamFeedback,
  teamTable,
} from "./team-page";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * E1b, §9.3: desde E1b entra quien tiene membresía o una invitación pendiente,
 * también el dominio de la empresa. Como en E1a, cada recorrido usa correos
 * con un id propio y nunca afirma sobre la tabla entera. Las personas que
 * prueban el ingreso entran con `signInUnseeded`: la siembra de `signIn` les
 * daría la invitación que el recorrido tiene que conseguir (D-E1b-8).
 */

/** EQ-91: el texto de `/login` para `sin_invitacion`. */
const NO_INVITATION =
  "Tu cuenta no tiene una invitación a Clock. Pedísela a quien administra el equipo.";

/** Adonde lleva `requireSession` una sesión sin acceso (D-E1b-5). */
const NO_INVITATION_URL = /\/login\?error=sin_invitacion$/;

/** Un correo del dominio que nadie más usa, con `label` para leer el recorrido. */
function domainEmail(label: string): string {
  return `e2e-${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

/** El aviso de `/login`, dentro de `main` para no tomar el anunciador de rutas. */
function loginNotice(page: Page): Locator {
  return page.getByRole("main").getByRole("alert");
}

/** El botón de `/login`, que sigue a la vista con el aviso. */
function googleButton(page: Page): Locator {
  return page.getByRole("button", { name: "Entrar con Google" });
}

/** Una pestaña en un contexto propio, sin sesión: la de quien intenta entrar. */
async function guestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/**
 * La persona de la sesión entra, pasa a admin y abre `/equipo`, que lee el rol
 * en el pedido (D-R8-8). Su propia sesión es la de `signIn`, que la sembró.
 */
async function enterTeamAsAdmin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setRole(email, "admin");
  await page.goto(TEAM_PATH);
  await expect(teamTable(page)).toBeVisible();
}

test("una persona del dominio sin invitación no entra, y entra cuando la invitan", async ({
  page,
  email,
  browser,
}) => {
  const person = domainEmail("sin-invitacion");
  const name = `Inés ${uniqueSuffix()}`;

  // Criterios 1 y 16 (EQ-29): del dominio, sin membresía ni invitación, la
  // sesión de prueba responde 403 y no nace nada.
  const guest = await guestPage(browser);
  await signInRejected(guest.context(), person);
  expect(await hasMembership(person)).toBe(false);
  expect(await invitationStatusOf(person)).toBeNull();

  await enterTeamAsAdmin(page, email);
  await inviteOne(page, person);
  expect(await invitationStatusOf(person)).toBe("pending");

  // Criterio 2 (EQ-17): con la invitación pendiente entra; su primer pedido
  // la acepta y crea la membresía. El rechazo de antes ya le creó el `user`,
  // así que se le puede poner un nombre único para encontrar su fila.
  await signInUnseeded(guest.context(), person);
  await setDisplayName(person, name);
  await guest.goto("/");
  await expect(trackerBar(guest)).toBeVisible();
  expect(await invitationStatusOf(person)).toBe("accepted");
  expect(await hasMembership(person)).toBe(true);

  // En la pantalla del admin, al recargar, deja las invitadas y está entre
  // las personas, como `member`.
  await page.reload();
  const row = memberRow(page, name);
  await expect(memberHeader(row)).toContainText(person);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(invitationRow(page, person)).toHaveCount(0);
  await guest.context().close();
});

test("una persona del dominio con la invitación revocada no entra", async ({
  page,
  email,
  browser,
}) => {
  const person = domainEmail("revocada");
  await enterTeamAsAdmin(page, email);
  await inviteOne(page, person);

  await revokeButton(page, person).click();
  await dialogButton(revokeDialog(page, person), "Revocar").click();
  await expect(teamFeedback(page)).toContainText(revokedMessage(person));
  expect(await invitationStatusOf(person)).toBe("revoked");

  // D-E1b-2: revocada es sin invitación, también para el dominio.
  const guest = await guestPage(browser);
  await signInRejected(guest.context(), person);
  expect(await hasMembership(person)).toBe(false);

  // La siembra de `signIn` no reabre una fila que existe (D-E1b-8).
  await inviteForSignIn(person);
  expect(await invitationStatusOf(person)).toBe("revoked");
  await signInRejected(guest.context(), person);
  await guest.context().close();
});

test("una sesión cuya invitación se revoca antes del primer pedido termina en /login con el motivo", async ({
  browser,
}) => {
  const person = domainEmail("sesion-sin-acceso");
  await inviteForSignIn(person);
  const guest = await guestPage(browser);

  // La sesión se crea con la invitación pendiente, y se revoca antes de que
  // la persona pida una página: es la sesión sin acceso de D-E1b-5.
  await signInUnseeded(guest.context(), person);
  await revokeInvitationOf(person);

  // Criterio 11: una página de `(app)` lleva a `/login` con el motivo, y
  // `/login` muestra EQ-91 y el botón, sin volver a `/`.
  await guest.goto("/");
  await expect(guest).toHaveURL(NO_INVITATION_URL);
  await expect(loginNotice(guest)).toHaveText(NO_INVITATION);
  await expect(googleButton(guest)).toBeVisible();

  await guest.goto("/perfil");
  await expect(guest).toHaveURL(NO_INVITATION_URL);
  await expect(loginNotice(guest)).toHaveText(NO_INVITATION);

  // Ningún pedido le creó la membresía ni le reabrió la invitación.
  expect(await hasMembership(person)).toBe(false);
  expect(await invitationStatusOf(person)).toBe("revoked");
  await guest.context().close();
});

test("/login con sin_invitacion explica que falta la invitación", async ({ browser }) => {
  // Sin sesión: con una, `/login` lleva a `/`.
  const guest = await guestPage(browser);
  await guest.goto("/login?error=sin_invitacion");
  await expect(loginNotice(guest)).toHaveText(NO_INVITATION);
  await expect(googleButton(guest)).toBeVisible();
  await guest.context().close();
});
