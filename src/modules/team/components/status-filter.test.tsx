import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { TEAM_FILTERS } from "@/modules/team/schema";

import { statusFilterItems, StatusFilter } from "./status-filter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

describe("StatusFilter", () => {
  it("la etiqueta visible «Estado» rotula el selector", () => {
    const markup = renderToStaticMarkup(<StatusFilter filter="activas" />);
    const controlId = /<label[^>]*for="([^"]+)"[^>]*>Estado<\/label>/.exec(markup)?.[1];

    expect(controlId).toBeDefined();
    expect(markup).toMatch(
      new RegExp(`<button[^>]*id="${controlId ?? ""}"[^>]*role="combobox"`),
    );
  });

  it.each([
    ["activas", "Activas"],
    ["inactivas", "Inactivas"],
    ["invitadas", "Invitadas"],
    ["todas", "Todas"],
  ] as const)("con «%s», el disparador dice «%s»", (filter, label) => {
    const markup = renderToStaticMarkup(<StatusFilter filter={filter} />);

    expect(markup).toContain(
      `<span data-slot="select-value" class="flex flex-1 text-left">${label}</span>`,
    );
  });

  it("las cuatro opciones, en el orden de §5.2", () => {
    expect(statusFilterItems).toEqual([
      { value: "activas", label: "Activas" },
      { value: "inactivas", label: "Inactivas" },
      { value: "invitadas", label: "Invitadas" },
      { value: "todas", label: "Todas" },
    ]);
    expect(statusFilterItems.map((item) => item.value)).toEqual([...TEAM_FILTERS]);
  });
});
