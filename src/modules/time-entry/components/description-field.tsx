"use client";

import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DESCRIPTION_MAX } from "@/modules/time-entry/schema";

import { DESCRIPTION_PLACEHOLDER } from "./labels";

type DescriptionFieldProps = {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  /** Guarda el valor. Lo llaman el rebote, la salida del campo y Enter. */
  readonly onCommit: (value: string) => void;
  /** Con rebote guarda mientras se escribe (TT-04); sin él, solo al salir o con Enter (TT-55). */
  readonly debounceMs?: number;
  /** Esc descarta y devuelve el campo al valor anterior (TT-55). */
  readonly onCancel?: () => void;
  readonly label: string;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly autoFocus?: boolean;
  readonly className?: string;
};

export function DescriptionField({
  value,
  onValueChange,
  onCommit,
  debounceMs,
  onCancel,
  label,
  placeholder = DESCRIPTION_PLACEHOLDER,
  disabled = false,
  autoFocus = false,
  className,
}: DescriptionFieldProps) {
  const pendingCommit = useRef<number | null>(null);

  function cancelPendingCommit(): void {
    if (pendingCommit.current === null) {
      return;
    }
    window.clearTimeout(pendingCommit.current);
    pendingCommit.current = null;
  }

  useEffect(() => cancelPendingCommit, []);

  function handleChange(next: string): void {
    onValueChange(next);
    cancelPendingCommit();
    if (debounceMs === undefined) {
      return;
    }
    pendingCommit.current = window.setTimeout(() => {
      pendingCommit.current = null;
      onCommit(next);
    }, debounceMs);
  }

  return (
    <Input
      type="text"
      value={value}
      aria-label={label}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      // TT-05: el campo corta en el mismo largo que valida el esquema.
      maxLength={DESCRIPTION_MAX}
      className={cn("h-9", className)}
      onChange={(event) => handleChange(event.target.value)}
      onBlur={() => {
        cancelPendingCommit();
        onCommit(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          cancelPendingCommit();
          onCommit(value);
          return;
        }
        if (event.key === "Escape" && onCancel !== undefined) {
          event.preventDefault();
          cancelPendingCommit();
          onCancel();
        }
      }}
    />
  );
}
