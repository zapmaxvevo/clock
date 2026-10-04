import type { CalendarDayView, CalendarState } from "@/modules/time-entry/schema";

import type { GroupTotal } from "../use-group-total";

/**
 * La columna de un día (CAL-31, CAL-32, CAL-34): las cerradas que empiezan
 * ese día, y el timer solo en la columna de su día de inicio (P-02).
 */
export function dayTotalOf(
  day: CalendarDayView,
  state: Pick<CalendarState, "entries" | "running" | "serverNow">,
  removedIds: readonly string[],
): GroupTotal {
  return {
    closedSeconds: day.closedSeconds,
    entries: state.entries.filter((entry) => entry.dayDate === day.date),
    removedIds,
    runningStartedAt:
      state.running?.dayDate === day.date ? state.running.startedAt : null,
    serverNow: state.serverNow,
  };
}

/** El período (CAL-33, CAL-34): el timer suma solo si empezó en él (CAL-93). */
export function periodTotalOf(
  state: Pick<
    CalendarState,
    "days" | "entries" | "running" | "serverNow" | "closedSeconds"
  >,
  removedIds: readonly string[],
): GroupTotal {
  const inPeriod = (dayDate: string) => state.days.some((day) => day.date === dayDate);
  return {
    closedSeconds: state.closedSeconds,
    entries: state.entries.filter((entry) => inPeriod(entry.dayDate)),
    removedIds,
    runningStartedAt:
      state.running !== null && inPeriod(state.running.dayDate)
        ? state.running.startedAt
        : null,
    serverNow: state.serverNow,
  };
}
