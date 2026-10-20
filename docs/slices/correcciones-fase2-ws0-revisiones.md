# WS0: implementación y revisiones

Rama `fase2/ws0-columnas` desde `main` en `eb2ba2d`, en el worktree
`/home/maxi/program/clock-ws0` (fuera del repositorio). Contrato:
[`fase2-ws0-columnas.md`](fase2-ws0-columnas.md); ADR
[0028](../adr/0028-borrar-columnas-primero-el-codigo-despues-la-migracion.md),
aceptado por el usuario el 2026-10-20.

## Commit A

`608a000`, sin nada en `drizzle/`: `src/server/db/schema.ts` (§2.1),
`src/server/permissions/index.ts` (§3) y los tres tests de D-WS0-3.

- **El árbol no está rebasado**: `main` sigue en `eb2ba2d`, sin E2b ni el MCP
  (§0). Las citas del contrato valen sin corrimiento. El rebase, y la búsqueda
  otra vez, van antes de B (D-WS0-4).
  _Corregido el 2026-10-20_: la rama se rebasó sobre `main` con E2b
  (`80e2f6c`) antes de B; A es ahora `7eeb86b` y la corrección de
  `roundMinutes`, `8866893` (ver «Rebase y commit B»).
- **`project/schema.integration.test.ts`**: sale el `describe` del criterio 11
  del slice 9 entero, y con él los imports que solo usaba —`workspaceSettings`,
  `seedUser` y `workspaceRepository`—. `readFile` y `join` siguen: los usa otro
  test del archivo.

### La búsqueda de D-WS0-3

Antes de A, sobre `eb2ba2d`, la búsqueda encontró cinco archivos de `src/` —los
que lista el contrato, que dice «cuatro» y nombra cinco— y ninguno de `e2e/` ni de `scripts/`:

| Archivo                                                  | Líneas                                          |
| -------------------------------------------------------- | ----------------------------------------------- |
| `src/server/db/schema.ts`                                | `:49-50`, `:73`, `:79`, `:82-87`, `:89`, `:109` |
| `src/server/permissions/index.ts`                        | `:76` (el comentario de `client.create`)        |
| `src/modules/project/schema.integration.test.ts`         | `:485`, `:513`, `:519`, `:535`                  |
| `src/modules/workspace/service.integration.test.ts`      | `:509`                                          |
| `src/modules/time-entry/person-keys.integration.test.ts` | `:356`, `:362`                                  |

Con A: cero coincidencias (`rg` sale con código 1).

### Corridas con A, sin B

| Corrida                                                                       | Resultado                      |
| ----------------------------------------------------------------------------- | ------------------------------ |
| `npm run lint`                                                                | sin errores                    |
| `npm run typecheck`                                                           | sin errores                    |
| `npm test`                                                                    | 2 archivos, 305 tests en verde |
| `TEST_DATABASE_URL=…/clock_ws0_back npm run test:integration` (hasta la 0016) | 30 archivos, 1838 en verde     |

**Criterio 3**, con un test de una vez que no se commitea, contra
`clock_ws0_back` con las columnas: el arranque por `ensureWorkspaceContext`
(owner), una membresía que nace de una invitación `pending` aceptada en el
primer ingreso, y una de `seedMember`. Leídas con SQL: el workspace con
`logo_url` nula y `currency` `ARS`; los ajustes con `admins`, `everyone`, cuatro
`false`, `false`, `true` y `0`; las tres membresías con
`weekly_capacity_minutes` `2400`. El archivo se borró después de la corrida.

La e2e (§9.1) es de `e2e-tester`.

## e2e con A

Commit `608a000` (A), sin B, contra `clock_ws0_e2e`, una base nueva migrada
hasta la `0016`, con las doce columnas presentes. Sin cambios en `e2e/`.

| Corrida                                                        | Resultado              |
| -------------------------------------------------------------- | ---------------------- |
| `DATABASE_URL=…/clock_ws0_e2e npm run test:e2e` (suite entera) | 235 en verde (1,9 min) |

Sin fallos ni flakes: ningún spec se repitió. Ruido sin fallos, el de siempre:
18 `Error: The destination stream closed early.` de Next en el log del servidor.

## Correcciones de las revisiones de A

- `afae472`: sale `roundMinutes` de `src/server/time/index.ts`, con su
  `describe` y su import en `time.test.ts`. Sin `rounding_minutes` quedaba sin
  llamador, y su comentario «Redondeo de reportes» describía algo que no existe
  (menor de clean code; lo decidió el team-lead). `npm run lint`,
  `npm run typecheck` y `npm test` en verde: 95 archivos y 2286 tests, y 2 y 303
  en `TZ=America/Argentina/Buenos_Aires`; los dos tests menos de cada corrida
  son los del `describe`.

## Rebase y commit B

_Corregido el 2026-10-20_: el contrato decía que la migración salía `0019`, con
E2b y el MCP mergeados antes. El MCP se postergó y WS0 entra antes que él, así
que es la `0018`, y el MCP regenera la suya como `0019`. Las citas del contrato
y de `docs/parity/` pasaron a `0018`.

**Rebase** de `fase2/ws0-columnas` sobre `main` en `80e2f6c` (el merge de E2b,
con `0017_membership_account_link`), sin conflictos. Después de A
(`7eeb86b`) quedan solo commits de `docs/` y `8866893`, el de `roundMinutes`.
El MCP no está en `main`. **La búsqueda de D-WS0-3 sobre el árbol rebasado: cero
coincidencias**; E2b no suma lectores con nombre. Tampoco queda `roundMinutes`.

**B** se generó con `npm run db:generate -- --name drop_unused_columns`, sin
preguntas de renombre: `drizzle/0018_drop_unused_columns.sql`, con `when`
`1792502701085`, mayor que el `1792456513460` de la `0017`, y la última entrada
del diario (`idx` 18). Sin editar a mano:

