"use client";

import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { ReportGroup } from "@/modules/report/schema";

import { durationLabel, GroupHeading } from "./group-heading";
import { visibleRows, type VisibleRow } from "./report-tree-model";

/** La sangría de cada nivel: la única marca visual del nivel (D-R3-9). */
const LEVEL_INDENT: Record<number, string> = { 1: "", 2: "pl-6", 3: "pl-12" };

/**
 * RP-13, D-R3-9: las filas del cuerpo. Arranca todo contraído y expande y
 * contrae sin volver al servidor; las filas contraídas no se dibujan. Recibe
 * solo los grupos, no el estado entero (§5.4), y quien la monta le pone como
 * `key` el `href` del pedido, así cada navegación vuelve a empezar contraída.
 */
export function ReportTree({ groups }: { readonly groups: readonly ReportGroup[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(key: string): void {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });
  }

  return <ReportTreeRows rows={visibleRows(groups, open)} onToggle={toggle} />;
}

/** Las filas que se ven, sin el estado de lo abierto. */
export function ReportTreeRows({
  rows,
  onToggle,
}: {
  readonly rows: readonly VisibleRow[];
  readonly onToggle: (key: string) => void;
}) {
  // Con más de un nivel, los grupos del primero siempre se ven y se pueden
  // abrir; entonces las hojas dejan el lugar del chevrón para alinear.
  const nested = rows.some((row) => row.expandable);
  return rows.map((row) => (
    <tr key={row.key} className="border-b last:border-b-0">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <RowHeading row={row} nested={nested} onToggle={() => onToggle(row.key)} />
      </th>
      <td className="px-3 py-2 text-right tabular-nums">
        {durationLabel(row.group.seconds)}
      </td>
    </tr>
  ));
}

/**
 * Un grupo con hijos es un botón con el chevrón y el encabezado, que le da el
 * nombre; sin `aria-controls`, porque las filas contraídas no existen.
 */
function RowHeading({
  row,
  nested,
  onToggle,
}: {
  readonly row: VisibleRow;
  readonly nested: boolean;
  readonly onToggle: () => void;
}) {
  if (!nested) {
    return <GroupHeading group={row.group} />;
  }
  const indent = LEVEL_INDENT[row.level];
  if (!row.expandable) {
    return (
      <span className={cn("flex min-w-0 items-center gap-1", indent)}>
        <span aria-hidden="true" className="size-4 shrink-0" />
        <GroupHeading group={row.group} />
      </span>
    );
  }
  return (
    <span className={cn("flex min-w-0", indent)}>
      <button
        type="button"
        aria-expanded={row.expanded}
        onClick={onToggle}
        className="focus-visible:ring-ring hover:bg-muted -mx-1 flex min-w-0 items-center gap-1 rounded-md px-1 text-left focus-visible:ring-3 focus-visible:outline-none"
      >
        <ChevronRightIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 transition-transform",
            row.expanded && "rotate-90",
          )}
        />
        <GroupHeading group={row.group} />
      </button>
    </span>
  );
}
