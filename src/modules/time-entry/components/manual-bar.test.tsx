import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import type { DurationFormat } from "@/server/time";

import { ManualBar } from "./manual-bar";

function render(duration: DurationFormat): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={{ time: "24h", date: "dd/MM/yyyy", duration }}>
      <ManualBar
        descriptionField={null}
        projectPicker={null}
        tagPicker={null}
        billableToggle={null}
        draft={{ date: "2026-10-02", start: "09:00", end: "10:30" }}
        onDraftChange={() => undefined}
        todayKey="2026-10-02"
        minDayKey="2026-01-01"
        canTrack
        adding={false}
        onAdd={() => undefined}
      />
    </DisplayFormatsProvider>,
  );
}

/** El campo nombrado «Duración». */
function durationField(markup: string): string | null {
  return markup.match(/<input[^>]*aria-label="Duración"[^>]*>/)?.[0] ?? null;
}

describe("ManualBar, el campo «Duración» (TT-18, ADR 0029)", () => {
  it("muestra el borrador de 90 minutos con el formato del workspace", () => {
    expect(durationField(render("compact"))).toContain('value="1:30"');
    expect(durationField(render("full"))).toContain('value="01:30:00"');
  });
});
