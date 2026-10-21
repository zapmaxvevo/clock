"use client";

import { useId, useOptimistic, useRef } from "react";

import { ActionFeedback } from "@/components/action-feedback";
import { ChoiceSelect } from "@/components/choice-select";
import { Label } from "@/components/ui/label";
import { retryHandlerOf, useAction } from "@/hooks/use-action";
import {
  workspaceSettingsMessages,
  type WorkspaceSettingsActions,
} from "@/modules/workspace/schema";
import type { DurationFormat } from "@/server/time";

import {
  DURATION_FORMAT_ORDER,
  durationFormatNames,
  durationFormatPatterns,
  workspaceSettingsLabels,
} from "./labels";

type DurationFormatFieldProps = {
  /** El valor de la fila de ajustes, leído por la vista (D-WS2b-4). */
  readonly value: DurationFormat;
  readonly save: WorkspaceSettingsActions["updateWorkspaceSetting"];
};

const options = DURATION_FORMAT_ORDER.map((value) => ({
  value,
  example: durationFormatPatterns[value],
}));

/**
 * WS-04, WS-15, D-WS2b-6: el formato de duración del workspace, que guarda al
 * cambiar con el valor nuevo como vista optimista. Si falla, la transición
 * descarta esa vista y el control vuelve solo al anterior, con el aviso
 * debajo (WS-62). Como `PreferenceField`, para una sola clave; la vista
 * `ready` ya es de quien puede cambiarlo.
 */
export function DurationFormatField({ value, save }: DurationFormatFieldProps) {
  const controlId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [shown, show] = useOptimistic<DurationFormat, DurationFormat>(
    value,
    (_, next) => next,
  );
  const update = useAction(save, {
    unreachableMessage: workspaceSettingsMessages.unexpected,
    optimistic: (input) => show(input.value),
  });

  const retry = retryHandlerOf(update);
  const onRetry =
    retry === undefined
      ? undefined
      : () => {
          // «Reintentar» se va con su aviso: el foco pasa antes al control,
          // que sigue en la pantalla.
          triggerRef.current?.focus();
          retry();
        };

  return (
    <div className="grid gap-2">
      <Label htmlFor={controlId}>{workspaceSettingsLabels.durationFormat}</Label>
      <ChoiceSelect
        id={controlId}
        triggerRef={triggerRef}
        value={shown}
        options={options}
        nameOf={(format) => durationFormatNames[format]}
        canEdit
        onChange={(format) => update.run({ key: "durationFormat", value: format })}
      />
      {update.failure !== null && (
        <ActionFeedback
          title={workspaceSettingsLabels.durationFailed}
          message={update.failure.message}
          onRetry={onRetry}
        />
      )}
    </div>
  );
}
