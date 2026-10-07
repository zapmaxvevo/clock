import { sameId } from "@/lib/project-pair";
import { sameTagIds } from "@/lib/tag-ids";
import type { CreateManualEntryInput, TimeEntryView } from "@/modules/time-entry/schema";

/** Lo que pide un alta manual, sin el id que pone el dueño de los pedidos. */
export type NewEntryRequest = Omit<CreateManualEntryInput, "id">;

/**
 * Los pedidos de alta que salieron con un mismo id, en orden. Con el aviso de
 * falla por red a la vista el id se reusa (ADR 0007), y la respuesta es la
 * fila del primero de estos pedidos que se aplicó.
 */
export type SentRequests = {
  readonly id: string;
  readonly requests: readonly NewEntryRequest[];
};

/** Suma un pedido a los que salieron con su id; otro id empieza de cero. */
export function recordSent(
  sent: SentRequests | null,
  id: string,
  request: NewEntryRequest,
): SentRequests {
  return sent?.id === id
    ? { id, requests: [...sent.requests, request] }
    : { id, requests: [request] };
}

/** Zod guarda la descripción recortada, y ausente es «sin descripción». */
function descriptionOf(request: NewEntryRequest): string {
  return (request.description ?? "").trim();
}

/** Los dos pedidos piden la misma entrada. */
export function sameRequest(left: NewEntryRequest, right: NewEntryRequest): boolean {
  return (
    descriptionOf(left) === descriptionOf(right) &&
    left.date === right.date &&
    left.start === right.start &&
    left.end === right.end &&
    sameId(left.projectId ?? null, right.projectId ?? null) &&
    sameId(left.taskId ?? null, right.taskId ?? null) &&
    left.billable === right.billable &&
    sameTagIds(left.tagIds ?? [], right.tagIds ?? [])
  );
}

/** El pedido que guarda lo que la vista muestra; `null` con una entrada abierta. */
function requestOfView(entry: TimeEntryView): NewEntryRequest | null {
  if (entry.endClock === null) {
    return null;
  }
  return {
    description: entry.description,
    date: entry.dayDate,
    start: entry.startClock,
    end: entry.endClock,
    projectId: entry.project?.id ?? null,
    taskId: entry.task?.id ?? null,
    billable: entry.billable,
    tagIds: entry.tags.map((tag) => tag.id),
  };
}

/**
 * La entrada que respondió el alta es la que se mandó. En falso, la respuesta
 * es la de un pedido anterior con el mismo id (ADR 0007, D2c-1): lo mandado no
 * se guardó.
 */
export function isSentEntry(created: TimeEntryView, sent: NewEntryRequest): boolean {
  const view = requestOfView(created);
  // Sin facturable en el pedido, lo resolvió el servidor (r3-2).
  return (
    view !== null &&
    sameRequest(view, { ...sent, billable: sent.billable ?? view.billable })
  );
}

/**
 * La respuesta del alta con `id` es la de lo mandado (r3-1): todo lo que salió
 * con ese id era este mismo pedido —la fila es la suya aunque otra pestaña la
 * haya editado o haya cambiado la zona—, o la entrada coincide con lo mandado.
 */
export function answersSent(
  created: TimeEntryView,
  id: string,
  request: NewEntryRequest,
  sent: SentRequests | null,
): boolean {
  const alwaysThis =
    sent?.id === id && sent.requests.every((other) => sameRequest(other, request));
  return alwaysThis || isSentEntry(created, request);
}
