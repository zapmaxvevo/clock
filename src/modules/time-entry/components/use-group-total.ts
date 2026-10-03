"use client";

import type { TimeEntryView } from "@/modules/time-entry/schema";
import { formatDuration } from "@/server/time";

import { useElapsedSeconds } from "./elapsed-counter";

type GroupTotal = {
  /** Exacto, en segundos, como lo da el servidor. */
  readonly closedSeconds: number;
  /** Las entradas cerradas del grupo. */
  readonly entries: readonly TimeEntryView[];
  /** Las entradas cuyo borrado viaja: salen del total de forma optimista. */
  readonly removedIds: readonly string[];
  /** El inicio del timer activo si el grupo es el suyo, o `null`. */
  readonly runningStartedAt: string | null;
  readonly serverNow: string;
};

/**
 * El total de un grupo de la lista, de día o de semana, en `h:mm`. El del
 * grupo del timer activo suma el transcurrido y sube junto con el contador
 * (TT-45, TT-46); la suma es en segundos y se formatea una sola vez, así no
 * acumula el truncamiento de cada fila.
 */
export function useGroupTotalLabel({
  closedSeconds,
  entries,
  removedIds,
  runningStartedAt,
  serverNow,
}: GroupTotal): string {
  const elapsed = useElapsedSeconds(runningStartedAt, serverNow);
  const removedSeconds = entries
    .filter((entry) => removedIds.includes(entry.id))
    .reduce((total, entry) => total + (entry.durationSeconds ?? 0), 0);
  return formatDuration(
    Math.floor((Math.max(0, closedSeconds - removedSeconds) + elapsed) / 60),
  );
}
