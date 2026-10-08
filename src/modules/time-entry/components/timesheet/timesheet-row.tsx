"use client";

import { XIcon } from "lucide-react";
import type { Ref } from "react";

import { Button } from "@/components/ui/button";
import type { ProjectPair } from "@/lib/project-pair";
import { cn } from "@/lib/utils";
import { ProjectPicker } from "@/modules/project/components/project-picker";
import { paletteColor } from "@/modules/project/palette";
import type { ProjectSelection } from "@/modules/project/schema";
import type { TimesheetDayView } from "@/modules/time-entry/schema";

import { removeRowLabel, timesheetLabels } from "./labels";
import { TimesheetCell } from "./timesheet-cell";
import type { GridRow } from "./timesheet-model";

type TimesheetRowProps = {
  readonly row: GridRow;
  readonly days: readonly TimesheetDayView[];
  readonly canTrack: boolean;
  readonly busy: ReadonlySet<string>;
  /** Los pares que ya son fila, para el selector de la fila nueva (TS-18). */
  readonly excluded: readonly ProjectPair[];
  readonly onWrite: (row: GridRow, date: string, minutes: number) => void;
  readonly onSubmit: (row: GridRow, date: string) => void;
  readonly onChoose: (selection: ProjectSelection) => void;
  readonly onRemove: (row: GridRow, button: HTMLButtonElement) => void;
  /** El disparador del selector de la fila nueva, adonde va el foco al agregarla. */
  readonly pickerRef: Ref<HTMLButtonElement>;
};

/** Una fila de la planilla (TS-13, TS-16, TS-20, TS-44, TS-52). */
export function TimesheetRow({
  row,
  days,
  canTrack,
  busy,
  excluded,
  onWrite,
  onSubmit,
  onChoose,
  onRemove,
  pickerRef,
}: TimesheetRowProps) {
  const rowBusy = row.cells.some((cell) => busy.has(cell.key));

  return (
    <tr className="border-b">
      <th scope="row" className="px-2 py-1 text-left font-normal">
        {row.pair === null ? (
          <ProjectPicker
            value={null}
            placeholder={timesheetLabels.selectProject}
            label={timesheetLabels.newRowProject}
            variant="row"
            excluded={excluded}
            onChange={onChoose}
            triggerRef={pickerRef}
          />
        ) : (
          <RowHeading row={row} />
        )}
      </th>
      {row.cells.map((cell, index) => (
        <TimesheetCell
          key={cell.key}
          cell={cell}
          busy={busy.has(cell.key)}
          weekend={days[index].isWeekend}
          onWrite={(minutes) => onWrite(row, cell.date, minutes)}
          onSubmit={() => onSubmit(row, cell.date)}
        />
      ))}
      <td
        className={cn(
          "px-2 py-1 text-center font-medium tabular-nums",
          row.total.zero && "text-muted-foreground",
        )}
      >
        {row.total.label}
      </td>
      <td className="px-1 py-1 text-center">
        {canTrack && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={
              row.pair === null ? timesheetLabels.removeNewRow : removeRowLabel(row.name)
            }
            // Con `disabled` la X que tenía el foco lo perdería.
            aria-disabled={rowBusy || undefined}
            onClick={(event) => {
              if (!rowBusy) {
                onRemove(row, event.currentTarget);
              }
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
        )}
      </td>
    </tr>
  );
}

/** El punto del color, «Proyecto» o «Proyecto: Tarea» y el cliente en gris. */
function RowHeading({ row }: { readonly row: GridRow }) {
  if (row.project === null) {
    return <span className="text-muted-foreground text-sm">{row.name}</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-sm">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: paletteColor(row.project.color).value }}
      />
      <span className="truncate">{row.name}</span>
      {row.client !== null && (
        <span className="text-muted-foreground truncate">{row.client.name}</span>
      )}
    </span>
  );
}
