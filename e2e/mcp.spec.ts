import { randomUUID } from "node:crypto";

import type { APIRequestContext, Page } from "@playwright/test";

import { NEAR_MIDNIGHT_MINUTES, NEAR_MIDNIGHT_REASON } from "./calendar-page";
import {
  grantCountOf,
  inviteForSignIn,
  projectIdOf,
  seedEntries,
  seedPerson,
  seedProject,
  setDisplayName,
  userIdOf,
  workspaceTimeZone,
} from "./database";
import { addDays, dayKeyOf, minuteOfDayIn, todayIn } from "./days";
import { OWNER_EMAIL, TEST_EMAIL_DOMAIN } from "./environment";
import { googleButton } from "./login-page";
import {
  answerCallback,
  assistantsHeading,
  assistantsSection,
  assistantsStatus,
  authorizationRequest,
  authorizeInPage,
  callbackParams,
  callTool,
  codeOf,
  connectHeading,
  consentButton,
  consentDestination,
  consentSummary,
  disconnectButton,
  disconnectDialog,
  disconnectedMessage,
  DISCONNECT_WARNING,
  exchangeCode,
  expectTokenRejected,
  grantDestination,
  grantRow,
  jwtHeader,
  LOOPBACK_DESTINATION,
  NO_ASSISTANTS,
  OTHERS_FORBIDDEN,
  registerAssistant,
  signedQueryOf,
  signInResuming,
  TEAM_CONSENT,
  type AssistantClient,
  type AssistantTokens,
} from "./mcp";
import { openSecondTab } from "./network";
import { expect, guestPage, test as sessionTest } from "./session";
import {
  chooseRowAction,
  DEACTIVATE,
  deactivateDialog,
  deactivatedMessage,
  dialogButton,
  TEAM_PATH,
  teamFeedback,
} from "./team-page";
import { entryRow, todayGroup, trackerBar, uniqueSuffix } from "./tracker-page";

/*
 * §9.3 del contrato del MCP. Cada recorrido entra con una persona nueva y
 * afirma sobre sus propias autorizaciones, nunca sobre la base entera.
 *
 * El asistente se registra una vez por worker y lo reusan los recorridos,
 * como Claude Code reusa su registro: el registro admite 5 cada 60 segundos
 * por IP (D-MCP-13), y uno por recorrido, en corridas seguidas, lo pasaría.
 * Por lo mismo los recorridos del archivo corren en orden en un solo worker.
 * El consentimiento es del par persona-cliente, así que reusar el cliente no
 * mezcla un recorrido con otro.
 */
const test = sessionTest.extend<object, { assistant: AssistantClient }>({
  assistant: [
    async ({ playwright }, provide, workerInfo) => {
      const request = await playwright.request.newContext({
        baseURL: workerInfo.project.use.baseURL,
      });
      await provide(await registerAssistant(request));
      await request.dispose();
    },
    { scope: "worker" },
  ],
});

test.describe.configure({ mode: "default" });

/** Autoriza al asistente desde la pestaña con sesión, acepta y canjea el código. */
async function connect(
  page: Page,
  request: APIRequestContext,
  assistant: AssistantClient,
): Promise<AssistantTokens> {
  const authorization = authorizationRequest(assistant);
  const params = await authorizeInPage(page, assistant, authorization, (consentPage) =>
    consentButton(consentPage, "Conectar").click(),
  );
  return exchangeCode(request, assistant, authorization, codeOf(params, authorization));
}

/** Que el token sirve: `get_context` responde la persona dueña. */
async function expectTokenServes(
  request: APIRequestContext,
  assistant: AssistantClient,
  tokens: AssistantTokens,
  email: string,
): Promise<void> {
  const context = await callTool(request, assistant, tokens.accessToken, "get_context");
  expect(context.isError).toBe(false);
  expect(context.structuredContent.user).toMatchObject({ email });
}

/**
 * La zona que da `get_context` y ayer en ella: el resumido corta los días en
 * la zona de quien pide (RP-22), así que la entrada de ayer se siembra ahí.
 */
async function yesterdayOf(
  request: APIRequestContext,
  assistant: AssistantClient,
  tokens: AssistantTokens,
): Promise<{ readonly timeZone: string; readonly day: string }> {
  const context = await callTool(request, assistant, tokens.accessToken, "get_context");
  expect(context.isError).toBe(false);
  const timeZone = context.structuredContent.timezone;
  if (typeof timeZone !== "string") {
    throw new Error(`get_context no trae la zona: ${JSON.stringify(context)}.`);
  }
  return { timeZone, day: dayKeyOf(addDays(todayIn(timeZone), -1)) };
}

