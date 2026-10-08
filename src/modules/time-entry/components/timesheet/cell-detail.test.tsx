import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  timeEntryMessages,
  type TimeEntryView,
  type TimesheetState,
} from "@/modules/time-entry/schema";

import { CellDetailDialogs, useCellDetail } from "./cell-detail";
import type * as CellEntriesModule from "./cell-entries-dialog";
import { changingOf, sendingEntriesOf, type EntryChangesState } from "./entry-changes";
import { cellKeyOf } from "./cell-writes";
import type { GridCell } from "./timesheet-model";
import type { EntryChanges } from "./use-entry-changes";

// El portal de la lista no se dibuja con `renderToStaticMarkup`: su `Dialog`
// se reemplaza por lo de adentro, sin el portal y dentro de su raíz.
vi.mock("./cell-entries-dialog", async (importOriginal) => {
  const original = await importOriginal<typeof CellEntriesModule>();
  const { createElement } = await import("react");
  const { Dialog } = await import("@/components/ui/dialog");
  return {
    ...original,
    CellEntriesDialog: ({
      open,
      children,
      ...props
    }: Parameters<typeof original.CellEntriesDialog>[0]) =>
      createElement(
        Dialog,
        { open },
        createElement(original.CellEntriesContent, props),
        children,
      ),
  };
});

const project = {
  id: "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "P",
  color: "teal",
} as const;
const key = cellKeyOf({ date: "2026-10-01", projectId: project.id, taskId: null });
const a = "7a8b9c0d-1e2f-4a3b-9c4d-6e7f8091a2b3";
const b = "8b9c0d1e-2f3a-4b4c-8d5e-7f8091a2b3c4";

function entry(
  id: string,
  description: string,
  start: string,
  end: string,
): TimeEntryView {
  return {
    id,
    description,
    startedAt: "2026-10-01T13:00:00.000Z",
    endedAt: "2026-10-01T14:00:00.000Z",
    dayDate: "2026-10-01",
    weekStart: "2026-09-28",
    startLabel: start,
    endLabel: end,
    startClock: start,
    endClock: end,
    extraDays: 0,
    durationSeconds: 3_600,
    durationLabel: "1:00",
    editableTimes: true,
    project,
    task: null,
    billable: false,
    tags: [],
  };
}

const entries = [entry(a, "a", "10:00", "11:00"), entry(b, "b", "12:00", "13:00")];

const state: TimesheetState = {
  todayKey: "2026-10-01",
  canTrack: true,
  weekStart: "2026-09-28",
  weekLabel: "Esta semana",
  previousStart: "2026-09-21",
  nextStart: "2026-10-05",
  currentStart: "2026-09-28",
  days: [],
  rows: [],
  closedSeconds: 7_200,
  storageKey: "clock:planilla:w:u",
  serverNow: "2026-10-01T15:00:00.000Z",
  minDayKey: "2000-01-01",
  entries,
};

const cell: GridCell = {
  key,
  date: "2026-10-01",
  minutes: 120,
  label: "2:00",
  seconds: 7_200,
  writable: true,
  name: "P, miércoles 01/10",
  entries,
  pending: false,
};

const noop = () => undefined;

/** Lo que devuelve `useEntryChanges` con un estado dado. */
function changesWith(changesState: EntryChangesState): EntryChanges {
  return {
    state: changesState,
    changing: changingOf(changesState),
    sending: sendingEntriesOf(changesState),
    failure: changesState.failure,
    save: noop,
    remove: noop,
    retry: noop,
    dismiss: noop,
  };
}

/** `TimesheetView` con la lista de la celda abierta desde «Ver detalle». */
function OpenList({ changes }: { readonly changes: EntryChanges }) {
  const cellDetail = useCellDetail({
    state,
    changes,
    destinationOf: () => null,
    awaitCell: noop,
  });
  const [opening, setOpening] = useState(true);
  // El primer dibujo abre la lista como «Ver detalle», sin disparador: sin
  // DOM no hay botón del menú que pasarle.
  if (opening) {
    setOpening(false);
    cellDetail.open(cell, "detail", null);
  }
  return <CellDetailDialogs dialogs={cellDetail.dialogs} state={state} />;
}

