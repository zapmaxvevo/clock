"use client";

import { PlayIcon, SquareIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";

import { ElapsedCounter } from "./elapsed-counter";
import { trackerLabels } from "./labels";

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
  readonly serverNow: string;
  readonly canTrack: boolean;
  /** Hay un arranque o una parada en vuelo: el botón no acepta otro. */
  readonly switching: boolean;
  readonly onToggle: () => void;
};

/**
 * Barra del modo timer: el contador y el botón de arrancar y detener (TT-17,
 * TT-22, TT-23). Los pedidos y sus avisos son del contenedor: si la barra
 * cambia de modo sin que nadie lo pida, el desenlace sigue a la vista.
 */
export function TimerBar({
  descriptionField,
  isRunning,
  counterStart,
  serverNow,
  canTrack,
  switching,
  onToggle,
}: TimerBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2">
      <div className="min-w-0 flex-1 basis-64">{descriptionField}</div>

      <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

      <ElapsedCounter startedAt={counterStart} serverNow={serverNow} />

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
