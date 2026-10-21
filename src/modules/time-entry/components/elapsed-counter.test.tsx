import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import type { DurationFormat } from "@/server/time";

import { ElapsedCounter } from "./elapsed-counter";

const serverNow = "2026-10-02T15:00:00.000Z";

function render(startedAt: string | null, duration: DurationFormat): string {
  return renderToStaticMarkup(
    <DisplayFormatsProvider formats={{ time: "24h", date: "dd/MM/yyyy", duration }}>
      <ElapsedCounter startedAt={startedAt} serverNow={serverNow} />
    </DisplayFormatsProvider>,
  );
}

describe("ElapsedCounter (TT-17, PF-22, WS-66)", () => {
  it("es un transcurrido en h:mm:ss sin relleno en las horas, con los dos formatos de duración", () => {
    // 100 segundos antes del `serverNow`.
    const startedAt = "2026-10-02T14:58:20.000Z";

    expect(render(startedAt, "compact")).toContain(">0:01:40<");
    expect(render(startedAt, "full")).toContain(">0:01:40<");
  });

  it("con el timer parado dice 0:00:00", () => {
    expect(render(null, "full")).toContain(">0:00:00<");
  });
});