test("una persona conecta un asistente y carga una entrada con él", async ({
  page,
  email,
  request,
  assistant,
}) => {
  const timeZone = await workspaceTimeZone();
  const minute = minuteOfDayIn(timeZone);
  test.skip(
    minute < NEAR_MIDNIGHT_MINUTES || minute > 1440 - NEAR_MIDNIGHT_MINUTES,
    NEAR_MIDNIGHT_REASON,
  );
  const suffix = uniqueSuffix();
  const project = `Proyecto del asistente ${suffix}`;
  const description = `Cargada por el asistente ${suffix}`;

  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await seedProject({ name: project });

  // §5.1: con sesión, la autorización lleva a `/conectar`, que dice quién
  // pide, qué, con qué cuenta y adónde vuelve: loopback es esta computadora.
  const authorization = authorizationRequest(assistant);
  const params = await authorizeInPage(
    page,
    assistant,
    authorization,
    async (consent) => {
      await expect(connectHeading(consent, assistant.clientName)).toBeVisible();
      await expect(
        consent.getByText(consentSummary(assistant.clientName, email), { exact: true }),
      ).toBeVisible();
      await expect(
        consent.getByText(consentDestination(LOOPBACK_DESTINATION), { exact: true }),
      ).toBeVisible();
      await consentButton(consent, "Conectar").click();
    },
  );

  // Criterio 3: el código se canjea por un JWT de acceso y un refresh.
  const tokens = await exchangeCode(
    request,
    assistant,
    authorization,
    codeOf(params, authorization),
  );
  expect(jwtHeader(tokens.accessToken).typ).toBe("at+jwt");
  expect(tokens.scope.split(" ")).toContain("clock");

  // `get_context` da la zona y el día de la persona; `create_entry` carga
  // en ese día, con horas de pared ya pasadas y un proyecto suyo.
  const context = await callTool(request, assistant, tokens.accessToken, "get_context");
  expect(context.isError).toBe(false);
  const today = dayKeyOf(todayIn(timeZone));
  expect(context.structuredContent).toMatchObject({ timezone: timeZone, today });

  const created = await callTool(request, assistant, tokens.accessToken, "create_entry", {
    date: today,
    start: "00:00",
    end: "00:01",
    description,
    projectId: await projectIdOf(project),
  });
  expect(created.isError, JSON.stringify(created.structuredContent)).toBe(false);
  expect(created.structuredContent.entry).toMatchObject({
    description,
    date: today,
    start: "00:00",
    end: "00:01",
    project: { name: project },
  });

  // En `/`, la entrada está en el grupo de hoy, con su proyecto.
  await page.goto("/");
  const row = entryRow(todayGroup(page), description);
  await expect(row).toBeVisible();
  await expect(row).toContainText(project);

  // §5.3: en `/perfil`, la fila del asistente, con su destino.
  await page.goto("/perfil");
  await expect(assistantsHeading(page)).toBeVisible();
  await expect(grantRow(page, assistant.clientName)).toContainText(
    grantDestination(LOOPBACK_DESTINATION),
  );
  expect(await grantCountOf(email)).toBe(1);
});

test("desconectar un asistente desde el perfil deja su token sin efecto", async ({
  page,
  email,
  request,
  assistant,
}) => {
  const tokens = await connect(page, request, assistant);
  await expectTokenServes(request, assistant, tokens, email);

  // §5.3: «Desconectar» confirma; «Cancelar» no cambia nada.
  await page.goto("/perfil");
  const row = grantRow(page, assistant.clientName);
  await expect(row).toBeVisible();
  await disconnectButton(page, assistant.clientName).click();
  const dialog = disconnectDialog(page, assistant.clientName);
  await expect(dialog.getByText(DISCONNECT_WARNING, { exact: true })).toBeVisible();
  await dialogButton(dialog, "Cancelar").click();
  await expect(dialog).toBeHidden();
  await expect(row).toBeVisible();
  expect(await grantCountOf(email)).toBe(1);

  // Confirmar saca la fila, lo anuncia y lleva el foco al encabezado.
  await disconnectButton(page, assistant.clientName).click();
  await dialogButton(dialog, "Desconectar").click();
  await expect(dialog).toBeHidden();
  await expect(
    assistantsStatus(page, disconnectedMessage(assistant.clientName)),
  ).toBeVisible();
  await expect(row).toHaveCount(0);
  await expect(assistantsHeading(page)).toBeFocused();

  // D-MCP-3, paso 4: el mismo token, que todavía no venció, ya no sirve.
  await expectTokenRejected(request, assistant, tokens.accessToken);
  expect(await grantCountOf(email)).toBe(0);
});

