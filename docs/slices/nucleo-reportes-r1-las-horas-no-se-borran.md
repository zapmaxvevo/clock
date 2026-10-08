# Núcleo de reportes, R1: las horas no se borran con la persona

Contrato del primer slice del núcleo de reportes. Es un paso de esquema sin
pantalla: dos migraciones, un cambio en `src/server/db/schema.ts`, sus tests y
la corrección de tres archivos de test que siembran horas sin membresía. No
toca código de ningún módulo.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`, RP-65 (P-09:
  a una persona con horas no se la borra, solo se desactiva), y la
  precondición de RP-60 y RP-61 (las horas de una persona inactiva siguen en
  los reportes).
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), R1. No
  depende de nada y puede salir ya. R2a no se despliega sin lo que deja este
  slice.
- **Revisión del contrato:** aprobado en la ronda 2 de `architecture-reviewer`
  ([`correcciones-nucleo-reportes-r1.md`](correcciones-nucleo-reportes-r1.md)).
- **Decisiones de arquitectura asociadas:**
  [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md), condición
  cuarta y sus consecuencias, aceptado por el usuario el 2026-10-08. Este
  contrato no abre ningún ADR nuevo.

Decisiones que el contrato da por tomadas (ADR 0020, mapa §5): las dos claves
en `restrict`; las membresías que falten se crean inactivas, con su
constancia; la clave compuesta se crea validada, sin variante `not valid`; la
consulta previa en producción es informativa; la reversión es una migración
nueva hacia adelante.

## Decisiones del contrato

| ID    | Decisión                                                    | Opciones                                                                                                                                            | Lo decidido y por qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-D1 | **Cuántas migraciones.**                                    | (1) Una generada, editada a mano para meter el relleno antes de las claves. (2) Una `--custom` con el relleno y después la generada con las claves. | **(2)**, como la 0003/0004 del 9 y la 0011/0012 del 11. La generada queda como la escribe `drizzle-kit` y el próximo `db:generate` no ve diferencias. El relleno es una sola sentencia en un archivo propio, que el test lee del diario como lee la del 9 (`project/schema.integration.test.ts:485-508`). La custom va **antes**: la clave se valida al crearse y necesita las membresías ya insertadas.                                                                                                                                                                                                                                                       |
| R1-D2 | **Quién crea las membresías que faltan.**                   | (1) La migración, en todos los entornos. (2) Un paso manual del usuario antes de desplegar.                                                         | **(1).** Con (2), una base que alguien olvide —un preview, la de e2e, una local— hace fallar la migración. La consulta del usuario (§2.3) pasa a ser informativa: dice a quién va a dejar afuera, no es una condición.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R1-D3 | **Qué membresía recibe cada par y qué constancia deja.**    | Todas `member`/`inactive`, o distinguir al owner del workspace; con o sin fila en `audit_log`.                                                      | **El owner del workspace recibe `owner`/`active`; el resto, `member`/`inactive`** (M1). Dejar afuera al owner de su propio workspace no es lo que pide P-09, y `ensureWorkspaceContext` le habría creado igual una membresía `owner` al entrar (`workspace/service.ts:63-69`). **Una fila de `audit_log` por membresía**, en la misma sentencia que la inserta: `action = 'membership.backfill'`, `entity = 'membership'`, `entity_id` = el id de la membresía, `actor_id` nulo, `next_value` = `{"userId","role","status"}` con lo que se insertó. Es lo que la reversión (§4) usa para encontrarlas, y lo que deja ver después quién quedó afuera y por qué. |
| R1-D4 | **La acción de borrado de la clave compuesta.**             | `restrict`, `no action`, `no action deferrable initially deferred`.                                                                                 | **`restrict`**, como dice el ADR 0020. La revisión lo comprobó (m1): con `restrict`, borrar el workspace con horas funciona en los dos órdenes en que pueden correr las cascadas hacia `membership` y hacia `time_entry`. No hay migración condicional; el criterio 5 queda como regresión.                                                                                                                                                                                                                                                                                                                                                                    |
| R1-D5 | **Un índice para la comprobación de la clave del usuario.** | Sumar `time_entry (user_id)` o no.                                                                                                                  | **No.** Borrar un usuario es raro y no tiene camino en la aplicación; hoy la cascada ya hace la misma búsqueda sin índice. La compuesta usa `time_entry_workspace_user_started_idx`, que empieza por sus dos columnas.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R1-D6 | **El comentario de `who_sees_all_entries`.**                | En R1 o en R2a.                                                                                                                                     | **En R1**, porque es el slice que toca `schema.ts`. Es solo documentación: no cambia la columna (ADR 0020, condición tercera).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## 0. Precondición de arranque

- **`main` en `4b9bb74`.** Las citas de abajo son de ese árbol. El slice 13 se
  mergea en breve y no toca `drizzle/` ni `src/server/db/`; si entra antes que
  R1, las citas de esas dos carpetas no cambian, pero las líneas de
  `time-entry/actions.integration.test.ts` y `service.integration.test.ts`
  pueden correrse: los cambios de §5 son los mismos, sobre los tests que
  nombran. Si algo más entra en `main` antes del arranque y toca esas carpetas
  o `src/test/`, una ronda corta de `architecture-reviewer` contra el árbol.
- **La última migración es la 0012** (`drizzle/meta/_journal.json:89-95`). Las
  de R1 son la **0013** y la **0014**. Si otro trabajo genera una migración
  antes del merge, la de R1 que entre segunda se regenera sobre la otra, y los
  nombres de §2 se conservan.
- **Postgres 15 o posterior** en Neon, ya exigido desde el slice 9.

### Supuestos sobre el árbol, con archivo y línea en `4b9bb74`

| Supuesto                                                                                                                                                                                                                      | Dónde                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `time_entry.user_id` → `user.id` con `onDelete: "cascade"`                                                                                                                                                                    | `src/server/db/schema.ts:405-407`                                                                      |
| La clave se llama `time_entry_user_id_user_id_fk`, con `ON DELETE cascade`                                                                                                                                                    | `drizzle/0001_time_entry.sql:15`                                                                       |
| `time_entry` no tiene clave hacia `membership`; tiene `time_entry_workspace_user_started_idx (workspace_id, user_id, started_at desc)`                                                                                        | `schema.ts:425-469`; el índice en `:430-434`                                                           |
| `membership` tiene `membership_workspace_user_unq (workspace_id, user_id)`, destino posible de una clave compuesta, y se declara antes que `time_entry`                                                                       | `schema.ts:92-118`; la única en `:114`                                                                 |
| `membership.user_id` → `user` y `membership.workspace_id` → `workspace`, las dos con `cascade`; `time_entry.workspace_id` → `workspace` con `cascade`                                                                         | `schema.ts:96-101`, `:402-404`; `drizzle/0000_base.sql:117-118`; `0001_time_entry.sql:14`              |
| `workspace.owner_id` → `user` con `restrict`: el owner de un workspace no se puede borrar, tenga o no horas                                                                                                                   | `schema.ts:51-53`                                                                                      |
| `membership` tiene valores por omisión para `id`, `role`, `status`, `weekly_capacity_minutes`, `week_start` y las fechas                                                                                                      | `schema.ts:95-111`                                                                                     |
| Los tipos de la base son `workspace_role` y `membership_status`; un literal sin cast en un `select distinct` toma tipo `text` y la inserción falla con 42804 (B1)                                                             | `schema.ts:25-37`                                                                                      |
| `workspace_settings.who_sees_all_entries` arranca en `admins` y no tiene comentario; `whoCreatesProjects` sí lo tiene                                                                                                         | `schema.ts:67`, `:69-76`                                                                               |
| `audit_log` tiene `workspace_id` no nulo, `actor_id` nulable, `action`, `entity`, `entity_id` de texto y `next_value` de texto; `recordAudit` serializa con `JSON.stringify`                                                  | `schema.ts:582-601`; `src/server/audit.ts:14-36`                                                       |
| Lo que `drizzle-kit` no expresa va en una migración `--custom` aparte, que conserva los nombres para que `db:generate` no vea diferencias                                                                                     | `drizzle/0004_projects_set_null_backfill.sql:1-5`; `0012_tags_set_null.sql:1-5`                        |
| Precedente de test de una sentencia de relleno leída del diario y del archivo de la migración                                                                                                                                 | `src/modules/project/schema.integration.test.ts:485-520`                                               |
| `FOREIGN_KEY_VIOLATION`, `hasCode` y `constraintOf`                                                                                                                                                                           | `src/server/db/constraint-error.ts:6`, `:27-35`                                                        |
| La tanda de integración migra una vez con el migrador de `node-postgres`, corre los archivos de a uno y vacía las tablas con `truncate … cascade` antes de cada test                                                          | `src/test/global-setup.ts:11-26`; `vitest.integration.config.ts:16-17`; `src/test/database.ts:9-13`    |
| Fábricas: `seedWorkspace` crea la membresía del owner; `seedMember` crea usuario y membresía; `seedUser` crea solo el usuario; `seedTimeEntry` escribe directo. **Todas usan el `db` global**, no una transacción que reciban | `src/test/factories.ts:34-64`, `:107-135`                                                              |
| Los tests que hoy borran un usuario o una membresía lo hacen con personas sin entradas                                                                                                                                        | `profile/schema.integration.test.ts:139-148`; `project/schema.integration.test.ts:244-248`, `:624-628` |
| **Hay tests que siembran horas de alguien sin membresía en ese workspace** (B2), y con la clave compuesta fallan                                                                                                              | §0, «Los tests que la clave rompe»                                                                     |
| El test del diario del 11b exige que la lista termine en la 0012                                                                                                                                                              | `project/schema.integration.test.ts:548-559`                                                           |
| Ningún e2e borra usuarios ni membresías; `renewWorkspace` solo cambia `created_at`                                                                                                                                            | `e2e/database.ts:41-74`                                                                                |
| Better Auth no tiene `deleteUser` habilitado                                                                                                                                                                                  | `src/server/auth.ts` (no aparece)                                                                      |
| `ensureWorkspaceContext` devuelve la membresía que encuentra, con su estado, y solo crea una si no hay ninguna: `owner` si es el owner del workspace, `member` si no                                                          | `src/modules/workspace/service.ts:62-79`                                                               |
| `can()` niega todo a una membresía que no está activa                                                                                                                                                                         | `src/server/permissions/index.ts:173-175`                                                              |

### Los tests que la clave rompe

La revisión los encontró corriendo la integración con la 0014 aplicada (B2).
Se corrigen en la siembra, no en la clave, y solo una afirmación cambia:

| Archivo                                  | Qué siembra hoy                                                                                                                                                                                                                                                                                    | Corrección                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `time-entry/actions.integration.test.ts` | `signInOn` (`:112-138`) crea el workspace y el usuario de la sesión **sin membresía**: «la membresía la crea `ensureWorkspaceContext` al entrar». Los tests que siembran entradas propias antes de la primera action fallan (14 en la corrida de la revisión; 17 con los del service y el diario). | `signInOn` crea la membresía activa con rol `member` en el workspace sembrado, y su comentario lo dice. El comentario de TT-92 (`:1088`, «La primera action crea la membresía; recién ahí se le cambia el estado.») se ajusta: la membresía ya existe; la action previa puede quedar o salir, sin tocar ninguna afirmación. |
| `time-entry/service.integration.test.ts` | `:6515-6530` y `:6772-6779` siembran una entrada del actor en **otro** workspace, donde el actor no tiene membresía.                                                                                                                                                                               | Cada test siembra antes la membresía del actor en ese otro workspace (rol `member`).                                                                                                                                                                                                                                        |
| `project/schema.integration.test.ts`     | `:548-559` exige que las migraciones que siguen a la 0009 sean exactamente 0010, 0011 y 0012.                                                                                                                                                                                                      | Afirma que 0010, 0011 y 0012 siguen a la 0009, en ese orden, sin exigir que la lista termine ahí. Es la única afirmación que el slice cambia (criterio 11).                                                                                                                                                                 |

Si la corrida completa con la clave encuentra otro test que siembra horas sin
membresía, se corrige igual, en la siembra, y el informe de `backend-dev` lo
nombra.

## 1. Alcance

Entra:

- **Las membresías que faltan** (R1-D2, R1-D3): para cada par
  `(workspace_id, user_id)` de `time_entry` sin membresía, una membresía
  `member`/`inactive`, o `owner`/`active` si la persona es el owner del
  workspace, con su constancia.
- **`time_entry.user_id` → `user`, de `cascade` a `restrict`.** Borrar un
  usuario con horas falla en la base.
- **La clave compuesta `time_entry_membership_fk`**, `(workspace_id, user_id)`
  → `membership(workspace_id, user_id)`, `on delete restrict` (R1-D4),
  validada. Borrar una membresía con horas falla en la base, y una entrada no
  puede quedar en un workspace donde su persona no tiene membresía.
- **El comentario sobre `who_sees_all_entries`** (R1-D6).
- **La siembra de tres archivos de test** que cargaban horas sin membresía
  (§0).

Queda afuera:

- Desactivar a alguien desde la aplicación (RP-60, RP-63): fase 2, o el
  procedimiento de la decisión 2 del mapa (§5) si el usuario lo elige.
- El texto que vería una persona si un borrado choca con las claves: no hay
  ningún camino de la aplicación que borre usuarios ni membresías.
- Lo que ve una persona inactiva al entrar: es la conducta de hoy para
  `inactive`, que la fase 2 define.

Consecuencias sobre lo que ya existe:

- Una persona cuya membresía se borró a mano y que tiene horas queda con una
  membresía inactiva. Si vuelve a entrar, `ensureWorkspaceContext` la encuentra
  y no le crea una activa: queda sin acceso. Es lo buscado (ADR 0020). El
  owner del workspace es la excepción: queda activo.
- Insertar una entrada para alguien sin membresía en ese workspace falla. La
  aplicación no lo hace nunca —quien carga horas actúa con su membresía—; los
  tests lo hacían en tres archivos, que se corrigen en la siembra (§0).

## 2. Cambios de esquema

### 2.1 `0013_time_entry_people_backfill`, la custom

`npm run db:generate -- --custom --name=time_entry_people_backfill`, **antes**
de tocar `schema.ts`, para que su copia del snapshot sea la de hoy. Contenido:
un comentario que remite a este contrato y una sola sentencia.

```sql
-- Lo que drizzle-kit no puede expresar. Contrato de R1 del núcleo de reportes,
-- §2.1. Cada persona con horas en un workspace donde no tiene membresía recibe
-- una, con su constancia, antes de que la 0014 cree la clave compuesta
-- validada: inactiva, salvo el owner del workspace. ADR 0020, condición cuarta.
WITH "inserted" AS (
  INSERT INTO "membership" ("workspace_id", "user_id", "role", "status")
  SELECT "missing"."workspace_id", "missing"."user_id", "missing"."role", "missing"."status"
  FROM (
    SELECT DISTINCT
      "time_entry"."workspace_id",
      "time_entry"."user_id",
      CASE WHEN "workspace"."owner_id" = "time_entry"."user_id"
        THEN 'owner'::"workspace_role" ELSE 'member'::"workspace_role" END AS "role",
      CASE WHEN "workspace"."owner_id" = "time_entry"."user_id"
        THEN 'active'::"membership_status" ELSE 'inactive'::"membership_status" END AS "status"
    FROM "time_entry"
    INNER JOIN "workspace" ON "workspace"."id" = "time_entry"."workspace_id"
    WHERE NOT EXISTS (
      SELECT 1 FROM "membership"
      WHERE "membership"."workspace_id" = "time_entry"."workspace_id"
        AND "membership"."user_id" = "time_entry"."user_id"
    )
  ) AS "missing"
  ON CONFLICT ("workspace_id", "user_id") DO NOTHING
  RETURNING "id", "workspace_id", "user_id", "role", "status"
)
INSERT INTO "audit_log" ("workspace_id", "actor_id", "action", "entity", "entity_id", "next_value")
SELECT "workspace_id", NULL, 'membership.backfill', 'membership', "id"::text,
  json_build_object('userId', "user_id", 'role', "role", 'status', "status")::text
