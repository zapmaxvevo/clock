import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NO_REPORT_FILTERS,
  type ReportGroup,
  type ReportReadyState,
} from "@/modules/report/schema";
import { bodyRows } from "@/test/markup";

import { REPORT_HEADING_ID, ReportView } from "./report-view";

const week = { first: "2026-10-05", last: "2026-10-11" };

/** Las opciones de los filtros de todos los estados del archivo. */
const filterOptions: ReportReadyState["filterOptions"] = {
  people: null,
  clients: [],
  projects: [],
};

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
  filters: NO_REPORT_FILTERS,
  filterOptions,
  chart: null,
};

function render(overrides: Partial<ReportReadyState>): string {
  return renderToStaticMarkup(<ReportView state={{ ...state, ...overrides }} />);
}

/** El encabezado de cada fila del cuerpo, con sus etiquetas. */
function rowHeadings(markup: string): string[] {
  return [...markup.matchAll(/<th scope="row"[^>]*>(.*?)<\/th>/g)].map(
    ([, heading]) => heading,
  );
}

/** D-R3-6: la línea del tope, cuando un nivel de abajo no entra. */
const ROW_LIMIT =
  "El reporte pasa de 3000 filas con todos sus niveles: se muestran solo los de arriba. Acortá el período o quitá un nivel.";

