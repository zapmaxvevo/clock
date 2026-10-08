import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { TrackingCatalog } from "@/modules/project/schema";
import type {
  TimeEntryView,
  TimesheetDayView,
  TimesheetState,
} from "@/modules/time-entry/schema";

import { TimesheetToolbar } from "./timesheet-toolbar";
import { TimesheetView } from "./timesheet-view";

// La revalidación y el selector del rango usan el router de Next, que fuera
// de la app no existe; las actions llegan a la base.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined, refresh: () => undefined }),
}));
vi.mock("@/modules/time-entry/actions", () => ({
  setTimesheetCell: vi.fn(),
  removeTimesheetRow: vi.fn(),
  updateEntry: vi.fn(),
  deleteEntry: vi.fn(),
}));

const acme = { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Acme" };
const web = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Web",
  color: "teal",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };

const catalog: TrackingCatalog = {
  canCreateProject: true,
  canCreateTag: true,
  tags: [],
  groups: [
    { client: acme, projects: [{ ...web, tasks: [design], billableByDefault: false }] },
  ],
};

const dates = [
  "2026-09-28",
  "2026-09-29",
  "2026-09-30",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2026-10-04",
];
const shortNames = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const fullNames = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

function days(overrides: Partial<TimesheetDayView> = {}): TimesheetDayView[] {
  return dates.map((date, index) => ({
    date,
    label: `${shortNames[index]}, ${date.slice(8)}/${date.slice(5, 7)}`,
    fullLabel: `${fullNames[index]} ${date.slice(8)}/${date.slice(5, 7)}`,
    isToday: date === "2026-10-01",
    isWeekend: index >= 5,
    beforeFloor: false,
    closedSeconds: date === "2026-09-30" ? 5_400 : 0,
    ...overrides,
  }));
}

/** Las dos entradas del 30/09 de Web: Diseño, las de `entryIds`, que suman `5_400`. */
function designEntry(
  id: string,
  start: string,
  end: string,
  seconds: number,
): TimeEntryView {
  return {
    id,
    description: "",
    startedAt: `2026-09-30T${start}:00.000Z`,
    endedAt: `2026-09-30T${end}:00.000Z`,
    dayDate: "2026-09-30",
    weekStart: "2026-09-28",
    startLabel: start,
    endLabel: end,
    startClock: start,
    endClock: end,
    extraDays: 0,
    durationSeconds: seconds,
    durationLabel: `0:${String(seconds / 60).padStart(2, "0")}`,
    editableTimes: true,
    project: web,
    task: design,
    billable: false,
    tags: [],
  };
}

const state: TimesheetState = {
  todayKey: "2026-10-01",
  canTrack: true,
  weekStart: "2026-09-28",
  weekLabel: "Esta semana",
  previousStart: "2026-09-21",
  nextStart: "2026-10-05",
  currentStart: "2026-09-28",
  days: days(),
  rows: [
    {
      project: web,
      task: design,
      client: acme,
      cells: [{ date: "2026-09-30", closedSeconds: 5_400, entryCount: 2 }],
      closedSeconds: 5_400,
      entryIds: [
        "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3",
        "8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4",
      ],
    },
  ],
  closedSeconds: 5_400,
  storageKey: "clock:planilla:w:u",
  serverNow: "2026-10-01T15:00:00.000Z",
  minDayKey: "2000-01-01",
  entries: [
    designEntry("7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3", "12:00", "12:45", 2_700),
    designEntry("8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4", "14:00", "14:45", 2_700),
  ],
};

function render(overrides: Partial<TimesheetState> = {}): string {
  return renderToStaticMarkup(
    <TrackingCatalogProvider catalog={catalog}>
      <TimesheetView state={{ ...state, ...overrides }} />
    </TrackingCatalogProvider>,
  );
}