FROM "inserted";
```

- Una sola sentencia: el test la ejecuta tal cual, leída del archivo.
- **Los literales llevan el cast a su tipo** (B1): sin él, el
  `select distinct` les da tipo `text` y la inserción falla con 42804 en
  cualquier base, también en una sin huérfanos.
- **El `join` con `workspace` va dentro de la subconsulta**, para que el
  `ON CONFLICT` no quede después de una condición de `join` en la sentencia
  exterior.
- `ON CONFLICT … DO NOTHING` además del `NOT EXISTS`: una membresía creada por
  un ingreso concurrente entre las dos no hace fallar la migración ni se toca.
  No tiene test: el `NOT EXISTS` filtra antes y en una sola conexión la
  carrera no se produce (m2, §6).
- No cambia ninguna membresía existente: ni el rol, ni el estado, ni
  `updated_at`.
- Una base sin entradas huérfanas —todas las de hoy, salvo que alguien haya
  borrado membresías a mano— no inserta nada.
- `next_value` sale de `json_build_object`, que escribe con espacios después
  de `:` y `,`; `recordAudit` no los escribe. Quien lea la constancia la
  interpreta como JSON, no la compara como texto (m3).

### 2.2 `0014_time_entry_people_restrict`, la generada

En `schema.ts`, dentro de `timeEntry`:

- `userId`: `references(() => user.id, { onDelete: "restrict" })`, con un
  comentario de una línea que remite a P-09 y al ADR 0020.
- Una clave nueva en la lista de la tabla, con nombre explícito:

  ```ts
  // P-09, ADR 0020: una persona con horas no se borra; se desactiva. La 0013
  // crea antes las membresías que faltaban.
  foreignKey({
    name: "time_entry_membership_fk",
    columns: [table.workspaceId, table.userId],
    foreignColumns: [membership.workspaceId, membership.userId],
  }).onDelete("restrict"),
  ```

Y sobre `whoSeesAllEntries` (R1-D6), un comentario como el de
`whoCreatesProjects`: «Sin efecto: ven horas ajenas owner y admin, por rol
(P-01). Si la fase 2 la vuelve editable, entra en `can()` por el recurso de
`timeEntry.others.view`, no por `Actor`: ADR 0009 y ADR 0020.»

Después, `npm run db:generate -- --name=time_entry_people_restrict`. Tiene que
salir exactamente: el `DROP` y el `ADD` de `time_entry_user_id_user_id_fk` con
`ON DELETE restrict`, y el `ADD` de `time_entry_membership_fk`. Si sale algo
más, el `schema.ts` tiene un cambio que no es de este slice.

### 2.3 Cómo se aplica en producción

Lo corre el usuario, con su acceso a Neon. Va al registro de estado como las
del 7b.

**Antes de desplegar, informativa** (no es condición; dice a quién deja
afuera la 0013, y si el owner está entre los pares, que queda activo):

```sql
select te.workspace_id, te.user_id, u.email,
       (w.owner_id = te.user_id) as es_owner,
       count(*) as entradas,
       min(te.started_at) as primera, max(te.started_at) as ultima
