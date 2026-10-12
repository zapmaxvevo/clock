import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  NO_REPORT_FILTERS,
  REPORT_MAX_ROWS,
  hasReportFilters,
  reportLevelsOf,
  type ReportReadyState,
} from "@/modules/report/schema";

import { groupByLabels, reportLabels } from "./labels";
import { reportHref } from "./report-href";
import { durationLabel } from "./group-heading";
import { ReportChart } from "./report-chart";
import { ReportTree } from "./report-tree";

/** El `h1` de la pantalla, que nombra la tabla. */
export const REPORT_HEADING_ID = "reporte-titulo";

/**
 * El alcance y la zona (D-R2a-2, D-R2a-5), el aviso de la suma por etiqueta
 * (D-R3-3), los totales (RP-18), el gráfico si hay horas (RP-15, D-R5-6), el
 * aviso del tope (D-R3-6) y la tabla, con las filas en el orden en que llegan.
 * Las del cuerpo las dibuja `ReportTree`. Sin grupos, el vacío de R2a o, con
 * filtros, el segundo (D-R4-7). Si no entra ni el primer nivel, una fila que lo
 * dice en lugar de las filas (D-R10-10).
 */
export function ReportView({ state }: { readonly state: ReportReadyState }) {
  const requested = reportLevelsOf(state);
  const shown = requested.slice(0, state.levelsShown);
  const firstLevelCut = state.levelsShown === 0;
  // Sin ningún nivel, la columna sigue nombrando el primero pedido (§5.4).
  const headed = firstLevelCut ? requested.slice(0, 1) : shown;
  // Cambiar el período, la agrupación o un filtro vuelve a contraer el árbol
  // (D-R3-9, D-R4-10) y a empezar el foco del gráfico en la primera columna (§5.1).
  const requestKey = reportHref({
    range: state.range,
    groupBy: state.groupBy,
    subgroups: state.subgroups,
    filters: state.filters,
  });

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

      {state.chart !== null && <ReportChart key={requestKey} chart={state.chart} />}

      {!firstLevelCut && shown.length < requested.length && (
        <p className="text-sm">{reportLabels.rowLimit(REPORT_MAX_ROWS)}</p>
      )}

      <div className="overflow-x-auto rounded-lg border">
        {/*
         * De ancho fijo, con la duración de ancho propio: en una tabla
         * automática el `truncate` no recorta y un nombre largo la ensancha
         * más allá de su caja.
         */}
        <table aria-labelledby={REPORT_HEADING_ID} className="w-full table-fixed text-sm">
          <thead className="border-b">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {headed.map((level) => groupByLabels[level]).join(" / ")}
              </th>
              <th scope="col" className="w-24 px-3 py-2 text-right font-medium">
                {reportLabels.duration}
              </th>
            </tr>
          </thead>
          <tbody>
            {firstLevelCut ? (
              <FirstLevelLimitRow />
            ) : state.groups.length === 0 ? (
              <EmptyRow state={state} />
            ) : (
              <ReportTree key={requestKey} groups={state.groups} />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * D-R10-10: el primer nivel pasa del tope y no se lee ninguno. No es un vacío:
 * hay horas, y el total las cuenta.
 */
function FirstLevelLimitRow() {
  return (
    <tr>
      <td colSpan={2} className="px-3 py-6 text-center">
        {reportLabels.firstLevelLimit(REPORT_MAX_ROWS)}
      </td>
    </tr>
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
