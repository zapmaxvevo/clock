"use client";

import { CircleDollarSignIcon, DollarSignIcon } from "lucide-react";

import { Toggle } from "@/components/ui/toggle";

import { trackerLabels } from "./labels";

type BillableToggleProps = {
  readonly pressed: boolean;
  readonly onPressedChange: (pressed: boolean) => void;
  /** El nombre accesible, armado por quien lo usa: «Facturable» o el de la fila. */
  readonly label: string;
  /** El nombre también a la vista, al lado del ícono, como en el diálogo. */
  readonly showLabel?: boolean;
  /** Con el cambio en vuelo no alterna, y el foco se queda en él. */
  readonly pending?: boolean;
  /** TT-92: el ícono solo si es facturable, sin control. */
  readonly readOnly?: boolean;
};

/**
 * TT-14 y TT-15: el facturable de una entrada, un botón de alternancia con
 * `aria-pressed`. A la vista, marcado cambia de ícono además de color. No
 * guarda el valor: lo recibe y avisa el cambio.
 */
export function BillableToggle({
  pressed,
  onPressedChange,
  label,
  showLabel = false,
  pending = false,
  readOnly = false,
}: BillableToggleProps) {
  const Icon = pressed ? CircleDollarSignIcon : DollarSignIcon;

  if (readOnly) {
    return pressed ? (
      <span role="img" aria-label={trackerLabels.billable} className="text-primary">
        <Icon aria-hidden="true" className="size-4" />
      </span>
    ) : null;
  }

  return (
    <Toggle
      // Con el nombre a la vista es un campo de formulario: lleva su borde.
      variant={showLabel ? "outline" : "default"}
      size="sm"
      pressed={pressed}
      onPressedChange={(next) => {
        if (!pending) {
          onPressedChange(next);
        }
      }}
      aria-label={label}
      // Inactivo con `aria-disabled` y no con `disabled`: el foco se queda en
      // el botón mientras el cambio viaja.
      aria-disabled={pending || undefined}
      className="text-muted-foreground aria-pressed:text-primary aria-disabled:opacity-60 aria-disabled:hover:bg-transparent aria-pressed:aria-disabled:hover:bg-muted"
    >
      <Icon aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </Toggle>
  );
}
