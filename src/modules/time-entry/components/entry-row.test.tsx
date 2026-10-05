import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import { TrackingCatalogProvider } from "@/modules/project/components/tracking-catalog";
import type { ProjectSelection, TrackingCatalog } from "@/modules/project/schema";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import type { DisplayFormats } from "@/server/time";

import { EntryRow } from "./entry-row";

const catalog: TrackingCatalog = { canCreateProject: false, groups: [] };
const none: ProjectSelection = { project: null, task: null };

const entry: TimeEntryView = {
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
  durationLabel: "1:30:00",
  editableTimes: true,
  project: null,
  task: null,
  billable: false,
};

type Options = {
  readonly canTrack?: boolean;
  readonly selected?: boolean;
  readonly selectionLocked?: boolean;
  readonly formats?: DisplayFormats;
  readonly description?: string;
};

function render(options: Options = {}): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider
      formats={options.formats ?? { time: "24h", date: "dd/MM/yyyy" }}
    >
      <TrackingCatalogProvider catalog={catalog}>
        <EntryRow
          entry={entry}
          description={options.description ?? entry.description}
          project={none}
          busy={false}
          canTrack={options.canTrack ?? true}
          selected={options.selected ?? false}
          onToggleSelected={() => undefined}
          selectionLocked={options.selectionLocked ?? false}
          pendingTimes={null}
          todayKey="2026-10-04"
          minDayKey="2026-01-01"
          onSave={() => undefined}
          onChangeProject={() => undefined}
          onSaveTimes={() => undefined}
          onDelete={() => undefined}
          onContinue={() => undefined}
          continuing={false}
          continueShortcut={false}
          onDuplicate={() => undefined}
          focusTimesOnMount={false}
          onTimesFocused={() => undefined}
        />
      </TrackingCatalogProvider>
    </DisplayFormatsProvider>,
  );
}

/** El elemento con rol `checkbox`, con sus atributos. */
function checkboxOf(markup: string): string | null {
  return markup.match(/<[a-z]+[^>]*role="checkbox"[^>]*>/)?.[0] ?? null;
}

describe("EntryRow", () => {
  it("con permiso, la casilla de la fila la nombra con su descripción y sus horas", () => {
    const checkbox = checkboxOf(render());

    expect(checkbox).toContain('aria-label="Seleccionar «Informe», 09:00 – 10:30"');
    expect(checkbox).toContain('aria-checked="false"');
  });

  it("la casilla es lo primero de la fila", () => {
    const markup = render();

    expect(markup.search(/role="checkbox"/)).toBeLessThan(markup.search(/<button/));
  });

  it("las horas del nombre siguen el formato de la persona", () => {
    const checkbox = checkboxOf(render({ formats: { time: "12h", date: "dd/MM/yyyy" } }));

    expect(checkbox).toContain('aria-label="Seleccionar «Informe», 9:00 AM – 10:30 AM"');
  });

  it("una entrada sin descripción se nombra «Sin descripción»", () => {
    expect(checkboxOf(render({ description: "" }))).toContain(
      'aria-label="Seleccionar «Sin descripción», 09:00 – 10:30"',
    );
  });

  it("elegida, la casilla está marcada", () => {
    expect(checkboxOf(render({ selected: true }))).toContain('aria-checked="true"');
  });

  it("con una operación en masa en vuelo, inactiva sin `disabled`", () => {
    const checkbox = checkboxOf(render({ selectionLocked: true })) ?? "";

    expect(checkbox).toContain('aria-disabled="true"');
    expect(checkbox).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("con la membresía desactivada no hay casilla (TT-92)", () => {
    expect(checkboxOf(render({ canTrack: false }))).toBeNull();
  });
});
