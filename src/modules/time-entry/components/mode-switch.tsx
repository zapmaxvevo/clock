"use client";

import { ClockIcon, ListIcon } from "lucide-react";
import { useId } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { timeEntryMessages } from "@/modules/time-entry/schema";

import { parseTrackerMode, type TrackerMode } from "./tracker-mode";

type ModeSwitchProps = {
  readonly mode: TrackerMode;
  readonly onModeChange: (mode: TrackerMode) => void;
  /** Con un timer corriendo no se puede agregar tiempo a mano (TT-30): se dice por qué. */
  readonly timerRunning: boolean;
  /**
   * Lo decide la barra, que también atiende «m»: con un timer corriendo o una
   * operación de la barra en vuelo, que conmutar dejaría sin su desenlace.
   */
  readonly disabled: boolean;
  /** TT-26: con los atajos activos, «m» conmuta y los dos botones lo anuncian. */
  readonly shortcutsEnabled: boolean;
};

/**
 * Conmutador de modo (TT-16). La cookie que recuerda el modo la escribe la
 * barra, que también conmuta con el atajo «m». Cuando el
 * motivo de que esté inactivo es un timer, se dice con un texto visible y no
 * con un tooltip: un control deshabilitado no recibe foco ni puntero, así que
 * un tooltip ahí no se puede leer con el teclado.
 */
export function ModeSwitch({
  mode,
  onModeChange,
  timerRunning,
  disabled,
  shortcutsEnabled,
}: ModeSwitchProps) {
  const helpId = useId();
  const keyShortcut = shortcutsEnabled ? "M" : undefined;

  function handleChange(values: string[]): void {
    const next = values[0];
    // Volver a tocar el modo activo no apaga los dos: siempre hay uno elegido.
    if (next === undefined) {
      return;
    }
    const chosen = parseTrackerMode(next);
    if (chosen === mode) {
      return;
    }
    onModeChange(chosen);
  }

  return (
    <div className="flex items-center gap-2">
      {timerRunning && (
        // El lector lo recibe por `aria-describedby` al llegar al conmutador;
        // oculto del recorrido lineal, no se lee una vez más fuera de él.
        <p
          id={helpId}
          aria-hidden="true"
          className="text-muted-foreground max-w-44 text-right text-xs"
        >
          {timeEntryMessages.timerRunning}
        </p>
      )}
      <ToggleGroup
        value={[mode]}
        onValueChange={handleChange}
        disabled={disabled}
        aria-label="Modo de carga"
        aria-describedby={timerRunning ? helpId : undefined}
        variant="outline"
        size="sm"
        spacing={0}
      >
        <ToggleGroupItem
          value="timer"
          aria-label="Modo timer"
          aria-keyshortcuts={keyShortcut}
        >
          <ClockIcon aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="manual"
          aria-label="Modo manual"
          aria-keyshortcuts={keyShortcut}
        >
          <ListIcon aria-hidden="true" />
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
