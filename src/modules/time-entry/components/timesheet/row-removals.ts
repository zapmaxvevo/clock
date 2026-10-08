import { samePair, type ProjectPair } from "@/lib/project-pair";
import type {
  RemoveTimesheetRowInput,
  TimeEntryErrorCode,
} from "@/modules/time-entry/schema";

/** La falla de un «Quitar fila», con su pedido para «Reintentar» (TS-92). */
export type RowRemovalFailure = {
  readonly request: RemoveTimesheetRowInput;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

/**
 * Un «Quitar fila» que todavía no está en la foto del servidor: `sending` en
 * vuelo o en cola, `settled` ya aplicado. Su fila no se dibuja (§5.8).
 */
type PendingRemoval = {
  readonly id: number;
  /** La semana del pedido: la fila se oculta solo ahí (F2-m1). */
  readonly weekStart: string;
  readonly pair: ProjectPair;
  readonly status: "sending" | "settled";
};

export type RowRemovalsState = {
  readonly pending: readonly PendingRemoval[];
  readonly failure: RowRemovalFailure | null;
};

export const NO_ROW_REMOVALS: RowRemovalsState = { pending: [], failure: null };

export type RowRemovalsEvent =
  | {
      readonly type: "sent";
      readonly id: number;
      readonly request: RemoveTimesheetRowInput;
    }
  | { readonly type: "settled"; readonly id: number }
  | { readonly type: "failed"; readonly id: number; readonly failure: RowRemovalFailure }
  /** Otra foto de la misma semana: ya trae lo que se aplicó antes de ella. */
  | { readonly type: "snapshot" }
  /** Otra semana: sus filas son otras; la falla sigue a la vista (F-m2). */
  | { readonly type: "weekChanged" }
  | { readonly type: "dismissed" };

/** El par que borra un pedido. */
export function removalPairOf(request: RemoveTimesheetRowInput): ProjectPair {
  return { projectId: request.projectId, taskId: request.taskId };
}

export function rowRemovalsReducer(
  state: RowRemovalsState,
  event: RowRemovalsEvent,
): RowRemovalsState {
  switch (event.type) {
    case "sent": {
      const pair = removalPairOf(event.request);
      const removal: PendingRemoval = {
        id: event.id,
        weekStart: event.request.weekStart,
        pair,
        status: "sending",
      };
      // Como en las celdas: quitar otra vez la fila que falló baja su aviso.
      const failure =
        state.failure !== null && samePair(removalPairOf(state.failure.request), pair)
          ? null
          : state.failure;
      return { pending: [...state.pending, removal], failure };
    }
    case "settled":
      return {
        ...state,
        pending: state.pending.map((removal) =>
          removal.id === event.id ? { ...removal, status: "settled" } : removal,
        ),
      };
    case "failed":
      return {
        pending: state.pending.filter((removal) => removal.id !== event.id),
        failure: event.failure,
      };
    case "snapshot": {
      const pending = state.pending.filter((removal) => removal.status === "sending");
      return pending.length === state.pending.length ? state : { ...state, pending };
    }
    case "weekChanged":
      return state.pending.length === 0 ? state : { ...state, pending: [] };
    case "dismissed":
      return state.failure === null ? state : { ...state, failure: null };
  }
}

/**
 * Los pares de las filas que no se dibujan en la semana que se mira. Un
 * pedido de otra semana —un «Reintentar» de su falla, un diálogo confirmado
 * al volver— no oculta la fila del mismo par en esta (F2-m1).
 */
export function removingOf(
  state: RowRemovalsState,
  weekStart: string,
): readonly ProjectPair[] {
  return state.pending
    .filter((removal) => removal.weekStart === weekStart)
    .map((removal) => removal.pair);
}
