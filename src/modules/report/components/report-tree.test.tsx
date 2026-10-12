import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReportGroup } from "@/modules/report/schema";

import { ReportTreeRows } from "./report-tree";
import { visibleRows, type VisibleRow } from "./report-tree-model";

const P1 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const E1 = "6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d";

/** Proyecto → Fecha → Etiqueta, con P1 y el martes abiertos. */
const groups: ReportGroup[] = [
  {
    kind: "project",
    project: { id: P1, name: "P1", color: "teal" },
    client: null,
    seconds: 5_400,
    children: [
      {
        kind: "date",
        dayKey: "2026-09-29",
        label: "mar, 29/09",
        seconds: 3_600,
        children: [{ kind: "tag", tag: { id: E1, name: "E1" }, seconds: 3_600 }],
      },
      {
        kind: "date",
        dayKey: "2026-10-01",
        label: "jue, 01/10",
        seconds: 1_800,
        children: [{ kind: "tag", tag: null, seconds: 1_800 }],
      },
    ],
  },
];

function render(rows: readonly VisibleRow[]): string {
  return renderToStaticMarkup(
    <table>
      <tbody>
        <ReportTreeRows rows={rows} onToggle={() => undefined} />
      </tbody>
    </table>,
  );
}

/** El contenido del encabezado de cada fila. */
function rowHeadings(markup: string): string[] {
  return [...markup.matchAll(/<th scope="row"[^>]*>(.*?)<\/th>/g)].map(
    ([, content]) => content,
  );
}

function textOf(markup: string): string {
  return markup.replace(/<[^>]+>/g, "");
}

/** Las clases de sangría del contenedor de un encabezado, sin fijar cuáles. */
function indentOf(heading: string): string[] {
  const classes = /^<span class="([^"]*)"/.exec(heading)?.[1].split(" ") ?? [];
  return classes.filter((name) => /^(?:pl|ps|ml|ms)-/.test(name));
}

/** P1 y el martes abiertos, con las claves que da `visibleRows`. */
function openRows(): VisibleRow[] {
  const [project] = visibleRows(groups, new Set());
  const tuesday = visibleRows(groups, new Set([project.key]))[1];
  return visibleRows(groups, new Set([project.key, tuesday.key]));
}

describe("ReportTreeRows (D-R3-9, §5.4)", () => {
  it("las filas abiertas en preorden, cada una con su duración", () => {
    const markup = render(openRows());
    expect(
      [...markup.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, row]) =>
        [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(([, cell]) => textOf(cell)),
      ),
    ).toEqual([
      ["P1", "1:30"],
      ["mar, 29/09", "1:00"],
      ["E1", "1:00"],
      ["jue, 01/10", "0:30"],
    ]);
  });

  it("un grupo abierto lleva aria-expanded=true y uno cerrado false", () => {
    const [project, tuesday, , thursday] = rowHeadings(render(openRows()));
    expect(project).toMatch(/<button type="button" aria-expanded="true"/);
    expect(tuesday).toMatch(/<button type="button" aria-expanded="true"/);
    expect(thursday).toMatch(/<button type="button" aria-expanded="false"/);
  });

  it("una hoja no lleva botón: deja el lugar del chevrón, oculto al lector", () => {
    const [, , tag] = rowHeadings(render(openRows()));
    expect(tag).not.toContain("<button");
    expect(tag).not.toContain("aria-expanded");
    expect(tag).toMatch(/<span aria-hidden="true"[^>]*><\/span>/);
    expect(textOf(tag)).toBe("E1");
  });

  it("la sangría marca el nivel: ninguna en el primero y una distinta en cada uno de abajo", () => {
    const [project, tuesday, tag] = rowHeadings(render(openRows())).map(indentOf);
    expect(project).toEqual([]);
    expect(tuesday).toHaveLength(1);
    expect(tag).toHaveLength(1);
    expect(tag).not.toEqual(tuesday);
  });

  it("con un solo nivel, el encabezado solo, sin botón ni lugar del chevrón", () => {
    const [tag] = rowHeadings(
      render(
        visibleRows(
          [{ kind: "tag", tag: { id: E1, name: "E1" }, seconds: 60 }],
          new Set(),
        ),
      ),
    );
    expect(textOf(tag)).toBe("E1");
    expect(tag).not.toContain("<button");
    expect(tag).not.toContain("aria-hidden");
  });

  it("en dos niveles, una persona sin `children` no lleva botón y deja el lugar del chevrón (D-R9-3)", () => {
    const people: ReportGroup[] = [
      {
        kind: "person",
        userId: "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY",
        name: "Ana",
        inactive: false,
        seconds: 3_600,
        children: [
          {
            kind: "project",
            project: { id: P1, name: "P1", color: "teal" },
            client: null,
            seconds: 3_600,
          },
        ],
      },
      {
        kind: "person",
        userId: "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx",
        name: "Bruno",
        inactive: false,
        seconds: 0,
      },
    ];
    const [ana, bruno] = rowHeadings(render(visibleRows(people, new Set())));
    expect(ana).toMatch(/<button type="button" aria-expanded="false"/);
    expect(textOf(ana)).toBe("Ana");
    expect(bruno).not.toContain("<button");
    expect(bruno).not.toContain("aria-expanded");
    expect(bruno).toMatch(/<span aria-hidden="true"[^>]*><\/span>/);
    expect(textOf(bruno)).toBe("Bruno");
    // Las dos del primer nivel, con la misma sangría.
    expect(indentOf(bruno)).toEqual(indentOf(ana));
  });

  it("Mes → Semana abierto: la semana partida, debajo de cada mes con sus días (D-R10-3)", () => {
    const partOf = (partial: string, seconds: number) =>
      ({
        kind: "week",
        weekStart: "2026-09-28",
        label: "28/09 – 04/10",
        partial,
        seconds,
      }) as const;
    const byMonth: ReportGroup[] = [
      {
        kind: "month",
        monthStart: "2026-09-01",
        label: "septiembre",
        partial: "21/09 – 30/09",
        seconds: 6_300,
        children: [partOf("28/09 – 30/09", 6_300)],
      },
      {
        kind: "month",
        monthStart: "2026-10-01",
        label: "octubre",
        partial: "01/10 – 11/10",
        seconds: 1_800,
        children: [partOf("01/10 – 04/10", 1_800)],
      },
    ];
    const months = new Set(visibleRows(byMonth, new Set()).map(({ key }) => key));
    const headings = rowHeadings(render(visibleRows(byMonth, months)));
    expect(headings.map(textOf)).toEqual([
      "septiembre solo 21/09 – 30/09",
      "28/09 – 04/10 solo 28/09 – 30/09",
      "octubre solo 01/10 – 11/10",
      "28/09 – 04/10 solo 01/10 – 04/10",
    ]);
    // La semana es una hoja: el gris va al lado del rótulo, sin botón.
    expect(headings[1]).not.toContain("<button");
    expect(headings[1]).toContain(
      '<span class="text-muted-foreground">solo 28/09 – 30/09</span>',
    );
  });
});
