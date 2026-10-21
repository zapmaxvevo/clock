import type { Page } from "@playwright/test";

import { PERSON_TIMEZONE } from "./calendar-page";
import {
  deleteWorkspaceSettings,
  durationFormatOf,
  restoreWorkspaceSettings,
  seedPersonEntries,
  seedRunningEntry,
  setDurationFormat,
  setRole,
  workspaceSettingAuditsOf,
} from "./database";
import { addDays, minuteOfDayIn, todayIn, type CivilDay } from "./days";
import {
  dropActionRequests,
  holdActionResponses,
  loseActionResponses,
  withServerAction,
} from "./network";
import { goToReportsByNav, reportTotal } from "./reports-page";
import { expect, test } from "./session";
import {
  chooseDurationFormat,
  DURATION_FORMAT_TEXTS,
  durationFormatControl,
  durationFormatOption,
  durationNotice,
  enterAsAdmin,
  FORBIDDEN_ROLE,
  generalSection,
  isSettingsPage,
  loadFailedNotice,
  NETWORK_FAILURE,
  retryButton,
  SETTINGS_PATH,
  settingsHeading,
  settingsNavLink,
  timeTrackingSection,
} from "./settings-page";
import { lastWeekOf, openTrackerFrom, trackerDay } from "./timesheet-page";
import {
  elapsedCounter,
  entryRow,
  goToTrackerByNav,
  todayGroup,
  trackerBar,
} from "./tracker-page";

/**
 * Recorridos que cambian el formato de duración desde `/configuracion` (§9.5
 * del contrato de WS2b). El formato es de todo el workspace, así que corren en
 * el proyecto `duration-switch`, después del completo y sin nada en paralelo
 * (D-WS2b-12), y en serie entre sí. Cada uno arranca con el workspace en
 * `full` por la base y entra con un admin propio; el teardown del completo lo
 * deja en `compact` al terminar. Las entradas sembradas son de 100 segundos:
 * `0:01` en el compacto y `00:01:40` en el completo.
 */
test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await setDurationFormat("full");
});

/** El contador del timer: las horas sin relleno, con los dos formatos (PF-22). */
const COUNTER = /^0:\d{2}:\d{2}$/;

/** El total de un día del rastreador en cada formato, con su etiqueta. */
const FULL_TOTAL = /^Total \d{2,}:\d{2}:\d{2}$/;
const COMPACT_TOTAL = /^Total \d+:\d{2}$/;

/** Las constancias como quedan en la base: `JSON.stringify`, sin espacios (§4.5). */
const FULL_TO_COMPACT = {
  previousValue: '{"durationFormat":"full"}',
  nextValue: '{"durationFormat":"compact"}',
};
const COMPACT_TO_FULL = {
  previousValue: '{"durationFormat":"compact"}',
  nextValue: '{"durationFormat":"full"}',
};

/**
 * Minutos del comienzo y del final del día en que los recorridos con entradas
 * de hoy no corren: van de las 00:00 a las 00:06:40, y el timer sembrado
 * empezó hace diez minutos.
 */
const DAY_START_MARGIN_MINUTES = 15;
const DAY_END_MARGIN_MINUTES = 5;

function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

function skipNearMidnight(): void {
  const minute = minuteOfDayIn(PERSON_TIMEZONE);
  test.skip(
    minute < DAY_START_MARGIN_MINUTES || minute > 1440 - DAY_END_MARGIN_MINUTES,
    "cerca de la medianoche las entradas de hoy y el timer sembrado no caen en el mismo día",
  );
}

/** Dos entradas de 100 segundos de la persona en `day`, a las 00:00 y a las 00:05. */
async function seedTwoEntries(email: string, day: CivilDay): Promise<void> {
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "Primera", day, start: "00:00:00", end: "00:01:40" },
    { description: "Segunda", day, start: "00:05:00", end: "00:06:40" },
  ]);
}

/** Abre `/configuracion` y espera el selector con el completo del arranque. */
async function openSettingsInFull(page: Page): Promise<void> {
  await page.goto(SETTINGS_PATH);
  await expect(durationFormatControl(page)).toHaveText(DURATION_FORMAT_TEXTS.full);
}

