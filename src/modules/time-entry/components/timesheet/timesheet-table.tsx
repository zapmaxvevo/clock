"use client";

import type { Ref } from "react";

import { cn } from "@/lib/utils";
import type { ProjectSelection } from "@/modules/project/schema";
import type { TimesheetDayView } from "@/modules/time-entry/schema";

import { trackerLabels } from "../labels";
import { timesheetLabels } from "./labels";
import type { GridRow, GridTotal, TimesheetGrid } from "./timesheet-model";
import { TimesheetRow } from "./timesheet-row";

/** El `h1` de la pantalla, que nombra la tabla (TS-100). */
export const TIMESHEET_HEADING_ID = "planilla-titulo";

type TimesheetTableProps = {
  readonly grid: TimesheetGrid;
  readonly days: readonly TimesheetDayView[];
  readonly canTrack: boolean;
  readonly busy: ReadonlySet<string>;
  readonly tableRef: Ref<HTMLTableElement>;
  readonly pickerRef: Ref<HTMLButtonElement>;
  readonly onWrite: (row: GridRow, date: string, minutes: number) => void;
  readonly onSubmit: (row: GridRow, date: string) => void;
  readonly onChoose: (selection: ProjectSelection) => void;
  readonly onRemove: (row: GridRow, button: HTMLButtonElement) => void;
};

/**
 * La grilla (§5.4): encabezados de columna y de fila con `scope`, así cada
 * total se nombra por los suyos (D13-12), y el pie con los totales del día y
 * de la semana.
 */
export function TimesheetTable({
  grid,
  days,
  canTrack,
  busy,
  tableRef,
  pickerRef,
  onWrite,
  onSubmit,
  onChoose,
  onRemove,
}: TimesheetTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table
        ref={tableRef}
        aria-labelledby={TIMESHEET_HEADING_ID}
        className="w-full text-sm"
      >
        <thead className="border-b">
          <tr>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              {timesheetLabels.projectsColumn}
            </th>
            {days.map((day) => (
              <th
                key={day.date}
                scope="col"
                aria-current={day.isToday ? "date" : undefined}
                className={cn(
                  "px-1 py-2 text-center font-normal whitespace-nowrap",
                  day.isWeekend && "bg-muted/40",
                  // Hoy no se marca solo con color: va en negrita y subrayado.
                  day.isToday &&
                    "text-primary font-semibold underline decoration-2 underline-offset-4",
                )}
              >
                {day.label}
              </th>
            ))}
            <th scope="col" className="px-2 py-2 text-center font-medium">
              {trackerLabels.weekTotal}
            </th>
            <th scope="col" className="w-10 px-1 py-2">
              <span className="sr-only">{timesheetLabels.actionsColumn}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.length === 0 ? (
            <tr className="border-b">
              <td
                colSpan={days.length + 3}
                className="text-muted-foreground px-2 py-6 text-center"
              >
                {timesheetLabels.empty}
              </td>
            </tr>
          ) : (
            grid.rows.map((row) => (
              <TimesheetRow
                key={row.key}
                row={row}
                days={days}
                canTrack={canTrack}
                busy={busy}
                excluded={grid.excluded}
                onWrite={onWrite}
                onSubmit={onSubmit}
                onChoose={onChoose}
                onRemove={onRemove}
                pickerRef={pickerRef}
              />
            ))
          )}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" className="px-2 py-2 text-left font-medium">
              {trackerLabels.weekTotal}
            </th>
            {grid.dayTotals.map((total, index) => (
              <TotalCell
                key={days[index].date}
                total={total}
                weekend={days[index].isWeekend}
              />
            ))}
            <TotalCell total={grid.weekTotal} weekend={false} />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** TS-45: un total en cero va en gris. */
function TotalCell({
  total,
  weekend,
}: {
  readonly total: GridTotal;
  readonly weekend: boolean;
}) {
  return (
    <td
      className={cn(
        "px-1 py-2 text-center font-medium tabular-nums",
        weekend && "bg-muted/40",
        total.zero && "text-muted-foreground font-normal",
      )}
    >
      {total.label}
    </td>
  );
}
