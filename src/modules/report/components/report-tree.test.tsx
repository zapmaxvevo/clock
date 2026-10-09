import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReportGroup } from "@/modules/report/schema";

import { ReportTreeRows } from "./report-tree";
import { visibleRows } from "./report-tree-model";

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

function render(open: readonly string[]): string {
  return renderToStaticMarkup(
    <table>
      <tbody>
        <ReportTreeRows
          rows={visibleRows(groups, new Set(open))}
          nested
          onToggle={() => undefined}
        />
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

describe("ReportTreeRows (D-R3-9, §5.4)", () => {
  const open = [`/${P1}`, `/${P1}/2026-09-29`];

  it("las filas abiertas en preorden, cada una con su duración", () => {
    const markup = render(open);
    expect(
      [...markup.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, row]) =>
        [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(([, cell]) =>
          cell.replace(/<[^>]+>/g, ""),
        ),
      ),
    ).toEqual([
      ["P1", "1:30"],
      ["mar, 29/09", "1:00"],
      ["E1", "1:00"],
      ["jue, 01/10", "0:30"],
    ]);
  });

  it("un grupo abierto lleva aria-expanded=true y uno cerrado false", () => {
    const [project, tuesday, , thursday] = rowHeadings(render(open));
    expect(project).toMatch(/<button type="button" aria-expanded="true"/);
    expect(tuesday).toMatch(/<button type="button" aria-expanded="true"/);
    expect(thursday).toMatch(/<button type="button" aria-expanded="false"/);
  });

  it("una hoja no lleva botón: deja el lugar del chevrón, oculto al lector", () => {
    const [, , tag] = rowHeadings(render(open));
    expect(tag).not.toContain("<button");
    expect(tag).not.toContain("aria-expanded");
    expect(tag).toMatch(
      /^<span[^>]*><span aria-hidden="true" class="size-4 shrink-0"><\/span>/,
    );
    expect(tag).toContain('<span class="truncate">E1</span>');
  });

  it("la sangría marca el nivel", () => {
    const [project, tuesday, tag] = rowHeadings(render(open));
    expect(project).not.toMatch(/pl-(6|12)/);
    expect(tuesday).toMatch(/^<span class="[^"]*\bpl-6\b/);
    expect(tag).toMatch(/^<span class="[^"]*\bpl-12\b/);
  });

  it("con un solo nivel, el encabezado solo, sin el lugar del chevrón", () => {
    const [project] = rowHeadings(
      renderToStaticMarkup(
        <table>
          <tbody>
            <ReportTreeRows
              rows={visibleRows(
                [{ kind: "tag", tag: { id: E1, name: "E1" }, seconds: 60 }],
                new Set(),
              )}
              nested={false}
              onToggle={() => undefined}
            />
          </tbody>
        </table>,
      ),
    );
    expect(project).toBe('<span class="truncate">E1</span>');
  });
});