/** D-R10-10: la fila del primer nivel que no entra. */
const FIRST_LEVEL_LIMIT =
  "El primer nivel pasa de 3000 filas y no se muestra. Acortá el período, filtrá o agrupá por otra cosa.";

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

  it("la tabla es de ancho fijo, con la duración de ancho propio, para que un nombre largo se recorte", () => {
    // En una tabla automática el `truncate` no recorta: un nombre de 100
    // caracteres la llevaba a 809 px en una caja de 270, a 320 px.
    const markup = render({
      groupBy: "client",
      groups: [
        { kind: "client", client: { id: "c1", name: "x".repeat(100) }, seconds: 60 },
      ],
      totalSeconds: 60,
    });
    expect(markup).toMatch(/<table [^>]*class="[^"]*\btable-fixed\b/);
    expect(markup).toMatch(/<th scope="col" class="[^"]*\bw-24\b[^"]*">Duración<\/th>/);
    // Suelto en la celda, el nombre va en bloque: en línea, `truncate` tampoco recorta.
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="block truncate">x{100}<\/span>/,
    );
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
    expect(markup).toMatch(
      /<th scope="row"[^>]*><span class="block truncate">Acme<\/span>/,
    );
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
      /<th scope="row"[^>]*><span class="block truncate">Urgente<\/span><\/th>/,
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

  it.each(["person", "project", "client", "task", "date", "week", "month"] as const)(
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
    const markup = renderTree({ groups: cut, levelsShown: 1 });
    expect(markup).toContain(ROW_LIMIT);
    expect(markup.indexOf(ROW_LIMIT)).toBeLessThan(markup.indexOf("<table"));
    expect(renderTree({ subgroups: ["date", "tag"], levelsShown: 2 })).toContain(
      ROW_LIMIT,
    );
    expect(renderTree({})).not.toContain(ROW_LIMIT);
    expect(render({})).not.toContain(ROW_LIMIT);
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

describe("ReportView por semana y por mes (D-R10-3, §5.2)", () => {
  /** Del miércoles 30/09 al martes 13/10, con lunes: la primera y la última, cortadas. */
  const weeks: ReportGroup[] = [
    {
      kind: "week",
      weekStart: "2026-09-28",
      label: "28/09 – 04/10",
      partial: "30/09 – 04/10",
      seconds: 1_800,
    },
    {
      kind: "week",
      weekStart: "2026-10-05",
      label: "05/10 – 11/10",
      partial: null,
      seconds: 3_600,
    },
    {
      kind: "week",
      weekStart: "2026-10-12",
      label: "12/10 – 18/10",
      partial: "12/10 – 13/10",
      seconds: 900,
    },
  ];

  /** Del 15/08 al 14/10: agosto y octubre cortados, septiembre entero. */
  const months: ReportGroup[] = [
    {
      kind: "month",
      monthStart: "2026-08-01",
      label: "agosto",
      partial: "15/08 – 31/08",
      seconds: 1_200,
    },
    {
      kind: "month",
      monthStart: "2026-09-01",
      label: "septiembre",
      partial: null,
      seconds: 7_200,
    },
    {
      kind: "month",
      monthStart: "2026-10-01",
      label: "octubre",
      partial: "01/10 – 14/10",
      seconds: 2_700,
    },
  ];

  /** El encabezado de la fila `index` del cuerpo, con sus etiquetas. */
  function rowHeading(markup: string, index: number): string {
    return rowHeadings(markup)[index] ?? "";
  }

  it("por semana, el encabezado «Semana» y «solo …» en gris solo en las cortadas", () => {
    const markup = render({
      groupBy: "week",
      range: { first: "2026-09-30", last: "2026-10-13" },
      groups: weeks,
      totalSeconds: 6_300,
    });
    expect(markup).toMatch(/<th scope="col"[^>]*>Semana<\/th>/);
    // En el orden en que llegan: el service ya las ordenó.
    expect(bodyRows(markup)).toEqual([
      ["28/09 – 04/10 solo 30/09 – 04/10", "0:30"],
      ["05/10 – 11/10", "1:00"],
      ["12/10 – 18/10 solo 12/10 – 13/10", "0:15"],
    ]);
    expect(rowHeading(markup, 0)).toBe(
      '<span>28/09 – 04/10 <span class="text-muted-foreground">solo 30/09 – 04/10</span></span>',
    );
    // La semana entera, sin el gris ni «solo».
    expect(rowHeading(markup, 1)).toBe("05/10 – 11/10");
    expect(markup.match(/text-muted-foreground">solo /g)).toHaveLength(2);
    expect(totals(markup).Total).toBe("1:45");
  });

  it("por mes, el encabezado «Mes» y cada mes dentro de <time> con su año y mes", () => {
    const markup = render({
      groupBy: "month",
      range: { first: "2026-08-15", last: "2026-10-14" },
      groups: months,
      totalSeconds: 11_100,
    });
    expect(markup).toMatch(/<th scope="col"[^>]*>Mes<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["agosto solo 15/08 – 31/08", "0:20"],
      ["septiembre", "2:00"],
      ["octubre solo 01/10 – 14/10", "0:45"],
    ]);
    expect(rowHeading(markup, 2)).toBe(
      '<span><time dateTime="2026-10">octubre</time> <span class="text-muted-foreground">solo 01/10 – 14/10</span></span>',
    );
    expect(rowHeading(markup, 1)).toBe('<time dateTime="2026-09">septiembre</time>');
    expect(markup).toContain('<time dateTime="2026-08">agosto</time>');
    expect(totals(markup).Total).toBe("3:05");
  });

  it("Mes → Semana → Fecha: el encabezado une los tres y el «solo …» va dentro del botón", () => {
    const markup = render({
      groupBy: "month",
      subgroups: ["week", "date"],
      levelsShown: 3,
      range: { first: "2026-09-21", last: "2026-10-11" },
      scope: "everyone",
      groups: [
        {
          kind: "month",
          monthStart: "2026-09-01",
          label: "septiembre",
          partial: "21/09 – 30/09",
          seconds: 6_300,
          children: [
            {
              kind: "week",
              weekStart: "2026-09-28",
              label: "28/09 – 04/10",
              partial: "28/09 – 30/09",
              seconds: 6_300,
              children: [
                {
                  kind: "date",
                  dayKey: "2026-09-30",
                  label: "mié, 30/09",
                  seconds: 6_300,
                },
              ],
            },
          ],
        },
        {
          kind: "month",
          monthStart: "2026-10-01",
          label: "octubre",
          partial: "01/10 – 11/10",
          seconds: 1_800,
          children: [
            {
              kind: "week",
              weekStart: "2026-09-28",
              label: "28/09 – 04/10",
              partial: "01/10 – 04/10",
              seconds: 1_800,
              children: [
                {
                  kind: "date",
                  dayKey: "2026-10-01",
                  label: "jue, 01/10",
                  seconds: 1_800,
                },
              ],
            },
          ],
        },
      ],
      totalSeconds: 8_100,
    });
    expect(markup).toMatch(/<th scope="col"[^>]*>Mes \/ Semana \/ Fecha<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["septiembre solo 21/09 – 30/09", "1:45"],
      ["octubre solo 01/10 – 11/10", "0:30"],
    ]);
    // El nombre del botón dice el mes y los días que cuenta.
    expect(
      [...markup.matchAll(/<button [^>]*>(.*?)<\/button>/g)].map(([, content]) =>
        content.replace(/<[^>]+>/g, ""),
      ),
    ).toEqual(["septiembre solo 21/09 – 30/09", "octubre solo 01/10 – 11/10"]);
  });
});

describe("ReportView con filtros (D-R4-7)", () => {
  /** Un id de Better Auth: 32 alfanuméricos con mayúsculas. */
  const PERSON = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
  const filtered: ReportReadyState["filters"] = {
    people: [PERSON],
    clients: ["c1000000-0000-4000-8000-000000000000"],
    projects: [],
    withoutProject: true,
  };

  /** Los enlaces del cuerpo de la tabla, por su texto. */
  function bodyLinks(markup: string): Map<string, string> {
    const body = markup.slice(markup.indexOf("<tbody>"), markup.indexOf("</tbody>"));
    return new Map(
      [...body.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(
        ([, href, label]) => [label, href.replaceAll("&amp;", "&")],
      ),
    );
  }

  it("sin grupos y con filtros, el segundo vacío con «Quitar filtros» al mismo período y agrupación, sin filtros", () => {
    const markup = render({
      groupBy: "project",
      subgroups: ["date", "tag"],
      filters: filtered,
    });
    expect(markup).toContain('<td colSpan="2"');
    expect(bodyRows(markup)).toEqual([
      ["Ninguna entrada coincide con los filtrosQuitar filtros"],
    ]);
    expect(markup).not.toContain("No hay horas en este período");
    expect(bodyLinks(markup)).toEqual(
      new Map([
        [
          "Quitar filtros",
          "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
        ],
      ]),
    );
    expect(totals(markup)).toEqual({ Total: "0:00", Facturable: "0:00" });
  });

  it("«Quitar filtros» es un botón de contorno y el gris es solo del mensaje", () => {
    const markup = render({ filters: filtered });
    const link = /<a [^>]*>Quitar filtros<\/a>/.exec(markup)?.[0] ?? "";
    expect(link).toContain("border-border");
    expect(link).not.toContain("border-transparent");
    expect(link).not.toContain("text-muted-foreground");
    expect(markup).toMatch(
      /<p class="[^"]*text-muted-foreground[^"]*">Ninguna entrada coincide con los filtros<\/p>/,
    );
    expect(markup).not.toMatch(/<td[^>]*text-muted-foreground/);
  });

  it("«Sin proyecto» solo también es un filtro", () => {
    const markup = render({
      filters: { people: [], clients: [], projects: [], withoutProject: true },
    });
    expect(markup).toContain("Ninguna entrada coincide con los filtros");
    expect(bodyLinks(markup).get("Quitar filtros")).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=persona",
    );
  });

  it("las personas solas también son un filtro, y «Quitar filtros» las quita", () => {
    const markup = render({
      filters: { people: [PERSON], clients: [], projects: [], withoutProject: false },
    });
    expect(markup).toContain("Ninguna entrada coincide con los filtros");
    expect(bodyLinks(markup).get("Quitar filtros")).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=persona",
    );
  });

  it("sin grupos y sin filtros, el vacío de R2a, sin «Quitar filtros»", () => {
    const markup = render({});
    expect(bodyRows(markup)).toEqual([["No hay horas en este período"]]);
    expect(markup).not.toContain("Quitar filtros");
    expect(markup).not.toContain("Ninguna entrada coincide con los filtros");
  });

  it("con grupos y filtros, las filas y ningún vacío", () => {
    const markup = render({
      filters: filtered,
      groups: [
        { kind: "person", userId: "u1", name: "Ana", inactive: false, seconds: 3_600 },
      ],
      totalSeconds: 3_600,
    });
    expect(bodyRows(markup)).toEqual([["Ana", "1:00"]]);
    expect(markup).not.toContain("Quitar filtros");
  });
});

