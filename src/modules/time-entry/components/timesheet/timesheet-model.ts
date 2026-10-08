import { samePair, type ProjectPair } from "@/lib/project-pair";
import { projectLabels, projectTaskLabel } from "@/modules/project/components/labels";
import {
  catalogEntryOf,
  isTrackablePair,
} from "@/modules/project/components/picker-model";
import type {
  ClientView,
  ProjectRef,
  TaskView,
  TrackingCatalog,
} from "@/modules/project/schema";
import type { TimesheetRowView, TimesheetState } from "@/modules/time-entry/schema";
import { formatDuration, parseDurationInput } from "@/server/time";

import { cellKeyOf, rowKeyOf } from "./cell-writes";
import { cellLabel } from "./labels";

/** Un total: lo que dice y si es cero, que va en gris (TS-45). */
export type GridTotal = { readonly label: string; readonly zero: boolean };

export type GridCell = {
  /** `día|proyecto|tarea`, la de `cell-writes.ts`. */
  readonly key: string;
  readonly date: string;
  /** Los minutos que muestra; `null` si está vacía (TS-24). */
  readonly minutes: number | null;
  /** Vacío sin entradas; `0:00` con una de cero minutos (TS-118). */
  readonly label: string;
  /**
   * Lo que suma a los totales: exacto de la foto, o los minutos de la
   * escritura que todavía no está en ella. Se formatea una vez, en el total.
   */
  readonly seconds: number;
  readonly writable: boolean;
  /** «{fila}, {día}» (TS-100). */
  readonly name: string;
};

export type GridRow = {
  readonly key: string;
  /** `null`: la fila nueva, sin par elegido todavía (TS-16). */
  readonly pair: ProjectPair | null;
  readonly project: ProjectRef | null;
  readonly task: TaskView | null;
  readonly client: ClientView | null;
  /** «Sin proyecto», «Proyecto» o «Proyecto: Tarea»; vacío en la fila nueva. */
  readonly name: string;
  readonly cells: readonly GridCell[];
  readonly total: GridTotal;
  /** Las entradas que la fila mostraba: las que cuenta y borra «Quitar fila» (D13-6). */
  readonly entryIds: readonly string[];
  /** El total exacto de la foto, ya formateado: lo que dice el diálogo (TS-53). */
  readonly closedTotal: string;
  /**
   * Alguna celda tiene una escritura que todavía no está en la foto, en vuelo
   * o ya aplicada: la fila no se quita hasta que llegue (§5.8), porque ni el
   * diálogo ni la decisión de pedirlo verían esa escritura.
   */
  readonly writing: boolean;
};

export type TimesheetGrid = {
  readonly rows: readonly GridRow[];
  /** En el orden de `state.days` (TS-45). */
  readonly dayTotals: readonly GridTotal[];
  /** TS-46. */
  readonly weekTotal: GridTotal;
  /** Los pares que ya son fila: el selector de la fila nueva no los ofrece (TS-18). */
  readonly excluded: readonly ProjectPair[];
};

export type TimesheetGridInput = {
  readonly state: TimesheetState;
  readonly catalog: TrackingCatalog;
  /** Las filas vacías que guarda el navegador para esta semana (TS-19). */
  readonly stored: readonly ProjectPair[];
  /** Los pares elegidos en esta carga de la página, en el orden en que se eligieron. */
  readonly added: readonly ProjectPair[];
  /** Hay una fila nueva sin par elegido (D13-10). */
  readonly newRow: boolean;
  /** Las filas cuyo «Quitar fila» viaja o ya se aplicó: no se dibujan (§5.8). */
  readonly removing: readonly ProjectPair[];
  /** Lo que muestran las escrituras que todavía no están en la foto (§5.6). */
  readonly shown: ReadonlyMap<string, number>;
};

/** Lo que una fila trae antes de armar sus celdas. */
type RowSource = {
  readonly pair: ProjectPair;
  readonly project: ProjectRef | null;
  readonly task: TaskView | null;
  readonly client: ClientView | null;
  readonly server: TimesheetRowView | null;
};

function totalOf(seconds: number): GridTotal {
  const minutes = Math.floor(seconds / 60);
  return { label: formatDuration(minutes), zero: minutes === 0 };
}

function sumSeconds(cells: readonly GridCell[]): number {
  return cells.reduce((sum, cell) => sum + cell.seconds, 0);
}

/** El par de una fila del servidor. */
export function pairOf(row: TimesheetRowView): ProjectPair {
  return { projectId: row.project?.id ?? null, taskId: row.task?.id ?? null };
}

function hasPair(pairs: readonly ProjectPair[], pair: ProjectPair): boolean {
  return pairs.some((candidate) => samePair(candidate, pair));
}

/** El nombre de una fila, el mismo que el selector da a su opción. */
export function rowNameOf(
  project: { readonly name: string } | null,
  task: TaskView | null,
): string {
  if (project === null) {
    return projectLabels.noProject;
  }
  return task === null ? project.name : projectTaskLabel(project.name, task.name);
}

function serverSource(row: TimesheetRowView): RowSource {
  return {
    pair: pairOf(row),
    project: row.project,
    task: row.task,
    client: row.client,
    server: row,
  };
}

/**
 * Una fila sin entradas toma los nombres del catálogo; `null` si el catálogo
 * no ofrece el par, y entonces no se dibuja (D13-7).
 */
function catalogSource(catalog: TrackingCatalog, pair: ProjectPair): RowSource | null {
  if (pair.projectId === null) {
    return pair.taskId === null
      ? { pair, project: null, task: null, client: null, server: null }
      : null;
  }
  const entry = catalogEntryOf(catalog, pair);
  if (entry === null) {
    return null;
  }
  const { client, project, task } = entry;
  return {
    pair,
    project: { id: project.id, name: project.name, color: project.color },
    task,
    client,
    server: null,
  };
}

