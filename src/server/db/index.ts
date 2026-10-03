import { Pool as NeonPool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool as NodePool } from "pg";

import { env } from "@/server/env";

import * as schema from "./schema";

/**
 * En Vercel se habla con Neon por WebSocket, que soporta transacciones y no
 * mantiene conexiones abiertas entre invocaciones. En local y en los tests de
 * integración la base es un Postgres común, que ese driver no entiende: se
 * elige por el host de la cadena de conexión.
 */
function createDatabase() {
  const connectionString = env().DATABASE_URL;
  if (connectionString.includes(".neon.tech")) {
    return drizzleNeon({ client: new NeonPool({ connectionString }), schema });
  }
  return drizzleNode({ client: new NodePool({ connectionString }), schema });
}

export const db = createDatabase();

export type Database = ReturnType<typeof createDatabase>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
