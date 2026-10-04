"use client";

import { useEffect, useOptimistic, useRef, useState } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { retryHandlerOf, useAction, type ActionHandle } from "@/hooks/use-action";
import { useNewId } from "@/hooks/use-new-id";
import { samePair } from "@/lib/project-pair";
import { projectLabels } from "@/modules/project/components/labels";
import { NO_SELECTION, selectionIds } from "@/modules/project/components/picker-model";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import type { ProjectSelection } from "@/modules/project/schema";
import {
  createManualEntry,
  discardTimer,
  startTimer,
  stopTimer,
  updateDescription,
  updateRunningStart,
} from "@/modules/time-entry/actions";
import {
  timeEntryMessages,
  type TimeEntryView,
  type UpdateRunningStartInput,
} from "@/modules/time-entry/schema";

import { DescriptionField } from "./description-field";
import { DiscardTimerDialog } from "./discard-timer-dialog";
import { saveEntryProject, selectionOf } from "./entry-project";
import { startedWeeks } from "./entry-week";
import { trackerLabels } from "./labels";
import { ManualBar } from "./manual-bar";
import { ModeSwitch } from "./mode-switch";
import {
  draftAfterDiscard,
  resolvesDiscard,
  type PendingDiscard,
} from "./pending-discard";
import { useReachWeek } from "./reach-week";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { reset, sameDraft } from "./time-draft";
import { TimerBar, type Phase } from "./timer-bar";
import { trackerModeCookie, type TrackerMode } from "./tracker-mode";
import { useTrackerRefresh } from "./use-tracker-refresh";
import { useTrackerShortcuts } from "./use-tracker-shortcuts";

/** TT-04: cuánto espera el guardado automático después de la última tecla. */
const DESCRIPTION_DEBOUNCE_MS = 500;

/** «Iniciar» no parte de ninguna entrada: su id pendiente va con una clave fija. */
const START_KEY = "start";

/** El par del timer; sin timer, «Sin proyecto». */
function runningSelection(running: TimeEntryView | null): ProjectSelection {
  return running === null ? NO_SELECTION : selectionOf(running);
}

type TrackerBarProps = {
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly timeZone: string;
  /** Día de hoy en la zona del workspace. */
  readonly todayKey: string;
  /** Piso del workspace, el primer día que la barra manual puede elegir. */
  readonly minDayKey: string;
  readonly canTrack: boolean;
  /** Modo recordado, leído de la cookie en el servidor (TT-16). */
  readonly initialMode: TrackerMode;
};

/**
 * La barra del rastreador: elige qué modo se dibuja y es dueña de todo lo que
 * tiene que sobrevivir a un cambio de modo. Un timer que arranca o se detiene
 * en otra pestaña cambia la barra de modo sin que nadie lo pida (TT-30), así
 * que la descripción, el borrador manual, los pedidos, sus avisos y la
 * confirmación del descarte viven acá y no en la barra de cada modo. El
 * proyecto y la tarea siguen las mismas reglas que la descripción. El
 * conmutador y los atajos `n`, `s` y `m` también: así el conmutador no cambia
 * de lugar ni pierde el foco al conmutar, y cada atajo ve el mismo estado que
 * su control.
 *
 * `useTrackerRefresh()` se llama acá y no adentro de la barra del timer: si
 * viviera ahí, la revalidación de P-11 dejaría de correr en modo manual.
 *
 * Todas las mutaciones de la barra que devuelven vistas pasan sus semanas por
 * la regla de P-15, también la del inicio del timer: una entrada que queda
 * antes de la ventana la extiende hasta su semana.
 */