from time_entry te
join "user" u on u.id = te.user_id
join workspace w on w.id = te.workspace_id
where not exists (
  select 1 from membership m
  where m.workspace_id = te.workspace_id and m.user_id = te.user_id
)
group by te.workspace_id, te.user_id, u.email, w.owner_id;
```

**Después de desplegar, de verificación** (condición para desplegar R2a):

```sql
select conname, convalidated, confdeltype
from pg_constraint
where conname in ('time_entry_membership_fk', 'time_entry_user_id_user_id_fk');
```

Tiene que dar dos filas con `convalidated = true` y `confdeltype = 'r'`
(`restrict`). Y
`select count(*) from audit_log where action = 'membership.backfill'` da
tantas filas como la consulta informativa.

## 3. Permisos

Ninguno. Ninguna acción nueva en `Action` y ninguna fila de `can()` cambia.

## 4. La reversión

Solo si hace falta, y **nunca con R2a desplegado**: primero se retira R2a.
Es una migración nueva hacia adelante (`drizzle-kit` no tiene migraciones de
bajada):

1. en `schema.ts`, `userId` vuelve a `cascade` y se borra la clave compuesta;
2. `npm run db:generate -- --name=time_entry_people_revert` genera el `DROP`
   de `time_entry_membership_fk` y el `DROP` y `ADD` de
   `time_entry_user_id_user_id_fk` con `ON DELETE cascade`;
3. una `--custom` después, con una sentencia que borra las membresías
   inactivas que insertó la 0013 y siguen como las dejó. Las del owner quedan:
   son las que `ensureWorkspaceContext` le crearía igual al entrar.

   ```sql
   DELETE FROM "membership"
   USING "audit_log"
   WHERE "audit_log"."action" = 'membership.backfill'
     AND "audit_log"."entity" = 'membership'
     AND "audit_log"."entity_id" = "membership"."id"::text
     AND ("audit_log"."next_value"::json ->> 'status') = 'inactive'
     AND "membership"."status" = 'inactive'
     AND "membership"."role" = 'member';
   ```

   Las constancias de `audit_log` quedan, como toda constancia.

El criterio 10 la prueba una vez a mano; no queda como migración en el árbol.

## 5. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/db/schema.ts
/home/maxi/program/clock/drizzle/0013_time_entry_people_backfill.sql             (nuevo)
/home/maxi/program/clock/drizzle/0014_time_entry_people_restrict.sql             (nuevo)
/home/maxi/program/clock/drizzle/meta/0013_snapshot.json                         (nuevo)
/home/maxi/program/clock/drizzle/meta/0014_snapshot.json                         (nuevo)
/home/maxi/program/clock/drizzle/meta/_journal.json
/home/maxi/program/clock/src/modules/time-entry/person-keys.integration.test.ts  (nuevo)
/home/maxi/program/clock/src/modules/time-entry/actions.integration.test.ts      (solo signInOn y el comentario de TT-92)
/home/maxi/program/clock/src/modules/time-entry/service.integration.test.ts      (solo la siembra de dos tests)
/home/maxi/program/clock/src/modules/project/schema.integration.test.ts          (solo el test del diario del 11b)
```