describe("ReportView por descripción (D-R10-9, D-R10-10, §5.2, §5.4)", () => {
  const LONG = "Revisión del tablero de soporte ".repeat(4).slice(0, 100);

  function description(id: string, text: string, truncated: boolean, seconds: number) {
    return {
      kind: "description",
      description: { id: id.repeat(32), text, truncated },
      seconds,
    } satisfies ReportGroup;
  }

  it("el encabezado «Descripción», cada texto, «…» solo en el recortado y «Sin descripción» en gris", () => {
    const markup = render({
      groupBy: "description",
      groups: [
        description("a", "Reunión semanal", false, 7_200),
        description("b", LONG, true, 3_600),
        { kind: "description", description: null, seconds: 1_800 },
      ],
      totalSeconds: 12_600,
    });
    expect(markup).toMatch(/<th scope="col"[^>]*>Descripción<\/th>/);
    expect(bodyRows(markup)).toEqual([
      ["Reunión semanal", "2:00"],
      [`${LONG}…`, "1:00"],
      ["Sin descripción", "0:30"],
    ]);
    expect(rowHeadings(markup)).toEqual([
      '<span class="block truncate">Reunión semanal</span>',
      `<span class="block truncate">${LONG}…</span>`,
      '<span class="text-muted-foreground">Sin descripción</span>',
    ]);
    expect(markup.match(/…/g)).toHaveLength(1);
  });

  it("el texto de otra persona sale como texto: `<b>`, `&` y las comillas, escapados", () => {
    const markup = render({
      groupBy: "description",
      scope: "everyone",
      groups: [description("c", '<b>negrita</b> & "comillas"', false, 60)],
      totalSeconds: 60,
    });
    expect(rowHeadings(markup)).toEqual([
      '<span class="block truncate">&lt;b&gt;negrita&lt;/b&gt; &amp; &quot;comillas&quot;</span>',
    ]);
    expect(markup).not.toContain("<b>");
  });

  describe("con el primer nivel cortado (levelsShown: 0)", () => {
    function renderCut(overrides: Partial<ReportReadyState>): string {
      return render({
        groupBy: "description",
        subgroups: ["project", "tag"],
        levelsShown: 0,
        scope: "everyone",
        groups: [],
        totalSeconds: 3_000 * 3_600 + 60,
        billableSeconds: 3_600,
        ...overrides,
      });
    }

    it("una fila en las dos columnas que lo dice, con el encabezado del primer nivel y los totales", () => {
      const markup = renderCut({});
      expect(markup).toMatch(/<th scope="col"[^>]*>Descripción<\/th>/);
      expect(markup).toContain('<td colSpan="2"');
      expect(bodyRows(markup)).toEqual([[FIRST_LEVEL_LIMIT]]);
      expect(markup).not.toContain('<th scope="row"');
      expect(markup).not.toContain("<button");
      expect(totals(markup)).toEqual({ Total: "3000:01", Facturable: "1:00" });
    });

    it("sin la línea del tope de R3 ni ningún vacío, tampoco el de los filtros", () => {
      const markup = renderCut({
        filters: { people: [], clients: [], projects: [], withoutProject: true },
      });
      expect(bodyRows(markup)).toEqual([[FIRST_LEVEL_LIMIT]]);
      expect(markup).not.toContain(ROW_LIMIT);
      expect(markup).not.toContain("Ninguna entrada coincide con los filtros");
      expect(markup).not.toContain("Quitar filtros");
      expect(markup).not.toContain("No hay horas en este período");
    });

    it("por etiqueta, el encabezado «Etiqueta» y sin la línea de la suma, que habla de filas", () => {
      const markup = renderCut({ groupBy: "tag", subgroups: [] });
      expect(markup).toMatch(/<th scope="col"[^>]*>Etiqueta<\/th>/);
      expect(bodyRows(markup)).toEqual([[FIRST_LEVEL_LIMIT]]);
      expect(markup).not.toContain("Una entrada con varias etiquetas suma en cada una");
    });
  });
});

