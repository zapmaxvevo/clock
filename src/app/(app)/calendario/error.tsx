"use client";

import { ActionFeedback } from "@/components/action-feedback";
import { calendarLabels } from "@/modules/time-entry/components/calendar/labels";

/**
 * CAL-87: la lectura falló. Nunca una grilla vacía, que se confundiría con un
 * período sin entradas (CAL-84). `retry` vuelve a pedir el segmento al servidor.
 */
export default function CalendarError({ retry }: { readonly retry: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="sr-only">{calendarLabels.heading}</h1>
      <ActionFeedback title={calendarLabels.loadFailed} onRetry={() => retry()} />
    </div>
  );
}