- Los tests nuevos van en un archivo propio y no en
  `time-entry/schema.integration.test.ts`, para no cruzarse con nada que esté
  abierto sobre los tests de `time-entry`.
- Los tres archivos existentes cambian lo que dice la tabla de §0, nada más.
- Si una fábrica necesita un parámetro, `src/test/factories.ts` entra solo
  para ese cambio.

### frontend-dev, e2e-tester

No hace falta ninguno: no hay pantalla ni recorrido nuevo. La suite e2e entera
se corre en el cierre (criterio 11), dos veces: con una base nueva y con la
base de e2e reusada, que tiene datos acumulados de muchas corridas y es la
prueba más parecida a producción de que la 0013 y la 0014 aplican sobre datos
reales.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Una línea en RP-65: P-09 resuelto por R1, con las dos claves y las membresías
creadas por la 0013 (inactivas, salvo el owner).

### Lo que no toca nadie

`src/modules/` salvo los cuatro archivos de test de arriba,
`src/server/permissions/`, `src/server/audit.ts`, `src/server/auth.ts`,
`src/server/db/auth-schema.ts` (lo regenera `npm run auth:schema`: la clave
cambia en `time_entry`, no en `user`), `e2e/`. Los ADR, el mapa y el estado
los actualiza el team-lead.

