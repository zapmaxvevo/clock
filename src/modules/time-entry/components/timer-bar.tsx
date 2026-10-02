"use client";

import { PlayIcon, SquareIcon } from "lucide-react";
import { useOptimistic, useState } from "react";

import { Button } from "@/components/ui/button";
import { startTimer, stopTimer, updateDescription } from "@/modules/time-entry/actions";
import type { TimeEntryView } from "@/modules/time-entry/schema";

import { DescriptionField } from "./description-field";
import { ElapsedCounter } from "./elapsed-counter";
import { trackerLabels } from "./labels";
import { TrackerFeedback } from "./tracker-feedback";
import { retryHandlerOf, useEntryAction } from "./use-entry-action";
import { useTrackerRefresh } from "./use-tracker-refresh";

/** TT-04: cuánto espera el guardado automático después de la última tecla. */
const DESCRIPTION_DEBOUNCE_MS = 500;

/** Lo que la barra muestra mientras la action viaja. */
type Phase = "idle" | "starting" | "stopping";

type TimerBarProps = {
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  readonly canTrack: boolean;
};

export function TimerBar({ running, serverNow, canTrack }: TimerBarProps) {
  useTrackerRefresh();

  const [phase, showPhase] = useOptimistic<Phase, Phase>(
    "idle",
    (_current, next) => next,
  );
  const [trackedId, setTrackedId] = useState<string | null>(running?.id ?? null);
  const [draft, setDraft] = useState(running?.description ?? "");
  /** Última descripción enviada: el rebote y el blur no la mandan dos veces. */
  const [sentDescription, setSentDescription] = useState<string | null>(null);

  const start = useEntryAction(startTimer, {
    optimistic: () => showPhase("starting"),
  });
  const stop = useEntryAction(stopTimer, {
    optimistic: () => showPhase("stopping"),
  });
  const save = useEntryAction(updateDescription, {
    // TT-90: si el guardado falla, el campo vuelve al valor que tiene el servidor.
    onFailure: () => setDraft(running?.description ?? ""),
  });

  // La descripción es estado local de la barra hasta que hay una entrada donde
  // guardarla. Al cambiar la entrada abierta vuelve a tomar la del servidor.
  if (trackedId !== (running?.id ?? null)) {
    setTrackedId(running?.id ?? null);
    setDraft(running?.description ?? "");
    setSentDescription(null);
  }

  const switching = start.pending || stop.pending;
  const isRunning =
    phase === "starting" ? true : phase === "stopping" ? false : running !== null;
  const counterStart = isRunning && running !== null ? running.startedAt : null;

  /**
   * Un aviso describe el desenlace de una operación, así que cualquier
   * operación nueva de la barra lo deja viejo: un «Iniciar» no puede quedar
   * debajo del error del «Detener» anterior. El aviso de la propia action lo
   * limpia `run()`.
   */
  function clearNotices(): void {
    start.clear();
    stop.clear();
    save.clear();
  }

  function handleToggle(): void {
    clearNotices();
    if (running === null) {
      start.run({ description: draft });
      return;
    }
    stop.run({ id: running.id });
  }

  function handleCommit(next: string): void {
    if (running === null) {
      return;
    }
    if (next === running.description || next === sentDescription) {
      return;
    }
    clearNotices();
    setSentDescription(next);
    save.run({ id: running.id, description: next });
  }

  return (
    <section aria-label="Rastreador" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
        <div className="min-w-0 flex-1 basis-64">
          <DescriptionField
            value={draft}
            onValueChange={setDraft}
            onCommit={handleCommit}
            debounceMs={running === null ? undefined : DESCRIPTION_DEBOUNCE_MS}
            label="Descripción de la entrada"
            disabled={!canTrack}
          />
        </div>

        <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

        <ElapsedCounter startedAt={counterStart} serverNow={serverNow} />

        <Button
          type="button"
          disabled={!canTrack || switching}
          onClick={handleToggle}
          className={
            isRunning
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-success text-success-foreground hover:bg-success/90"
          }
        >
          {isRunning ? (
            <SquareIcon aria-hidden="true" />
          ) : (
            <PlayIcon aria-hidden="true" />
          )}
          {isRunning ? "Detener" : "Iniciar"}
        </Button>
      </div>

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
      {save.failure !== null && (
        <TrackerFeedback
          title={trackerLabels.descriptionNotSaved}
          message={save.failure.message}
          retryDisabled={save.pending}
          onRetry={retryHandlerOf(save)}
        />
      )}
    </section>
  );
}
