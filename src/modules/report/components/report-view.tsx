import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NO_REPORT_FILTERS,
  REPORT_MAX_ROWS,
  hasReportFilters,
  type ReportReadyState,
} from "@/modules/report/schema";

import { groupByLabels, reportLabels } from "./labels";
import { reportHref } from "./report-href";
import { durationLabel } from "./group-heading";
import { ReportTree } from "./report-tree";

/** El `h1` de la pantalla, que nombra la tabla. */
export const REPORT_HEADING_ID = "reporte-titulo";

/**
 * El alcance y la zona (D-R2a-2, D-R2a-5), el aviso de la suma por etiqueta
 * (D-R3-3), los totales (RP-18), el aviso del tope (D-R3-6) y la tabla, con las
 * filas en el orden en que llegan. Las del cuerpo las dibuja `ReportTree`. Sin
 * grupos, el vacío de R2a o, con filtros, el segundo (D-R4-7).
 */
export function ReportView({ state }: { readonly state: ReportReadyState }) {
  const requested = [state.groupBy, ...state.subgroups];
  const shown = requested.slice(0, state.levelsShown);

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground flex flex-col gap-1 text-sm">
        <p>
          {state.scope === "everyone"
            ? reportLabels.scopeEveryone
            : reportLabels.scopeSelf}
        </p>
        <p>{reportLabels.zone(state.timeZone)}</p>
        {shown.includes("tag") && <p>{reportLabels.tagOverlap}</p>}
      </div>

      <dl className="flex flex-wrap gap-x-8 gap-y-2">
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-sm">{reportLabels.total}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {durationLabel(state.totalSeconds)}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground text-sm">{reportLabels.billable}</dt>
          <dd className="text-lg font-semibold tabular-nums">
            {durationLabel(state.billableSeconds)}
          </dd>
        </div>
      </dl>

      {shown.length < requested.length && (
        <p className="text-sm">{reportLabels.rowLimit(REPORT_MAX_ROWS)}</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <table aria-labelledby={REPORT_HEADING_ID} className="w-full text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {shown.map((level) => groupByLabels[level]).join(" / ")}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {reportLabels.duration}
              </th>
            </tr>
          </thead>
          <tbody>
            {state.groups.length === 0 ? (
              <EmptyRow state={state} />
            ) : (
              <ReportTree
                // Cambiar el período, la agrupación o un filtro vuelve a
                // contraer el árbol (D-R3-9, D-R4-10).
                key={reportHref({
                  range: state.range,
                  groupBy: state.groupBy,
                  subgroups: state.subgroups,
                  filters: state.filters,
                })}
                groups={state.groups}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * RP-33, D-R4-7: con filtros efectivos, el segundo vacío, aunque el período no
 * tenga horas, con «Quitar filtros» al mismo período y la misma agrupación.
 */
function EmptyRow({ state }: { readonly state: ReportReadyState }) {
  const filtered = hasReportFilters(state.filters);
  return (
    <tr>
      <td colSpan={2} className="px-3 py-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <p className="text-muted-foreground">
            {filtered ? reportLabels.emptyFiltered : reportLabels.empty}
          </p>
          {filtered && (
            <Link
              href={reportHref({
                range: state.range,
                groupBy: state.groupBy,
                subgroups: state.subgroups,
                filters: NO_REPORT_FILTERS,
              })}
              // Con `cn`, el borde del contorno reemplaza al transparente de la base.
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {reportLabels.clearFilters}
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}
