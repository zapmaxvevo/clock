"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { samePair, type ProjectPair } from "@/lib/project-pair";
import { selectionIds } from "@/modules/project/components/picker-model";
import { useTrackingCatalog } from "@/modules/project/components/tracking-catalog";
import type { ProjectSelection } from "@/modules/project/schema";
import type {
  RemoveTimesheetRowInput,
  TimesheetState,
} from "@/modules/time-entry/schema";

import { useTrackerRefresh } from "../use-tracker-refresh";
import { CellDetailDialogs, useCellDetail } from "./cell-detail";
import { cellKeyOf } from "./cell-writes";
import type { EntryChangeRequest } from "./entry-changes";
import { timesheetLabels } from "./labels";
import { RemoveRowDialog, type RowToRemove } from "./remove-row-dialog";
import {
  prunedStoredRows,
  storedPairsOf,
  withStoredRow,
  withoutStoredRow,
} from "./stored-rows";
import { TimesheetNotices, useLatestNotice } from "./timesheet-notices";
import { TimesheetTable } from "./timesheet-table";
import { nextWritableCell, pairOf, timesheetGrid, type GridRow } from "./timesheet-model";
import { useCellWrites } from "./use-cell-writes";
import { useEntryChanges } from "./use-entry-changes";
import { useRowRemovals } from "./use-row-removals";
import { updateStoredRows, useStoredRows } from "./use-stored-rows";

/** La fila con entradas cuyo diálogo está abierto, como estaba al abrirlo. */
type PendingRemoval = RowToRemove & { readonly request: RemoveTimesheetRowInput };

/**
 * Adónde va el foco después de dibujar: el selector de la fila nueva, una
 * fila, o la celda de un pedido del detalle cuando la foto lo trae (13b, A2).
 */
type PendingFocus =
  | { readonly kind: "picker" }
  | { readonly kind: "row"; readonly pair: ProjectPair }
  | { readonly kind: "cell"; readonly key: string };

/**
 * El dueño de la planilla en el cliente: las escrituras de la grilla (§5.6),
 * las filas agregadas y las que guarda el navegador (§5.7), «Quitar fila»
 * (§5.8), el detalle de una celda (13b), los avisos (§5.9), el foco y la
 * revalidación periódica (TS-97).
 */
