import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_MARGIN, pdfFacts, pdfPageTexts } from "@/test/pdf";
import { octoberByDay } from "@/test/report";

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
    { kind: "duration", seconds: 5400 },
    { kind: "hours", minutes: 90 },
  ];
}

/**
 * El documento de `exportDocumentOf` por Persona → Proyecto → Fecha, con `rows`
 * en el resumen y sin gráfico.
 */
function documentOf(rows: readonly ExportRow[]): ExportDocument {
  return {
    header: [
      [text("Reporte resumido")],
      [text("Período"), text("28/09/2026 – 04/10/2026")],
      [text("Zona horaria"), text("America/Argentina/Buenos_Aires")],
      [text("Alcance"), text("Todas las personas del workspace")],
      [text("Agrupado por"), text("Persona / Proyecto / Fecha")],
      [
        text("Total"),
        { kind: "duration", seconds: 3540 },
        { kind: "hours", minutes: 59 },
      ],
      [
        text("Facturable"),
        { kind: "duration", seconds: 1800 },
        { kind: "hours", minutes: 30 },
      ],
      [text("Generado"), text("08/10/2026 12:00")],
    ],
    chart: null,
    durationFormat: "compact",
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

/** Lo que dice el PDF de sí mismo, sin comprimir: sus fuentes. */
function latin1Of(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("pdfBytesOf (D-R7-4 a D-R7-6; criterio 8 de R7)", () => {
  it("es un PDF en A4 vertical con el título en los metadatos", async () => {
    const bytes = await pdfBytesOf(small);

    expect(latin1Of(bytes.slice(0, 5))).toBe("%PDF-");
    const { title, pageSizes } = await pdfFacts(bytes);
    expect(title).toBe("Reporte resumido");
    expect(pageSizes).toHaveLength(1);
    for (const [width, height] of pageSizes) {
      expect(Math.abs(width - 595.28)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(height - 841.89)).toBeLessThanOrEqual(0.5);
    }
  });

  it("un documento chico: una página con la cabecera, los encabezados, las filas y el pie", async () => {
    const pages = await pdfPageTexts(await pdfBytesOf(small));

    expect(pages).toHaveLength(1);
    const [page] = pages;
    for (const expected of [
      "Reporte resumido",
      "Período 28/09/2026 – 04/10/2026",
      "Zona horaria America/Argentina/Buenos_Aires",
      "Alcance Todas las personas del workspace",
      "Agrupado por Persona / Proyecto / Fecha",
      "Total 0:59 0,98",
      "Facturable 0:30 0,50",
      "Generado 08/10/2026 12:00",
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
        return [level, ...labels, "1:30", "1,50"].join(" ");
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

/** La leyenda, la escala de abajo arriba y las siete marcas, en el orden de dibujo. */
const OCTOBER_TEXT =
  "Horas por día 0:00 0:30 1:00 1:30 2:00 01/10 06/10 11/10 16/10 21/10 26/10 31/10";

function withChart(document: ExportDocument): ExportDocument {
  return { ...document, chart: octoberByDay };
}

/** Las siete marcas, que no están en ninguna otra parte del documento. */
const OCTOBER_TICKS = [0, 5, 10, 15, 20, 25, 30].map(
  (index) => octoberByDay.bars[index]?.tick,
);

/**
 * Lo que va de la leyenda a «Resumen» o, si la tabla empieza en la página
 * siguiente, al pie, que se escribe al final; `null` sin leyenda.
 */
function chartTextOf(text: string): string | null {
  const start = text.indexOf("Horas por día");
  if (start === -1) {
    return null;
  }
  const summary = text.indexOf("Resumen", start);
  const end = summary === -1 ? text.indexOf("Página", start) : summary;
  return end === -1 ? null : text.slice(start, end).trim();
}

/** `small` con el gráfico y `count` filas «Nota» de más en la cabecera. */
function withNotes(count: number): ExportDocument {
  const notes = Array.from({ length: count }, (_, index) => [
    text("Nota"),
    text(`Aviso ${index + 1}`),
  ]);
  return withChart({ ...small, header: [...small.header, ...notes] });
}

describe("pdfBytesOf: el gráfico (D-R7-12; criterio 18 de R7)", () => {
  it("debajo de la cabecera: la leyenda, la escala de abajo arriba y las siete marcas enteras", async () => {
    const pages = await pdfPageTexts(await pdfBytesOf(withChart(small)));

    expect(pages).toHaveLength(1);
    expect(chartTextOf(pages[0]?.text ?? "")).toBe(OCTOBER_TEXT);
    expect(pages[0]?.rows).toEqual(
      (await pdfPageTexts(await pdfBytesOf(small)))[0]?.rows,
    );
  });

  it("baja la tabla de la primera página y se dibuja una sola vez", async () => {
    const [charted, plain] = await Promise.all(
      [withChart(documentOf(longRows)), documentOf(longRows)].map(async (document) =>
        pdfPageTexts(await pdfBytesOf(document)),
      ),
    );

    expect(charted[0]?.rows.length).toBeLessThan(plain[0]?.rows.length ?? 0);
    expect(charted.flatMap(({ rows }) => rows)).toEqual(
      plain.flatMap(({ rows }) => rows),
    );
    expect(charted.map(({ text }) => text.includes("Horas por día"))).toEqual(
      charted.map((_, index) => index === 0),
    );
  });

  it("no se parte: si en la primera página entra la leyenda y no el bloque, va entero a la segunda", async () => {
    // Con 46 «Nota» quedan unos 85 pt: la leyenda mide 15 y el bloque, unos 160.
    const pages = await pdfPageTexts(await pdfBytesOf(withNotes(46)));

    expect(pages).toHaveLength(2);
    const [first, second] = pages.map(({ text }) => text);
    // El pie va al final: entre la última «Nota» y él, nada del gráfico.
    expect(first).toMatch(/Nota Aviso 46 Página 1 de 2$/);
    expect(first).not.toContain("Horas por día");
    expect(chartTextOf(second ?? "")).toBe(OCTOBER_TEXT);
  });

  // Cada «Nota» mide un renglón de 9 pt, como el de las marcas: alguna de estas
  // cabeceras deja menos lugar que el bloque entero y más que el bloque sin
  // alguna de sus partes.
  it.each(Array.from({ length: 13 }, (_, index) => 40 + index))(
    "con %i «Nota», el gráfico entero en una sola página y nada debajo del margen",
    async (count) => {
      const pages = await pdfPageTexts(await pdfBytesOf(withNotes(count)));

      const charted = pages.filter(({ text }) => text.includes("Horas por día"));
      expect(charted).toHaveLength(1);
      expect(chartTextOf(charted[0]?.text ?? "")).toBe(OCTOBER_TEXT);
      for (const page of pages.filter((page) => page !== charted[0])) {
        const words = new Set(page.text.split(" "));
        expect(OCTOBER_TICKS.filter((tick) => words.has(tick))).toEqual([]);
      }
      for (const { lowestY } of pages) {
        expect(lowestY).toBeGreaterThanOrEqual(PAGE_MARGIN);
      }
    },
  );

  it("con el primer nivel cortado, la leyenda va antes del aviso", async () => {
    const notice =
      "El primer nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.";
    const document = withChart({
      ...small,
      sections: [{ title: "Resumen", rows: [[text(notice)]] }],
    });

    const [page] = await pdfPageTexts(await pdfBytesOf(document));

    expect(chartTextOf(page?.text ?? "")).toBe(OCTOBER_TEXT);
    expect(page?.text.indexOf(notice)).toBeGreaterThan(
      page?.text.indexOf("Horas por día") ?? Infinity,
    );
  });

  it("sin gráfico, ninguna página dice «Horas por»", async () => {
    const pages = [
      ...(await pdfPageTexts(await pdfBytesOf(small))),
      ...(await pdfPageTexts(await pdfBytesOf(documentOf(longRows)))),
    ];

    for (const { text } of pages) {
      expect(text).not.toContain("Horas por");
    }
  });
});
