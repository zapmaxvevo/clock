import { createElement, type MouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { DateRange } from "react-day-picker";
import { describe, expect, it, vi } from "vitest";

import type * as CalendarModule from "@/components/ui/calendar";
import { reportMessages } from "@/modules/report/schema";

import { applySelection, selectionOf } from "./range-picker-model";
import { RangePanel } from "./range-picker";

/**
 * El clic sobre un día, con la lógica de selección de `react-day-picker` y los
 * props que el selector le pasa al calendario: la unidad corre sin DOM, así
 * que el `select` del calendario dibujado se llama desde el test.
 */
const calendar = vi.hoisted(() => ({
  select: (day: Date): DateRange | undefined => {
    throw new Error(
      `El calendario no se dibujó antes del clic en ${day.toDateString()}.`,
    );
  },
}));

vi.mock("@/components/ui/calendar", async (importOriginal) => {
  const original = await importOriginal<typeof CalendarModule>();
  const { useDayPicker } = await import("react-day-picker");
  // `select` solo reenvía el evento a `onSelect`, que el test no mira.
  const click = {} as MouseEvent;
  function SelectProbe() {
    const { select } = useDayPicker<{ mode: "range" }>();
    calendar.select = (day) => select?.(day, {}, click);
    return null;
  }
  return {
    ...original,
    Calendar: (props: Parameters<typeof original.Calendar>[0]) =>
      createElement(original.Calendar, { ...props, footer: createElement(SelectProbe) }),
  };
});

function day(key: string): Date {
  const [year, month, date] = key.split("-").map(Number);
  return new Date(year, month - 1, date);
}

function renderPanel(
  selection: DateRange | undefined,
  error: string | null = null,
): string {
  return renderToStaticMarkup(
    <RangePanel
      selection={selection}
      month={selection?.from}
      todayKey="2026-10-08"
      error={error}
      onSelect={() => undefined}
      onApply={() => undefined}
    />,
  );
}

/** La etiqueta de apertura de «Aplicar». */
function applyButton(markup: string): string {
  return /<button[^>]*>Aplicar<\/button>/.exec(markup)?.[0] ?? "";
}

/** Dibuja el selector con `selection` y hace clic en `key`: lo que queda elegido. */
function clickOn(selection: DateRange | undefined, key: string): DateRange | undefined {
  renderPanel(selection);
  return calendar.select(day(key));
}

const thisWeek = selectionOf({ first: "2026-10-05", last: "2026-10-11" });

describe("RangePicker", () => {
  it("un período de 367 días muestra el mensaje en la región de alerta y no navega (RP-34)", () => {
    const outcome = applySelection(
      { from: day("2025-10-01"), to: day("2026-10-02") },
      "person",
    );
    expect(outcome).toEqual({ kind: "invalid", message: reportMessages.rangeTooLong });

    const markup = renderPanel(thisWeek, reportMessages.rangeTooLong);
    expect(markup).toMatch(
      /<p role="alert"[^>]*>Elegí un período de hasta 366 días\.<\/p>/,
    );
  });

  it("366 días navegan", () => {
    expect(
      applySelection({ from: day("2025-10-02"), to: day("2026-10-02") }, "person"),
    ).toEqual({
      kind: "navigate",
      href: "/reportes?desde=2025-10-02&hasta=2026-10-02&agrupar=persona",
    });
  });

  it("sin mensaje, la región de alerta sigue montada y vacía", () => {
    expect(renderPanel(thisWeek)).toMatch(/<p role="alert"[^>]*><\/p>/);
  });

  it("con el rango actual elegido, un clic y «Aplicar» navegan con desde = hasta en ese día", () => {
    const selection = clickOn(thisWeek, "2026-09-30");
    expect(applySelection(selection, "project")).toEqual({
      kind: "navigate",
      href: "/reportes?desde=2026-09-30&hasta=2026-09-30&agrupar=proyecto",
    });
  });

  it("con el rango actual elegido, dos clics fuera de él arman el rango entre esos dos días", () => {
    const first = clickOn(thisWeek, "2026-10-20");
    const second = clickOn(first, "2026-10-25");
    expect(applySelection(second, "person")).toEqual({
      kind: "navigate",
      href: "/reportes?desde=2026-10-20&hasta=2026-10-25&agrupar=persona",
    });
  });

  it("con el segundo clic anterior al primero, los extremos se invierten", () => {
    const first = clickOn(thisWeek, "2026-10-25");
    const second = clickOn(first, "2026-10-20");
    expect(applySelection(second, "person")).toEqual({
      kind: "navigate",
      href: "/reportes?desde=2026-10-20&hasta=2026-10-25&agrupar=persona",
    });
  });

  it("con un período de un día, un clic en ese día deja «Aplicar» sin efecto", () => {
    const oneDay = selectionOf({ first: "2026-10-08", last: "2026-10-08" });
    const selection = clickOn(oneDay, "2026-10-08");
    expect(applySelection(selection, "person")).toEqual({ kind: "empty" });
    expect(applyButton(renderPanel(selection))).toContain('aria-disabled="true"');
  });

  it("con algo elegido, «Aplicar» no lleva aria-disabled", () => {
    expect(applyButton(renderPanel(thisWeek))).not.toContain('aria-disabled="');
  });

  it("el calendario marca hoy con el día de quien mira y nombra los meses en español", () => {
    const markup = renderPanel(thisWeek);
    expect(markup.match(/data-today="true"/g)).toHaveLength(1);
    expect(markup).toMatch(/data-day="2026-10-08"[^>]*data-today="true"/);
    expect(markup).toContain('aria-label="Mes anterior"');
    expect(markup).toContain('aria-label="Mes siguiente"');
    expect(markup).toContain("octubre 2026");
  });
});
