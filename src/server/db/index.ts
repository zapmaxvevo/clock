import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";

import { env } from "@/server/env";

import * as schema from "./schema";

/**
 * Pool contra la cadena de conexión con pooling de Neon. El driver habla por
 * WebSocket y soporta transacciones, que el recorrido de toda mutación usa.
 */
const pool = new Pool({ connectionString: env().DATABASE_URL });

export const db = drizzle({ client: pool, schema });

export type Database = typeof db;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
