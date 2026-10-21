import { InactiveMembershipNotice } from "@/components/inactive-membership-notice";
import { getReportState, type ReportRequest } from "@/modules/report/service";
import type { Actor } from "@/server/permissions";
import type { TimeSettings } from "@/server/time";

import { reportLabels } from "./labels";
import { ReportToolbar } from "./report-toolbar";
import { REPORT_HEADING_ID, ReportView } from "./report-view";

type ReportScreenProps = {
  readonly actor: Actor;
  /** Zona, formatos y primer día de la semana de quien mira. */
  readonly settings: TimeSettings;
  /** El rango y la agrupación de la URL, cada uno ya validado por su lado. */
  readonly request: ReportRequest;
};

/** RP-10: el resumido, armado en el servidor; sin `report.view`, solo el aviso (RP-07). */
export async function ReportScreen({ actor, settings, request }: ReportScreenProps) {
  const state = await getReportState(actor, settings, request);

  if (state.kind === "forbidden") {
    return (
      <div className="flex w-full flex-col gap-4">
        <h1 id={REPORT_HEADING_ID} className="text-xl font-semibold">
          {reportLabels.heading}
        </h1>
        <InactiveMembershipNotice body={reportLabels.forbiddenBody} />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 id={REPORT_HEADING_ID} className="text-xl font-semibold">
          {reportLabels.heading}
        </h1>
        <ReportToolbar state={state} />
      </div>
      <ReportView state={state} durationFormat={settings.formats.duration} />
    </div>
  );
}

/** Lo que se ve mientras el reporte carga en el servidor. */
export function ReportSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label={reportLabels.loading}
      role="status"
      className="flex w-full flex-col gap-4"
    >
      <div className="bg-muted/60 h-10 animate-pulse rounded-lg" />
      <div className="bg-muted/40 h-[40vh] animate-pulse rounded-lg" />
    </div>
  );
}
