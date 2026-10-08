import { timeEntryMessages, type TimeEntryErrorCode } from "@/modules/time-entry/schema";
import type { ActionResult } from "@/server/action";

/**
 * Llama a una action de la planilla fuera de toda transición (§5.6). Si no
 * llega a responder —red caída, servidor inalcanzable— es `unexpected` con el
 * texto del módulo, como en `useAction`.
 */
export async function sendOrUnexpected<Data>(
  send: () => Promise<ActionResult<Data, TimeEntryErrorCode>>,
): Promise<ActionResult<Data, TimeEntryErrorCode>> {
  try {
    return await send();
  } catch {
    return { ok: false, code: "unexpected", message: timeEntryMessages.unexpected };
  }
}
