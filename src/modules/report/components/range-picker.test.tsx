import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DateRange } from "react-day-picker";
import { afterEach, describe, expect, it, vi } from "vitest";

import type * as CalendarModule from "@/components/ui/calendar";
import {
  NO_REPORT_FILTERS,
  reportMessages,
  type ReportFilters,
  type ReportGrouping,
  type ReportRange,
  type ReportShortcut,
} from "@/modules/report/schema";

import { applySelection, selectionOf } from "./range-picker-model";
import { RangePanel } from "./range-picker";
import { reportHref } from "./report-href";

/**
 * El clic sobre un día, con la lógica de selección de `react-day-picker` y los
 * props que el selector le pasa al calendario: la unidad corre sin DOM, así
 * que el `select` del calendario dibujado se llama desde el test.
 */
const calendar = vi.hoisted(() => ({
  select: (day: Date): DateRange | undefined => {
    throw new Error(
      `El calendario no se dibujó antes del clic en ${day.toDateString()}.`,
    );
  },
}));

vi.mock("@/components/ui/calendar", async (importOriginal) => {
  const original = await importOriginal<typeof CalendarModule>();
  const { useDayPicker } = await import("react-day-picker");
  // `select` solo reenvía el evento a `onSelect`, que el test no mira.
  const click = {} as MouseEvent;
  function SelectProbe() {
    const { select } = useDayPicker<{ mode: "range" }>();
    calendar.select = (day) => select?.(day, {}, click);
    return null;
  }
  return {
    ...original,
    Calendar: (props: Parameters<typeof original.Calendar>[0]) =>
      createElement(original.Calendar, { ...props, footer: createElement(SelectProbe) }),
  };
});

function day(key: string): Date {
  const [year, month, date] = key.split("-").map(Number);
  return new Date(year, month - 1, date);
}

/** Los atajos del jueves 2026-10-08 con el lunes como primer día (D-R2b-2). */
const SHORTCUTS: readonly ReportShortcut[] = [
  { id: "today", label: "Hoy", range: { first: "2026-10-08", last: "2026-10-08" } },
  { id: "yesterday", label: "Ayer", range: { first: "2026-10-07", last: "2026-10-07" } },
  {
    id: "thisWeek",
    label: "Esta semana",
    range: { first: "2026-10-05", last: "2026-10-11" },
  },
  {
    id: "lastWeek",
    label: "Semana anterior",
    range: { first: "2026-09-28", last: "2026-10-04" },
  },
  {
    id: "lastTwoWeeks",
    label: "Últimas dos semanas",
    range: { first: "2026-09-28", last: "2026-10-11" },
  },
  {
    id: "thisMonth",
    label: "Este mes",
    range: { first: "2026-10-01", last: "2026-10-31" },
  },
  {
    id: "lastMonth",
    label: "Mes pasado",
    range: { first: "2026-09-01", last: "2026-09-30" },
  },
  {
    id: "thisYear",
    label: "Este año",
    range: { first: "2026-01-01", last: "2026-12-31" },
  },
  {
    id: "lastYear",
    label: "Año pasado",
    range: { first: "2025-01-01", last: "2025-12-31" },
  },
];

type PanelOptions = {
  readonly error?: string | null;
  readonly shortcuts?: readonly ReportShortcut[];
  readonly range?: ReportRange;
  readonly grouping?: ReportGrouping;
  readonly filters?: ReportFilters;
};

const BY_PERSON: ReportGrouping = { groupBy: "person", subgroups: [] };
const BY_PROJECT: ReportGrouping = { groupBy: "project", subgroups: [] };

function renderPanel(
  selection: DateRange | undefined,
  {
    error = null,
    shortcuts = SHORTCUTS,
    range = { first: "2026-10-05", last: "2026-10-11" },
    grouping = BY_PERSON,
    filters = NO_REPORT_FILTERS,
  }: PanelOptions = {},
): string {
  return renderToStaticMarkup(
    <RangePanel
      selection={selection}
      month={selection?.from}
      todayKey="2026-10-08"
      error={error}
      shortcuts={shortcuts}
      range={range}
      grouping={grouping}
      filters={filters}
      onSelect={() => undefined}
      onApply={() => undefined}
      onShortcut={() => undefined}
    />,
  );
}

/** Los enlaces de la lista «Atajos», en orden; `null` si no hay lista. */
function shortcutLinks(
  markup: string,
): { label: string; href: string; current: string | null }[] | null {
  const list = /<ul aria-label="Atajos"[^>]*>(.*?)<\/ul>/.exec(markup)?.[1];
  if (list === undefined) {
    return null;
  }
  return [...list.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attributes, label]) => ({
    label,
    href: (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replaceAll("&amp;", "&"),
    current: /aria-current="([^"]*)"/.exec(attributes)?.[1] ?? null,
  }));
}

