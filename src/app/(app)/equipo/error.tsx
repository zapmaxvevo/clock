"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { teamLabels } from "@/modules/team/components/labels";

/** La lectura falló. Nunca una tabla vacía. `retry` vuelve a pedir el segmento al servidor. */
export default function TeamError({ retry }: { readonly retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{teamLabels.heading}</h1>
      <ActionFeedback title={teamLabels.loadFailed} onRetry={() => retry()} />
    </div>
  );
}
