"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { TimeEntryView, WeekGroupView } from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { useElapsedSeconds } from "./elapsed-counter";
import { trackerLabels } from "./labels";

type WeekGroupProps = {
  readonly week: WeekGroupView;
  /** Solo se usa en la semana del timer activo. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  /** Las entradas cuyo borrado viaja: salen del total como salen del de su día. */
  readonly removedIds: readonly string[];
  /** TT-52: el encabezado toma el foco cuando termina «Cargar más». */
  readonly takeFocus: boolean;
  readonly onFocused: () => void;
  /** Los grupos de día de la semana. */
  readonly children: ReactNode;
};

/**
 * Una semana de la lista con su total (TT-47). El de la semana del timer
 * activo suma el transcurrido y sube junto con el contador (TT-46), con la
 * misma suma en segundos que el total del día: se formatea una sola vez.
 */
export function WeekGroup({
  week,
  running,
  serverNow,
  removedIds,
  takeFocus,
  onFocused,
  children,
}: WeekGroupProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (takeFocus) {
      headingRef.current?.focus();
      onFocused();
    }
  }, [takeFocus, onFocused]);

  const removedSeconds = week.days
    .flatMap((day) => day.entries)
    .filter((entry) => removedIds.includes(entry.id))
    .reduce((total, entry) => total + (entry.durationSeconds ?? 0), 0);
  const runningStartedAt =
    week.isRunningWeek && running !== null ? running.startedAt : null;
  const elapsed = useElapsedSeconds(runningStartedAt, serverNow);
  const totalLabel = formatDuration(
    Math.floor((Math.max(0, week.closedSeconds - removedSeconds) + elapsed) / 60),
  );
  const headingId = `semana-${week.start}`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <header className="flex items-center justify-between gap-4 px-3">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="focus:ring-ring rounded-md text-sm font-semibold focus:ring-3 focus:outline-none"
        >
          {week.label}
        </h2>
        <p className="text-sm">
          <span className="text-muted-foreground">{trackerLabels.weekTotal}</span>{" "}
          <span className="font-semibold tabular-nums">{totalLabel}</span>
        </p>
      </header>
      {children}
    </section>
  );
}
