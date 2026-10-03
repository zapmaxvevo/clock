"use client";

import { PlayIcon, SquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TimeEntryView, UpdateRunningStartInput } from "@/modules/time-entry/schema";

import { ElapsedCounter } from "./elapsed-counter";
import { trackerLabels } from "./labels";
import { RunningStartEditor } from "./running-start-editor";

/**
 * Lo que la barra muestra mientras la action viaja. Vive en el contenedor,
 * que la necesita para saber que hay una operación en vuelo aunque el dato
 * del servidor todavía no haya cambiado.
 */
export type Phase = "idle" | "starting" | "stopping";

type TimerBarProps = {
  /** El campo de descripción es del contenedor: conmutar de modo no lo pierde. */
  readonly descriptionField: ReactNode;
  /** Con la vista optimista: corre desde el clic en «Iniciar» hasta el de «Detener». */
  readonly isRunning: boolean;
  /** Inicio de la entrada abierta que cuenta el contador, o `null` parado. */
  readonly counterStart: string | null;
  /** La entrada abierta según el servidor: la que corrige el editor del inicio. */
  readonly running: TimeEntryView | null;
  readonly serverNow: string;
  /** Día de hoy en la zona del workspace: el techo del inicio (TT-29). */
  readonly todayKey: string;
  /** Piso del workspace. */
  readonly minDayKey: string;
  readonly canTrack: boolean;
  /** Hay un arranque o una parada en vuelo: el botón no acepta otro. */
  readonly switching: boolean;
  readonly onToggle: () => void;
  /** TT-28: corrige el inicio del timer. */
  readonly onSaveStart: (input: UpdateRunningStartInput) => void;
  /** Hay un guardado del inicio en vuelo: la barra queda atenuada. */
  readonly savingStart: boolean;
};

/**
 * Barra del modo timer: el contador, el botón de arrancar y detener (TT-17,
 * TT-22, TT-23) y el editor del inicio (TT-28). Los pedidos y sus avisos son
 * del contenedor: si la barra cambia de modo sin que nadie lo pida, el
 * desenlace sigue a la vista.
 */
export function TimerBar({
  descriptionField,
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
}: TimerBarProps) {
  const editableStart = canTrack && isRunning && running !== null;

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
      <div className="min-w-0 flex-1 basis-64">{descriptionField}</div>

      <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

      <div className="relative">
        <ElapsedCounter startedAt={counterStart} serverNow={serverNow} />
        {editableStart && (
          <RunningStartEditor
            running={running}
            todayKey={todayKey}
            minDayKey={minDayKey}
            disabled={switching || savingStart}
            onSave={onSaveStart}
          />
        )}
      </div>

      <Button
        type="button"
        variant={isRunning ? "default" : "success"}
        disabled={!canTrack || switching}
        onClick={onToggle}
        className={
          isRunning
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : undefined
        }
      >
        {isRunning ? <SquareIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
        {isRunning ? "Detener" : "Iniciar"}
      </Button>
    </div>
  );
}
