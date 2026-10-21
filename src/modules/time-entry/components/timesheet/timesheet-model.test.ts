import { describe, expect, it } from "vitest";

import type { TrackingCatalog } from "@/modules/project/schema";
import type {
  TimeEntryView,
  TimesheetDayView,
  TimesheetRowView,
  TimesheetState,
} from "@/modules/time-entry/schema";

import { cellKeyOf } from "./cell-writes";
import {
  nextWritableCell,
  timesheetGrid,
  writtenSeconds,
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
  clients: [],
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
  serverNow: "2026-10-01T15:00:00.000Z",
  minDayKey: "2000-01-01",
  entries: [],
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
    changing: new Set(),
    format: "compact",
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

    expect(grid({ shown: new Map([[tuesday, 120]]) }).rows[0].closedTotal).toBe("1:30");
    expect(grid().rows[1].closedTotal).toBe("0:30");
  });
});

describe("timesheetGrid, «Quitar fila» (§5.8)", () => {
  const tuesday = cellKeyOf({ date: "2026-09-29", ...pairOf(web, design) });

  it("una fila sin escrituras pendientes se puede quitar", () => {
    expect(grid().rows.map((gridRow) => gridRow.writing)).toEqual([false, false]);
  });

  it("una escritura en vuelo o ya aplicada pero fuera de la foto marca solo su fila", () => {
    const view = grid({ shown: new Map([[tuesday, 120]]) });

    expect(view.rows.map((gridRow) => gridRow.writing)).toEqual([true, false]);
  });

  it("una fila guardada sin entradas con una escritura asentada tampoco se quita sin la foto", () => {
    const empty = cellKeyOf({ date: "2026-10-01", ...pairOf(app) });
    const view = grid({ added: [pairOf(app)], shown: new Map([[empty, 45]]) });

    expect(view.rows[2]).toMatchObject({ name: "App", entryIds: [], writing: true });
  });

  it("la clave de una fila es su par, sin distinguir mayúsculas", () => {
    const upper = grid({
      state: {
        ...state,
        rows: [{ ...webDesignRow, project: { ...web, id: web.id.toUpperCase() } }],
      },
    });

    expect(upper.rows[0].key).toBe(grid().rows[0].key);
    expect(grid().rows[0].key).not.toBe(grid().rows[1].key);
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

/** Una entrada cerrada de la foto; lo que el modelo no mira va fijo. */
function entry(
  id: string,
  dayDate: string,
  startedAt: string,
  project: TimeEntryView["project"],
  task: TimeEntryView["task"] = null,
): TimeEntryView {
  return {
    id,
    description: "",
    startedAt,
    endedAt: startedAt,
    dayDate,
    weekStart: "2026-09-28",
    startLabel: "09:00",
    endLabel: "10:00",
    startClock: "09:00",
    endClock: "10:00",
    extraDays: 0,
    durationSeconds: 3_600,
    durationLabel: "1:00",
    editableTimes: true,
    project,
    task,
    billable: false,
    tags: [],
  };
}

describe("timesheetGrid, las entradas de cada celda (13b, TS-40 … TS-42)", () => {
  const morning = entry("a1", "2026-09-29", "2026-09-29T12:00:00.000Z", web, design);
  // 23:45 del martes en Buenos Aires: en UTC ya es miércoles, y termina el miércoles.
  const lateNight = {
    ...entry("a2", "2026-09-29", "2026-09-30T02:45:00.000Z", web, design),
    endedAt: "2026-09-30T03:15:00.000Z",
    extraDays: 1,
  };
  const noProject = entry("b1", "2026-09-28", "2026-09-28T12:00:00.000Z", null);
  const withEntries = { ...state, entries: [morning, lateNight, noProject] };

  it("reparte las de la foto por su día y su par, en el orden del servidor", () => {
    const view = grid({ state: withEntries });

    expect(view.rows[0].cells[1].entries).toEqual([morning, lateNight]);
    expect(view.rows[1].cells[0].entries).toEqual([noProject]);
  });

  it("la que cruza la medianoche va en su día de inicio, no en el de su instante en UTC", () => {
    const view = grid({ state: withEntries });

    expect(view.rows[0].cells[2].entries).toEqual([]);
  });

  it("las celdas sin entradas, y las de la fila nueva, no tienen ninguna", () => {
    const view = grid({ state: withEntries, newRow: true });

    expect(view.rows[1].cells[1].entries).toEqual([]);
    expect(view.rows.at(-1)?.cells.every((cell) => cell.entries.length === 0)).toBe(true);
  });

  it("los ids de la entrada se comparan como los de la fila, sin distinguir mayúsculas", () => {
    const upper = {
      ...morning,
      project: { ...web, id: web.id.toUpperCase() },
    };
    const view = grid({ state: { ...state, entries: [upper] } });

    expect(view.rows[0].cells[1].entries).toEqual([upper]);
  });
});

describe("timesheetGrid, lo que la foto todavía no trae (13b, D13b-5, §5.3)", () => {
  const tuesday = cellKeyOf({ date: "2026-09-29", ...pairOf(web, design) });

  it("una celda sin escrituras ni pedidos del detalle no está ocupada", () => {
    expect(
      grid()
        .rows.flatMap((gridRow) => gridRow.cells)
        .some((cell) => cell.pending),
    ).toBe(false);
  });

  it("una escritura de la grilla ocupa solo su celda", () => {
    const view = grid({ shown: new Map([[tuesday, 120]]) });

    expect(view.rows[0].cells.map((cell) => cell.pending)).toEqual([
      false,
      true,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("un pedido del detalle ocupa su celda y deja la X de la fila inactiva (F-m3)", () => {
    const view = grid({ changing: new Set([tuesday]) });

    expect(view.rows[0].cells[1].pending).toBe(true);
    expect(view.rows[0].cells[0].pending).toBe(false);
    expect(view.rows.map((gridRow) => gridRow.writing)).toEqual([true, false]);
  });

  it("la fila nueva no está ocupada", () => {
    const view = grid({ newRow: true, changing: new Set([tuesday]) });

    expect(view.rows.at(-1)?.writing).toBe(false);
    expect(view.rows.at(-1)?.cells.some((cell) => cell.pending)).toBe(false);
  });
});

describe("timesheetGrid, los dos formatos de duración (ADR 0029, D-WS2a-5)", () => {
  const sums = {
    ...state,
    rows: [row(app, null, { "2026-09-28": 90, "2026-09-29": 90 }), noProjectRow],
  };

  it("la celda muestra sus segundos con el formato: 30 segundos son `0:00` o `00:00:30`", () => {
    expect(grid().rows[1].cells[1].label).toBe("0:00");
    expect(grid({ format: "full" }).rows[1].cells[1].label).toBe("00:00:30");
  });

  it("los totales suman segundos exactos y truncan una vez, en la unidad del formato", () => {
    const compact = grid({ state: sums });
    const full = grid({ state: sums, format: "full" });

    expect(compact.rows[0].total.label).toBe("0:03");
    expect(full.rows[0].total.label).toBe("00:03:00");
    expect(full.dayTotals[1].label).toBe("00:02:00");
    expect(full.weekTotal.label).toBe("00:33:30");
  });

  it("un total de 30 segundos es gris con el compacto y no con el completo (TS-45)", () => {
    const thirty = { ...state, rows: [row(app, null, { "2026-10-01": 30 })] };

    expect(grid({ state: thirty }).dayTotals[3]).toEqual({ label: "0:00", zero: true });
    expect(grid({ state: thirty, format: "full" }).dayTotals[3]).toEqual({
      label: "00:00:30",
      zero: false,
    });
    expect(grid({ state: thirty, format: "full" }).dayTotals[0]).toEqual({
      label: "00:00:00",
      zero: true,
    });
  });

  it("el diálogo de quitar la fila usa el formato (TS-53)", () => {
    expect(grid({ format: "full" }).rows[1].closedTotal).toBe("00:30:30");
    expect(grid({ format: "full", newRow: true }).rows.at(-1)?.closedTotal).toBe(
      "00:00:00",
    );
  });
});

describe("writtenSeconds (D-WS2a-8)", () => {
  function closed(id: string, seconds: number): TimeEntryView {
    return {
      ...entry(id, "2026-09-28", "2026-09-28T12:00:00.000Z", app),
      durationSeconds: seconds,
    };
  }

  it("sin entradas o con una cerrada, la celda queda en los minutos escritos (TS-29, TS-33)", () => {
    expect(writtenSeconds([], 5)).toBe(300);
    expect(writtenSeconds([closed("a", 100)], 5)).toBe(300);
    expect(writtenSeconds([closed("a", 100)], 1)).toBe(60);
  });

  it("con varias conserva el resto de segundos y mueve la diferencia en minutos (TS-34)", () => {
    const two = [closed("a", 100), closed("b", 100)];

    expect(writtenSeconds(two, 5)).toBe(320);
    expect(writtenSeconds(two, 2)).toBe(140);
    expect(writtenSeconds(two, 3)).toBe(200);
  });

  it("solo cuenta las cerradas, como el servidor", () => {
    const running = { ...closed("r", 100), endedAt: null, durationSeconds: null };

    expect(writtenSeconds([closed("a", 100), running], 5)).toBe(300);
  });
});

describe("timesheetGrid, lo que muestra una escritura en vuelo (D-WS2a-8)", () => {
  const monday = cellKeyOf({ date: "2026-09-28", ...pairOf(app) });

  function at(id: string, dayDate: string, seconds: number): TimeEntryView {
    return {
      ...entry(id, dayDate, `${dayDate}T12:00:00.000Z`, app),
      durationSeconds: seconds,
    };
  }

  it("con el compacto, la fila suma lo que va a dejar el servidor: `0:09`, no `0:08`", () => {
    // A: 100 s y 60 s, `0:02`; B: 100 s y 100 s, `0:03`.
    const example: TimesheetState = {
      ...state,
      rows: [row(app, null, { "2026-09-28": 160, "2026-09-29": 200 })],
      entries: [
        at("a1", "2026-09-28", 100),
        at("a2", "2026-09-28", 60),
        at("b1", "2026-09-29", 100),
        at("b2", "2026-09-29", 100),
      ],
    };
    const view = grid({ state: example, shown: new Map([[monday, 5]]) });

    expect(view.rows[0].cells[0]).toMatchObject({
      minutes: 5,
      label: "0:05",
      seconds: 340,
    });
    expect(view.rows[0].total.label).toBe("0:09");
    expect(view.weekTotal.label).toBe("0:09");
  });

  it("con el completo, una celda de dos entradas queda en `00:05:20` y una de una en `00:05:00`", () => {
    const two: TimesheetState = {
      ...state,
      rows: [row(app, null, { "2026-09-28": 200 })],
      entries: [at("a1", "2026-09-28", 100), at("a2", "2026-09-28", 100)],
    };
    const one: TimesheetState = {
      ...state,
      rows: [row(app, null, { "2026-09-28": 100 })],
      entries: [at("a1", "2026-09-28", 100)],
    };
    const writing = { shown: new Map([[monday, 5]]), format: "full" } as const;

    expect(grid({ state: two, format: "full" }).rows[0].cells[0].label).toBe("00:03:20");
    const twoView = grid({ state: two, ...writing });
    expect(twoView.rows[0].cells[0].label).toBe("00:05:20");
    expect(twoView.rows[0].total.label).toBe("00:05:20");
    expect(twoView.dayTotals[0].label).toBe("00:05:20");
    expect(twoView.weekTotal.label).toBe("00:05:20");
    expect(grid({ state: one, ...writing }).rows[0].cells[0].label).toBe("00:05:00");
  });
});