test("un admin cambia el formato y las pantallas que abre después lo muestran", async ({
  page,
  email,
}) => {
  skipNearMidnight();
  await enterAsAdmin(page, email);
  await seedTwoEntries(email, today());
  await openSettingsInFull(page);

  // Criterio 1: el compacto queda en la base, con su constancia.
  await chooseDurationFormat(page, "compact");
  expect(await durationFormatOf()).toBe("compact");
  expect(await workspaceSettingAuditsOf(email)).toEqual([FULL_TO_COMPACT]);

  // WS-64, D-WS2b-5: el rastreador, por la navegación y sin recargar, ya en
  // el compacto.
  await goToTrackerByNav(page);
  const group = todayGroup(page);
  for (const description of ["Primera", "Segunda"]) {
    await expect(
      entryRow(group, description).getByText("0:01", { exact: true }),
    ).toBeVisible();
  }
  await expect(group.getByText("Total 0:03", { exact: true })).toBeVisible();

  // Y de vuelta al completo: el reporte de esta semana lo muestra.
  await settingsNavLink(page).click();
  await expect(durationFormatControl(page)).toHaveText(DURATION_FORMAT_TEXTS.compact);
  await chooseDurationFormat(page, "full");
  expect(await durationFormatOf()).toBe("full");
  await goToReportsByNav(page);
  await expect(reportTotal(page, "Total")).toHaveText("00:03:20");
  expect(await workspaceSettingAuditsOf(email)).toEqual([
    FULL_TO_COMPACT,
    COMPACT_TO_FULL,
  ]);
});

test("con un timer corriendo, el contador sigue sin relleno y el total del día pasa al compacto", async ({
  page,
  email,
}) => {
  skipNearMidnight();
  await enterAsAdmin(page, email);
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: "Cerrada", day: today(), start: "00:00:00", end: "00:01:40" },
  ]);
  await seedRunningEntry(email, "Timer del cambio");
  await page.reload();
  await expect(elapsedCounter(trackerBar(page))).toHaveText(COUNTER);
  await expect(todayGroup(page).getByText(FULL_TOTAL).first()).toBeVisible();

  // WS-66: cambiar el formato no toca el timer.
  await openSettingsInFull(page);
  await chooseDurationFormat(page, "compact");
  await goToTrackerByNav(page);
  await expect(elapsedCounter(trackerBar(page))).toHaveText(COUNTER);
  await expect(todayGroup(page).getByText(COMPACT_TOTAL).first()).toBeVisible();
  await expect(todayGroup(page).getByText(FULL_TOTAL)).toHaveCount(0);
  await expect(elapsedCounter(trackerBar(page))).toHaveText(COUNTER);
});

test("el selector muestra lo elegido mientras viaja, vuelve si falla y Reintentar lo guarda", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  await openSettingsInFull(page);
  const control = durationFormatControl(page);
  const notice = durationNotice(page);

  // Criterio 14: con la respuesta retenida, el disparador ya dice lo elegido
  // (la vista optimista) y el servidor ya lo guardó.
  const release = await holdActionResponses(page, isSettingsPage);
  await control.click();
  await durationFormatOption(page, "compact").click();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);
  await expect.poll(() => durationFormatOf()).toBe("compact");
  await withServerAction(page, async () => release());
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);
  await expect(notice).toHaveCount(0);

  // WS-62: el pedido se corta antes de salir. El selector vuelve al guardado
  // y el aviso ofrece reintentar.
  const restoreRequests = await dropActionRequests(page, isSettingsPage);
  await control.click();
  await durationFormatOption(page, "full").click();
  await expect(notice).toContainText(NETWORK_FAILURE);
  const retry = retryButton(notice);
  await expect(retry).toBeVisible();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);
  expect(await durationFormatOf()).toBe("compact");

  await restoreRequests();
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.full);
  expect(await durationFormatOf()).toBe("full");

  // El servidor guarda y la respuesta no llega: «Reintentar» manda el mismo
  // formato, que ya es el guardado, y responde éxito sin otra constancia.
  const restoreResponses = await loseActionResponses(page, isSettingsPage);
  await control.click();
  await durationFormatOption(page, "compact").click();
  await expect(notice).toContainText(NETWORK_FAILURE);
  await expect(retry).toBeVisible();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.full);
  await expect.poll(() => durationFormatOf()).toBe("compact");

  await restoreResponses();
  await withServerAction(page, () => retry.click());
  await expect(notice).toBeHidden();
  await expect(control).toHaveText(DURATION_FORMAT_TEXTS.compact);
  expect(await durationFormatOf()).toBe("compact");
  expect(await workspaceSettingAuditsOf(email)).toEqual([
    FULL_TO_COMPACT,
    COMPACT_TO_FULL,
    FULL_TO_COMPACT,
  ]);
});

