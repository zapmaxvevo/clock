import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReportGroup, ReportReadyState } from "@/modules/report/schema";

import { REPORT_HEADING_ID, ReportView } from "./report-view";

const week = { first: "2026-10-05", last: "2026-10-11" };

const state: ReportReadyState = {
  kind: "ready",
  todayKey: "2026-10-08",
  range: week,
  rangeLabel: "Esta semana",
  previous: { first: "2026-09-28", last: "2026-10-04" },
  next: { first: "2026-10-12", last: "2026-10-18" },
  currentWeek: week,
  shortcuts: [],
  groupBy: "person",
  subgroups: [],
  levelsShown: 1,
  scope: "self",
  timeZone: "America/Argentina/Buenos_Aires",
  totalSeconds: 0,
  billableSeconds: 0,
  groups: [],
};

function render(overrides: Partial<ReportReadyState>): string {
  return renderToStaticMarkup(<ReportView state={{ ...state, ...overrides }} />);
}

/** Las celdas de cada fila del cuerpo, sin etiquetas. */
function bodyRows(markup: string): string[][] {
  const body = markup.slice(markup.indexOf("<tbody>"), markup.indexOf("</tbody>"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, row]) =>
    [...row.matchAll(/<t[hd][^>]*>(.*?)<\/t[hd]>/g)].map(([, cell]) =>
      cell.replace(/<[^>]+>/g, ""),
    ),
  );
}

