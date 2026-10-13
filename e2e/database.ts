/**
 * Acceso directo a la base de los e2e, solo para lo que la interfaz no puede
 * producir. Es código de prueba: no pasa por el servidor ni agrega ninguna
 * ruta a la aplicación.
 */
import { randomUUID } from "node:crypto";

import { Client } from "pg";

import { dayKeyOf, type CivilDay } from "./days";
import { TEST_EMAIL_DOMAIN, testDatabaseUrl } from "./environment";
import { PERSON_NAME } from "./session";

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
 * Corre `work` en una transacción propia: si algo lanza, se deshace entero y
 * no queda nada a medias.
 */
async function withTransaction<T>(work: (client: Client) => Promise<T>): Promise<T> {
  return withDatabase(async (client) => {
    await client.query("begin");
    try {
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  });
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
  await withTransaction(async (client) => {
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
    await client.query("update workspace set created_at = now() where id = $1", [
      workspace.id,
    ]);
    const first = await client.query<{ id: string }>(`select ${FIRST_WORKSPACE} as id`);
    if (first.rows.at(0)?.id !== workspace.id) {
      throw new Error("Renovado, el workspace de los e2e dejaría de ser el primero.");
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

/** `updateOneRow` con una conexión propia, fuera de toda transacción. */
async function updateOne(sql: string, values: readonly string[]): Promise<void> {
  await withDatabase((client) => updateOneRow(client, sql, values));
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
 * El id de una persona del workspace de los e2e por su email, tal como lo
 * guarda la base: el de la sesión lo genera Better Auth, con mayúsculas, y
 * el filtro de personas lo nombra así (D-R4-2, D-R4-13).
 */
export async function userIdOf(email: string): Promise<string> {
  return withDatabase((client) =>
    selectOneId(
      client,
      `select "user".id
         from "user"
         join membership on membership.user_id = "user".id
        where membership.workspace_id = ${FIRST_WORKSPACE}
          and "user".email = $1`,
      [email],
    ),
  );
}

/**
 * El id de un proyecto del workspace de los e2e por su nombre, como lo
 * escribe la URL del reporte (D-R4-2): el filtro de proyecto lo nombra por id.
 */
export async function projectIdOf(name: string): Promise<string> {
  return withDatabase((client) =>
    selectOneId(
      client,
      `select id from project where workspace_id = ${FIRST_WORKSPACE} and name = $1`,
      [name],
    ),
  );
}

/** El id de un cliente del workspace de los e2e por su nombre, como `projectIdOf`. */
export async function clientIdOf(name: string): Promise<string> {
  return withDatabase((client) =>
    selectOneId(
      client,
      `select id from client where workspace_id = ${FIRST_WORKSPACE} and name = $1`,
      [name],
    ),
  );
}

/**
 * Cambia una fila con `client` y comprueba que cambió exactamente una. Los
 * nombres que reciben estas funciones llevan el sufijo único del recorrido,
 * así que otra cantidad es un error del test, no algo que se pueda dejar
 * pasar.
 */
async function updateOneRow(
  client: Client,
  sql: string,
  values: readonly unknown[],
): Promise<void> {
  const result = await client.query(sql, [...values]);
  if (result.rowCount !== 1) {
    throw new Error(`Se esperaba cambiar una fila y cambiaron ${result.rowCount}.`);
  }
}

/**
 * Corre una sentencia que devuelve `id` y comprueba que devolvió exactamente
 * una fila: como en `updateOneRow`, otra cantidad es un error del test.
 * `verb` dice qué hacía la sentencia, para el mensaje.
 */
async function oneRowId(
  client: Client,
  sql: string,
  values: readonly unknown[],
  verb: "insertar" | "leer",
): Promise<string> {
  const result = await client.query<{ id: string }>(sql, [...values]);
  const row = result.rows.at(0);
  if (result.rows.length !== 1 || row === undefined) {
    throw new Error(`Se esperaba ${verb} una fila y fueron ${result.rows.length}.`);
  }
  return row.id;
}

/** Inserta una fila que devuelve su `id`, y exactamente una. */
async function insertOneRow(
  client: Client,
  sql: string,
  values: readonly unknown[],
): Promise<string> {
  return oneRowId(client, sql, values, "insertar");
}

/** Lee el `id` de una fila, y exactamente una. */
async function selectOneId(
  client: Client,
  sql: string,
  values: readonly unknown[],
): Promise<string> {
  return oneRowId(client, sql, values, "leer");
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
  await withTransaction(async (client) => {
    const insertOne = (sql: string, values: readonly unknown[]) =>
      insertOneRow(client, sql, values);

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

/** El rol de una membresía, como lo guarda `workspace_role`. */
export type WorkspaceRole =
  "owner" | "admin" | "project_manager" | "team_manager" | "member";

/** El estado de una membresía, como lo guarda `membership_status`. */
export type MembershipStatus = "active" | "inactive" | "invited";

/** Lo que siembra `seedPerson`. El nombre lleva el sufijo del recorrido. */
export type SeedPerson = {
  readonly email: string;
  /** El nombre editado (`user_preference.display_name`), el que muestra el reporte. */
  readonly displayName: string;
  /** El estado de su membresía; `active` si falta. */
  readonly status?: MembershipStatus;
};

/**
 * Siembra otra persona del workspace de los e2e, que nunca entra a la
 * aplicación: su cuenta, con el mismo nombre de Google que todas las de la
 * suite, su membresía `member` con el estado pedido y su nombre editado, en
 * una transacción. Es la que el reporte de un admin muestra junto a la del
 * recorrido (§8.3 del contrato de R2a).
 */
export async function seedPerson(person: SeedPerson): Promise<void> {
  await withTransaction(async (client) => {
    const userId = await insertOneRow(
      client,
      `insert into "user" (id, name, email, email_verified)
       values ($1, $2, $3, true)
       returning id`,
      [randomUUID(), PERSON_NAME, person.email],
    );
    await insertOneRow(
      client,
      `insert into membership (workspace_id, user_id, role, status)
       values (${FIRST_WORKSPACE}, $1, 'member', $2)
       returning id`,
      [userId, person.status ?? "active"],
    );
    await insertOneRow(
      client,
      `insert into user_preference (user_id, display_name)
       values ($1, $2)
       returning user_id as id`,
      [userId, person.displayName],
    );
  });
}

/**
 * Le pone a una persona su nombre editado, el que guarda `/perfil` (PF-07).
 * Es para la persona de la sesión, que el reporte nombra: su nombre de Google
 * es el de todas las de la suite.
 */
export async function setDisplayName(email: string, name: string): Promise<void> {
  await withDatabase(async (client) => {
    await insertOneRow(
      client,
      `insert into user_preference (user_id, display_name)
       select id, $2 from "user" where email = $1
       on conflict (user_id) do update
         set display_name = excluded.display_name, updated_at = now()
       returning user_id as id`,
      [email, name],
    );
  });
}

/**
 * La membresía de una persona en el workspace de los e2e, que no es la del
 * owner: el rol y el estado los cambia el recorrido sobre su propia persona,
 * nunca sobre el owner, que es de toda la suite (§8.3 del contrato de R2a).
 */
const OWN_MEMBERSHIP = `workspace_id = ${FIRST_WORKSPACE}
          and user_id = (select id from "user" where email = $1)
          and user_id <> (select owner_id from workspace where id = ${FIRST_WORKSPACE})`;

/**
 * Cambia el rol de una persona. La pantalla /equipo (R8) solo pasa entre member
 * y admin; esto prepara el estado del test.
 */
export async function setRole(email: string, role: WorkspaceRole): Promise<void> {
  await updateOne(
    `update membership
        set role = $2, updated_at = now()
      where ${OWN_MEMBERSHIP}`,
    [email, role],
  );
}

/** Cambia el estado de la membresía de una persona, que tampoco tiene pantalla. */
export async function setMembershipStatus(
  email: string,
  status: MembershipStatus,
): Promise<void> {
  await updateOne(
    `update membership
        set status = $2, updated_at = now()
      where ${OWN_MEMBERSHIP}`,
    [email, status],
  );
}

/**
 * Cambia el primer día de la semana de una persona, del domingo en cero al
 * sábado en seis (PF-16), como lo guarda `/perfil`. Como el rol, sobre su
 * propia membresía y nunca sobre la del owner (D-R10-14).
 */
export async function setWeekStart(email: string, weekStart: number): Promise<void> {
  await updateOne(
    `update membership
        set week_start = $2, updated_at = now()
      where ${OWN_MEMBERSHIP}`,
    [email, String(weekStart)],
  );
}

/**
 * Cambia desde cuándo existe la membresía de una persona (`created_at`), que
 * hoy es su primer ingreso: el reporte no la muestra sin horas en un período
 * que termina antes (D-R9-2). Como el rol, sobre su propia membresía o la de
 * una persona sembrada, nunca sobre la del owner.
 */
export async function setJoinedAt(email: string, instant: Date): Promise<void> {
  await updateOne(
    `update membership
        set created_at = $2, updated_at = now()
      where ${OWN_MEMBERSHIP}`,
    [email, instant.toISOString()],
  );
}

/**
 * Lo que siembra `seedEntries`: una entrada terminada, con proyecto o sin él,
 * con tarea o sin ella y con sus etiquetas.
 */
export type SeedEntry = {
  readonly description: string;
  /** El día civil, como lo escribe la URL: «2026-09-30». */
  readonly day: string;
  /** Las horas en la zona `timeZone` de `seedEntries`: «10:00». */
  readonly start: string;
  readonly end: string;
  /** El nombre del proyecto, con el sufijo del recorrido; sin él, la entrada va sin proyecto. */
  readonly project?: string;
  /** El nombre de una tarea de `project`; sin él, la entrada va sin tarea. */
  readonly task?: string;
  /** Nombres de etiquetas del workspace, activas o archivadas. */
  readonly tags?: readonly string[];
};

/**
 * Siembra entradas terminadas de una persona, en una transacción. Es más
 * corto y más estable que cargarlas desde la barra manual cuando lo que se
 * prueba es otra pantalla que las lee. Las horas se leen en `timeZone`. La
 * persona tiene que haber entrado antes a la aplicación, que es lo que le
 * crea la membresía, o haberse sembrado con `seedPerson`; si no, o si el
 * proyecto, la tarea en ese proyecto o alguna etiqueta no existe, se corta
 * sin dejar nada.
 */
export async function seedEntries(
  email: string,
  timeZone: string,
  entries: readonly SeedEntry[],
): Promise<void> {
  await withTransaction(async (client) => {
    for (const entry of entries) {
      const values = [
        email,
        entry.description,
        entry.day,
        entry.start,
        entry.end,
        timeZone,
      ];
      const entryId =
        entry.project === undefined
          ? await insertOneRow(
              client,
              `insert into time_entry (workspace_id, user_id, description, started_at, ended_at)
               select membership.workspace_id, membership.user_id, $2,
                      ($3::date + $4::time) at time zone $6,
                      ($3::date + $5::time) at time zone $6
                 from membership
                 join "user" on "user".id = membership.user_id
                where membership.workspace_id = ${FIRST_WORKSPACE}
                  and "user".email = $1
               returning time_entry.id`,
              values,
            )
          : await insertOneRow(
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
              [...values, entry.project],
            );
      // La tarea se busca en el proyecto de la entrada: sin proyecto, o con
      // una tarea de otro, no cambia ninguna fila.
      if (entry.task !== undefined) {
        await updateOneRow(
          client,
          `update time_entry
              set task_id = task.id
             from task
            where time_entry.id = $1
              and task.workspace_id = time_entry.workspace_id
              and task.project_id = time_entry.project_id
              and task.name = $2`,
          [entryId, entry.task],
        );
      }
      for (const tag of entry.tags ?? []) {
        await insertOneRow(
          client,
          `insert into time_entry_tag (workspace_id, time_entry_id, tag_id)
           select time_entry.workspace_id, time_entry.id, tag.id
             from time_entry
             join tag on tag.workspace_id = time_entry.workspace_id
                     and tag.name = $2
            where time_entry.id = $1
           returning tag_id as id`,
          [entryId, tag],
        );
      }
    }
  });
}

/**
 * `seedEntries` con el día como `CivilDay`, que es como lo calculan los
 * recorridos: las horas se leen en `timeZone`, la de la persona.
 */
export async function seedPersonEntries(
  email: string,
  timeZone: string,
  entries: readonly (Omit<SeedEntry, "day"> & { readonly day: CivilDay })[],
): Promise<void> {
  await seedEntries(
    email,
    timeZone,
    entries.map((entry) => ({ ...entry, day: dayKeyOf(entry.day) })),
  );
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
  await withTransaction(async (client) => {
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
  });
}

/** Lo que siembra `seedNumberedEntries`. */
export type NumberedEntries = {
  /** El día civil de todas, en la zona `timeZone`. */
  readonly day: CivilDay;
  /** La hora en que empiezan todas: «09:00». */
  readonly start: string;
  readonly count: number;
  /** El sufijo del recorrido, al final de cada descripción. */
  readonly suffix: string;
};

/**
 * Siembra `count` entradas de un minuto de una persona, sin proyecto, todas
 * desde la misma hora, con la descripción «Entrada {n} {suffix}»: una
 * descripción distinta por entrada, así que un reporte por descripción tiene
 * `count` grupos. Es lo que la interfaz no puede producir en un tiempo
 * razonable: más grupos que el tope del primer nivel (D-R10-14). Un solo
 * `insert` en una transacción; si la persona no tiene membresía, no inserta
 * ninguna y se corta sin dejar nada.
 */
export async function seedNumberedEntries(
  email: string,
  timeZone: string,
  entries: NumberedEntries,
): Promise<void> {
  await withTransaction(async (client) => {
    const result = await client.query(
      `insert into time_entry (workspace_id, user_id, description, started_at, ended_at)
       select membership.workspace_id, membership.user_id,
              'Entrada ' || number || ' ' || $5,
              ($2::date + $3::time) at time zone $4,
              ($2::date + $3::time + interval '1 minute') at time zone $4
         from membership
         join "user" on "user".id = membership.user_id
        cross join generate_series(1, $6::int) as number
        where membership.workspace_id = ${FIRST_WORKSPACE}
          and "user".email = $1`,
      [
        email,
        dayKeyOf(entries.day),
        entries.start,
        timeZone,
        entries.suffix,
        entries.count,
      ],
    );
    if (result.rowCount !== entries.count) {
      throw new Error(
        `Se esperaba sembrar ${entries.count} entradas y se sembraron ${result.rowCount}.`,
      );
    }
  });
}
