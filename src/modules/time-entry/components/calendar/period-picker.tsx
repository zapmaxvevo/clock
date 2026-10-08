"use client";

import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { es } from "react-day-picker/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { civilDate, dayKeyOfCivilDate } from "../civil-date";
import { trackerLabels } from "../labels";
import { calendarLabels } from "./labels";

type PeriodPickerProps = {
  /** La URL del período que contiene el día elegido: el calendario o la planilla. */
  readonly hrefOf: (day: string) => string;
  readonly periodStart: string;
  /** «Esta semana», el rango o el día: lo que dice el botón (CAL-15). */
  readonly periodLabel: string;
  /** Día de hoy en la zona de la persona: la marca del calendario. */
  readonly todayKey: string;
};

/**
 * CAL-16 y TS-09: el rango del período, que abre un calendario de mes sin
 * cota. Elegir un día lleva a su período; la semana la normaliza el servidor.
 * Al cerrar, el foco vuelve al botón.
 */
export function PeriodPicker({
  hrefOf,
  periodStart,
  periodLabel,
  todayKey,
}: PeriodPickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  function handleSelect(next: Date | undefined): void {
    setOpen(false);
    if (next === undefined) {
      return;
    }
    router.push(hrefOf(dayKeyOfCivilDate(next)));
  }

  const selected = civilDate(periodStart);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" />}
        aria-label={calendarLabels.pickDate(periodLabel)}
      >
        <CalendarIcon aria-hidden="true" />
        {periodLabel}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={es}
          // «Hoy» es el de la zona de la persona, no el del navegador.
          today={civilDate(todayKey)}
          selected={selected}
          defaultMonth={selected}
          labels={{
            labelPrevious: () => trackerLabels.previousMonth,
            labelNext: () => trackerLabels.nextMonth,
          }}
          onSelect={handleSelect}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
