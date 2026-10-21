import { ValueType, Workbook, type Cell, type Worksheet } from "exceljs";
import { describe, expect, it } from "vitest";

import { DURATION_FORMATS, type DurationFormat } from "@/server/time";

import type { ExportCell, ExportDocument } from "./types";
import { xlsxBytesOf } from "./xlsx";

/** Los días entre el 30/12/1899 de Excel y el 01/01/1970 de JavaScript. */
const EPOCH_OFFSET_DAYS = 25_569;

const DAY_MS = 86_400_000;

function text(value: string): ExportCell {
  return { kind: "text", text: value };
}

const document: ExportDocument = {
  header: [
    [text("Reporte resumido")],
    [text("Zona horaria"), text("America/Argentina/Buenos_Aires")],
  ],
  chart: null,
  durationFormat: "compact",
  sections: [
    {
      title: "Resumen",
      rows: [
        [text("Nivel"), text("Persona"), text("Duración"), text("Horas")],
        [
          { kind: "integer", value: 1 },
          text("=1+1"),
          { kind: "duration", seconds: 5400 },
          { kind: "hours", minutes: 89 },
        ],
      ],
    },
    {
      title: "Entradas",
      rows: [
        [text("Fecha de inicio"), text("Hora de inicio"), text("Descripción")],
        [
          { kind: "day", dayKey: "2024-01-01" },
          { kind: "clock", clock: "09:30" },
          { kind: "empty" },
        ],
      ],
    },
  ],
};

/** El archivo escrito, leído otra vez con la biblioteca (D-R6-12: solo los tests leen). */
async function readBack(source: ExportDocument): Promise<Workbook> {
  const workbook = new Workbook();
  await workbook.xlsx.load((await xlsxBytesOf(source)).buffer);
  return workbook;
}

function sheetOf(workbook: Workbook, name: string): Worksheet {
  const sheet = workbook.getWorksheet(name);
  if (sheet === undefined) {
    throw new Error(`Falta la hoja ${name}.`);
  }
  return sheet;
}

/**
 * El número de serie que guarda la celda. Al leer, la biblioteca convierte en
 * `Date` los números con formato de fecha u hora; uno sin formato queda número.
 */
function serialOf(cell: Cell): number {
  const { value } = cell;
  if (value instanceof Date) {
    return value.getTime() / DAY_MS + EPOCH_OFFSET_DAYS;
  }
  if (typeof value === "number") {
    return value;
  }
  throw new Error(`La celda ${cell.address} no guarda un número: ${String(value)}.`);
}

/** Los textos de una fila, `null` en las celdas vacías. */
function textsOf(sheet: Worksheet, row: number, columns: number): (string | null)[] {
  return Array.from({ length: columns }, (_, index) => {
    const { value } = sheet.getRow(row).getCell(index + 1);
    return typeof value === "string" ? value : null;
  });
}