test("cancelar en la pantalla de conexión vuelve al asistente sin autorizarlo", async ({
  page,
  email,
  assistant,
}) => {
  const authorization = authorizationRequest(assistant);
  const params = await authorizeInPage(page, assistant, authorization, (consent) =>
    consentButton(consent, "Cancelar").click(),
  );

  // Criterio 4: la vuelta lleva `access_denied` y el `state`, sin código.
  expect(params.get("error")).toBe("access_denied");
  expect(params.get("state")).toBe(authorization.state);
  expect(params.get("code")).toBeNull();

  await page.goto("/perfil");
  await expect(
    assistantsSection(page).getByText(NO_ASSISTANTS, { exact: true }),
  ).toBeVisible();
  await expect(grantRow(page, assistant.clientName)).toHaveCount(0);
  expect(await grantCountOf(email)).toBe(0);
});

test("sin sesión, la autorización pasa por el ingreso y lo retoma hasta el código", async ({
  browser,
  email,
  request,
  assistant,
}) => {
  const guest = await guestPage(browser);
  await answerCallback(guest, assistant);

  // D-MCP-15: sin sesión, la autorización lleva a `/login` con la consulta
  // firmada, que muestra el ingreso de siempre.
  const authorization = authorizationRequest(assistant);
  await guest.goto(authorization.url);
  await expect(guest).toHaveURL(/\/login\?/);
  await expect(googleButton(guest)).toBeVisible();

  // D-MCP-4: el ingreso con `oauth_query` en el cuerpo retoma la
  // autorización, que sigue a `/conectar` con la sesión nueva.
  await inviteForSignIn(email);
  const next = await signInResuming(guest, email, signedQueryOf(guest.url()));
  await guest.goto(next);
  await expect(connectHeading(guest, assistant.clientName)).toBeVisible();
  await expect(
    guest.getByText(consentSummary(assistant.clientName, email), { exact: true }),
  ).toBeVisible();
  await consentButton(guest, "Conectar").click();

  // La vuelta trae el código, y el token que sale es de esta persona.
  const params = await callbackParams(guest, assistant);
  const tokens = await exchangeCode(
    request,
    assistant,
    authorization,
    codeOf(params, authorization),
  );
  await expectTokenServes(request, assistant, tokens, email);
  expect(await grantCountOf(email)).toBe(1);

  await guest.context().close();
});

test("desactivar a una persona corta los asistentes que conectó", async ({
  browser,
  page,
  email,
  request,
  assistant,
}) => {
  const name = `Ana Asistida ${uniqueSuffix()}`;
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setDisplayName(email, name);

  const tokens = await connect(page, request, assistant);
  await expectTokenServes(request, assistant, tokens, email);
  expect(await grantCountOf(email)).toBe(1);

  // D-MCP-6: el owner la desactiva desde `/equipo`.
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL, TEAM_PATH);
  await chooseRowAction(ownerPage, name, DEACTIVATE);
  await dialogButton(deactivateDialog(ownerPage, name), DEACTIVATE).click();
  await expect(teamFeedback(ownerPage)).toContainText(deactivatedMessage(name));

  // El token vigente ya no sirve y no le queda ninguna autorización.
  await expectTokenRejected(request, assistant, tokens.accessToken);
  expect(await grantCountOf(email)).toBe(0);

  await ownerPage.context().close();
});

/*
 * §7.3 del contrato de la mejora 5 (`mejoras-mcp-equipo.md`): owner y admin
 * ven desde el asistente las horas del equipo; el resto, solo las propias.
 * Los casos de IDOR, los topes y los cambios de rol son de integración (§7.4).
 */

