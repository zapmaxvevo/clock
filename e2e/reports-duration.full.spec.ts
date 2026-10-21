import type { Page } from "@playwright/test";
import type { Row, Workbook } from "exceljs";

import { PERSON_TIMEZONE } from "./calendar-page";
import { copyEntry, seedPersonEntries } from "./database";
import { todayIn, weekdayLabel, type CivilDay } from "./days";
import {
  chartBar,
  chartBarName,
  chartBars,
  chartCaption,
  chartDataRows,
  chartDataSummary,
  chartFigure,
  expectOneLine,
  exportLink,
  groupDuration,
  groupRow,
  openReport,
  readCsv,
  readPdf,
  readXlsx,
  reportTotal,
  weekRange,
  xlsxNumberOf,
  type ExportLabel,
} from "./reports-page";
import { expect, test } from "./session";
import { trackerBar, uniqueSuffix } from "./tracker-page";

/**
 * Recorridos del completo en el reporte (§9.4 del contrato de WS2b): la
 * pantalla y las tres descargas en `hh:mm:ss`. Corren en el proyecto
 * `duration-full`, con el workspace en `full` (D-WS2a-12 de WS2a); los mismos
 * lugares con el compacto los prueba `reports.spec.ts`. Cada recorrido entra
 * con una persona propia, que ve solo lo suyo, y siembra entradas de 100
 * segundos: `0:01` en el compacto y `00:01:40` en el completo, así un lugar
 * que formatee en minutos o con el compacto falla. Las entradas van en una
 * semana fija de 2025, lejos de hoy, como las de la exportación de R6.
 */

/** Hoy en la zona por omisión de la persona, que es la que corta los días. */
function today(): CivilDay {
  return todayIn(PERSON_TIMEZONE);
}

function in2025(month: number, day: number): CivilDay {
  return { year: 2025, month, day };
}

/** La semana de los recorridos, del lunes 15/09 al domingo 21/09 de 2025. */
const WEEK = weekRange(in2025(9, 15));
const MONDAY = in2025(9, 15);
const TUESDAY = in2025(9, 16);
const WEDNESDAY = in2025(9, 17);

/** `99999:59:59`, lo más ancho que tiene que entrar en una columna de duración. */
const WIDEST_DURATION = "99999:59:59";

/**
 * Entra a una pantalla, que es lo que le crea la membresía a la persona de la
 * sesión: sin ella no se le pueden sembrar entradas.
 */
async function enterApp(page: Page): Promise<void> {
  await page.goto("/");
  await expect(trackerBar(page)).toBeVisible();
}

/**
 * Dos entradas de 100 segundos de la persona de la sesión, el lunes y el
 * miércoles de `WEEK`, sin proyecto. Devuelve sus descripciones.
 */
async function seedTwoEntries(
  email: string,
): Promise<{ readonly morning: string; readonly afternoon: string }> {
  const suffix = uniqueSuffix();
  const morning = `Mañana ${suffix}`;
  const afternoon = `Tarde ${suffix}`;
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description: morning, day: MONDAY, start: "10:00:00", end: "10:01:40" },
    { description: afternoon, day: WEDNESDAY, start: "14:00:00", end: "14:01:40" },
  ]);
  return { morning, afternoon };
}

/** Descarga un formato desde «Exportar» y devuelve dónde quedó el archivo. */
async function download(page: Page, label: ExportLabel): Promise<string> {
  const downloading = page.waitForEvent("download");
  await exportLink(page, label).click();
  return (await downloading).path();
}

/**
 * La fila de la hoja `name` cuya columna `column` dice `text`, y el número de
 * la columna «Duración» de esa hoja, por su encabezado. `row.values` empieza
 * en el índice 1, como las columnas.
 */
function xlsxRow(
  workbook: Workbook,
  name: string,
  column: number,
  text: string,
): { readonly row: Row; readonly duration: number } {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) {
    throw new Error(`Falta la hoja «${name}».`);
  }
  const rows = sheet.getRows(1, sheet.rowCount) ?? [];
  const heading = rows.find((row) =>
    (row.values as readonly unknown[]).includes("Duración"),
  );
  const row = rows.find((candidate) => candidate.getCell(column).value === text);
  if (heading === undefined || row === undefined) {
    throw new Error(`Falta la fila «${text}» o el encabezado «Duración» en «${name}».`);
  }
  return { row, duration: (heading.values as readonly unknown[]).indexOf("Duración") };
}

test("el reporte muestra las filas, los totales y el gráfico en el completo", async ({
  page,
  email,
}) => {
  const day = today();
  await enterApp(page);
  await seedTwoEntries(email);
  await openReport(page, WEEK, "fecha", day);

  // Criterio 11: cada fila con sus segundos, y el total con la suma exacta.
  // El facturable, en cero, también en el completo.
  const monday = weekdayLabel(MONDAY, day);
  const wednesday = weekdayLabel(WEDNESDAY, day);
  await expect(groupDuration(groupRow(page, monday))).toHaveText("00:01:40");
  await expect(groupDuration(groupRow(page, wednesday))).toHaveText("00:01:40");
  await expect(reportTotal(page, "Total")).toHaveText("00:03:20");
  await expect(reportTotal(page, "Facturable")).toHaveText("00:00:00");

  // D-WS2b-8: el nombre de cada barra, también las de cero, y las líneas de
  // la escala. La barra más alta es de 100 segundos, así que la escala va de
  // cero a un paso de 15 minutos. Las de la escala son texto oculto a los
  // lectores; con la tabla de datos cerrada, son las únicas que se ven.
  const byDay = chartFigure(page, chartCaption("fecha"));
  await expect(chartBars(byDay)).toHaveCount(7);
  await expect(chartBar(byDay, chartBarName(monday, null, "00:01:40"))).toBeVisible();
  await expect(
    chartBar(byDay, chartBarName(weekdayLabel(TUESDAY, day), null, "00:00:00")),
  ).toBeVisible();
  for (const line of ["00:00:00", "00:15:00"]) {
    await expect(
      byDay.getByText(line, { exact: true }).filter({ visible: true }),
    ).toHaveCount(1);
  }

  // La tabla de datos del gráfico, una fila por día.
  await chartDataSummary(byDay).click();
  const rows = chartDataRows(byDay);
  await expect(rows).toHaveCount(7);
  await expect(rows.getByRole("cell")).toHaveText([
    "00:01:40",
    "00:00:00",
    "00:01:40",
    "00:00:00",
    "00:00:00",
    "00:00:00",
    "00:00:00",
  ]);
});

