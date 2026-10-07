"use client";

import { useCallback, useEffect, useOptimistic, useRef, useState } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAction, type ActionFailure, type ActionHandle } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import {
  createManualEntry,
  deleteEntry,
  duplicateEntry,
  stopTimer,
  updateEntry,
  updateEntryTimes,
} from "@/modules/time-entry/actions";
import {
  timeEntryMessages,
  type CalendarState,
  type TimeEntryView,
  type UpdateEntryChanges,
  type UpdateEntryTimesInput,
} from "@/modules/time-entry/schema";
import { weekdayLabel } from "@/server/time";

import { DeleteEntryDialog } from "../delete-entry-dialog";
import { useElapsedSeconds } from "../elapsed-counter";
import { entryNameOf } from "../labels";
import {
  answersSent,
  recordSent,
  type NewEntryRequest,
  type SentRequests,
} from "../sent-entry";
import type { TimeDraft } from "../time-draft";
import { useTrackerRefresh } from "../use-tracker-refresh";
import { CalendarGrid } from "./calendar-grid";
import {
  addEntryDraft,
  isOutsidePeriod,
  nowPosition,
  slotDraft,
} from "./calendar-layout";
import { CalendarToolbar, ZoomControls } from "./calendar-toolbar";
import { calendarZoomCookie, type CalendarZoom } from "./calendar-zoom";
import { CalendarNotices, CLOSING_CODES, dialogFailureOf } from "./calendar-notices";
import { EntryDialog, type DialogSubject } from "./entry-dialog";
import { calendarLabels } from "./labels";
import { focusIsFree } from "./use-pending-block-focus";

/** El alta no parte de ninguna entrada: su id pendiente va con una clave fija. */
const ADD_KEY = "add";

