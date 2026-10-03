import { sql, TransactionRollbackError } from "drizzle-orm";

import { db, type Transaction } from "@/server/db";

/** Tope de la espera de una barrera: pasado, el test falla en vez de colgarse. */
const BARRIER_TIMEOUT_MS = 10_000;

/**
 * Deja `size` conexiones del pool ya abiertas y autenticadas. No hace que las
 * sentencias se intercalen: lo único que consigue es que el handshake de una
 * conexión nueva no corra dentro de la ventana que se quiere medir, donde sería
 * más lento que la operación entera y dejaría todo en fila. La barrera suelta
 * las transacciones recién cuando todas llegaron, así que no hay espera fija.
 */
export async function warmPool(size: number): Promise<void> {
  let arrived = 0;
  let open = () => {};
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  await Promise.all(
    Array.from({ length: size }, () =>
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        arrived += 1;
        if (arrived === size) {
          open();
        }
        await gate;
      }),
    ),
  );
}

/**
 * Sesiones de esta base trabadas pidiendo un lock. El filtro por base es
 * necesario porque `pg_stat_activity` es del cluster entero y otra tanda de
 * tests en otra base dispararía la espera antes de tiempo.
 */
async function lockWaiters(): Promise<number> {
  const result = await db.execute(sql`
    select count(*)::int as n
    from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `);
  return (result.rows[0] as { n: number }).n;
}

/**
 * Espera, sin dormir, a que haya `count` sesiones de esta base trabadas pidiendo
 * un lock. Es la señal de que la carrera que se quiere medir está realmente
 * superpuesta y no corriendo en fila. Pasado el tope lanza; con `signal`
 * abortado deja de consultar sin error, porque la carrera ya se resolvió por
 * otro lado.
 */
export async function waitForBlockedBackends({
  count,
  signal,
}: {
  readonly count: number;
  readonly signal?: AbortSignal;
}): Promise<void> {
  const deadline = Date.now() + BARRIER_TIMEOUT_MS;
  while (signal?.aborted !== true && (await lockWaiters()) < count) {
    if (Date.now() > deadline) {
      throw new Error(`No hubo ${count} sesiones esperando un lock a tiempo.`);
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/**
 * Una tercera conexión que toma un bloqueo con `hold` y lo sostiene hasta
 * `release`; ahí lo suelta con `rollback`, para que lo que haya escrito no
 * quede. `held` resuelve cuando el bloqueo está tomado.
 */
async function holdBarrier(hold: (tx: Transaction) => Promise<unknown>) {
  let holding = () => {};
  const held = new Promise<void>((resolve) => {
    holding = resolve;
  });
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const barrier = db
    .transaction(async (tx) => {
      await hold(tx);
      holding();
      await released;
      tx.rollback();
    })
    .catch((error: unknown) => {
      if (!(error instanceof TransactionRollbackError)) {
        throw error;
      }
    });
  await Promise.race([held, barrier]);
  return {
    async open(): Promise<void> {
      release();
      await barrier;
    },
  };
}

/**
 * Un corredor que termina mientras la barrera sostiene el bloqueo no se trabó:
 * la espera se corta ahí, con su error o con este.
 */
function finishedEarly(racer: Promise<unknown>): Promise<never> {
  return racer.then(() => {
    throw new Error("Un corredor terminó sin trabarse en la barrera.");
  });
}

/**
 * Obliga a las operaciones a cruzarse en la base. La barrera sostiene el
 * bloqueo de `hold` hasta que hay una sesión trabada por cada operación; recién
 * ahí lo suelta. Sin ella, `Promise.all` casi nunca cruza las transacciones y
 * el resultado dependería del azar.
 */
export async function raceThroughBarrier<T>(
  hold: (tx: Transaction) => Promise<unknown>,
  racers: readonly (() => Promise<T>)[],
): Promise<T[]> {
  const barrier = await holdBarrier(hold);
  const running = racers.map((racer) => racer());
  const settled = Promise.allSettled(running);
  const waiting = new AbortController();
  try {
    await Promise.race([
      waitForBlockedBackends({ count: racers.length, signal: waiting.signal }),
      finishedEarly(Promise.race(running)),
    ]);
  } finally {
    waiting.abort();
    await barrier.open();
    await settled;
  }
  return Promise.all(running);
}

/**
 * Como `raceThroughBarrier`, pero los corredores entran a la cola del bloqueo
 * de a uno: cada uno arranca recién cuando el anterior ya está trabado. Postgres
 * le da la fila a quien la pidió primero, así que el orden de la cola es el de
 * la lista.
 */
export async function queueBehindBarrier(
  hold: (tx: Transaction) => Promise<unknown>,
  racers: readonly (() => Promise<unknown>)[],
): Promise<PromiseSettledResult<unknown>[]> {
  const barrier = await holdBarrier(hold);
  const running: Promise<unknown>[] = [];
  const waiting = new AbortController();
  try {
    for (const racer of racers) {
      const current = racer();
      running.push(current);
      await Promise.race([
        waitForBlockedBackends({ count: running.length, signal: waiting.signal }),
        finishedEarly(current),
      ]);
    }
  } finally {
    waiting.abort();
    await barrier.open();
    await Promise.allSettled(running);
  }
  return Promise.allSettled(running);
}
