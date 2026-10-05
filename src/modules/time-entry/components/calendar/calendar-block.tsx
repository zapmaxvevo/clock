"use client";

import type { CSSProperties, PointerEvent, ReactNode, Ref } from "react";

import { useDisplayFormats } from "@/components/layout/display-formats";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projectTaskLabel } from "@/modules/project/components/labels";
import { paletteColor } from "@/modules/project/palette";
import type { TimeEntryView } from "@/modules/time-entry/schema";
import { formatDuration, weekdayLabel } from "@/server/time";

import { useElapsedSeconds } from "../elapsed-counter";
import { entryNameOf } from "../labels";
import type { EntryGestureKind, SegmentGestures } from "./calendar-gestures";
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
  /**
   * El detalle se cierra con un diálogo abierto, que no lo deja detrás del
   * fondo, y con un gesto en curso (CAL-23, CAL-77).
   */
  readonly detailsOff: boolean;
  readonly onOpen: () => void;
  /** El botón del bloque, adonde vuelve el foco al cerrar su diálogo. */
  readonly buttonRef?: Ref<HTMLButtonElement>;
  /** Los gestos que ofrece este segmento; ninguno mientras viaja un pedido de horario. */
  readonly gestures: SegmentGestures;
  /** El pedido de su horario viaja: atenuado, `aria-busy`, inactivo (CAL-62). */
  readonly busy: boolean;
  /** Se dibuja en el lugar candidato del gesto en curso. */
  readonly dragging: boolean;
  /** Apretar el cuerpo o un asa; la grilla decide si empieza un gesto. */
  readonly onGestureStart: (
    kind: EntryGestureKind,
    event: PointerEvent<HTMLElement>,
  ) => void;
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
  detailsOff,
  onOpen,
  buttonRef,
  gestures,
  busy,
  dragging,
  onGestureStart,
}: CalendarBlockProps) {
  const { date } = useDisplayFormats();
  /** El timer que corre termina «en curso» (CAL-38). */
  const running = entry.endClock === null;
  const elapsed = useElapsedSeconds(running ? entry.startedAt : null, serverNow);

  const name = entryNameOf(entry.description);
  const project = projectText(entry);
  const start = entry.startLabel;
  const end = entry.endLabel;
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
          // CAL-22: sobre el relleno, el gris del tema no llega a 4,5:1.
          entry.description === "" && "text-foreground/70 font-normal",
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
        <span className="text-foreground/70 truncate tabular-nums">
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
    gestures.move && "cursor-grab",
    busy && "opacity-60",
    // Sin `transition` de posición ni de tamaño: nada se anima (CAL-78).
    dragging && "ring-ring z-10 ring-2",
    "focus-visible:ring-ring focus-visible:z-10 focus-visible:ring-3 focus-visible:outline-none",
    // El bloque enfocado no queda bajo los encabezados ni el eje, que son
    // pegajosos (WCAG 2.4.11). En el contenedor, el margen alcanzaría también a
    // la esquina del zoom, y enfocarla desplazaría la grilla.
    "scroll-mt-14 scroll-ml-[6.5rem]",
  );
  const style: CSSProperties = {
    ...colorStyle(entry),
    top: placement.top,
    height: placement.height,
    left: `calc(${placement.lane} * 100% / ${placement.lanes})`,
    width: `calc(100% / ${placement.lanes} - 2px)`,
  };

  return (
    <Tooltip disabled={detailsOff}>
      <TooltipTrigger
        render={
          segment.firstVisible ? (
            <button ref={buttonRef} type="button" aria-label={label} />
          ) : (
            <div aria-hidden="true" />
          )
        }
        data-entry-block={entry.id}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        className={className}
        style={style}
        onClick={() => {
          if (!busy) {
            onOpen();
          }
        }}
        onPointerDown={(event) => {
          const kind = gestureKindAt(event.target, gestures);
          if (kind !== null) {
            onGestureStart(kind, event);
          }
        }}
      >
        {gestures.start && <BlockHandle edge="start" />}
        {content}
        {gestures.end && <BlockHandle edge="end" />}
      </TooltipTrigger>
      {/* El detalle solo informa: no tapa el borde del bloque que se aprieta. */}
      <TooltipContent className="pointer-events-none flex-col items-start gap-0.5">
        <span className="whitespace-pre-wrap">{name}</span>
        <span className="tabular-nums">
          {times} · {duration}
        </span>
        {project !== null && <span>{project}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * El asa de un extremo (CAL-52): no es un control ni está en el orden de
 * `Tab`, porque el diálogo hace lo mismo (WCAG 2.5.7). El cursor la señala.
 */
function BlockHandle({ edge }: { readonly edge: "start" | "end" }) {
  return (
    <span
      aria-hidden="true"
      data-block-handle={edge}
      className={cn(
        "absolute inset-x-0 h-1.5 cursor-ns-resize",
        edge === "start" ? "top-0" : "bottom-0",
      )}
    />
  );
}

/** El gesto que empieza donde bajó el puntero: un asa, o el cuerpo si se mueve. */
function gestureKindAt(
  target: EventTarget,
  gestures: SegmentGestures,
): EntryGestureKind | null {
  const handle =
    target instanceof Element
      ? target.closest("[data-block-handle]")?.getAttribute("data-block-handle")
      : null;
  if (handle === "start" || handle === "end") {
    return handle;
  }
  return gestures.move ? "move" : null;
}
