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
import {
  confirmTarget,
  editorCancelTarget,
  editorCloseTarget,
  type ConfirmFocus,
  type ConfirmOrigin,
  type EditorFocus,
  type EntryButton,
  type FocusPlaces,
} from "./cell-detail-focus";
import { CellEntriesDialog, entryButtonOf } from "./cell-entries-dialog";
import type { CellMenuChoice } from "./cell-menu";
import type {
  EntryChangeFailure,
  EntryChangeRequest,
  EntryChangesState,
} from "./entry-changes";
import { entryChangeName } from "./labels";
import { entryCellKeyOf, type GridCell } from "./timesheet-model";
import type { EntryChanges } from "./use-entry-changes";

/**
 * Un diálogo sobre una entrada, con la entrada como estaba al abrirlo
 * (CAL-72). No se limpia al cerrarse: el cuerpo no queda vacío durante la
 * animación de salida, y cómo se cerró decide adónde va el foco.
 */
type EditorState = EditorFocus & {
  readonly entry: TimeEntryView;
  readonly open: boolean;
};

type ConfirmState = ConfirmFocus & {
  readonly entry: TimeEntryView;
  readonly open: boolean;
};

type CellDetailState = {
  /** La celda abierta: su clave. */
  readonly cell: string;
  /** «{fila}, {día}», como estaba al abrirla. */
  readonly cellName: string;
  /** Con una entrada, el editor o la confirmación sueltos; con varias, la lista (D13b-6). */
  readonly mode: "single" | "list";
  readonly listOpen: boolean;
  readonly editor: EditorState | null;
  readonly confirm: ConfirmState | null;
};

/** Lo que dibuja `CellDetailDialogs`, interno entre él y `useCellDetail`. */
type DetailDialogs = {
  readonly detail: CellDetailState | null;
  /** Las entradas de la celda abierta en la foto. */
  readonly entries: readonly TimeEntryView[];
  readonly nestedOpen: boolean;
  readonly changes: EntryChangesState;
  readonly editorPending: boolean;
  readonly editorFailure: EntryDialogFailure | null;
  readonly listFailure: EntryChangeFailure | null;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly listRef: RefObject<HTMLUListElement | null>;
  readonly places: FocusPlaces<HTMLElement>;
  readonly cancelEditor: () => void;
  readonly saveEntry: (entry: TimeEntryView, entryChanges: UpdateEntryChanges) => void;
  readonly deleteFromEditor: (editor: EditorState) => void;
  readonly editFromList: (entry: TimeEntryView) => void;
  readonly deleteFromList: (entry: TimeEntryView) => void;
  readonly closeConfirm: () => void;
  readonly confirmDelete: (confirm: ConfirmState) => void;
  readonly cancelList: () => void;
  readonly retryFromList: () => void;
};

/** Lo que `TimesheetView` usa del detalle. */
type CellDetailHandle = {
  /**
   * TS-40: lo que se elige en el menú de una celda, con su disparador. Sin
   * disparador, el foco que volvería a él al cancelar va al destino de la
   * celda (`destinationOf`), como cuando el disparador ya salió de la grilla.
   */
  readonly open: (
    cell: GridCell,
    choice: CellMenuChoice,
    trigger: HTMLElement | null,
  ) => void;
  /** El `onSettled` de `useEntryChanges`: cierra el editor que sigue abierto. */
  readonly settled: (request: EntryChangeRequest) => void;
  /** La falla del detalle cuando se ve en la pantalla, no en el editor ni en la lista (§5.5). */
  readonly screenFailure: EntryChangeFailure | null;
  readonly dialogs: DetailDialogs;
};

type CellDetailOptions = {
  readonly state: TimesheetState;
  readonly changes: EntryChanges;
  /** El campo de la celda o, si no se dibuja, «Añadir nueva fila» o la región (§5.6). */
  readonly destinationOf: (cell: string) => HTMLElement | null;
  /** El foco espera la foto que trae el cambio de la celda (A2). */
  readonly awaitCell: (cell: string) => void;
};

/** TS-40: lo que abre cada opción del menú de una celda (D13b-6). */
function openedDetail(cell: GridCell, choice: CellMenuChoice): CellDetailState {
  const [entry] = cell.entries;
  return {
    cell: cell.key,
    cellName: cell.name,
    mode: choice === "detail" ? "list" : "single",
    listOpen: choice === "detail",
    editor:
      choice === "edit" && entry !== undefined
        ? { entry, open: true, origin: "menu", closedBy: null }
        : null,
    confirm:
      choice === "delete" && entry !== undefined
        ? { entry, origin: "menu", open: true, confirmed: false }
        : null,
  };
}

