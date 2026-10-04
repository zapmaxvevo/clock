import { InfoIcon } from "lucide-react";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import { getTrackingCatalog } from "@/modules/project/service";
import { getTrackerState, type TrackerWorkspace } from "@/modules/time-entry/service";
import type { Actor } from "@/server/permissions";

import { EntryList } from "./entry-list";
import { ReachWeekProvider } from "./reach-week";
import { TrackerBar } from "./tracker-bar";
import { TrackerEmpty } from "./tracker-empty";
import type { TrackerMode } from "./tracker-mode";

type TrackerScreenProps = {
  readonly actor: Actor;
  /**
   * Zona horaria (TT-02), formatos y primer día de la semana de la persona
   * (TT-48), y creación del workspace, el piso de la barra manual.
   */
  readonly workspace: TrackerWorkspace;
  /** El `desde` de la URL ya validado, o `null` (ADR 0008). */
  readonly from: string | null;
  /** Modo recordado en la cookie, para no dibujar el otro y después saltar. */
  readonly initialMode: TrackerMode;
};

export async function TrackerScreen({
  actor,
  workspace,
  from,
  initialMode,
}: TrackerScreenProps) {
  // No comparten snapshot: un proyecto creado entre las dos lecturas aparece
  // en una sola, y la próxima revalidación lo pone en las dos.
  const [state, catalog] = await Promise.all([
    getTrackerState(actor, workspace, { from }),
    getTrackingCatalog(actor),
  ]);

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

      {/* Los formatos de esta misma lectura, no los del layout: una navegación
          del cliente puede conservar el layout con los formatos de antes. */}
      <DisplayFormatsProvider formats={workspace.formats}>
        <TrackingCatalogProvider catalog={catalog}>
          <ReachWeekProvider reachFrom={state.reachFrom}>
            <TrackerBar
              running={state.running}
              serverNow={state.serverNow}
              timeZone={state.timeZone}
              todayKey={state.todayKey}
              minDayKey={state.minDayKey}
              canTrack={state.canTrack}
              initialMode={initialMode}
            />

            {/* Montada aunque no quede nada: la región de acciones en masa
                sobrevive al borrado de todas las entradas, con el foco y el
                resultado. Sin semanas, dibuja solo la región y su estado. */}
            <EntryList
              weeks={state.weeks}
              running={state.running}
              serverNow={state.serverNow}
              canTrack={state.canTrack}
              todayKey={state.todayKey}
              minDayKey={state.minDayKey}
              lastEntryId={state.lastEntryId}
              loadMoreFrom={state.loadMoreFrom}
            />
            {!state.hasAnyEntry && <TrackerEmpty />}
          </ReachWeekProvider>
        </TrackingCatalogProvider>
      </DisplayFormatsProvider>
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
