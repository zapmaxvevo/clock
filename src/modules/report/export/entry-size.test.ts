import { describe, expect, it } from "vitest";

import type { DurationFormat } from "@/server/time";

import { csvBytesOf } from "./csv";
import { entriesMinBytes } from "./entry-size";
import type { ExportCell, ExportDocument } from "./types";

function text(value: string): ExportCell {
  return { kind: "text", text: value };
}

describe("entriesMinBytes (S1, S2 de las revisiones de R6a, B4)", () => {
  /** Una línea de «Entradas» sin textos, de cero segundos, en el formato pedido. */
  function bareLine(durationFormat: DurationFormat): ExportDocument {
    return {
      header: [],
      chart: null,
      durationFormat,
      sections: [
        {
          title: "",
          rows: [
            [
              { kind: "day", dayKey: "2026-09-29" },
              { kind: "clock", clock: "10:00" },
              { kind: "day", dayKey: "2026-09-29" },
              { kind: "clock", clock: "10:00" },
              text(""),
              { kind: "empty" },
              { kind: "empty" },
              { kind: "empty" },
              { kind: "empty" },
              { kind: "empty" },
              text("No"),
              { kind: "duration", seconds: 0 },
              { kind: "hours", minutes: 0 },
            ],
          ],
        },
      ],
    };
  }

  /** El BOM (3), la línea vacía (2) y el título vacío (4) van antes de la fila. */
  function lineBytesOf(document: ExportDocument): number {
    return csvBytesOf(document).byteLength - 3 - 2 - 4;
  }

  const bare = { entries: 1, textBytes: 0, tagLinks: 0, taggedEntries: 0 };

  it("una línea de «Entradas» sin textos pesa en el CSV escrito lo fijo de cada línea", () => {
    expect(entriesMinBytes(bare)).toBe(lineBytesOf(bareLine("compact")));
  });

  it("con el completo, la cota sigue debajo del CSV escrito (D-WS2b-9)", () => {
    expect(entriesMinBytes(bare)).toBeLessThan(lineBytesOf(bareLine("full")));
  });

  it("suma los textos y un «, » menos que las etiquetas de cada entrada", () => {
    expect(
      entriesMinBytes({ entries: 3, textBytes: 100, tagLinks: 5, taggedEntries: 2 }),
    ).toBe(3 * 80 + 100 + 2 * 3);
  });
});