export function TimesheetView({ state }: { readonly state: TimesheetState }) {
  useTrackerRefresh();
  const catalog = useTrackingCatalog();
  const writes = useCellWrites(state);
  const changes = useEntryChanges(state, settleDetail);
  const storedRows = useStoredRows(state.storageKey);
  /** Los pares elegidos en esta carga de la página y en esta semana, en orden (TS-15). */
  const [added, setAdded] = useState<readonly ProjectPair[]>([]);
  /** La semana que se mira, para lo que responde después de cambiarla (F2-m1). */
  const weekRef = useRef(state.weekStart);
  const removals = useRowRemovals(state, (pair, weekStart) => {
    // Las filas agregadas son de la semana que se mira: un «Quitar fila» de
    // otra no saca la del mismo par de esta.
    if (weekStart !== weekRef.current) {
      return;
    }
    setAdded((current) => current.filter((candidate) => !samePair(candidate, pair)));
  });
  const [newRow, setNewRow] = useState(false);
  const [confirming, setConfirming] = useState<PendingRemoval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [week, setWeek] = useState(state.weekStart);
  const tableRef = useRef<HTMLTableElement>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /** La X de la fila del diálogo: adonde vuelve el foco al cancelar. */
  const removeButtonRef = useRef<HTMLElement | null>(null);
  /** Adonde va el foco al confirmar: «Añadir nueva fila», o la región sin él. */
  const removalFocusRef = useRef<HTMLElement | null>(null);
  /** Adonde va el foco cuando se dibuje lo que acaba de cambiar. */
  const pendingFocusRef = useRef<PendingFocus | null>(null);
  const cellDetail = useCellDetail({
    state,
    changes,
    destinationOf: cellDestination,
    awaitCell: (key) => {
      pendingFocusRef.current = { kind: "cell", key };
    },
  });
  const screenFailures = {
    cell: writes.failure,
    row: removals.failure,
    detail: cellDetail.screenFailure,
  };

  // Otra semana: las filas agregadas y la fila nueva eran de la anterior. Las
  // escrituras en vuelo y los avisos siguen (F-m2).
  if (week !== state.weekStart) {
    setWeek(state.weekStart);
    setAdded([]);
    setNewRow(false);
  }
  useLatestNotice(screenFailures, {
    cell: writes.dismiss,
    row: removals.dismiss,
    detail: changes.dismiss,
  });

  const grid = timesheetGrid({
    state,
    catalog,
    stored: storedPairsOf(storedRows, state.weekStart),
    added,
    newRow,
    removing: removals.removing,
    shown: writes.shown,
    changing: changes.changing,
  });
  const busy = new Set([...writes.busy, ...changes.changing]);
  const canAddRow = state.canTrack && state.days.some((day) => !day.beforeFloor);

  useEffect(() => {
    weekRef.current = state.weekStart;
  }, [state.weekStart]);

  // TS-19: lo guardado que ya llegó del servidor, o que el catálogo ya no
  // ofrece, se olvida. Sin permiso de carga no se toca: no se dibuja.
  useEffect(() => {
    if (!state.canTrack) {
      return;
    }
    const serverPairs = state.rows.map(pairOf);
    updateStoredRows(state.storageKey, (rows) =>
      prunedStoredRows(rows, state.weekStart, serverPairs, catalog),
    );
  }, [state, catalog]);

  // El destino se consume cuando ya está dibujado: un clic que llega mientras
  // la página se hidrata se repite antes de que se dibuje lo que agrega.
  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null) {
      return;
    }
    if (target.kind === "picker") {
      if (pickerRef.current !== null) {
        pendingFocusRef.current = null;
        pickerRef.current.focus();
      }
      return;
    }
    if (target.kind === "cell") {
      settleCellFocus(target.key);
      return;
    }
    const row = grid.rows.find(
      (candidate) => candidate.pair !== null && samePair(candidate.pair, target.pair),
    );
    if (row === undefined) {
      return;
    }
    pendingFocusRef.current = null;
    const cell = row.cells.find((candidate) => candidate.writable);
    if (cell !== undefined) {
      focusCell(cell.key);
    }
  });

  /** El campo de una celda; `null` si no se dibuja o no se escribe. */
  function fieldOf(key: string): HTMLInputElement | null {
    return (
      tableRef.current?.querySelector<HTMLInputElement>(
        `[data-cell="${CSS.escape(key)}"] input`,
      ) ?? null
    );
  }

  /** `false` si la celda no se dibuja o no se escribe. */
  function focusCell(key: string): boolean {
    const field = fieldOf(key);
    field?.focus();
    return field !== null;
  }

  /** «Añadir nueva fila», o la región si no está: donde queda el foco sin la X. */
  function outsideRows(): HTMLElement | null {
    return addButtonRef.current ?? regionRef.current;
  }

  function focusOutsideRows(): void {
    outsideRows()?.focus();
  }

  /** El destino de una celda al cerrarse el detalle: su campo, o el de «Quitar fila» (§5.6). */
  function cellDestination(key: string): HTMLElement | null {
    return fieldOf(key) ?? outsideRows();
  }

  /**
   * El foco que espera la foto de un pedido del detalle se consume cuando la
   * celda deja de estar ocupada o de dibujarse: al campo, o fuera de las filas
   * si se fue con la fila. Solo si sigue en ese campo o cayó a `body`: si la
   * persona lo llevó a otra parte, no se lo saca.
   */
  function settleCellFocus(key: string): void {
    const cell = grid.rows
      .flatMap((row) => row.cells)
      .find((candidate) => candidate.key === key);
    if (cell?.pending === true) {
      return;
    }
    pendingFocusRef.current = null;
    const field = fieldOf(key);
    const active = document.activeElement;
    if (active !== null && active !== document.body && active !== field) {
      return;
    }
    if (field === null) {
      focusOutsideRows();
    } else {
      field.focus();
    }
  }

  /**
   * El `onSettled` de `useEntryChanges`, que se monta antes que el detalle
   * porque el detalle lee sus pedidos. Se llama después, cuando un pedido se
   * asienta, y para entonces `cellDetail` es el del último dibujo.
   */
  function settleDetail(request: EntryChangeRequest): void {
    cellDetail.settled(request);
  }

  /**
   * «Reintentar» se va con el aviso que baja: antes, el foco pasa al campo de
   * la celda del pedido, que queda `busy` con el foco, o a la región si no
   * está (F-M1). Lo usan la celda y el detalle. El foco espera la foto como
   * al confirmar desde el detalle: si el pedido saca la fila, va fuera de las
   * filas y no a `body`.
   */
  function retryWithFocusOn(key: string, retry: () => void): void {
    if (!focusCell(key)) {
      regionRef.current?.focus();
    }
    pendingFocusRef.current = { kind: "cell", key };
    retry();
  }

  /** Lo mismo con la fila, que se oculta: el foco va adonde va al confirmar. */
  function retryRow(): void {
    focusOutsideRows();
    removals.retry();
  }

  function write(row: GridRow, date: string, minutes: number): void {
    if (row.pair === null) {
      return;
    }
    const cell = row.cells.find((candidate) => candidate.date === date);
    writes.write({
      input: { date, ...row.pair, minutes },
      name: cell?.name ?? row.name,
    });
  }

  function submit(row: GridRow, date: string): void {
    const next = nextWritableCell(grid, row.key, date);
    if (next !== null) {
      focusCell(next);
    }
  }

  function addRow(): void {
    // D13-10: una fila nueva a la vez.
    if (newRow) {
      pickerRef.current?.focus();
      return;
    }
    pendingFocusRef.current = { kind: "picker" };
    setNewRow(true);
  }

  function choose(selection: ProjectSelection): void {
    const pair = selectionIds(selection);
    setAdded((current) => [...current, pair]);
    setNewRow(false);
    updateStoredRows(state.storageKey, (rows) =>
      withStoredRow(rows, state.weekStart, pair),
    );
    // El selector se va con la elección (TS-23): el foco pasa a la fila.
    pendingFocusRef.current = { kind: "row", pair };
  }

  /** La fila sin entradas se quita sin diálogo y sin pedido (§5.8). */
  function forgetRow(row: GridRow): void {
    focusOutsideRows();
    const { pair } = row;
    if (pair === null) {
      setNewRow(false);
      return;
    }
    setAdded((current) => current.filter((candidate) => !samePair(candidate, pair)));
    updateStoredRows(state.storageKey, (rows) =>
      withoutStoredRow(rows, state.weekStart, pair),
    );
  }

  function askRemove(row: GridRow, button: HTMLButtonElement): void {
    if (row.pair === null || row.entryIds.length === 0) {
      forgetRow(row);
      return;
    }
    removeButtonRef.current = button;
    setConfirming({
      name: row.name,
      count: row.entryIds.length,
      total: row.closedTotal,
      request: { weekStart: state.weekStart, ...row.pair, ids: [...row.entryIds] },
    });
    setDialogOpen(true);
  }

  function confirmRemove(): void {
    if (confirming === null) {
      return;
    }
    // La X se va con la fila: el foco sale antes de ocultarla.
    removalFocusRef.current = outsideRows();
    setDialogOpen(false);
    removals.remove(confirming.request);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <TimesheetNotices
        failures={screenFailures}
        onRetryCell={() => {
          if (writes.failure !== null) {
            retryWithFocusOn(cellKeyOf(writes.failure.request.input), writes.retry);
          }
        }}
        onRetryRow={retryRow}
        onRetryDetail={() => {
          if (cellDetail.screenFailure !== null) {
            retryWithFocusOn(cellDetail.screenFailure.request.cell, changes.retry);
          }
        }}
      />

      <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
        <TimesheetTable
          grid={grid}
          days={state.days}
          canTrack={state.canTrack}
          busy={busy}
          tableRef={tableRef}
          pickerRef={pickerRef}
          onWrite={write}
          onSubmit={submit}
          onChoose={choose}
          onRemove={askRemove}
          onMenu={cellDetail.open}
        />
        {canAddRow && (
          <div>
            <Button ref={addButtonRef} type="button" variant="outline" onClick={addRow}>
              <PlusIcon aria-hidden="true" />
              {timesheetLabels.addRow}
            </Button>
          </div>
        )}
      </div>

      <RemoveRowDialog
        row={confirming}
        open={dialogOpen}
        onCancel={() => setDialogOpen(false)}
        onConfirm={confirmRemove}
        cancelFocus={removeButtonRef}
        fallbackFocus={removalFocusRef}
      />
      <CellDetailDialogs dialogs={cellDetail.dialogs} state={state} />
    </div>
  );
}
