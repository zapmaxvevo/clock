import {
  dayKey,
  durationSeconds,
  instantFromLocalOrLater,
  isAfterYear9999,
} from "@/server/time";

/** Lo que la regla mira de cada entrada cerrada de la celda. */
export type CellEntry = {
  readonly id: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly createdAt: Date;
};

/** TS-31: la hora de pared en que empieza la entrada de una celda vacía. */
export const EMPTY_CELL_START = "09:00";

const MINUTE_MS = 60_000;

/**
 * Lo que la celda muestra, en minutos: la suma exacta en segundos de sus
 * entradas (`durationSeconds` de cada una), dividida por 60 y truncada una vez
 * (TS-24, TS-47, D13-3).
 */
export function cellMinutes(entries: readonly CellEntry[]): number {
  const seconds = entries.reduce(
    (total, entry) => total + durationSeconds(entry.startedAt, entry.endedAt),
    0,
  );
  return Math.floor(seconds / 60);
}

/** Positivo si `a` empieza más tarde que `b`, con el desempate de TS-34. */
function compareStart(a: CellEntry, b: CellEntry): number {
  return (
    a.startedAt.getTime() - b.startedAt.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id > b.id ? 1 : a.id < b.id ? -1 : 0)
  );
}

/**
 * La entrada que «empieza más tarde» (TS-34): la de `startedAt` mayor; con el
 * mismo, la de `createdAt` más reciente; con los dos iguales, la de id mayor.
 */
export function latestStarting<Entry extends CellEntry>(
  entries: readonly [Entry, ...Entry[]],
): Entry {
  const [first, ...rest] = entries;
  return rest.reduce(
    (latest, entry) => (compareStart(entry, latest) > 0 ? entry : latest),
    first,
  );
}

/** La que termina más tarde: la base de una subida (TS-34). */
function latestEnding<Entry extends CellEntry>(
  entries: readonly [Entry, ...Entry[]],
): Entry {
  const [first, ...rest] = entries;
  return rest.reduce(
    (latest, entry) =>
      entry.endedAt.getTime() > latest.endedAt.getTime() ? entry : latest,
    first,
  );
}

export type CellWrite<Entry extends CellEntry> =
  /** La celda ya muestra el valor pedido: no se escribe nada (TS-36, TS-37). */
  | { readonly kind: "unchanged" }
  /** Celda vacía: una entrada nueva (TS-29, TS-31). */
  | { readonly kind: "create"; readonly startedAt: Date; readonly endedAt: Date }
  /** Una entrada, o bajar con varias: el fin nuevo de `target` (TS-33, TS-34). */
  | { readonly kind: "setEnd"; readonly target: Entry; readonly endedAt: Date }
  /** Subir con varias: una entrada nueva que copia los campos de `source` (TS-34). */
  | {
      readonly kind: "append";
      readonly source: Entry;
      readonly startedAt: Date;
      readonly endedAt: Date;
    }
  | {
      readonly kind: "rejected";
      readonly reason:
        /** TS-34, TS-119: la entrada nueva empezaría en otro día. */
        | "appendOtherDay"
        /** TS-34, D13-4: la que empieza más tarde quedaría con menos de un minuto. */
        | "trimTooShort"
        /** ADR 0018: desde las 09:00 no existió ningún minuto ese día. */
        | "noStartThatDay"
        /** Un extremo caería después del año 9999 en UTC. */
        | "afterYear9999";
    };

const AFTER_YEAR_9999 = { kind: "rejected", reason: "afterYear9999" } as const;

/** El instante `minutes` minutos después: las sumas son sobre el instante (ADR 0018). */
function plusMinutes(instant: Date, minutes: number): Date {
  return new Date(instant.getTime() + minutes * MINUTE_MS);
}

/**
 * «Dejar la celda en `minutes`» (ADR 0018), con las entradas cerradas de la
 * celda leídas bajo bloqueo. `cell.date` es el día de la columna y
 * `cell.timeZone` la zona de la persona.
 */
export function cellWrite<Entry extends CellEntry>(
  cell: { readonly date: string; readonly timeZone: string },
  entries: readonly Entry[],
  minutes: number,
): CellWrite<Entry> {
  const [first, ...rest] = entries;
  if (first === undefined) {
    const startedAt = instantFromLocalOrLater(cell.date, EMPTY_CELL_START, cell.timeZone);
    if (startedAt === null) {
      return { kind: "rejected", reason: "noStartThatDay" };
    }
    const endedAt = plusMinutes(startedAt, minutes);
    return isAfterYear9999(endedAt)
      ? AFTER_YEAR_9999
      : { kind: "create", startedAt, endedAt };
  }
  const all: readonly [Entry, ...Entry[]] = [first, ...rest];
  const shown = cellMinutes(all);
  if (shown === minutes) {
    return { kind: "unchanged" };
  }
  if (rest.length === 0) {
    const endedAt = plusMinutes(first.startedAt, minutes);
    return isAfterYear9999(endedAt)
      ? AFTER_YEAR_9999
      : { kind: "setEnd", target: first, endedAt };
  }
  if (minutes > shown) {
    const base = latestEnding(all);
    if (dayKey(base.endedAt, cell.timeZone) !== cell.date) {
      return { kind: "rejected", reason: "appendOtherDay" };
    }
    const endedAt = plusMinutes(base.endedAt, minutes - shown);
    return isAfterYear9999(endedAt)
      ? AFTER_YEAR_9999
      : { kind: "append", source: latestStarting(all), startedAt: base.endedAt, endedAt };
  }
  const target = latestStarting(all);
  const endedAt = plusMinutes(target.endedAt, minutes - shown);
  if (endedAt.getTime() - target.startedAt.getTime() < MINUTE_MS) {
    return { kind: "rejected", reason: "trimTooShort" };
  }
  return { kind: "setEnd", target, endedAt };
}