export function TrackerBar({
  running,
  serverNow,
  timeZone,
  todayKey,
  minDayKey,
  canTrack,
  initialMode,
}: TrackerBarProps) {
  useTrackerRefresh();
  const reachWeek = useReachWeek();

  const [mode, setMode] = useState<TrackerMode>(initialMode);
  /**
   * La fase del arranque y la parada: el conmutador tiene que quedar inactivo
   * desde el clic y no desde que el servidor contesta.
   */
  const [phase, showPhase] = useOptimistic<Phase, Phase>(
    "idle",
    (_current, next) => next,
  );
  const [draft, setDraft] = useState(running?.description ?? "");
  const [editing, setEditing] = useState(false);
  /** Lo último que mostró el servidor, para notar cuándo cambia de verdad. */
  const [serverState, setServerState] = useState({
    id: running?.id ?? null,
    description: running?.description ?? "",
  });
  /**
   * El proyecto y la tarea sin timer: viajan con «Iniciar» y con «Agregar».
   * Con un timer en la vista la barra muestra los de la entrada abierta,
   * también mientras viaja «Detener» o «Descartar».
   */
  const [pairDraft, setPairDraft] = useState(() => runningSelection(running));
  /** Lo mismo que `heldDescription`, para el par. */
  const [heldPair, setHeldPair] = useState<ProjectSelection | null>(null);
  /** TT-27 y TT-90: lo elegido mientras el cambio viaja; si falla, vuelve el del servidor. */
  const [runningPairEdit, showRunningPairEdit] = useOptimistic<
    ProjectSelection | null,
    ProjectSelection
  >(null, (_current, next) => next);
  /** Descripción del guardado en vuelo: el rebote y el blur no lo repiten. */
  const [inFlightDescription, setInFlightDescription] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState(() => reset(serverNow, timeZone));
  /**
   * Descripción que se estaba escribiendo en modo manual cuando llegó un timer
   * de otro lado. El campo pasa a mostrar la del timer, y esta vuelve cuando
   * el timer se detiene.
   */
  const [heldDescription, setHeldDescription] = useState<string | null>(null);
  /**
   * El timer que se descarta, fijado al abrir la confirmación: si mientras el
   * diálogo está abierto llega otro timer, confirmar no lo borra (§4.3).
   */
  const [discardId, setDiscardId] = useState<string | null>(null);
  /**
   * El descarte confirmado, hasta que la vista lo resuelve: la descripción
   * que se va con el timer es la que había al confirmar.
   */
  const [pendingDiscard, setPendingDiscard] = useState<PendingDiscard | null>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  /** El botón de menú de la barra del timer, adonde vuelve el foco al cancelar. */
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  /**
   * TT-65: al confirmar el descarte el diálogo deja el foco en la descripción.
   * Mientras el descarte viaja, si el foco queda sin dueño vuelve a ella: el
   * campo se vuelve a montar cuando la barra pasa a manual, el diálogo se fue
   * antes de cerrarse, o «Reintentar» se fue con su aviso.
   */
  const focusAfterDiscard = useRef(false);
  /**
   * El selector abierto cuando la barra cambia de modo se va sin elegir; si el
   * foco queda sin dueño, vuelve al disparador de la barra nueva.
   */
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const pickerOpen = useRef(false);

  const save = useAction(updateDescription, {
    unreachableMessage: timeEntryMessages.unexpected,
    // TT-90: si el guardado falla, el campo vuelve al valor que tiene el servidor.
    onFailure: () => setDraft(running?.description ?? ""),
    onSuccess: (data) => reachWeek([data.entry.weekStart]),
  });
  const start = useAction(startTimer, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: () => showPhase("starting"),
    onSuccess: (data) => reachWeek(startedWeeks(data)),
  });
  const newStartId = useNewId(start.failure);
  const stop = useAction(stopTimer, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: () => showPhase("stopping"),
    onSuccess: (data) => reachWeek([data.stopped.weekStart]),
  });
  const discard = useAction(discardTimer, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: () => showPhase("discarding"),
  });
  const saveProject = useAction(saveEntryProject, {
    unreachableMessage: timeEntryMessages.unexpected,
    optimistic: (input) => showRunningPairEdit(input.selection),
    onSuccess: (data) => reachWeek([data.entry.weekStart]),
  });
  /**
   * TT-28: sin vista optimista; el contador salta cuando llega la vista nueva.
   * Vive acá con el arranque y la parada, así su aviso sobrevive a que la
   * barra cambie de modo y lo baja la operación siguiente.
   */
  const saveStart = useAction(updateRunningStart, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data) => reachWeek([data.running.weekStart]),
  });
  /**
   * Agregar limpia la barra solo cuando el servidor confirmó, así una falla
   * de red deja lo tecleado donde está (TT-89). No ofrece «Reintentar»: ver
   * el aviso de respuesta perdida (TT-109).
   */
  const add = useAction(createManualEntry, {
    unreachableMessage: timeEntryMessages.unexpected,
    onSuccess: (data, input) => {
      // Lo que se tecleó mientras el pedido viajaba no es parte de la entrada
      // creada: se limpia solo lo que sigue igual a lo que se mandó.
      setDraft((current) => (current === input.description ? "" : current));
      // El esquema acepta el par ausente, que es «sin proyecto».
      const sent = { projectId: input.projectId ?? null, taskId: input.taskId ?? null };
      setPairDraft((current) =>
        samePair(selectionIds(current), sent) ? NO_SELECTION : current,
      );
      setManualDraft((current) =>
        sameDraft(current, input) ? reset(serverNow, timeZone) : current,
      );
      reachWeek([data.created.weekStart]);
      // TT-25: la barra queda lista para la próxima entrada si el foco sigue
      // donde lo dejó el agregado. Si la persona ya está en otro control —una
      // hora de la barra, por ejemplo—, moverlo confirmaría lo que está
      // escribiendo a medias.
      const focused = document.activeElement;
      if (
        focused === null ||
        focused === document.body ||
        focused === addRef.current ||
        focused === descriptionRef.current
      ) {
        descriptionRef.current?.focus();
      }
    },
  });

  const serverId = running?.id ?? null;
  const serverDescription = running?.description ?? "";
  const serverPair = runningSelection(running);

  // La descripción del campo sigue a la del servidor, que puede cambiar sin
  // que cambie la entrada: otro dispositivo la editó y la revalidación la
  // trajo (TT-39, TT-40). Lo tecleado solo gana mientras el campo tiene el
  // foco o su guardado viaja; en ese caso el valor nuevo se da por visto
  // igual, así no vuelve a pisar el campo cuando se sale de él.
  if (serverState.id !== serverId || serverState.description !== serverDescription) {
    setServerState({ id: serverId, description: serverDescription });
    // Con otro timer en pantalla, reintentar el arranque ya no tiene sentido:
    // si es el que creó el pedido cuya respuesta se perdió, no haría nada, y si
    // vino de otra pestaña, lo cerraría sin que nadie lo pida (ADR 0007).
    if (serverState.id !== serverId) {
      start.clear();
      setPendingDiscard(null);
      // El par sigue al timer nuevo, o queda sin proyecto al detenerse
      // (TT-65); los casos forzados de abajo lo retienen y lo devuelven.
      setPairDraft(serverPair);
      if (saveProject.failure?.code === "unexpected") {
        saveProject.clear();
      }
      // Lo mismo con el inicio: «Reintentar» apuntaría a un timer que ya no
      // está. Un `already_stopped` llega en el mismo render que la vista sin
      // el timer y es justamente lo que hay que mostrar, así que se queda.
      if (saveStart.failure?.code === "unexpected") {
        saveStart.clear();
      }
    }
    // Con el modo elegido en manual, un timer que llega o se va cambia la
    // barra de modo y el campo se vuelve a montar sin pasar por su blur: lo
    // tecleado no es de esa entrada y la guarda de edición no aplica.
    const forcedIn = mode === "manual" && serverState.id === null && serverId !== null;
    const forcedOut = mode === "manual" && serverState.id !== null && serverId === null;
    if (forcedIn) {
      setHeldDescription(draft);
      setDraft(serverDescription);
      setHeldPair(pairDraft);
      setEditing(false);
    } else if (forcedOut) {
      setDraft(heldDescription ?? serverDescription);
      setHeldDescription(null);
      setPairDraft(heldPair ?? serverPair);
      setHeldPair(null);
      setEditing(false);
    } else if (resolvesDiscard(pendingDiscard, serverState.id, serverId)) {
      // TT-65: la descripción se va con el timer descartado, con el foco en el
      // campo o no, y también si el descarte terminó en `already_stopped`.
      setDraft(draftAfterDiscard(pendingDiscard, draft));
    } else if (!editing && !save.pending) {
      setDraft(serverDescription);
    }
  }

  // TT-30: con un timer corriendo la barra queda en modo timer aunque el modo
  // recordado sea manual. La cookie no se toca: al detener vuelve el elegido.
  const isManual = mode === "manual" && running === null;
  const switching = phase !== "idle";
  const isRunning =
    phase === "starting"
      ? true
      : phase === "stopping" || phase === "discarding"
        ? false
        : running !== null;
  const timerControls = canTrack && !isManual && !switching;
  /** TT-30: con un timer corriendo o una operación de la barra en vuelo. */
  const modeSwitchDisabled = isRunning || switching || add.pending;
  /**
   * Con un timer en la vista, el par es el de la entrada, con lo elegido
   * mientras viaja (TT-27): también mientras viaja «Detener» o «Descartar»,
   * que no lo cambian. Sin timer, o mientras viaja «Iniciar», el borrador.
   */
  const editsRunningPair = running !== null && phase !== "starting";
  const shownPair = editsRunningPair ? (runningPairEdit ?? serverPair) : pairDraft;

  useEffect(() => {
    if (!focusAfterDiscard.current) {
      return;
    }
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      descriptionRef.current?.focus();
    }
    if (phase === "idle") {
      focusAfterDiscard.current = false;
    }
  }, [phase, isManual]);

  useEffect(() => {
    if (!pickerOpen.current) {
      return;
    }
    pickerOpen.current = false;
    const focused = document.activeElement;
    if (focused === null || focused === document.body) {
      pickerTriggerRef.current?.focus();
    }
  }, [isManual]);

  /**
   * Un aviso describe el desenlace de una operación y un descarte confirmado
   * espera el suyo: la operación siguiente deja viejos a los dos.
   */
  function clearNotices(): void {
    save.clear();
    start.clear();
    stop.clear();
    saveStart.clear();
    saveProject.clear();
    discard.clear();
    add.clear();
    setPendingDiscard(null);
  }

  function handleCommit(next: string): void {
    // El servidor guarda la descripción sin espacios en los bordes, así que
    // un texto que solo difiere en eso no es un cambio que valga una escritura.
    if (running === null || next.trim() === serverDescription) {
      return;
    }
    // Con el descarte en vuelo, el guardado iría contra un timer que se está
    // borrando. Si el descarte falla, lo tecleado sigue en el campo y se
    // guarda con la próxima confirmación.
    if (phase === "discarding") {
      return;
    }
    // Lo único que se descarta es el pedido repetido que ya está viajando: el
    // rebote y la salida del campo mandan el mismo valor dos veces.
    if (save.pending && next === inFlightDescription) {
      return;
    }
    clearNotices();
    setInFlightDescription(next);
    save.run({ id: running.id, description: next });
  }

  function handleToggle(): void {
    if (running === null) {
      const id = newStartId(START_KEY);
      clearNotices();
      start.run({ id, description: draft, ...selectionIds(pairDraft) });
      return;
    }
    clearNotices();
    stop.run({ id: running.id });
  }

  /**
   * TT-65: el id es el del timer que estaba en pantalla al abrir el diálogo.
   * Si mientras tanto otra pestaña lo detuvo o continuó otra entrada, el
   * servidor responde con el desenlace (§4.3) en vez de borrar el timer nuevo.
   */
  function handleDiscard(id: string): void {
    clearNotices();
    focusAfterDiscard.current = true;
    setPendingDiscard({ id, draft });
    discard.run({ id });
  }

  /**
   * El reintento deja el foco donde lo deja el descarte: el aviso se va. Y
   * vuelve a fijar el descarte que bajó con el aviso, con lo que muestra la
   * descripción al reintentar.
   */
  function retryDiscard(): (() => void) | undefined {
    const retry = retryOf(discard);
    const retried = pendingDiscard;
    return retry === undefined
      ? undefined
      : () => {
          focusAfterDiscard.current = true;
          retry();
          if (retried !== null) {
            setPendingDiscard({ id: retried.id, draft });
          }
        };
  }

  function handleSaveStart(input: UpdateRunningStartInput): void {
    clearNotices();
    saveStart.run(input);
  }

  /** Un reintento también es una operación nueva: baja los demás avisos. */
  function retryOf<Input>(handle: ActionHandle<Input>): (() => void) | undefined {
    const retry = retryHandlerOf(handle);
    return retry === undefined
      ? undefined
      : () => {
          clearNotices();
          retry();
        };
  }

  function handleAdd(): void {
    clearNotices();
    add.run({
      description: draft,
      date: manualDraft.date,
      start: manualDraft.start,
      end: manualDraft.end,
      ...selectionIds(pairDraft),
    });
  }

  /** TT-27: con el timer abierto el cambio se guarda en él; sin timer, es el borrador. */
  function handleProjectChange(selection: ProjectSelection): void {
    if (!editsRunningPair) {
      setPairDraft(selection);
      return;
    }
    clearNotices();
    saveProject.run({ id: running.id, selection });
  }

  function handleModeChange(next: TrackerMode): void {
    // TT-16: la próxima visita llega dibujada en el modo elegido, por el
    // conmutador o por el atajo.
    document.cookie = trackerModeCookie(next);
    clearNotices();
    // Elegir el modo manual arranca un borrador nuevo, con la hora de ahora.
    if (next === "manual") {
      setManualDraft(reset(serverNow, timeZone));
    }
    setMode(next);
  }

  // TT-26: cada atajo es su control visible y habilitado, y nada si no está.
  // Con la membresía desactivada no hay ninguno (TT-92).
  const shortcutsEnabled =
    useTrackerShortcuts({
      start: timerControls && !isRunning ? handleToggle : undefined,
      stop: timerControls && isRunning ? handleToggle : undefined,
      toggleMode:
        canTrack && !modeSwitchDisabled
          ? () => handleModeChange(isManual ? "timer" : "manual")
          : undefined,
    }) && canTrack;

  const descriptionField = (
    <DescriptionField
      ref={descriptionRef}
      value={draft}
      onValueChange={setDraft}
      onFocusChange={setEditing}
      onCommit={handleCommit}
      debounceMs={running === null ? undefined : DESCRIPTION_DEBOUNCE_MS}
      label="Descripción de la entrada"
      disabled={!canTrack}
    />
  );

  const projectPicker = (
    <ProjectPicker
      value={shownPair}
      onChange={handleProjectChange}
      variant="bar"
      label={projectLabels.pickerEmpty}
      pending={saveProject.pending || switching}
      readOnly={!canTrack}
      triggerRef={pickerTriggerRef}
      onOpenChange={(open) => {
        pickerOpen.current = open;
      }}
    />
  );

  return (
    <section aria-label="Rastreador" className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {isManual ? (
          <ManualBar
            descriptionField={descriptionField}
            projectPicker={projectPicker}
            draft={manualDraft}
            onDraftChange={setManualDraft}
            todayKey={todayKey}
            minDayKey={minDayKey}
            canTrack={canTrack}
            adding={add.pending}
            onAdd={handleAdd}
            addRef={addRef}
          />
        ) : (
          <TimerBar
            descriptionField={descriptionField}
            projectPicker={projectPicker}
            isRunning={isRunning}
            counterStart={isRunning && running !== null ? running.startedAt : null}
            running={running}
            serverNow={serverNow}
            todayKey={todayKey}
            minDayKey={minDayKey}
            canTrack={canTrack}
            switching={switching}
            onToggle={handleToggle}
            onSaveStart={handleSaveStart}
            savingStart={saveStart.pending}
            menuTriggerRef={menuTriggerRef}
            onRequestDiscard={setDiscardId}
            shortcutsEnabled={shortcutsEnabled}
          />
        )}
        {/*
         * Fuera del condicional de modo: al confirmar, el menú se va con el
         * timer; y si otra pestaña lo detiene con el modo manual elegido, la
         * barra vuelve a manual con el diálogo abierto, que sigue acá y
         * devuelve el foco a la descripción.
         */}
        {canTrack && (
          <DiscardTimerDialog
            open={discardId !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDiscardId(null);
              }
            }}
            onConfirm={() => {
              if (discardId !== null) {
                handleDiscard(discardId);
              }
            }}
            confirmDisabled={save.pending}
            finalFocus={menuTriggerRef}
            fallbackFocus={descriptionRef}
          />
        )}

        {start.failure !== null && (
          <ActionFeedback
            title="No se pudo iniciar el timer."
            message={start.failure.message}
            retryDisabled={switching}
            onRetry={retryOf(start)}
          />
        )}
        {stop.failure !== null && (
          <ActionFeedback
            title="No se pudo detener el timer."
            message={stop.failure.message}
            retryDisabled={switching}
            onRetry={retryOf(stop)}
          />
        )}

        {discard.failure !== null && (
          <ActionFeedback
            title={trackerLabels.timerNotDiscarded}
            message={discard.failure.message}
            retryDisabled={switching}
            onRetry={retryDiscard()}
          />
        )}

        {saveStart.failure !== null && (
          <ActionFeedback
            title={trackerLabels.runningStartNotSaved}
            message={saveStart.failure.message}
            retryDisabled={saveStart.pending || switching}
            onRetry={retryOf(saveStart)}
          />
        )}

        {add.failure !== null &&
          (add.failure.code === "unexpected" ? (
            /*
             * Agregar es la única alta del módulo sin id elegido por el
             * cliente (ADR 0007): si se pierde la respuesta, la fila puede
             * estar creada y reintentar la duplicaría en silencio, porque
             * TT-82 acepta la superposición. Por eso acá no se ofrece
             * «Reintentar» y el aviso manda a mirar la lista.
             */
            <ActionFeedback
              title="No sabemos si la entrada se guardó."
              message="Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en la lista: puede haberse creado."
            />
          ) : (
            <ActionFeedback
              title="No se pudo agregar la entrada."
              message={add.failure.message}
            />
          ))}

        {saveProject.failure !== null && (
          <ActionFeedback
            title={trackerLabels.projectNotSaved}
            message={saveProject.failure.message}
            retryDisabled={saveProject.pending || switching}
            onRetry={retryOf(saveProject)}
          />
        )}

        {save.failure !== null && (
          <ActionFeedback
            title={trackerLabels.descriptionNotSaved}
            message={save.failure.message}
            retryDisabled={save.pending}
            onRetry={retryOf(save)}
          />
        )}
      </div>

      {/* Mismo borde y relleno que la fila de la barra: queda centrado con su primera línea. */}
      <div className="border border-transparent py-2">
        <div className="flex h-9 items-center gap-1">
          <ModeSwitch
            mode={isManual ? "manual" : "timer"}
            onModeChange={handleModeChange}
            timerRunning={isRunning}
            disabled={modeSwitchDisabled}
            shortcutsEnabled={shortcutsEnabled}
          />
          {canTrack && <ShortcutsDialog />}
        </div>
      </div>
    </section>
  );
}