### Orden

1. La custom 0013, con `schema.ts` sin tocar.
2. `schema.ts` y la generada 0014, con la siembra de los tres archivos de §0
   en el mismo commit, para que la suite quede en verde en cada commit.
3. Los tests de §6, con sus mutantes en una copia, nunca en el árbol
   compartido.
4. `parity-analyst`, antes del merge.

## 6. Criterios de aceptación

**Las personas que se borran en los criterios 1 a 4 son de `seedMember`, nunca
el owner del workspace**: la clave de `workspace.owner_id` es `restrict`
(§0), así que borrar al owner falla siempre y el criterio 1 pasaría con
cualquier clave.

1. **Borrar un usuario con horas falla** — `delete from "user"` de una
   persona con una entrada responde 23503 (`hasCode`, sin fijar qué clave:
   puede saltar la del usuario o la compuesta, a través de la cascada hacia
   `membership`). El usuario, su membresía, su entrada y sus preferencias
   siguen ahí.
2. **Borrar un usuario sin horas sigue andando** — se van el usuario, su
   membresía y sus preferencias.
3. **Borrar una membresía con horas falla** — 23503 sin fijar la clave; la
   membresía y la entrada siguen ahí.
4. **Borrar una membresía sin horas sigue andando** — y sus filas de
   `project_member` se van en cascada, como hoy.
