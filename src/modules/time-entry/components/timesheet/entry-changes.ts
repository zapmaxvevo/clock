import type {
  DeleteEntryInput,
  DeleteEntryResult,
  TimeEntryErrorCode,
  UpdateEntryInput,
  UpdateEntryResult,
} from "@/modules/time-entry/schema";
import type { ActionResult } from "@/server/action";

import { sendOrUnexpected } from "./send-or-unexpected";

/** Lo que el detalle pide sobre una entrada de la foto, y cómo nombrarla en el aviso. */
export type EntryChangeRequest =
  | {
      readonly kind: "save";
      /** La celda de la entrada en la foto: la que queda ocupada. */
      readonly cell: string;
      readonly name: string;
      readonly input: UpdateEntryInput;
    }
  | {
      readonly kind: "delete";
      readonly cell: string;
      readonly name: string;
      readonly input: DeleteEntryInput;
    };

/** La última falla del detalle, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
export type EntryChangeFailure = {
  readonly request: EntryChangeRequest;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

/** Un pedido que la foto todavía no trae: `sending` en vuelo o en cola, `settled` ya aplicado. */
type PendingChange = {
  readonly id: number;
  readonly cell: string;
  readonly entryId: string;
  readonly status: "sending" | "settled";
};

export type EntryChangesState = {
  /** En el orden en que se mandaron. */
  readonly pending: readonly PendingChange[];
  readonly failure: EntryChangeFailure | null;
};

export const NO_ENTRY_CHANGES: EntryChangesState = { pending: [], failure: null };

export type EntryChangesEvent =
  | { readonly type: "sent"; readonly id: number; readonly request: EntryChangeRequest }
  | { readonly type: "settled"; readonly id: number }
  | { readonly type: "failed"; readonly id: number; readonly failure: EntryChangeFailure }
  /** Llegó otra foto: ya trae todo lo asentado antes de ella. */
  | { readonly type: "snapshot" }
  | { readonly type: "dismissed" };

export function entryChangesReducer(
  state: EntryChangesState,
  event: EntryChangesEvent,
): EntryChangesState {
  switch (event.type) {
    case "sent": {
      const change: PendingChange = {
        id: event.id,
        cell: event.request.cell,
        entryId: event.request.input.id,
        status: "sending",
      };
      // Un pedido nuevo sobre la entrada que falló reemplaza lo que el aviso
      // contaba; el de otra entrada no.
      const failure =
        state.failure !== null && state.failure.request.input.id === change.entryId
          ? null
          : state.failure;
      return { pending: [...state.pending, change], failure };
    }
    case "settled":
      return {
        ...state,
        pending: state.pending.map((change) =>
          change.id === event.id ? { ...change, status: "settled" } : change,
        ),
      };
    case "failed":
      return {
        pending: state.pending.filter((change) => change.id !== event.id),
        failure: event.failure,
      };
    case "snapshot": {
      const pending = state.pending.filter((change) => change.status === "sending");
      return pending.length === state.pending.length ? state : { ...state, pending };
    }
    case "dismissed":
      return state.failure === null ? state : { ...state, failure: null };
  }
}

/** Las celdas con un pedido que la foto todavía no trae, `sending` o `settled`. */
export function changingOf(state: EntryChangesState): ReadonlySet<string> {
  return new Set(state.pending.map((change) => change.cell));
}

/**
 * Las entradas con un pedido que la foto todavía no trae: la lista lo calcula
 * y deja inactivos «Editar» y «Borrar». Con solo `sending`, un guardado
 * asentado habilitaría «Editar» sobre la entrada vieja (A1).
 */
export function changingEntriesOf(state: EntryChangesState): ReadonlySet<string> {
  return new Set(state.pending.map((change) => change.entryId));
}

/** Las entradas con un pedido `sending`: el `pending` del editor. */
export function sendingEntriesOf(state: EntryChangesState): ReadonlySet<string> {
  return new Set(
    state.pending
      .filter((change) => change.status === "sending")
      .map((change) => change.entryId),
  );
}

export type EntryChangeActions = {
  readonly save: (
    input: UpdateEntryInput,
  ) => Promise<ActionResult<UpdateEntryResult, TimeEntryErrorCode>>;
  readonly remove: (
    input: DeleteEntryInput,
  ) => Promise<ActionResult<DeleteEntryResult, TimeEntryErrorCode>>;
};

export type EntryChanger = {
  readonly send: (request: EntryChangeRequest) => void;
};

/**
 * Los pedidos del detalle, sin React (D13b-3): llama a la action fuera de
 * toda transición, avisa cada cambio con `dispatch` y el pedido asentado con
 * `onSettled`.
 */
export function entryChanger(
  actions: EntryChangeActions,
  dispatch: (event: EntryChangesEvent) => void,
  onSettled: (request: EntryChangeRequest) => void,
): EntryChanger {
  let lastId = 0;

  function call(
    request: EntryChangeRequest,
  ): Promise<ActionResult<unknown, TimeEntryErrorCode>> {
    return request.kind === "save"
      ? actions.save(request.input)
      : actions.remove(request.input);
  }

  async function deliver(id: number, request: EntryChangeRequest): Promise<void> {
    const result = await sendOrUnexpected(() => call(request));
    if (!result.ok) {
      dispatch({
        type: "failed",
        id,
        failure: { request, code: result.code, message: result.message },
      });
      return;
    }
    dispatch({ type: "settled", id });
    onSettled(request);
  }

  function send(request: EntryChangeRequest): void {
    lastId += 1;
    const id = lastId;
    dispatch({ type: "sent", id, request });
    void deliver(id, request);
  }

  return { send };
}
