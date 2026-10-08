"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
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
import { cellKeyOf } from "./cell-writes";
import { timesheetLabels } from "./labels";
import { RemoveRowDialog, type RowToRemove } from "./remove-row-dialog";
import {
  prunedStoredRows,
  storedPairsOf,
  withStoredRow,
  withoutStoredRow,
} from "./stored-rows";
import { TimesheetTable } from "./timesheet-table";
import { nextWritableCell, pairOf, timesheetGrid, type GridRow } from "./timesheet-model";
import { useCellWrites } from "./use-cell-writes";
import { useRowRemovals } from "./use-row-removals";
import { updateStoredRows, useStoredRows } from "./use-stored-rows";

/** La fila con entradas cuyo diálogo está abierto, como estaba al abrirlo. */
type PendingRemoval = RowToRemove & { readonly request: RemoveTimesheetRowInput };

/** Adónde va el foco después de dibujar: el selector de la fila nueva o una fila. */
type PendingFocus =
  { readonly kind: "picker" } | { readonly kind: "row"; readonly pair: ProjectPair };

/**
 * El dueño de la planilla en el cliente: las escrituras de la grilla (§5.6),
 * las filas agregadas y las que guarda el navegador (§5.7), «Quitar fila»
 * (§5.8), los avisos (§5.9), el foco y la revalidación periódica (TS-97).
 */
export function TimesheetView({ state }: { readonly state: TimesheetState }) {
  useTrackerRefresh();
  const catalog = useTrackingCatalog();
  const writes = useCellWrites(state);
  const storedRows = useStoredRows(state.storageKey);
  /** Los pares elegidos en esta carga de la página y en esta semana, en orden (TS-15). */
  const [added, setAdded] = useState<readonly ProjectPair[]>([]);
  const removals = useRowRemovals(state, (pair) =>
    setAdded((current) => current.filter((candidate) => !samePair(candidate, pair))),
  );
  const [newRow, setNewRow] = useState(false);
  const [confirming, setConfirming] = useState<PendingRemoval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [week, setWeek] = useState(state.weekStart);
  const [seenFailures, setSeenFailures] = useState({
    cell: writes.failure,
    row: removals.failure,
  });
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

  // Otra semana: las filas agregadas y la fila nueva eran de la anterior. Las
  // escrituras en vuelo y los avisos siguen (F-m2).
  if (week !== state.weekStart) {
    setWeek(state.weekStart);
    setAdded([]);
    setNewRow(false);
  }
  // Un aviso a la vez: la falla más reciente, de una celda o de una fila,
  // reemplaza a la otra.
  if (seenFailures.cell !== writes.failure || seenFailures.row !== removals.failure) {
    setSeenFailures({ cell: writes.failure, row: removals.failure });
    if (writes.failure !== null && writes.failure !== seenFailures.cell) {
      removals.dismiss();
    } else if (removals.failure !== null && removals.failure !== seenFailures.row) {
      writes.dismiss();
    }
  }

  const grid = timesheetGrid({
    state,
    catalog,
    stored: storedPairsOf(storedRows, state.weekStart),
    added,
    newRow,
    removing: removals.removing,
    shown: writes.shown,
  });
  const canAddRow = state.canTrack && state.days.some((day) => !day.beforeFloor);

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

  /** `false` si la celda no se dibuja o no se escribe. */
  function focusCell(key: string): boolean {
    const field = tableRef.current?.querySelector<HTMLInputElement>(
      `[data-cell="${CSS.escape(key)}"] input`,
    );
    field?.focus();
    return field !== null && field !== undefined;
  }

  /** «Añadir nueva fila», o la región si no está: donde queda el foco sin la X. */
  function focusOutsideRows(): void {
    (addButtonRef.current ?? regionRef.current)?.focus();
  }

  /**
   * «Reintentar» se va con el aviso que baja: antes, el foco pasa a la celda,
   * que queda `busy` con el foco (F-M1).
   */
  function retryCell(): void {
    const failure = writes.failure;
    if (failure === null) {
      return;
    }
    if (!focusCell(cellKeyOf(failure.request.input))) {
      regionRef.current?.focus();
    }
    writes.retry();
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
    removalFocusRef.current = addButtonRef.current ?? regionRef.current;
    setDialogOpen(false);
    removals.remove(confirming.request);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Lo que falló vive en esta pantalla y sobrevive a la revalidación
          (§5.9). El anuncio lo da el `alert` de cada aviso. */}
      <div className="flex flex-col gap-2 empty:hidden">
        {writes.failure !== null && (
          <ActionFeedback
            title={timesheetLabels.cellNotSaved}
            message={writes.failure.message}
            onRetry={writes.failure.code === "unexpected" ? retryCell : undefined}
          >
            <p className="text-muted-foreground text-sm">{writes.failure.request.name}</p>
          </ActionFeedback>
        )}
        {removals.failure !== null && (
          <ActionFeedback
            title={timesheetLabels.rowNotRemoved}
            message={removals.failure.message}
            onRetry={removals.failure.code === "unexpected" ? retryRow : undefined}
          />
        )}
      </div>

      <div ref={regionRef} tabIndex={-1} className="flex flex-col gap-3 outline-none">
        <TimesheetTable
          grid={grid}
          days={state.days}
          canTrack={state.canTrack}
          busy={writes.busy}
          tableRef={tableRef}
          pickerRef={pickerRef}
          onWrite={write}
          onSubmit={submit}
          onChoose={choose}
          onRemove={askRemove}
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
    </div>
  );
}