describe("xlsxBytesOf (D-R6-12; criterio 16 de R6)", () => {
  it("escribe dos hojas, «Resumen» y «Entradas», cada una con la cabecera, una fila vacía y su tabla", async () => {
    const workbook = await readBack(document);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Resumen",
      "Entradas",
    ]);
    for (const [name, headings] of [
      ["Resumen", ["Nivel", "Persona", "Duración", "Horas"]],
      ["Entradas", ["Fecha de inicio", "Hora de inicio", "Descripción", null]],
    ] as const) {
      const sheet = sheetOf(workbook, name);
      expect(textsOf(sheet, 1, 2)).toEqual(["Reporte resumido", null]);
      expect(textsOf(sheet, 2, 2)).toEqual([
        "Zona horaria",
        "America/Argentina/Buenos_Aires",
      ]);
      expect(sheet.getRow(3).cellCount).toBe(0);
      expect(textsOf(sheet, 4, 4)).toEqual(headings);
      expect(sheet.getRow(4).getCell(1).font?.bold).toBe(true);
      expect(sheet.rowCount).toBe(5);
    }
  });

  it("ninguna celda es una fórmula: «=1+1» es una cadena con formato de texto", async () => {
    const workbook = await readBack(document);

    const kinds: ValueType[] = [];
    for (const sheet of workbook.worksheets) {
      sheet.eachRow((row) => row.eachCell((cell) => kinds.push(cell.type)));
    }
    expect(kinds).not.toContain(ValueType.Formula);
    const formulaLike = sheetOf(workbook, "Resumen").getRow(5).getCell(2);
    expect([formulaLike.type, formulaLike.value, formulaLike.numFmt]).toEqual([
      ValueType.String,
      "=1+1",
      "@",
    ]);
  });

  it("las duraciones, las horas, el día, la hora de reloj y el nivel son números con su formato", async () => {
    const workbook = await readBack(document);
    const summary = sheetOf(workbook, "Resumen").getRow(5);
    const entries = sheetOf(workbook, "Entradas").getRow(5);

    const level = summary.getCell(1);
    expect([level.type, level.value]).toEqual([ValueType.Number, 1]);
    const duration = summary.getCell(3);
    expect(serialOf(duration)).toBeCloseTo(90 / 1440, 9);
    expect(duration.numFmt).toBe("[h]:mm");
    const hours = summary.getCell(4);
    // 89 minutos son 1,4833… horas: truncadas al centésimo, 1,48, como el CSV.
    expect([hours.type, hours.value, hours.numFmt]).toEqual([
      ValueType.Number,
      1.48,
      "0.00",
    ]);
    const day = entries.getCell(1);
    expect([serialOf(day), day.numFmt]).toEqual([45_292, "yyyy-mm-dd"]);
    const clock = entries.getCell(2);
    // La hora vuelve como `Date`, redondeada al milisegundo.
    expect(serialOf(clock)).toBeCloseTo(570 / 1440, 9);
    expect(clock.numFmt).toBe("hh:mm");
    expect(entries.getCell(3).type).toBe(ValueType.Null);
  });

  it("las horas se truncan al centésimo: un minuto es 0,01 y tres no suman más que el total de 3 minutos", async () => {
    const oneMinute: ExportCell = { kind: "hours", minutes: 1 };
    const workbook = await readBack({
      header: [[text("Total"), { kind: "hours", minutes: 3 }]],
      chart: null,
      durationFormat: "compact",
      sections: [
        {
          title: "Entradas",
          rows: [[text("Horas")], [oneMinute], [oneMinute], [oneMinute]],
        },
      ],
    });
    const sheet = sheetOf(workbook, "Entradas");

    const total = sheet.getRow(1).getCell(2).value;
    const rows = [4, 5, 6].map((row) => sheet.getRow(row).getCell(1).value);
    expect([total, rows]).toEqual([0.05, [0.01, 0.01, 0.01]]);
  });

  it("reemplaza por U+FFFD lo que no es un carácter de XML 1.0, y el archivo se puede releer", async () => {
    const workbook = await readBack({
      header: [],
      chart: null,
      durationFormat: "compact",
      sections: [
        {
          title: "Entradas",
          rows: [
            [text("x\uFFFFy"), text("a\uD800b"), text("c\u0001d"), text("ok \u{1F600}")],
          ],
        },
      ],
    });

    expect(textsOf(sheetOf(workbook, "Entradas"), 2, 4)).toEqual([
      "x\uFFFDy",
      "a\uFFFDb",
      "c\uFFFDd",
      "ok \u{1F600}",
    ]);
  });

  describe("la duración con el formato del documento (D-WS2b-9; criterio 10 de WS2b)", () => {
    const hundredSeconds: ExportCell = { kind: "duration", seconds: 100 };

    /** Un documento con 100 segundos en la cabecera y en una fila del resumen. */
    function withDuration(durationFormat: DurationFormat): ExportDocument {
      return {
        header: [
          [text("Reporte resumido")],
          [text("Total"), hundredSeconds, { kind: "hours", minutes: 1 }],
        ],
        chart: null,
        durationFormat,
        sections: [
          {
            title: "Resumen",
            rows: [
              [text("Nivel"), text("Persona"), text("Duración"), text("Horas")],
              [
                { kind: "integer", value: 1 },
                text("Ana"),
                hundredSeconds,
                { kind: "hours", minutes: 1 },
              ],
            ],
          },
        ],
      };
    }

    it("con el compacto, los minutos truncados con `[h]:mm`, como hasta WS2b", async () => {
      const sheet = sheetOf(await readBack(withDuration("compact")), "Resumen");

      for (const cell of [sheet.getRow(2).getCell(2), sheet.getRow(5).getCell(3)]) {
        expect(serialOf(cell)).toBeCloseTo(1 / 1440, 9);
        expect(cell.numFmt).toBe("[h]:mm");
      }
    });

    it("con el completo, los segundos con `[hh]:mm:ss`; las horas no cambian", async () => {
      const sheet = sheetOf(await readBack(withDuration("full")), "Resumen");

      for (const cell of [sheet.getRow(2).getCell(2), sheet.getRow(5).getCell(3)]) {
        expect(serialOf(cell)).toBeCloseTo(100 / 86_400, 9);
        expect(cell.numFmt).toBe("[hh]:mm:ss");
      }
      expect(sheet.getRow(5).getCell(4).value).toBe(0.01);
    });

    it.each(DURATION_FORMATS)(
      "con el %s, cada columna con una duración entra `99999:59:59`, y las demás quedan con el ancho de Excel",
      async (durationFormat) => {
        const sheet = sheetOf(await readBack(withDuration(durationFormat)), "Resumen");
        const widths = [1, 2, 3, 4].map((column) => sheet.getColumn(column).width);

        // Once caracteres y el margen de la celda.
        const fits = "99999:59:59".length + 1;
        expect(widths[0]).toBeUndefined();
        expect(widths[1]).toBeGreaterThanOrEqual(fits);
        expect(widths[2]).toBeGreaterThanOrEqual(fits);
        expect(widths[3]).toBeUndefined();
      },
    );
  });
});
