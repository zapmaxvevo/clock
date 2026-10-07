"use client";

import { EllipsisVerticalIcon, PlayIcon, SquareIcon, Trash2Icon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TimeEntryView, UpdateRunningStartInput } from "@/modules/time-entry/schema";

import { ElapsedCounter } from "./elapsed-counter";
import { RunningStartEditor } from "./running-start-editor";

/**
 * Lo que la barra muestra mientras la action viaja. Vive en el contenedor,
 * que la necesita para saber que hay una operación en vuelo aunque el dato
 * del servidor todavía no haya cambiado.
 */
export type Phase = "idle" | "starting" | "stopping" | "discarding";

type TimerBarProps = {
  /** El campo de descripción es del contenedor: conmutar de modo no lo pierde. */
  readonly descriptionField: ReactNode;
  /** El selector de proyecto también, con el par que viaja con la barra. */
  readonly projectPicker: ReactNode;
  /** El selector de etiquetas también, después del de proyecto (TT-12, TT-49). */
  readonly tagPicker: ReactNode;
  /** El control de facturable también, después de las etiquetas (TT-14). */
  readonly billableToggle: ReactNode;
  /** Con la vista optimista: corre desde el clic en «Iniciar» hasta el de «Detener». */
  readonly isRunning: boolean;
  /** Inicio de la entrada abierta que cuenta el contador, o `null` parado. */
  readonly counterStart: string | null;
  /** La entrada abierta según el servidor: la que corrige el editor del inicio. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  /** Día de hoy en la zona del workspace: el techo del inicio (TT-29). */
  readonly todayKey: string;
  /** Piso de fechas. */
  readonly minDayKey: string;
  readonly canTrack: boolean;
  /** Hay un arranque o una parada en vuelo: el botón no acepta otro. */
  readonly switching: boolean;
  readonly onToggle: () => void;
  /** TT-28: corrige el inicio del timer. */
  readonly onSaveStart: (input: UpdateRunningStartInput) => void;
  /** Hay un guardado del inicio en vuelo: la barra queda atenuada. */
  readonly savingStart: boolean;
  /** El botón del menú: al cancelar el descarte, el foco vuelve a él. */
  readonly menuTriggerRef: RefObject<HTMLButtonElement | null>;
  /** TT-65: abre la confirmación del descarte sobre el timer en pantalla. */
  readonly onRequestDiscard: (id: string) => void;
  /** TT-26: con los atajos activos, «Iniciar» y «Detener» los anuncian. */
  readonly shortcutsEnabled: boolean;
};

/**
 * Barra del modo timer: el contador, el botón de arrancar y detener (TT-17,
 * TT-22, TT-23), el editor del inicio (TT-28) y el menú con el descarte
 * (TT-65). Los pedidos, sus avisos y la confirmación del descarte son del
 * contenedor: si la barra cambia de modo sin que nadie lo pida, el desenlace
 * sigue a la vista.
 */
export function TimerBar({
  descriptionField,
  projectPicker,
  tagPicker,
  billableToggle,
  isRunning,
  counterStart,
  running,
  serverNow,
  todayKey,
  minDayKey,
  canTrack,
  switching,
  onToggle,
  onSaveStart,
  savingStart,
  menuTriggerRef,
  onRequestDiscard,
  shortcutsEnabled,
}: TimerBarProps) {
  /** Lo que solo existe sobre el timer abierto: el editor del inicio y el menú. */
  const runningControls = canTrack && isRunning && running !== null;

  // Sin vista optimista del inicio: el contador salta al transcurrido nuevo
  // cuando llega la vista del servidor, y mientras tanto la barra queda
  // atenuada.
  return (
    <div
      aria-busy={savingStart}
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2",
        savingStart && "opacity-60",
      )}
    >
      {/* Base chica: la descripción cede ancho y se recorta antes que partir la barra (F3). */}
      <div className="min-w-0 flex-1 basis-28">{descriptionField}</div>

      {projectPicker}

      {tagPicker}

      {billableToggle}

      {/*
       * El contador, «Iniciar» o «Detener» y el menú bajan juntos cuando la
       * barra no entra en una línea: partidos, el contador cambiaría de lugar
       * según lo que ocupen los selectores y el facturable.
       */}
      <div className="flex shrink-0 items-center gap-3">
        <div className="relative">
          <ElapsedCounter startedAt={counterStart} serverNow={serverNow} />
          {runningControls && (
            <RunningStartEditor
              running={running}
              todayKey={todayKey}
              minDayKey={minDayKey}
              disabled={switching || savingStart}
              onSave={onSaveStart}
            />
          )}
        </div>

        {/*
         * Inactivo con `aria-disabled` y no con `disabled` mientras la parada o
         * el arranque viajan: el foco se queda en el botón, también cuando la
         * parada extiende la ventana (P-15) y la página se dibuja dos veces.
         */}
        <Button
          type="button"
          variant={isRunning ? "default" : "success"}
          disabled={!canTrack}
          aria-disabled={switching}
          onClick={() => {
            if (!switching) {
              onToggle();
            }
          }}
          aria-keyshortcuts={shortcutsEnabled ? (isRunning ? "S" : "N") : undefined}
          className={cn(
            "aria-disabled:active:translate-y-0",
            isRunning
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 aria-disabled:hover:bg-destructive"
              : "aria-disabled:hover:bg-success",
          )}
        >
          {isRunning ? (
            <SquareIcon aria-hidden="true" />
          ) : (
            <PlayIcon aria-hidden="true" />
          )}
          {isRunning ? "Detener" : "Iniciar"}
        </Button>

        {runningControls && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button ref={menuTriggerRef} variant="ghost" size="icon-sm" />}
              aria-label="Acciones del timer"
            >
              <EllipsisVerticalIcon aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto min-w-40">
              <DropdownMenuItem
                variant="destructive"
                disabled={switching}
                onClick={() => onRequestDiscard(running.id)}
              >
                <Trash2Icon aria-hidden="true" />
                Descartar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