5. **Borrar el workspace con horas borra todo** — el workspace, sus
   membresías, sus entradas con sus etiquetas, su configuración y sus
   constancias. Es una regresión: fija que R1-D4 sigue valiendo.
6. **Una entrada no puede quedar donde su persona no tiene membresía** —
   insertar una entrada en el workspace A para alguien con membresía solo en
   B falla con 23503 y la restricción `time_entry_membership_fk`. Acá sí se
   fija el nombre: el usuario existe y la única clave que puede saltar es la
   compuesta.
7. **El estado no es parte de la clave** — una entrada de una persona con
   membresía `inactive` se inserta sin error. Quién puede cargar horas lo
   decide `can()`, no la base.
8. **El relleno** — Una transacción que termina en `rollback`, armada así
   (M2):
   - **antes del `begin`**, con las fábricas y el `db` global: los
     workspaces A (owner O) y B; los usuarios U y V; la membresía activa de U
     en B y la de V en A; una entrada de V en A; y se borra la membresía de O
     en A, que todavía no tiene horas;
   - **dentro de la transacción, todo con `tx`**, ninguna fábrica ni el `db`
     global, que esperarían el bloqueo de la clave quitada hasta el
     `testTimeout`: quitar `time_entry_membership_fk`; insertar una entrada de
     U en A y una de O en A; ejecutar la sentencia de la 0013 leída del
     archivo por el diario; y leer lo que sigue.

   Entonces:
   - U tiene en A una membresía `member`/`inactive`, y O una `owner`/`active`
     (M1), las dos con los valores por omisión del resto;
   - hay una fila de `audit_log` por cada una, con
     `action = 'membership.backfill'`, `entity = 'membership'`, `entity_id`
     igual al id de la membresía y `actor_id` nulo; **`JSON.parse` de su
     `next_value`** es `{ userId, role, status }` con lo que se insertó (m3);
   - la membresía de U en B y la de V en A no cambiaron: rol, estado y
     `updated_at`;
   - ejecutar la sentencia otra vez no inserta membresías ni constancias;
   - ejecutar después la sentencia de la 0014 que crea la clave, leída del
     archivo, no falla.