test("un admin que pierde el rol con la pantalla abierta no cambia el formato y ve que no tiene permiso", async ({
  page,
  email,
}) => {
  await enterAsAdmin(page, email);
  await openSettingsInFull(page);
  await setRole(email, "member");

  // WS-52, D-WS1-6: la respuesta `forbidden` llega con el árbol revalidado.
  await durationFormatControl(page).click();
  await withServerAction(page, () => durationFormatOption(page, "compact").click());
  await expect(page.getByText(FORBIDDEN_ROLE, { exact: true })).toBeVisible();
  await expect(settingsHeading(page)).toBeVisible();
  await expect(generalSection(page)).toHaveCount(0);
  await expect(timeTrackingSection(page)).toHaveCount(0);
  await expect(durationFormatControl(page)).toHaveCount(0);
  await expect(settingsNavLink(page)).toHaveCount(0);
  expect(await durationFormatOf()).toBe("full");
  expect(await workspaceSettingAuditsOf(email)).toEqual([]);
});

test("sin la fila de ajustes, /configuracion muestra el error de la pantalla y el resto entra en compacto", async ({
  page,
  email,
}) => {
  const now = today();
  const day = addDays(lastWeekOf(now), 1);
  await enterAsAdmin(page, email);
  await seedTwoEntries(email, day);
  await openSettingsInFull(page);

  try {
    // Criterio 8, WS-73, §4.6: con la pantalla abierta, elegir otro valor
    // responde `unexpected`, pero la revalidación trae la página otra vez, que
    // no se puede leer: se ve el error de la pantalla, no el aviso del campo.
    await deleteWorkspaceSettings();
    await durationFormatControl(page).click();
    await durationFormatOption(page, "compact").click();
    const failed = loadFailedNotice(page);
    await expect(failed).toBeVisible();
    await expect(retryButton(failed)).toBeVisible();
    await expect(settingsHeading(page)).toBeVisible();
    await expect(durationNotice(page)).toHaveCount(0);
    await expect(durationFormatControl(page)).toHaveCount(0);
    await expect(durationFormatOf()).rejects.toThrow("no tiene fila de ajustes");

    // Al entrar, lo mismo: nunca la pantalla a medias.
    await page.goto(SETTINGS_PATH);
    await expect(loadFailedNotice(page)).toBeVisible();
    await expect(retryButton(loadFailedNotice(page))).toBeVisible();
    await expect(generalSection(page)).toHaveCount(0);
    await expect(durationFormatControl(page)).toHaveCount(0);

    // La sesión resuelve la fila que falta como el compacto (D-WS2a-2): el
    // rastreador sigue entrando.
    await openTrackerFrom(page, day);
    const group = trackerDay(page, day, now);
    for (const description of ["Primera", "Segunda"]) {
      await expect(
        entryRow(group, description).getByText("0:01", { exact: true }),
      ).toBeVisible();
    }
    await expect(group.getByText("Total 0:03", { exact: true })).toBeVisible();
    await expect(durationFormatOf()).rejects.toThrow("no tiene fila de ajustes");
  } finally {
    await restoreWorkspaceSettings("full");
  }
  expect(await workspaceSettingAuditsOf(email)).toEqual([]);
});
