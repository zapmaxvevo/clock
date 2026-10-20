import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DurationFormat } from "@/server/time";

import { useGroupTotalLabel, type GroupTotal } from "./use-group-total";

const serverNow = "2026-10-02T15:00:00.000Z";

function closed(id: string, durationSeconds: number): TimeEntryView {
  return {
    id,
    description: "",
    startedAt: "2026-10-02T12:00:00.000Z",
    endedAt: "2026-10-02T12:01:40.000Z",
    dayDate: "2026-10-02",
    weekStart: "2026-09-28",
    startLabel: "09:00",
    endLabel: "09:01",
    startClock: "09:00",
    endClock: "09:01",
    extraDays: 0,
    durationSeconds,
    durationLabel: null,
    editableTimes: true,
    project: null,
    task: null,
    billable: false,
    tags: [],
  };
}

// Dos entradas de 100 segundos: cada fila dice `0:01` y el día `0:03` (D-WS2a-5).
const first = closed("a", 100);
const second = closed("b", 100);
const day: GroupTotal = {
  closedSeconds: 200,
  entries: [first, second],
  removedIds: [],
  runningStartedAt: null,
  serverNow,
};

function Total({ total }: { readonly total: GroupTotal }) {
  return <>{useGroupTotalLabel(total)}</>;
}

function render(total: GroupTotal, duration: DurationFormat): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={{ time: "24h", date: "dd/MM/yyyy", duration }}>
      <Total total={total} />
    </DisplayFormatsProvider>,
  );
}

describe("useGroupTotalLabel (TT-45, ADR 0029)", () => {
  it("formatea la suma exacta en segundos una sola vez, con el formato del workspace", () => {
    expect(render(day, "compact")).toBe("0:03");
    expect(render(day, "full")).toBe("00:03:20");
  });

  it("la entrada cuyo borrado viaja sale del total", () => {
    const removing = { ...day, removedIds: [second.id] };

    expect(render(removing, "compact")).toBe("0:01");
    expect(render(removing, "full")).toBe("00:01:40");
  });

  it("con el timer del grupo suma el transcurrido", () => {
    // 100 segundos antes del `serverNow`.
    const running = { ...day, runningStartedAt: "2026-10-02T14:58:20.000Z" };

    expect(render(running, "compact")).toBe("0:05");
    expect(render(running, "full")).toBe("00:05:00");
  });
});
