import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { testDatabaseUrl } from "./database-url";

/**
 * Aplica las migraciones una sola vez por tanda. Si la base no responde, el
 * mensaje dice cómo levantarla en vez de fallar con un error de socket.
 */
export async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: testDatabaseUrl });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } catch (cause) {
    throw new Error(
      `No se pudo preparar la base de pruebas en ${testDatabaseUrl}. ` +
        "Levantala con: docker run -d --name clock-pg -e POSTGRES_PASSWORD=clock " +
        "-e POSTGRES_USER=clock -e POSTGRES_DB=clock -p 5432:5432 postgres:17-alpine " +
        "y creá la base clock_test.",
      { cause },
    );
  } finally {
    await pool.end();
  }
}
