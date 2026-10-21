import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import type { CalendarState } from "@/modules/time-entry/schema";
import type { DurationFormat } from "@/server/time";

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

function render(
  canTrack: boolean,
  overrides: Partial<CalendarState> = {},
  duration: DurationFormat = "compact",
): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={{ time: "24h", date: "dd/MM/yyyy", duration }}>
      <CalendarToolbar
        state={{ ...state, canTrack, ...overrides }}
        removedIds={[]}
        addButtonRef={{ current: null }}
        onAdd={() => undefined}
      />
    </DisplayFormatsProvider>,
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

describe("CalendarToolbar, el total del período (CAL-93, ADR 0029)", () => {
  it("va con el formato de duración del workspace", () => {
    const text = (markup: string) => markup.replace(/<[^>]*>/g, "");

    expect(text(render(true, { closedSeconds: 200 }))).toContain("Total 0:03");
    expect(text(render(true, { closedSeconds: 200 }, "full"))).toContain(
      "Total 00:03:20",
    );
  });
});