describe("ReportView con gráfico (RP-15, D-R5-6, §5.1)", () => {
  const chart: NonNullable<ReportReadyState["chart"]> = {
    granularity: "date",
    bars: [
      {
        firstDay: "2026-10-05",
        label: "lun, 05/10",
        partial: null,
        tick: "05/10",
        seconds: 3_600,
      },
      {
        firstDay: "2026-10-06",
        label: "mar, 06/10",
        partial: null,
        tick: "06/10",
        seconds: 0,
      },
    ],
  };
  const groups: ReportGroup[] = [
    { kind: "person", userId: "u1", name: "Ana", inactive: false, seconds: 3_600 },
  ];

  it("la figura va después de los totales y antes de la tabla", () => {
    const markup = render({ chart, groups, totalSeconds: 3_600 });
    const figure = markup.indexOf("<figure");
    expect(figure).toBeGreaterThan(markup.indexOf("</dl>"));
    expect(figure).toBeLessThan(
      markup.indexOf(`<table aria-labelledby="${REPORT_HEADING_ID}"`),
    );
    expect(markup).toContain("Horas por día");
  });

  it("sin gráfico, ninguna figura", () => {
    expect(render({ groups, totalSeconds: 3_600 })).not.toContain("<figure");
  });

  it("la línea del tope va después de la figura", () => {
    const markup = render({
      chart,
      groups,
      totalSeconds: 3_600,
      subgroups: ["project"],
      levelsShown: 1,
    });
    expect(markup.indexOf(ROW_LIMIT)).toBeGreaterThan(markup.indexOf("</figure>"));
  });

  it("con el primer nivel cortado y gráfico, la figura y la fila del tope (D-R10-10)", () => {
    const markup = render({
      chart,
      groupBy: "description",
      levelsShown: 0,
      groups: [],
      totalSeconds: 3_600,
    });
    expect(markup).toContain("<figure");
    const table = markup.slice(markup.indexOf("</figure>"));
    expect(bodyRows(table)).toEqual([[FIRST_LEVEL_LIMIT]]);
  });
});
