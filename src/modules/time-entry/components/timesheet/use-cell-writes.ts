"use client";

import { useMemo, useReducer, useState } from "react";

import { setTimesheetCell } from "@/modules/time-entry/actions";
import type { TimesheetState } from "@/modules/time-entry/schema";

import {
  busyOf,
  cellWriter,
  cellWritesReducer,
  NO_CELL_WRITES,
  shownOf,
  type CellWriteFailure,
  type CellWriteRequest,
} from "./cell-writes";

export type CellWrites = {
  /**
   * Por celda, los minutos de su último pedido que todavía no está en la foto
   * del servidor: en vuelo, en cola o ya aplicado. Es lo que la celda muestra.
   */
  readonly shown: ReadonlyMap<string, number>;
  /** Las celdas con un pedido en vuelo o en cola: las que están `busy`. */
  readonly busy: ReadonlySet<string>;
  /** La última falla, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
  readonly failure: CellWriteFailure | null;
  readonly write: (request: CellWriteRequest) => void;
  readonly retry: () => void;
  readonly dismiss: () => void;
};

/**
 * Las escrituras de la grilla (§5.6, D13-11). El estado es propio, sin
 * `useOptimistic` ni `startTransition`: Next despacha las actions de a una y
 * enreda sus transiciones, así que ni lo que muestra una celda ni su `busy`
 * pueden esperar a que termine una. `state` es la foto del servidor tal cual
 * llega: cuando cambia, lo asentado ya está en ella y sale.
 */
export function useCellWrites(state: TimesheetState): CellWrites {
  const [writes, dispatch] = useReducer(cellWritesReducer, NO_CELL_WRITES);
  // Uno por montaje: lleva lo que está en vuelo por celda entre dibujos.
  const [writer] = useState(() => cellWriter(setTimesheetCell, dispatch));
  const [snapshot, setSnapshot] = useState(state);

  if (snapshot !== state) {
    setSnapshot(state);
    dispatch({ type: "snapshot" });
  }

  const shown = useMemo(() => shownOf(writes), [writes]);
  const busy = useMemo(() => busyOf(writes), [writes]);
  const { failure } = writes;

  function retry(): void {
    if (failure !== null) {
      writer.write(failure.request);
    }
  }

  return {
    shown,
    busy,
    failure,
    write: writer.write,
    retry,
    dismiss: () => dispatch({ type: "dismissed" }),
  };
}
