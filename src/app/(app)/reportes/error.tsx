"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { reportLabels } from "@/modules/report/components/labels";

/**
 * RP-35: la lectura falló. Nunca una tabla vacía, que se confundiría con un
 * período sin horas. `retry` vuelve a pedir el segmento al servidor.
 */
export default function ReportError({ retry }: { readonly retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{reportLabels.heading}</h1>
      <ActionFeedback title={reportLabels.loadFailed} onRetry={() => retry()} />
    </div>
  );
}
