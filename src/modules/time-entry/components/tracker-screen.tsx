import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTrackerState } from "@/modules/time-entry/service";
import type { Actor } from "@/server/permissions";

import { DayGroup } from "./day-group";
import { TimerBar } from "./timer-bar";
import { TrackerEmpty } from "./tracker-empty";

type TrackerScreenProps = {
  readonly actor: Actor;
  /** Zona horaria del workspace: resuelve los días y los formatos (TT-02). */
  readonly timeZone: string;
};

export async function TrackerScreen({ actor, timeZone }: TrackerScreenProps) {
  const state = await getTrackerState(actor, timeZone);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="sr-only">Rastreador de tiempo</h1>

      {!state.canTrack && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>Tu acceso al workspace está desactivado.</AlertTitle>
          <AlertDescription>
            Podés ver tus horas, pero no cargar ni modificar entradas. Pedile a quien
            administra el workspace que vuelva a activar tu membresía.
          </AlertDescription>
        </Alert>
      )}

      <TimerBar
        running={state.running}
        serverNow={state.serverNow}
        canTrack={state.canTrack}
      />

      {state.hasAnyEntry ? (
        <div className="flex flex-col gap-4">
          {state.days.map((group) => (
            <DayGroup
              key={group.date}
              group={group}
              running={state.running}
              serverNow={state.serverNow}
              canTrack={state.canTrack}
            />
          ))}
        </div>
      ) : (
        <TrackerEmpty />
      )}
    </div>
  );
}

/** Lo que se ve mientras la pantalla carga en el servidor. */
export function TrackerSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Cargando el rastreador"
      role="status"
      className="mx-auto flex w-full max-w-4xl flex-col gap-6"
    >
      <div className="bg-muted/60 h-14 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-32 animate-pulse rounded-lg" />
    </div>
  );
}
