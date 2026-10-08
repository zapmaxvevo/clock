"use client";

import { useMemo, useReducer, useRef, useState } from "react";

import type { ProjectPair } from "@/lib/project-pair";
import { removeTimesheetRow } from "@/modules/time-entry/actions";
import type {
  RemoveTimesheetRowInput,
  TimesheetState,
} from "@/modules/time-entry/schema";

import {
  NO_ROW_REMOVALS,
  removalPairOf,
  removingOf,
  rowRemovalsReducer,
  type RowRemovalFailure,
} from "./row-removals";
import { sendOrUnexpected } from "./send-or-unexpected";
import { withoutStoredRow } from "./stored-rows";
import { updateStoredRows } from "./use-stored-rows";

export type RowRemovals = {
  /** Las filas cuyo «Quitar fila» viaja o ya se aplicó y espera la foto. */
  readonly removing: readonly ProjectPair[];
  /** La última falla, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
  readonly failure: RowRemovalFailure | null;
  readonly remove: (request: RemoveTimesheetRowInput) => void;
  readonly retry: () => void;
  readonly dismiss: () => void;
};

/**
 * «Quitar fila» (§5.8, TS-52 … TS-54), como `useCellWrites`: estado propio y
 * la action fuera de toda transición. Con éxito olvida la fila en el
 * navegador y avisa `onRemoved`; `state` es la foto del servidor tal cual
 * llega, y otra semana descarta lo pendiente pero conserva la falla.
 */
export function useRowRemovals(
  state: TimesheetState,
  onRemoved: (pair: ProjectPair) => void,
): RowRemovals {
  const [removals, dispatch] = useReducer(rowRemovalsReducer, NO_ROW_REMOVALS);
  const [snapshot, setSnapshot] = useState(state);
  const lastId = useRef(0);

  if (snapshot !== state) {
    setSnapshot(state);
    dispatch({
      type: snapshot.weekStart === state.weekStart ? "snapshot" : "weekChanged",
    });
  }

  const removing = useMemo(() => removingOf(removals), [removals]);
  const { failure } = removals;

  async function send(request: RemoveTimesheetRowInput): Promise<void> {
    lastId.current += 1;
    const id = lastId.current;
    dispatch({ type: "sent", id, request });
    const result = await sendOrUnexpected(() => removeTimesheetRow(request));
    if (!result.ok) {
      dispatch({
        type: "failed",
        id,
        failure: { request, code: result.code, message: result.message },
      });
      return;
    }
    dispatch({ type: "settled", id });
    const pair = removalPairOf(request);
    updateStoredRows(state.storageKey, (rows) =>
      withoutStoredRow(rows, request.weekStart, pair),
    );
    onRemoved(pair);
  }

  function remove(request: RemoveTimesheetRowInput): void {
    void send(request);
  }

  return {
    removing,
    failure,
    remove,
    retry: () => {
      if (failure !== null) {
        remove(failure.request);
      }
    },
    dismiss: () => dispatch({ type: "dismissed" }),
  };
}
