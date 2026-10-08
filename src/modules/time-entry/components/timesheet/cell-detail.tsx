"use client";

import { useRef, useState, type RefObject } from "react";

import type {
  TimeEntryView,
  TimesheetState,
  UpdateEntryChanges,
} from "@/modules/time-entry/schema";

import { CLOSING_CODES } from "../calendar/calendar-notices";
import { EntryDialog, type EntryDialogFailure } from "../calendar/entry-dialog";
import { calendarLabels } from "../calendar/labels";
import { DeleteEntryDialog } from "../delete-entry-dialog";
import { entryNameOf, entrySpanText } from "../labels";
import type { CellMenuChoice } from "./cell-menu";
import {
  CellEntriesDialog,
  entryButtonOf,
  type EntryButton,
} from "./cell-entries-dialog";
import type { EntryChangeFailure, EntryChangeRequest } from "./entry-changes";
import { entryChangeName } from "./labels";
import { entryCellKeyOf, type GridCell } from "./timesheet-model";
import type { EntryChanges } from "./use-entry-changes";

/**
 * El editor de una entrada, con la entrada como estaba al abrirlo (CAL-72).
 * No se limpia al cerrarse: el cuerpo no queda vacío durante la animación de
 * salida, y cómo se cerró decide adónde va el foco.
 */
type EditorState = {
  readonly entry: TimeEntryView;
  readonly open: boolean;
  /** Desde el menú de la celda (TS-41) o desde la lista (TS-42). */
  readonly origin: "menu" | "list";
  /** Lo cerró el dueño: se asentó, una falla de `CLOSING_CODES` o «Borrar» de su menú. */
  readonly closedBy: "saved" | "failed" | "delete" | null;
};

/** La confirmación del borrado (TT-61), con la entrada como estaba al abrirla. */
type ConfirmState = {
  readonly entry: TimeEntryView;
  readonly open: boolean;
  readonly origin: "menu" | "list";
  /** Adonde vuelve al cancelar: el disparador, o el botón de la lista que abrió la cadena. */
  readonly returnTo: "trigger" | EntryButton;
  readonly confirmed: boolean;
};

type CellDetailState = {
  /** La celda abierta: su clave. */
  readonly cell: string;
  /** «{fila}, {día}», como estaba al abrirla. */
  readonly cellName: string;
  /** Con una entrada, el editor o la confirmación sueltos; con varias, la lista (D13b-6). */
  readonly mode: "single" | "list";
  readonly list: boolean;
  /** La lista se cerró vacía: el foco va al destino de la celda, no al disparador. */
  readonly listEmptied: boolean;
  readonly editor: EditorState | null;
  readonly confirm: ConfirmState | null;
};

/** Dónde se ve una falla del detalle (§5.2, §5.5). */
export type FailurePlace = "editor" | "list" | "screen";

type CellDetailOptions = {
  readonly state: TimesheetState;
  readonly changes: EntryChanges;
  /** El campo de la celda o, si no se dibuja, «Añadir nueva fila» o la región (§5.6). */
  readonly destinationOf: (cell: string) => HTMLElement | null;
  /** El foco espera la foto que trae el cambio de la celda (A2). */
  readonly awaitCell: (cell: string) => void;
};

export type CellDetail = ReturnType<typeof useCellDetail>;

function editsEntry(failure: EntryChangeFailure, entry: TimeEntryView): boolean {
  return failure.request.kind === "save" && failure.request.input.id === entry.id;
}

function requestName(entry: TimeEntryView): string {
  return entryChangeName(
    entryNameOf(entry.description),
    entrySpanText(entry.startLabel, entry.endLabel),
  );
}

/**
 * El dueño de qué está abierto en el detalle de una celda (§5.2): el editor
 * (TS-41), la lista (TS-42) y la confirmación (TS-35), adónde va el foco
 * (§5.6) y dónde se ve cada falla. `settled` es el `onSettled` de
 * `useEntryChanges`.
 */