/** El texto visible, sin etiquetas. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

function inputsOf(markup: string): string[] {
  return markup.match(/<input[^>]*>/g) ?? [];
}

describe("TimesheetView, la grilla (§5.4)", () => {
  it("es una tabla nombrada por el título, con encabezados de columna con `scope`", () => {
    const markup = render();

    expect(markup).toContain('<table aria-labelledby="planilla-titulo"');
    expect(markup).toMatch(/<th scope="col"[^>]*>Proyectos<\/th>/);
    expect(markup).toMatch(/<th scope="col"[^>]*>lun, 28\/09<\/th>/);
    expect(markup).toMatch(/<th scope="col"[^>]*>Total<\/th>/);
    expect(markup).toMatch(
      /<th scope="col"[^>]*><span class="sr-only">Acciones<\/span><\/th>/,
    );
  });

  it('la columna de hoy lleva `aria-current="date"`, y ninguna otra (TS-08)', () => {
    const markup = render();

    expect(markup.match(/aria-current="date"/g)).toHaveLength(1);
    expect(markup).toMatch(/<th scope="col" aria-current="date"[^>]*>jue, 01\/10<\/th>/);
  });

  it("cada fila tiene su encabezado con el nombre y el cliente (TS-13)", () => {
    const markup = render();

    expect(markup).toMatch(/<th scope="row"[^>]*>.*Web: Diseño.*Acme.*<\/th>/);
  });

  it("cada celda que se escribe se nombra por su fila y su día (TS-100)", () => {
    const names = inputsOf(render()).map(
      (input) => /aria-label="([^"]*)"/.exec(input)?.[1],
    );

    expect(names).toEqual(
      fullNames.map(
        (day, index) =>
          `Web: Diseño, ${day} ${dates[index].slice(8)}/${dates[index].slice(5, 7)}`,
      ),
    );
  });

  it("el pie nombra sus totales con «Total» y el total en cero va en gris (TS-45)", () => {
    const markup = render();
    const footer = /<tfoot>.*<\/tfoot>/.exec(markup)?.[0] ?? "";

    expect(footer).toMatch(/<th scope="row"[^>]*>Total<\/th>/);
    expect(textOf(footer)).toBe("Total0:000:001:300:000:000:000:001:30");
    expect(footer.match(/text-muted-foreground/g)).toHaveLength(6);
  });

  it("la fila con entradas tiene su X nombrada por la fila (TS-52) y su total", () => {
    const markup = render();

    expect(markup).toContain('aria-label="Quitar fila Web: Diseño"');
    expect(markup).toMatch(/>1:30<\/td>/);
  });

  it("«Añadir nueva fila» va debajo de la grilla", () => {
    expect(render()).toMatch(
      /<\/table><\/div><div><button[^>]*>.*Añadir nueva fila<\/button>/,
    );
  });

  it("la región de los avisos está montada, vacía y sin rol propio sin ninguna falla (§5.9)", () => {
    const markup = render();

    expect(markup).toContain('<div class="flex flex-col gap-2 empty:hidden"></div>');
    expect(markup).not.toContain('role="alert"');
  });
});

describe("TimesheetView, los estados (§5.10)", () => {
  it("sin filas, el cuerpo dice que no hay horas y siguen el pie y «Añadir nueva fila» (TS-87)", () => {
    const markup = render({
      rows: [],
      days: days({ closedSeconds: 0 }),
      closedSeconds: 0,
    });

    expect(markup).toContain(
      '<td colSpan="10" class="text-muted-foreground px-2 py-6 text-center">No hay horas cargadas esta semana</td>',
    );
    expect(markup).toContain("<tfoot>");
    expect(markup).toContain("Añadir nueva fila");
  });

  it("sin `canTrack`, los valores son texto, sin «Añadir nueva fila» ni «Quitar fila» (TS-76, TS-94)", () => {
    const markup = render({ canTrack: false });

    expect(inputsOf(markup)).toEqual([]);
    expect(markup).not.toContain("Añadir nueva fila");
    expect(markup).not.toContain("Quitar fila");
    expect(markup).toMatch(/>1:30<\/span><\/td>/);
  });

  it("sin `canTrack`, la celda con entradas no tiene menú; con él, sí (TS-76, D13b-4)", () => {
    const name = "Acciones de la celda Web: Diseño, miércoles 30/09";

    expect(render({ canTrack: false })).not.toContain("Acciones de la celda");
    expect(render()).toContain(`aria-label="${name}"`);
    expect(render().match(/Acciones de la celda/g)).toHaveLength(1);
  });

  it("una semana entera anterior al piso no tiene celdas que se escriban ni «Añadir nueva fila» (TS-90)", () => {
    const markup = render({ days: days({ beforeFloor: true }) });

    expect(inputsOf(markup)).toEqual([]);
    expect(markup).not.toContain("Añadir nueva fila");
  });

  it("con algún día desde el piso, solo esos se escriben", () => {
    const markup = render({
      days: days().map((day) => ({ ...day, beforeFloor: day.date < "2026-10-01" })),
    });

    expect(inputsOf(markup)).toHaveLength(4);
    expect(markup).toContain("Añadir nueva fila");
  });
});

describe("TimesheetToolbar (TS-09)", () => {
  function toolbar(overrides: Partial<TimesheetState> = {}): string {
    return renderToStaticMarkup(<TimesheetToolbar state={{ ...state, ...overrides }} />);
  }

  it("las flechas llevan a la semana anterior y a la siguiente", () => {
    const markup = toolbar();

    expect(markup).toMatch(
      /<a aria-label="Semana anterior"[^>]*href="\/planilla\?semana=2026-09-21"/,
    );
    expect(markup).toMatch(
      /<a aria-label="Semana siguiente"[^>]*href="\/planilla\?semana=2026-10-05"/,
    );
    expect(markup).toContain("Elegir fecha: Esta semana");
  });

  it("«Esta semana» aparece solo mirando otra semana, y lleva a la actual", () => {
    expect(textOf(toolbar())).not.toContain("Esta semanaEsta semana");
    expect(toolbar()).not.toContain('href="/planilla?semana=2026-09-28"');

    const other = toolbar({
      weekStart: "2026-09-21",
      weekLabel: "Semana anterior",
      previousStart: "2026-09-14",
      nextStart: "2026-09-28",
    });

    expect(other).toMatch(
      /<a[^>]*href="\/planilla\?semana=2026-09-28"[^>]*>Esta semana<\/a>/,
    );
  });
});
