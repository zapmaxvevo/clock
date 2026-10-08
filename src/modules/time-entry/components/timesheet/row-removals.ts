import { samePair, type ProjectPair } from "@/lib/project-pair";
import type {
  RemoveTimesheetRowInput,
  TimeEntryErrorCode,
} from "@/modules/time-entry/schema";

import {
  pendingRequestsReducer,
  type PendingRecord,
  type PendingRequestsEvent,
  type PendingRequestsState,
} from "./pending-requests";

/** La falla de un «Quitar fila», con su pedido para «Reintentar» (TS-92). */
export type RowRemovalFailure = {
  readonly request: RemoveTimesheetRowInput;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

/** Un «Quitar fila» que todavía no está en la foto: su fila no se dibuja (§5.8). */
type PendingRemoval = PendingRecord & {
  /** La semana del pedido: la fila se oculta solo ahí (F2-m1). */
  readonly weekStart: string;
  readonly pair: ProjectPair;
};

export type RowRemovalsState = PendingRequestsState<PendingRemoval, RowRemovalFailure>;

export const NO_ROW_REMOVALS: RowRemovalsState = { pending: [], failure: null };

export type RowRemovalsEvent =
  | PendingRequestsEvent<RemoveTimesheetRowInput, RowRemovalFailure>
  /** Otra semana: sus filas son otras; la falla sigue a la vista (F-m2). */
  | { readonly type: "weekChanged" };

/** El par que borra un pedido. */
export function removalPairOf(request: RemoveTimesheetRowInput): ProjectPair {
  return { projectId: request.projectId, taskId: request.taskId };
}

const pendingRemovalsReducer = pendingRequestsReducer<
  RemoveTimesheetRowInput,
  PendingRemoval,
  RowRemovalFailure
>({
  recordOf: (id, request) => ({
    id,
    weekStart: request.weekStart,
    pair: removalPairOf(request),
    status: "sending",
  }),
  // Como en las celdas: quitar otra vez la fila que falló baja su aviso.
  sameSubject: (sent, failed) => samePair(removalPairOf(sent), removalPairOf(failed)),
});

export function rowRemovalsReducer(
  state: RowRemovalsState,
  event: RowRemovalsEvent,
): RowRemovalsState {
  if (event.type === "weekChanged") {
    return state.pending.length === 0 ? state : { ...state, pending: [] };
  }
  return pendingRemovalsReducer(state, event);
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
