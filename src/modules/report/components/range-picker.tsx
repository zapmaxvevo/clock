"use client";

import { CalendarIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";

import { civilDate } from "@/components/civil-date";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ReportGroupBy, ReportRange } from "@/modules/report/schema";

import { reportLabels } from "./labels";
import { applySelection, selectionOf } from "./range-picker-model";

type RangePickerProps = {
  readonly range: ReportRange;
  /** «Esta semana», «Semana anterior» o el rango: lo que dice el botón. */
  readonly rangeLabel: string;
  /** Día de hoy en la zona de quien mira: la marca del calendario. */
  readonly todayKey: string;
  readonly groupBy: ReportGroupBy;
};

/**
 * RP-20 y D-R2a-4: el período, que abre un calendario de rango con «Aplicar».
 * Cada vez que abre, parte del período que se ve. Esc cierra sin navegar y,
 * al cerrar, el foco vuelve al botón.
 */
export function RangePicker({ range, rangeLabel, todayKey, groupBy }: RangePickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<DateRange | undefined>(() =>
    selectionOf(range),
  );
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean): void {
    if (next) {
      setSelection(selectionOf(range));
      setError(null);
    }
    setOpen(next);
  }

  function handleSelect(next: DateRange | undefined): void {
    setSelection(next);
    setError(null);
  }

  function handleApply(): void {
    const outcome = applySelection(selection, groupBy);
    switch (outcome.kind) {
      case "empty":
        return;
      case "invalid":
        setError(outcome.message);
        return;
      case "navigate":
        setOpen(false);
        router.push(outcome.href);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" />}
        aria-label={reportLabels.pickRange(rangeLabel)}
      >
        <CalendarIcon aria-hidden="true" />
        {rangeLabel}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <RangePanel
          selection={selection}
          month={civilDate(range.first)}
          todayKey={todayKey}
          error={error}
          onSelect={handleSelect}
          onApply={handleApply}
        />
      </PopoverContent>
    </Popover>
  );
}

type RangePanelProps = {
  readonly selection: DateRange | undefined;
  /** El mes a la vista al abrir: el del inicio del período. */
  readonly month: Date | undefined;
  readonly todayKey: string;
  /** RP-34: el mensaje de la última vez que se apretó «Aplicar». */
  readonly error: string | null;
  readonly onSelect: (selection: DateRange | undefined) => void;
  readonly onApply: () => void;
};

/**
 * Lo que hay dentro del selector. Con `resetOnSelect`, sobre un rango completo
 * el primer clic arranca uno nuevo sin fin y el segundo lo cierra; sin él,
 * cada clic extendería o recortaría el rango que ya estaba.
 */
export function RangePanel({
  selection,
  month,
  todayKey,
  error,
  onSelect,
  onApply,
}: RangePanelProps) {
  const empty = selection?.from === undefined;

  return (
    <div className="flex flex-col">
      <Calendar
        mode="range"
        resetOnSelect
        locale={es}
        // «Hoy» es el de la zona de la persona, no el del navegador.
        today={civilDate(todayKey)}
        selected={selection}
        defaultMonth={month}
        labels={{
          labelPrevious: () => reportLabels.previousMonth,
          labelNext: () => reportLabels.nextMonth,
        }}
        onSelect={onSelect}
        autoFocus
      />
      <div className="flex flex-col gap-2 border-t p-2">
        {/* Siempre montada, así el lector anuncia el mensaje cuando aparece. */}
        <p role="alert" className="text-destructive text-sm empty:hidden">
          {error}
        </p>
        <Button
          type="button"
          size="sm"
          // Con `aria-disabled` y no con `disabled`: sigue en el orden del
          // tabulador y se anuncia como inactivo. Sin selección, `applySelection`
          // responde `empty` y no pasa nada.
          aria-disabled={empty || undefined}
          className="self-end"
          onClick={onApply}
        >
          {reportLabels.apply}
        </Button>
      </div>
    </div>
  );
}
