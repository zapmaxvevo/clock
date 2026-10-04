import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { CalendarState } from "@/modules/time-entry/schema";

import { CalendarToolbar } from "./calendar-toolbar";

// El selector del rango navega con el router de Next, que fuera de la app no existe.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

const state: CalendarState = {
  serverNow: "2026-10-02T15:00:00.000Z",
  todayKey: "2026-10-02",
  minDayKey: "2026-01-01",
  nowMinute: 720,
  canTrack: true,
  mode: "week",
  periodStart: "2026-09-28",
  periodLabel: "Esta semana",
  previousStart: "2026-09-21",
  nextStart: "2026-10-05",
  todayStart: "2026-09-28",
  dayModeStart: "2026-10-02",
  weekModeStart: "2026-09-28",
  days: [],
  entries: [],
  running: null,
  closedSeconds: 0,
};

function render(canTrack: boolean): string {
  return renderToStaticMarkup(
    <CalendarToolbar
      state={{ ...state, canTrack }}
      removedIds={[]}
      addButtonRef={{ current: null }}
      onAdd={() => undefined}
    />,
  );
}

describe("CalendarToolbar, «Agregar entrada» (CAL-74, CAL-05)", () => {
  it("con permiso de carga, la barra termina con «Agregar entrada»", () => {
    expect(render(true)).toMatch(
      /<button[^>]*>(<svg.*?<\/svg>)?Agregar entrada<\/button>/,
    );
  });

  it("sin permiso de carga, no hay alta (TT-92)", () => {
    const markup = render(false);
    expect(markup).not.toContain("Agregar entrada");
    expect(markup).toContain("Elegir fecha: Esta semana");
  });
});