/** La etiqueta de apertura de «Aplicar». */
function applyButton(markup: string): string {
  return /<button[^>]*>Aplicar<\/button>/.exec(markup)?.[0] ?? "";
}

/** Dibuja el selector con `selection` y hace clic en `key`: lo que queda elegido. */
function clickOn(selection: DateRange | undefined, key: string): DateRange | undefined {
  renderPanel(selection);
  return calendar.select(day(key));
}

/** Lo que deja «Aplicar» con un período válido: cierra y navega. */
function navigatesTo(href: string) {
  return { open: false, error: null, href };
}

const thisWeek = selectionOf({ first: "2026-10-05", last: "2026-10-11" });

/** Un id de Better Auth: 32 alfanuméricos con mayúsculas. */
const PERSON = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";

const FILTERS: ReportFilters = {
  people: [PERSON],
  clients: ["c1000000-0000-4000-8000-000000000000"],
  projects: ["a2000000-0000-4000-8000-000000000000"],
  withoutProject: true,
};
/** Lo que `FILTERS` escribe en la URL, después de la agrupación. */
const FILTERS_PARAMS =
  `&personas=${PERSON}` +
  "&clientes=c1000000-0000-4000-8000-000000000000" +
  "&proyectos=a2000000-0000-4000-8000-000000000000%2Csin-proyecto";

describe("applySelection, el efecto de «Aplicar»", () => {
  it("sin selección, el selector sigue abierto, sin mensaje y sin navegar", () => {
    expect(applySelection(undefined, BY_PERSON, NO_REPORT_FILTERS)).toEqual({
      open: true,
      error: null,
      href: null,
    });
    expect(applySelection({ from: undefined }, BY_PERSON, NO_REPORT_FILTERS)).toEqual({
      open: true,
      error: null,
      href: null,
    });
  });

  it("con 367 días, sigue abierto con el mensaje de RP-34 y sin navegar", () => {
    expect(
      applySelection(
        { from: day("2025-10-01"), to: day("2026-10-02") },
        BY_PERSON,
        NO_REPORT_FILTERS,
      ),
    ).toEqual({ open: true, error: reportMessages.rangeTooLong, href: null });
  });

  it("con un período válido, navega con los subniveles (D-R3-8)", () => {
    expect(
      applySelection(
        { from: day("2026-09-01"), to: day("2026-09-30") },
        { groupBy: "tag", subgroups: ["person"] },
        NO_REPORT_FILTERS,
      ),
    ).toEqual(
      navigatesTo(
        "/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=etiqueta&subagrupar=persona",
      ),
    );
  });

  it("con un período válido, navega con los filtros (D-R4-10)", () => {
    expect(
      applySelection(
        { from: day("2026-09-01"), to: day("2026-09-30") },
        BY_PROJECT,
        FILTERS,
      ),
    ).toEqual(
      navigatesTo(
        `/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=proyecto${FILTERS_PARAMS}`,
      ),
    );
  });

  it("con 366 días, cierra y navega", () => {
    expect(
      applySelection(
        { from: day("2025-10-02"), to: day("2026-10-02") },
        BY_PERSON,
        NO_REPORT_FILTERS,
      ),
    ).toEqual(navigatesTo("/reportes?desde=2025-10-02&hasta=2026-10-02&agrupar=persona"));
  });
});

