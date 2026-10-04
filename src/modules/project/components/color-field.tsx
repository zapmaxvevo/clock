"use client";

import { useId } from "react";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { isPaletteKey, PALETTE, type PaletteKey } from "@/modules/project/palette";

import { projectLabels } from "./labels";

type ColorFieldProps = {
  /** `null` mientras no se eligió ninguno: el servidor asigna uno (PR-15). */
  readonly value: PaletteKey | null;
  readonly onValueChange: (value: PaletteKey) => void;
};

/**
 * P-30: los doce colores de la paleta, cada uno con su nombre accesible. El
 * elegido lleva una marca en el centro y un anillo, así el estado no depende
 * solo del color.
 */
export function ColorField({ value, onValueChange }: ColorFieldProps) {
  const labelId = useId();
  const hintId = useId();

  return (
    <div className="grid gap-2">
      <span id={labelId} className="text-sm leading-none font-medium">
        {projectLabels.color}
      </span>
      <RadioGroup
        aria-labelledby={labelId}
        aria-describedby={hintId}
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string" && isPaletteKey(next)) {
            onValueChange(next);
          }
        }}
        className="flex flex-wrap gap-2"
      >
        {PALETTE.map((color) => (
          <RadioGroupItem
            key={color.key}
            value={color.key}
            aria-label={color.label}
            title={color.label}
            style={{ backgroundColor: color.value }}
            className="size-6 border-transparent after:-inset-0.5 data-checked:ring-2 data-checked:ring-foreground data-checked:ring-offset-2 data-checked:ring-offset-popover"
          />
        ))}
      </RadioGroup>
      <p id={hintId} className="text-muted-foreground text-xs">
        {projectLabels.colorHint}
      </p>
    </div>
  );
}
