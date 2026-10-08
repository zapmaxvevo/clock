/**
 * Acceso directo a la base de los e2e, solo para lo que la interfaz no puede
 * producir. Es código de prueba: no pasa por el servidor ni agrega ninguna
 * ruta a la aplicación.
 */
import { Client } from "pg";

import { TEST_EMAIL_DOMAIN, testDatabaseUrl } from "./environment";

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
 * El workspace de los e2e lo crea la primera sesión, así que en una base nueva
 * es de hoy, como el de producción el primer día de uso. Una base que se
 * reusa entre corridas tiene uno viejo: esto le pone la creación en este
 * momento, para que toda corrida pruebe lo mismo. El piso de fechas no depende
 * de la creación, y los recorridos que cargan días anteriores a hoy lo
 * afirman con un workspace recién creado.
 *
 * Escribe directo en la base que le pasen, así que antes comprueba que es una
 * base de los e2e: el owner del workspace tiene que ser el que la
 * configuración de prueba le da al servidor. Si la cadena de conexión apuntara
 * a otra base, se corta sin tocarla y sin nombrar al owner que encontró. Y si
 * al renovarlo dejara de ser el primero, que es el que lee la aplicación, se
 * corta sin dejar nada.
 */
export async function renewWorkspace(): Promise<void> {
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
      throw new Error("No hay ningún workspace que renovar.");
    }
    if (workspace.email !== expectedOwner) {
      throw new Error(
        `El owner del workspace no es ${expectedOwner}: la base no es la de los e2e y no se renueva.`,
      );
    }
    await client.query("begin");
    try {
      await client.query("update workspace set created_at = now() where id = $1", [
        workspace.id,
      ]);
      const first = await client.query<{ id: string }>(`select ${FIRST_WORKSPACE} as id`);
      if (first.rows.at(0)?.id !== workspace.id) {
        throw new Error("Renovado, el workspace de los e2e dejaría de ser el primero.");
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/** Cuándo se creó el workspace de los e2e, para afirmar que no está atrasado. */
export async function workspaceCreatedAt(): Promise<Date> {
  return withDatabase(async (client) => {
    const result = await client.query<{ created_at: Date }>(
      `select created_at from workspace where id = ${FIRST_WORKSPACE}`,
    );
    const row = result.rows.at(0);
    if (row === undefined) {
      throw new Error("No hay ningún workspace del que leer la creación.");
    }
    return row.created_at;
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

/**
 * Cambia una fila y comprueba que cambió exactamente una. Los nombres que
 * reciben estas funciones llevan el sufijo único del recorrido, así que otra
 * cantidad es un error del test, no algo que se pueda dejar pasar.
 */
async function updateOne(sql: string, values: readonly string[]): Promise<void> {
  await withDatabase(async (client) => {
    const result = await client.query(sql, [...values]);
    if (result.rowCount !== 1) {
      throw new Error(`Se esperaba cambiar una fila y cambiaron ${result.rowCount}.`);
    }
  });
}

/**
 * Archiva un proyecto del workspace de los e2e por su nombre. La fase 1 no
 * tiene pantalla para archivar: es el estado que deja otra persona mientras
 * el recorrido tiene un diálogo abierto.
 */
export async function archiveProject(name: string): Promise<void> {
  await updateOne(
    `update project
        set archived_at = now()
      where workspace_id = ${FIRST_WORKSPACE}
        and name = $1`,
    [name],
  );
}

/**
 * Archiva una etiqueta del workspace de los e2e por su nombre. La fase 1 no
 * tiene pantalla para archivarla (PR-45): es el estado que deja otra persona
 * mientras la entrada la tiene o la barra la tiene elegida.
 */
export async function archiveTag(name: string): Promise<void> {
  await updateOne(
    `update tag
        set archived_at = now()
      where workspace_id = ${FIRST_WORKSPACE}
        and name = $1`,
    [name],
  );
}

/**
 * Le quita a una persona la marca de responsable de un proyecto, que en la
 * fase 1 tampoco tiene pantalla. Sigue siendo miembro, y el proyecto, público.
 */
export async function revokeProjectManager(email: string, name: string): Promise<void> {
  await updateOne(
    `update project_member
        set is_manager = false
      where workspace_id = ${FIRST_WORKSPACE}
        and project_id = (select id from project
                           where workspace_id = ${FIRST_WORKSPACE}
                             and name = $2)
        and user_id = (select id from "user" where email = $1)`,
    [email, name],
  );
}

/**
 * Inserta una fila que devuelve su `id` y comprueba que se insertó
 * exactamente una: como en `updateOne`, otra cantidad es un error del test.
 */
async function insertOneRow(
  client: Client,
  sql: string,
  values: readonly unknown[],
): Promise<string> {
  const result = await client.query<{ id: string }>(sql, [...values]);
  const row = result.rows.at(0);
  if (result.rowCount !== 1 || row === undefined) {
    throw new Error(`Se esperaba insertar una fila e insertaron ${result.rowCount}.`);
  }
  return row.id;
}

/** Lo que siembra `seedProject`. Los nombres llevan el sufijo del recorrido. */
export type SeedProject = {
  readonly name: string;
  /** Un cliente nuevo con ese nombre, o «Sin cliente» si falta. */
  readonly client?: string;
  /** Una clave de la paleta; la base rechaza cualquier otra. */
  readonly color?: string;
  /** La fase 1 crea todo público (P-17): privado es lo que solo se siembra. */
  readonly isPublic?: boolean;
  /** PR-21: con qué facturable arrancan sus entradas nuevas; `false` si falta. */
  readonly billableByDefault?: boolean;
  /** Tareas activas del proyecto. */
  readonly tasks?: readonly string[];
  /**
   * Emails de quienes son miembros del proyecto. Cada persona tiene que haber
   * entrado antes a la aplicación, que es lo que le crea la membresía.
   */
  readonly members?: readonly string[];
};

/**
 * Siembra un proyecto en el workspace de los e2e, con su cliente, sus tareas
 * y sus miembros, en una transacción. Es lo que la fase 1 no puede producir
 * por la interfaz: un proyecto privado, o uno con miembros que no son quien
 * lo creó. Cada fila tiene que insertarse exactamente una vez; si una persona
 * no tiene membresía, se corta sin dejar nada.
 */
export async function seedProject(project: SeedProject): Promise<void> {
  await withDatabase(async (client) => {
    const insertOne = (sql: string, values: readonly unknown[]) =>
      insertOneRow(client, sql, values);

    await client.query("begin");
    try {
      const clientId =
        project.client === undefined
          ? null
          : await insertOne(
              `insert into client (workspace_id, name)
               values (${FIRST_WORKSPACE}, $1)
               returning id`,
              [project.client],
            );
      const projectId = await insertOne(
        `insert into project (workspace_id, client_id, name, color, is_public, billable_by_default)
         values (${FIRST_WORKSPACE}, $1, $2, $3, $4, $5)
         returning id`,
        [
          clientId,
          project.name,
          project.color ?? "blue",
          project.isPublic ?? true,
          project.billableByDefault ?? false,
        ],
      );
      for (const task of project.tasks ?? []) {
        await insertOne(
          `insert into task (workspace_id, project_id, name)
           values (${FIRST_WORKSPACE}, $1, $2)
           returning id`,
          [projectId, task],
        );
      }
      for (const email of project.members ?? []) {
        await insertOne(
          `insert into project_member (workspace_id, project_id, user_id)
           select membership.workspace_id, $1, membership.user_id
             from membership
             join "user" on "user".id = membership.user_id
            where membership.workspace_id = ${FIRST_WORKSPACE}
              and "user".email = $2
           returning project_id as id`,
          [projectId, email],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/**
 * Siembra una etiqueta activa en el workspace de los e2e. El nombre lleva el
 * sufijo del recorrido. Es más corto que crearla en `/proyectos`, y la
 * pantalla que la usa la lee al cargar, así que se siembra antes de entrar.
 */
export async function seedTag(name: string): Promise<void> {
  await withDatabase(async (client) => {
    await insertOneRow(
      client,
      `insert into tag (workspace_id, name)
       values (${FIRST_WORKSPACE}, $1)
       returning id`,
      [name],
    );
  });
}

/**
 * Marca una tarea como hecha. La fase 1 no tiene pantalla para eso: es el
 * estado que deja otra persona.
 */
export async function markTaskDone(projectName: string, taskName: string): Promise<void> {
  await updateOne(
    `update task
        set status = 'done'
      where workspace_id = ${FIRST_WORKSPACE}
        and project_id = (select id from project
                           where workspace_id = ${FIRST_WORKSPACE}
                             and name = $1)
        and name = $2`,
    [projectName, taskName],
  );
}

/** Lo que siembra `seedEntries`: una entrada terminada de un proyecto. */
export type SeedEntry = {
  readonly description: string;
  /** El día civil, como lo escribe la URL: «2026-09-30». */
  readonly day: string;
  /** Las horas en la zona `timeZone` de `seedEntries`: «10:00». */
  readonly start: string;
  readonly end: string;
  /** El nombre del proyecto, con el sufijo del recorrido. */
  readonly project: string;
};

/**
 * Siembra entradas terminadas de una persona, en una transacción. Es más
 * corto y más estable que cargarlas desde la barra manual cuando lo que se
 * prueba es otra pantalla que las lee. Las horas se leen en `timeZone`. La
 * persona tiene que haber entrado antes a la aplicación, que es lo que le
 * crea la membresía; si no, o si el proyecto no existe, se corta sin dejar
 * nada.
 */
export async function seedEntries(
  email: string,
  timeZone: string,
  entries: readonly SeedEntry[],
): Promise<void> {
  await withDatabase(async (client) => {
    await client.query("begin");
    try {
      for (const entry of entries) {
        await insertOneRow(
          client,
          `insert into time_entry (workspace_id, user_id, description, started_at, ended_at, project_id)
           select membership.workspace_id, membership.user_id, $2,
                  ($3::date + $4::time) at time zone $6,
                  ($3::date + $5::time) at time zone $6,
                  project.id
             from membership
             join "user" on "user".id = membership.user_id
             join project on project.workspace_id = membership.workspace_id
                         and project.name = $7
            where membership.workspace_id = ${FIRST_WORKSPACE}
              and "user".email = $1
           returning time_entry.id`,
          [
            email,
            entry.description,
            entry.day,
            entry.start,
            entry.end,
            timeZone,
            entry.project,
          ],
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}

/**
 * Copia `copies` veces la única entrada de una persona con esa descripción,
 * con sus mismos instantes, así que caen en su mismo día. Es lo que la
 * interfaz no puede producir en un tiempo razonable: más entradas que el tope
 * de las acciones en masa. Si la persona no tiene exactamente una entrada con
 * esa descripción, se corta sin dejar nada.
 */
export async function copyEntry(
  email: string,
  description: string,
  copies: number,
): Promise<void> {
  await withDatabase(async (client) => {
    await client.query("begin");
    try {
      const result = await client.query(
        `insert into time_entry (workspace_id, user_id, description, started_at, ended_at)
         select time_entry.workspace_id, time_entry.user_id, time_entry.description,
                time_entry.started_at, time_entry.ended_at
           from time_entry
           join "user" on "user".id = time_entry.user_id
          cross join generate_series(1, $3)
          where time_entry.workspace_id = ${FIRST_WORKSPACE}
            and "user".email = $1
            and time_entry.description = $2`,
        [email, description, copies],
      );
      if (result.rowCount !== copies) {
        throw new Error(
          `Se esperaba copiar ${copies} entradas y se copiaron ${result.rowCount}.`,
        );
      }
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
}
