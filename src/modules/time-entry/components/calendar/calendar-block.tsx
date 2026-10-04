"use client";

import type { CSSProperties, ReactNode, Ref } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projectTaskLabel } from "@/modules/project/components/labels";
import { paletteColor } from "@/modules/project/palette";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { clockLabel, formatDuration, weekdayLabel } from "@/server/time";

import { useElapsedSeconds } from "../elapsed-counter";
import { entryNameOf } from "../labels";
import type { PlacedBlock, Segment } from "./calendar-layout";
import { calendarLabels } from "./labels";

type CalendarBlockProps = {
  readonly entry: TimeEntryView;
  readonly segment: Segment;
  /** Dónde va en la columna, de `layoutColumn`. */
  readonly placement: Omit<PlacedBlock<unknown>, "item">;
  readonly serverNow: string;
  /** Día de hoy en la zona de la persona: el año del rótulo del día. */
  readonly todayKey: string;
  readonly onOpen: () => void;
  /** El botón del bloque, adonde vuelve el foco al cerrar su diálogo. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
};

/** «Proyecto» o «Proyecto: Tarea», o `null` sin proyecto. */
function projectText({ project, task }: TimeEntryView): string | null {
  if (project === null) {
    return null;
  }
  return task === null ? project.name : projectTaskLabel(project.name, task.name);
}

/**
 * CAL-22: el relleno es el color del proyecto en tono claro, con el borde
 * izquierdo en el color pleno y el texto en el de primer plano: los tonos 600
 * no dan contraste AA con texto blanco.
 */
function colorStyle(entry: TimeEntryView): CSSProperties {
  if (entry.project === null) {
    return {};
  }
  const color = paletteColor(entry.project.color).value;
  return {
    backgroundColor: `color-mix(in oklab, ${color} 20%, var(--background))`,
    borderLeftColor: color,
  };
}

/**
 * Un segmento de una entrada en la grilla (CAL-20 a CAL-24). El primero
 * visible es el botón que abre el diálogo (CAL-74, CAL-76); los otros abren
 * el mismo diálogo con el puntero y quedan ocultos para el lector de pantalla.
 */
export function CalendarBlock({
  entry,
  segment,
  placement,
  serverNow,
  todayKey,
  onOpen,
  buttonRef,
}: CalendarBlockProps) {
  const { time, date } = useDisplayFormats();
  /** El timer que corre termina «en curso» (CAL-38). */
  const running = entry.endClock === null;
  const elapsed = useElapsedSeconds(running ? entry.startedAt : null, serverNow);

  const name = entryNameOf(entry.description);
  const project = projectText(entry);
  const start = clockLabel(entry.startClock, time);
  const end = entry.endClock === null ? null : clockLabel(entry.endClock, time);
  const duration = running
    ? formatDuration(Math.floor(elapsed / 60))
    : (entry.durationLabel ?? "");
  const label = calendarLabels.blockLabel({
    name,
    day: weekdayLabel(entry.dayDate, todayKey, date),
    start,
    end: end === null ? null : { clock: end, extraDays: entry.extraDays, duration },
    project,
  });

  const times: ReactNode = (
    <>
      {start} – {end ?? calendarLabels.running}
      {entry.extraDays > 0 && <sup className="ml-0.5">+{entry.extraDays}</sup>}
    </>
  );

  const content = (
    <>
      <span
        className={cn(
          "truncate font-medium",
          entry.description === "" && "text-muted-foreground font-normal",
        )}
      >
        {name}
      </span>
      {segment.startsHere && entry.project !== null && (
        <span className="flex min-w-0 items-center gap-1">
          <span
            aria-hidden="true"
            data-slot="project-dot"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: paletteColor(entry.project.color).value }}
          />
          <span className="truncate">{project}</span>
        </span>
      )}
      {segment.startsHere && (
        <span className="text-muted-foreground tabular-nums">
          {times} · {duration}
        </span>
      )}
    </>
  );

  // Las líneas del contenido no se encogen: una línea con `truncate` en una
  // columna flexible baja a alto cero y el bloque corto mostraría la siguiente.
  const className = cn(
    "absolute flex flex-col items-start gap-0.5 overflow-hidden rounded-md *:max-w-full *:shrink-0 border border-l-[3px] px-1.5 py-0.5 text-left text-xs leading-tight text-foreground",
    entry.project === null && "bg-muted border-border",
    running && "border-dotted",
    "focus-visible:ring-ring focus-visible:z-10 focus-visible:ring-3 focus-visible:outline-none",
  );
  const style: CSSProperties = {
    ...colorStyle(entry),
    top: placement.top,
    height: placement.height,
    left: `calc(${placement.lane} * 100% / ${placement.lanes})`,
    width: `calc(100% / ${placement.lanes} - 2px)`,
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          segment.firstVisible ? (
            <button ref={buttonRef} type="button" aria-label={label} />
          ) : (
            <div aria-hidden="true" />
          )
        }
        data-entry-block={entry.id}
        className={className}
        style={style}
        onClick={onOpen}
      >
        {content}
      </TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        <span className="whitespace-pre-wrap">{name}</span>
        <span className="tabular-nums">
          {times} · {duration}
        </span>
        {project !== null && <span>{project}</span>}
      </TooltipContent>
    </Tooltip>
  );
}
