import { sql } from "drizzle-orm";

import { db } from "@/server/db";

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
 * Espera, sin dormir, a que alguna conexión de esta base esté trabada pidiendo
 * un lock. Es la señal de que la carrera que se quiere medir está realmente
 * superpuesta y no corriendo en fila. El filtro por base es necesario porque
 * `pg_locks` es del cluster entero y otra tanda de tests en otra base dispararía
 * la espera antes de tiempo.
 */
export async function waitForBlockedBackend(): Promise<void> {
  for (;;) {
    const blocked = await db.execute(sql`
      select count(*)::int as n
      from pg_locks lock
      join pg_stat_activity activity on activity.pid = lock.pid
      where not lock.granted and activity.datname = current_database()
    `);
    if ((blocked.rows[0] as { n: number }).n > 0) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}
