"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TimeFormat } from "@/server/time";

/** Cuánto dura la marca del valor que no se pudo interpretar (TT-21). */
const REJECTED_FLASH_MS = 1_200;

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
  /**
   * El formato de la hora que muestra; sin él, el campo es de duración. Con
   * 12 h el teclado de un teléfono tiene que dejar escribir `am` y `pm`
   * (PF-14), y el campo, mostrar «12:00 AM» entero; con 24 h y en la
   * duración bastan el numérico y el ancho de «23:59».
   */
  readonly format?: TimeFormat;
  /** Lo que se ve con el campo vacío, donde vacío quiere decir algo. */
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /**
   * El valor viaja: el campo no acepta texto y se atenúa, pero conserva el
   * foco, que `disabled` mandaría a `body` (TT-55).
   */
  readonly busy?: boolean;
  /** Esc: el texto vuelve al valor mostrado y se avisa. Sin él, Esc no hace nada. */
  readonly onCancel?: () => void;
  /**
   * Enter, después de normalizar: corre si el valor se aceptó o si el campo no
   * tenía cambios, y no si se rechazó. La noción de grupo es de quien lo usa.
   */
  readonly onSubmit?: () => void;
  /**
   * Cada cambio del texto: lo tecleado, el rótulo que deja confirmar y el
   * valor al que vuelve con un rechazo o con Esc. No avisa cuando el valor de
   * afuera reemplaza al texto: quien lo cambió ya lo sabe.
   */
  readonly onTextChange?: (text: string) => void;
};

/**
 * Campo de texto tolerante de hora o duración: el de la barra manual, el del
 * editor de horario de una fila, el del inicio del timer y los del diálogo de
 * edición masiva. Normaliza al salir del campo y con Enter, nunca mientras se
 * teclea, y no llama a ninguna action. Cuando el texto no se puede interpretar
 * el campo vuelve al valor anterior —que es la información— y además se marca
 * por un instante (TT-21).
 */
export function ClockField({
  value,
  onCommit,
  label,
  format,
  placeholder,
  disabled = false,
  busy = false,
  onCancel,
  onSubmit,
  onTextChange,
}: ClockFieldProps) {
  const [text, setText] = useState(value);
  const [shownValue, setShownValue] = useState(value);
  const [rejected, setRejected] = useState(false);
  const [focused, setFocused] = useState(false);
  const flash = useRef<number | null>(null);

  function changeText(next: string): void {
    setText(next);
    onTextChange?.(next);
  }

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
    changeText(value);
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
    changeText(accepted);
    return true;
  }

  return (
    <Input
      type="text"
      inputMode={format === "12h" ? "text" : "numeric"}
      value={text}
      placeholder={placeholder}
      aria-label={label}
      aria-invalid={rejected}
      disabled={disabled}
      readOnly={busy}
      aria-busy={busy || undefined}
      className={cn(
        "text-center tabular-nums aria-busy:opacity-60",
        format === "12h" ? "w-26" : "w-20",
      )}
      onChange={(event) => changeText(event.target.value)}
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
          changeText(value);
          onCancel();
        }
      }}
    />
  );
}
