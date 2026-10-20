# Fase 2, WS0: las columnas sin efecto

Contrato del slice WS0 de la fase 2. **Borra doce columnas que nunca tuvieron
efecto**: `logo_url` y `currency` de `workspace`; `who_sees_rates`,
`who_creates_projects`, los cuatro `require_*`, `force_timer`,
`timesheet_enabled` y `rounding_minutes` de `workspace_settings`; y
`weekly_capacity_minutes` de `membership`. Sin pantalla, sin permisos y sin
cambio visible. **Es el primer borrado del proyecto, y va en el orden inverso al
de siempre**: primero llega a producción el código que ya no nombra las
columnas, y después la migración que las borra.

- **Fuente:** [`workspace.md`](../parity/workspace.md), §14 y P-05 (con P-01 y
  P-03, que dejan sin efecto `logo_url` y `who_creates_projects`);
  [`equipo.md`](../parity/equipo.md), EQ-72 y P-09; el
  [mapa de la fase 2](fase2-mapa.md), «WS0», §4 y §7 (decisión 1: también
  `membership.weekly_capacity_minutes`).
- **Lugar en el plan:** primer slice de configuración de la fase 2. No depende
  de ningún slice; **va antes de WS2a y de E4**, que suman columnas a
  `workspace_settings` (mapa, «WS0»).
- **Revisión:** `architecture-reviewer` lo aprobó con cambios; las seis
  correcciones están aplicadas.
- **Decisiones de arquitectura:**
  - **[ADR 0028](../adr/0028-borrar-columnas-primero-el-codigo-despues-la-migracion.md),
    nuevo, propuesto**: borrar columnas, primero el código y después la
    migración. Lo aprueba el usuario (§12).
  - El [ADR 0009](../adr/0009-la-configuracion-del-workspace-viaja-en-el-recurso.md)
    es el criterio del borrado y no cambia: si `who_creates_projects` vuelve a
    ser configurable, la columna vuelve con ese ADR.
  - El [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md) congeló
    `who_sees_all_entries`, que **no se borra** (mapa, §6).

Decisiones del usuario que el contrato da por tomadas: se borran las columnas
sin efecto de la §14, también `logo_url` y `who_creates_projects` (workspace
P-05, 2026-10-16); y `membership.weekly_capacity_minutes` (mapa, §7, decisión
1, 2026-10-16).

## Decisiones del contrato

**D-WS0-1 — Qué se borra y qué queda.** Las doce columnas de la tabla, con su
definición de hoy (`drizzle/0000_base.sql:32`, `:41-42`, `:52-60`; el `default`
de `who_creates_projects` pasó a `everyone` en `0003_projects.sql:73`):

| Tabla                | Columna                   | Tipo               | `default`  | Nula |
| -------------------- | ------------------------- | ------------------ | ---------- | ---- |
| `workspace`          | `logo_url`                | `text`             | —          | sí   |
| `workspace`          | `currency`                | `char(3)`          | `ARS`      | no   |
| `workspace_settings` | `who_sees_rates`          | `visibility_scope` | `admins`   | no   |
| `workspace_settings` | `who_creates_projects`    | `visibility_scope` | `everyone` | no   |
| `workspace_settings` | `require_project`         | `boolean`          | `false`    | no   |
| `workspace_settings` | `require_task`            | `boolean`          | `false`    | no   |
| `workspace_settings` | `require_description`     | `boolean`          | `false`    | no   |
| `workspace_settings` | `require_tag`             | `boolean`          | `false`    | no   |
| `workspace_settings` | `force_timer`             | `boolean`          | `false`    | no   |
| `workspace_settings` | `timesheet_enabled`       | `boolean`          | `true`     | no   |
| `workspace_settings` | `rounding_minutes`        | `integer`          | `0`        | no   |
| `membership`         | `weekly_capacity_minutes` | `integer`          | `2400`     | no   |

**Queda**: `workspace_settings` como tabla, con `workspace_id`,
`who_sees_all_entries` y sus fechas —WS2a y E4 le suman columnas—; el tipo
`visibility_scope`, que sigue usando `who_sees_all_entries`; el valor `invited`
de `membership_status` (deuda del mapa, §6); y el resto de `workspace` y
`membership`. Ninguna fila se borra ni cambia.

**D-WS0-2 — Dos commits, dos merges, y la migración después del segundo push
(ADR 0028).** La rama `fase2/ws0-columnas` lleva dos commits de código, en este
orden:

- **A, el código**: `src/server/db/schema.ts` sin las doce columnas, los
  lectores que las nombran y sus tests (D-WS0-3). **Sin nada en `drizzle/`.**
- **B, la migración**: lo que genera `npm run db:generate` desde el esquema de A
  (D-WS0-4) y el test que comprueba el resultado (§9.2). Nada más.

**La regla del orden**: todo commit que toque `src/` va antes del primero que
toque `drizzle/`; A es el último commit anterior a B —las correcciones de las
revisiones de A son parte de A o van antes—; los commits de `docs/` pueden ir
en cualquier lugar. **B se genera después de cerrar las revisiones de A** y se
revisa aparte, con la lista de D-WS0-4.

**Regenerar B** —porque una corrección toca `src/` después de B, porque la
revisión de B la rechaza, o porque `main` sumó una migración antes del merge de
A— se hace en **una rama nueva desde A**: `git switch -c fase2/ws0-b <A>` (con
la corrección de `src/` encima, si la hay, que pasa a ser el A nuevo); si `main`
cambió, `git rebase main` en esa rama; los commits de `docs/` posteriores al B
viejo, con `git cherry-pick`; y `db:generate` otra vez. Desde ahí la rama del
slice es `fase2/ws0-b`, y la vieja queda sin mergear. **No** `git reset --hard`,
que está prohibido en este repo. Se elige la rama nueva y no un `git revert` del
B viejo para que B siga siendo un solo commit que se revisa entero y el diario
no arrastre una entrada agregada y quitada.

El team-lead lleva los commits a `main` en dos merges: **primero A**, con
`git merge --no-ff <A>`, y push; **B**, con el merge de la rama, solo después de
la comprobación de D-WS0-5. La migración la corre el usuario en producción
**después del push de B**, desde `main` (§6.5). Los dos merges van el mismo día.

**Mientras un árbol tenga A sin B, nadie corre `db:generate` en él** (ADR 0028,
regla 2): `main` entre los dos merges, la rama del slice antes de B y todo
worktree rebasado sobre ese `main`. El esquema ya no tiene las columnas y la
última instantánea sí, así que generaría el borrado otra vez. Por eso entre los
dos merges no entra a `main` otra migración, y **WS2a y E4 arrancan desde un
`main` con B**.

**Por qué después del push y no antes desde la rama**: así `main` tiene la
migración antes que producción, y producción nunca tiene una migración que
`main` no conoce. Al revés, si B no llegara a `main`, el próximo `db:generate`
volvería a emitir el borrado y fallaría en producción. Pushear B antes de migrar
no cambia nada que se ejecute: el código de B es el de A.