/** «Total» y «Facturable» con lo que muestra cada uno. */
function totals(markup: string): Record<string, string> {
  return Object.fromEntries(
    [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(
      ([, term, value]) => [term, value],
    ),
  );
}

describe("ReportView", () => {
  it("sin grupos, una fila en las dos columnas y los totales en 0:00 (RP-33)", () => {
    const markup = render({});
    expect(markup).toContain('<td colSpan="2"');
    expect(bodyRows(markup)).toEqual([["No hay horas en este período"]]);
    expect(totals(markup)).toEqual({ Total: "0:00", Facturable: "0:00" });
  });

  it("dice el alcance propio y la zona con que se cortaron los días", () => {
    const markup = render({});
    expect(markup).toContain("Ves solo tus horas.");
    expect(markup).not.toContain("Ves las horas de todas las personas del workspace.");
    expect(markup).toContain(
      "Los días se cortan en tu zona horaria: America/Argentina/Buenos_Aires.",
    );
  });

  it("con alcance de todo el workspace lo dice (D-R2a-2)", () => {
    const markup = render({ scope: "everyone", timeZone: "Europe/Madrid" });
    expect(markup).toContain("Ves las horas de todas las personas del workspace.");
    expect(markup).not.toContain("Ves solo tus horas.");
    expect(markup).toContain("Los días se cortan en tu zona horaria: Europe/Madrid.");
  });

  it("la tabla se nombra por el título y sus encabezados llevan scope", () => {
    const markup = render({});
    expect(markup).toContain(`<table aria-labelledby="${REPORT_HEADING_ID}"`);
    expect(markup).toMatch(/<th scope="col"[^>]*>Persona<\/th>/);
    expect(markup).toMatch(/<th scope="col"[^>]*>Duración<\/th>/);
  });

  it("por persona, la inactiva lo dice en texto (RP-31)", () => {
    const groups: ReportGroup[] = [
      { kind: "person", userId: "u1", name: "Ana", inactive: false, seconds: 7_200 },
      { kind: "person", userId: "u2", name: "Bruno", inactive: true, seconds: 5_460 },
    ];
    const markup = render({
      scope: "everyone",
      groups,
      totalSeconds: 12_660,
      billableSeconds: 3_600,
    });
    expect(bodyRows(markup)).toEqual([
      ["Ana", "2:00"],
      ["Bruno(inactiva)", "1:31"],
    ]);
    expect(markup).toMatch(/<th scope="row"[^>]*>.*?Ana/);
    expect(totals(markup)).toEqual({ Total: "3:31", Facturable: "1:00" });
  });

  it("por proyecto, el cliente en su fila y «Sin proyecto» sin punto ni cliente (RP-28)", () => {
    const groups: ReportGroup[] = [
      {
        kind: "project",
        project: {
          id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          name: "Web",
          color: "teal",
        },
        client: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Acme" },
        seconds: 3_600,
      },
      {
        kind: "project",
        project: {
          id: "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d",
          name: "Interno",
          color: "red",
        },
        client: null,
        seconds: 1_800,
      },
      { kind: "project", project: null, client: null, seconds: 1_800 },
    ];
    const markup = render({ groupBy: "project", groups, totalSeconds: 7_200 });
    expect(markup).toMatch(/<th scope="col"[^>]*>Proyecto<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["WebAcme", "1:00"],
      ["Interno", "0:30"],
      ["Sin proyecto", "0:30"],
    ]);
    const noProject = markup.slice(markup.lastIndexOf("<tr"));
    expect(noProject).not.toContain("background-color");
    expect(markup.match(/background-color/g)).toHaveLength(2);
  });

  it("por cliente, el encabezado «Cliente», el nombre y «Sin cliente» en gris (RP-28)", () => {
    const groups: ReportGroup[] = [
      {
        kind: "client",
        client: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Acme" },
        seconds: 5_400,
      },
      { kind: "client", client: null, seconds: 3_600 },
    ];
    const markup = render({ groupBy: "client", groups, totalSeconds: 9_000 });
    expect(markup).toMatch(/<th scope="col"[^>]*>Cliente<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["Acme", "1:30"],
      ["Sin cliente", "1:00"],
    ]);
    expect(markup).toMatch(/<th scope="row"[^>]*><span class="truncate">Acme<\/span>/);
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="text-muted-foreground">Sin cliente<\/span>/,
    );
    // Sin el punto del proyecto: la fila es del cliente.
    expect(markup).not.toContain("background-color");
    expect(totals(markup).Total).toBe("2:30");
  });

  it("por fecha, el encabezado «Fecha» y cada día con su rótulo dentro de <time> (D-R2b-6)", () => {
    const groups: ReportGroup[] = [
      { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09", seconds: 1_800 },
      { kind: "date", dayKey: "2026-10-01", label: "jue, 01/10", seconds: 6_300 },
      { kind: "date", dayKey: "2025-12-31", label: "mié, 31/12/2025", seconds: 1_200 },
    ];
    const markup = render({ groupBy: "date", groups, totalSeconds: 9_300 });
    expect(markup).toMatch(/<th scope="col"[^>]*>Fecha<\/th>/);
    // En el orden en que llegan: el service ya las ordenó.
    expect(bodyRows(markup)).toEqual([
      ["mar, 29/09", "0:30"],
      ["jue, 01/10", "1:45"],
      ["mié, 31/12/2025", "0:20"],
    ]);
    expect(markup).toMatch(
      /<th scope="row"[^>]*><time dateTime="2026-09-29">mar, 29\/09<\/time><\/th>/,
    );
    expect(markup).toContain('<time dateTime="2025-12-31">mié, 31/12/2025</time>');
    expect(totals(markup).Total).toBe("2:35");
  });

  it("por fecha, un período sin horas es la fila del vacío (RP-33)", () => {
    const markup = render({ groupBy: "date" });
    expect(markup).toMatch(/<th scope="col"[^>]*>Fecha<\/th>/);
    expect(bodyRows(markup)).toEqual([["No hay horas en este período"]]);
    expect(markup).not.toContain("<time");
  });

  it("por tarea, el proyecto en gris y «Sin tarea» en gris, sin proyecto (D-R3-4, RP-28)", () => {
    const web = {
      id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      name: "Web",
      color: "teal",
    } as const;
    const groups: ReportGroup[] = [
      {
        kind: "task",
        task: { id: "3a4b5c6d-7e8f-4a9b-8c0d-2e3f4a5b6c7d", name: "Diseño" },
        project: web,
        seconds: 3_600,
      },
      {
        kind: "task",
        task: { id: "4a5b6c7d-8e9f-4a0b-9c1d-3e4f5a6b7c8d", name: "Revisión" },
        project: web,
        seconds: 1_800,
      },
      { kind: "task", task: null, project: null, seconds: 1_200 },
      {
        kind: "task",
        task: { id: "5a6b7c8d-9e0f-4a1b-8c2d-4e5f6a7b8c9d", name: "Diseño" },
        project: {
          id: "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d",
          name: "Interno",
          color: "red",
        },
        seconds: 900,
      },
    ];
    const markup = render({ groupBy: "task", groups, totalSeconds: 7_500 });
    expect(markup).toMatch(/<th scope="col"[^>]*>Tarea<\/th>/);
    // Las dos «Diseño» se distinguen por su proyecto.
    expect(bodyRows(markup)).toEqual([
      ["DiseñoWeb", "1:00"],
      ["RevisiónWeb", "0:30"],
      ["Sin tarea", "0:20"],
      ["DiseñoInterno", "0:15"],
    ]);
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span[^>]*><span class="truncate">Diseño<\/span><span class="text-muted-foreground truncate">Interno<\/span><\/span><\/th>/,
    );
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="text-muted-foreground">Sin tarea<\/span><\/th>/,
    );
    expect(totals(markup).Total).toBe("2:05");
  });

  it("por etiqueta, el encabezado «Etiqueta», el nombre y «Sin etiqueta» en gris (RP-28)", () => {
    const groups: ReportGroup[] = [
      {
        kind: "tag",
        tag: { id: "6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d", name: "Urgente" },
        seconds: 5_400,
      },
      {
        kind: "tag",
        tag: { id: "7a8b9c0d-1e2f-4a3b-8c4d-6e7f8a9b0c1d", name: "Soporte" },
        seconds: 4_800,
      },
      { kind: "tag", tag: null, seconds: 900 },
    ];
    const markup = render({ groupBy: "tag", groups, totalSeconds: 7_500 });
    expect(markup).toMatch(/<th scope="col"[^>]*>Etiqueta<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["Urgente", "1:30"],
      ["Soporte", "1:20"],
      ["Sin etiqueta", "0:15"],
    ]);
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="truncate">Urgente<\/span><\/th>/,
    );
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="text-muted-foreground">Sin etiqueta<\/span><\/th>/,
    );
    // La cabecera dice el total real, menos que la suma de las filas (D-R3-3).
    expect(totals(markup).Total).toBe("2:05");
  });

  it("por etiqueta, avisa la suma debajo de la zona (RP-18, D-R3-3)", () => {
    const markup = render({ groupBy: "tag" });
    const zone =
      "<p>Los días se cortan en tu zona horaria: America/Argentina/Buenos_Aires.</p>";
    expect(markup).toContain(
      `${zone}<p>Una entrada con varias etiquetas suma en cada una: las filas por etiqueta pueden sumar más que el total.</p>`,
    );
  });

  it.each(["person", "project", "client", "task", "date"] as const)(
    "por %s, sin el aviso de la suma por etiqueta",
    (groupBy) => {
      expect(render({ groupBy })).not.toContain("Una entrada con varias etiquetas");
    },
  );

  it("cada cifra se trunca al minuto por separado: dos filas de 90 s y el total 0:03 (§5.3)", () => {
    const groups: ReportGroup[] = [
      { kind: "person", userId: "u1", name: "Ana", inactive: false, seconds: 90 },
      { kind: "person", userId: "u2", name: "Bruno", inactive: false, seconds: 90 },
    ];
    const markup = render({ scope: "everyone", groups, totalSeconds: 180 });
    expect(bodyRows(markup)).toEqual([
      ["Ana", "0:01"],
      ["Bruno", "0:01"],
    ]);
    expect(totals(markup).Total).toBe("0:03");
  });
});

