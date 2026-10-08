"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { timesheetLabels } from "@/modules/time-entry/components/timesheet/labels";

/**
 * La lectura falló. Nunca una grilla vacía, que se confundiría con una semana
 * sin horas (TS-87). `retry` vuelve a pedir el segmento al servidor.
 */
export default function TimesheetError({ retry }: { readonly retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-xl font-semibold">{timesheetLabels.heading}</h1>
      <ActionFeedback title={timesheetLabels.loadFailed} onRetry={() => retry()} />
    </div>
  );
}
