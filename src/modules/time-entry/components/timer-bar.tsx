"use client";

import { EllipsisVerticalIcon, PlayIcon, SquareIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, type ReactNode, type RefObject } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TimeEntryView, UpdateRunningStartInput } from "@/modules/time-entry/schema";

import { DiscardTimerDialog } from "./discard-timer-dialog";
import { ElapsedCounter } from "./elapsed-counter";
import { trackerLabels } from "./labels";
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
  /** TT-65: al confirmar el descarte, el foco va al campo de descripción. */
  readonly descriptionRef: RefObject<HTMLInputElement | null>;
  /** TT-65: descarta el timer elegido al abrir la confirmación. */
  readonly onDiscard: (id: string) => void;
  /** Hay un guardado de la descripción en vuelo: el descarte no se confirma. */
  readonly savingDescription: boolean;
  /** TT-26: con los atajos activos, «Iniciar» y «Detener» los anuncian. */
  readonly shortcutsEnabled: boolean;
};

/**
 * Barra del modo timer: el contador, el botón de arrancar y detener (TT-17,
 * TT-22, TT-23), el editor del inicio (TT-28) y el menú con el descarte
 * (TT-65). Los pedidos y sus avisos son del contenedor: si la barra cambia de
 * modo sin que nadie lo pida, el desenlace sigue a la vista.
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
  descriptionRef,
  onDiscard,
  savingDescription,
  shortcutsEnabled,
}: TimerBarProps) {
  /**
   * El timer que se descarta, fijado al abrir la confirmación: si mientras el
   * diálogo está abierto llega otro timer, confirmar no lo borra (§4.3).
   */
  const [discardId, setDiscardId] = useState<string | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
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
      <div className="min-w-0 flex-1 basis-64">{descriptionField}</div>

      <span className="text-muted-foreground text-sm">{trackerLabels.noProject}</span>

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

      <Button
        type="button"
        variant={isRunning ? "default" : "success"}
        disabled={!canTrack || switching}
        onClick={onToggle}
        aria-keyshortcuts={shortcutsEnabled ? (isRunning ? "S" : "N") : undefined}
        className={
          isRunning
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : undefined
        }
      >
        {isRunning ? <SquareIcon aria-hidden="true" /> : <PlayIcon aria-hidden="true" />}
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
              onClick={() => setDiscardId(running.id)}
            >
              <Trash2Icon aria-hidden="true" />
              Descartar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* Fuera del condicional: al confirmar, el menú se va con el timer y el diálogo cierra igual. */}
      {canTrack && (
        <DiscardTimerDialog
          open={discardId !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDiscardId(null);
            }
          }}
          onConfirm={() => {
            if (discardId !== null) {
              onDiscard(discardId);
            }
          }}
          confirmDisabled={savingDescription}
          finalFocus={menuTriggerRef}
          fallbackFocus={descriptionRef}
        />
      )}
    </div>
  );
}
