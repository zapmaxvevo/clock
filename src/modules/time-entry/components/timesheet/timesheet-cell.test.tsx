import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TimeEntryView } from "@/modules/time-entry/schema";

import { TimesheetCell } from "./timesheet-cell";
import { cellCommit, type GridCell } from "./timesheet-model";

const design: TimeEntryView = {
  id: "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3",
  description: "Diseño",
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
  project: {
    id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
    name: "Rediseño",
    color: "teal",
  },
  task: { id: "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", name: "Maquetado" },
  billable: false,
  tags: [],
};

const cell: GridCell = {
  key: "2026-09-30|0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d|-",
  date: "2026-09-30",
  minutes: 90,
  label: "1:30",
  seconds: 5_400,
  writable: true,
  name: "Rediseño: Maquetado, miércoles 30/09",
  entries: [],
  pending: false,
};

function render(
  overrides: Partial<GridCell> = {},
  busy = false,
  canTrack = true,
): string {
  return renderToStaticMarkup(
    <table>
      <tbody>
        <tr>
          <TimesheetCell
            cell={{ ...cell, ...overrides }}
            busy={busy}
            canTrack={canTrack}
            weekend={false}
            onWrite={() => undefined}
            onSubmit={() => undefined}
            onMenu={() => undefined}
          />
        </tr>
      </tbody>
    </table>,
  );
}

describe("cellCommit (§5.5)", () => {
  it("rechaza lo que no se interpreta, el cero y el vacío, sin mandar nada (TS-27, TS-35)", () => {
    expect(cellCommit("abc", 90)).toEqual({ kind: "rejected" });
    expect(cellCommit("0", 90)).toEqual({ kind: "rejected" });
    expect(cellCommit("0:00", null)).toEqual({ kind: "rejected" });
    expect(cellCommit("", 90)).toEqual({ kind: "rejected" });
    expect(cellCommit("24:00", null)).toEqual({ kind: "rejected" });
  });

  it("lo que la celda ya muestra no se manda, escrito de cualquier forma (TS-36)", () => {
    expect(cellCommit("1:30", 90)).toEqual({ kind: "unchanged", label: "1:30" });
    expect(cellCommit("90", 90)).toEqual({ kind: "unchanged", label: "1:30" });
    expect(cellCommit("1.5", 90)).toEqual({ kind: "unchanged", label: "1:30" });
  });

  it("otro valor se manda en minutos y la celda muestra su rótulo; 1 es un minuto", () => {
    expect(cellCommit("2", 90)).toEqual({ kind: "write", minutes: 2, label: "0:02" });
    expect(cellCommit("1:00", null)).toEqual({
      kind: "write",
      minutes: 60,
      label: "1:00",
    });
    expect(cellCommit("1", 0)).toEqual({ kind: "write", minutes: 1, label: "0:01" });
  });

  it("una celda en `0:00` (TS-118) se puede llevar a otro valor", () => {
    expect(cellCommit("0:30", 0)).toEqual({ kind: "write", minutes: 30, label: "0:30" });
  });
});

describe("TimesheetCell", () => {
  it("la celda que se escribe es un campo nombrado por su fila y su día (TS-100)", () => {
    const markup = render();

    expect(markup).toContain('aria-label="Rediseño: Maquetado, miércoles 30/09"');
    expect(markup).toContain('value="1:30"');
    expect(markup).toContain('inputMode="numeric"');
    expect(markup).not.toContain("readOnly");
    expect(markup).not.toContain('aria-busy="');
  });

  it("vacía, el campo no muestra nada", () => {
    expect(render({ minutes: null, label: "" })).toContain('value=""');
  });

  it("en vuelo o en cola no acepta texto y lo dice, sin `disabled`, que perdería el foco", () => {
    const markup = render({}, true);

    expect(markup).toContain('readOnly=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toMatch(/\sdisabled(=""|\s|>)/);
  });

  it("la que no se escribe es texto, sin campo que reciba el foco", () => {
    const markup = render({ writable: false });

    expect(markup).not.toContain("<input");
    expect(markup).toContain(">1:30<");
    expect(markup).not.toContain("tabindex");
  });
});

describe("TimesheetCell, el menú de la celda (13b, TS-40, TS-99)", () => {
  const menuName =
    'aria-label="Acciones de la celda Rediseño: Maquetado, miércoles 30/09"';

  function trigger(markup: string): string {
    return (
      markup.match(/<button[^>]*aria-label="Acciones de la celda[^"]*"[^>]*>/)?.[0] ?? ""
    );
  }

  it("con entradas y permiso, el disparador va después del campo, nombrado por la celda", () => {
    const markup = render({ entries: [design] });

    expect(trigger(markup)).toContain(menuName);
    expect(markup.indexOf("<input")).toBeGreaterThan(-1);
    expect(markup.indexOf("<input")).toBeLessThan(markup.indexOf(menuName));
    expect(trigger(markup)).not.toContain('aria-disabled="');
  });

  it("también en una celda que no se escribe, si tiene entradas", () => {
    expect(trigger(render({ entries: [design], writable: false }))).toContain(menuName);
  });

  it("sin entradas en la foto no hay menú, aunque la celda muestre horas", () => {
    expect(render()).not.toContain("Acciones de la celda");
  });

  it("sin permiso de carga no hay menú (TS-76, D13b-4)", () => {
    expect(render({ entries: [design] }, false, false)).not.toContain(
      "Acciones de la celda",
    );
  });

  it("con algo que la foto no trae, inactivo con `aria-disabled` y sin `disabled`, que perdería el foco (D13b-5)", () => {
    const button = trigger(render({ entries: [design], pending: true }));

    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled(=""|\s|>)/);
  });
});