**D-WS0-3 — Los lectores son de dos clases, y solo una se edita.**

- **Los que nombran una columna** se buscan con `rg` y se editan en A. Con el
  árbol de `eb2ba2d`, son cuatro archivos de `src/` y ninguno de `e2e/` ni de
  `scripts/` (§1):
  - `src/server/db/schema.ts`: las doce columnas, el comentario de
    `whoCreatesProjects` (`:74-78`), y los imports `char` e `integer`, que solo
    usan `currency` (`:50`), `rounding_minutes` (`:89`) y
    `weekly_capacity_minutes` (`:109`).
  - `src/server/permissions/index.ts:76-77`: el comentario de `client.create` y
    `project.create` remite a `whoCreatesProjects` (§3).
  - `src/modules/project/schema.integration.test.ts:485-537`: el `describe` del
    criterio 11 del slice 9 (PR-59), entero. Sus dos tests afirman el valor de
    la columna: el relleno de la `0004` ya no se puede volver a correr contra el
    esquema, y el `default` de un workspace nuevo deja de existir. La `0004`
    queda en el diario.
  - `src/modules/workspace/service.integration.test.ts:507-510`: el `update` que
    mueve `updated_at` (D-R9-2) escribe `weeklyCapacityMinutes`; pasa a
    escribir `weekStart: 0`, que tampoco cambia lo que el test afirma.
  - `src/modules/time-entry/person-keys.integration.test.ts:353-364`: los dos
    `toMatchObject` del relleno de la `0013` pierden `weeklyCapacityMinutes`; la
    sentencia de la `0013` nombra sus columnas y no la incluye
    (`drizzle/0013_time_entry_people_backfill.sql:6`).
- **Los que nombran todas las columnas del esquema** —`select()` y
  `returning()` sin argumentos, y todo `insert` de Drizzle— **no se editan**:
  siguen a `schema.ts` y dejan de nombrar las columnas con A. Son la razón del
  orden: con la base migrada, una versión anterior a A falla en ellos. En la
  aplicación:
  - `workspaceRepository.findFirstWorkspace` (`workspace/repository.ts:65-74`),
    en cada pedido con sesión por `ensureWorkspaceContext`
    (`workspace/service.ts:160-170`) y en el gancho `session.create.after`
    (`service.ts:414-425`);
  - `findMembership` (`repository.ts:76-87`), en cada pedido con sesión
    (`service.ts:83-91`);
  - `createWorkspace` (`repository.ts:89-96`), en el arranque, con el `insert`
    de `workspace_settings`;
  - `createMembership` (`repository.ts:103-124`), al aceptar una invitación.
  - En los tests: las fábricas (`src/test/factories.ts:54-61`, `:76`),
    `src/test/queries.ts:35-50` y los `db.select().from(...)` de los tests de
    integración. Corren contra la base que migra cada tanda
    (`src/test/global-setup.ts:11-14`), así que no tienen ventana.
- **`e2e/` y `scripts/report-volume/` nombran sus columnas en SQL**
  (`e2e/database.ts:429`; `scripts/report-volume/seed.sql:44-68`) y ninguna es
  de las doce: no cambian.
- **El script de importación** es un lector de las dos clases, fuera de la
  aplicación (D-WS0-6).
- **La búsqueda de A**, que se repite después de cada rebase y tiene que dar
  cero coincidencias:

  ```
  rg -n -w 'logoUrl|logo_url|currency|whoSeesRates|who_sees_rates|whoCreatesProjects|who_creates_projects|requireProject|requireTask|requireDescription|requireTag|require_project|require_task|require_description|require_tag|forceTimer|force_timer|timesheetEnabled|timesheet_enabled|roundingMinutes|rounding_minutes|weeklyCapacityMinutes|weekly_capacity_minutes' src e2e scripts
  ```

  Con `-w`, `currency` no encuentra `concurrency` y `require_project` no
  encuentra `requireSession`. `drizzle/` y `docs/` quedan fuera: son historia.

**D-WS0-4 — La migración se genera en la rama rebasada, con nombre, y se revisa
a mano.**

- **Cuándo**: cerradas las revisiones de A (D-WS0-2), sobre la rama rebasada en
  el `main` que trae E2b y el MCP mergeados (§0), y **de nuevo, con el
  procedimiento de D-WS0-2, si `main` suma otra migración antes del merge de
  A**. No se renombra un archivo generado antes: el `when` de su entrada en
  `drizzle/meta/_journal.json` tiene que superar el `created_at` de la última
  migración aplicada en producción, o `drizzle-kit migrate` la saltea sin aviso
  (ADR 0028, «Contexto»).
- **Cómo**: `npm run db:generate -- --name drop_unused_columns`. En `main` la
  última es la `0016`; E2b trae `0017_membership_account_link` y el MCP
  `0017_mcp`, y el que mergee segundo regenera la suya como `0018`. **La de WS0
  sale `0019_drop_unused_columns`**; si el diario dice otro número, vale el del
  diario.
- **Lo que tiene que traer**, y nada más (lo comprueba quien la genera, lo
  vuelve a mirar la revisión de backend, y queda en el registro):
  1. Doce sentencias `ALTER TABLE … DROP COLUMN`, una por columna de D-WS0-1, en
     el orden que elija `drizzle-kit`, separadas por `--> statement-breakpoint`:

     ```sql
     ALTER TABLE "membership" DROP COLUMN "weekly_capacity_minutes";
     ALTER TABLE "workspace" DROP COLUMN "logo_url";
     ALTER TABLE "workspace" DROP COLUMN "currency";
     ALTER TABLE "workspace_settings" DROP COLUMN "who_sees_rates";
     ALTER TABLE "workspace_settings" DROP COLUMN "who_creates_projects";
     ALTER TABLE "workspace_settings" DROP COLUMN "require_project";
     ALTER TABLE "workspace_settings" DROP COLUMN "require_task";
     ALTER TABLE "workspace_settings" DROP COLUMN "require_description";
     ALTER TABLE "workspace_settings" DROP COLUMN "require_tag";
     ALTER TABLE "workspace_settings" DROP COLUMN "force_timer";
     ALTER TABLE "workspace_settings" DROP COLUMN "timesheet_enabled";
     ALTER TABLE "workspace_settings" DROP COLUMN "rounding_minutes";
     ```

  2. Ningún `DROP TYPE` —`visibility_scope` sigue en uso—, ningún `CASCADE`,
     ningún `CREATE`, `ADD`, `RENAME` ni `UPDATE`, y ninguna otra tabla.
  3. La instantánea nueva de `drizzle/meta/` difiere de la anterior solo en esas
     doce columnas (y en su `id` y `prevId`).
  4. La entrada nueva del diario es la última, con un `when` mayor que el de la
     anterior.
- **Si `drizzle-kit` pregunta** si una columna se creó o se renombró, el diff
  tiene una columna nueva que no es de WS0 —un esquema sin rebasar o un cambio
  de más—: se corta con Ctrl-C, sin elegir nada, y se revisa el árbol. Nunca se
  elige un renombre.