test("con más de diez mil horas la duración entra en un renglón, en la tabla y en los datos del gráfico", async ({
  page,
  email,
}) => {
  const day = today();
  await enterApp(page);

  // D-WS2b-8: 480 entradas de 21 horas en el mismo día suman 10 080 horas.
  // Con cien horas, `105:00:00` todavía entra en la columna del compacto: la
  // cifra tiene que llegar a cinco para que una columna sin el ancho del
  // completo no la contenga.
  const description = `Larga ${uniqueSuffix()}`;
  await seedPersonEntries(email, PERSON_TIMEZONE, [
    { description, day: MONDAY, start: "01:00", end: "22:00" },
  ]);
  await copyEntry(email, description, 479);
  await openReport(page, WEEK, "fecha", day);

  const total = "10080:00:00";
  await expect(reportTotal(page, "Total")).toHaveText(total);
  const cell = groupDuration(groupRow(page, weekdayLabel(MONDAY, day)));
  await expect(cell).toHaveText(total);
  await expectOneLine(cell);

  const byDay = chartFigure(page, chartCaption("fecha"));
  await chartDataSummary(byDay).click();
  const dataCell = chartDataRows(byDay).first().getByRole("cell");
  await expect(dataCell).toHaveText(total);
  await expectOneLine(dataCell);
});

test("las tres descargas llevan la duración en el completo y las horas como con el compacto", async ({
  page,
  email,
}) => {
  const day = today();
  await enterApp(page);
  const { morning, afternoon } = await seedTwoEntries(email);
  const monday = weekdayLabel(MONDAY, day);
  const wednesday = weekdayLabel(WEDNESDAY, day);
  await openReport(page, WEEK, "fecha", day);

  // Criterio 10, D-WS2b-9: «Duración» con los segundos; «Horas», de los
  // minutos truncados, como con el compacto (ADR 0029).
  const lines = (await readCsv(await download(page, "CSV"))).split("\r\n");
  expect(lines).toContain(`"Total";"00:03:20";"0,05"`);
  expect(lines).toContain(`"Facturable";"00:00:00";"0,00"`);
  expect(lines).toContain(`"1";"${monday}";"00:01:40";"0,01"`);
  expect(lines).toContain(`"1";"${wednesday}";"00:01:40";"0,01"`);
  for (const description of [morning, afternoon]) {
    const entry = lines.find((line) => line.includes(`"${description}"`));
    expect(entry, `la entrada «${description}»`).toMatch(/;"00:01:40";"0,01"$/);
  }

  // Excel: la celda guarda los segundos con `[hh]:mm:ss`, y la columna de
  // duración de cada hoja tiene el ancho de la más ancha.
  const workbook = await readXlsx(await download(page, "Excel"));
  const summary = xlsxRow(workbook, "Resumen", 2, monday);
  const duration = summary.row.getCell(summary.duration);
  expect(xlsxNumberOf(duration)).toBeCloseTo(100 / 86_400, 9);
  expect(duration.numFmt).toBe("[hh]:mm:ss");
  expect(summary.row.getCell(summary.duration + 1).value).toBe(0.01);
  const entries = xlsxRow(workbook, "Entradas", 9, morning);
  const entryDuration = entries.row.getCell(entries.duration);
  expect(xlsxNumberOf(entryDuration)).toBeCloseTo(100 / 86_400, 9);
  expect(entryDuration.numFmt).toBe("[hh]:mm:ss");
  for (const [name, column] of [
    ["Resumen", summary.duration],
    ["Entradas", entries.duration],
  ] as const) {
    expect(
      workbook.getWorksheet(name)?.getColumn(column).width,
      `el ancho de «Duración» en «${name}»`,
    ).toBeGreaterThanOrEqual(WIDEST_DURATION.length);
  }

  // PDF: el total de la cabecera y el resumen con los segundos, y la escala
  // del gráfico con el formato. Un rótulo puede partirse en renglones dentro
  // de su columna, así que las filas se comparan sin blancos.
  const pages = await readPdf(await download(page, "PDF"));
  expect(pages).toHaveLength(1);
  const [{ text, rows }] = pages;
  expect(text).toContain("00:03:20");
  const withoutBlanks = (row: string) => row.replace(/\s+/g, "");
  expect(rows.map(withoutBlanks)).toEqual(
    [`1 ${monday} 00:01:40 0,01`, `1 ${wednesday} 00:01:40 0,01`].map(withoutBlanks),
  );
  const caption = chartCaption("fecha");
  const start = text.indexOf(caption);
  expect(start, `«${caption}» en el PDF`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf("Resumen", start);
  expect(end, "«Resumen» después del gráfico").toBeGreaterThan(start);
  expect(text.slice(start, end).trim()).toBe(
    `${caption} 00:00:00 00:15:00 15/09 16/09 17/09 18/09 19/09 20/09 21/09`,
  );
});