/** La falla es de un guardado de esa entrada: la que el editor puede mostrar o lo cierra. */
function savesEntry(failure: EntryChangeFailure, entry: TimeEntryView): boolean {
  return failure.request.kind === "save" && failure.request.input.id === entry.id;
}

/** La falla de un guardado de esa entrada que se corrige en el editor: no la cierra. */
function showsInEditor(failure: EntryChangeFailure, entry: TimeEntryView): boolean {
  return savesEntry(failure, entry) && !CLOSING_CODES.includes(failure.code);
}

/** La falla de un guardado de esa entrada que cierra el editor (§4.3). */
function closesEditor(failure: EntryChangeFailure, entry: TimeEntryView): boolean {
  return savesEntry(failure, entry) && CLOSING_CODES.includes(failure.code);
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
 * (§5.6) y dónde se ve cada falla.
 */
export function useCellDetail({
  state,
  changes,
  destinationOf,
  awaitCell,
}: CellDetailOptions): CellDetailHandle {
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
  const editor = detail?.editor ?? null;
  const nestedOpen = editor?.open === true || detail?.confirm?.open === true;
  const failure = changes.failure;

  // Una falla de `CLOSING_CODES` cierra el editor de su entrada: no hay nada
  // que corregir en él (§4.3).
  if (seenFailure !== failure) {
    setSeenFailure(failure);
    if (failure !== null) {
      update((current) =>
        current.editor?.open === true && closesEditor(failure, current.editor.entry)
          ? { ...current, editor: { ...current.editor, open: false, closedBy: "failed" } }
          : current,
      );
    }
  }
  // Vacía y sin nada encima, la lista se cierra; con el editor o la
  // confirmación abiertos, cuando se cierren (A6).
  if (detail?.listOpen === true && entries.length === 0 && !nestedOpen) {
    setDetail({ ...detail, listOpen: false });
  }

  const editorShowsFailure =
    failure !== null && editor?.open === true && showsInEditor(failure, editor.entry);
  /** La pantalla es la lista mientras está abierta sobre la celda del pedido (A14). */
  const listShowsFailure =
    failure !== null &&
    !editorShowsFailure &&
    detail?.mode === "list" &&
    detail.listOpen &&
    detail.cell === failure.request.cell;

  function update(change: (current: CellDetailState) => CellDetailState): void {
    setDetail((current) => (current === null ? current : change(current)));
  }

  /** El aviso del editor es de lo que se abre: otra apertura arranca sin él. */
  function dismissEditorFailureOf(entry: TimeEntryView): void {
    if (failure !== null && showsInEditor(failure, entry)) {
      changes.dismiss();
    }
  }

  function openEditor(entry: TimeEntryView, origin: EditorState["origin"]): void {
    dismissEditorFailureOf(entry);
    update((current) => ({
      ...current,
      editor: { entry, open: true, origin, closedBy: null },
    }));
  }

  function openConfirm(confirm: ConfirmOrigin & { readonly entry: TimeEntryView }): void {
    update((current) => ({
      ...current,
      confirm: { ...confirm, open: true, confirmed: false },
    }));
  }

  /**
   * Todo cierre que no sea el del pedido —cancelar, «Borrar» de su menú— baja
   * la falla que el editor tenía a la vista (A4): si no, al cerrarse pasaría a
   * la pantalla o a la lista como recién llegada, con un «Reintentar» que
   * reescribiría el borrador abandonado.
   */
  function closeEditor(closedBy: EditorState["closedBy"]): void {
    if (closedBy !== "saved" && closedBy !== "failed" && editorShowsFailure) {
      changes.dismiss();
    }
    update((current) =>
      current.editor === null
        ? current
        : { ...current, editor: { ...current.editor, open: false, closedBy } },
    );
  }

  function open(
    cell: GridCell,
    choice: CellMenuChoice,
    trigger: HTMLElement | null,
  ): void {
    triggerRef.current = trigger;
    const opened = openedDetail(cell, choice);
    if (opened.editor !== null) {
      dismissEditorFailureOf(opened.editor.entry);
    }
    setDetail(opened);
  }

  /** «Si sigue abierto»: el editor que se cerró en vuelo no mueve el foco (§5.6). */
  function settled(request: EntryChangeRequest): void {
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

  const places: FocusPlaces<HTMLElement> = {
    trigger: () => {
      const trigger = triggerRef.current;
      return trigger?.isConnected === true ? trigger : null;
    },
    destination: () => (detail === null ? null : destinationOf(detail.cell)),
    title: () => titleRef.current,
    button: (entryId, button: EntryButton) =>
      entryButtonOf(listRef.current, entryId, button),
  };

  const dialogs: DetailDialogs = {
    detail,
    entries,
    nestedOpen,
    changes: changes.state,
    editorPending: editor !== null && changes.sending.has(editor.entry.id),
    editorFailure:
      editorShowsFailure && failure !== null
        ? {
            title: calendarLabels.entryNotSaved,
            message: failure.message,
            retryable: failure.code === "unexpected",
          }
        : null,
    listFailure: listShowsFailure ? failure : null,
    titleRef,
    listRef,
    places,
    cancelEditor: () => closeEditor(null),
    saveEntry: (entry, entryChanges) => {
      if (detail !== null) {
        changes.save({
          cell: detail.cell,
          name: requestName(entry),
          input: { id: entry.id, changes: entryChanges },
        });
      }
    },
    // «Borrar» del menú del editor: la confirmación toma su lugar, como en el calendario.
    deleteFromEditor: (current) => {
      closeEditor("delete");
      openConfirm(
        current.origin === "menu"
          ? { entry: current.entry, origin: "menu" }
          : { entry: current.entry, origin: "list", returnTo: "edit" },
      );
    },
    editFromList: (entry) => openEditor(entry, "list"),
    deleteFromList: (entry) => openConfirm({ entry, origin: "list", returnTo: "delete" }),
    closeConfirm: () =>
      update((current) =>
        current.confirm === null
          ? current
          : { ...current, confirm: { ...current.confirm, open: false } },
      ),
    confirmDelete: (confirm) => {
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
        cell: detail.cell,
        name: requestName(confirm.entry),
        input: { id: confirm.entry.id },
      });
    },
    cancelList: () => update((current) => ({ ...current, listOpen: false })),
    // El aviso se va con el pedido nuevo: el foco pasa antes al título (§5.6).
    retryFromList: () => {
      titleRef.current?.focus();
      changes.retry();
    },
  };

  return {
    open,
    settled,
    screenFailure:
      failure !== null && !editorShowsFailure && !listShowsFailure ? failure : null,
    dialogs,
  };
}

