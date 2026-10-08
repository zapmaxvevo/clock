"use client";

import { PlusIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { samePair, type ProjectPair } from "@/lib/project-pair";
import { selectionIds } from "@/modules/project/components/picker-model";
import { useTrackingCatalog } from "@/modules/project/components/tracking-catalog";
import type { ProjectSelection } from "@/modules/project/schema";
import { removeTimesheetRow } from "@/modules/time-entry/actions";
import {
  timeEntryMessages,
  type RemoveTimesheetRowInput,
  type TimeEntryErrorCode,
  type TimesheetState,
} from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { useTrackerRefresh } from "../use-tracker-refresh";
import { timesheetLabels } from "./labels";
import { RemoveRowDialog, type RowToRemove } from "./remove-row-dialog";
import {
  prunedStoredRows,
  storedPairsOf,
  withStoredRow,
  withoutStoredRow,
} from "./stored-rows";
import { TimesheetTable } from "./timesheet-table";
import { nextWritableCell, timesheetGrid, type GridRow } from "./timesheet-model";
import { useCellWrites } from "./use-cell-writes";
import { updateStoredRows, useStoredRows } from "./use-stored-rows";

/** Un «Quitar fila» que viaja o que ya se aplicó y espera la foto (§5.8). */
type RowRemoval = {
  readonly pair: ProjectPair;
  readonly status: "sending" | "settled";
};

/** La falla de un «Quitar fila», con su pedido para «Reintentar» (TS-92). */
type RowFailure = {
  readonly request: RemoveTimesheetRowInput;
  readonly code: TimeEntryErrorCode | "unexpected";
  readonly message: string;
};

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
  /** Los pares elegidos en esta carga de la página, en orden (TS-15). */
  const [added, setAdded] = useState<readonly ProjectPair[]>([]);
  const [newRow, setNewRow] = useState(false);
  const [removals, setRemovals] = useState<readonly RowRemoval[]>([]);
  const [rowFailure, setRowFailure] = useState<RowFailure | null>(null);
  const [confirming, setConfirming] = useState<PendingRemoval | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(state);
  const [seenCellFailure, setSeenCellFailure] = useState(writes.failure);
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

  // Otra foto del servidor ya trae los «Quitar fila» que se aplicaron antes.
  if (snapshot !== state) {
    setSnapshot(state);
    setRemovals(removals.filter((removal) => removal.status === "sending"));
  }
  // Un aviso a la vez: la falla de una celda reemplaza a la de una fila.
  if (seenCellFailure !== writes.failure) {
    setSeenCellFailure(writes.failure);
    if (writes.failure !== null) {
      setRowFailure(null);
    }
  }

  const grid = timesheetGrid({
    state,
    catalog,
    stored: storedPairsOf(storedRows, state.weekStart),
    added,
    newRow,
    removing: removals.map((removal) => removal.pair),
    shown: writes.shown,
  });
  const canAddRow = state.canTrack && state.days.some((day) => !day.beforeFloor);

  // TS-19: lo guardado que ya llegó del servidor, o que el catálogo ya no
  // ofrece, se olvida. Sin permiso de carga no se toca: no se dibuja.
  useEffect(() => {
    if (!state.canTrack) {
      return;
    }
    const serverPairs = state.rows.map((row) => ({
      projectId: row.project?.id ?? null,
      taskId: row.task?.id ?? null,
    }));
    updateStoredRows(state.storageKey, (rows) =>
      prunedStoredRows(rows, state.weekStart, serverPairs, catalog),
    );
  }, [state, catalog]);

  useEffect(() => {
    const target = pendingFocusRef.current;
    if (target === null) {
      return;
    }
    pendingFocusRef.current = null;
    if (target.kind === "picker") {
      pickerRef.current?.focus();
      return;
    }
    const row = grid.rows.find(
      (candidate) => candidate.pair !== null && samePair(candidate.pair, target.pair),
    );
    const cell = row?.cells.find((candidate) => candidate.writable);
    if (cell !== undefined) {
      focusCell(cell.key);
    }
  });

  function focusCell(key: string): void {
    tableRef.current
      ?.querySelector<HTMLInputElement>(`[data-cell="${CSS.escape(key)}"] input`)
      ?.focus();
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
    (addButtonRef.current ?? regionRef.current)?.focus();
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
      total: formatDuration(Math.floor(row.closedSeconds / 60)),
      request: { weekStart: state.weekStart, ...row.pair, ids: [...row.entryIds] },
    });
    setDialogOpen(true);
  }

  async function remove(request: RemoveTimesheetRowInput): Promise<void> {
    const pair = { projectId: request.projectId, taskId: request.taskId };
    setRemovals((current) => [...current, { pair, status: "sending" }]);
    setRowFailure(null);
    let result: Awaited<ReturnType<typeof removeTimesheetRow>>;
    try {
      result = await removeTimesheetRow(request);
    } catch {
      result = { ok: false, code: "unexpected", message: timeEntryMessages.unexpected };
    }
    if (result.ok) {
      setRemovals((current) =>
        current.map((removal) =>
          samePair(removal.pair, pair) ? { ...removal, status: "settled" } : removal,
        ),
      );
      setAdded((current) => current.filter((candidate) => !samePair(candidate, pair)));
      updateStoredRows(state.storageKey, (rows) =>
        withoutStoredRow(rows, request.weekStart, pair),
      );
      return;
    }
    setRemovals((current) => current.filter((removal) => !samePair(removal.pair, pair)));
    writes.dismiss();
    setRowFailure({ request, code: result.code, message: result.message });
  }

  function confirmRemove(): void {
    if (confirming === null) {
      return;
    }
    // La X se va con la fila: el foco sale antes de ocultarla.
    removalFocusRef.current = addButtonRef.current ?? regionRef.current;
    setDialogOpen(false);
    void remove(confirming.request);
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Siempre montada, para que el lector anuncie lo que entra; lo que
          falló vive en esta pantalla y sobrevive a la revalidación (§5.9). */}
      <div role="alert" className="flex flex-col gap-2 empty:hidden">
        {writes.failure !== null && (
          <ActionFeedback
            title={timesheetLabels.cellNotSaved}
            message={writes.failure.message}
            onRetry={writes.failure.code === "unexpected" ? writes.retry : undefined}
          >
            <p className="text-muted-foreground text-sm">{writes.failure.request.name}</p>
          </ActionFeedback>
        )}
        {rowFailure !== null && (
          <ActionFeedback
            title={timesheetLabels.rowNotRemoved}
            message={rowFailure.message}
            onRetry={
              rowFailure.code === "unexpected"
                ? () => void remove(rowFailure.request)
                : undefined
            }
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
