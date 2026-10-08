"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { TimesheetState } from "@/modules/time-entry/schema";

import { calendarLabels } from "../calendar/labels";
import { PeriodPicker } from "../calendar/period-picker";
import { timesheetLabels } from "./labels";
import { timesheetHref } from "./timesheet-href";

/**
 * TS-09: las flechas de la semana, el rango que abre el calendario y, si se
 * mira otra semana, el atajo a la actual.
 */
export function TimesheetToolbar({ state }: { readonly state: TimesheetState }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={timesheetHref(state.previousStart)}
          aria-label={calendarLabels.previousWeek}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
        <Link
          href={timesheetHref(state.nextStart)}
          aria-label={calendarLabels.nextWeek}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Link>
      </div>
      <PeriodPicker
        hrefOf={timesheetHref}
        periodStart={state.weekStart}
        periodLabel={state.weekLabel}
        todayKey={state.todayKey}
      />
      {state.weekStart !== state.currentStart && (
        <Link
          href={timesheetHref(state.currentStart)}
          className={buttonVariants({ variant: "outline" })}
        >
          {timesheetLabels.thisWeek}
        </Link>
      )}
    </div>
  );
}
