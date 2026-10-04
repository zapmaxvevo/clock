"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  type RefObject,
} from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { useDisplayFormats } from "@/components/layout/display-formats";
import { TooltipProvider } from "@/components/ui/tooltip";
import { retryHandlerOf, useAction, type ActionHandle } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import {
  createManualEntry,
  deleteEntry,
  duplicateEntry,
  stopTimer,
  updateEntry,
} from "@/modules/time-entry/actions";
import {
  timeEntryMessages,
  type CalendarState,
  type CreateManualEntryInput,
  type TimeEntryView,
  type UpdateEntryChanges,
} from "@/modules/time-entry/schema";
import { weekdayLabel } from "@/server/time";

import { DeleteEntryDialog } from "../delete-entry-dialog";
import { useElapsedSeconds } from "../elapsed-counter";
import { entryNameOf, trackerLabels } from "../labels";
import { useTrackerRefresh } from "../use-tracker-refresh";
import { CalendarGrid } from "./calendar-grid";
import { calendarHref } from "./calendar-href";
import { addEntryDraft, entrySegments, nowPosition, slotDraft } from "./calendar-layout";
import { CalendarToolbar, ZoomControls } from "./calendar-toolbar";
import { calendarZoomCookie, type CalendarZoom } from "./calendar-zoom";
import { EntryDialog, type DialogSubject, type EntryDialogFailure } from "./entry-dialog";
import { calendarLabels } from "./labels";

type CalendarViewProps = {
  readonly state: CalendarState;
  readonly initialZoom: CalendarZoom;
};

/** Las fallas de «Guardar» que cierran el diálogo: no hay nada que corregir en él. */
const CLOSING_CODES: readonly string[] = ["not_found", "already_stopped"];

/**
 * El dueño de la pantalla del calendario en el cliente: el zoom con su
 * cookie, el diálogo de una entrada y sus pedidos (§5.4), la confirmación del
 * borrado, los avisos de la región, a quién vuelve el foco y la revalidación
 * periódica (P-11).
 */