- **No se edita a mano** el SQL generado. Sin `IF EXISTS`: si una columna no
  está, la base no es la que el contrato supone y la migración tiene que fallar.
- **Sin constancia en `audit_log`**: es un cambio de esquema, no de datos, como
  las migraciones que agregan. Los valores quedan en la salida de la consulta
  previa (D-WS0-9).

**D-WS0-5 — Que no quede una versión anterior a A se comprueba en CI y en
Vercel, y se confirma después de migrar en los logs.** Antes del merge de B, el
team-lead comprueba, en orden:

0. **La corrida de CI del merge de A terminó en `success`**, con `integration` y
   `e2e`:

   ```
   gh run list --workflow CI --branch main --json databaseId,headSha,conclusion
   gh run view <databaseId> --json jobs --jq '.jobs[] | {name, conclusion}'
   ```

   La corrida cuyo `headSha` es el merge de A tiene `conclusion` `success`, y
   sus tres jobs también. **Hasta que esa corrida termine no se pushea nada a
   `main`**: `ci.yml` tiene `cancel-in-progress: true` por ref
   (`.github/workflows/ci.yml:8-10`), y un push la cancelaría. Es la prueba de
   A contra la base con las columnas (ADR 0028, «Consecuencias»).

1. **El último deployment de producción contiene A**, en estado `success`:

   ```
   gh api 'repos/zapmaxvevo/clock/deployments?environment=Production&per_page=5' \
     --jq '.[] | {id, sha, created_at}'
   gh api repos/zapmaxvevo/clock/deployments/<id>/statuses --jq '.[0] | {state, created_at}'
   git fetch origin && git merge-base --is-ancestor <A> <sha>
   ```

   El primero de la lista tiene un `sha` del que A es ancestro (el `merge-base`
   sale con código 0) y su último estado es `success`. No hace falta que sea el
   merge de A: entre los dos merges se pushean commits de `docs/` a `main`, y
   cada push despliega. Vercel crea el deployment de GitHub solo cuando el build
   termina bien, así que un build fallido no aparece en la lista: el primero es
   siempre uno que atiende. El usuario lo puede confirmar en el tablero de
   Vercel: ese deployment tiene la marca «Current».

2. **Pasaron diez minutos desde el `success` del primer deployment que contiene
   A** —el más viejo de la lista con A como ancestro—: desde ahí el dominio de
   producción va a una versión sin las columnas, y las invocaciones que la
   anterior tenía en curso terminaron —su duración máxima es de minutos—.
3. **La verificación de humo de §6.3** pasa con A contra la base con las
   columnas.
4. **El script rebasado** está commiteado y probado (D-WS0-6).

**Fuera de la aplicación no hay otro lector en producción**: el cron diario no
toca la base (`src/app/api/cron/daily/route.ts:13-22`), los previews usan la
rama `preview` de Neon, y la aplicación no deja conexiones abiertas entre
invocaciones (`src/server/db/index.ts:10-22`). **Lo único que queda** es
Instant Rollback: desde la migración, promover un deployment anterior a A deja
la aplicación caída (§6.7).

**Después de migrar**, la confirmación es que no aparece ningún error de columna
inexistente: los logs de Runtime de producción en Vercel, filtrados por
`does not exist`, sin resultados durante quince minutos (§6.6).

**D-WS0-6 — El script de importación se rebasa sobre `main` con A, en su
worktree y con su propio commit, antes de migrar.** El script vive en la rama
`ops/importar-clockify` (`dae5193`), en el worktree
`/home/maxi/program/clock/.claude/worktrees/agent-ae2123e9f2a6adc04`, sin
mergear y sin borrar. Es un lector de las dos clases:

- `soleWorkspace` lee el workspace con `select()` (`main.ts:193-199`): nombra
  `logo_url` y `currency`. Es la primera sentencia de toda corrida, también en
  seco.
- `ensurePeople` inserta membresías con Drizzle (`main.ts:509-517`): nombra
  `weekly_capacity_minutes`. Las lecturas de `membership` nombran sus columnas
  (`main.ts:236-239`, `:471-476`) y no tienen ventana.

Con la base migrada, **el script viejo falla en la primera sentencia** con
`42703`, dentro de su transacción, sin escribir nada. No rompe datos; deja sin
importación a quien entre después, hasta el rebase.

**Quién y cuándo**: `backend-dev`, cuando el team-lead se lo pida, **después del
merge de A** y antes de la migración de producción. No va en la rama de WS0. El
script no corre `db:generate`: su árbol tiene A sin B (D-WS0-2).

1. **Una rama de respaldo** en la cabeza de hoy, que no se borra:
   `git branch ops/importar-clockify-antes-de-ws0 ops/importar-clockify`. La
   rama es local —no tiene ref remota—, así que el rebase no pide un push
   forzado.
2. **El rebase** de `ops/importar-clockify` sobre `main`. La rama parte de un
   árbol con la `0014` (antes de E1a), así que el rebase atraviesa E1a, E1b, E2,
   la subida de Better Auth, E2b, el MCP y A. Los conflictos se resuelven
   conservando `main` y sumando lo del script (el `import:clockify` de
   `package.json`). Después, `npm ci`.
3. **El código del script se ajusta a `main` sin cambiar lo que hace**: si una
   firma que usa cambió (`recordAudit`, `nextPaletteColor`, `durationSeconds`,
   `formatElapsed`), se adapta la llamada. `npm run typecheck` y los tests de
   `scripts/import-clockify/` pasan.
4. **El cambio de D-E1b-10**, en un commit propio después del rebase, con lo
   que fija el contrato de E1b (§6.6): `newMembership` deja de crear la
   membresía y `newUser` no se carga con una invitación `pending`. E1b lo dejó
   para este rebase: «WS0 ya le pide rebasarse; si E1b llega antes, el rebase va
   con este cambio». Este contrato no lo cambia, solo lo programa.
5. **La prueba** de §9.4, con la salida resumida en el registro.

El usuario corre las corridas siguientes desde ese worktree, como siempre:
`--dry-run`, revisión y `--apply`. Antes de cada una, la consulta de correos
liberados de E2b (§6.7 de E2b). **Hasta la migración** puede correr también el
script viejo; **desde la migración**, solo el rebasado.

**D-WS0-7 — La reversión depende de si la migración corrió (ADR 0028, regla
7).**

- **Antes de migrar**: `git revert -m 1 <merge de A>` y push. La base todavía
  tiene las columnas; el código anterior las encuentra. Si B ya estaba en
  `main`, se revierte también el merge de B, primero.
- **Después de migrar**: **no se revierte nada**. Una migración hacia adelante
  vuelve a crear las columnas (§2.3), se corre en producción, y recién después
  se despliega el código que las nombre, si hace falta. La aplicación de A
  funciona con y sin las columnas, así que la migración de vuelta se corre sin
  tocar el código. **Nunca** `git revert` del merge de B (borraría la `0019` y su
  entrada del diario con la base ya migrada, como advierte §6.6 de E2b), y
  **nunca** Instant Rollback a un deployment anterior a A.
