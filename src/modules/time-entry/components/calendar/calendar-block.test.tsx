import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { TrackingCatalog } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DisplayFormats } from "@/server/time";

import { CalendarBlock } from "./calendar-block";
import { NO_GESTURES, type SegmentGestures } from "./calendar-gestures";
import type { Segment } from "./calendar-layout";

const catalog: TrackingCatalog = {
  canCreateProject: false,
  canCreateTag: false,
  groups: [],
  tags: [],
};
const serverNow = "2026-10-02T15:00:00.000Z";
const H24: DisplayFormats = { time: "24h", date: "dd/MM/yyyy", duration: "compact" };
const H12: DisplayFormats = { time: "12h", date: "dd/MM/yyyy", duration: "compact" };

const morning: TimeEntryView = {
  id: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
  description: "Informe",
  startedAt: "2026-09-30T12:00:00.000Z",
  endedAt: "2026-09-30T13:30:00.000Z",
  dayDate: "2026-09-30",
  weekStart: "2026-09-28",
  startLabel: "09:00",
  endLabel: "10:30",
  startClock: "09:00",
  endClock: "10:30",
  extraDays: 0,
  durationSeconds: 5_400,
  durationLabel: "1:30",
  editableTimes: true,
  project: null,
  task: null,
  billable: false,
  tags: [],
};

const overnight: TimeEntryView = {
  ...morning,
  id: "3b9e1f0c-7a2d-4e5b-8c6f-1d2e3f4a5b6c",
  description: "Guardia",
  startedAt: "2026-10-02T01:00:00.000Z",
  endedAt: "2026-10-02T05:00:00.000Z",
  dayDate: "2026-10-01",
  startLabel: "22:00",
  endLabel: "02:00",
  startClock: "22:00",
  endClock: "02:00",
  extraDays: 1,
  durationSeconds: 14_400,
  durationLabel: "4:00",
};

const withProject: TimeEntryView = {
  ...morning,
  description: "",
  project: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Web", color: "teal" },
  task: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" },
};

const running: TimeEntryView = {
  ...morning,
  id: "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f",
  description: "Soporte",
  startedAt: "2026-10-02T03:00:00.000Z",
  endedAt: null,
  dayDate: "2026-10-02",
  startLabel: "00:00",
  startClock: "00:00",
  endClock: null,
  endLabel: null,
  durationSeconds: null,
  durationLabel: null,
  editableTimes: false,
  project: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Web", color: "teal" },
};

/** La vista como la arma el servidor para quien eligió 12 h. */
function in12h(entry: TimeEntryView, startLabel: string, endLabel: string | null) {
  return { ...entry, startLabel, endLabel };
}

function segmentOf(entry: TimeEntryView, overrides: Partial<Segment> = {}): Segment {
  return {
    date: entry.dayDate,
    from: 0,
    to: 60,
    startsHere: true,
    firstVisible: true,
    ...overrides,
  };
}

function render(
  entry: TimeEntryView,
  options: {
    readonly formats?: DisplayFormats;
    readonly segment?: Segment;
    readonly gestures?: SegmentGestures;
    readonly busy?: boolean;
  } = {},
): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={options.formats ?? H24}>
      <TrackingCatalogProvider catalog={catalog}>
        <CalendarBlock
          entry={entry}
          segment={options.segment ?? segmentOf(entry)}
          placement={{ top: 0, height: 48, lane: 0, lanes: 1 }}
          serverNow={serverNow}
          todayKey="2026-10-04"
          detailsOff={false}
          onOpen={() => undefined}
          gestures={options.gestures ?? NO_GESTURES}
          busy={options.busy ?? false}
          dragging={false}
          onGestureStart={() => undefined}
        />
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** El elemento del bloque, con sus atributos. */
function blockOf(markup: string): string | null {
  return markup.match(/<[a-z]+[^>]*data-entry-block="[^"]*"[^>]*>/)?.[0] ?? null;
}

function nameOf(markup: string): string | null {
  return blockOf(markup)?.match(/aria-label="([^"]*)"/)?.[1] ?? null;
}

describe("CalendarBlock, el nombre accesible (CAL-75)", () => {
  it("una cerrada dice la descripción, el día, el horario y la duración", () => {
    expect(nameOf(render(morning))).toBe("Informe, mié, 30/09, de 09:00 a 10:30, 1:30");
  });

  it("las horas son los rótulos de la vista: con 12 h, en ese formato", () => {
    expect(nameOf(render(in12h(morning, "9:00 AM", "10:30 AM"), { formats: H12 }))).toBe(
      "Informe, mié, 30/09, de 9:00 AM a 10:30 AM, 1:30",
    );
  });

  it("el día sale con el formato de fecha de la persona", () => {
    expect(
      nameOf(
        render(morning, {
          formats: { time: "24h", date: "MM/dd/yyyy", duration: "compact" },
        }),
      ),
    ).toBe("Informe, mié, 09/30, de 09:00 a 10:30, 1:30");
  });

  it("la que cruza la medianoche dice que termina un día después", () => {
    expect(nameOf(render(overnight))).toBe(
      "Guardia, jue, 01/10, de 22:00 a 02:00 (termina un día después), 4:00",
    );
    expect(
      nameOf(render(in12h(overnight, "10:00 PM", "2:00 AM"), { formats: H12 })),
    ).toBe("Guardia, jue, 01/10, de 10:00 PM a 2:00 AM (termina un día después), 4:00");
  });

  it("suma el proyecto y la tarea, y nombra la que no tiene descripción", () => {
    expect(nameOf(render(withProject))).toBe(
      "Sin descripción, mié, 30/09, de 09:00 a 10:30, 1:30, Web: Diseño",
    );
  });

  it("el timer dice desde cuándo y que está en curso", () => {
    expect(nameOf(render(running))).toBe(
      "Soporte, vie, 02/10, desde las 00:00, en curso, Web",
    );
    expect(nameOf(render(in12h(running, "12:00 AM", null), { formats: H12 }))).toBe(
      "Soporte, vie, 02/10, desde las 12:00 AM, en curso, Web",
    );
  });
});

