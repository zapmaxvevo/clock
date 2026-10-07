import { describe, expect, it } from "vitest";

import type { CalendarDayView, TimeEntryView } from "@/modules/time-entry/schema";

import { dayTotalOf, periodTotalOf } from "./calendar-totals";

const serverNow = "2026-10-02T15:00:00.000Z";

function view(
  id: string,
  dayDate: string,
  durationSeconds: number | null,
): TimeEntryView {
  return {
    id,
    description: "",
    startedAt: `${dayDate}T12:00:00.000Z`,
    endedAt: durationSeconds === null ? null : `${dayDate}T13:00:00.000Z`,
    dayDate,
    weekStart: "2026-09-28",
    startLabel: "09:00",
    endLabel: durationSeconds === null ? null : "10:00",
    startClock: "09:00",
    endClock: durationSeconds === null ? null : "10:00",
    extraDays: 0,
    durationSeconds,
    durationLabel: durationSeconds === null ? null : "1:00:00",
    editableTimes: durationSeconds !== null,
    project: null,
    task: null,
    billable: false,
    tags: [],
  };
}

function day(date: string, closedSeconds: number): CalendarDayView {
  return {
    date,
    label: date,
    isToday: date === "2026-10-02",
    beforeWorkspace: false,
    closedSeconds,
    missingMinutes: [],
  };
}

const thursday = day("2026-10-01", 3_600);
const friday = day("2026-10-02", 7_200);
// Una que empezó el domingo anterior y entra al período por la medianoche.
const lateSunday = view("e-sunday", "2026-09-27", 14_400);
const onThursday = view("e-thursday", "2026-10-01", 3_600);
const onFriday = view("e-friday", "2026-10-02", 7_200);
const running = view("e-running", "2026-10-02", null);

const state = {
  days: [thursday, friday],
  entries: [lateSunday, onThursday, onFriday],
  running,
  serverNow,
  closedSeconds: 10_800,
};

describe("dayTotalOf", () => {
  it("suma las cerradas que empiezan ese día, sin el timer de otro día", () => {
    expect(dayTotalOf(thursday, state, [])).toEqual({
      closedSeconds: 3_600,
      entries: [onThursday],
      removedIds: [],
      runningStartedAt: null,
      serverNow,
    });
  });

  it("la columna del día de inicio del timer suma su transcurrido", () => {
    expect(dayTotalOf(friday, state, [])).toEqual({
      closedSeconds: 7_200,
      entries: [onFriday],
      removedIds: [],
      runningStartedAt: running.startedAt,
      serverNow,
    });
  });

  it("sin timer, ninguna columna lo suma", () => {
    expect(
      dayTotalOf(friday, { ...state, running: null }, []).runningStartedAt,
    ).toBeNull();
  });

  it("pasa los ids del borrado optimista", () => {
    expect(dayTotalOf(friday, state, ["e-friday"]).removedIds).toEqual(["e-friday"]);
  });
});

describe("periodTotalOf", () => {
  it("suma el período y las cerradas que empiezan en él, con el timer que empezó en él", () => {
    expect(periodTotalOf(state, [])).toEqual({
      closedSeconds: 10_800,
      entries: [onThursday, onFriday],
      removedIds: [],
      runningStartedAt: running.startedAt,
      serverNow,
    });
  });

  it("un timer que empezó antes del período no suma acá (CAL-93)", () => {
    const earlier = view("e-running", "2026-09-30", null);
    expect(periodTotalOf({ ...state, running: earlier }, []).runningStartedAt).toBeNull();
  });

  it("pasa los ids del borrado optimista", () => {
    expect(periodTotalOf(state, ["e-thursday"]).removedIds).toEqual(["e-thursday"]);
  });
});
