import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { TrackingCatalog } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DisplayFormats } from "@/server/time";

import { EntryDialogBody } from "./entry-dialog";

const catalog: TrackingCatalog = {
  canCreateProject: true,
  groups: [
    {
      client: null,
      projects: [
        {
          id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
          name: "Web",
          color: "teal",
          tasks: [{ id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" }],
        },
      ],
    },
  ],
};
const serverNow = "2026-10-04T15:00:00.000Z";

const closed: TimeEntryView = {
  id: "8d0f7a52-4c1e-4b8e-9a43-2f6a1c3e5b70",
  description: "Informe",
  startedAt: "2026-10-02T12:00:00.000Z",
  endedAt: "2026-10-02T13:30:00.000Z",
  dayDate: "2026-10-02",
  weekStart: "2026-09-28",
  startLabel: "09:00",
  endLabel: "10:30",
  startClock: "09:00",
  endClock: "10:30",
  extraDays: 0,
  durationSeconds: 5_400,
  durationLabel: "1:30",
  editableTimes: true,
  project: { id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", name: "Web", color: "teal" },
  task: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Diseño" },
};

const overnight: TimeEntryView = {
  ...closed,
  description: "",
  startedAt: "2026-10-02T01:00:00.000Z",
  endedAt: "2026-10-04T05:00:00.000Z",
  dayDate: "2026-10-01",
  startClock: "22:00",
  endClock: "02:00",
  extraDays: 2,
  durationSeconds: 187_200,
  durationLabel: "52:00",
  editableTimes: false,
  project: null,
  task: null,
};

const running: TimeEntryView = {
  ...closed,
  startedAt: "2026-10-04T13:00:00.000Z",
  endedAt: null,
  dayDate: "2026-10-04",
  startClock: "10:00",
  endClock: null,
  endLabel: null,
  durationSeconds: null,
  durationLabel: null,
  editableTimes: false,
};

function render(
  entry: TimeEntryView,
  formats: DisplayFormats = { time: "24h", date: "dd/MM/yyyy" },
): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={formats}>
      <TrackingCatalogProvider catalog={catalog}>
        <EntryDialogBody entry={entry} serverNow={serverNow} todayKey="2026-10-04" />
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** Los pares término y definición, como texto. */
function fieldsOf(markup: string): readonly (readonly [string, string])[] {
  const text = (html: string) => html.replace(/<[^>]*>/g, "");
  return [...markup.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(
    (match) => [text(match[1]), text(match[2])] as const,
  );
}

/** Ningún control: ni botones, ni campos, ni el disparador del selector. */
function expectNoControls(markup: string): void {
  expect(markup).not.toMatch(/<(button|input|textarea|select)\b/);
  expect(markup).not.toContain('role="combobox"');
  expect(markup).not.toContain("tabindex");
}

describe("EntryDialogBody (CAL-65, CAL-66)", () => {
  it("una cerrada muestra sus campos como texto", () => {
    const markup = render(closed);
    expect(fieldsOf(markup)).toEqual([
      ["Descripción", "Informe"],
      ["Proyecto", "Web: Diseño"],
      ["Fecha", "vie, 02/10"],
      ["Hora de inicio", "09:00"],
      ["Hora de fin", "10:30"],
      ["Duración", "1:30"],
    ]);
    expectNoControls(markup);
  });

  it("con 12 h elegidas, las horas van en ese formato", () => {
    const fields = fieldsOf(render(closed, { time: "12h", date: "dd/MM/yyyy" }));
    expect(fields).toContainEqual(["Hora de inicio", "9:00 AM"]);
    expect(fields).toContainEqual(["Hora de fin", "10:30 AM"]);
  });

  it("la de más de un día lleva el superíndice y lo dice para el lector de pantalla", () => {
    const markup = render(overnight);
    expect(fieldsOf(markup)).toEqual([
      ["Descripción", "Sin descripción"],
      ["Proyecto", "Sin proyecto"],
      ["Fecha", "jue, 01/10"],
      ["Hora de inicio", "22:00"],
      ["Hora de fin", "02:00+2 (termina 2 días después)"],
      ["Duración", "52:00"],
    ]);
    expect(markup).toContain('<span class="sr-only"> (termina 2 días después)</span>');
    expectNoControls(markup);
  });

  it("el timer dice que el fin está en curso, con el transcurrido y sin duración", () => {
    const markup = render(running);
    const fields = fieldsOf(markup);
    expect(fields.map(([term]) => term)).toEqual([
      "Descripción",
      "Proyecto",
      "Fecha",
      "Hora de inicio",
      "Fin: en curso",
    ]);
    expect(fields).toContainEqual(["Fecha", "Hoy"]);
    expect(markup).toContain('role="timer"');
    expect(fields.at(-1)?.[1]).toBe("2:00:00");
    expectNoControls(markup);
  });
});
