import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DisplayFormatsProvider } from "@/components/layout/display-formats";
import type { DurationFormat, TimeFormat } from "@/server/time";

import { ClockField } from "./clock-field";

function classesOf(duration: DurationFormat, format?: TimeFormat): string[] {
  const html = renderToStaticMarkup(
    <DisplayFormatsProvider formats={{ time: "24h", date: "dd/MM/yyyy", duration }}>
      <ClockField
        value={duration === "full" ? "02:13:27" : "2:13"}
        label="Duración"
        format={format}
        onCommit={(text) => text}
      />
    </DisplayFormatsProvider>,
  );
  const match = /class="([^"]*)"/.exec(html);
  return match?.[1]?.split(" ") ?? [];
}

describe("ClockField", () => {
  it("con la duración completa mide el ancho de «23:59:59»", () => {
    const classes = classesOf("full");

    expect(classes).toContain("w-24");
    expect(classes).not.toContain("w-20");
  });

  it("con la duración compacta mide el ancho de «23:59», como antes", () => {
    const classes = classesOf("compact");

    expect(classes).toContain("w-20");
    expect(classes).not.toContain("w-24");
  });

  it("con una hora no mira el formato de duración", () => {
    expect(classesOf("full", "24h")).toContain("w-20");
    expect(classesOf("full", "12h")).toContain("w-26");
  });
});
