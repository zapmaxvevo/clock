"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

/** Cuánto dura la marca del valor que no se pudo interpretar (TT-21). */
const REJECTED_FLASH_MS = 1_200;

type ClockFieldProps = {
  /** Valor canónico que muestra el campo cuando no se está escribiendo. */
  readonly value: string;
  /**
   * Interpreta lo tecleado. Devuelve el valor canónico que quedó, o `null` si
   * no se pudo interpretar: ahí el campo vuelve al anterior.
   */
  readonly onCommit: (text: string) => string | null;
  readonly label: string;
  readonly disabled?: boolean;
};

/**
 * Campo de texto tolerante de la barra manual: el mismo para el inicio, el fin
 * y la duración. Normaliza al salir del campo y con Enter, nunca mientras se
 * teclea, y no llama a ninguna action. Cuando el texto no se puede interpretar
 * el campo vuelve al valor anterior —que es la información— y además se marca
 * por un instante (TT-21).
 */
export function ClockField({
  value,
  onCommit,
  label,
  disabled = false,
}: ClockFieldProps) {
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  const [rejected, setRejected] = useState(false);
  const flash = useRef<number | null>(null);

  // El valor canónico puede cambiar desde otro campo: mover el inicio cambia
  // la duración, y la duración mueve el fin (TT-18).
  if (shownValue !== value) {
    setShownValue(value);
    setText(value);
  }

  useEffect(() => {
    return () => {
      if (flash.current !== null) {
        window.clearTimeout(flash.current);
      }
    };
  }, []);

  function rejectText(): void {
    setText(value);
    setRejected(true);
    if (flash.current !== null) {
      window.clearTimeout(flash.current);
    }
    flash.current = window.setTimeout(() => {
      flash.current = null;
      setRejected(false);
    }, REJECTED_FLASH_MS);
  }

  function commit(): void {
    if (text === value) {
      return;
    }
    const accepted = onCommit(text);
    if (accepted === null) {
      rejectText();
      return;
    }
    setText(accepted);
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={text}
      aria-label={label}
      aria-invalid={rejected}
      disabled={disabled}
      className="w-20 text-center tabular-nums"
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
    />
  );
}
