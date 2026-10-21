"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { workspaceSettingsLabels } from "@/modules/workspace/components/labels";

/**
 * WS-73: la lectura falló, por ejemplo sin la fila de ajustes. Nunca la
 * pantalla a medias. `retry` vuelve a pedir el segmento al servidor.
 */
export default function WorkspaceSettingsPageError({
  retry,
}: {
  readonly retry: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{workspaceSettingsLabels.heading}</h1>
      <ActionFeedback
        title={workspaceSettingsLabels.loadFailed}
        onRetry={() => retry()}
      />
    </div>
  );
}