describe("ReportView con subniveles (D-R3-6, D-R3-9)", () => {
  const P1 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
  const P2 = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
  const tuesday = { kind: "date", dayKey: "2026-09-29", label: "mar, 29/09" } as const;
  const thursday = { kind: "date", dayKey: "2026-10-01", label: "jue, 01/10" } as const;

  /** Proyecto → Fecha, como el recorrido 11. */
  const byProjectAndDate: ReportGroup[] = [
    {
      kind: "project",
      project: { id: P1, name: "P1", color: "teal" },
      client: null,
      seconds: 5_400,
      children: [
        { ...tuesday, seconds: 3_600 },
        { ...thursday, seconds: 1_800 },
      ],
    },
    {
      kind: "project",
      project: { id: P2, name: "P2", color: "red" },
      client: null,
      seconds: 2_700,
      children: [{ ...tuesday, seconds: 2_700 }],
    },
  ];

  /** Lo mismo con el segundo nivel cortado por el tope: sin `children`. */
  const cut: ReportGroup[] = byProjectAndDate.map((group) => ({
    ...group,
    children: undefined,
  }));

  function renderTree(overrides: Partial<ReportReadyState>): string {
    return render({
      groupBy: "project",
      subgroups: ["date"],
      levelsShown: 2,
      groups: byProjectAndDate,
      totalSeconds: 8_100,
      ...overrides,
    });
  }

  it("la primera pintura muestra solo el primer nivel, contraído", () => {
    const markup = renderTree({});
    expect(bodyRows(markup)).toEqual([
      ["P1", "1:30"],
      ["P2", "0:45"],
    ]);
    expect(markup).not.toContain("mar, 29/09");
  });

  it("cada grupo con hijos lleva un botón con aria-expanded=false, el chevrón oculto y su nombre", () => {
    const markup = renderTree({});
    const buttons = [...markup.matchAll(/<button ([^>]*)>(.*?)<\/button>/g)];
    expect(buttons).toHaveLength(2);
    for (const [, attributes, content] of buttons) {
      expect(attributes).toContain('type="button"');
      expect(attributes).toContain('aria-expanded="false"');
      expect(attributes).not.toContain("aria-controls");
      expect(content).toMatch(/^<svg[^>]*aria-hidden="true"/);
    }
    expect(buttons.map(([, , content]) => content.replace(/<[^>]+>/g, ""))).toEqual([
      "P1",
      "P2",
    ]);
    expect(markup).toMatch(/<th scope="row"[^>]*><span[^>]*><button /);
  });

  it("con el segundo nivel cortado, ninguna fila lleva botón", () => {
    const markup = renderTree({ groups: cut, levelsShown: 1 });
    expect(bodyRows(markup)).toEqual([
      ["P1", "1:30"],
      ["P2", "0:45"],
    ]);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("aria-expanded");
  });

  it("el encabezado une los rótulos de los niveles que se muestran", () => {
    expect(renderTree({})).toMatch(/<th scope="col"[^>]*>Proyecto \/ Fecha<\/th>/);
    expect(
      renderTree({
        subgroups: ["date", "tag"],
        levelsShown: 3,
      }),
    ).toMatch(/<th scope="col"[^>]*>Proyecto \/ Fecha \/ Etiqueta<\/th>/);
    expect(renderTree({ groups: cut, levelsShown: 1 })).toMatch(
      /<th scope="col"[^>]*>Proyecto<\/th>/,
    );
  });

  it("la línea del tope, encima de la tabla, solo si se muestran menos niveles que los pedidos", () => {
    const limit =
      "El reporte pasa de 3000 filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.";
    const markup = renderTree({ groups: cut, levelsShown: 1 });
    expect(markup).toContain(limit);
    expect(markup.indexOf(limit)).toBeLessThan(markup.indexOf("<table"));
    expect(renderTree({ subgroups: ["date", "tag"], levelsShown: 2 })).toContain(limit);
    expect(renderTree({})).not.toContain(limit);
    expect(render({})).not.toContain(limit);
  });

  it("la línea de la etiqueta con la etiqueta en el segundo nivel, y no si ese nivel quedó cortado", () => {
    const overlap = "Una entrada con varias etiquetas suma en cada una";
    expect(renderTree({ subgroups: ["tag"] })).toContain(overlap);
    expect(renderTree({ subgroups: ["date", "tag"], levelsShown: 3 })).toContain(overlap);
    expect(renderTree({ subgroups: ["tag"], groups: cut, levelsShown: 1 })).not.toContain(
      overlap,
    );
    expect(renderTree({ subgroups: ["date", "tag"], levelsShown: 2 })).not.toContain(
      overlap,
    );
    expect(renderTree({})).not.toContain(overlap);
  });
});