- **Lo que la reversión no devuelve**: los valores. Las columnas vuelven con su
  `default`; si la consulta previa mostró otro, su salida es la única copia
  (D-WS0-9).

**D-WS0-8 — Las bases que comparten varios árboles reciben B después de
producción.** Con B aplicada, un árbol sin A falla contra esa base, en la
integración y en la e2e:

- **Los agentes de WS0 prueban con bases propias**, nunca con `clock` ni con
  `clock_test`:
  `TEST_DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_ws0_test`
  para la integración (`src/test/database-url.ts:1-3`) y
  `DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_ws0_e2e` para la
  e2e, más las de §9. La integración migra sola su base al arrancar
  (`src/test/global-setup.ts:11-14`): correrla contra `clock_test` desde la
  rama le aplicaría B.
- **Las bases locales comunes (`clock`, `clock_test`) y la rama `preview` de
  Neon se migran recién después de §6.5**, no con el merge de B. Entre el push
  de B (§6.4) y la migración de producción, `main` ya tiene B: **si hay que
  correr la suite desde `main` en ese intervalo, va con `TEST_DATABASE_URL`
  hacia una base propia** —`global-setup.ts` migraría `clock_test` solo— y la
  e2e con `DATABASE_URL` hacia otra propia.
- **Después de §6.5**, la base local `clock` recibe B con `npm run db:migrate`
  desde `main`, y `clock_test` en la primera tanda que corra desde `main`. Desde
  ahí, todo worktree abierto se rebasa sobre `main` antes de probar contra ellas.
- **La rama `preview` de Neon** recibe B con `!`, después de §6.5. Desde ahí, el
  preview de una rama sin A falla; las ramas con preview se rebasan antes. Si
  una rama de preview no se puede rebasar todavía, la migración de `preview`
  espera.

**D-WS0-9 — Lo que se pierde se copia antes, y no frena.** Las columnas no
tienen lector, así que lo que guardan no tiene efecto (workspace P-05, ADR
0009). La consulta 2 de §6.1 lo imprime: lo esperado son los `default` de
D-WS0-1, con `logo_url` nula. **Si una fila guarda otro valor**, se anota y no
frena: la decisión de borrar no depende del valor. La salida va al registro del
slice (son un código de moneda, banderas y números: nada personal).

## 0. Precondición de arranque

- **E2b y el MCP mergeados en `main`**, con sus migraciones (`0017` y `0018`)
  corridas en producción. La rama de WS0 se rebasa sobre ese `main` antes de
  empezar; las citas de abajo son de `eb2ba2d`, y si el rebase movió alguna
  línea, `backend-dev` lo anota en el registro.
- **El ADR 0028, aceptado** por el usuario (§12).
- **La búsqueda de D-WS0-3 repetida sobre el árbol rebasado.** En las ramas de
  hoy de E2b (`/home/maxi/program/clock-e2b`) y del MCP
  (`/home/maxi/program/clock-mcp`) solo nombran las columnas el esquema y los
  mismos tres tests, pero el que vale es el árbol mergeado.
- **La consulta de §6.1 corrida en producción** antes de migrar, no antes de
  implementar.

### Supuestos sobre el árbol, con archivo y línea en `eb2ba2d`

| Supuesto                                                                                                     | Dónde                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Las doce columnas en el esquema; `char` e `integer` solo las usan ellas                                      | `src/server/db/schema.ts:4`, `:8`, `:46-61`, `:63-95`, `:97-123`                                                                                    |
| Su definición en la base; el `default` de `who_creates_projects` es `everyone`                               | `drizzle/0000_base.sql:26-63`; `drizzle/0003_projects.sql:73`                                                                                       |
| `visibility_scope` lo usa también `who_sees_all_entries`                                                     | `schema.ts:40-44`, `:72`                                                                                                                            |
| `select()` sin argumentos sobre `workspace` y `membership`; `insert … returning()` en las dos                | `src/modules/workspace/repository.ts:17-18`, `:65-124`                                                                                              |
| `ensureWorkspaceContext` lee el workspace y la membresía en cada pedido; el gancho relee el workspace        | `src/modules/workspace/service.ts:83-91`, `:160-170`, `:414-425`                                                                                    |
| Un `insert` de Drizzle nombra todas las columnas, con `default` en las que faltan                            | `node_modules/drizzle-orm/pg-core/dialect.js:356-404` (0.45.3)                                                                                      |
| `migrate` aplica una migración solo si su `when` supera el último `created_at`                               | `node_modules/drizzle-orm/pg-core/dialect.js:59-67`                                                                                                 |
| La última migración de `main` es la `0016`                                                                   | `drizzle/meta/_journal.json:117-123`                                                                                                                |
| El comentario de `client.create` y `project.create` remite a la columna                                      | `src/server/permissions/index.ts:76-79`                                                                                                             |
| Los tres tests que nombran columnas                                                                          | `project/schema.integration.test.ts:485-537`; `workspace/service.integration.test.ts:507-510`; `time-entry/person-keys.integration.test.ts:353-364` |
| Las fábricas y las consultas de test no nombran las columnas                                                 | `src/test/factories.ts:54-61`, `:76`; `src/test/queries.ts:35-50`                                                                                   |
| La integración migra su base al arrancar; la base se elige con `TEST_DATABASE_URL`; cada test trunca         | `src/test/global-setup.ts:11-14`; `src/test/database-url.ts:1-3`; `src/test/database.ts:11`                                                         |
| CI cancela la corrida en curso de la misma ref; corre la integración y la e2e contra bases nuevas            | `.github/workflows/ci.yml:8-10`, `:43-68`, `:70-102`                                                                                                |
| La e2e y el volumen del reporte nombran sus columnas en SQL, ninguna de las doce                             | `e2e/database.ts:429`; `scripts/report-volume/seed.sql:44-68`                                                                                       |
| El cron no toca la base; la aplicación no deja conexiones abiertas entre invocaciones                        | `src/app/api/cron/daily/route.ts:13-22`; `src/server/db/index.ts:10-22`                                                                             |
| El script: `select()` del workspace, lecturas nombradas e `insert` de membresías; su árbol llega a la `0014` | `scripts/import-clockify/main.ts:193-199`, `:232-239`, `:470-482`, `:491-519`; su `drizzle/` (rama `ops/importar-clockify`)                         |
| El script todavía tiene `newMembership` (D-E1b-10 pendiente)                                                 | `main.ts:242-264`, `:700-701` (rama `ops/importar-clockify`)                                                                                        |

## 1. Alcance

Cubre la §14 de `workspace.md` con workspace P-05, y la columna de EQ-72 con la
decisión 1 del §7 del mapa. Ningún identificador de paridad cambia de destino:
WS-07, WS-18, WS-22 … WS-24, WS-31, WS-39 y WS-43 ya estaban fuera de alcance o
cumplidos, y EQ-72 sigue fuera.

