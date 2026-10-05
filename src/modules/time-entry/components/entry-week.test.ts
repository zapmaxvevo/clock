import { describe, expect, it } from "vitest";

import type { TimeEntryView } from "@/modules/time-entry/schema";

import { reachArrived, reachFloor, startedWeeks, weekToReach } from "./entry-week";

const reachFrom = "2026-09-21";

describe("weekToReach", () => {
  it("una semana anterior a la ventana es la que hay que alcanzar", () => {
    expect(weekToReach(reachFrom, ["2026-08-17"])).toBe("2026-08-17");
  });

  it("la semana del piso ya se ve", () => {
    expect(weekToReach(reachFrom, [reachFrom])).toBeNull();
  });

  it("una semana posterior al piso ya se ve", () => {
    expect(weekToReach(reachFrom, ["2026-09-28"])).toBeNull();
  });

  it("entre varias, alcanza la única anterior al piso", () => {
    expect(weekToReach(reachFrom, ["2026-09-28", "2026-08-31", reachFrom])).toBe(
      "2026-08-31",
    );
  });

  it("con varias anteriores, alcanza la más vieja", () => {
    expect(weekToReach(reachFrom, ["2026-09-07", "2026-08-10", "2026-08-31"])).toBe(
      "2026-08-10",
    );
  });

  it("sin semanas no hay nada que alcanzar", () => {
    expect(weekToReach(reachFrom, [])).toBeNull();
  });
});

describe("reachFloor", () => {
  it("sin semana pedida, la cota es el piso del último render", () => {
    expect(reachFloor(reachFrom, null)).toBe(reachFrom);
  });

  it("una semana pedida que todavía no llegó baja la cota", () => {
    expect(reachFloor(reachFrom, "2026-08-03")).toBe("2026-08-03");
  });

  it("una semana pedida que ya llegó no la cambia", () => {
    expect(reachFloor(reachFrom, "2026-09-28")).toBe(reachFrom);
  });

  it("la segunda respuesta en vuelo no pide una semana posterior a la ya pedida", () => {
    const floor = reachFloor(reachFrom, "2026-08-03");
    expect(weekToReach(floor, ["2026-08-31"])).toBeNull();
    expect(weekToReach(floor, ["2026-07-27"])).toBe("2026-07-27");
  });
});

describe("reachArrived", () => {
  it("con la URL en la semana pedida, llegó", () => {
    expect(reachArrived("2026-08-03", reachFrom, "2026-08-03")).toBe(true);
  });

  it("con la ventana que ya la alcanza, llegó aunque la URL diga otra cosa", () => {
    expect(reachArrived("2026-09-28", reachFrom, null)).toBe(true);
    expect(reachArrived(reachFrom, reachFrom, "2026-07-06")).toBe(true);
  });

  it("con la ventana posterior y la URL en otro `desde`, no llegó", () => {
    expect(reachArrived("2026-08-03", reachFrom, null)).toBe(false);
    expect(reachArrived("2026-08-03", reachFrom, "2026-08-31")).toBe(false);
  });
});

/** Una vista con solo lo que `startedWeeks` lee. */
function viewIn(weekStart: string): TimeEntryView {
  return {
    id: "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11",
    description: "",
    startedAt: "2026-09-01T12:00:00.000Z",
    endedAt: null,
    dayDate: weekStart,
    weekStart,
    startLabel: "09:00",
    endLabel: null,
    startClock: "09:00",
    endClock: null,
    extraDays: 0,
    durationSeconds: null,
    durationLabel: null,
    editableTimes: false,
    project: null,
    task: null,
    billable: false,
  };
}

describe("startedWeeks", () => {
  it("sin timer cerrado, solo la semana del nuevo", () => {
    expect(startedWeeks({ running: viewIn("2026-09-28"), stopped: null })).toEqual([
      "2026-09-28",
    ]);
  });

  it("con un timer cerrado, también la suya", () => {
    expect(
      startedWeeks({ running: viewIn("2026-09-28"), stopped: viewIn("2026-08-17") }),
    ).toEqual(["2026-09-28", "2026-08-17"]);
  });
});