export function useCellDetail({
  state,
  changes,
  destinationOf,
  awaitCell,
}: CellDetailOptions) {
  const [detail, setDetail] = useState<CellDetailState | null>(null);
  const [seenFailure, setSeenFailure] = useState(changes.failure);
  /** El disparador del menú de la celda abierta. */
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const entries =
    detail === null
      ? []
      : state.entries.filter((entry) => entryCellKeyOf(entry) === detail.cell);
  const nestedOpen = detail?.editor?.open === true || detail?.confirm?.open === true;

  // Una falla de `CLOSING_CODES` cierra el editor de su entrada: no hay nada
  // que corregir en él (§4.3).
  if (seenFailure !== changes.failure) {
    setSeenFailure(changes.failure);
    const failure = changes.failure;
    if (failure !== null && CLOSING_CODES.includes(failure.code)) {
      setDetail((current) =>
        current?.editor?.open === true && editsEntry(failure, current.editor.entry)
          ? { ...current, editor: { ...current.editor, open: false, closedBy: "failed" } }
          : current,
      );
    }
  }
  // Vacía y sin nada encima, la lista se cierra; con el editor o la
  // confirmación abiertos, cuando se cierren (A6).
  if (detail?.list === true && entries.length === 0 && !nestedOpen) {
    setDetail({ ...detail, list: false, listEmptied: true });
  }

  function editorShows(failure: EntryChangeFailure): boolean {
    const editor = detail?.editor;
    return (
      editor?.open === true &&
      editsEntry(failure, editor.entry) &&
      !CLOSING_CODES.includes(failure.code)
    );
  }

  /** La pantalla es la lista mientras está abierta sobre la celda del pedido (A14). */
  function placeOf(failure: EntryChangeFailure): FailurePlace {
    if (editorShows(failure)) {
      return "editor";
    }
    if (detail?.mode === "list" && detail.list && detail.cell === failure.request.cell) {
      return "list";
    }
    return "screen";
  }

  function update(change: (current: CellDetailState) => CellDetailState): void {
    setDetail((current) => (current === null ? current : change(current)));
  }

  /** El aviso del editor es de lo que se abre: otra apertura arranca sin él. */
  function openEditor(entry: TimeEntryView, origin: EditorState["origin"]): void {
    const failure = changes.failure;
    if (
      failure !== null &&
      editsEntry(failure, entry) &&
      !CLOSING_CODES.includes(failure.code)
    ) {
      changes.dismiss();
    }
    update((current) => ({
      ...current,
      editor: { entry, open: true, origin, closedBy: null },
    }));
  }

  function openConfirm(
    entry: TimeEntryView,
    origin: ConfirmState["origin"],
    returnTo: ConfirmState["returnTo"],
  ): void {
    update((current) => ({
      ...current,
      confirm: { entry, open: true, origin, returnTo, confirmed: false },
    }));
  }

  function closeEditor(closedBy: EditorState["closedBy"]): void {
    update((current) =>
      current.editor === null
        ? current
        : { ...current, editor: { ...current.editor, open: false, closedBy } },
    );
  }

  /** TS-40: lo que se elige en el menú de una celda, con su disparador. */
  function open(
    cell: GridCell,
    choice: CellMenuChoice,
    trigger: HTMLElement | null,
  ): void {
    triggerRef.current = trigger;
    setDetail({
      cell: cell.key,
      cellName: cell.name,
      mode: choice === "detail" ? "list" : "single",
      list: choice === "detail",
      listEmptied: false,
      editor: null,
      confirm: null,
    });
    const [entry] = cell.entries;
    if (choice === "edit" && entry !== undefined) {
      openEditor(entry, "menu");
    } else if (choice === "delete" && entry !== undefined) {
      openConfirm(entry, "menu", "trigger");
    }
  }

  /** «Si sigue abierto»: el editor que se cerró en vuelo no mueve el foco (§5.6). */
  function settled(request: EntryChangeRequest): void {
    const editor = detail?.editor;
    if (
      detail === null ||
      request.kind !== "save" ||
      editor?.open !== true ||
      editor.entry.id !== request.input.id
    ) {
      return;
    }
    if (editor.origin === "menu") {
      awaitCell(detail.cell);
    }
    closeEditor("saved");
  }

  function cancelEditor(): void {
    // Cerrar el editor con la falla a la vista la baja (A4).
    if (changes.failure !== null && editorShows(changes.failure)) {
      changes.dismiss();
    }
    closeEditor(null);
  }

  function saveEntry(entry: TimeEntryView, input: UpdateEntryChanges): void {
    if (detail === null) {
      return;
    }
    changes.save({
      kind: "save",
      cell: detail.cell,
      name: requestName(entry),
      input: { id: entry.id, changes: input },
    });
  }

  /** «Borrar» del menú del editor: la confirmación toma su lugar, como en el calendario. */
  function deleteFromEditor(editor: EditorState): void {
    closeEditor("delete");
    openConfirm(
      editor.entry,
      editor.origin,
      editor.origin === "menu" ? "trigger" : "edit",
    );
  }

  function closeConfirm(): void {
    update((current) =>
      current.confirm === null
        ? current
        : { ...current, confirm: { ...current.confirm, open: false } },
    );
  }

  function confirmDelete(confirm: ConfirmState): void {
    if (detail === null) {
      return;
    }
    update((current) =>
      current.confirm === null
        ? current
        : { ...current, confirm: { ...current.confirm, open: false, confirmed: true } },
    );
    if (confirm.origin === "menu") {
      awaitCell(detail.cell);
    }
    changes.remove({
      kind: "delete",
      cell: detail.cell,
      name: requestName(confirm.entry),
      input: { id: confirm.entry.id },
    });
  }

  function cancelList(): void {
    update((current) => ({ ...current, list: false }));
  }

  /** El aviso se va con el pedido nuevo: el foco pasa antes al título (§5.6). */
  function retryFromList(): void {
    titleRef.current?.focus();
    changes.retry();
  }

  /** El disparador si sigue en la celda; si no, el destino de la celda. */
  function triggerOrDestination(cell: string): HTMLElement | null {
    const trigger = triggerRef.current;
    return trigger?.isConnected === true ? trigger : destinationOf(cell);
  }

  /** Un botón de la lista; si su entrada salió, el título (§5.6). */
  function listButtonOr(entryId: string, button: EntryButton): HTMLElement | null {
    return entryButtonOf(listRef.current, entryId, button) ?? titleRef.current;
  }

  /** Adonde vuelve el foco al cancelar el editor. */
  function editorCancelFocus(editor: EditorState, cell: string): HTMLElement | null {
    return editor.origin === "menu"
      ? triggerOrDestination(cell)
      : listButtonOr(editor.entry.id, "edit");
  }

  /** Adonde va el foco cuando el dueño cierra el editor. */
  function editorCloseFocus(editor: EditorState, cell: string): HTMLElement | null {
    if (editor.closedBy === "delete") {
      // La confirmación que se abre tiene el foco.
      return null;
    }
    if (editor.origin === "menu") {
      return destinationOf(cell);
    }
    return editor.closedBy === "saved"
      ? listButtonOr(editor.entry.id, "edit")
      : titleRef.current;
  }

  function confirmFocus(confirm: ConfirmState, cell: string): HTMLElement | null {
    if (confirm.confirmed) {
      return confirm.origin === "menu" ? destinationOf(cell) : titleRef.current;
    }
    return confirm.returnTo === "trigger"
      ? triggerOrDestination(cell)
      : listButtonOr(confirm.entry.id, confirm.returnTo);
  }

  function listFocus(current: CellDetailState): HTMLElement | null {
    return current.listEmptied
      ? destinationOf(current.cell)
      : triggerOrDestination(current.cell);
  }

  return {
    detail,
    entries,
    nestedOpen,
    titleRef,
    listRef,
    open,
    settled,
    placeOf,
    editorShows,
    openEditor,
    openConfirm,
    cancelEditor,
    saveEntry,
    deleteFromEditor,
    closeConfirm,
    confirmDelete,
    cancelList,
    retryFromList,
    editorCancelFocus,
    editorCloseFocus,
    confirmFocus,
    listFocus,
  };
}