/** Lo que `RefObject` pide, buscado cuando el diálogo lo lee al cerrarse. */
function lazyRef(get: () => HTMLElement | null): RefObject<HTMLElement | null> {
  return {
    get current() {
      return get();
    },
  };
}

type CellDetailDialogsProps = {
  readonly dialogs: DetailDialogs;
  readonly state: TimesheetState;
};

/**
 * Los diálogos del detalle (§5.2). En TS-41 el editor y la confirmación van
 * sueltos; en TS-42 van como hijos de la lista, que es lo que necesita Base UI
 * para anidarlos.
 */
export function CellDetailDialogs({ dialogs, state }: CellDetailDialogsProps) {
  const { detail, places } = dialogs;
  if (detail === null) {
    return null;
  }
  const { editor, confirm } = detail;

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
      pending={dialogs.editorPending}
      failure={dialogs.editorFailure}
      onCancel={dialogs.cancelEditor}
      onSave={(entryChanges) => dialogs.saveEntry(editor.entry, entryChanges)}
      onDelete={() => dialogs.deleteFromEditor(editor)}
      cancelFocus={lazyRef(() => editorCancelTarget(editor, places))}
      fallbackFocus={lazyRef(() => editorCloseTarget(editor, places))}
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
          dialogs.closeConfirm();
        }
      }}
      onConfirm={() => dialogs.confirmDelete(confirm)}
      finalFocus={lazyRef(() => confirmTarget(confirm, places))}
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
      open={detail.listOpen}
      cellName={detail.cellName}
      entries={dialogs.entries}
      changes={dialogs.changes}
      failure={dialogs.listFailure}
      titleRef={dialogs.titleRef}
      listRef={dialogs.listRef}
      nestedOpen={dialogs.nestedOpen}
      onEdit={dialogs.editFromList}
      onDelete={dialogs.deleteFromList}
      onRetry={dialogs.retryFromList}
      onCancel={dialogs.cancelList}
      // Sin el disparador, `useDialogReturnFocus` cae en `fallbackFocus`.
      cancelFocus={lazyRef(places.trigger)}
      fallbackFocus={lazyRef(places.destination)}
    >
      {editorDialog}
      {confirmDialog}
    </CellEntriesDialog>
  );
}
