"use client";

import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayKeyLabel, parseDayKey, toDayKey } from "@/server/time";

type DateFieldProps = {
  /** Día canónico elegido, "2026-10-02". */
  readonly value: string;
  readonly onChange: (dayKey: string) => void;
  /** Día de hoy en la zona del workspace: el rótulo «Hoy» / «Ayer» y la marca del calendario. */
  readonly todayKey: string;
  /** Piso del workspace: antes de ese día no se pueden cargar horas. */
  readonly minDayKey: string;
  readonly disabled?: boolean;
};

/**
 * El calendario trabaja con fechas civiles, no con instantes: esta fecha es la
 * medianoche local del navegador y solo sirve para dibujar. Lo que sale del
 * componente es la clave del día, armada por `toDayKey` con los tres números
 * de la fecha elegida.
 */
function civilDate(dayKey: string): Date | undefined {
  const civil = parseDayKey(dayKey);
  return civil === null ? undefined : new Date(civil.year, civil.month - 1, civil.day);
}

/** TT-18: el selector de fecha de la barra manual, con su ícono de calendario. */
export function DateField({
  value,
  onChange,
  todayKey,
  minDayKey,
  disabled = false,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = civilDate(value);
  const floor = civilDate(minDayKey);
  const label = dayKeyLabel(value, todayKey);

  function handleSelect(next: Date | undefined): void {
    setOpen(false);
    if (next === undefined) {
      return;
    }
    const chosen = toDayKey({
      year: next.getFullYear(),
      month: next.getMonth() + 1,
      day: next.getDate(),
    });
    if (chosen !== value) {
      onChange(chosen);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" disabled={disabled} />}
        aria-label={`Fecha de la entrada: ${label}`}
      >
        <CalendarIcon aria-hidden="true" />
        {label}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          // TT-02: «hoy» es el del workspace, no el del navegador.
          today={civilDate(todayKey)}
          selected={selected}
          defaultMonth={selected}
          disabled={floor === undefined ? undefined : { before: floor }}
          labels={{
            labelPrevious: () => "Mes anterior",
            labelNext: () => "Mes siguiente",
          }}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
