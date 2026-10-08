"use client";

import { cn } from "@/lib/utils";

import { ClockField } from "../clock-field";
import { CellMenu, type CellMenuChoice } from "./cell-menu";
import { cellCommit, type GridCell } from "./timesheet-model";

type TimesheetCellProps = {
  readonly cell: GridCell;
  /**
   * Su escritura está en vuelo o en cola (§5.5), o un pedido del detalle no
   * está en la foto: el campo no acepta texto hasta que llegue (13b, §5.3).
   */
  readonly busy: boolean;
  /** Con permiso de carga, la celda con entradas tiene su menú (TS-40, D13b-4). */
  readonly canTrack: boolean;
  /** Fin de semana: fondo distinto, como su encabezado (TS-08). */
  readonly weekend: boolean;
  /** Los minutos que la celda tiene que mostrar; no se llama si ya los muestra. */
  readonly onWrite: (minutes: number) => void;
  /** Enter, aceptado o sin cambios: el foco baja (TS-98). */
  readonly onSubmit: () => void;
  readonly onMenu: (choice: CellMenuChoice, trigger: HTMLElement) => void;
};

/**
 * Una celda de la planilla (TS-24 … TS-28): la duración tolerante de
 * `ClockField`, o texto sin foco cuando no se escribe, y después su menú, en
 * el orden de tabulación (TS-99). No llama a ninguna action: avisa los
 * minutos con `onWrite` y la opción del menú con `onMenu`.
 */
export function TimesheetCell({
  cell,
  busy,
  canTrack,
  weekend,
  onWrite,
  onSubmit,
  onMenu,
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
      className={cn(
        "relative px-1 py-1 text-center tabular-nums",
        // El lugar del menú, en todas las celdas: los campos quedan alineados.
        canTrack && "pr-8",
        weekend && "bg-muted/40",
      )}
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
      {canTrack && cell.entries.length > 0 && <CellMenu cell={cell} onChoose={onMenu} />}
    </td>
  );
}