Entra:

- **A**: el esquema sin las columnas y los cuatro archivos de D-WS0-3.
- **B**: la migración (§2) y su test (§9.2).
- **El script de importación** rebasado, con D-E1b-10 (D-WS0-6), en su rama.
- **Las consultas de §6** y la transición en producción.
- **Las correcciones fechadas** de los documentos de paridad que nombran las
  columnas (§7, `parity-analyst`).

Queda afuera: §13.

### Consecuencias sobre código ya entregado

| Archivo                                                  | Qué cambia                                                                                | Qué hay que volver a probar                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- |
| `src/server/db/schema.ts`                                | Sin las doce columnas, sin el comentario de `whoCreatesProjects`, sin `char` ni `integer` | `npm run typecheck`; la suite entera (§9)    |
| `src/server/permissions/index.ts`                        | El comentario de `client.create` y `project.create` (§3)                                  | —                                            |
| `src/modules/project/schema.integration.test.ts`         | Sale el `describe` del criterio 11 del slice 9, y los imports que queden sin uso          | el archivo                                   |
| `src/modules/workspace/service.integration.test.ts`      | El `update` de `:507-510` escribe `weekStart`                                             | el test de `joinedAt` (D-R9-2)               |
| `src/modules/time-entry/person-keys.integration.test.ts` | Los `toMatchObject` del relleno de la `0013` sin `weeklyCapacityMinutes`                  | el test del relleno                          |
| `drizzle/` (solo en B)                                   | `0019_drop_unused_columns.sql`, su instantánea y su entrada del diario                    | `db:migrate` sobre una base con datos (§9.3) |
| `src/server/db/schema.integration.test.ts` (nuevo, en B) | Las doce columnas no están; `who_sees_all_entries` sí (§9.2)                              | el archivo                                   |

- **Los tipos `WorkspaceRow` y `MembershipRow`** (`workspace/repository.ts:17-18`)
  pierden los campos. Nada los lee (D-WS0-3); `WorkspaceContext` los lleva sin
  cambio de forma para quien lo usa.
- **El criterio 11 del slice 9 deja de valer**: PR-59 lo sigue cumpliendo
  `can()`, que da `project.create` y `client.create` a toda membresía activa, y
  lo prueba `permissions.test.ts`.
- **Sin cambio**: `e2e/`, `scripts/report-volume/`, las fábricas y consultas de
  `src/test/`, todo módulo fuera de los tres tests, la interfaz, `CLAUDE.md` y
  `.github/`.

## 2. Esquema y migración

### 2.1 El esquema de A

```ts
export const workspace = pgTable("workspace", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  /** Zona horaria del owner. Fija el día en que corren los trabajos de cron. */
  timezone: text("timezone").notNull().default("America/Argentina/Buenos_Aires"),
  createdAt: …,
  updatedAt: …,
});

export const workspaceSettings = pgTable("workspace_settings", {
  workspaceId: …,
  /** El comentario de hoy (`schema.ts:67-71`), sin cambio. */
  whoSeesAllEntries: visibilityScope("who_sees_all_entries").notNull().default("admins"),
  createdAt: …,
  updatedAt: …,
});

// `membership`: sin `weeklyCapacityMinutes`; el resto, sin cambio.
```

Los `…` son las definiciones de hoy, sin cambio. Las relaciones
(`schema.ts:650-652`) no cambian.

### 2.2 La migración de B

`drizzle/0019_drop_unused_columns.sql`, con lo que fija D-WS0-4. **Una instancia
de A** no nombra las columnas, así que la migración corre con A atendiendo sin
romper nada. Las doce sentencias van en la transacción de `drizzle-kit migrate`:
cada `DROP COLUMN` toma un bloqueo exclusivo de su tabla hasta el `commit`, que
espera a las lecturas en curso y frena las nuevas unos milisegundos. Postgres no
reescribe la tabla.

### 2.3 La migración de vuelta (solo si hace falta, D-WS0-7)

Se genera con `npm run db:generate -- --name restore_unused_columns` después de
devolver las doce columnas a `schema.ts` con su definición de hoy, y se compara
con esto antes de correrla:

```sql
ALTER TABLE "membership" ADD COLUMN "weekly_capacity_minutes" integer DEFAULT 2400 NOT NULL;
ALTER TABLE "workspace" ADD COLUMN "logo_url" text;
ALTER TABLE "workspace" ADD COLUMN "currency" char(3) DEFAULT 'ARS' NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "who_sees_rates" "visibility_scope" DEFAULT 'admins' NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "who_creates_projects" "visibility_scope" DEFAULT 'everyone' NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "require_project" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "require_task" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "require_description" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "require_tag" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "force_timer" boolean DEFAULT false NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "timesheet_enabled" boolean DEFAULT true NOT NULL;
ALTER TABLE "workspace_settings" ADD COLUMN "rounding_minutes" integer DEFAULT 0 NOT NULL;
```

Es una migración que agrega: se corre antes del push del código que la
acompaña, como siempre (ADR 0028, regla 7).

## 3. Permisos

**Ningún cambio en `can()`**: ninguna acción nueva, ninguna regla nueva. La
única línea que cambia en `src/server/permissions/index.ts` es el comentario de
`:76-77`, que remite a una columna que deja de existir:

```ts
// Crean proyectos y clientes todas las membresías activas (P-18, workspace
// P-03). Si vuelve a ser configurable, la columna vuelve y estas dos declaran
// un recurso propio que la lleva: ADR 0009.
"client.create": WorkspaceResource;
"project.create": WorkspaceResource;
```

## 4. Contrato

**Sin esquemas Zod nuevos ni cambiados**: WS0 no tiene entrada ni salida. Ninguna
action, service ni componente cambia de firma. Lo único que cambia de forma son
`WorkspaceRow` y `MembershipRow`, inferidos del esquema (§1).

## 5. Pantalla

Ninguna. Nada visible cambia en ninguna pantalla, antes ni después de migrar.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no corre migraciones; las migraciones las corre el usuario
con `!`. **WS0 es el primer borrado**: la migración va después del push de B, no
antes (ADR 0028). E2b y el MCP están en producción con sus migraciones.

### 6.1 La consulta previa

La corre el usuario en producción, con `!`, antes de migrar. Puede ser antes del
push de A.

