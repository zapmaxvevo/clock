"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { UpdateRunningStartInput } from "@/modules/time-entry/schema";
import { parseClockInput } from "@/server/time";

import { ClockField } from "./clock-field";
import { DateField } from "./date-field";
import { trackerLabels } from "./labels";

type RunningStart = {
  readonly date: string;
  readonly start: string;
};

type RunningStartEditorProps = {
  /** La entrada que corre, con su día y su hora de inicio ya formateados. */
  readonly running: {
    readonly id: string;
    readonly dayDate: string;
    readonly startLabel: string;
  };
  /** Día de hoy en la zona del workspace: el techo del selector (TT-29). */
  readonly todayKey: string;
  /** Piso del workspace. */
  readonly minDayKey: string;
  /** Hay un arranque, una parada o un guardado del inicio en vuelo. */
  readonly disabled: boolean;
  readonly onSave: (input: UpdateRunningStartInput) => void;
};

/**
 * TT-28: el popover que corrige desde cuándo corre el timer. Su disparador es
 * un botón superpuesto al contador y hermano de él en el DOM: el clic sobre
 * el número cae en el botón, y el contador sigue siendo el `timer` que anuncia
 * el lector de pantalla, fuera del botón.
 *
 * Lleva el día además de la hora: un timer puede llevar días corriendo
 * (TT-42), y el selector no deja elegir uno posterior a hoy (TT-29). Son dos
 * campos sin derivación entre ellos, así que no usan el borrador del trío.
 * «Guardar» confirma y `Esc` descarta; si el par no cambió, no escribe.
 */
export function RunningStartEditor({
  running,
  todayKey,
  minDayKey,
  disabled,
  onSave,
}: RunningStartEditorProps) {
  const [open, setOpen] = useState(false);
  const initial: RunningStart = { date: running.dayDate, start: running.startLabel };
  const [pair, setPair] = useState(initial);
  /** Enter en la hora confirma con el valor recién normalizado, no con el del render. */
  const pairRef = useRef(pair);

  function change(next: RunningStart): void {
    pairRef.current = next;
    setPair(next);
  }

  function handleOpenChange(next: boolean): void {
    if (next && disabled) {
      return;
    }
    // Cada apertura arranca del inicio que tiene el servidor.
    if (next) {
      change(initial);
    }
    setOpen(next);
  }

  function save(): void {
    const next = pairRef.current;
    setOpen(false);
    if (next.date === initial.date && next.start === initial.start) {
      return;
    }
    onSave({ id: running.id, date: next.date, start: next.start });
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            // Inactivo con `aria-disabled` y no con `disabled`: al guardar, el
            // foco vuelve a este botón mientras el pedido viaja, y un botón
            // deshabilitado lo perdería.
            aria-disabled={disabled}
            className="focus-visible:ring-ring hover:bg-foreground/5 absolute inset-0 cursor-pointer rounded-md focus-visible:ring-3 focus-visible:outline-none aria-disabled:cursor-default aria-disabled:hover:bg-transparent"
          />
        }
        aria-label={trackerLabels.editRunningStart}
      />
      <PopoverContent align="end" className="w-auto">
        <PopoverHeader>
          <PopoverTitle>Inicio del timer</PopoverTitle>
        </PopoverHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <div className="flex items-center gap-2">
            <ClockField
              value={pair.start}
              onCommit={(text) => {
                // El mismo intérprete tolerante que la barra manual (TT-19, TT-21).
                const start = parseClockInput(text);
                if (start !== null) {
                  change({ ...pairRef.current, start });
                }
                return start;
              }}
              onSubmit={save}
              label={trackerLabels.startTime}
            />
            <DateField
              value={pair.date}
              onChange={(date) => change({ ...pairRef.current, date })}
              todayKey={todayKey}
              minDayKey={minDayKey}
              maxDayKey={todayKey}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" size="sm">
              Guardar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
