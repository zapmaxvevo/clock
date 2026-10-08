import { describe, expect, it } from "vitest";

import type { TrackingCatalog } from "@/modules/project/schema";
import type {
  TimesheetDayView,
  TimesheetRowView,
  TimesheetState,
} from "@/modules/time-entry/schema";

import { cellKeyOf } from "./cell-writes";
import {
  nextWritableCell,
  timesheetGrid,
  type TimesheetGrid,
  type TimesheetGridInput,
} from "./timesheet-model";

const acme = { id: "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d", name: "Acme" };
const web = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Web",
  color: "teal",
} as const;
const design = { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" };
const app = {
  id: "3c4d5e6f-7a8b-4c9d-8e0f-2a3b4c5d6e7f",
  name: "App",
  color: "blue",
} as const;
const zeta = {
  id: "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f80",
  name: "Zeta",
  color: "red",
} as const;
const archived = {
  id: "5e6f7a8b-9c0d-4e1f-8a2b-4c5d6e7f8091",
  name: "Archivado",
  color: "slate",
} as const;

const catalog: TrackingCatalog = {
  canCreateProject: true,
  canCreateTag: true,
  tags: [],
  groups: [
    {
      client: acme,
      projects: [
        { ...web, tasks: [design], billableByDefault: false },
        { ...zeta, tasks: [], billableByDefault: false },
      ],
    },
    { client: null, projects: [{ ...app, tasks: [], billableByDefault: true }] },
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
const fullNames = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
];

function days(overrides: Partial<Record<string, Partial<TimesheetDayView>>> = {}) {
  return dates.map((date, index): TimesheetDayView => ({
    date,
    label: date,
    fullLabel: `${fullNames[index]} ${date.slice(8)}/${date.slice(5, 7)}`,
    isToday: false,
    isWeekend: index >= 5,
    beforeFloor: false,
    closedSeconds: 0,
    ...overrides[date],
  }));
}

function row(
  project: TimesheetRowView["project"],
  task: TimesheetRowView["task"],
  cells: Record<string, number>,
  client: TimesheetRowView["client"] = null,
): TimesheetRowView {
  const list = Object.entries(cells).map(([date, closedSeconds]) => ({
    date,
    closedSeconds,
    entryCount: 1,
  }));
  return {
    project,
    task,
    client,
    cells: list,
    closedSeconds: list.reduce((sum, cell) => sum + cell.closedSeconds, 0),
    entryIds: list.map((cell) => `${project?.id ?? "none"}:${cell.date}`),
  };
}

const webDesignRow = row(web, design, { "2026-09-29": 5_400 }, acme);
const noProjectRow = row(null, null, { "2026-09-28": 1_800, "2026-09-29": 30 });

const state: TimesheetState = {
  todayKey: "2026-10-01",
  canTrack: true,
  weekStart: "2026-09-28",
  weekLabel: "Esta semana",
  previousStart: "2026-09-21",
  nextStart: "2026-10-05",
  currentStart: "2026-09-28",
  days: days(),
  rows: [webDesignRow, noProjectRow],
  closedSeconds: 7_230,
  storageKey: "clock:planilla:w:u",
};

function grid(overrides: Partial<TimesheetGridInput> = {}): TimesheetGrid {
  return timesheetGrid({
    state,
    catalog,
    stored: [],
    added: [],
    newRow: false,
    removing: [],
    shown: new Map(),
    ...overrides,
  });
}

const pairOf = (project: { id: string } | null, task: { id: string } | null = null) => ({
  projectId: project?.id ?? null,
  taskId: task?.id ?? null,
});

function names(view: TimesheetGrid): string[] {
  return view.rows.map((gridRow) => gridRow.name);
}

describe("timesheetGrid, las filas (TS-15, TS-19)", () => {
  it("dibuja las del servidor en su orden, con sus nombres y el cliente", () => {
    const view = grid();

    expect(names(view)).toEqual(["Web: Diseño", "Sin proyecto"]);
    expect(view.rows[0].client).toEqual(acme);
    expect(view.rows[0].entryIds).toEqual(webDesignRow.entryIds);
  });

  it("las agregadas en esta carga van al final en el orden en que se agregaron, no por nombre", () => {
    const view = grid({ added: [pairOf(zeta), pairOf(app)] });

    expect(names(view)).toEqual(["Web: Diseño", "Sin proyecto", "Zeta", "App"]);
    expect(view.rows[2].client).toEqual(acme);
    expect(view.rows[3].client).toBeNull();
  });

  it("las guardadas de otra carga van antes que las agregadas en esta", () => {
    const view = grid({ stored: [pairOf(zeta), pairOf(app)], added: [pairOf(app)] });

    expect(names(view)).toEqual(["Web: Diseño", "Sin proyecto", "Zeta", "App"]);
  });

  it("una agregada en esta carga que ya tiene entradas sigue abajo, con ellas, y no se repite", () => {
    const view = grid({ added: [pairOf(web, design), pairOf(app)] });

    expect(names(view)).toEqual(["Sin proyecto", "Web: Diseño", "App"]);
    expect(view.rows[1].cells[1].label).toBe("1:30");
  });

  it("una guardada que llegó del servidor con entradas va en su lugar y no se repite", () => {
    expect(names(grid({ stored: [pairOf(web, design)] }))).toEqual([
      "Web: Diseño",
      "Sin proyecto",
    ]);
  });

  it("una guardada o agregada que el catálogo no ofrece no se dibuja", () => {
    const view = grid({
      stored: [pairOf(archived)],
      added: [pairOf(web, { id: "6f7a8b9c-0d1e-4f2a-9b3c-5d6e7f809102" })],
    });

    expect(names(view)).toEqual(["Web: Diseño", "Sin proyecto"]);
  });

  it("la fila nueva va al final, sin par, sin nombre y con sus celdas sin escribir", () => {
    const view = grid({ added: [pairOf(app)], newRow: true });
    const last = view.rows.at(-1);

    expect(last?.pair).toBeNull();
    expect(last?.name).toBe("");
    expect(last?.cells.every((cell) => !cell.writable)).toBe(true);
    expect(last?.total).toEqual({ label: "0:00", zero: true });
  });

  it("sin `canTrack` no dibuja las guardadas, las agregadas ni la fila nueva (TS-76)", () => {
    const view = grid({
      state: { ...state, canTrack: false },
      stored: [pairOf(zeta)],
      added: [pairOf(app)],
      newRow: true,
    });

    expect(names(view)).toEqual(["Web: Diseño", "Sin proyecto"]);
  });

  it("la fila que se está quitando no se dibuja, ni sale del selector", () => {
    const view = grid({ removing: [pairOf(null)] });

    expect(names(view)).toEqual(["Web: Diseño"]);
    expect(view.excluded).toContainEqual(pairOf(null));
  });

  it("el selector excluye los pares de todas las filas", () => {
    const view = grid({ stored: [pairOf(zeta)], added: [pairOf(app)], newRow: true });

    expect(view.excluded).toEqual([
      pairOf(web, design),
      pairOf(null),
      pairOf(zeta),
      pairOf(app),
    ]);
  });
});

describe("timesheetGrid, las celdas (TS-12, TS-21, TS-24)", () => {
  it("una celda vacía no muestra nada y una de cero minutos dice `0:00` (TS-118)", () => {
    const [monday, tuesday, wednesday] = grid().rows[1].cells;

    expect(monday).toMatchObject({ label: "0:30", minutes: 30 });
    expect(tuesday).toMatchObject({ label: "0:00", minutes: 0 });
    expect(wednesday).toMatchObject({ label: "", minutes: null });
  });

  it("cada celda se nombra por su fila y su día (TS-100)", () => {
    expect(grid().rows[0].cells[2].name).toBe("Web: Diseño, miércoles 30/09");
    expect(grid().rows[1].cells[0].name).toBe("Sin proyecto, lunes 28/09");
  });

  it("con permiso y el par ofrecido, todas las celdas se escriben", () => {
    expect(grid().rows[0].cells.every((cell) => cell.writable)).toBe(true);
  });

  it("los días anteriores al piso no se escriben", () => {
    const view = grid({
      state: { ...state, days: days({ "2026-09-28": { beforeFloor: true } }) },
    });

    expect(view.rows[0].cells.map((cell) => cell.writable)).toEqual([
      false,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
  });

  it("sin `canTrack` no se escribe ninguna", () => {
    const view = grid({ state: { ...state, canTrack: false } });

    expect(
      view.rows.flatMap((gridRow) => gridRow.cells).some((cell) => cell.writable),
    ).toBe(false);
  });

  it("de un par que el catálogo no ofrece, solo se escriben las celdas con entradas", () => {
    const view = grid({
      state: { ...state, rows: [row(archived, null, { "2026-09-28": 3_600 })] },
    });

    expect(view.rows[0].cells.map((cell) => cell.writable)).toEqual([
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("muestra lo que pide una escritura que todavía no está en la foto", () => {
    const tuesday = cellKeyOf({ date: "2026-09-29", ...pairOf(web, design) });
    const view = grid({ shown: new Map([[tuesday, 120]]) });

    expect(view.rows[0].cells[1]).toMatchObject({ label: "2:00", minutes: 120 });
  });

  it("las claves de las celdas son las de `cell-writes.ts`", () => {
    expect(grid().rows[0].cells[0].key).toBe(
      cellKeyOf({ date: "2026-09-28", ...pairOf(web, design) }),
    );
  });
});

describe("timesheetGrid, los totales (TS-44 … TS-47)", () => {
  it("suman en segundos y truncan una vez, en los tres", () => {
    const view = grid({
      state: {
        ...state,
        rows: [row(app, null, { "2026-09-28": 90, "2026-09-29": 90 }), noProjectRow],
      },
    });

    expect(view.rows[0].total.label).toBe("0:03");
    expect(view.dayTotals[1].label).toBe("0:02");
    expect(view.weekTotal.label).toBe("0:33");
  });

  it("un total en cero va en gris; uno de 30 segundos también dice `0:00`", () => {
    const view = grid();

    expect(view.dayTotals.map((total) => total.zero)).toEqual([
      false,
      false,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(view.dayTotals[2]).toEqual({ label: "0:00", zero: true });
    expect(view.weekTotal).toEqual({ label: "2:00", zero: false });
  });

  it("cuentan lo que muestran las escrituras, en la fila, el día y la semana", () => {
    const tuesday = cellKeyOf({ date: "2026-09-29", ...pairOf(web, design) });
    const empty = cellKeyOf({ date: "2026-10-01", ...pairOf(app) });
    const view = grid({
      added: [pairOf(app)],
      shown: new Map([
        [tuesday, 120],
        [empty, 45],
      ]),
    });

    expect(view.rows[0].total.label).toBe("2:00");
    expect(view.rows[2].total.label).toBe("0:45");
    expect(view.dayTotals[1].label).toBe("2:00");
    expect(view.dayTotals[3]).toEqual({ label: "0:45", zero: false });
    expect(view.weekTotal.label).toBe("3:15");
  });

  it("la fila que se está quitando sale de los totales", () => {
    const view = grid({ removing: [pairOf(web, design)] });

    expect(view.weekTotal.label).toBe("0:30");
  });

  it("el diálogo usa lo exacto de la foto, no lo que muestran las escrituras", () => {
    const tuesday = cellKeyOf({ date: "2026-09-29", ...pairOf(web, design) });

    expect(grid({ shown: new Map([[tuesday, 120]]) }).rows[0].closedSeconds).toBe(5_400);
  });
});

describe("nextWritableCell (TS-98)", () => {
  it("baja a la celda del mismo día en la próxima fila que la escribe", () => {
    const view = grid({ added: [pairOf(app)] });

    expect(nextWritableCell(view, view.rows[0].key, "2026-09-30")).toBe(
      view.rows[1].cells[2].key,
    );
  });

  it("salta las filas en que ese día no se escribe", () => {
    const view = grid({
      state: {
        ...state,
        rows: [webDesignRow, row(archived, null, { "2026-09-28": 60 }), noProjectRow],
      },
    });

    expect(nextWritableCell(view, view.rows[0].key, "2026-09-30")).toBe(
      view.rows[2].cells[2].key,
    );
    expect(nextWritableCell(view, view.rows[0].key, "2026-09-28")).toBe(
      view.rows[1].cells[0].key,
    );
  });

  it("en la última fila, o sin otra que la escriba, no hay a dónde ir", () => {
    const view = grid({ newRow: true });

    expect(nextWritableCell(view, view.rows[1].key, "2026-09-30")).toBeNull();
  });
});
