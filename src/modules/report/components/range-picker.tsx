"use client";

import { CalendarIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { es } from "react-day-picker/locale";

import { civilDate } from "@/components/civil-date";
import { Button, buttonVariants } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  sameRange,
  type ReportFilters,
  type ReportGrouping,
  type ReportRange,
  type ReportShortcut,
} from "@/modules/report/schema";

import { reportLabels } from "./labels";
import { applySelection, selectionOf } from "./range-picker-model";
import { reportHref } from "./report-href";

type RangePickerProps = {
  readonly range: ReportRange;
  /** «Esta semana», «Semana anterior» o el rango: lo que dice el botón. */
  readonly rangeLabel: string;
  /** Día de hoy en la zona de quien mira: la marca del calendario. */
  readonly todayKey: string;
  /** La agrupación y los subniveles que conservan «Aplicar» y los atajos. */
  readonly grouping: ReportGrouping;
  /** Los filtros que conservan «Aplicar» y los atajos (D-R4-10). */
  readonly filters: ReportFilters;
  /** Los atajos de hoy, en el orden de la lista (D-R2b-2). */
  readonly shortcuts: readonly ReportShortcut[];
};

/**
 * RP-20 y D-R2a-4: el período, que abre los atajos y un calendario de rango con
 * «Aplicar». Cada vez que abre, parte del período que se ve. Un atajo y Esc
 * cierran y, al cerrar, el foco vuelve al botón.
 */
export function RangePicker({
  range,
  rangeLabel,
  todayKey,
  grouping,
  filters,
  shortcuts,
}: RangePickerProps) {
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
    const effect = applySelection(selection, grouping, filters);
    setOpen(effect.open);
    setError(effect.error);
    if (effect.href !== null) {
      router.push(effect.href);
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
      <PopoverContent
        // En pantallas angostas el selector no entra entero: se ajusta al lugar
        // libre y se desplaza, así «Aplicar» queda alcanzable.
        className="max-h-(--available-height) w-auto max-w-(--available-width) overflow-y-auto p-0"
        align="start"
      >
        <RangePanel
          selection={selection}
          month={civilDate(range.first)}
          todayKey={todayKey}
          error={error}
          shortcuts={shortcuts}
          range={range}
          grouping={grouping}
          filters={filters}
          onSelect={handleSelect}
          onApply={handleApply}
          // El rango del atajo ya es válido: navega sin pasar por «Aplicar».
          onShortcut={() => setOpen(false)}
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
  readonly shortcuts: readonly ReportShortcut[];
  /** El período que se ve: su atajo lleva `aria-current`. */
  readonly range: ReportRange;
  /** La agrupación y los subniveles que conservan los enlaces de los atajos. */
  readonly grouping: ReportGrouping;
  /** Los filtros que conservan los enlaces de los atajos (D-R4-10). */
  readonly filters: ReportFilters;
  readonly onSelect: (selection: DateRange | undefined) => void;
  readonly onApply: () => void;
  /** Al elegir un atajo, antes de navegar. */
  readonly onShortcut: () => void;
};

/**
 * Lo que hay dentro del selector: los atajos y el calendario. Con
 * `resetOnSelect`, sobre un rango completo el primer clic arranca uno nuevo sin
 * fin y el segundo lo cierra; sin él, cada clic extendería o recortaría el
 * rango que ya estaba.
 */
export function RangePanel({
  selection,
  month,
  todayKey,
  error,
  shortcuts,
  range,
  grouping,
  filters,
  onSelect,
  onApply,
  onShortcut,
}: RangePanelProps) {
  const empty = selection?.from === undefined;

  return (
    // Los atajos van antes del calendario en el orden del documento: arriba en
    // pantallas angostas y a la izquierda en las anchas. El foco inicial sigue
    // en el calendario y los atajos se alcanzan con Mayús+Tab.
    <div className="flex flex-col sm:flex-row">
      {shortcuts.length > 0 && (
        <ul
          aria-label={reportLabels.shortcuts}
          className="flex flex-wrap gap-0.5 border-b p-2 sm:flex-col sm:flex-nowrap sm:border-r sm:border-b-0"
        >
          {shortcuts.map((shortcut) => {
            // De presentación, como `isCurrentWeek` de la barra.
            const current = sameRange(shortcut.range, range);
            return (
              <li key={shortcut.id}>
                <Link
                  href={reportHref({ range: shortcut.range, ...grouping, filters })}
                  aria-current={current ? "true" : undefined}
                  // Solo en la navegación de la app: con Ctrl o Cmd abre otra
                  // pestaña y el selector sigue abierto.
                  onNavigate={onShortcut}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "justify-start sm:w-full",
                    current ? "bg-secondary font-semibold" : "font-normal",
                  )}
                >
                  {shortcut.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
            // deja todo como está.
            aria-disabled={empty || undefined}
            className="self-end"
            onClick={onApply}
          >
            {reportLabels.apply}
          </Button>
        </div>
      </div>
    </div>
  );
}
