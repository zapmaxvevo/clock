/**
 * Acceso directo a la base de los e2e, solo para lo que la interfaz no puede
 * producir. Es código de prueba: no pasa por el servidor ni agrega ninguna
 * ruta a la aplicación.
 */
import { Client } from "pg";

import { TEST_EMAIL_DOMAIN, testDatabaseUrl } from "./environment";

/**
 * Días hacia atrás que cubre el piso del workspace de los e2e. Un recorrido
 * que necesite cargar horas viejas puede elegir cualquier fecha dentro de este
 * tramo, sin importar cuándo se creó la base.
 */
export const WORKSPACE_HISTORY_DAYS = 90;

/**
 * El workspace que lee la aplicación: el más viejo, con el mismo desempate
 * que `findFirstWorkspace`.
 */
const FIRST_WORKSPACE = "(select id from workspace order by created_at, id limit 1)";

async function withDatabase<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/**
 * El workspace de los e2e lo crea la primera sesión, así que su piso es el día
 * de la corrida y ninguna fecha anterior se puede cargar. Esto lo atrasa
 * `WORKSPACE_HISTORY_DAYS`. Nunca lo adelanta, así que repetirlo no cambia
 * nada, y el workspace elegido es el mismo que lee la aplicación, que al
 * atrasarse sigue siendo el primero.
 *
 * Escribe directo en la base que le pasen, así que antes comprueba que es una
 * base de los e2e: el owner del workspace tiene que ser el que la
 * configuración de prueba le da al servidor. Si la cadena de conexión apuntara
 * a otra base, se corta sin tocarla y sin nombrar al owner que encontró.
 */
export async function backdateWorkspace(): Promise<void> {
  const expectedOwner = `owner@${TEST_EMAIL_DOMAIN}`;
  await withDatabase(async (client) => {
    const found = await client.query<{ id: string; email: string }>(
      `select workspace.id, "user".email
         from workspace
         join "user" on "user".id = workspace.owner_id
        where workspace.id = ${FIRST_WORKSPACE}`,
    );
    const workspace = found.rows.at(0);
    if (workspace === undefined) {
      throw new Error("No hay ningún workspace que atrasar.");
    }
    if (workspace.email !== expectedOwner) {
      throw new Error(
        `El owner del workspace no es ${expectedOwner}: la base no es la de los e2e y no se atrasa.`,
      );
    }
    await client.query(
      `update workspace
          set created_at = least(created_at, now() - make_interval(days => $1))
        where id = $2`,
      [WORKSPACE_HISTORY_DAYS, workspace.id],
    );
  });
}

/** Zona horaria del workspace, que fija qué día es hoy para la pantalla. */
export async function workspaceTimeZone(): Promise<string> {
  return withDatabase(async (client) => {
    const result = await client.query<{ timezone: string }>(
      `select timezone from workspace where id = ${FIRST_WORKSPACE}`,
    );
    const row = result.rows.at(0);
    if (row === undefined) {
      throw new Error("No hay ningún workspace del que leer la zona horaria.");
    }
    return row.timezone;
  });
}