9. **Las claves, en la base** — `pg_constraint` tiene
   `time_entry_membership_fk` y `time_entry_user_id_user_id_fk` con
   `convalidated = true` y `confdeltype = 'r'`.
10. **La reversión, a mano** — `backend-dev` aplica una vez los tres pasos de
    §4 en una base propia con una membresía inactiva y una del owner
    insertadas por la 0013, comprueba que la clave compuesta no está, que la
    del usuario vuelve a `c`, que la membresía inactiva se fue y la del owner
    quedó, y borra la base. Lo anota en el informe.
11. **Lo existente sigue verde** — lint, typecheck y `npm run test:all`, y la
    suite e2e con la base de e2e nueva y con la reusada, **sin cambiar
    ninguna afirmación salvo la del diario del 11b** (§0). Las siembras de
    §0 cambian; lo que cada test afirma, no. Un `npm run db:generate` después
    del último commit no genera nada.

### Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                         | Qué afirma                                                        | Mutante que tiene que caer                                                                                                                                                                                                                                                           |
| -------- | ----------- | ----------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | integración | `person-keys.integration.test.ts`               | 23503 y las cuatro filas intactas                                 | la clave del usuario en `cascade` y sin la compuesta (se borra todo sin error); la del usuario en `cascade` con la compuesta en `cascade`                                                                                                                                            |
| 2        | integración | `person-keys.integration.test.ts`               | las tres filas borradas                                           | cualquier forma que rechace todo borrado de usuario (por ejemplo, `membership.user_id` en `restrict`)                                                                                                                                                                                |
| 3        | integración | `person-keys.integration.test.ts`               | 23503 y las dos filas intactas                                    | sin la clave compuesta; la compuesta en `cascade` (se van las entradas); la compuesta en `set null`                                                                                                                                                                                  |
| 4        | integración | `person-keys.integration.test.ts`               | la membresía y su `project_member` borrados                       | cualquier forma que rechace todo borrado de membresía                                                                                                                                                                                                                                |
| 5        | integración | `person-keys.integration.test.ts`               | ninguna fila del workspace queda                                  | — (regresión, m1)                                                                                                                                                                                                                                                                    |
| 6        | integración | `person-keys.integration.test.ts`               | 23503 con `time_entry_membership_fk`                              | sin la compuesta, solo con la del usuario (la entrada se inserta)                                                                                                                                                                                                                    |
| 7        | integración | `person-keys.integration.test.ts`               | la inserción anda                                                 | un `check` o un disparador que exija `status = 'active'`                                                                                                                                                                                                                             |
| 8        | integración | `person-keys.integration.test.ts`               | cada punto del criterio                                           | `'active'` en vez de `'inactive'` para U; `member`/`inactive` también para O (sin el `case`); sin el `NOT EXISTS` ni el `ON CONFLICT` (la segunda corrida falla con 23505); sin la constancia; `entity_id` con el id del usuario; `actor_id` con el owner; `next_value` sin `status` |
| 9        | integración | `person-keys.integration.test.ts`               | las dos filas de `pg_constraint`                                  | la compuesta creada `not valid`; la del usuario sin cambiar                                                                                                                                                                                                                          |
| 10       | manual      | —                                               | lo que dice el criterio                                           | —                                                                                                                                                                                                                                                                                    |
| 11       | todas       | las suites existentes y los tres archivos de §0 | en verde, con la única afirmación cambiada que nombra el criterio | —                                                                                                                                                                                                                                                                                    |

