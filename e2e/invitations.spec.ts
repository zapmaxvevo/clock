import { randomUUID } from "node:crypto";

import type { Browser, Locator, Page } from "@playwright/test";

import { invitationStatusOf, seedPerson, setDisplayName, setRole } from "./database";
import { loseActionResponses } from "./network";
import { expect, signIn, signInRejected, TEST_EMAIL_DOMAIN, test } from "./session";
import {
  ALREADY_INVITED,
  copyButton,
  dialogAlert,
  dialogButton,
  DROP_FAILING,
  emailsField,
  EXTERNAL_MARK,
  inactiveMemberMessage,
  invalidEmailMessage,
  INVITE,
  inviteButton,
  inviteDialog,
  invitationRow,
  INVITED,
  INVITED_MARK,
  isTeamPage,
  MEMBER_ROLE,
  memberHeader,
  memberRow,
  NO_EMAIL_SENT,
  NO_INVITATIONS_YET,
  NOBODY_INVITED,
  noticeText,
  NOTICE_COPIED,
  outcomeItem,
  outcomeLabel,
  resultDialog,
  REVOKE_WARNING,
  revokeButton,
  revokeDialog,
  revokedMessage,
  roleCell,
  TEAM_PATH,
  teamFeedback,
  teamHeading,
  teamTable,
} from "./team-page";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * E1a, §9.3: como en R2a y R8, el workspace es común, así que cada recorrido
 * invita correos con un id propio y nunca afirma sobre la tabla entera. Quien
 * invita es la persona de la sesión, con el rol de admin; el owner de la suite
 * no se toca. Los externos son de un dominio fuera de `TEST_EMAIL_DOMAIN`, que
 * es el único que el servidor de los e2e habilita.
 */
const EXTERNAL_DOMAIN = "externo-e2e.test";

/** D-E1a-14: el texto de `/login` para `dominio_no_habilitado`. */
const DOMAIN_DENIED =
  "La cuenta no pertenece al dominio de la empresa ni tiene una invitación vigente.";

/** D-E1a-14: el texto de `/login` para un motivo que no conoce. */
const LOGIN_FAILED = "No se pudo iniciar sesión. Volvé a intentar.";

