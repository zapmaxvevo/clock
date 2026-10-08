import { z } from "zod";

import { samePair, type ProjectPair } from "@/lib/project-pair";
import { isTrackablePair } from "@/modules/project/components/picker-model";
import type { TrackingCatalog } from "@/modules/project/schema";

/** La forma en `localStorage[storageKey]`. Lo que no la cumple se descarta entero. */
const storedRows = z.object({
  version: z.literal(1),
  /** Por primer día de semana (P-16): las filas vacías agregadas en esa semana. */
  weeks: z.record(
    z.string(),
    z.array(
      z.object({
        projectId: z.uuid().nullable(),
        taskId: z.uuid().nullable(),
      }),
    ),
  ),
});

/** Las filas vacías que guarda el navegador (TS-19, D13-7). */
export type StoredRows = z.infer<typeof storedRows>;

export const NO_STORED_ROWS: StoredRows = { version: 1, weeks: {} };

/** Lo guardado, o nada si no está o no tiene la forma: no se repara a medias. */
export function storedRowsFrom(raw: string | null): StoredRows {
  if (raw === null) {
    return NO_STORED_ROWS;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return NO_STORED_ROWS;
  }
  const parsed = storedRows.safeParse(value);
  return parsed.success ? parsed.data : NO_STORED_ROWS;
}

export function storedRowsValue(rows: StoredRows): string {
  return JSON.stringify(rows);
}

/** Las filas guardadas de una semana: no se dibujan en otra (P-16). */
export function storedPairsOf(
  rows: StoredRows,
  weekStart: string,
): readonly ProjectPair[] {
  return rows.weeks[weekStart] ?? [];
}

function withWeek(
  rows: StoredRows,
  weekStart: string,
  pairs: readonly ProjectPair[],
): StoredRows {
  const weeks = { ...rows.weeks };
  if (pairs.length === 0) {
    delete weeks[weekStart];
  } else {
    weeks[weekStart] = pairs.map(({ projectId, taskId }) => ({ projectId, taskId }));
  }
  return { version: 1, weeks };
}

/** Elegir el par de una fila nueva la guarda en su semana, sin repetir. */
export function withStoredRow(
  rows: StoredRows,
  weekStart: string,
  pair: ProjectPair,
): StoredRows {
  const pairs = storedPairsOf(rows, weekStart);
  if (pairs.some((stored) => samePair(stored, pair))) {
    return rows;
  }
  return withWeek(rows, weekStart, [...pairs, pair]);
}

/** Quitar la fila la olvida; una semana sin filas sale del objeto. */
export function withoutStoredRow(
  rows: StoredRows,
  weekStart: string,
  pair: ProjectPair,
): StoredRows {
  const pairs = storedPairsOf(rows, weekStart);
  const kept = pairs.filter((stored) => !samePair(stored, pair));
  return kept.length === pairs.length ? rows : withWeek(rows, weekStart, kept);
}

/**
 * Lo guardado de la semana que ya no hace falta: la fila llegó del servidor
 * con entradas (TS-19), o su par dejó de estar en el catálogo de carga y no
 * se podría escribir (D13-7). Devuelve el mismo objeto si no olvida nada.
 */
export function prunedStoredRows(
  rows: StoredRows,
  weekStart: string,
  serverPairs: readonly ProjectPair[],
  catalog: TrackingCatalog,
): StoredRows {
  const pairs = storedPairsOf(rows, weekStart);
  const kept = pairs.filter(
    (stored) =>
      !serverPairs.some((server) => samePair(server, stored)) &&
      isTrackablePair(catalog, stored),
  );
  return kept.length === pairs.length ? rows : withWeek(rows, weekStart, kept);
}
