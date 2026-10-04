"use client";

import { ChevronLeftIcon, ChevronRightIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react";
import Link from "next/link";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CalendarState } from "@/modules/time-entry/schema";

import { useGroupTotalLabel } from "../use-group-total";
import { calendarHref } from "./calendar-href";
import { NO_REMOVED_IDS, periodTotalOf } from "./calendar-totals";
import { zoomedIn, zoomedOut, type CalendarZoom } from "./calendar-zoom";
import { calendarLabels } from "./labels";
import { PeriodPicker } from "./period-picker";

type CalendarToolbarProps = {
  readonly state: CalendarState;
};

/** CAL-15 a CAL-17, CAL-33: la navegación del período, la vista y el total. */
export function CalendarToolbar({ state }: CalendarToolbarProps) {
  const isWeek = state.mode === "week";
  const isTodayPeriod = state.periodStart === state.todayStart;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Link
          href={calendarHref(state.mode, state.previousStart)}
          aria-label={isWeek ? calendarLabels.previousWeek : calendarLabels.previousDay}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronLeftIcon aria-hidden="true" />
        </Link>
        <Link
          href={calendarHref(state.mode, state.nextStart)}
          aria-label={isWeek ? calendarLabels.nextWeek : calendarLabels.nextDay}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronRightIcon aria-hidden="true" />
        </Link>
      </div>

      <Link
        href={calendarHref(state.mode, state.todayStart)}
        aria-current={isTodayPeriod ? "page" : undefined}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "aria-[current=page]:bg-muted",
        )}
      >
        {calendarLabels.today}
      </Link>

      <PeriodPicker
        mode={state.mode}
        periodStart={state.periodStart}
        periodLabel={state.periodLabel}
        todayKey={state.todayKey}
      />

      <div className="flex items-center rounded-lg border p-0.5">
        <ModeLink
          href={calendarHref("week", state.weekModeStart)}
          current={isWeek}
          label={calendarLabels.weekView}
        />
        <ModeLink
          href={calendarHref("day", state.dayModeStart)}
          current={!isWeek}
          label={calendarLabels.dayView}
        />
      </div>

      {isWeek && <PeriodTotal state={state} />}
    </div>
  );
}

/** CAL-07: la vista actual se marca con fondo y peso, no solo con color. */
function ModeLink({
  href,
  current,
  label,
}: {
  readonly href: string;
  readonly current: boolean;
  readonly label: string;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        current ? "bg-secondary font-semibold" : "text-muted-foreground font-normal",
      )}
    >
      {label}
    </Link>
  );
}

/** CAL-33, CAL-34: con el timer del período, sube junto con su contador. */
function PeriodTotal({ state }: { readonly state: CalendarState }) {
  const total = useGroupTotalLabel(periodTotalOf(state, NO_REMOVED_IDS));
  return (
    <p className="ml-auto text-sm">
      <span className="text-muted-foreground">{calendarLabels.total}</span>{" "}
      <span className="font-medium tabular-nums">{total}</span>
    </p>
  );
}

type ZoomControlsProps = {
  readonly zoom: CalendarZoom;
  readonly onChange: (zoom: CalendarZoom) => void;
};

/**
 * CAL-11: «Acercar» y «Alejar», en la esquina de la grilla. En su extremo
 * quedan inactivos con `aria-disabled` y sin actuar: con `disabled` el botón
 * que tenía el foco lo perdería.
 */
export function ZoomControls({ zoom, onChange }: ZoomControlsProps) {
  const closer = zoomedIn(zoom);
  const farther = zoomedOut(zoom);

  function change(next: CalendarZoom | null): void {
    if (next !== null) {
      onChange(next);
    }
  }

  return (
    <div className="flex items-center gap-0.5 whitespace-nowrap">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={calendarLabels.zoomIn}
        aria-disabled={closer === null}
        onClick={() => change(closer)}
      >
        <ZoomInIcon aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={calendarLabels.zoomOut}
        aria-disabled={farther === null}
        onClick={() => change(farther)}
      >
        <ZoomOutIcon aria-hidden="true" />
      </Button>
      <span aria-hidden="true" className="text-muted-foreground text-xs tabular-nums">
        {calendarLabels.zoomShort(zoom)}
      </span>
      <span role="status" className="sr-only">
        {calendarLabels.zoomStatus(zoom)}
      </span>
    </div>
  );
}