```sql
-- 1. Las doce columnas: tienen que estar las doce, con la definición de D-WS0-1.
select table_name, column_name, data_type, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and (table_name::text, column_name::text) in (
    ('workspace', 'logo_url'), ('workspace', 'currency'),
    ('workspace_settings', 'who_sees_rates'), ('workspace_settings', 'who_creates_projects'),
    ('workspace_settings', 'require_project'), ('workspace_settings', 'require_task'),
    ('workspace_settings', 'require_description'), ('workspace_settings', 'require_tag'),
    ('workspace_settings', 'force_timer'), ('workspace_settings', 'timesheet_enabled'),
    ('workspace_settings', 'rounding_minutes'), ('membership', 'weekly_capacity_minutes'))
order by table_name, column_name;

-- 2. Lo que guardan: la única copia después de borrar (D-WS0-9).
select w.created_at, w.logo_url, w.currency,
       s.who_sees_rates, s.who_creates_projects,
       s.require_project, s.require_task, s.require_description, s.require_tag,
       s.force_timer, s.timesheet_enabled, s.rounding_minutes
from workspace w
left join workspace_settings s on s.workspace_id = w.id
order by w.created_at, w.id;

select weekly_capacity_minutes, count(*) as membresias
from membership
group by 1
order by 1;

-- 3. Las filas, para comparar después de migrar.
select (select count(*) from workspace) as workspaces,
       (select count(*) from workspace_settings) as ajustes,
       (select count(*) from membership) as membresias;

-- 4. Las últimas migraciones aplicadas.
select id, hash, created_at
from drizzle.__drizzle_migrations
order by created_at desc
limit 3;
```

Lo esperado y qué se hace si no:

- **La 1**: doce filas. **Menos de doce** frena: alguien borró una a mano, y la
  migración fallaría en esa sentencia; se averigua antes de seguir.
- **La 2**: un workspace, con `logo_url` nula, `currency` `ARS`, `admins`,
  `everyone`, cuatro `false`, `false`, `true` y `0`; y una sola fila de
  capacidad, `2400`, con todas las membresías. **Otro valor** no frena
  (D-WS0-9): se anota en el registro. **Un workspace sin fila de ajustes**
  (nulos en las columnas de `s`) no frena: WS0 no la crea (WS-73).
- **La 3**: los conteos se guardan.
- **La 4**: la primera fila tiene el `created_at` igual al `when` de la última
  entrada del diario de `main` antes de B (la `0018`). **Otro** frena:
  producción no está al día con `main`, y se resuelve antes de migrar, porque
  `db:migrate` correría también lo que falte.

### 6.2 El merge y el push de A

El team-lead mergea A (`git merge --no-ff <A>`) y pushea. Vercel despliega.
**No hay migración que correr.** Mientras Vercel cambia de versión no hay
ventana: las dos versiones funcionan con las columnas. **Hasta que la corrida de
CI de ese push termine, no se pushea nada más a `main`** (D-WS0-5, paso 0).

### 6.3 La comprobación de A en producción

1. **D-WS0-5, pasos 0 a 2**: la corrida de CI del merge de A en `success` con
   sus tres jobs; el último deployment de producción contiene A y está en
   `success`; y pasaron diez minutos desde el `success` del primero que lo
   contuvo.
2. **La verificación de humo**: el owner entra a `/`, `/planilla`,
   `/calendario`, `/reportes`, `/equipo` y `/perfil`, y todas cargan con sus
   datos. A no cambia nada visible: el humo prueba que A atiende contra la base
   con las columnas.
3. **El script rebasado**, commiteado y probado (D-WS0-6, §9.4).

Si algo falla acá, la reversión es la de antes de migrar (§6.7).

### 6.4 El merge y el push de B

El team-lead mergea la rama (B) y pushea. Vercel despliega de nuevo, con el
mismo código. **Recién ahora** la migración está en `main`. Las bases
compartidas todavía no la reciben (D-WS0-8).

### 6.5 La migración

El usuario corre, desde `/home/maxi/program/clock` con `main` actualizado:
`DATABASE_URL=<prod> npm run db:migrate`, con `!`. Control, enseguida:

```sql
-- La 1 de §6.1 otra vez: cero filas.

-- 5. Lo que queda de `workspace_settings`.
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'workspace_settings'
order by ordinal_position;

-- 6. El tipo sigue.
select typname from pg_type where typname = 'visibility_scope';

-- La 3 de §6.1 otra vez: los mismos conteos.
-- La 4 de §6.1 otra vez: la primera fila, con el `created_at` igual al `when` de la `0019`.
```

Lo esperado: la 1 vacía; en la 5, `workspace_id`, `who_sees_all_entries`,
`created_at` y `updated_at`; en la 6, una fila; los conteos de antes; y la
`0019` aplicada. **Si la 1 todavía trae las doce** y la 4 no muestra la `0019`,
`drizzle-kit` la salteó por el `when` (D-WS0-4): no se toca nada a mano; se
avisa al team-lead, que regenera B sobre `main` con un `when` posterior.

### 6.6 Después de migrar

1. **Los logs de Runtime de producción** en Vercel, filtrados por
   `does not exist`, sin resultados durante quince minutos (D-WS0-5).
2. **La verificación de humo** de §6.3 otra vez.
3. **Las bases compartidas**: la local `clock`, `clock_test` y la rama `preview`
   de Neon, con lo que pide D-WS0-8.

### 6.7 Reversión

- **Antes de §6.5**: `git revert -m 1 <merge de A>` (y antes el de B, si ya
  estaba) y push. No hay base que tocar.
- **Después de §6.5**: la migración de vuelta de §2.3, generada, comparada y
  corrida en producción con `!`, y después el push de su commit. La aplicación
  de A no cambia. **No** `git revert` del merge de B y **no** Instant Rollback
  a un deployment anterior al merge de A: los dos dejan la aplicación nombrando
  columnas que no están, o el diario sin la `0019` con la base migrada.
- **Lo que no vuelve**: los valores de la consulta 2, si no eran los `default`.

### 6.8 Previews y la base local

- **Hasta §6.5**, ninguna base compartida tiene B. Una suite que corra desde
  `main` entre §6.4 y §6.5 usa `TEST_DATABASE_URL` y `DATABASE_URL` hacia bases
  propias (D-WS0-8).
- **La rama `preview` de Neon** recibe B con `!` después de §6.5, con las ramas
  de preview rebasadas (D-WS0-8). Un preview de la rama de WS0 funciona con y
  sin B.
- **La base local `clock`** recibe B con `npm run db:migrate` desde `main`
  después de §6.5, y `clock_test`, en la primera tanda desde `main` después de
  §6.5. Desde ahí, los worktrees abiertos se rebasan.

## 7. Reparto de archivos

### backend-dev

- **Commit A**: `src/server/db/schema.ts` (§2.1),
  `src/server/permissions/index.ts` (§3) y los tres tests de D-WS0-3. Corre la
  búsqueda de D-WS0-3 y la suite de §9.1 contra bases propias (D-WS0-8). Las
  correcciones de las revisiones de A van como commits antes de B.
- **Commit B**, cerradas las revisiones de A y con la rama rebasada sobre
  `main`: `npm run db:generate -- --name drop_unused_columns` y
  `src/server/db/schema.integration.test.ts` (§9.2). Revisa la migración con la
  lista de D-WS0-4 y pega el SQL y la diferencia de la instantánea en el
  registro. Si hay que regenerarla, con el procedimiento de D-WS0-2.
