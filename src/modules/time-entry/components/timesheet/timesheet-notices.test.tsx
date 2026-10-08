import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { timeEntryMessages } from "@/modules/time-entry/schema";

import type { CellWriteFailure } from "./cell-writes";
import type { EntryChangeFailure } from "./entry-changes";
import type { RowRemovalFailure } from "./row-removals";
import {
  staleNoticesOf,
  TimesheetNotices,
  type ScreenFailures,
} from "./timesheet-notices";

const web = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const a = "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3";

const cell: CellWriteFailure = {
  request: {
    input: { date: "2026-09-29", projectId: web, taskId: null, minutes: 60 },
    name: "Web, martes 29/09",
  },
  code: "validation",
  message: "Editá las entradas de esta celda desde el detalle.",
};

const row: RowRemovalFailure = {
  request: { weekStart: "2026-09-28", projectId: web, taskId: null, ids: [a] },
  code: "unexpected",
  message: timeEntryMessages.unexpected,
};

const detail: EntryChangeFailure = {
  request: {
    kind: "delete",
    cell: `2026-09-29|${web}|-`,
    name: "«Diseño», de 09:00 a 10:30",
    input: { id: a },
  },
  code: "unexpected",
  message: timeEntryMessages.unexpected,
};

const none: ScreenFailures = { cell: null, row: null, detail: null };

describe("staleNoticesOf: un aviso a la vez entre celda, fila y detalle (§5.5)", () => {
  it("sin fallas, o sin ninguna nueva, no baja nada", () => {
    expect(staleNoticesOf(none, none)).toEqual([]);
    const shown = { ...none, cell, detail };
    expect(staleNoticesOf(shown, shown)).toEqual([]);
  });

  it("una falla de una celda baja la de la fila y la del detalle", () => {
    expect(staleNoticesOf({ ...none, row, detail }, { cell, row, detail })).toEqual([
      "row",
      "detail",
    ]);
  });

  it("una falla de una fila baja la de la celda y la del detalle", () => {
    expect(staleNoticesOf({ ...none, cell, detail }, { cell, row, detail })).toEqual([
      "cell",
      "detail",
    ]);
  });

  it("una falla del detalle baja la de la celda y la de la fila", () => {
    expect(staleNoticesOf({ ...none, cell, row }, { cell, row, detail })).toEqual([
      "cell",
      "row",
    ]);
  });

  it("la del detalle que pasa de la lista a la pantalla cuenta como recién llegada (§5.2)", () => {
    expect(staleNoticesOf({ ...none, cell }, { ...none, cell, detail })).toEqual([
      "cell",
    ]);
  });

  it("una falla que se va no baja a las otras", () => {
    expect(staleNoticesOf({ ...none, cell, row }, { ...none, row })).toEqual([]);
  });

  it("no baja lo que no está a la vista: la del detalle en el editor o la lista no cuenta", () => {
    expect(staleNoticesOf(none, { ...none, cell })).toEqual([]);
  });
});

describe("TimesheetNotices: la región de los avisos (§5.9)", () => {
  function render(failures: ScreenFailures): string {
    return renderToStaticMarkup(
      <TimesheetNotices
        failures={failures}
        onRetryCell={() => undefined}
        onRetryRow={() => undefined}
        onRetryDetail={() => undefined}
      />,
    );
  }

  function textOf(markup: string): string {
    return markup.replace(/<[^>]*>/g, "");
  }

  it("sin fallas está montada, vacía y sin rol", () => {
    expect(render(none)).toBe('<div class="flex flex-col gap-2 empty:hidden"></div>');
  });

  it("la del detalle nombra la operación y la entrada, con «Reintentar» solo con `unexpected`", () => {
    const text = textOf(render({ ...none, detail }));

    expect(text).toContain("No se pudo borrar la entrada.");
    expect(text).toContain("«Diseño», de 09:00 a 10:30");
    expect(text).toContain("Reintentar");
    expect(
      textOf(
        render({
          ...none,
          detail: { ...detail, code: "not_found", message: "Esa entrada ya no existe." },
        }),
      ),
    ).not.toContain("Reintentar");
  });

  it("la de una celda lleva su nombre y, sin `unexpected`, no ofrece «Reintentar»", () => {
    const text = textOf(render({ ...none, cell }));

    expect(text).toContain("No se pudo guardar la celda.");
    expect(text).toContain("Web, martes 29/09");
    expect(text).not.toContain("Reintentar");
  });
});