**Mutante declarado equivalente (m2):** `ON CONFLICT DO UPDATE` sobre el rol
o el estado. En una sola conexión, el `NOT EXISTS` ya dejó afuera todo par con
membresía, así que el `ON CONFLICT` nunca se dispara y ningún test lo
distingue. El `ON CONFLICT DO NOTHING` queda como defensa ante un ingreso
concurrente durante la migración, sin test. Antes de darlo por equivalente,
`backend-dev` lo corre como pide `estado-fase1.md` —con una persona sin
horas, una con horas en otro workspace, una membresía inactiva y el owner— y
anota en el informe que la respuesta y las filas son las mismas.

**El criterio 8 hace DDL dentro de una transacción.** Quitar la clave toma un
bloqueo exclusivo sobre `time_entry` hasta el `rollback`; por eso todo lo de
adentro va con `tx` (M2). Es seguro porque los archivos de integración no
corren en paralelo (`vitest.integration.config.ts:16-17`), y el `rollback`
deja el esquema como lo dejó la migración. El test comprueba al final, fuera
de la transacción, que `time_entry_membership_fk` sigue en `pg_constraint`.

**Cualquier otro mutante declarado equivalente** se prueba antes de la misma
forma, comparando la respuesta y las filas.

## 7. Deuda conocida del slice

- **No hay índice que empiece por `time_entry.user_id`** (R1-D5): borrar un
  usuario recorre `time_entry` para comprobar la clave. Hoy la cascada hace lo
  mismo.
- **Un borrado que choca con las claves no tiene texto propio**, porque ningún
  camino de la aplicación borra personas. Si la fase 2 agrega «quitar del
  equipo», el contrato de ese slice traduce el 23503 o, mejor, ofrece
  desactivar.
- **Lo que ve una persona inactiva al entrar** sigue siendo la conducta de
  hoy: tiene sesión y `can()` le niega todo. La pantalla que explica eso es de
  la fase 2.
- **`ensureWorkspaceContext` sigue creando una membresía activa** para quien
  pase el login sin tener ninguna (deuda del slice 1). R1 solo cambia que, a
  quien se le borró la membresía teniendo horas, ya no se le crea una nueva.
- **`signInOn` ya no prueba que `ensureWorkspaceContext` cree la membresía**
  en los tests de las actions de `time-entry`. Esa creación la cubren los
  tests del service de `workspace`.
- **La reversión se prueba una vez a mano** (criterio 10) y no queda como test.
