"use client";

import { CalendarIcon } from "lucide-react";
import { useRef, useState, type ComponentProps } from "react";
import { es } from "react-day-picker/locale";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dayKeyLabel, parseDayKey, toDayKey } from "@/server/time";

type DateFieldProps = {
  /** Día canónico elegido, "2026-10-02", o `null` sin ninguno: se ve `placeholder`. */
  readonly value: string | null;
  /** Lo que se ve sin día elegido. */
  readonly placeholder?: string;
  /** El comienzo del nombre accesible, al que sigue el día que se ve. */
  readonly label?: string;
  readonly onChange: (dayKey: string) => void;
  /** Día de hoy en la zona de la persona: el rótulo «Hoy» / «Ayer» y la marca del calendario. */
  readonly todayKey: string;
  /** Piso del workspace: antes de ese día no se pueden cargar horas. */
  readonly minDayKey: string;
  /**
   * Último día que se puede elegir. La barra manual y la fila no lo pasan,
   * porque aceptan el futuro (P-10); el inicio del timer activo lo fija en hoy
   * (TT-29). Ninguna de las dos reglas es la omisión de la otra.
   */
  readonly maxDayKey?: string;
  /**
   * Avisa cuándo el calendario se abre y se cierra: se dibuja en un portal.
   * Al cerrar, `focusReturns` dice si el foco vuelve al disparador —se eligió
   * un día o se apretó Esc— o se quedó donde la persona lo llevó.
   */
  readonly onOpenChange?: (open: boolean, focusReturns: boolean) => void;
  /** Montarse con el calendario abierto, como lo pide el botón de fecha de la fila. */
  readonly defaultOpen?: boolean;
  readonly disabled?: boolean;
};

/** Por qué se abrió o se cerró el calendario: un clic afuera, Esc, el disparador… */
type OpenChangeDetails = Parameters<
  NonNullable<ComponentProps<typeof Popover>["onOpenChange"]>
>[1];

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

/** TT-18, TT-56: el selector de fecha, con su ícono de calendario. */
export function DateField({
  value,
  placeholder = "",
  label = "Fecha de la entrada",
  onChange,
  todayKey,
  minDayKey,
  maxDayKey,
  onOpenChange,
  defaultOpen = false,
  disabled = false,
}: DateFieldProps) {
  const [open, setOpen] = useState(defaultOpen);
  /**
   * Cerrado con un clic afuera, el foco se queda donde la persona lo puso y
   * no vuelve al disparador: si no, salir del editor de una fila con el
   * calendario abierto lo dejaría adentro.
   */
  const returnFocus = useRef(true);
  const { date } = useDisplayFormats();
  const shown = value === null ? placeholder : dayKeyLabel(value, todayKey, date);

  function changeOpen(next: boolean, details?: OpenChangeDetails): void {
    returnFocus.current =
      next || (details?.reason !== "outside-press" && details?.reason !== "focus-out");
    setOpen(next);
    onOpenChange?.(next, returnFocus.current);
  }

  function handleSelect(next: Date | undefined): void {
    changeOpen(false);
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

  const selected = value === null ? undefined : civilDate(value);
  const floor = civilDate(minDayKey);
  const ceiling = maxDayKey === undefined ? undefined : civilDate(maxDayKey);
  const outside = [
    ...(floor === undefined ? [] : [{ before: floor }]),
    ...(ceiling === undefined ? [] : [{ after: ceiling }]),
  ];

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" disabled={disabled} />}
        aria-label={`${label}: ${shown}`}
      >
        <CalendarIcon aria-hidden="true" />
        {shown}
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        align="start"
        finalFocus={() => returnFocus.current}
      >
        <Calendar
          mode="single"
          locale={es}
          // TT-02: «hoy» es el de la zona de la persona, no el del navegador.
          today={civilDate(todayKey)}
          selected={selected}
          defaultMonth={selected ?? civilDate(todayKey)}
          disabled={outside.length === 0 ? undefined : outside}
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