- **Las pruebas de §9.3**, con su salida en el registro.
- **El script** (D-WS0-6, §9.4), en su worktree y su rama, cuando el team-lead
  lo pida, después del merge de A: el respaldo, el rebase, el ajuste, el commit
  de D-E1b-10 y la prueba. No va en la rama de WS0.
- **El registro del slice**: `docs/slices/correcciones-fase2-ws0-revisiones.md`.

### e2e-tester

Sin cambios de código: `e2e/` no nombra las columnas. Corre la suite entera con
A contra una base sin B y con B contra una base nueva y una reusada (§9.1, §9.3),
con bases propias.

### parity-analyst

Correcciones fechadas, «_Corregido el <fecha>, WS0_», que dicen que la columna
se borró con la `0019`:

- `workspace.md`: la tabla de la §14 (la columna «Hoy» de las doce filas pasa a
  «Borrada en WS0») y P-05.
- `equipo.md`: el esquema del encabezado (`:40-43`, «`weekly_capacity_minutes`
  (sin uso)»), EQ-72 («la columna sigue sin uso») y P-09: la decisión 1 del §7
  del mapa la borró.
- `perfil.md:430`: «`weekly_capacity_minutes` sigue sin uso».
- `proyectos.md`: PR-11 (`:181-183`, «El workspace ya tiene su `currency` y
  alcanza»: ya no la tiene, y la moneda vuelve con su consumidor), la mención de
  `whoCreatesProjects` de la §6 (`:637`, `:651`) y P-18.
- `reportes.md`, RP-36 (`:1681`): `rounding_minutes` ya no existe.

### Lo que no toca nadie

`e2e/`, `scripts/` de la aplicación, `src/test/`, todo `src/modules/` fuera de
los tres tests, `src/components/`, `src/app/`, `CLAUDE.md`, `.github/` y los ADR
0009 y 0020.

### Orden

1. `backend-dev`: A, con la suite verde contra una base sin B (§9.1).
2. **Las revisiones de A** (backend, clean code, tests) y la e2e de
   `e2e-tester` con A. Sus correcciones son commits que tocan `src/`, antes de
   B. `parity-analyst`, en paralelo, en cualquier momento.
3. **Cerradas las revisiones de A**: el rebase sobre `main`, si cambió, y B
   (D-WS0-4).
4. **La revisión de B**, aparte: la de backend, con la lista de D-WS0-4 sobre el
   SQL y la instantánea; `backend-dev` con §9.3 y `e2e-tester` con la e2e de B.
5. El merge de A, la comprobación de §6.3 (D-WS0-5, pasos 0 a 3), el script
   (`backend-dev`), el merge de B y la migración (§6).

## 8. Criterios de aceptación

1. **A no nombra las columnas**: la búsqueda de D-WS0-3 da cero coincidencias
   sobre `src`, `e2e` y `scripts`; `npm run lint`, `npm run typecheck` y
   `npm test` pasan.
2. **A funciona con las columnas en la base**: `npm run test:integration` y la
   e2e entera pasan contra bases nuevas migradas con el `drizzle/` de A, que no
   tiene B. Es la versión que atiende producción entre §6.2 y §6.5.
3. **A crea filas con las columnas presentes**: en esa base, un workspace de
   arranque, una membresía que nace de una invitación y una de una fábrica
   quedan con el `default` en las columnas borradas, leído con SQL.
4. **B trae solo el borrado**: el SQL tiene las doce sentencias de D-WS0-4 y
   nada más; la instantánea difiere de la anterior solo en esas doce columnas;
   la entrada del diario es la última, con el `when` mayor. En la rama, ningún
   commit posterior al primero que toca `drizzle/` toca `src/` fuera del test
   de B.
5. **B deja lo que dice D-WS0-1**: el test nuevo afirma que las doce columnas no
   están, que `workspace_settings` tiene `workspace_id`, `who_sees_all_entries`,
   `created_at` y `updated_at`, y que `visibility_scope` existe.
6. **B sobre una base con datos**: una base migrada hasta la última anterior a B
   y sembrada —un workspace, sus ajustes, membresías de cada estado, entradas,
   invitaciones— recibe B con `npm run db:migrate`; los conteos de la consulta 3
   no cambian, y la suite de integración y la e2e pasan contra ella.
7. **La suite entera con B**, en una base nueva y en la del criterio 6.
8. **El orden importa** (evidencia del ADR): con el árbol anterior a A y la base
   del criterio 6 ya migrada, `ensureWorkspaceContext` falla con `42703`
   nombrando una de las columnas. Se corre una vez, **al final**, después de
   los criterios 6, 7 y 10, y queda en el registro.
9. **El script rebasado** (D-WS0-6): su `typecheck` y sus tests pasan; contra una
   base migrada con B, `--dry-run` y `--apply` terminan con los totales del
   informe, y un segundo `--dry-run` no tiene a nadie nuevo; contra una base sin
   B, `--dry-run` también termina. El script de `dae5193`, contra la base con B,
   falla en `soleWorkspace` con `42703` y no escribe nada. Con D-E1b-10, lo que
   pide el contrato de E1b (§6.6).
10. **Las consultas de §6** corren sin error contra una base local sembrada, antes
    y después de B, y dan lo que dice su comentario. La salida va al registro,
    con la siembra.
11. **Las correcciones de paridad** de §7 están, fechadas.

## 9. Plan de tests

### 9.1 Con A (sin B)

- `npm run lint`, `npm run typecheck`, `npm test`.
- `TEST_DATABASE_URL=…/clock_ws0_test npm run test:integration` sobre una base
  vacía: la tanda la migra con el `drizzle/` de A.
- La e2e entera contra `clock_ws0_e2e`, nueva, migrada con
  `DATABASE_URL=…/clock_ws0_e2e npm run db:migrate` desde A.
- El criterio 3, a mano con `psql` contra la base de integración después de la
  tanda, o con un test de una vez que no se commitea: con B ya no hay columna
  que leer.

### 9.2 El test de B

`src/server/db/schema.integration.test.ts`, nuevo, con una lectura de
`information_schema.columns` y `pg_type` (criterio 5). Tiene que poder fallar:
se verifica quitando una sentencia de la `0019` en una copia y corriendo la
tanda contra una base nueva; el test falla nombrando esa columna.

### 9.3 Con B

En este orden:

1. La suite entera (`test:all` y la e2e) contra bases nuevas
   (`clock_ws0_test_b`, `clock_ws0_e2e_b`).
2. **La subida con datos** (criterios 6 y 10): `clock_ws0_upgrade`, migrada
   desde el árbol de A, sembrada con el `seed.sql` del volumen del reporte o con
   las fábricas; las consultas de §6.1; `npm run db:migrate` desde B; las de
   §6.5.
3. **La suite contra esa base** (criterios 6 y 7): la e2e con
   `DATABASE_URL=…/clock_ws0_upgrade` y la integración con
   `TEST_DATABASE_URL=…/clock_ws0_upgrade`.
