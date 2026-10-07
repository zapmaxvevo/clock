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

/**
 * La entrada que respondió el alta es la que se mandó. En falso, la respuesta
 * es la de un pedido anterior con el mismo id (ADR 0007, D2c-1): lo mandado no
 * se guardó.
 */
export function isSentEntry(created: TimeEntryView, sent: NewEntryRequest): boolean {
  return (
    created.endClock !== null &&
    created.description === descriptionOf(sent) &&
    created.dayDate === sent.date &&
    created.startClock === sent.start &&
    created.endClock === sent.end &&
    sameId(created.project?.id ?? null, sent.projectId ?? null) &&
    sameId(created.task?.id ?? null, sent.taskId ?? null) &&
    // Sin facturable en el pedido, lo resolvió el servidor (r3-2).
    (sent.billable === undefined || created.billable === sent.billable) &&
    sameTagIds(
      created.tags.map((tag) => tag.id),
      sent.tagIds ?? [],
    )
  );
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
