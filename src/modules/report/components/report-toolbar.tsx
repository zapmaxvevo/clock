import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  REPORT_GROUP_BYS,
  sameRange,
  type ReportFilters,
  type ReportGroupBy,
  type ReportGrouping,
  type ReportRange,
  type ReportReadyState,
} from "@/modules/report/schema";

import { filterOptionsOf, type FilterKind } from "./filter-model";
import { FilterPicker } from "./filter-picker";
import { withLevel } from "./grouping-model";
import { groupByLabels, reportLabels } from "./labels";
import { RangePicker } from "./range-picker";
import { reportHref } from "./report-href";
import { SubgroupPicker } from "./subgroup-picker";

const GROUP_BY_LABEL_ID = "reporte-agrupar";
const SUBGROUP_BY_LABEL_ID = "reporte-subagrupar";
const FILTER_BY_LABEL_ID = "reporte-filtrar";

/** Los filtros de la barra, en su orden (D-R4-8). */
const FILTER_KINDS = ["clients", "projects"] as const satisfies readonly FilterKind[];

/**
 * RP-20 y RP-11: las flechas del período, el rango que abre los atajos y el
 * calendario, el enlace a la semana en curso y la agrupación, con sus enlaces
 * en el orden de D-R3-8, los subniveles y los filtros. Cada enlace conserva lo
 * que no cambia (D-R2a-4): los subniveles (D-R3-8) y los filtros (D-R4-10).
 * Cada filtro recibe solo sus opciones, no el estado entero (D-R4-9).
 */
export function ReportToolbar({ state }: { readonly state: ReportReadyState }) {
  const { range, currentWeek, filters } = state;
  const grouping: ReportGrouping = { groupBy: state.groupBy, subgroups: state.subgroups };
  const isCurrentWeek = sameRange(range, currentWeek);

  return (
    <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {state.previous !== null && (
          <Link
            href={reportHref({ range: state.previous, ...grouping, filters })}
            aria-label={reportLabels.previousPeriod}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Link>
        )}
        {state.next !== null && (
          <Link
            href={reportHref({ range: state.next, ...grouping, filters })}
            aria-label={reportLabels.nextPeriod}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Link>
        )}
      </div>
      <RangePicker
        range={range}
        rangeLabel={state.rangeLabel}
        todayKey={state.todayKey}
        grouping={grouping}
        filters={filters}
        shortcuts={state.shortcuts}
      />
      {!isCurrentWeek && (
        <Link
          href={reportHref({ range: currentWeek, ...grouping, filters })}
          className={buttonVariants({ variant: "outline" })}
        >
          {reportLabels.thisWeek}
        </Link>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <span id={GROUP_BY_LABEL_ID} className="text-muted-foreground text-sm">
          {reportLabels.groupBy}
        </span>
        <div
          role="group"
          aria-labelledby={GROUP_BY_LABEL_ID}
          className="flex flex-wrap items-center rounded-lg border p-0.5"
        >
          {REPORT_GROUP_BYS.map((value) => (
            <GroupByLink
              key={value}
              range={range}
              grouping={grouping}
              filters={filters}
              value={value}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span id={SUBGROUP_BY_LABEL_ID} className="text-muted-foreground text-sm">
          {reportLabels.subgroupBy}
        </span>
        <div
          role="group"
          aria-labelledby={SUBGROUP_BY_LABEL_ID}
          className="flex flex-wrap items-center gap-2"
        >
          <SubgroupPicker range={range} grouping={grouping} filters={filters} level={1} />
          {grouping.subgroups.length > 0 && (
            <SubgroupPicker
              range={range}
              grouping={grouping}
              filters={filters}
              level={2}
            />
          )}
        </div>
      </div>
      <div className="flex max-w-full min-w-0 flex-wrap items-center gap-2">
        <span id={FILTER_BY_LABEL_ID} className="text-muted-foreground text-sm">
          {reportLabels.filterBy}
        </span>
        <div
          role="group"
          aria-labelledby={FILTER_BY_LABEL_ID}
          className="flex max-w-full min-w-0 flex-wrap items-center gap-2"
        >
          {FILTER_KINDS.map((kind) => (
            <FilterPicker
              key={kind}
              range={range}
              grouping={grouping}
              filters={filters}
              kind={kind}
              options={filterOptionsOf(state.filterOptions, kind)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * La elegida se marca con fondo y peso, no solo con color, como la vista del
 * calendario. Elegir una que está en un subnivel las intercambia (§5.2).
 */
function GroupByLink({
  range,
  grouping,
  filters,
  value,
}: {
  readonly range: ReportRange;
  readonly grouping: ReportGrouping;
  readonly filters: ReportFilters;
  readonly value: ReportGroupBy;
}) {
  const current = grouping.groupBy === value;
  return (
    <Link
      href={reportHref({ range, ...withLevel(grouping, 0, value), filters })}
      aria-current={current ? "true" : undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        current ? "bg-secondary font-semibold" : "text-muted-foreground font-normal",
      )}
    >
      {groupByLabels[value]}
    </Link>
  );
}