export function CalendarView({ state, initialZoom }: CalendarViewProps) {
  const { date } = useDisplayFormats();
  const [zoom, setZoom] = useState(initialZoom);
  const [open, setOpen] = useState(false);
  /**
   * Lo que muestra el diálogo, como estaba al abrirlo (CAL-72): una
   * revalidación no lo cambia. No se limpia al cerrar, así el cuerpo no queda
   * vacío durante la animación de salida, y su entrada es el bloque al que
   * vuelve el foco, también mientras dura la confirmación del borrado.
   */
  const [subject, setSubject] = useState<DialogSubject | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  /** La entrada cuyo bloque toma el foco cuando la grilla lo dibuja (§5.5). */
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  /** CAL-46: la entrada guardada o creada que quedó fuera del período. */
  const [outside, setOutside] = useState<TimeEntryView | null>(null);
  const clearFocusEntry = useCallback(() => setFocusEntryId(null), []);
  const [removedIds, showRemoved] = useOptimistic<readonly string[], string>(
    [],
    (ids, id) => [...ids, id],
  );

  /** El botón del bloque de la entrada del sujeto; `null` si una revalidación lo sacó. */
  const openerRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  /** Un alta desde una franja vuelve a la región: la franja no es un control (CAL-76). */
  const noFocusRef = useRef<HTMLElement>(null);
  const regionRef = useRef<HTMLElement>(null);
  /**
   * El bloque que abrió la confirmación del borrado, tomado al abrirla. Si se
   * borra o una revalidación lo saca, queda desconectado y Base UI no le puede
   * dar el foco: lo deja donde lo pusieron los efectos de abajo, en la región.
   * Con `openerRef`, que React pone en `null`, Base UI lo devolvería al último
   * elemento que recuerda de un diálogo anterior.
   */
  const deleteReturnRef = useRef<HTMLElement>(null);

  useTrackerRefresh();
  // CAL-36: la línea de ahora es el minuto del servidor más lo transcurrido
  // desde esa lectura, sin la zona ni el reloj de la máquina (TT-32).
  const elapsed = useElapsedSeconds(state.serverNow, state.serverNow);
  const now = nowPosition(state, elapsed);
  const days = state.days.map((day) => day.date);

  /** CAL-46: sin segmentos en el período, la entrada no se ve; si no, toma el foco. */
  function landed(entry: TimeEntryView): void {
    if (entrySegments(entry, days).length === 0) {
      setOutside(entry);
      return;
    }
    setFocusEntryId(entry.id);
  }

  const save = useAction(updateEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data) => {
      setOpen(false);
      landed(data.entry);
    },
    onFailure: (failure) => {
      if (CLOSING_CODES.includes(failure.code)) {
        setOpen(false);
      }
    },
  });
  const create = useAction(createManualEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data) => {
      setOpen(false);
      landed(data.created);
    },
  });
  const stop = useAction(stopTimer, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data) => setFocusEntryId(data.stopped.id),
  });
  const duplicate = useAction(duplicateEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data) => landed(data.created),
  });
  const nextDuplicateId = useNewId(duplicate.failure);
  const remove = useAction(deleteEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => showRemoved(input.id),
  });
  const handles: readonly ActionHandle<never>[] = [save, create, stop, duplicate, remove];

  /** Una operación nueva baja los avisos anteriores (§5.4). */
  function clearNotices(): void {
    for (const handle of handles) {
      handle.clear();
    }
    setOutside(null);
  }

  function run<Input>(handle: ActionHandle<Input>, input: Input): void {
    clearNotices();
    handle.run(input);
  }

  // El bloque borrado se lleva el foco con él: aterriza en la región.
  const removing = remove.pending && removedIds.length > 0;
  const wasRemoving = useRef(false);
  useEffect(() => {
    if (removing && !wasRemoving.current) {
      regionRef.current?.focus();
    }
    wasRemoving.current = removing;
  }, [removing]);

  // Cancelar el borrado devuelve el foco al bloque; si una revalidación lo
  // sacó mientras la confirmación estaba abierta, a la región.
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirmingDelete && wasConfirming.current && openerRef.current === null) {
      regionRef.current?.focus();
    }
    wasConfirming.current = confirmingDelete;
  }, [confirmingDelete]);

  /** El aviso del diálogo es de lo que se abrió: otra apertura arranca sin él. */
  function openSubject(next: DialogSubject): void {
    if (save.failure !== null && !CLOSING_CODES.includes(save.failure.code)) {
      save.clear();
    }
    create.clear();
    setSubject(next);
    setOpen(true);
  }

  function openEntry(id: string): void {
    const entry =
      state.running?.id === id
        ? state.running
        : state.entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      return;
    }
    openSubject({ kind: "entry", entry });
  }

  function openSlot(day: string, minute: number): void {
    const missing = state.days.find(
      (candidate) => candidate.date === day,
    )?.missingMinutes;
    openSubject({
      kind: "add",
      draft: slotDraft(day, minute, zoom, missing ?? []),
      opener: "slot",
    });
  }

  function openAdd(): void {
    openSubject({
      kind: "add",
      draft: addEntryDraft(days, now, state.minDayKey, zoom),
      opener: "button",
    });
  }

  function changeZoom(next: CalendarZoom): void {
    // CAL-12: la próxima visita llega dibujada con el zoom elegido.
    document.cookie = calendarZoomCookie(next);
    setZoom(next);
  }

  const entry = subject?.kind === "entry" ? subject.entry : null;

  function handleSave(changes: UpdateEntryChanges): void {
    if (entry !== null) {
      run(save, { id: entry.id, changes });
    }
  }

  function handleAdd(input: CreateManualEntryInput): void {
    run(create, input);
  }

  function handleStop(): void {
    if (entry === null) {
      return;
    }
    setOpen(false);
    run(stop, { id: entry.id });
  }

  function handleDuplicate(): void {
    if (entry === null) {
      return;
    }
    setOpen(false);
    const id = nextDuplicateId(entry.id);
    run(duplicate, { id, sourceId: entry.id });
  }

  function handleDelete(): void {
    deleteReturnRef.current = openerRef.current;
    setOpen(false);
    setConfirmingDelete(true);
  }

  function confirmDelete(): void {
    if (entry !== null) {
      run(remove, { id: entry.id });
    }
  }

  const cancelFocus =
    subject?.kind === "add"
      ? subject.opener === "button"
        ? addButtonRef
        : noFocusRef
      : openerRef;

  return (
    <TooltipProvider>
      <section
        ref={regionRef}
        aria-label={calendarLabels.region}
        tabIndex={-1}
        className="flex flex-col gap-3 outline-none"
      >
        <CalendarToolbar
          state={state}
          removedIds={removedIds}
          addButtonRef={addButtonRef}
          onAdd={openAdd}
        />
        <Notices
          save={save}
          stop={stop}
          duplicate={duplicate}
          remove={remove}
          outside={outside}
          outsideLabel={(view) => weekdayLabel(view.dayDate, state.todayKey, date)}
          mode={state.mode}
          regionRef={regionRef}
          clearNotices={clearNotices}
        />
        <CalendarGrid
          // Cada vista y cada período se desplazan de nuevo (CAL-14); una
          // revalidación no.
          key={`${state.mode}:${state.periodStart}`}
          state={state}
          now={now}
          zoom={zoom}
          removedIds={removedIds}
          corner={<ZoomControls zoom={zoom} onChange={changeZoom} />}
          openerId={entry?.id ?? null}
          openerRef={openerRef}
          dialogOpen={open || confirmingDelete}
          onOpen={openEntry}
          onSlot={state.canTrack ? openSlot : null}
          focusEntryId={focusEntryId}
          onEntryFocused={clearFocusEntry}
          regionRef={regionRef}
        />
      </section>
      <EntryDialog
        open={open}
        subject={subject}
        canTrack={state.canTrack}
        serverNow={state.serverNow}
        todayKey={state.todayKey}
        minDayKey={state.minDayKey}
        pending={subject?.kind === "add" ? create.pending : save.pending}
        failure={dialogFailureOf(subject, save, create)}
        onCancel={() => setOpen(false)}
        onSave={handleSave}
        onAdd={handleAdd}
        onStop={handleStop}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
        cancelFocus={cancelFocus}
        // Al pasar a la confirmación del borrado el foco queda en ella: llevarlo a
        // la región, después de la animación de salida, lo sacaría del modal.
        regionRef={confirmingDelete ? noFocusRef : regionRef}
      />
      {entry !== null && (
        <DeleteEntryDialog
          name={entryNameOf(entry.description)}
          startLabel={entry.startLabel}
          endLabel={entry.endLabel}
          open={confirmingDelete}
          onOpenChange={setConfirmingDelete}
          onConfirm={confirmDelete}
          finalFocus={deleteReturnRef}
        />
      )}
    </TooltipProvider>
  );
}

