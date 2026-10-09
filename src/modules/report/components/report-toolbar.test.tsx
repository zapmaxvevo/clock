import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { ReportReadyState } from "@/modules/report/schema";

import { ReportToolbar } from "./report-toolbar";

// El selector del período navega con el router de Next, que fuera de la app no existe.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const thisWeek = { first: "2026-10-05", last: "2026-10-11" };
const lastWeek = { first: "2026-09-28", last: "2026-10-04" };

const state: ReportReadyState = {
  kind: "ready",
  todayKey: "2026-10-08",
  range: lastWeek,
  rangeLabel: "Semana anterior",
  previous: { first: "2026-09-21", last: "2026-09-27" },
  next: thisWeek,
  currentWeek: thisWeek,
  shortcuts: [],
  groupBy: "project",
  scope: "everyone",
  timeZone: "America/Argentina/Buenos_Aires",
  totalSeconds: 0,
  billableSeconds: 0,
  groups: [],
};

function render(overrides: Partial<ReportReadyState> = {}): string {
  return renderToStaticMarkup(<ReportToolbar state={{ ...state, ...overrides }} />);
}

/** Los enlaces de la barra, por su nombre accesible o su texto. */
function links(markup: string): Map<string, { href: string; current: string | null }> {
  return new Map(
    [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes, content]) => {
      const name =
        /aria-label="([^"]*)"/.exec(attributes)?.[1] ?? content.replace(/<[^>]+>/g, "");
      const href = (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replaceAll(
        "&amp;",
        "&",
      );
      const current = /aria-current="([^"]*)"/.exec(attributes)?.[1] ?? null;
      return [name, { href, current }];
    }),
  );
}

/** Los enlaces de «Agrupar por», en orden. */
function groupByLinks(
  markup: string,
): { label: string; href: string; current: string | null }[] {
  const group = /<div role="group"[^>]*>(.*?)<\/div>/.exec(markup)?.[1] ?? "";
  return [...links(group)].map(([label, link]) => ({ label, ...link }));
}

describe("ReportToolbar", () => {
  it("las flechas mueven el período y conservan la agrupación (RP-20)", () => {
    const found = links(render());
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=proyecto",
    );
    expect(found.get("Período siguiente")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("sin destino anterior, no hay «Período anterior»", () => {
    const markup = render({ previous: null });
    expect(markup).not.toContain("Período anterior");
    expect(markup).toContain("Período siguiente");
  });

  it("sin destino siguiente, no hay «Período siguiente»", () => {
    const markup = render({ next: null });
    expect(markup).not.toContain("Período siguiente");
    expect(markup).toContain("Período anterior");
  });

  it("fuera de la semana actual, «Esta semana» lleva a ella con la misma agrupación", () => {
    expect(links(render()).get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto",
    );
  });

  it("en la semana actual no hay «Esta semana»", () => {
    const found = links(render({ range: thisWeek, rangeLabel: "Esta semana" }));
    expect(found.has("Esta semana")).toBe(false);
  });

  it("un período que empieza con la semana actual pero es más largo no es ella", () => {
    const found = links(render({ range: { first: "2026-10-05", last: "2026-10-12" } }));
    expect(found.has("Esta semana")).toBe(true);
  });

  it("la agrupación elegida lleva aria-current y los enlaces conservan el rango (RP-11)", () => {
    const markup = render();
    expect(markup).toMatch(/<div role="group" aria-labelledby="([^"]+)"/);
    const labelId = /<div role="group" aria-labelledby="([^"]+)"/.exec(markup)?.[1];
    expect(markup).toContain(`<span id="${labelId}"`);
    expect(markup).toMatch(new RegExp(`<span id="${labelId}"[^>]*>Agrupar por</span>`));

    expect(groupByLinks(markup)).toEqual([
      {
        label: "Persona",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=persona",
        current: null,
      },
      {
        label: "Proyecto",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=proyecto",
        current: "true",
      },
      {
        label: "Cliente",
        href: "/reportes?desde=2026-09-28&hasta=2026-10-04&agrupar=cliente",
        current: null,
      },
    ]);
  });

  it("por cliente, la marca pasa a «Cliente» y las flechas la conservan", () => {
    const markup = render({ groupBy: "client" });
    expect(groupByLinks(markup).map(({ label, current }) => [label, current])).toEqual([
      ["Persona", null],
      ["Proyecto", null],
      ["Cliente", "true"],
    ]);
    const found = links(markup);
    expect(found.get("Período anterior")?.href).toBe(
      "/reportes?desde=2026-09-21&hasta=2026-09-27&agrupar=cliente",
    );
    expect(found.get("Esta semana")?.href).toBe(
      "/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=cliente",
    );
  });

  it("por persona, la marca pasa a «Persona»", () => {
    const found = links(render({ groupBy: "person" }));
    expect(found.get("Persona")?.current).toBe("true");
    expect(found.get("Proyecto")?.current).toBeNull();
    expect(found.get("Período anterior")?.href).toContain("agrupar=persona");
  });

  it("el botón del período se nombra por lo que muestra", () => {
    expect(render()).toContain('aria-label="Elegir período: Semana anterior"');
  });
});