test("el owner ve desde el asistente las horas de otra persona del equipo", async ({
  browser,
  request,
  assistant,
}) => {
  const suffix = uniqueSuffix();
  const person = {
    email: `e2e-equipo-${randomUUID()}@${TEST_EMAIL_DOMAIN}`,
    displayName: `Pía del Equipo ${suffix}`,
  };
  const description = `Revisión del equipo ${suffix}`;
  await seedPerson(person);

  // D-MCPE-8: `/conectar` del owner suma la oración del equipo.
  const ownerPage = await openSecondTab(browser, OWNER_EMAIL);
  const authorization = authorizationRequest(assistant);
  const params = await authorizeInPage(
    ownerPage,
    assistant,
    authorization,
    async (consent) => {
      await expect(connectHeading(consent, assistant.clientName)).toBeVisible();
      await expect(consent.getByText(TEAM_CONSENT, { exact: true })).toBeVisible();
      await consentButton(consent, "Conectar").click();
    },
  );
  const tokens = await exchangeCode(
    request,
    assistant,
    authorization,
    codeOf(params, authorization),
  );

  // P tiene 90 minutos ayer, en la zona del owner.
  const yesterday = await yesterdayOf(request, assistant, tokens);
  await seedEntries(person.email, yesterday.timeZone, [
    { description, day: yesterday.day, start: "10:00", end: "11:30" },
  ]);
  const personId = await userIdOf(person.email);

  // D-MCPE-2: `list_people` trae a P con su correo, y marca la fila propia.
  const people = await callTool(request, assistant, tokens.accessToken, "list_people");
  expect(people.isError, JSON.stringify(people.structuredContent)).toBe(false);
  expect(people.structuredContent.scope).toBe("everyone");
  expect(people.structuredContent.people).toContainEqual({
    id: personId,
    name: person.displayName,
    email: person.email,
    inactive: false,
    self: false,
  });
  expect(people.structuredContent.people).toContainEqual(
    expect.objectContaining({ id: await userIdOf(OWNER_EMAIL), self: true }),
  );

  // D-MCPE-1: el resumido de ayer con `userIds: [P]` da sus 90 minutos.
  const summary = await callTool(
    request,
    assistant,
    tokens.accessToken,
    "summarize_hours",
    { from: yesterday.day, to: yesterday.day, userIds: [personId] },
  );
  expect(summary.isError, JSON.stringify(summary.structuredContent)).toBe(false);
  expect(summary.structuredContent).toMatchObject({
    timezone: yesterday.timeZone,
    from: yesterday.day,
    to: yesterday.day,
    scope: "everyone",
    groupBy: "person",
    totalMinutes: 90,
    groups: [
      {
        kind: "person",
        key: personId,
        name: person.displayName,
        minutes: 90,
        inactive: false,
      },
    ],
  });

  await ownerPage.context().close();
});

test("un miembro ve desde el asistente solo sus propias horas", async ({
  page,
  email,
  request,
  assistant,
}) => {
  const suffix = uniqueSuffix();
  const name = `Mario Miembro ${suffix}`;
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
  await setDisplayName(email, name);

  // D-MCPE-8: para un `member`, `/conectar` no cambia.
  const authorization = authorizationRequest(assistant);
  const params = await authorizeInPage(
    page,
    assistant,
    authorization,
    async (consent) => {
      await expect(
        consent.getByText(consentSummary(assistant.clientName, email), { exact: true }),
      ).toBeVisible();
      await expect(consent.getByText(TEAM_CONSENT, { exact: true })).toHaveCount(0);
      await consentButton(consent, "Conectar").click();
    },
  );
  const tokens = await exchangeCode(
    request,
    assistant,
    authorization,
    codeOf(params, authorization),
  );

  const yesterday = await yesterdayOf(request, assistant, tokens);
  await seedEntries(email, yesterday.timeZone, [
    { description: `Lo mío ${suffix}`, day: yesterday.day, start: "10:00", end: "11:30" },
  ]);
  const ownId = await userIdOf(email);

  // D-MCPE-2: `list_people` trae solo su fila, sin correo.
  const people = await callTool(request, assistant, tokens.accessToken, "list_people");
  expect(people).toEqual({
    isError: false,
    structuredContent: {
      scope: "self",
      people: [{ id: ownId, name, email: null, inactive: false, self: true }],
    },
  });

  // D-MCPE-4: con el id del owner, `forbidden` antes de leer.
  const others = await callTool(
    request,
    assistant,
    tokens.accessToken,
    "summarize_hours",
    {
      from: yesterday.day,
      to: yesterday.day,
      userIds: [await userIdOf(OWNER_EMAIL)],
    },
  );
  expect(others).toEqual({
    isError: true,
    structuredContent: { code: "forbidden", message: OTHERS_FORBIDDEN },
  });

  // Sin `userIds`, sus 90 minutos y nada más.
  const own = await callTool(request, assistant, tokens.accessToken, "summarize_hours", {
    from: yesterday.day,
    to: yesterday.day,
  });
  expect(own.isError, JSON.stringify(own.structuredContent)).toBe(false);
  expect(own.structuredContent).toMatchObject({
    scope: "self",
    totalMinutes: 90,
    groups: [{ kind: "person", key: ownId, name, minutes: 90 }],
  });
});