/**
 * TS-15: las del servidor en su orden; después, en el orden en que se
 * agregaron, las guardadas de cargas anteriores y las agregadas en esta,
 * tengan o no entradas ya. Una guardada que llegó con entradas ya es del
 * servidor; una que el catálogo no ofrece no se dibuja (D13-7).
 */
function rowSources(input: TimesheetGridInput): RowSource[] {
  const { state, catalog, stored, added } = input;
  const serverRows = state.rows.map(serverSource);
  const fromServer = (pair: ProjectPair) =>
    serverRows.find((source) => samePair(source.pair, pair)) ?? null;
  const tail: RowSource[] = [];
  if (state.canTrack) {
    const previous = stored.filter(
      (pair) => !hasPair(added, pair) && fromServer(pair) === null,
    );
    for (const pair of [...previous, ...added]) {
      const source = fromServer(pair) ?? catalogSource(catalog, pair);
      if (
        source !== null &&
        !hasPair(
          tail.map((row) => row.pair),
          pair,
        )
      ) {
        tail.push(source);
      }
    }
  }
  const tailPairs = tail.map((source) => source.pair);
  return [...serverRows.filter((source) => !hasPair(tailPairs, source.pair)), ...tail];
}

/** Se escribe con permiso, desde el piso y con el par ofrecido o con entradas. */
function gridRow(input: TimesheetGridInput, source: RowSource): GridRow {
  const { state, catalog, shown } = input;
  const name = rowNameOf(source.project, source.task);
  const trackable = isTrackablePair(catalog, source.pair);
  const cells = state.days.map((day): GridCell => {
    const key = cellKeyOf({ date: day.date, ...source.pair });
    const server = source.server?.cells.find((cell) => cell.date === day.date) ?? null;
    const pending = shown.get(key);
    const minutes =
      pending ?? (server === null ? null : Math.floor(server.closedSeconds / 60));
    return {
      key,
      date: day.date,
      minutes,
      label: minutes === null ? "" : formatDuration(minutes),
      seconds: pending === undefined ? (server?.closedSeconds ?? 0) : pending * 60,
      writable: state.canTrack && !day.beforeFloor && (server !== null || trackable),
      name: cellLabel(name, day.fullLabel),
    };
  });
  return {
    key: rowKeyOf(source.pair),
    pair: source.pair,
    project: source.project,
    task: source.task,
    client: source.client,
    name,
    cells,
    total: totalOf(sumSeconds(cells)),
    entryIds: source.server?.entryIds ?? [],
    closedTotal: totalOf(source.server?.closedSeconds ?? 0).label,
    writing: cells.some((cell) => shown.has(cell.key)),
  };
}

function newGridRow(state: TimesheetState): GridRow {
  return {
    key: "new",
    pair: null,
    project: null,
    task: null,
    client: null,
    name: "",
    cells: state.days.map((day) => ({
      key: `new|${day.date}`,
      date: day.date,
      minutes: null,
      label: "",
      seconds: 0,
      writable: false,
      name: "",
    })),
    total: totalOf(0),
    entryIds: [],
    closedTotal: totalOf(0).label,
    writing: false,
  };
}

/**
 * La grilla que se dibuja (§5.4): las filas en orden con sus celdas, si se
 * escriben y qué muestran, los totales con lo que muestran las escrituras, y
 * los pares que el selector excluye.
 */
export function timesheetGrid(input: TimesheetGridInput): TimesheetGrid {
  const { state, removing } = input;
  const sources = rowSources(input);
  const rows = sources
    .filter((source) => !hasPair(removing, source.pair))
    .map((source) => gridRow(input, source));
  if (input.newRow && state.canTrack) {
    rows.push(newGridRow(state));
  }
  const dayTotals = state.days.map((_, index) =>
    totalOf(sumSeconds(rows.map((row) => row.cells[index]))),
  );
  const weekSeconds = sumSeconds(rows.flatMap((row) => row.cells));
  return {
    rows,
    dayTotals,
    weekTotal: totalOf(weekSeconds),
    excluded: [...sources.map((source) => source.pair), ...removing],
  };
}

/**
 * TS-98: Enter lleva a la celda escribible del mismo día en la próxima fila
 * que la tenga; `null` si no hay y el foco se queda.
 */
export function nextWritableCell(
  grid: TimesheetGrid,
  rowKey: string,
  date: string,
): string | null {
  const index = grid.rows.findIndex((row) => row.key === rowKey);
  for (const row of grid.rows.slice(index + 1)) {
    const cell = row.cells.find((candidate) => candidate.date === date);
    if (cell?.writable === true) {
      return cell.key;
    }
  }
  return null;
}

export type CellCommit =
  /** No se interpreta, o es cero: la celda vuelve y se marca (TS-27, TS-35, TT-21). */
  | { readonly kind: "rejected" }
  /** Es lo que la celda ya muestra: no sale ningún pedido (TS-36). */
  | { readonly kind: "unchanged"; readonly label: string }
  | { readonly kind: "write"; readonly minutes: number; readonly label: string };

/** Lo que hace el `onCommit` de una celda con el texto confirmado (§5.5). */
export function cellCommit(text: string, shown: number | null): CellCommit {
  const minutes = parseDurationInput(text);
  if (minutes === null || minutes === 0) {
    return { kind: "rejected" };
  }
  const label = formatDuration(minutes);
  return minutes === shown
    ? { kind: "unchanged", label }
    : { kind: "write", minutes, label };
}