type CalendarViewProps = {
  readonly state: CalendarState;
  readonly initialZoom: CalendarZoom;
};

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
  /**
   * El aviso de CAL-46 habla del período que se ve: otro período, por la
   * navegación o por su enlace, lo baja. Los avisos de error se quedan, porque
   * hablan de una operación.
   */
  const period = `${state.mode}:${state.periodStart}`;
  const [outsidePeriod, setOutsidePeriod] = useState(period);
  if (outsidePeriod !== period) {
    setOutsidePeriod(period);
    setOutside(null);
  }
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
  /** Los pedidos del alta que salieron con el id pendiente (r3-1). */
  const sentCreates = useRef<SentRequests | null>(null);
  /**
   * El último desenlace del alta, que decide si su id sigue pendiente. Sobrevive
   * al aviso: cerrar el diálogo o abrir otro no renueva el id, como en la barra
   * (F1/P2); solo el éxito o una falla con otro código lo renuevan.
   */
  const [createOutcome, setCreateOutcome] = useState<ActionFailure | null>(null);
  /** r2-1: el alta respondió la entrada de un pedido anterior y el diálogo sigue abierto. */
  const [replayedAdd, setReplayedAdd] = useState(false);

  /** Un gesto de arrastre está en curso: la revalidación periódica espera (CAL-89). */
  const [gestureActive, setGestureActive] = useState(false);
  useTrackerRefresh(gestureActive);
  // CAL-36: la línea de ahora es el minuto del servidor más lo transcurrido
  // desde esa lectura, sin la zona ni el reloj de la máquina (TT-32).
  const elapsed = useElapsedSeconds(state.serverNow, state.serverNow);
  const now = nowPosition(state, elapsed);
  const days = state.days.map((day) => day.date);

  /** CAL-46: sin segmentos en el período, la entrada no se ve; si no, toma el foco. */
  function landed(entry: TimeEntryView): void {
    if (isOutsidePeriod(entry, days)) {
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
    onSuccess: (data, input) => {
      setCreateOutcome(null);
      // r2-1: con el id pendiente, el servidor responde la fila del primer
      // intento. Si lo mandado era otra cosa, no se guardó: queda en el diálogo.
      if (!answersSent(data.created, input.id, input, sentCreates.current)) {
        setReplayedAdd(true);
        return;
      }
      setOpen(false);
      landed(data.created);
    },
    onFailure: setCreateOutcome,
  });
  const nextCreateId = useNewId(createOutcome);
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
  /** CAL-62: el bloque soltado se dibuja en su lugar nuevo mientras viaja su pedido. */
  const [movingTimes, showMovingTimes] = useOptimistic<
    UpdateEntryTimesInput | null,
    UpdateEntryTimesInput
  >(null, (_, input) => input);
  /** El id del último pedido de horario: adonde vuelve el foco si falla. */
  const movingIdRef = useRef<string | null>(null);
  const moveTimes = useAction(updateEntryTimes, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => showMovingTimes(input),
    onSuccess: (data) => returnFocusTo(data.entry.id),
    onFailure: () => returnFocusTo(movingIdRef.current),
  });

  /**
   * La respuesta de un gesto devuelve el foco al bloque solo si nadie lo llevó
   * a otro lado mientras viajaba: sigue en el bloque, en la región o cayó en
   * `body` porque el bloque cambió de columna. Si la persona ya hizo otra cosa
   * —el zoom, otro período—, un foco pendiente se lo robaría al próximo clic
   * en la grilla, que enfoca la región.
   */
  function returnFocusTo(id: string | null): void {
    if (focusIsFree(document.activeElement, regionRef.current, id)) {
      setFocusEntryId(id);
    }
  }
  const handles: readonly ActionHandle<never>[] = [
    save,
    create,
    stop,
    duplicate,
    remove,
    moveTimes,
  ];

  /** Una operación nueva baja los avisos anteriores (§5.4). */
  function clearNotices(): void {
    for (const handle of handles) {
      handle.clear();
    }
    setReplayedAdd(false);
    setOutside(null);
  }

  function run<Input>(handle: ActionHandle<Input>, input: Input): void {
    clearNotices();
    // El foco pendiente es de la operación anterior: no se lo lleva un foco
    // posterior en la región.
    setFocusEntryId(null);
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
    setReplayedAdd(false);
    setFocusEntryId(null);
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

  function handleDropTimes(input: UpdateEntryTimesInput): void {
    movingIdRef.current = input.id;
    run(moveTimes, input);
  }

  /** CAL-44: el rango arrastrado abre el alta del 8c, que vuelve a la región al cancelar. */
  function handleSelectRange(draft: TimeDraft): void {
    openSubject({ kind: "add", draft, opener: "slot" });
  }

  /**
   * Al empezar, un foco pendiente de otra operación se descarta; al terminar un
   * gesto sobre un bloque, con o sin pedido o cancelado, el foco va a su botón
   * (§5.7). Llega después de `onDrop` y del `run` que lo limpia.
   */
  function handleGestureChange(active: boolean, entryId: string | null): void {
    setGestureActive(active);
    if (active) {
      setFocusEntryId(null);
    } else if (entryId !== null) {
      setFocusEntryId(entryId);
    }
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

  /**
   * Después de una falla por red, el id pendiente con el borrador de ahora
   * (D2c-1, D2c-2), aunque el diálogo se haya cerrado entre medio (F1/P2).
   */
  function handleAdd(input: NewEntryRequest): void {
    const id = nextCreateId(ADD_KEY);
    sentCreates.current = recordSent(sentCreates.current, id, input);
    run(create, { ...input, id });
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
        <CalendarNotices
          save={save}
          stop={stop}
          duplicate={duplicate}
          remove={remove}
          moveTimes={moveTimes}
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
          // `|| confirmingDelete` es defensa: con la confirmación abierta, el fondo
          // del modal tapa la grilla y ningún detalle se abre, así que ningún test
          // lo distingue de `open` (T-n6).
          dialogOpen={open || confirmingDelete}
          onOpen={openEntry}
          onSlot={openSlot}
          focusEntryId={focusEntryId}
          onEntryFocused={clearFocusEntry}
          regionRef={regionRef}
          movingTimes={movingTimes}
          // Un gesto por vez: mientras viaja un pedido de horario, apretar es un clic.
          gesturesEnabled={state.canTrack && !moveTimes.pending}
          onDropTimes={handleDropTimes}
          onSelectRange={handleSelectRange}
          onGestureChange={handleGestureChange}
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
        failure={dialogFailureOf(subject, save, create, replayedAdd)}
        onCancel={() => {
          setOpen(false);
          // Cerrar sin acción no deja un foco pendiente de otra operación (M3).
          setFocusEntryId(null);
        }}
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
          onOpenChange={(next) => {
            setConfirmingDelete(next);
            if (!next) {
              setFocusEntryId(null);
            }
          }}
          onConfirm={confirmDelete}
          finalFocus={deleteReturnRef}
        />
      )}
    </TooltipProvider>
  );
}
