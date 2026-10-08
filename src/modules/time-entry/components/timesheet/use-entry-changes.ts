"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";

import { deleteEntry, updateEntry } from "@/modules/time-entry/actions";
import type { TimesheetState } from "@/modules/time-entry/schema";

import {
  changingOf,
  entryChanger,
  entryChangesReducer,
  NO_ENTRY_CHANGES,
  sendingEntriesOf,
  type EntryChangeFailure,
  type EntryChangeRequest,
  type EntryChangesState,
} from "./entry-changes";

export type EntryChanges = {
  /** Lo que recibe la lista, que calcula adentro sus entradas inactivas (A15). */
  readonly state: EntryChangesState;
  /** Las celdas con un pedido que la foto todavía no trae: ocupadas (§5.3). */
  readonly changing: ReadonlySet<string>;
  /** Las entradas con un pedido en vuelo o en cola: el `pending` del editor. */
  readonly sending: ReadonlySet<string>;
  /** La última falla, con su pedido: lo que dice el aviso y reenvía «Reintentar». */
  readonly failure: EntryChangeFailure | null;
  readonly save: (request: EntryChangeRequest & { readonly kind: "save" }) => void;
  readonly remove: (request: EntryChangeRequest & { readonly kind: "delete" }) => void;
  readonly retry: () => void;
  readonly dismiss: () => void;
};

/**
 * Los pedidos del detalle de una celda (§5.4, D13b-3), como `useCellWrites`:
 * estado propio y la action fuera de toda transición, así el editor se cierra
 * con su propia respuesta y la celda queda ocupada hasta que llega la foto.
 * `state` es la foto del servidor tal cual llega; `onSettled` recibe el pedido
 * asentado con lo que la pantalla tenga abierto en ese momento.
 */
export function useEntryChanges(
  state: TimesheetState,
  onSettled: (request: EntryChangeRequest) => void,
): EntryChanges {
  const [changes, dispatch] = useReducer(entryChangesReducer, NO_ENTRY_CHANGES);
  /** El `onSettled` del último dibujo: el pedido se asienta con lo que esté abierto entonces. */
  const settledRef = useRef(onSettled);
  const [changer] = useState(() =>
    entryChanger({ save: updateEntry, remove: deleteEntry }, dispatch),
  );
  const [snapshot, setSnapshot] = useState(state);

  if (snapshot !== state) {
    setSnapshot(state);
    dispatch({ type: "snapshot" });
  }

  useEffect(() => {
    settledRef.current = onSettled;
  });

  const changing = useMemo(() => changingOf(changes), [changes]);
  const sending = useMemo(() => sendingEntriesOf(changes), [changes]);
  const { failure } = changes;

  function send(request: EntryChangeRequest): void {
    void changer.send(request).then((settled) => {
      if (settled) {
        settledRef.current(request);
      }
    });
  }

  return {
    state: changes,
    changing,
    sending,
    failure,
    save: send,
    remove: send,
    retry: () => {
      if (failure !== null) {
        send(failure.request);
      }
    },
    dismiss: () => dispatch({ type: "dismissed" }),
  };
}
