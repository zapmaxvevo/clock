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
