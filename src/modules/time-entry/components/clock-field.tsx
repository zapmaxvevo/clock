"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import type { TimeFormat } from "@/server/time";

/** Cuánto dura la marca del valor que no se pudo interpretar (TT-21). */
const REJECTED_FLASH_MS = 1_200;

/**
 * El teclado de un campo de hora en un teléfono: con 12 h tiene que dejar
 * escribir `am` y `pm` (PF-14); con 24 h basta el numérico.
 */
export function clockInputMode(format: TimeFormat): ClockInputMode {
  return format === "12h" ? "text" : "numeric";
}

type ClockInputMode = "numeric" | "text";

type ClockFieldProps = {
  /**
   * Lo que muestra el campo cuando no se está escribiendo: el rótulo de la
   * hora en el formato de la persona, o la duración.
   */
  readonly value: string;
  /**
   * Interpreta lo tecleado. Devuelve el rótulo del valor que quedó, o `null`
   * si no se pudo interpretar: ahí el campo vuelve al anterior.
   */
  readonly onCommit: (text: string) => string | null;
  readonly label: string;
  /** La duración y las horas en 24 h usan el numérico; ver `clockInputMode`. */
  readonly inputMode?: ClockInputMode;
  readonly disabled?: boolean;
  /** Esc: el texto vuelve al valor mostrado y se avisa. Sin él, Esc no hace nada. */
  readonly onCancel?: () => void;
  /**
   * Enter, después de normalizar: corre si el valor se aceptó o si el campo no
   * tenía cambios, y no si se rechazó. La noción de grupo es de quien lo usa.
   */
  readonly onSubmit?: () => void;
};

/**
 * Campo de texto tolerante de hora o duración: el de la barra manual, el del
 * editor de horario de una fila y el del inicio del timer. Normaliza al salir
 * del campo y con Enter, nunca mientras se teclea, y no llama a ninguna action. Cuando el texto no se puede interpretar
 * el campo vuelve al valor anterior —que es la información— y además se marca
 * por un instante (TT-21).
 */
export function ClockField({
  value,
  onCommit,
  label,
  inputMode = "numeric",
  disabled = false,
  onCancel,
  onSubmit,
}: ClockFieldProps) {
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  const [rejected, setRejected] = useState(false);
  const [focused, setFocused] = useState(false);
  const flash = useRef<number | null>(null);

  // El valor mostrado puede cambiar desde afuera: mover el inicio cambia la
  // duración, la duración mueve el fin (TT-18), y un agregado exitoso reinicia
  // el borrador (TT-25). Lo que se está escribiendo y todavía no se confirmó
  // gana: al salir del campo o con Enter se confirma sobre el valor nuevo.
  if (shownValue !== value) {
    setShownValue(value);
    if (!focused || text === shownValue) {
      setText(value);
    }
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

  /** `false` si el texto se rechazó; sin cambios cuenta como aceptado. */
  function commit(): boolean {
    if (text === value) {
      return true;
    }
    const accepted = onCommit(text);
    if (accepted === null) {
      rejectText();
      return false;
    }
    setText(accepted);
    return true;
  }

  return (
    <Input
      type="text"
      inputMode={inputMode}
      value={text}
      aria-label={label}
      aria-invalid={rejected}
      disabled={disabled}
      className="w-20 text-center tabular-nums"
      onChange={(event) => setText(event.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          if (commit()) {
            onSubmit?.();
          }
          return;
        }
        if (event.key === "Escape" && onCancel !== undefined) {
          event.preventDefault();
          setText(value);
          onCancel();
        }
      }}
    />
  );
}
