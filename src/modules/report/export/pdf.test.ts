import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { pdfPageTexts, type PdfPageText } from "@/test/pdf";

import { pdfBytesOf } from "./pdf";
import type { ExportCell, ExportDocument, ExportRow } from "./types";

/** D-R7-5: el SHA-256 de Noto Sans Regular 2.015 sin hinting. */
const FONT_SHA256 = "f3961a9cde016d41a4879aecda1474d3a36d6bf54fa0e4643de029cc2248b0e8";

const HEADINGS = "Nivel Persona Proyecto Fecha Duración Horas";

function text(value: string): ExportCell {
  return { kind: "text", text: value };
}

const empty: ExportCell = { kind: "empty" };

/** Una fila del resumen de tres niveles: el nivel, sus tres rótulos y 1:30. */
function row(level: number, labels: readonly string[]): ExportRow {
  return [
    { kind: "integer", value: level },
    ...[0, 1, 2].map((index) => {
      const label = labels[index];
      return label === undefined ? empty : text(label);
    }),
    { kind: "duration", minutes: 90 },
    { kind: "hours", minutes: 90 },
  ];
}

/** El documento de `exportDocumentOf` por Persona → Proyecto → Fecha, con `rows` en el resumen. */
function documentOf(rows: readonly ExportRow[]): ExportDocument {
  return {
    header: [
      [text("Reporte resumido")],
      [text("Período"), text("28/09/2026 – 04/10/2026")],
      [text("Zona horaria"), text("America/Argentina/Buenos_Aires")],
      [text("Alcance"), text("Todas las personas del workspace")],
      [text("Agrupado por"), text("Persona / Proyecto / Fecha")],
      [text("Total"), { kind: "duration", minutes: 59 }, { kind: "hours", minutes: 59 }],
      [
        text("Facturable"),
        { kind: "duration", minutes: 30 },
        { kind: "hours", minutes: 30 },
      ],
      [text("Generado"), text("08/10/2026 12:00")],
    ],
    sections: [
      {
        title: "Resumen",
        rows: [
          ["Nivel", "Persona", "Proyecto", "Fecha", "Duración", "Horas"].map(text),
          ...rows,
        ],
      },
    ],
  };
}

const small = documentOf([
  row(1, ["Łukasz Żółć"]),
  row(2, ["Łukasz Żółć", "Web (ACME)"]),
  row(3, ["Łukasz Żółć", "Web (ACME)", "2026-09-29"]),
  row(1, ["Дмитрий … 😀"]),
]);

/** 200 filas de rótulos cortos: tres páginas o más. */
const longRows = Array.from({ length: 200 }, (_, index) =>
  row((index % 3) + 1, [
    `Persona ${index}`,
    `Proyecto ${index}`,
    `2026-09-${10 + (index % 20)}`,
  ]),
);

/** La fila de nivel 2 con un rótulo de 100 «x», que pdfkit parte en renglones. */
const tallRow = row(2, ["Ana", "x".repeat(100)]);
const tallText = `2 Ana ${"x".repeat(100)} 1:30 1,50`;

/** El título y el tamaño de cada página, leídos con pdfjs. */
async function pdfFactsOf(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loading = getDocument({ data: new Uint8Array(bytes), disableFontFace: true });
  try {
    const pdf = await loading.promise;
    const { info } = await pdf.getMetadata();
    const sizes = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const { width, height } = (await pdf.getPage(number)).getViewport({ scale: 1 });
      sizes.push([width, height]);
    }
    return { title: (info as { Title?: string }).Title, sizes };
  } finally {
    await loading.destroy();
  }
}

