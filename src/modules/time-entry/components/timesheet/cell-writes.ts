import type { ProjectPair } from "@/lib/project-pair";
import type {
  SetTimesheetCellInput,
  SetTimesheetCellResult,
  TimeEntryErrorCode,
} from "@/modules/time-entry/schema";
import type { ActionResult } from "@/server/action";

import { sendOrUnexpected } from "./send-or-unexpected";

/** Una celda: el día y el par, y cómo nombrarla en el aviso. */
export type CellWriteRequest = {
  readonly input: SetTimesheetCellInput;
  readonly name: string;
};

/** La última falla, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
export type CellWriteFailure = {
  readonly request: CellWriteRequest;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

/**
 * Un pedido que todavía no está en la foto del servidor: `sending` en vuelo o
 * en cola detrás de otra action, `settled` ya aplicado.
 */
type PendingWrite = {
  readonly id: number;
  readonly cell: string;
  readonly minutes: number;
  readonly status: "sending" | "settled";
};

export type CellWritesState = {
  /** En el orden en que se mandaron. */
  readonly pending: readonly PendingWrite[];
  readonly failure: CellWriteFailure | null;
};

export const NO_CELL_WRITES: CellWritesState = { pending: [], failure: null };

export type CellWritesEvent =
  | { readonly type: "sent"; readonly id: number; readonly request: CellWriteRequest }
  | { readonly type: "settled"; readonly id: number }
  | { readonly type: "failed"; readonly id: number; readonly failure: CellWriteFailure }
  /** Llegó otra foto del servidor: ya trae todo lo asentado antes de ella (§5.6). */
  | { readonly type: "snapshot" }
  | { readonly type: "dismissed" };

/** La clave de una fila: `proyecto|tarea`, con los ids como los compara la base. */
export function rowKeyOf(pair: ProjectPair): string {
  return [pair.projectId ?? "-", pair.taskId ?? "-"].join("|").toLowerCase();
}

/** La clave de una celda: `día|proyecto|tarea`. */
export function cellKeyOf(cell: { readonly date: string } & ProjectPair): string {
  return `${cell.date}|${rowKeyOf(cell)}`;
}

export function cellWritesReducer(
  state: CellWritesState,
  event: CellWritesEvent,
): CellWritesState {
  switch (event.type) {
    case "sent": {
      const cell = cellKeyOf(event.request.input);
      const write: PendingWrite = {
        id: event.id,
        cell,
        minutes: event.request.input.minutes,
        status: "sending",
      };
      // Una escritura nueva de la celda que falló reemplaza lo que el aviso
      // contaba; la de otra celda no.
      const failure =
        state.failure !== null && cellKeyOf(state.failure.request.input) === cell
          ? null
          : state.failure;
      return { pending: [...state.pending, write], failure };
    }
    case "settled":
      return {
        ...state,
        pending: state.pending.map((write) =>
          write.id === event.id ? { ...write, status: "settled" } : write,
        ),
      };
    case "failed":
      return {
        pending: state.pending.filter((write) => write.id !== event.id),
        failure: event.failure,
      };
    case "snapshot": {
      const pending = state.pending.filter((write) => write.status === "sending");
      return pending.length === state.pending.length ? state : { ...state, pending };
    }
    case "dismissed":
      return state.failure === null ? state : { ...state, failure: null };
  }
}

/** Lo que muestra cada celda que escribió: los minutos de su último pedido. */
export function shownOf(state: CellWritesState): ReadonlyMap<string, number> {
  return new Map(state.pending.map((write) => [write.cell, write.minutes]));
}

/** Las celdas con algún pedido en vuelo o en cola. */
export function busyOf(state: CellWritesState): ReadonlySet<string> {
  return new Set(
    state.pending
      .filter((write) => write.status === "sending")
      .map((write) => write.cell),
  );
}

export type SetTimesheetCell = (
  input: SetTimesheetCellInput,
) => Promise<ActionResult<SetTimesheetCellResult, TimeEntryErrorCode>>;

export type CellWriter = {
  /**
   * Manda el pedido, salvo que para esa celda ya haya uno en vuelo o en cola
   * con los mismos minutos: Enter y la pérdida del foco que le sigue llegan
   * antes de que React vuelva a dibujar.
   */
  readonly write: (request: CellWriteRequest) => void;
};

/**
 * Las escrituras de la grilla, sin React (§5.6): lleva por celda el último
 * pedido en vuelo o en cola, que `write` mira y actualiza de forma
 * sincrónica, llama a la action fuera de toda transición y avisa cada cambio
 * con `dispatch`.
 */
export function cellWriter(
  send: SetTimesheetCell,
  dispatch: (event: CellWritesEvent) => void,
): CellWriter {
  const inFlight = new Map<string, { readonly id: number; readonly minutes: number }>();
  let lastId = 0;

  function release(cell: string, id: number): void {
    // Solo el pedido que lo puso: uno más nuevo de la misma celda sigue en vuelo.
    if (inFlight.get(cell)?.id === id) {
      inFlight.delete(cell);
    }
  }

  async function deliver(id: number, cell: string, request: CellWriteRequest) {
    const result = await sendOrUnexpected(() => send(request.input));
    release(cell, id);
    if (result.ok) {
      dispatch({ type: "settled", id });
      return;
    }
    dispatch({
      type: "failed",
      id,
      failure: { request, code: result.code, message: result.message },
    });
  }

  function write(request: CellWriteRequest): void {
    const cell = cellKeyOf(request.input);
    if (inFlight.get(cell)?.minutes === request.input.minutes) {
      return;
    }
    lastId += 1;
    const id = lastId;
    inFlight.set(cell, { id, minutes: request.input.minutes });
    dispatch({ type: "sent", id, request });
    void deliver(id, cell, request);
  }

  return { write };
}