4. **El orden importa** (criterio 8), al final: un worktree temporal en el
   commit anterior a A, y la integración de `workspace/service` con
   `TEST_DATABASE_URL=…/clock_ws0_upgrade`. Falla con `42703`. Va última porque
   la integración trunca las tablas (`src/test/database.ts:11`) y su
   `global-setup` no tiene nada que aplicar sobre una base más nueva. El
   worktree se borra después.

### 9.4 El script

En su worktree, después del rebase y del commit de D-E1b-10:

- `npm run typecheck` y `npx vitest run scripts/import-clockify`.
- **Dos bases propias**, `clock_ws0_import_a` (migrada hasta la última anterior
  a B) y `clock_ws0_import_b` (con B), cada una con la siembra mínima por SQL:
  un `user` owner con un correo que no está en `personas.json`, el workspace,
  su fila de ajustes y la membresía `owner`.
- Con los archivos de `/home/maxi/program/clock-importacion-clockify/`:
  `--dry-run` en las dos; `--apply` y un segundo `--dry-run` en la de B.
- `dae5193` (la rama de respaldo, en un worktree temporal) con `--dry-run`
  contra la de B: falla con `42703` en `soleWorkspace`.
- **El registro guarda solo conteos y mensajes de error**: los archivos traen
  nombres y correos reales, que no entran al repositorio. Las bases se borran
  después.

### 9.5 Lo que no se prueba

La comprobación de CI y de Vercel de D-WS0-5 y los logs de §6.6: son de
producción y los hace el team-lead o el usuario en el momento. Ninguna pantalla
cambia, así que no hay e2e nueva.

## 10. Riesgos

- **Migrar antes de que A atienda** deja caída la aplicación: todo pedido con
  sesión falla con `42703` hasta que A atienda. Lo evitan D-WS0-2 (la migración
  no está en `main` hasta el merge de B) y D-WS0-5.
- **Un push a `main` antes de que termine la corrida de CI de A** la cancela, y
  la prueba de A contra la base con las columnas no queda hecha. Lo evita el
  paso 0 de D-WS0-5.
- **Instant Rollback a un deployment anterior a A**, después de migrar, deja la
  aplicación caída. La salida es §6.7. El usuario lo sabe por el ADR 0028.
- **Una migración salteada por el `when`**: si B se generó antes de una
  migración que ya corrió, `db:migrate` no la aplica y no avisa. Lo detecta la
  consulta 4 de §6.5; lo evita D-WS0-4.
- **Un `db:generate` en un árbol con A sin B** repetiría el borrado en otra
  migración. Lo evita D-WS0-2: nadie lo corre ahí, nada con migración entre los
  dos merges, y WS2a y E4 arrancan desde un `main` con B.
- **Una base compartida migrada antes de tiempo** rompe los árboles sin A
  (D-WS0-8): la rama `preview` de Neon, `clock` y `clock_test`. Una tanda de
  integración desde `main` entre §6.4 y §6.5 sin `TEST_DATABASE_URL` le aplicaría
  B a `clock_test`.
- **El rebase del script atraviesa seis slices** y puede chocar en
  `package.json` y en las firmas que usa; lo cubre el `typecheck` y la prueba de
  §9.4. Sin el rebase, el script viejo falla sin escribir: nadie pierde horas,
  pero las corridas esperan.
- **Un lector que se escapó** de la búsqueda aparece como `42703` en los logs
  después de migrar (§6.6). La salida rápida es la migración de vuelta de §2.3,
  que no pide tocar el código; después se arregla el lector.
- **El bloqueo exclusivo** de cada `DROP COLUMN` frena unos milisegundos las
  lecturas de `workspace`, `workspace_settings` y `membership`, y espera a una
  transacción larga que las esté leyendo. Con el tamaño de producción, no se
  nota.

## 11. Lo que el mapa dice y el árbol no

Verificado contra `eb2ba2d` y `drizzle-orm` 0.45.3:

- **No son solo las lecturas**: el mapa dice que «las lecturas con `select()`
  nombran todas las columnas». También las nombran todo `insert` de Drizzle,
  con `default` en las que faltan (`dialect.js:356-404`), y `returning()` sin
  argumentos. Una versión vieja con la base migrada falla también al crear una
  membresía (aceptar una invitación) y en el arranque.
- **No es solo `membership`**: `findFirstWorkspace` lee el workspace entero en
  cada pedido con sesión (`workspace/service.ts:165`) y en el gancho
  `session.create.after` (`:419`), y nombra `currency` y `logo_url`.
- **El script también escribe `membership`**: el mapa dice que «de
  `membership` lee columnas nombradas, sin `weekly_capacity_minutes`». Es cierto
  para sus lecturas, pero `ensurePeople` inserta membresías con Drizzle
  (`main.ts:509-517`), que nombra la columna. El rebase hace falta por las dos
  tablas.
- **El script parte de la `0014`**, no del árbol de hoy: su rebase atraviesa
  E1a … el MCP, y con él va D-E1b-10, pendiente desde E1b (§6.6 de E1b).
- **Los lectores de `src/` son los que el mapa nombra**, con dos detalles: el
  test de PR-59 son dos tests en un `describe` que sale entero, y `schema.ts`
  pierde además los imports `char` e `integer`.
- **`equipo.md` todavía dice que la columna de capacidad «sigue sin uso»**
  (EQ-72, P-09, `:41`), y `proyectos.md` PR-11 que la `currency` del workspace
  «alcanza». La decisión 1 del §7 del mapa los supera; los corrige
  `parity-analyst` (§7).
- **El mapa no da el número de la migración**: con E2b y el MCP mergeados antes,
  es la `0019` (D-WS0-4).

## 12. Preguntas para el usuario

1. **¿Se acepta el ADR 0028?** Cambia, solo para los borrados, la regla de
   correr la migración antes del push: en WS0 se corre **después del push de
   B**, con A ya atendiendo, desde `main`. **Recomendación: aceptarlo.** Es lo
   que evita dejar la aplicación caída mientras Vercel cambia de versión, y
   deja la regla de siempre para todo lo que agrega.

## 13. Fuera de alcance

- **`who_sees_all_entries`**, congelada por el ADR 0020 (WS-42): no se borra.
- **El valor `invited` de `membership_status`**: deuda del mapa (§6); quitar un
  valor de un enum pide recrear el tipo.
- **Las columnas nuevas de `workspace_settings`**: el formato de duración (WS2a)
  y el primer día por defecto (E4), cada una con su slice, desde un `main` con
  B.
- **El logo** (WS-07, workspace P-01) y **la capacidad y los días laborables**
  (EQ-72, WS-09, P-09 y P-06): si algún día entran, sus columnas vuelven con su
  consumidor.
- **Cambiar cómo el script identifica a las personas**: sigue por correo
  (decisión del usuario del 2026-10-19, §6.7 de E2b).
- **Una regla de operación nueva en `CLAUDE.md`**: la escribe el team-lead si el
  usuario acepta el ADR.