describe("CalendarBlock, el facturable (CAL-21, CAL-75)", () => {
  const billable: TimeEntryView = { ...withProject, billable: true };

  it("el nombre accesible termina en «facturable» cuando lo es", () => {
    expect(nameOf(render(billable))).toBe(
      "Sin descripción, mié, 30/09, de 09:00 a 10:30, 1:30, Web: Diseño, facturable",
    );
    expect(nameOf(render({ ...running, billable: true }))).toBe(
      "Soporte, vie, 02/10, desde las 00:00, en curso, Web, facturable",
    );
  });

  it("el ícono va al final de la línea del horario, oculto para el lector", () => {
    expect(render(billable)).toMatch(
      /09:00 – 10:30 · 1:30<\/span><svg[^>]*aria-hidden="true"[^>]*data-slot="billable-icon"/,
    );
  });

  it("sin facturable no hay ícono", () => {
    expect(render(withProject)).not.toContain('data-slot="billable-icon"');
  });

  it("solo en el segmento del día de inicio", () => {
    const later = render(
      { ...overnight, billable: true },
      { segment: segmentOf(overnight, { startsHere: false, firstVisible: false }) },
    );
    expect(later).not.toContain('data-slot="billable-icon"');
  });
});

describe("CalendarBlock, los segmentos (CAL-26, CAL-76)", () => {
  it("el primer segmento visible es un botón con el id de la entrada", () => {
    const block = blockOf(render(overnight));
    expect(block).toMatch(/^<button/);
    expect(block).toContain(`data-entry-block="${overnight.id}"`);
    expect(block).not.toContain("aria-hidden");
  });

  it("el que no es el primero no es botón, está oculto y no se alcanza con Tab", () => {
    const markup = render(overnight, {
      segment: segmentOf(overnight, {
        date: "2026-10-02",
        startsHere: false,
        firstVisible: false,
      }),
    });
    const block = blockOf(markup);
    expect(block).toMatch(/^<div/);
    expect(block).toContain(`data-entry-block="${overnight.id}"`);
    expect(block).toContain('aria-hidden="true"');
    expect(block).not.toContain("tabindex");
    expect(markup).not.toContain("<button");
  });

  it("el timer muestra desde cuándo, en curso, y el transcurrido en h:mm", () => {
    // De las 03:00 a las 15:00 UTC del `serverNow`.
    expect(render(running)).toContain("00:00 – en curso · 12:00");
  });

  it("el transcurrido del timer va con el formato de duración, no con el del contador (D-WS2a-7)", () => {
    // 100 segundos antes del `serverNow`.
    const recent = {
      ...running,
      startedAt: "2026-10-02T14:58:20.000Z",
      startLabel: "11:58",
    };

    expect(render(recent)).toContain("11:58 – en curso · 0:01");
    expect(render(recent, { formats: { ...H24, duration: "full" } })).toContain(
      "11:58 – en curso · 00:01:40",
    );
  });

  it("solo el segmento del día de inicio lleva el horario", () => {
    expect(render(overnight)).toMatch(/22:00 – 02:00<sup[^>]*>\+1<\/sup>/);
    const later = render(overnight, {
      segment: segmentOf(overnight, { startsHere: false, firstVisible: false }),
    });
    expect(later).toContain("Guardia");
    expect(later).not.toContain("22:00");
  });
});

describe("CalendarBlock, los gestos (CAL-52, CAL-58, CAL-62)", () => {
  function handlesOf(markup: string): readonly string[] {
    return [...markup.matchAll(/<span[^>]*data-block-handle="([a-z]+)"[^>]*>/g)].map(
      (match) => match[1],
    );
  }

  it("sin gestos no tiene asas ni cursor de arrastre", () => {
    const markup = render(morning);
    expect(handlesOf(markup)).toEqual([]);
    expect(blockOf(markup)).not.toContain("cursor-grab");
  });

  it("con los gestos que ofrece, sus asas ocultas y el cursor de arrastre", () => {
    const markup = render(morning, { gestures: { move: true, start: true, end: true } });
    expect(handlesOf(markup)).toEqual(["start", "end"]);
    expect(markup).toMatch(/<span aria-hidden="true" data-block-handle="start"/);
    expect(markup).not.toMatch(/data-block-handle="[a-z]+"[^>]*tabindex/);
    expect(blockOf(markup)).toContain("cursor-grab");
  });

  it("cada asa por separado", () => {
    expect(
      handlesOf(render(morning, { gestures: { move: false, start: true, end: false } })),
    ).toEqual(["start"]);
    expect(
      handlesOf(render(morning, { gestures: { move: false, start: false, end: true } })),
    ).toEqual(["end"]);
  });

  it("con el pedido de su horario en vuelo, atenuado, ocupado e inactivo (TT-55)", () => {
    const block = blockOf(render(morning, { busy: true }));
    expect(block).toContain('aria-busy="true"');
    expect(block).toContain('aria-disabled="true"');
    expect(block).toContain("opacity-60");
    expect(blockOf(render(morning))).not.toContain("aria-busy");
  });
});
