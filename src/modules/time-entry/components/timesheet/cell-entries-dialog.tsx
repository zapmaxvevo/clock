"use client";

import { useEffect, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { calendarLabels } from "../calendar/labels";
import { entryNameOf, entrySpanText, extraDaysText, trackerLabels } from "../labels";
import { useDialogReturnFocus } from "../use-dialog-return-focus";
import type { EntryButton } from "./cell-detail-focus";
import {
  changingEntriesOf,
  type EntryChangeFailure,
  type EntryChangesState,
} from "./entry-changes";
import {
  cellDetailTitle,
  deleteEntryLabel,
  editEntryLabel,
  timesheetLabels,
} from "./labels";
import { EntryChangeFeedback } from "./timesheet-notices";

/** El botón de una entrada en la lista abierta; `null` si ya salió de ella. */
export function entryButtonOf(
  list: HTMLElement | null,
  entryId: string,
  button: EntryButton,
): HTMLElement | null {
  return (
    list?.querySelector<HTMLElement>(
      `[data-entry="${CSS.escape(entryId)}"] [data-button="${button}"]`,
    ) ?? null
  );
}

type CellEntriesContentProps = {
  /** La celda, «{fila}, {día}» (TS-100). */
  readonly cellName: string;
  /** Las de la celda en la foto, en el orden del servidor. */
  readonly entries: readonly TimeEntryView[];
  /** Los pedidos del detalle: las entradas que la foto todavía no trae quedan inactivas (A1). */
  readonly changes: EntryChangesState;
  /** La falla del detalle de esta celda que se ve en la lista (A14). */
  readonly failure: EntryChangeFailure | null;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly listRef: RefObject<HTMLUListElement | null>;
  readonly onEdit: (entry: TimeEntryView) => void;
  readonly onDelete: (entry: TimeEntryView) => void;
  readonly onRetry: () => void;
};

/**
 * Lo de adentro de la lista, sin el portal, para que el test lo dibuje: el
 * aviso de la celda, cada entrada con su horario y su duración, y «Editar» y
 * «Borrar», inactivos mientras la foto no trae lo que se pidió sobre ella.
 */
export function CellEntriesContent({
  cellName,
  entries,
  changes,
  failure,
  titleRef,
  listRef,
  onEdit,
  onDelete,
  onRetry,
}: CellEntriesContentProps) {
  const changing = changingEntriesOf(changes);

  return (
    <>
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1} className="outline-none">
          {cellDetailTitle(cellName)}
        </DialogTitle>
      </DialogHeader>

      {failure !== null && <EntryChangeFeedback failure={failure} onRetry={onRetry} />}

      <ul ref={listRef} className="divide-y">
        {entries.map((entry) => (
          <CellEntryItem
            key={entry.id}
            entry={entry}
            changing={changing.has(entry.id)}
            onEdit={() => onEdit(entry)}
            onDelete={() => onDelete(entry)}
          />
        ))}
      </ul>

      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>
          {calendarLabels.close}
        </DialogClose>
      </DialogFooter>
    </>
  );
}

function CellEntryItem({
  entry,
  changing,
  onEdit,
  onDelete,
}: {
  readonly entry: TimeEntryView;
  readonly changing: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  const name = entryNameOf(entry.description);
  const span = entrySpanText(entry.startLabel, entry.endLabel);

  return (
    <li data-entry={entry.id} className="flex items-center gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p
          className={cn("truncate", entry.description === "" && "text-muted-foreground")}
        >
          {name}
        </p>
        <p className="text-muted-foreground text-xs tabular-nums">
          {entry.startLabel} – {entry.endLabel}
          {entry.extraDays > 0 && (
            <sup className="ml-0.5">
              +{entry.extraDays}
              <span className="sr-only">{extraDaysText(entry.extraDays)}</span>
            </sup>
          )}
        </p>
      </div>
      <span className="tabular-nums">{entry.durationLabel}</span>
      {/* Inactivos con `aria-disabled`: con `disabled`, el que tenía el foco lo perdería. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        data-button="edit"
        aria-label={editEntryLabel(name, span)}
        aria-disabled={changing || undefined}
        onClick={() => {
          if (!changing) {
            onEdit();
          }
        }}
      >
        {timesheetLabels.editEntry}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive"
        data-button="delete"
        aria-label={deleteEntryLabel(name, span)}
        aria-disabled={changing || undefined}
        onClick={() => {
          if (!changing) {
            onDelete();
          }
        }}
      >
        {trackerLabels.delete}
      </Button>
    </li>
  );
}

type CellEntriesDialogProps = CellEntriesContentProps & {
  readonly open: boolean;
  /** «Cerrar», Esc o un clic afuera. */
  readonly onCancel: () => void;
  /** Adonde vuelve el foco al cancelar: el disparador del menú (§5.6). */
  readonly cancelFocus: RefObject<HTMLElement | null>;
  /** Adonde va el foco si la lista se cierra porque quedó vacía: el destino de la celda. */
  readonly fallbackFocus: RefObject<HTMLElement | null>;
  /** El editor o la confirmación de una entrada están abiertos encima. */
  readonly nestedOpen: boolean;
  /** El editor y la confirmación: hijos de la raíz, así Base UI los anida (A6). */
  readonly children?: ReactNode;
};

/**
 * TS-42: la lista de una celda con varias entradas. Sale de la foto y se
 * actualiza con ella (D13b-2); si la entrada que tenía el foco sale, el foco
 * pasa al título.
 */
export function CellEntriesDialog({
  open,
  onCancel,
  cancelFocus,
  fallbackFocus,
  nestedOpen,
  children,
  ...content
}: CellEntriesDialogProps) {
  const { entries, titleRef } = content;
  const { onOpenChange, finalFocus } = useDialogReturnFocus({
    cancelFocus,
    fallbackFocus,
    onCancel,
  });
  const ids = entries.map((entry) => entry.id).join(",");

  useEffect(() => {
    const title = titleRef.current;
    if (!open || nestedOpen || title === null) {
      return;
    }
    // El botón que se va con su entrada deja el foco en `body`, o en el
    // contenedor del diálogo, adonde lo lleva Base UI.
    const active = document.activeElement;
    if (
      active === null ||
      active === document.body ||
      active === title.closest('[role="dialog"]')
    ) {
      title.focus();
    }
  }, [ids, open, nestedOpen, titleRef]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        initialFocus={titleRef}
        finalFocus={finalFocus}
      >
        <CellEntriesContent {...content} />
      </DialogContent>
      {children}
    </Dialog>
  );
}