/** Un correo del dominio que nadie más usa, con `label` para leer el recorrido. */
function domainEmail(label: string): string {
  return `e2e-${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

/** Un correo de otro dominio que nadie más usa. */
function externalEmail(label: string): string {
  return `e2e-${label}-${randomUUID()}@${EXTERNAL_DOMAIN}`;
}

/**
 * La persona de la sesión entra, que es lo que le crea la membresía, pasa a
 * admin y abre `/equipo`, que lee el rol en el pedido (D-R8-8). El owner de la
 * suite entró en el setup, así que quien mira nunca está solo y no aparece el
 * vacío de EQ-93, con su segundo «Invitar».
 */
async function enterTeamAsAdmin(page: Page, email: string): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setRole(email, "admin");
  await page.goto(TEAM_PATH);
  await expect(teamTable(page)).toBeVisible();
  await expect(page.getByText(NO_INVITATIONS_YET, { exact: true })).toHaveCount(0);
}

/** Abre «Invitar», escribe `emails` y manda el pedido. Devuelve el paso de carga. */
async function sendInvitation(page: Page, emails: string): Promise<Locator> {
  await inviteButton(page).click();
  const dialog = inviteDialog(page);
  await emailsField(dialog).fill(emails);
  await dialogButton(dialog, INVITE).click();
  return dialog;
}

/**
 * Invita a `email`, espera que el resultado lo dé por invitado y cierra el
 * diálogo con «Listo». La revalidación trae su fila sin recargar (criterio 23).
 */
async function inviteOne(page: Page, email: string): Promise<void> {
  await sendInvitation(page, email);
  const result = resultDialog(page);
  await expect(outcomeLabel(outcomeItem(result, email), INVITED)).toBeVisible();
  await dialogButton(result, "Listo").click();
  await expect(result).toBeHidden();
  await expect(invitationRow(page, email)).toBeVisible();
}

/** Una pestaña en un contexto propio, sin sesión: la de la persona invitada. */
async function guestPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext();
  return context.newPage();
}

/**
 * Con la sesión ya en su contexto, entra a la aplicación, que es lo que le
 * crea la membresía y acepta su invitación pendiente (D-E1a-5).
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
}

test("un admin invita a una persona del dominio y a una externa, copia el aviso y las ve en la tabla", async ({
  page,
  email,
  baseURL,
}) => {
  // D-E1a-10: la dirección del aviso es `BETTER_AUTH_URL`, que el servidor
  // local recibe igual a la de la suite.
  const appUrl = baseURL ?? "";
  const inDomain = domainEmail("nueva");
  const outside = externalEmail("nueva");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await enterTeamAsAdmin(page, email);

  // Criterio 1: owner y admin ven «Invitar».
  await expect(inviteButton(page)).toBeVisible();
  await sendInvitation(page, `${inDomain}, ${outside}`);

  // Criterios 2 y 3: el paso de resultado, con el aviso de cada una.
  const result = resultDialog(page);
  await expect(result.getByText(NO_EMAIL_SENT, { exact: true })).toBeVisible();
  for (const invited of [inDomain, outside]) {
    const item = outcomeItem(result, invited);
    await expect(outcomeLabel(item, INVITED)).toBeVisible();
    await expect(
      item.getByText(noticeText(appUrl, invited), { exact: true }),
    ).toBeVisible();
    await expect(copyButton(result, invited)).toBeVisible();
  }

  // «Copiar» deja el aviso en el portapapeles y lo anuncia.
  await copyButton(result, outside).click();
  await expect(result.getByText(NOTICE_COPIED, { exact: true })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(noticeText(appUrl, outside));

  // «Listo» devuelve el foco a «Invitar».
  await dialogButton(result, "Listo").click();
  await expect(result).toBeHidden();
  await expect(inviteButton(page)).toBeFocused();

  // D-E1a-12, EQ-22: las dos filas, con «Invitada»; la externa, además, con
  // «Externa». Sin recargar (criterio 23).
  const domainRow = invitationRow(page, inDomain);
  await expect(memberHeader(domainRow)).toContainText(INVITED_MARK);
  await expect(memberHeader(domainRow)).not.toContainText(EXTERNAL_MARK);
  await expect(roleCell(domainRow)).toHaveText(MEMBER_ROLE);
  await expect(revokeButton(page, inDomain)).toBeVisible();
  const externalRow = invitationRow(page, outside);
  await expect(memberHeader(externalRow)).toContainText(INVITED_MARK);
  await expect(memberHeader(externalRow)).toContainText(EXTERNAL_MARK);
  await expect(roleCell(externalRow)).toHaveText(MEMBER_ROLE);
  await expect(revokeButton(page, outside)).toBeVisible();

  expect(await invitationStatusOf(inDomain)).toBe("pending");
  expect(await invitationStatusOf(outside)).toBe("pending");
});

test("un pedido con un correo inválido y una persona desactivada no invita a nadie, y sin ellos invita al válido", async ({
  page,
  email,
}) => {
  const invalid = `no-es-un-correo-${randomUUID()}`;
  const inactive = domainEmail("desactivada");
  const valid = domainEmail("valida");
  await seedPerson({
    email: inactive,
    displayName: `Dora ${uniqueSuffix()}`,
    status: "inactive",
  });
  await enterTeamAsAdmin(page, email);

  // Criterios 5 y 6 (EQ-14, EQ-76, EQ-79): todo o nada, con una causa por
  // correo. El diálogo queda abierto con lo escrito.
  const written = [invalid, inactive, valid].join("\n");
  const dialog = await sendInvitation(page, written);
  const rejected = dialogAlert(dialog);
  await expect(rejected).toContainText(NOBODY_INVITED);
  await expect(rejected).toContainText(invalidEmailMessage(invalid));
  await expect(rejected).toContainText(inactiveMemberMessage(inactive));
  await expect(emailsField(dialog)).toHaveValue(written);
  expect(await invitationStatusOf(valid)).toBeNull();

  // «Quitar los que fallan» deja solo el válido, con el foco en el campo.
  await dialogButton(dialog, DROP_FAILING).click();
  await expect(emailsField(dialog)).toHaveValue(valid);
  await expect(emailsField(dialog)).toBeFocused();

  // Reenviado, crea solo su fila.
  await dialogButton(dialog, INVITE).click();
  const result = resultDialog(page);
  await expect(outcomeLabel(outcomeItem(result, valid), INVITED)).toBeVisible();
  await expect(result.getByRole("listitem")).toHaveCount(1);
  expect(await invitationStatusOf(valid)).toBe("pending");
  expect(await invitationStatusOf(inactive)).toBeNull();
});

test("una persona externa entra recién cuando la invitan, y pasa de invitada a persona del equipo", async ({
  page,
  email,
  browser,
}) => {
  const outside = externalEmail("externa");
  const name = `Ximena ${uniqueSuffix()}`;

  // Criterio 14: sin invitación ni variable, no entra.
  const guest = await guestPage(browser);
  await signInRejected(guest.context(), outside);

  await enterTeamAsAdmin(page, email);
  await inviteOne(page, outside);

  // Con la invitación pendiente entra: nace su membresía y la invitación
  // pasa a `accepted` (D-E1a-5). El rechazo de antes ya le creó el `user`,
  // así que se le puede poner un nombre único para encontrar su fila.
  await signIn(guest.context(), outside);
  await setDisplayName(outside, name);
  await enterApp(guest);
  expect(await invitationStatusOf(outside)).toBe("accepted");

  // En la pantalla del admin, al recargar, está entre las personas y ya no
  // entre las invitadas.
  await page.reload();
  const row = memberRow(page, name);
  await expect(memberHeader(row)).toContainText(outside);
  await expect(roleCell(row)).toHaveText(MEMBER_ROLE);
  await expect(invitationRow(page, outside)).toHaveCount(0);
  await guest.context().close();
});

test("revocar saca la invitación y deja afuera a la persona externa, y volver a invitarla la deja entrar", async ({
  page,
  email,
  browser,
}) => {
  const outside = externalEmail("revocada");
  await enterTeamAsAdmin(page, email);
  await inviteOne(page, outside);

  // Criterio 10: revocar pide confirmación, y «Cancelar» no cambia nada.
  await revokeButton(page, outside).click();
  const confirm = revokeDialog(page, outside);
  await expect(confirm.getByText(REVOKE_WARNING, { exact: true })).toBeVisible();
  await dialogButton(confirm, "Cancelar").click();
  await expect(confirm).toBeHidden();
  await expect(invitationRow(page, outside)).toBeVisible();
  expect(await invitationStatusOf(outside)).toBe("pending");

  // Con «Revocar», la fila sale, la pantalla lo anuncia y el foco va al
  // título de la tabla (§5.4).
  await revokeButton(page, outside).click();
  await dialogButton(confirm, "Revocar").click();
  await expect(teamFeedback(page)).toContainText(revokedMessage(outside));
  await expect(invitationRow(page, outside)).toHaveCount(0);
  await expect(teamHeading(page)).toBeFocused();
  expect(await invitationStatusOf(outside)).toBe("revoked");

  // Criterio 15: con la invitación revocada, no entra.
  const guest = await guestPage(browser);
  await signInRejected(guest.context(), outside);

  // Criterio 11: volver a invitarla reusa la fila, y ahora entra.
  await inviteOne(page, outside);
  expect(await invitationStatusOf(outside)).toBe("pending");
  await signIn(guest.context(), outside);
  await enterApp(guest);
  expect(await invitationStatusOf(outside)).toBe("accepted");
  await guest.context().close();
});

test("si la respuesta de invitar se pierde, «Reintentar» no duplica la invitación", async ({
  page,
  email,
}) => {
  const invited = domainEmail("reintento");
  await enterTeamAsAdmin(page, email);

  // La respuesta se pierde después de que el servidor escribió.
  const stopLosing = await loseActionResponses(page, isTeamPage);
  const dialog = await sendInvitation(page, invited);
  const retry = dialogButton(dialogAlert(dialog), "Reintentar");
  await expect(retry).toBeVisible();
  expect(await invitationStatusOf(invited)).toBe("pending");

  // Criterio 21 (EQ-97): el reintento encuentra la fila del primer intento y
  // la cuenta como «Ya estaba invitada».
  await stopLosing();
  await retry.click();
  const result = resultDialog(page);
  await expect(outcomeLabel(outcomeItem(result, invited), ALREADY_INVITED)).toBeVisible();
  expect(await invitationStatusOf(invited)).toBe("pending");
});

test("/login explica el rechazo que conoce y nunca muestra el texto de la dirección", async ({
  browser,
}) => {
  // Sin sesión: con una, `/login` lleva a `/`.
  const context = await browser.newContext();
  const page = await context.newPage();
  const notice = page.getByRole("main").getByRole("alert");

  // Criterio 24: un motivo conocido muestra su texto.
  await page.goto("/login?error=dominio_no_habilitado");
  await expect(notice).toHaveText(DOMAIN_DENIED);

  // Uno armado a mano muestra el genérico, y ni él ni `error_description`
  // aparecen en la página.
  const crafted = "Tu cuenta venció: escribí a soporte@externo-e2e.test";
  const description = "Mandá tu contraseña a soporte@externo-e2e.test";
  const query = new URLSearchParams({ error: crafted, error_description: description });
  await page.goto(`/login?${query.toString()}`);
  await expect(notice).toHaveText(LOGIN_FAILED);
  await expect(page.getByText(crafted)).toHaveCount(0);
  await expect(page.getByText(description)).toHaveCount(0);

  // Sin `error`, ningún aviso.
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Entrar con Google" })).toBeVisible();
  await expect(notice).toHaveCount(0);
  await context.close();
});
