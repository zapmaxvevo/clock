"use client";

import { useEffect, useId, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { Button } from "@/components/ui/button";
import { retryHandlerOf, useAction, type ActionFailure } from "@/hooks/use-action";
import type { Rejection } from "@/server/action";
import { bulkDeleteEntries, bulkEditEntries } from "@/modules/time-entry/actions";
import {
  BULK_MAX,
  timeEntryMessages,
  type BulkEditChanges,
} from "@/modules/time-entry/schema";

import { BulkDeleteDialog } from "./bulk-delete-dialog";
import { BulkEditDialog } from "./bulk-edit-dialog";
import {
  entriesDeletedLabel,
  entriesEditedLabel,
  selectedCountLabel,
  trackerLabels,
} from "./labels";

/** Una entrada elegida, con cómo la nombra la pantalla: lo que usa el aviso de rechazos. */
export type SelectedEntry = {
  readonly id: string;
  /** La descripción, o «Sin descripción». */
  readonly name: string;
  readonly dayLabel: string;
  readonly startLabel: string;
  readonly endLabel: string;
};

type BulkActionsProps = {
  /** La selección visible, en el orden en que se eligió. Vacía, no hay barra. */
  readonly entries: readonly SelectedEntry[];
  /** Día de hoy en la zona de la persona. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día al que se puede mover una entrada. */
  readonly minDayKey: string;
  /** Vista optimista del borrado de la lista: se llama dentro de la transición. */
  readonly showRemoved: (id: string) => void;
  /** TT-55: las filas que ocupa la operación en vuelo, también dentro de la transición. */
  readonly showBusy: (ids: readonly string[]) => void;
  /** Saca de la selección las entradas que frenaron el pedido (ADR 0011). */
  readonly onDrop: (ids: readonly string[]) => void;
  readonly onClear: () => void;
  /** P-15: las semanas de las entradas editadas. La lista extiende la ventana si hace falta. */
  readonly onEntryWeeks: (weekStarts: readonly string[]) => void;
};

/** Adónde va el foco cuando el control que lo tenía se va con el aviso. */
type FocusTarget = "save" | "delete" | "region";

/**
 * TT-62 a TT-64: la región de las acciones en masa y su barra. Es dueña de las
 * dos actions, del estado que anuncia la región, de los avisos y del foco.
 *
 * La región está siempre montada, aunque no haya selección: es adonde va el
 * foco cuando lo que lo tenía se va —la barra, un diálogo, «Reintentar»—, y
 * donde queda el aviso que el diálogo no puede seguir mostrando.
 */
export function BulkActions({
  entries,
  todayKey,
  minDayKey,
  showRemoved,
  showBusy,
  onDrop,
  onClear,
  onEntryWeeks,
}: BulkActionsProps) {
  const regionRef = useRef<HTMLElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  const limitId = useId();
  /** El control que toma el foco en el render siguiente, cuando aparece o queda. */
  const pendingFocus = useRef<FocusTarget | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** El resultado de la última operación, hasta que se elige otra entrada. */
  const [result, setResult] = useState<string | null>(null);
  /** Cómo se nombraban las filas de cada pedido al mandarlo: el reintento reenvía el mismo. */
  const [editSent, setEditSent] = useState<readonly SelectedEntry[]>([]);
  const [deleteSent, setDeleteSent] = useState<readonly SelectedEntry[]>([]);

  const edit = useAction(bulkEditEntries, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => showBusy(input.ids),
    onSuccess: (data) => {
      onClear();
      setEditOpen(false);
      setResult(entriesEditedLabel(data.entries.length));
      onEntryWeeks(data.entries.map((entry) => entry.weekStart));
    },
  });

  const remove = useAction(bulkDeleteEntries, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => {
      showBusy(input.ids);
      input.ids.forEach(showRemoved);
    },
    onSuccess: (data) => {
      onClear();
      setResult(entriesDeletedLabel(data.ids.length));
    },
  });

  const count = entries.length;
  const pending = edit.pending || remove.pending;
  const overLimit = count > BULK_MAX;

  // Un diálogo no sigue abierto sin entradas que editar o borrar: la
  // selección quedó vacía porque todas sus filas se fueron. El aviso de la
  // edición pasa a la región, y el diálogo lleva el foco ahí al cerrarse.
  if (count === 0 && (editOpen || deleteOpen)) {
    setEditOpen(false);
    setDeleteOpen(false);
  }
  if (count > 0 && result !== null) {
    setResult(null);
  }

  const barShown = count > 0;
  const wasBarShown = useRef(barShown);
  useEffect(() => {
    // La barra se fue con el foco adentro: «Quitar selección», el éxito de una
    // operación o el recorte. El foco cayó a `body` y va a la región.
    const active = document.activeElement;
    if (
      wasBarShown.current &&
      !barShown &&
      (active === null || active === document.body)
    ) {
      regionRef.current?.focus();
    }
    wasBarShown.current = barShown;
  }, [barShown]);

  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) {
      return;
    }
    pendingFocus.current = null;
    const refs = { save: saveRef, delete: deleteRef, region: regionRef };
    refs[target].current?.focus();
  });

  function openEdit(): void {
    if (pending || overLimit) {
      return;
    }
    edit.clear();
    setEditOpen(true);
  }

  function cancelEdit(): void {
    edit.clear();
    setEditOpen(false);
  }

  function saveEdit(changes: BulkEditChanges): void {
    remove.clear();
    setEditSent(entries);
    edit.run({ ids: entries.map((entry) => entry.id), changes });
  }

  function openDelete(): void {
    if (pending || overLimit) {
      return;
    }
    setDeleteOpen(true);
  }

  function confirmDelete(): void {
    setDeleteOpen(false);
    edit.clear();
    setDeleteSent(entries);
    remove.run({ ids: entries.map((entry) => entry.id) });
  }

  function clearSelection(): void {
    if (!pending) {
      onClear();
    }
  }

  /**
   * «Quitar esas entradas de la selección» se va con su aviso: el foco pasa a
   * «Guardar» si el diálogo sigue abierto, a «Borrar» si la barra sigue, y si
   * no queda nada elegido, a la región.
   */
  function dropRejected(ids: readonly string[], clear: () => void): void {
    const remaining = entries.filter((entry) => !ids.includes(entry.id)).length;
    pendingFocus.current = remaining === 0 ? "region" : editOpen ? "save" : "delete";
    onDrop(ids);
    clear();
  }

  /**
   * §4.7: el reintento reenvía el pedido con los ids de entonces, así que se
   * ofrece solo mientras todas esas entradas sigan elegidas. Si alguna se fue
   * o la persona la soltó, el aviso queda sin «Reintentar», como el de
   * continuar: nunca se toca una fila que no se ve.
   */
  const selectedIds = new Set(entries.map((entry) => entry.id));
  const stillSelected = (sent: readonly SelectedEntry[]) =>
    sent.every((entry) => selectedIds.has(entry.id));

  // «Reintentar» se va con su aviso: el foco pasa antes a lo que sigue en
  // pantalla. «Guardar» queda inactivo mientras la edición viaja y lo conserva.
  const editRetry = stillSelected(editSent) ? retryHandlerOf(edit) : undefined;
  const retryEdit =
    editRetry === undefined
      ? undefined
      : () => {
          (editOpen ? saveRef : regionRef).current?.focus();
          editRetry();
        };
  const deleteRetry = stillSelected(deleteSent) ? retryHandlerOf(remove) : undefined;
  const retryDelete =
    deleteRetry === undefined
      ? undefined
      : () => {
          regionRef.current?.focus();
          deleteRetry();
        };

  const editFeedback =
    edit.failure === null ? null : (
      <BulkFailure
        title={trackerLabels.entriesNotEdited}
        failure={edit.failure}
        sent={editSent}
        onRetry={retryEdit}
        onDrop={(ids) => dropRejected(ids, edit.clear)}
      />
    );
  const deleteFeedback =
    remove.failure === null ? null : (
      <BulkFailure
        title={trackerLabels.entriesNotDeleted}
        failure={remove.failure}
        sent={deleteSent}
        onRetry={retryDelete}
        onDrop={(ids) => dropRejected(ids, remove.clear)}
      />
    );

  const status = remove.pending
    ? trackerLabels.deleting
    : count > 0
      ? selectedCountLabel(count)
      : (result ?? "");

  return (
    <section
      ref={regionRef}
      aria-label={trackerLabels.bulkRegion}
      tabIndex={-1}
      className="bg-background focus-visible:ring-ring/50 sticky top-0 z-10 flex flex-col gap-2 rounded-lg outline-none focus-visible:ring-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* Único y siempre montado: la cantidad, «Borrando…» y el resultado. */}
        <p role="status" className="text-sm font-medium">
          {status}
        </p>
        {barShown && (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              ref={editRef}
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={pending || overLimit}
              aria-describedby={overLimit ? limitId : undefined}
              onClick={openEdit}
            >
              {trackerLabels.bulkEdit}
            </Button>
            <Button
              ref={deleteRef}
              type="button"
              variant="outline"
              size="sm"
              aria-disabled={pending || overLimit}
              aria-describedby={overLimit ? limitId : undefined}
              onClick={openDelete}
            >
              {trackerLabels.bulkDelete}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={pending}
              onClick={clearSelection}
            >
              {trackerLabels.clearSelection}
            </Button>
          </div>
        )}
      </div>
      {barShown && overLimit && (
        <p id={limitId} className="text-muted-foreground text-sm">
          {timeEntryMessages.bulkTooMany}
        </p>
      )}
      {!editOpen && editFeedback}
      {deleteFeedback}

      <BulkEditDialog
        count={count}
        open={editOpen}
        todayKey={todayKey}
        minDayKey={minDayKey}
        pending={edit.pending}
        saveRef={saveRef}
        feedback={editOpen ? editFeedback : null}
        onCancel={cancelEdit}
        onSave={saveEdit}
        cancelFocus={editRef}
        fallbackFocus={regionRef}
      />
      <BulkDeleteDialog
        count={count}
        open={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={confirmDelete}
        cancelFocus={deleteRef}
        fallbackFocus={regionRef}
      />
    </section>
  );
}

