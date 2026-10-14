import { describe, expect, it } from "vitest";

import { csvBytesOf } from "./csv";
import type { ExportCell, ExportDocument } from "./types";

const BOM = [0xef, 0xbb, 0xbf];

/** El texto del archivo con el BOM, que `TextDecoder` quitaría por omisión. */
function textOf(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
}

function text(value: string): ExportCell {
  return { kind: "text", text: value };
}

/** El campo de una celda sola en una fila, sin el BOM ni el fin de línea. */
function fieldOf(cell: ExportCell): string {
  const document: ExportDocument = {
    header: [[cell]],
    chart: null,
    sections: [],
  };
  return textOf(csvBytesOf(document)).slice(1, -2);
}

describe("csvBytesOf (D-R6-9; criterio 8 de R6)", () => {
  it("escribe el documento entero con el BOM una vez, `;`, `\\r\\n` también al final, todo entre comillas y las secciones", () => {
    const document: ExportDocument = {
      header: [
        [text("Reporte resumido")],
        [text("Zona horaria"), text("America/Argentina/Buenos_Aires")],
        [
          text("Total"),
          { kind: "duration", minutes: 90 },
          { kind: "hours", minutes: 90 },
        ],
      ],
      chart: null,
      sections: [
        {
          title: "Resumen",
          rows: [
            [text("Nivel"), text("Persona"), text("Duración"), text("Horas")],
            [
              { kind: "integer", value: 1 },
              text("Ana"),
              { kind: "duration", minutes: 90 },
              { kind: "hours", minutes: 90 },
            ],
          ],
        },
        {
          title: "Entradas",
          rows: [
            [
              { kind: "day", dayKey: "2026-09-30" },
              { kind: "clock", clock: "23:30" },
              { kind: "empty" },
              text("Reunión"),
            ],
          ],
        },
      ],
    };

    const bytes = csvBytesOf(document);

    expect([...bytes.slice(0, 3)]).toEqual(BOM);
    expect(textOf(bytes)).toBe(
      "\uFEFF" +
        '"Reporte resumido"\r\n' +
        '"Zona horaria";"America/Argentina/Buenos_Aires"\r\n' +
        '"Total";"1:30";"1,50"\r\n' +
        "\r\n" +
        '"Resumen"\r\n' +
        '"Nivel";"Persona";"Duración";"Horas"\r\n' +
        '"1";"Ana";"1:30";"1,50"\r\n' +
        "\r\n" +
        '"Entradas"\r\n' +
        '"2026-09-30";"23:30";"";"Reunión"\r\n',
    );
    expect(textOf(bytes).split("\uFEFF")).toHaveLength(2);
  });

  it("duplica las comillas internas y deja adentro el separador y los saltos de línea", () => {
    expect(fieldOf(text('Dice "hola"'))).toBe('"Dice ""hola"""');
    expect(fieldOf(text("a;b"))).toBe('"a;b"');
    expect(fieldOf(text("una\r\ndos\nfin"))).toBe('"una\r\ndos\nfin"');
  });

  it("antepone el ' a lo que empieza como una fórmula", () => {
    expect(fieldOf(text("=1+1"))).toBe(`"'=1+1"`);
    expect(fieldOf(text("+1"))).toBe(`"'+1"`);
    expect(fieldOf(text("-1"))).toBe(`"'-1"`);
    expect(fieldOf(text("@SUMA(A1)"))).toBe(`"'@SUMA(A1)"`);
    expect(fieldOf(text("\tx"))).toBe(`"'\tx"`);
    expect(fieldOf(text("\rx"))).toBe(`"'\rx"`);
  });

  it("no antepone el ' si el carácter no va primero o el campo ya empieza con otro", () => {
    expect(fieldOf(text("a=b"))).toBe('"a=b"');
    expect(fieldOf(text(" =x"))).toBe('" =x"');
    expect(fieldOf(text("'x"))).toBe(`"'x"`);
  });

  it("escribe cada tipo de celda", () => {
    expect(fieldOf({ kind: "duration", minutes: 90 })).toBe('"1:30"');
    expect(fieldOf({ kind: "duration", minutes: 120_000 })).toBe('"2000:00"');
    expect(fieldOf({ kind: "hours", minutes: 89 })).toBe('"1,48"');
    expect(fieldOf({ kind: "hours", minutes: 1 })).toBe('"0,01"');
    expect(fieldOf({ kind: "day", dayKey: "2026-10-01" })).toBe('"2026-10-01"');
    expect(fieldOf({ kind: "clock", clock: "09:30" })).toBe('"09:30"');
    expect(fieldOf({ kind: "integer", value: 3 })).toBe('"3"');
    expect(fieldOf({ kind: "empty" })).toBe('""');
  });
});