/** El aviso del diálogo, con la falla del pedido del modo abierto (§5.4). */
function dialogFailureOf(
  subject: DialogSubject | null,
  save: ActionHandle<never>,
  create: ActionHandle<never>,
): EntryDialogFailure | null {
  if (subject?.kind === "add") {
    if (create.failure === null) {
      return null;
    }
    // TT-109: el alta no tiene id del cliente; no se sabe si quedó escrita.
    return create.failure.code === "unexpected"
      ? {
          title: trackerLabels.addLostTitle,
          message: calendarLabels.addLostMessage,
          retryable: false,
        }
      : {
          title: trackerLabels.entryNotAdded,
          message: create.failure.message,
          retryable: false,
        };
  }
  if (save.failure === null || CLOSING_CODES.includes(save.failure.code)) {
    return null;
  }
  return {
    title: calendarLabels.entryNotSaved,
    message: save.failure.message,
    retryable: save.failure.code === "unexpected",
  };
}

type NoticesProps = {
  readonly save: ActionHandle<never>;
  readonly stop: ActionHandle<never>;
  readonly duplicate: ActionHandle<never>;
  readonly remove: ActionHandle<never>;
  readonly outside: TimeEntryView | null;
  readonly outsideLabel: (entry: TimeEntryView) => string;
  readonly mode: CalendarState["mode"];
  readonly regionRef: RefObject<HTMLElement | null>;
  readonly clearNotices: () => void;
};

/**
 * Los avisos que sobreviven al diálogo, en la región de la pantalla (§5.4).
 * «Reintentar» se va con su aviso: el foco pasa antes a la región.
 */
function Notices({
  save,
  stop,
  duplicate,
  remove,
  outside,
  outsideLabel,
  mode,
  regionRef,
  clearNotices,
}: NoticesProps) {
  function retryOf(handle: ActionHandle<never>): (() => void) | undefined {
    const retry = retryHandlerOf(handle);
    return retry === undefined
      ? undefined
      : () => {
          regionRef.current?.focus();
          clearNotices();
          retry();
        };
  }

  const savedFailure =
    save.failure !== null && CLOSING_CODES.includes(save.failure.code)
      ? save.failure
      : null;
  const notices = [
    savedFailure !== null && (
      <ActionFeedback
        key="save"
        title={calendarLabels.entryNotSaved}
        message={savedFailure.message}
      />
    ),
    stop.failure !== null && (
      <ActionFeedback
        key="stop"
        title={trackerLabels.timerNotStopped}
        message={stop.failure.message}
        onRetry={retryOf(stop)}
      />
    ),
    duplicate.failure !== null && (
      <ActionFeedback
        key="duplicate"
        title={trackerLabels.entryNotDuplicated}
        message={duplicate.failure.message}
        onRetry={retryOf(duplicate)}
      />
    ),
    remove.failure !== null && (
      <ActionFeedback
        key="remove"
        title={trackerLabels.entryNotDeleted}
        message={remove.failure.message}
        onRetry={retryOf(remove)}
      />
    ),
    outside !== null && (
      <ActionFeedback
        key="outside"
        tone="info"
        title={
          mode === "day"
            ? calendarLabels.outsideDay(outsideLabel(outside))
            : calendarLabels.outsideWeek(outsideLabel(outside))
        }
      >
        <Link
          href={
            mode === "day"
              ? calendarHref("day", outside.dayDate)
              : calendarHref("week", outside.weekStart)
          }
          className="underline underline-offset-4"
        >
          {mode === "day" ? calendarLabels.goToDay : calendarLabels.goToWeek}
        </Link>
      </ActionFeedback>
    ),
  ].filter(Boolean);

  return notices.length === 0 ? null : (
    <div className="flex flex-col gap-2">{notices}</div>
  );
}