type BulkFailureProps = {
  /** Nombra la operación que falló (TT-90). */
  readonly title: string;
  readonly failure: ActionFailure;
  /** Cómo nombraba la pantalla cada fila al mandar el pedido. */
  readonly sent: readonly SelectedEntry[];
  /** Sin él, no hay «Reintentar». */
  readonly onRetry: (() => void) | undefined;
  readonly onDrop: (ids: readonly string[]) => void;
};

/** El aviso de una operación en masa que falló, con sus rechazos si los trae. */
function BulkFailure({ title, failure, sent, onRetry, onDrop }: BulkFailureProps) {
  return (
    <ActionFeedback title={title} message={failure.message} onRetry={onRetry}>
      {hasRejections(failure) ? (
        <RejectionList rejections={failure.rejections} sent={sent} onDrop={onDrop} />
      ) : undefined}
    </ActionFeedback>
  );
}

/** El pedido se rechazó por filas: el aviso las lista (ADR 0011). */
function hasRejections<Code extends string>(
  failure: ActionFailure<Code>,
): failure is ActionFailure<Code> & { readonly rejections: readonly Rejection<Code>[] } {
  return failure.rejections !== undefined && failure.rejections.length > 0;
}

type RejectionListProps = {
  readonly rejections: readonly Rejection<string>[];
  /** Cómo nombraba la pantalla cada fila al mandar el pedido. */
  readonly sent: readonly SelectedEntry[];
  readonly onDrop: (ids: readonly string[]) => void;
};

/**
 * ADR 0011: cada entrada que frenó el pedido, nombrada como la nombraba la
 * pantalla al mandarlo —también la que ya no existe—, con la causa.
 */
function RejectionList({ rejections, sent, onDrop }: RejectionListProps) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="list-disc pl-4">
        {rejections.map((rejection) => {
          const entry = sent.find((candidate) => candidate.id === rejection.id);
          return (
            <li key={rejection.id}>
              {entry === undefined
                ? rejection.message
                : `${entry.name}, ${entry.dayLabel}, ${entry.startLabel} – ${entry.endLabel}: ${rejection.message}`}
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => onDrop(rejections.map((rejection) => rejection.id))}
      >
        {trackerLabels.dropRejected}
      </Button>
    </div>
  );
}
