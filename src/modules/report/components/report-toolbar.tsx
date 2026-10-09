import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportGroupBy, ReportReadyState } from "@/modules/report/schema";

import { reportLabels } from "./labels";
import { RangePicker } from "./range-picker";
import { reportHref } from "./report-href";

const GROUP_BY_LABEL_ID = "reporte-agrupar";

/**
 * RP-20 y RP-11: las flechas del período, el rango que abre los atajos y el
 * calendario, el enlace a la semana en curso y la agrupación. Cada enlace
 * conserva lo que no cambia (D-R2a-4).
 */
export function ReportToolbar({ state }: { readonly state: ReportReadyState }) {
  const { range, groupBy, currentWeek } = state;
  const isCurrentWeek =
    range.first === currentWeek.first && range.last === currentWeek.last;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        {state.previous !== null && (
          <Link
            href={reportHref({ range: state.previous, groupBy })}
            aria-label={reportLabels.previousPeriod}
            className={buttonVariants({ variant: "outline", size: "icon" })}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Link>
        )}
        {state.next !== null && (
          <Link
            href={reportHref({ range: state.next, groupBy })}
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
        groupBy={groupBy}
        shortcuts={state.shortcuts}
      />
      {!isCurrentWeek && (
        <Link
          href={reportHref({ range: currentWeek, groupBy })}
          className={buttonVariants({ variant: "outline" })}
        >
          {reportLabels.thisWeek}
        </Link>
      )}
      <div className="flex items-center gap-2">
        <span id={GROUP_BY_LABEL_ID} className="text-muted-foreground text-sm">
          {reportLabels.groupBy}
        </span>
        <div
          role="group"
          aria-labelledby={GROUP_BY_LABEL_ID}
          className="flex items-center rounded-lg border p-0.5"
        >
          <GroupByLink state={state} value="person" label={reportLabels.byPerson} />
          <GroupByLink state={state} value="project" label={reportLabels.byProject} />
          <GroupByLink state={state} value="client" label={reportLabels.byClient} />
        </div>
      </div>
    </div>
  );
}

/** La elegida se marca con fondo y peso, no solo con color, como la vista del calendario. */
function GroupByLink({
  state,
  value,
  label,
}: {
  readonly state: ReportReadyState;
  readonly value: ReportGroupBy;
  readonly label: string;
}) {
  const current = state.groupBy === value;
  return (
    <Link
      href={reportHref({ range: state.range, groupBy: value })}
      aria-current={current ? "true" : undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        current ? "bg-secondary font-semibold" : "text-muted-foreground font-normal",
      )}
    >
      {label}
    </Link>
  );
}
