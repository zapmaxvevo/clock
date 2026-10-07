import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import { getTrackingCatalog } from "@/modules/project/service";
import {
  getCalendarState,
  type CalendarRequest,
  type TrackerWorkspace,
} from "@/modules/time-entry/service";
import type { Actor } from "@/server/permissions";

import { InactiveMembershipNotice } from "../inactive-membership-notice";
import { CalendarView } from "./calendar-view";
import type { CalendarZoom } from "./calendar-zoom";
import { calendarLabels } from "./labels";

type CalendarScreenProps = {
  readonly actor: Actor;
  /** Zona, formatos y primer día de la semana de la persona. */
  readonly workspace: TrackerWorkspace;
  /** La vista y el `semana` de la URL ya validados (CAL-17). */
  readonly request: CalendarRequest;
  /** Zoom recordado en la cookie, para no dibujar otro y después saltar. */
  readonly initialZoom: CalendarZoom;
};

export async function CalendarScreen({
  actor,
  workspace,
  request,
  initialZoom,
}: CalendarScreenProps) {
  // No comparten snapshot, como en el rastreador: la próxima revalidación
  // pone en las dos lo que haya cambiado entre una lectura y la otra.
  const [state, catalog] = await Promise.all([
    getCalendarState(actor, workspace, request),
    getTrackingCatalog(actor),
  ]);

  return (
    <div className="flex w-full flex-col gap-4">
      <h1 className="sr-only">{calendarLabels.heading}</h1>

      {!state.canTrack && <InactiveMembershipNotice />}

      {/* Los formatos de esta misma lectura, no los del layout: una navegación
          del cliente puede conservar el layout con los formatos de antes. */}
      <DisplayFormatsProvider formats={workspace.formats}>
        <TrackingCatalogProvider catalog={catalog}>
          <CalendarView state={state} initialZoom={initialZoom} />
        </TrackingCatalogProvider>
      </DisplayFormatsProvider>
    </div>
  );
}

/** Lo que se ve mientras la pantalla carga en el servidor. */
export function CalendarSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label={calendarLabels.loading}
      role="status"
      className="flex w-full flex-col gap-4"
    >
      <div className="bg-muted/60 h-10 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-[60vh] animate-pulse rounded-lg" />
    </div>
  );
}