```sql
ALTER TABLE "membership" DROP COLUMN "weekly_capacity_minutes";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "who_sees_rates";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "who_creates_projects";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_project";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_task";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_description";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "require_tag";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "force_timer";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "timesheet_enabled";--> statement-breakpoint
ALTER TABLE "workspace_settings" DROP COLUMN "rounding_minutes";
```

La lista de D-WS0-4: las doce sentencias; ningún `DROP TYPE`, `CASCADE`,
`CREATE`, `ADD`, `RENAME` ni `UPDATE`, y ninguna otra tabla.

**La instantánea**, `0018_snapshot.json` contra `0017_snapshot.json`, comparadas
como JSON: `id` `2dd1fdeb…` → `7f8a2d03…`, con `prevId` `2dd1fdeb…`; fuera de
`tables`, nada distinto; en `tables`, solo tres tablas, sin columnas agregadas
ni cambiadas y sin cambios en índices, claves ni `check`:

| Tabla                       | Columnas quitadas                                                                                                                                                         |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `public.membership`         | `weekly_capacity_minutes`                                                                                                                                                 |
| `public.workspace`          | `currency`, `logo_url`                                                                                                                                                    |
| `public.workspace_settings` | `force_timer`, `require_description`, `require_project`, `require_tag`, `require_task`, `rounding_minutes`, `timesheet_enabled`, `who_creates_projects`, `who_sees_rates` |

**El test de B** (§9.2), `src/server/db/schema.integration.test.ts`, cinco
tests. Puede fallar: con una copia de `drizzle/` sin la sentencia de
`who_sees_rates`, aplicada con el migrador a `clock_ws0_b_mut` (nueva), fallan
dos tests y los dos nombran la columna: «ya no tiene» recibe
`["who_sees_rates"]` en vez de `[]`, y la lista de `workspace_settings` la trae
entre `who_sees_all_entries` y `created_at`.

## Pruebas con B (§9.3)

**1. La suite contra una base nueva**, `clock_ws0_b_full`:

| Corrida                                                 | Resultado                  |
| ------------------------------------------------------- | -------------------------- |
| `npm run lint`, `npm run typecheck`                     | sin errores                |
| `npm test`                                              | 97 y 2407; 2 y 303 (TZ AR) |
| `TEST_DATABASE_URL=…/clock_ws0_b_full npm run test:all` | integración: 31 y 1950     |

La e2e con B no la corrió `backend-dev`: levanta `:3000`. Queda para
`e2e-tester`.

**2. La subida con datos** (criterios 6 y 10), `clock_ws0_b_upgrade`, nueva,
migrada con el migrador desde el `drizzle/` de `8866893` (hasta la `0017`) y
sembrada con `scripts/report-volume/seed.sql` (un workspace, su fila de
ajustes, 31 membresías: 28 `active`, 2 `inactive`, 1 `invited`; 187 685
entradas, 5 abiertas) más tres invitaciones, una por estado:

```sql
insert into invitation (workspace_id, email, status, invited_by_id, accepted_at, revoked_at) values
  ('00000000-0000-4000-8000-000000000001', 'pendiente@empresa.com', 'pending', 'volume-user-01', null, null),
  ('00000000-0000-4000-8000-000000000001', 'aceptada@empresa.com', 'accepted', 'volume-user-01', now(), null),
  ('00000000-0000-4000-8000-000000000001', 'revocada@empresa.com', 'revoked', 'volume-user-01', null, now());
```

Las consultas de §6.1, antes de B, sin error:

- **La 1**: doce filas, con la definición de D-WS0-1 (`'ARS'::bpchar`,
  `'everyone'::visibility_scope`, `'admins'::visibility_scope`, `logo_url`
  nula).
- **La 2**: un workspace con `logo_url` nula, `ARS`, `admins`, `everyone`,
  cuatro `f`, `f`, `t` y `0`; una fila de capacidad, `2400`, con las 31.
- **La 3**: `1 | 1 | 31`.
- **La 4**: primera fila `created_at` `1792456513460` (la `0017`), después
  `1792168433434` y `1792161296629`.

`DATABASE_URL=…/clock_ws0_b_upgrade npm run db:migrate` desde B: «migrations
applied successfully». Las de §6.5:

- **La 1**: cero filas.
- **La 5**: `workspace_id`, `who_sees_all_entries`, `created_at`, `updated_at`.
- **La 6**: `visibility_scope`.
- **La 3**: `1 | 1 | 31`, los mismos.
- **La 4**: primera fila `created_at` `1792502701085`, el `when` de la `0018`.

Los estados de membresías e invitaciones y las entradas, iguales antes y
después.

**3. La suite contra esa base**: `TEST_DATABASE_URL=…/clock_ws0_b_upgrade npm
run test:integration`, 31 archivos y 1950 en verde. La e2e contra ella, de
`e2e-tester`.

**4. El orden importa** (criterio 8), al final: un worktree temporal en
`384daa4`, el commit anterior a A (su `src/` y su `drizzle/` son los de
`main`), con `src/modules/workspace/service.integration.test.ts` y
`TEST_DATABASE_URL=…/clock_ws0_b_upgrade`. Fallan los 47 tests, todos con `42703`
en una de dos sentencias de Drizzle que nombran `logo_url` y `currency`: el
`insert` de `workspace` del arranque (`column "logo_url" of relation
"workspace" does not exist`) y el `select()` de `findFirstWorkspace` en
`ensureWorkspaceContext` (`column "logo_url" does not exist`). Vitest agrupa
los errores iguales: son 45 bloques para 47 tests. El worktree se borró
después.
