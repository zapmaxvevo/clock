"use client";

import { useOptimistic, useRef, useState } from "react";

import {
  createManualEntry,
  startTimer,
  stopTimer,
  updateDescription,
} from "@/modules/time-entry/actions";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { dayKeyLabel } from "@/server/time";

import { DescriptionField } from "./description-field";
import { trackerLabels } from "./labels";
import { ManualBar } from "./manual-bar";
import { reset, type ManualDraft } from "./manual-draft";
import { ModeSwitch } from "./mode-switch";
import { TimerBar, type Phase } from "./timer-bar";
import { TrackerFeedback } from "./tracker-feedback";
import type { TrackerMode } from "./tracker-mode";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";
import { useTrackerRefresh } from "./use-tracker-refresh";

/** TT-04: cuánto espera el guardado automático después de la última tecla. */
const DESCRIPTION_DEBOUNCE_MS = 500;

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

function sameDraft(left: ManualDraft, right: ManualDraft): boolean {
  return left.date === right.date && left.start === right.start && left.end === right.end;
}

/**
 * La barra del rastreador: elige qué modo se dibuja y es dueña de todo lo que
 * tiene que sobrevivir a un cambio de modo. Un timer que arranca o se detiene
 * en otra pestaña cambia la barra de modo sin que nadie lo pida (TT-30), así
 * que la descripción, el borrador manual, los cuatro pedidos y sus avisos
 * viven acá y no en la barra de cada modo. El conmutador también: así no
 * cambia de lugar ni pierde el foco al conmutar.
 *
 * `useTrackerRefresh()` se llama acá y no adentro de la barra del timer: si
 * viviera ahí, la revalidación de P-11 dejaría de correr en modo manual.
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
  /** Descripción del guardado en vuelo: el rebote y el blur no lo repiten. */
  const [inFlightDescription, setInFlightDescription] = useState<string | null>(null);
  const [manualDraft, setManualDraft] = useState(() => reset(serverNow, timeZone));
  /**
   * Descripción que se estaba escribiendo en modo manual cuando llegó un timer
   * de otro lado. El campo pasa a mostrar la del timer, y esta vuelve cuando
   * el timer se detiene.
   */
  const [heldDescription, setHeldDescription] = useState<string | null>(null);
  /** Día de la entrada que quedó más atrás del tramo que la lista dibuja. */
  const [outsideWindowDay, setOutsideWindowDay] = useState<string | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  const save = useEntryAction(updateDescription, {
    // TT-90: si el guardado falla, el campo vuelve al valor que tiene el servidor.
    onFailure: () => setDraft(running?.description ?? ""),
  });
  const start = useEntryAction(startTimer, {
    optimistic: () => showPhase("starting"),
  });
  const stop = useEntryAction(stopTimer, {
    optimistic: () => showPhase("stopping"),
  });
  /**
   * Agregar limpia la barra solo cuando el servidor confirmó, así una falla
   * de red deja lo tecleado donde está (TT-89). No ofrece «Reintentar»: ver
   * el aviso de respuesta perdida (TT-109).
   */
  const add = useEntryAction(createManualEntry, {
    onSuccess: (data, input) => {
      // Lo que se tecleó mientras el pedido viajaba no es parte de la entrada
      // creada: se limpia solo lo que sigue igual a lo que se mandó.
      setDraft((current) => (current === input.description ? "" : current));
      setManualDraft((current) =>
        sameDraft(current, input) ? reset(serverNow, timeZone) : current,
      );
      setOutsideWindowDay(data.outsideWindow ? input.date : null);
      // TT-25: la barra queda lista para la próxima entrada, salvo que la
      // persona ya se haya ido a otro control de la pantalla.
      const focused = document.activeElement;
      if (
        focused === null ||
        focused === document.body ||
        sectionRef.current?.contains(focused) === true
      ) {
        descriptionRef.current?.focus();
      }
    },
  });

  const serverId = running?.id ?? null;
  const serverDescription = running?.description ?? "";

  // La descripción del campo sigue a la del servidor, que puede cambiar sin
  // que cambie la entrada: otro dispositivo la editó y la revalidación la
  // trajo (TT-39, TT-40). Lo tecleado solo gana mientras el campo tiene el
  // foco o su guardado viaja; en ese caso el valor nuevo se da por visto
  // igual, así no vuelve a pisar el campo cuando se sale de él.
  if (serverState.id !== serverId || serverState.description !== serverDescription) {
    setServerState({ id: serverId, description: serverDescription });
    // Con el modo elegido en manual, un timer que llega o se va cambia la
    // barra de modo y el campo se vuelve a montar sin pasar por su blur: lo
    // tecleado no es de esa entrada y la guarda de edición no aplica.
    const forcedIn = mode === "manual" && serverState.id === null && serverId !== null;
    const forcedOut = mode === "manual" && serverState.id !== null && serverId === null;
    if (forcedIn) {
      setHeldDescription(draft);
      setDraft(serverDescription);
      setEditing(false);
    } else if (forcedOut) {
      setDraft(heldDescription ?? serverDescription);
      setHeldDescription(null);
      setEditing(false);
    } else if (!editing && !save.pending) {
      setDraft(serverDescription);
    }
  }

  // TT-30: con un timer corriendo la barra queda en modo timer aunque el modo
  // recordado sea manual. La cookie no se toca: al detener vuelve el elegido.
  const isManual = mode === "manual" && running === null;
  const switching = phase !== "idle";
  const isRunning =
    phase === "starting" ? true : phase === "stopping" ? false : running !== null;

  /** Un aviso describe el desenlace de una operación: la siguiente lo deja viejo. */
  function clearNotices(): void {
    save.clear();
    start.clear();
    stop.clear();
    add.clear();
    setOutsideWindowDay(null);
  }

  function handleCommit(next: string): void {
    // El servidor guarda la descripción sin espacios en los bordes, así que
    // un texto que solo difiere en eso no es un cambio que valga una escritura.
    if (running === null || next.trim() === serverDescription) {
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
    clearNotices();
    if (running === null) {
      start.run({ description: draft });
      return;
    }
    stop.run({ id: running.id });
  }

  function handleAdd(): void {
    clearNotices();
    add.run({
      description: draft,
      date: manualDraft.date,
      start: manualDraft.start,
      end: manualDraft.end,
    });
  }

  function handleModeChange(next: TrackerMode): void {
    clearNotices();
    // Elegir el modo manual arranca un borrador nuevo, con la hora de ahora.
    if (next === "manual") {
      setManualDraft(reset(serverNow, timeZone));
    }
    setMode(next);
  }

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

  return (
    <section ref={sectionRef} aria-label="Rastreador" className="flex items-start gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {isManual ? (
          <ManualBar
            descriptionField={descriptionField}
            draft={manualDraft}
            onDraftChange={setManualDraft}
            todayKey={todayKey}
            minDayKey={minDayKey}
            canTrack={canTrack}
            adding={add.pending}
            onAdd={handleAdd}
          />
        ) : (
          <TimerBar
            descriptionField={descriptionField}
            isRunning={isRunning}
            counterStart={isRunning && running !== null ? running.startedAt : null}
            serverNow={serverNow}
            canTrack={canTrack}
            switching={switching}
            onToggle={handleToggle}
          />
        )}

        {start.failure !== null && (
          <TrackerFeedback
            title="No se pudo iniciar el timer."
            message={start.failure.message}
            retryDisabled={switching}
            onRetry={retryHandlerOf(start)}
          />
        )}
        {stop.failure !== null && (
          <TrackerFeedback
            title="No se pudo detener el timer."
            message={stop.failure.message}
            retryDisabled={switching}
            onRetry={retryHandlerOf(stop)}
          />
        )}

        {add.failure !== null &&
          (add.failure.code === "unexpected" ? (
            /*
             * Agregar es la única operación del módulo que crea sin rebotar
             * contra nada: si se pierde la respuesta, la fila puede estar
             * creada y reintentar la duplicaría en silencio, porque TT-82
             * acepta la superposición. Por eso acá no se ofrece «Reintentar»
             * y el aviso manda a mirar la lista.
             */
            <TrackerFeedback
              title="No sabemos si la entrada se guardó."
              message="Se perdió la respuesta del servidor. Antes de volver a agregarla, fijate en la lista: puede haberse creado."
            />
          ) : (
            <TrackerFeedback
              title="No se pudo agregar la entrada."
              message={add.failure.message}
            />
          ))}

        {outsideWindowDay !== null && (
          <TrackerFeedback
            tone="info"
            title="La entrada se guardó, pero todavía no se ve en la lista."
            message={`Quedó en el día ${dayKeyLabel(outsideWindowDay, todayKey)}, anterior al tramo que la lista muestra.`}
          />
        )}

        {save.failure !== null && (
          <TrackerFeedback
            title={trackerLabels.descriptionNotSaved}
            message={save.failure.message}
            retryDisabled={save.pending}
            onRetry={retryHandlerOf(save)}
          />
        )}
      </div>

      {/* Mismo borde y relleno que la fila de la barra: queda centrado con su primera línea. */}
      <div className="border border-transparent py-2">
        <div className="flex h-9 items-center">
          <ModeSwitch
            mode={isManual ? "manual" : "timer"}
            onModeChange={handleModeChange}
            timerRunning={isRunning}
            busy={switching || add.pending}
          />
        </div>
      </div>
    </section>
  );
}
