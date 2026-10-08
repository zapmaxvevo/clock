import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import { getTrackingCatalog } from "@/modules/project/service";
import {
  getTimesheetState,
  type TimesheetRequest,
  type TrackerWorkspace,
} from "@/modules/time-entry/service";
import type { Actor } from "@/server/permissions";

import { InactiveMembershipNotice } from "../inactive-membership-notice";
import { timesheetLabels } from "./labels";
import { TIMESHEET_HEADING_ID } from "./timesheet-table";
import { TimesheetToolbar } from "./timesheet-toolbar";
import { TimesheetView } from "./timesheet-view";

type TimesheetScreenProps = {
  readonly actor: Actor;
  /** Zona, formatos y primer día de la semana de la persona. */
  readonly workspace: TrackerWorkspace;
  /** El `semana` de la URL ya validado (TS-10). */
  readonly request: TimesheetRequest;
};

export async function TimesheetScreen({
  actor,
  workspace,
  request,
}: TimesheetScreenProps) {
  // No comparten snapshot, como en el calendario: la próxima revalidación
  // pone en las dos lo que haya cambiado entre una lectura y la otra.
  const [state, catalog] = await Promise.all([
    getTimesheetState(actor, workspace, request),
    getTrackingCatalog(actor),
  ]);

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id={TIMESHEET_HEADING_ID} className="text-xl font-semibold">
          {timesheetLabels.heading}
        </h1>
        <TimesheetToolbar state={state} />
      </div>

      {!state.canTrack && <InactiveMembershipNotice />}

      {/* Los formatos de esta misma lectura, no los del layout: una navegación
          del cliente puede conservar el layout con los formatos de antes. */}
      <DisplayFormatsProvider formats={workspace.formats}>
        <TrackingCatalogProvider catalog={catalog}>
          {/* Cada semana arranca sin filas agregadas ni escrituras de otra (P-16). */}
          <TimesheetView key={state.weekStart} state={state} />
        </TrackingCatalogProvider>
      </DisplayFormatsProvider>
    </div>
  );
}

/** Lo que se ve mientras la pantalla carga en el servidor. */
export function TimesheetSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label={timesheetLabels.loading}
      role="status"
      className="flex w-full flex-col gap-4"
    >
      <div className="bg-muted/60 h-10 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-[50vh] animate-pulse rounded-lg" />
    </div>
  );
}