describe("RangePicker", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("el mensaje de RP-34 se ve en la región de alerta", () => {
    expect(renderPanel(thisWeek, { error: reportMessages.rangeTooLong })).toMatch(
      /<p role="alert"[^>]*>Elegí un período de hasta 366 días\.<\/p>/,
    );
  });

  it("sin mensaje, la región de alerta sigue montada y vacía", () => {
    expect(renderPanel(thisWeek)).toMatch(/<p role="alert"[^>]*><\/p>/);
  });

  it("con el rango actual elegido, un clic y «Aplicar» navegan con desde = hasta en ese día", () => {
    const selection = clickOn(thisWeek, "2026-09-30");
    expect(applySelection(selection, BY_PROJECT, NO_REPORT_FILTERS)).toEqual(
      navigatesTo("/reportes?desde=2026-09-30&hasta=2026-09-30&agrupar=proyecto"),
    );
  });

  it("con el rango actual elegido, dos clics fuera de él arman el rango entre esos dos días", () => {
    const first = clickOn(thisWeek, "2026-10-20");
    const second = clickOn(first, "2026-10-25");
    expect(applySelection(second, BY_PERSON, NO_REPORT_FILTERS)).toEqual(
      navigatesTo("/reportes?desde=2026-10-20&hasta=2026-10-25&agrupar=persona"),
    );
  });

  it("con el segundo clic anterior al primero, los extremos se invierten", () => {
    const first = clickOn(thisWeek, "2026-10-25");
    const second = clickOn(first, "2026-10-20");
    expect(applySelection(second, BY_PERSON, NO_REPORT_FILTERS)).toEqual(
      navigatesTo("/reportes?desde=2026-10-20&hasta=2026-10-25&agrupar=persona"),
    );
  });

  it("con un período de un día, un clic en ese día deja «Aplicar» sin efecto", () => {
    const oneDay = selectionOf({ first: "2026-10-08", last: "2026-10-08" });
    const selection = clickOn(oneDay, "2026-10-08");
    expect(applySelection(selection, BY_PERSON, NO_REPORT_FILTERS)).toEqual({
      open: true,
      error: null,
      href: null,
    });
    expect(applyButton(renderPanel(selection))).toContain('aria-disabled="true"');
  });

  it("con algo elegido, «Aplicar» no lleva aria-disabled", () => {
    expect(applyButton(renderPanel(thisWeek))).not.toContain('aria-disabled="');
  });

  it("el calendario marca hoy con el día de quien mira y nombra los meses en español", () => {
    // El reloj del proceso en otro mes: la marca sale de `todayKey`, no del navegador.
    vi.setSystemTime(new Date(2026, 2, 15, 12));
    const markup = renderPanel(thisWeek);
    expect(markup.match(/data-today="true"/g)).toHaveLength(1);
    expect(markup).toMatch(/data-day="2026-10-08"[^>]*data-today="true"/);
    expect(markup).toContain('aria-label="Mes anterior"');
    expect(markup).toContain('aria-label="Mes siguiente"');
    expect(markup).toContain("octubre 2026");
  });
});

describe("RangePanel, los atajos (RP-20, D-R2b-10)", () => {
  it("la lista «Atajos» tiene los rótulos de `shortcuts` en orden, antes del calendario", () => {
    const markup = renderPanel(thisWeek);
    expect(shortcutLinks(markup)?.map(({ label }) => label)).toEqual(
      SHORTCUTS.map(({ label }) => label),
    );
    expect(markup.indexOf('aria-label="Atajos"')).toBeLessThan(
      markup.indexOf('aria-label="Mes anterior"'),
    );
  });

  it("cada atajo lleva a su rango con la agrupación recibida", () => {
    const grouping: ReportGrouping = { groupBy: "client", subgroups: [] };
    const found = shortcutLinks(renderPanel(thisWeek, { grouping }));
    expect(found?.map(({ href }) => href)).toEqual(
      SHORTCUTS.map(({ range }) =>
        reportHref({ range, ...grouping, filters: NO_REPORT_FILTERS }),
      ),
    );
    expect(found?.[6].href).toBe(
      "/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=cliente",
    );
  });

  it("cada atajo conserva los subniveles (D-R3-8)", () => {
    const found = shortcutLinks(
      renderPanel(thisWeek, {
        grouping: { groupBy: "project", subgroups: ["date", "tag"] },
      }),
    );
    expect(found?.[6].href).toBe(
      "/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=proyecto&subagrupar=fecha%2Cetiqueta",
    );
    expect(
      found?.every(({ href }) => href.endsWith("&subagrupar=fecha%2Cetiqueta")),
    ).toBe(true);
  });

  it("cada atajo conserva los filtros (D-R4-10)", () => {
    const found = shortcutLinks(
      renderPanel(thisWeek, { grouping: BY_PROJECT, filters: FILTERS }),
    );
    expect(found?.[6].href).toBe(
      `/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=proyecto${FILTERS_PARAMS}`,
    );
    expect(found?.every(({ href }) => href.endsWith(FILTERS_PARAMS))).toBe(true);
  });

  it("solo el atajo del período que se ve lleva aria-current", () => {
    const found = shortcutLinks(
      renderPanel(thisWeek, { range: { first: "2026-09-01", last: "2026-09-30" } }),
    );
    expect(found?.filter(({ current }) => current !== null)).toEqual([
      {
        label: "Mes pasado",
        href: "/reportes?desde=2026-09-01&hasta=2026-09-30&agrupar=persona",
        current: "true",
      },
    ]);
  });

  it("un período que no es de ningún atajo no marca ninguno", () => {
    // Empieza con «Este mes» pero termina antes: no es él.
    const found = shortcutLinks(
      renderPanel(thisWeek, { range: { first: "2026-10-01", last: "2026-10-30" } }),
    );
    expect(found).toHaveLength(SHORTCUTS.length);
    expect(found?.every(({ current }) => current === null)).toBe(true);
  });

  it("sin atajos no hay lista", () => {
    const markup = renderPanel(thisWeek, { shortcuts: [] });
    expect(shortcutLinks(markup)).toBeNull();
    expect(markup).not.toContain("<ul");
    expect(markup).toContain('aria-label="Mes anterior"');
  });
});