/** Lo que dice el PDF de sí mismo, sin comprimir: sus fuentes. */
function latin1Of(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("pdfBytesOf (D-R7-4 a D-R7-6; criterio 8 de R7)", () => {
  it("es un PDF en A4 vertical con el título en los metadatos", async () => {
    const bytes = await pdfBytesOf(small);

    expect(latin1Of(bytes.slice(0, 5))).toBe("%PDF-");
    const { title, sizes } = await pdfFactsOf(bytes);
    expect(title).toBe("Reporte resumido");
    expect(sizes).toHaveLength(1);
    const [[width, height]] = sizes as [[number, number]];
    expect(width).toBeCloseTo(595.28, 0);
    expect(height).toBeCloseTo(841.89, 0);
    expect(Math.abs(width - 595.28)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(height - 841.89)).toBeLessThanOrEqual(0.5);
  });

  it("un documento chico: una página con la cabecera, los encabezados, las filas y el pie", async () => {
    const pages = await pdfPageTexts(await pdfBytesOf(small));

    expect(pages).toHaveLength(1);
    const [page] = pages as [PdfPageText];
    for (const expected of [
      "Reporte resumido",
      "Período 28/09/2026 – 04/10/2026",
      "Zona horaria America/Argentina/Buenos_Aires",
      "Agrupado por Persona / Proyecto / Fecha",
      "Total 0:59 0,98",
      "Facturable 0:30 0,50",
      "Resumen",
      HEADINGS,
      "Página 1 de 1",
    ]) {
      expect(page.text).toContain(expected);
    }
    expect(page.rows).toEqual([
      "1 Łukasz Żółć 1:30 1,50",
      "2 Łukasz Żółć Web (ACME) 1:30 1,50",
      "3 Łukasz Żółć Web (ACME) 2026-09-29 1:30 1,50",
      "1 Дмитрий … � 1:30 1,50",
    ]);
  });

  it("unas 200 filas: tres páginas o más, cada una con los encabezados y su número, y ninguna de más", async () => {
    const pages = await pdfPageTexts(await pdfBytesOf(documentOf(longRows)));

    expect(pages.length).toBeGreaterThanOrEqual(3);
    pages.forEach((page, index) => {
      expect(page.text).toContain(HEADINGS);
      expect(page.text).toContain(`Página ${index + 1} de ${pages.length}`);
      expect(page.rows.length).toBeGreaterThan(0);
    });
    expect(pages.flatMap(({ rows }) => rows)).toEqual(
      longRows.map((_, index) => {
        const level = (index % 3) + 1;
        const labels = [
          `Persona ${index}`,
          `Proyecto ${index}`,
          `2026-09-${10 + (index % 20)}`,
        ];
        return [level, ...labels.slice(0, 3), "1:30", "1,50"].join(" ");
      }),
    );
  });

  it("una fila que no entra en lo que queda de su página pasa entera a la siguiente", async () => {
    const [first] = await pdfPageTexts(await pdfBytesOf(documentOf(longRows)));
    // En el lugar de la última fila de la primera página: con sus renglones no entra.
    const at = (first?.rows.length ?? 0) - 1;
    const rows = [...longRows.slice(0, at), tallRow, ...longRows.slice(at)];

    const pages = await pdfPageTexts(await pdfBytesOf(documentOf(rows)));

    expect(pages[0]?.rows).toHaveLength(at);
    expect(pages[0]?.rows.some((text) => text.startsWith("2 Ana x"))).toBe(false);
    expect(pages[1]?.rows[0]).toBe(tallText);
  });

  it("una fila más alta que una página: RangeError", async () => {
    const huge = documentOf([row(1, ["x ".repeat(10_000)])]);

    await expect(pdfBytesOf(huge)).rejects.toBeInstanceOf(RangeError);
  });

  it("incrusta un subconjunto de Noto Sans Regular, la del repositorio, y nada de Helvetica", async () => {
    const bytes = latin1Of(await pdfBytesOf(small));
    const font = await readFile(
      join(process.cwd(), "src/modules/report/export/fonts/NotoSans-Regular.ttf"),
    );

    expect(bytes).toMatch(/\/BaseFont \/[A-Z]{6}\+NotoSans-Regular/);
    expect(bytes).toContain("/FontFile2");
    expect(bytes).not.toContain("Helvetica");
    expect(createHash("sha256").update(font).digest("hex")).toBe(FONT_SHA256);
  });

  it("dos a la vez: cada PDF con su texto y nada del otro", async () => {
    const [left, right] = await Promise.all([
      pdfBytesOf(documentOf([row(1, ["Solo Izquierda"])])),
      pdfBytesOf(documentOf([row(1, ["Solo Derecha"])])),
    ]);

    const [leftText, rightText] = await Promise.all(
      [left, right].map(async (bytes) =>
        (await pdfPageTexts(bytes)).map(({ text }) => text).join(" "),
      ),
    );
    expect(leftText).toContain("Solo Izquierda");
    expect(leftText).not.toContain("Solo Derecha");
    expect(rightText).toContain("Solo Derecha");
    expect(rightText).not.toContain("Solo Izquierda");
  });
});
