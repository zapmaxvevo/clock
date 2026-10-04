"use client";

import { Checkbox } from "@/components/ui/checkbox";

type SelectionCheckboxProps = {
  readonly checked: boolean;
  /** El estado mixto de la casilla del día: algunas de sus filas elegidas. */
  readonly indeterminate?: boolean;
  readonly label: string;
  /**
   * TT-55: una operación en masa viaja y la casilla no cambia. Con
   * `aria-disabled` y no `disabled`: la casilla no pierde el foco.
   */
  readonly locked: boolean;
  readonly onToggle: () => void;
};

/** TT-62: la casilla de una fila o de un día, siempre visible y no solo al pasar el puntero. */
export function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  locked,
  onToggle,
}: SelectionCheckboxProps) {
  return (
    <Checkbox
      checked={checked}
      indeterminate={indeterminate}
      onCheckedChange={() => {
        if (!locked) {
          onToggle();
        }
      }}
      aria-label={label}
      aria-disabled={locked}
      className="aria-disabled:cursor-default aria-disabled:opacity-60"
    />
  );
}