function buttonNamed(markup: string, name: string): string {
  return markup.match(new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`))?.[0] ?? "";
}

describe("CellDetailDialogs: la lista recibe el estado de los pedidos (A15)", () => {
  it("una entrada asentada que la foto todavía no trae deja inactivos sus dos botones; la otra no", () => {
    const markup = renderToStaticMarkup(
      <OpenList
        changes={changesWith({
          pending: [{ id: 1, cell: key, entryId: b, status: "settled" }],
          failure: null,
        })}
      />,
    );

    expect(markup).toContain("Detalle de P, miércoles 01/10");
    expect(buttonNamed(markup, "Editar «a», de 10:00 a 11:00")).not.toBe("");
    expect(buttonNamed(markup, "Editar «b», de 12:00 a 13:00")).toContain(
      'aria-disabled="true"',
    );
    expect(buttonNamed(markup, "Borrar «b», de 12:00 a 13:00")).toContain(
      'aria-disabled="true"',
    );
    expect(buttonNamed(markup, "Editar «a», de 10:00 a 11:00")).not.toContain(
      'aria-disabled="',
    );
  });

  it("la falla de un pedido de la celda abierta se ve en la lista, no en la pantalla", () => {
    const markup = renderToStaticMarkup(
      <OpenList
        changes={changesWith({
          pending: [],
          failure: {
            request: {
              kind: "delete",
              cell: key,
              name: "«a», de 10:00 a 11:00",
              input: { id: a },
            },
            code: "unexpected",
            message: timeEntryMessages.unexpected,
          },
        })}
      />,
    );

    expect(markup.indexOf("No se pudo borrar la entrada.")).toBeGreaterThan(-1);
    expect(markup.indexOf("No se pudo borrar la entrada.")).toBeLessThan(
      markup.indexOf("<ul"),
    );
  });
});

describe("useCellDetail: cerrar el editor baja la falla que tenía a la vista (A4)", () => {
  const single: GridCell = { ...cell, minutes: 60, label: "1:00", entries: [entries[0]] };
  const saveFailed: EntryChangesState = {
    pending: [],
    failure: {
      request: {
        kind: "save",
        cell: key,
        name: "«a», de 10:00 a 11:00",
        input: { id: a, changes: { description: "a2" } },
      },
      code: "unexpected",
      message: timeEntryMessages.unexpected,
    },
  };

  /**
   * Abre el editor de la celda desde el menú, con la falla de un guardado de
   * esa entrada a la vista, y lo cierra como dice `close`. Anota cada paso y
   * cada `dismiss`.
   */
  function closeEditorWith(close: "cancel" | "delete"): string[] {
    const log: string[] = [];
    const changes = { ...changesWith(saveFailed), dismiss: () => log.push("dismiss") };

    function Editor() {
      const cellDetail = useCellDetail({
        state,
        changes,
        destinationOf: () => null,
        awaitCell: noop,
      });
      const [step, setStep] = useState(0);
      const { dialogs } = cellDetail;
      const editor = dialogs.detail?.editor ?? null;
      if (step === 0) {
        setStep(1);
        cellDetail.open(single, "edit", null);
      } else if (step === 1 && editor !== null) {
        setStep(2);
        log.push(dialogs.editorFailure === null ? "sin falla" : "falla a la vista");
        if (close === "cancel") {
          dialogs.cancelEditor();
        } else {
          dialogs.deleteFromEditor(editor);
        }
      }
      return null;
    }

    renderToStaticMarkup(<Editor />);
    return log.slice(log.indexOf("falla a la vista"));
  }

  it("cancelar la baja", () => {
    expect(closeEditorWith("cancel")).toEqual(["falla a la vista", "dismiss"]);
  });

  it("«Borrar» de su menú también: no pasa a la pantalla como recién llegada", () => {
    expect(closeEditorWith("delete")).toEqual(["falla a la vista", "dismiss"]);
  });
});
