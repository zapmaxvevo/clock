"use client";

import { useState, type Ref } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** El ancho de los disparadores de un ajuste, también el del buscador de la zona. */
export const choiceTriggerWidth = "w-full sm:w-80";

/** El valor con su ejemplo, si tiene, como lo nombran el disparador y la opción. */
function choiceText(name: string, example: string | undefined): string {
  return example === undefined ? name : `${name} (${example})`;
}

type ChoiceSelectProps<Value extends string> = {
  readonly id: string;
  readonly triggerRef: Ref<HTMLButtonElement>;
  readonly value: string;
  /** Sin `example`, ni el disparador ni la opción llevan paréntesis (el tema). */
  readonly options: readonly { readonly value: Value; readonly example?: string }[];
  readonly nameOf: (value: Value) => string;
  readonly canEdit: boolean;
  readonly onChange: (value: Value) => void;
};

/**
 * Una opción de una lista cerrada: un formato con su ejemplo, o el tema sin
 * él. Sin permiso queda montado con `aria-disabled` y no abre: `readOnly`
 * fija el valor y la apertura la corta `changeOpen`, porque la primitiva deja
 * abrir un `Select` de solo lectura. Lo usan las preferencias del perfil y el
 * formato de duración de la configuración (D-WS2b-6).
 */
export function ChoiceSelect<Value extends string>({
  id,
  triggerRef,
  value,
  options,
  nameOf,
  canEdit,
  onChange,
}: ChoiceSelectProps<Value>) {
  const [open, setOpen] = useState(false);
  const items = options.map((option) => ({
    value: option.value,
    label: choiceText(nameOf(option.value), option.example),
  }));

  function changeOpen(next: boolean): void {
    if (next && !canEdit) {
      return;
    }
    setOpen(next);
  }

  function choose(next: string | null): void {
    const option = options.find((candidate) => candidate.value === next);
    if (option === undefined || option.value === value || !canEdit) {
      return;
    }
    onChange(option.value);
  }

  return (
    <Select
      items={items}
      value={value}
      onValueChange={choose}
      readOnly={!canEdit}
      open={open}
      onOpenChange={changeOpen}
    >
      <SelectTrigger
        ref={triggerRef}
        id={id}
        aria-disabled={!canEdit || undefined}
        className={cn(
          choiceTriggerWidth,
          "aria-disabled:cursor-default aria-disabled:opacity-60",
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {nameOf(option.value)}
            {option.example !== undefined && (
              <>
                {" "}
                <span className="text-muted-foreground">({option.example})</span>
              </>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