/** Lo que `RefObject` pide, calculado cuando el diálogo lo lee al cerrarse. */
function lazyRef(get: () => HTMLElement | null): RefObject<HTMLElement | null> {
  return {
    get current() {
      return get();
    },
  };
}

/**
 * El foco puesto a mano, después de que lo de afuera del modal deje de estar
 * inerte: Base UI lo pasaría al primer control de un contenedor.
 */
function focusLater(target: HTMLElement | null): false {
  queueMicrotask(() => target?.focus());
  return false;
}

type CellDetailDialogsProps = {
  readonly cellDetail: CellDetail;
  readonly state: TimesheetState;
  readonly changes: EntryChanges;
};

/**
 * Los diálogos del detalle (§5.2). En TS-41 el editor y la confirmación van
 * sueltos; en TS-42 van como hijos de la lista, que es lo que necesita Base UI
 * para anidarlos.
 */
export function CellDetailDialogs({
  cellDetail,
  state,
  changes,
}: CellDetailDialogsProps) {
  const { detail } = cellDetail;
  if (detail === null) {
    return null;
  }
  const { cell, editor, confirm } = detail;
  const failure = changes.failure;

  const editorFailure: EntryDialogFailure | null =
    failure !== null && cellDetail.editorShows(failure)
      ? {
          title: calendarLabels.entryNotSaved,
          message: failure.message,
          retryable: failure.code === "unexpected",
        }
      : null;

  const editorDialog = editor !== null && (
    <EntryDialog
      open={editor.open}
      subject={{ kind: "entry", entry: editor.entry }}
      // Solo se abre con permiso de carga (D13b-4). Un refresco que lo quita
      // no lo pasa a solo lectura: el pedido responde `forbidden` en él (§3).
      canTrack
      serverNow={state.serverNow}
      todayKey={state.todayKey}
      minDayKey={state.minDayKey}
      pending={changes.sending.has(editor.entry.id)}
      failure={editorFailure}
      onCancel={cellDetail.cancelEditor}
      onSave={(input) => cellDetail.saveEntry(editor.entry, input)}
      onDelete={() => cellDetail.deleteFromEditor(editor)}
      cancelFocus={lazyRef(() => cellDetail.editorCancelFocus(editor, cell))}
      regionRef={lazyRef(() => cellDetail.editorCloseFocus(editor, cell))}
    />
  );

  const confirmDialog = confirm !== null && (
    <DeleteEntryDialog
      name={entryNameOf(confirm.entry.description)}
      startLabel={confirm.entry.startLabel}
      endLabel={confirm.entry.endLabel}
      open={confirm.open}
      onOpenChange={(next) => {
        if (!next) {
          cellDetail.closeConfirm();
        }
      }}
      onConfirm={() => cellDetail.confirmDelete(confirm)}
      finalFocus={lazyRef(() => cellDetail.confirmFocus(confirm, cell))}
    />
  );

  if (detail.mode === "single") {
    return (
      <>
        {editorDialog}
        {confirmDialog}
      </>
    );
  }

  return (
    <CellEntriesDialog
      open={detail.list}
      cellName={detail.cellName}
      entries={cellDetail.entries}
      changes={changes.state}
      failure={
        failure !== null && cellDetail.placeOf(failure) === "list" ? failure : null
      }
      titleRef={cellDetail.titleRef}
      listRef={cellDetail.listRef}
      nestedOpen={cellDetail.nestedOpen}
      onEdit={(entry) => cellDetail.openEditor(entry, "list")}
      onDelete={(entry) => cellDetail.openConfirm(entry, "list", "delete")}
      onRetry={cellDetail.retryFromList}
      onCancel={cellDetail.cancelList}
      finalFocus={() => focusLater(cellDetail.listFocus(detail))}
    >
      {editorDialog}
      {confirmDialog}
    </CellEntriesDialog>
  );
}
