"use client";

import { cn } from "@/lib/utils";

import { ClockField } from "../clock-field";
import { cellCommit, type GridCell } from "./timesheet-model";

type TimesheetCellProps = {
  readonly cell: GridCell;
  /** Su escritura está en vuelo o en cola (§5.5). */
  readonly busy: boolean;
  /** Fin de semana: fondo distinto, como su encabezado (TS-08). */
  readonly weekend: boolean;
  /** Los minutos que la celda tiene que mostrar; no se llama si ya los muestra. */
  readonly onWrite: (minutes: number) => void;
  /** Enter, aceptado o sin cambios: el foco baja (TS-98). */
  readonly onSubmit: () => void;
};

/**
 * Una celda de la planilla (TS-24 … TS-28): la duración tolerante de
 * `ClockField`, o texto sin foco cuando no se escribe. No llama a ninguna
 * action: avisa los minutos con `onWrite`.
 */
export function TimesheetCell({
  cell,
  busy,
  weekend,
  onWrite,
  onSubmit,
}: TimesheetCellProps) {
  function handleCommit(text: string): string | null {
    const result = cellCommit(text, cell.minutes);
    if (result.kind === "rejected") {
      return null;
    }
    if (result.kind === "write") {
      onWrite(result.minutes);
    }
    return result.label;
  }

  return (
    <td
      data-cell={cell.key}
      className={cn("px-1 py-1 text-center tabular-nums", weekend && "bg-muted/40")}
    >
      {cell.writable ? (
        <ClockField
          value={cell.label}
          label={cell.name}
          busy={busy}
          onCommit={handleCommit}
          onSubmit={onSubmit}
          // Esc: el campo vuelve al valor mostrado; no hay nada más que avisar.
          onCancel={() => undefined}
        />
      ) : (
        <span className="text-sm">{cell.label}</span>
      )}
    </td>
  );
}
