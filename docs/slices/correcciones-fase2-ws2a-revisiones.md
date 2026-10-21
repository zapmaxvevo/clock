# WS2a: implementación y revisiones

Rama `fase2/ws2a-formato` desde `main` en `c08369d`, en el worktree
`/home/maxi/program/clock-ws2a` (fuera del repositorio). Contrato:
[`fase2-ws2a-formato.md`](fase2-ws2a-formato.md) en `1eab1e3`; ADR
[0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md),
aceptado por el usuario el 2026-10-20 (`636a898`).

El 2026-10-21 la rama se rebasó sobre `main` en `467e730`, con WS1 (ver
«Rebase sobre `main`»). Hasta «Corridas finales», los hashes son los de antes
del rebase; la tabla de esa sección da los nuevos.

## Respuestas del usuario

El 2026-10-20, por el team-lead:

- **Pregunta 2** (los `check` de `workspace.name`): **sí**. La consulta 4 de
  §6.1 no se corrió en producción: los workspaces de producción se llaman
  «run0km» y «soybot», que cumplen las dos condiciones. La `0019` se regeneró
  con ellos (ver «La migración»).
- **Pregunta 3** (los segundos sueltos de una celda con el completo): **no se
  tocan**. D-WS2a-8 queda como está.
- **Pregunta 1** (el ADR 0029): **aceptado**, después de que se le explicara
  (`636a898`).

## Backend

### Paso 1

`a9d5258`, el commit que fija tipos y firmas (§7, «Orden», paso 1): compila,
con `lint`, `typecheck` y `npm test` en verde.

- `src/server/time/index.ts`: `DURATION_FORMATS`, `DurationFormat`,
  `DisplayFormats.duration` y `formatDuration(seconds, format)`, ya con su
  cuerpo final (la firma no se escribe sin él).
- `WorkspaceContext.settings`, con `contextOf` en `compact` fijo hasta el paso
  2; `timeSettingsOf` ya lee `context.settings.durationFormat`.
- `defaultFormats` con `duration: "compact"`.
- Los llamadores pasan segundos —`seconds`, o `minutes * 60`— con un
  `"compact"` provisorio. Los dos del reporte quedan con el `"compact"` de
  D-WS2a-9.
- Los literales de formatos de la lista de §7, más dos que `tsc` encontró y la
  lista no nombra, sin cambiar lo que afirman:
  - `src/modules/time-entry/components/calendar/calendar-block.test.tsx:153`
    (el literal del caso «el día sale con el formato de fecha de la persona»);
  - `src/modules/time-entry/service.integration.test.ts:6973` (el
    `getCalendarState` con `12h` y `MM/dd/yyyy`), y el `toEqual` de
    `timeSettingsOf` de `:5444`, que no deja de compilar pero falla sin la
    clave nueva.
  - Los dos ayudantes que arman `ProfileContext` a mano
    (`profile/service.integration.test.ts:64`,
    `time-entry/service.integration.test.ts:4046`) suman `settings`; en el
    paso 2 lo toman de `findFirstWorkspace` con `resolveDurationFormat`.
  - `src/server/time/time.test.ts`: las cuatro llamadas de hoy pasan
    `minutos * 60` y `"compact"`.

### Paso 2

| Commit    | Qué                                                                                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `9e55d48` | `parseDurationInput` con `h:mm:ss`; `time.test.ts` con los criterios 1, 3 y 4                                               |
| `94faef9` | `workspace_settings.duration_format` y la primera `0019`, sin los `check` del nombre (reemplazada por `3c7187f`)            |
| `1046a24` | `WorkspaceRead`, `findFirstWorkspace` con `left join`, `createWorkspace`, `resolveDurationFormat`, `setDurationFormat`      |
| `b2072e3` | `toView` con `workspace.formats.duration`; el comentario de `durationLabel`; S1 y criterio 6                                |
| `d70fd6e` | El comentario de `cell-text.ts` que remite a WS2b (D-WS2a-9)                                                                |
| `d0516d8` | El test del `join` suma un workspace más viejo sin fila de ajustes (la mutación del `on true` sobrevivía, ver «Mutaciones») |
| `3c7187f` | La `0019` regenerada con los `check` de `workspace.name`, y sus tests en `schema.integration.test.ts`                       |

- **Criterio 1** en `time.test.ts`: `formatDuration(m * 60 + s, "compact")`
  contra una copia de la función anterior, para `m` de 0 a 6000 y `s` de 0 a
  59, y para negativos.
- `src/test/time-entry.ts` **no cambia**: `workspaceOf` ya toma
  `defaultFormats`, y los tests de S1 arman el completo con
  `{ ...workspaceOf(buenosAires), formats: { ...defaultFormats, duration } }`.

### La migración

**Primera versión** (`94faef9`): generada antes de la respuesta a la pregunta
2, sin los `check` del nombre. Traía las dos sentencias de `duration_format`,
con `when` `1792539815324`. Se aplicó solo en bases propias de este agente
(`clock_ws2a_back_test`, `clock_ws2a_upgrade`, `clock_ws2a_compat`), que
quedan sin usar: `drop database` está bloqueado, así que las corridas
siguientes usan bases nuevas con sufijo `2`. Se avisó a `ws2a-e2e` y a
`ws2a-front` para que hagan lo mismo con las suyas; `ws2a-front` no había
aplicado la vieja en ninguna base (solo corrió unidad).

**Versión final** (`3c7187f`), después del «sí»: se borraron el `.sql`, la
instantánea y la entrada del diario (el diario volvió al de `c08369d`) y se
corrió otra vez `npm run db:generate -- --name workspace_duration_format`, con
el esquema de §2.1 **con** los `check` de D-WS2a-10. `drizzle-kit` no preguntó
nada. Nada se editó a mano ni se renombró.

`drizzle/0019_workspace_duration_format.sql`, entero:

```sql
ALTER TABLE "workspace_settings" ADD COLUMN "duration_format" text DEFAULT 'compact' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_len" CHECK (char_length("workspace"."name") between 1 and 100);--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_trimmed" CHECK ("workspace"."name" = btrim("workspace"."name"));--> statement-breakpoint
ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_duration_format_known" CHECK ("workspace_settings"."duration_format" in ('compact', 'full'));
```

Las cuatro sentencias de la lista de D-WS2a-11, en el orden de `drizzle-kit`;
ningún `DROP`, `RENAME`, `UPDATE` ni `CREATE TYPE`, y ninguna otra tabla. La
entrada del diario es la última: `idx` 19, `when` `1792540808202`, mayor que
el `1792502701085` de la `0018`. sha256 del archivo:
`abaf2a27d1c00e7a1a8e3f87902325d2fbf13b19c05bbdbad6a89fe0f2abf3c2` (es el
`hash` que `drizzle-kit migrate` guarda; ver §9.3).

El diff de las instantáneas `0018` → `0019`, con las claves ordenadas: `id` y
`prevId`; en `public.workspace`, los dos `check`; en
`public.workspace_settings`, la columna y su `check`. Nada más.

```diff
<   "id": "7f8a2d03-a3d9-4ce4-b68e-aed5c11647ec",
>   "id": "5799cee7-8a59-407d-89f6-44b207838107",
<   "prevId": "2dd1fdeb-18b6-4d62-85d6-1026948f29d1",
>   "prevId": "7f8a2d03-a3d9-4ce4-b68e-aed5c11647ec",
   (public.workspace)
<       "checkConstraints": {},
>       "checkConstraints": {
>         "workspace_name_len": {
>           "name": "workspace_name_len",
>           "value": "char_length(\"workspace\".\"name\") between 1 and 100"
>         },
>         "workspace_name_trimmed": {
>           "name": "workspace_name_trimmed",
>           "value": "\"workspace\".\"name\" = btrim(\"workspace\".\"name\")"
>         }
>       },
   (public.workspace_settings)
<       "checkConstraints": {},
>       "checkConstraints": {
>         "workspace_settings_duration_format_known": {
>           "name": "workspace_settings_duration_format_known",
>           "value": "\"workspace_settings\".\"duration_format\" in ('compact', 'full')"
>         }
>       },
>         "duration_format": {
>           "default": "'compact'",
>           "name": "duration_format",
>           "notNull": true,
>           "primaryKey": false,
>           "type": "text"
>         },
```

Los escritores de `workspace.name` cumplen los `check`: el arranque
(«Workspace»), `seedWorkspace` («Workspace de prueba»), los dos workspaces de
`workspace/service.integration.test.ts:227-240` («El nuevo», «El viejo») y el
`seed.sql` del volumen («Volumen»).

### §9.3, la migración y la compatibilidad

**1. La subida con datos** (criterios 11 y 13), sobre `clock_ws2a_upgrade2`:
migrada con el `drizzle/` de `c08369d` (un worktree temporal) y sembrada con
`scripts/report-volume/seed.sql`.

- §6.1 antes: la 1 da la `0018` primera (`created_at` `1792502701085`); la 2,
  un workspace con `tiene_ajustes` verdadero; la 3, cero filas en las dos; la
  4, cero filas.
- `npm run db:migrate` desde la rama: aplicó la `0019`.
- §6.3: la 5 da `text`, `'compact'::text`, `NO`; la 6, `compact | 1`; la 7,
  las tres restricciones (`workspace_name_len`, `workspace_name_trimmed`,
  `workspace_settings_duration_format_known`); la 1, la `0019` primera con
  `created_at` `1792540808202` y el `hash` igual al sha256 del archivo.
- §6.1 después: corre sin error; la 3 ahora da la columna y las tres
  restricciones, la 4 sigue en cero.
- Conteos antes y después, iguales: `workspace` 1, `workspace_settings` 1,
  `membership` 31, `time_entry` 187 685.
- Un segundo `db:migrate` no aplica nada (20 filas en
  `drizzle.__drizzle_migrations`).
- Sobre esa base, `duration_format = 'decimal'`, `name = ''`, `name = ' x'` y
  `name = repeat('a', 101)` fallan con su `check`
  (`workspace_settings_duration_format_known`, `workspace_name_len`,
  `workspace_name_trimmed`, `workspace_name_len`).

Las bases de los puntos que siguen son nuevas, con prefijo `clock_ws2a_b2_`:
el agente que empezó §9.3 se cortó, y las corridas se repitieron desde cero
sobre `636a898`.

**2. El código anterior contra la base nueva** (criterio 12):
`clock_ws2a_b2_compat`, migrada desde la rama (20 filas en
`drizzle.__drizzle_migrations`, la última con `1792540808202`), y la
integración entera de un worktree temporal en `c08369d` con
`TEST_DATABASE_URL` en esa base. `global-setup` no aplicó nada (siguen 20
filas). Falla **un solo caso, el esperado**:

```
 FAIL  src/server/db/schema.integration.test.ts > las columnas sin efecto, borradas en la 0018 (WS0, criterio 5) > workspace_settings queda con su clave, who_sees_all_entries y las fechas
AssertionError: expected [ 'workspace_id', …(4) ] to deeply equal [ 'workspace_id', …(3) ]

  [
    "workspace_id",
    "who_sees_all_entries",
    "created_at",
    "updated_at",
+   "duration_format",
  ]

 Test Files  1 failed | 30 passed (31)
      Tests  1 failed | 1949 passed (1950)
```

El worktree se borró después.

**3. La suite entera con la `0019`**: `npm test` y `npm run test:integration`
desde la rama, con la integración en `clock_ws2a_b2_int`, nueva (ver
«Corridas finales»). La e2e en base nueva y en una que se reusa es de
`ws2a-e2e2`, que la corre aparte.

**La reversión de §2.3**, simulada en un worktree temporal: un merge
`--no-ff` de la rama sobre `c08369d` en `HEAD` suelto, y después
`git revert -m 1 --no-commit <merge>`,
`git checkout HEAD -- drizzle/ src/server/db/schema.ts` y `git commit`.

- El diff contra `c08369d` queda en cuatro archivos: la `0019`, su
  instantánea, el diario y `schema.ts`. En `schema.ts`, la columna con su
  comentario y los tres `check`; el comentario nombra `DURATION_FORMATS`, que
  después del revert no existe (no compila distinto: es un comentario).
- `db:generate`: «No schema changes». `lint`, `typecheck` y `npm test`
  (2407 + 303) en verde: el código anterior compila con la columna en el
  esquema.
- **Desvío del contrato**: la integración no queda en verde. El revert devuelve
  `schema.integration.test.ts` a la lista de `c08369d`, y contra una base con
  la `0019` (`clock_ws2a_b2_rev`) falla el mismo `it` del punto 2
  (`1 failed | 4 passed`). El CI corre la integración sobre una base migrada
  con el `drizzle/` del árbol, así que el revert de §2.3 tal como está deja el
  CI en rojo. Sumando `"duration_format"` a esa lista en el árbol revertido,
  el archivo pasa (`5 passed`). No se puede conservar el archivo de la rama con
  el `checkout`: importa `DURATION_FORMATS` y `setDurationFormat`, que el
  revert quita. §2.3 y §6.5 necesitan un paso más: después del `checkout`,
  agregar `"duration_format"` a la lista del `it` de
  `src/server/db/schema.integration.test.ts:40-47` antes del `git commit`. El
  contrato no se tocó; lo decide el team-lead. Se corrigió después de las revisiones, por
  otro camino: ver «La reversión de §2.3, otra vez».

**El bloque `do` de §6.2**, para el editor SQL de Neon, generado con
`/home/maxi/program/clock-ops/do-block.cjs drizzle 19`:

```sql
do $mig$
begin
  if (select max(created_at) from drizzle.__drizzle_migrations) is distinct from 1792502701085 then
    raise exception 'la última migración aplicada no es la 0018_drop_unused_columns';
  end if;
  -- 0019_workspace_duration_format
  ALTER TABLE "workspace_settings" ADD COLUMN "duration_format" text DEFAULT 'compact' NOT NULL;
  ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_len" CHECK (char_length("workspace"."name") between 1 and 100);
  ALTER TABLE "workspace" ADD CONSTRAINT "workspace_name_trimmed" CHECK ("workspace"."name" = btrim("workspace"."name"));
  ALTER TABLE "workspace_settings" ADD CONSTRAINT "workspace_settings_duration_format_known" CHECK ("workspace_settings"."duration_format" in ('compact', 'full'));
  insert into drizzle.__drizzle_migrations (hash, created_at) values ('abaf2a27d1c00e7a1a8e3f87902325d2fbf13b19c05bbdbad6a89fe0f2abf3c2', 1792540808202);
end
$mig$
```

Probado en `clock_ws2a_b2_doblock`: migrada con el `drizzle/` de `c08369d` (19
filas) y sembrada con `seed.sql`. El bloque corre; quedan 20 filas, la última
con el `hash` del archivo y `1792540808202`; la 6 de §6.3 da `compact | 1` y
la 7, las tres restricciones; los conteos (`workspace` 1,
`workspace_settings` 1, `membership` 31, `time_entry` 187 685) no cambian. Un
`db:migrate` desde la rama después no aplica nada (siguen 20 filas), y el
bloque corrido otra vez falla con «la última migración aplicada no es la
0018_drop_unused_columns» sin tocar nada.

## Comprobaciones del árbol

En `636a898`:

- **La búsqueda de §5.6** no deja ningún `"compact"` provisorio. Fuera de
  `src/server/time/`, `schema.ts` y `workspace/` da: S1
  (`time-entry/service.ts:217`); C1 (`use-group-total.ts:39`); C2
  (`entry-row.tsx:223`); C3 (`manual-bar.tsx:154`, `:157`); C4
  (`calendar-gestures.ts:314`); C5 (`calendar-block.tsx:106`); C6
  (`entry-dialog.tsx:569`, `:573`); C7 (`timesheet-model.ts:120-121`); C8
  (`:278`); C9 (`:401`); y los dos del reporte con `"compact"`
  (`cell-text.ts:22`, `group-heading.tsx:24`). Una coincidencia más, que no es
  un llamador: `src/test/factories.ts:35`, el `duration: "compact"` de
  `defaultFormats` que pide §7 (el patrón excluye `*.test.*`, no `src/test/`).
- `src/server/db/schema.integration.test.ts` tiene el `it` con
  `[workspace_id, who_sees_all_entries, created_at, updated_at,
duration_format]`.
- `npm run db:generate`: «No schema changes, nothing to migrate».

## Corridas finales

En `636a898` más este registro:

| Corrida                    | Resultado                                                |
| -------------------------- | -------------------------------------------------------- |
| `npm run lint`             | sin errores                                              |
| `npm run typecheck`        | sin errores                                              |
| `npx prettier --check .`   | todo con formato                                         |
| `npm test`                 | unidad 100 archivos, 2434 tests; `time-ar` 2 y 307       |
| `npm run test:integration` | 31 archivos, 1977 tests, en `clock_ws2a_b2_int` (nueva)  |
| `npm run build`            | compila, 14 rutas, con las variables de relleno del `ci` |

El `build` corrió en un worktree aparte con `node_modules` en enlaces duros:
`ws2a-e2e2` tenía un `next start` sobre el `.next` del worktree de la rama, y
Turbopack rechaza un `node_modules` que es un enlace simbólico fuera de la
raíz.

## Mutaciones

Cada mutación de §9, más las que sumaron las revisiones, en una copia de la
rama en `29db1b1` (después del rebase y de las correcciones del backend), con
un solo cambio por vez. La unidad corrió entera (`vitest run`, 2463 tests). La
integración corrió con los cuatro archivos que leen el formato
(`workspace/service`, `profile/service`, `time-entry/service` y
`time-entry/actions`, 659 tests), en `clock_ws2a_fix_back_mut`, nueva. La
e2e corrió con `--project duration-full --no-deps` contra `next start`, con el
workspace en `full` por `psql` (§9.4). En la tabla va el test que mata cada
mutación, o el primero si son varios.

| Mutación                                                                      | La mata                                                                                                                                                                                     |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1 en minutos (`use-group-total.ts:39`, la suma `/ 60`)                       | `use-group-total.test.tsx`, los 3 casos, y `calendar-toolbar.test.tsx`, «el total del período … va con el formato de duración del workspace»                                                |
| C1 en `"compact"` fijo                                                        | Los mismos 4                                                                                                                                                                                |
| C2 en minutos (`entry-row.tsx:223`, sin `* 60`)                               | Ningún test de unidad (§9.1). La e2e: `duration-format.full.spec.ts:219`, «editar el horario de una fila muestra la duración del borrador mientras viaja…» (§9.4, 3)                        |
| C3, el valor inicial en `"compact"` fijo (`manual-bar.tsx:154`)               | `manual-bar.test.tsx`, «muestra el borrador de 90 minutos con el formato del workspace»                                                                                                     |
| C3 al confirmar, en `"compact"` fijo (`manual-bar.tsx:157`)                   | Ningún test de unidad (§9.1). La e2e: `duration-format.full.spec.ts:178`, «la barra manual muestra la duración en el completo…», que confirma con Enter (`setClock`, `tracker-page.ts:251`) |
| C4 en minutos (`calendar-gestures.ts:314`)                                    | `calendar-gestures.test.ts`, «la duración va con el formato del workspace, en minutos enteros» y «dibuja la entrada con el trío nuevo»                                                      |
| C5 en `"compact"` fijo (`calendar-block.tsx:106`)                             | `calendar-block.test.tsx`, «el transcurrido del timer va con el formato de duración, no con el del contador (D-WS2a-7)»                                                                     |
| C6 en minutos (`entry-dialog.tsx:569`)                                        | `entry-dialog.test.tsx`, «un trío que no es el de la entrada muestra su duración con el formato del workspace» y «el alta lleva el trío propuesto»                                          |
| C6 al confirmar, en `"compact"` fijo (`entry-dialog.tsx:573`)                 | Ningún test de unidad. La e2e, desde `0bff31c`: `duration-format.full.spec.ts:389`, la afirmación después de `duration.fill("30")` y Tab                                                    |
| C7, los totales en minutos (`timesheet-model.ts:120`)                         | 13 tests: los de los totales de `timesheet-model.test.ts` (TS-44 … TS-47, los dos formatos, D-WS2a-8) y 3 de `timesheet-view.test.tsx`                                                      |
| C7, `zero` como `seconds < 60` (`:121`)                                       | `timesheet-model.test.ts`, «un total de 30 segundos es gris con el compacto y no con el completo (TS-45)»                                                                                   |
| C8, la celda rotulada con sus minutos (`:278`)                                | `timesheet-model.test.ts`, «la celda muestra sus segundos con el formato» y «con el completo, una celda de dos entradas queda en `00:05:20`»                                                |
| C9, `cellCommit` con el rótulo de lo tecleado (`:401`)                        | `timesheet-cell.test.tsx`, «con varias entradas conserva los segundos sueltos, como el servidor (TS-34)»                                                                                    |
| `writtenSeconds` que devuelve `minutes × 60` siempre (`:139`)                 | 4 tests: el de `timesheet-cell.test.tsx` de arriba, «writtenSeconds … con varias conserva el resto» y los dos de la escritura en vuelo de D-WS2a-8                                          |
| C9 en la celda, `cellCommit(text, cell, "compact")` (`timesheet-cell.tsx:46`) | Ningún test de unidad. La e2e, desde `0bff31c`: `duration-format.full.spec.ts:297`, con `writeCell(page, one, "5", "Enter")`. Con Tab sobrevivía                                            |
| La vista de la planilla con `format: "compact"` (`timesheet-view.tsx:124`)    | `timesheet-view.test.tsx`, «la celda y los totales siguen el formato de duración del proveedor»                                                                                             |
| S1, `toView` en `"compact"` fijo (`time-entry/service.ts:217`)                | 3 de «S1: durationLabel con el formato de duración del workspace» en `time-entry/service.integration.test.ts`, y el criterio 6 de `actions.integration.test.ts`                             |
| `timeSettingsOf` en `"compact"` fijo (`profile/service.ts`)                   | «timeSettingsOf con el formato de duración (D-WS2a-3)», los dos de `profile/service.integration.test.ts`, y el criterio 6                                                                   |
| El `left join` cambiado por `inner join` (`workspace/repository.ts:79`)       | `workspace/service.integration.test.ts`, «sin la fila de ajustes trae compact … (WS-73)» y «lee los ajustes del workspace más viejo, no los de otro»                                        |
| `left join … on true`                                                         | «lee los ajustes del workspace más viejo, no los de otro», desde `d0516d8` (antes sobrevivía)                                                                                               |
| `contextOf` en `"compact"` fijo (`workspace/service.ts`)                      | «trae el valor escrito en la base», «cada persona del workspace recibe el mismo formato», «el check de la base acepta cada valor…» y el criterio 6                                          |
| El valor por omisión en `"full"` (`resolveDurationFormat`)                    | «resolveDurationFormat … sin fila de ajustes da compact» y «sin la fila de ajustes trae compact … (WS-73)»                                                                                  |

Las cuatro que la unidad no mata son las de §9.1, «lo que solo aparece con
interacción», y las cuatro las mata la e2e del completo. Las corrió
`ws2a-fix-e2e`: C6 y C9 sobre `0bff31c`, y C2 y C3 sobre `64ffa09`, cada una
con los otros cinco tests del spec en verde. Antes de `0bff31c`, C6 y C9
sobrevivían, como encontró la revisión de tests.

## Rebase sobre `main`

El 2026-10-21, `git rebase main` con `main` en `467e730`, que trae WS1 (la
pantalla `/configuracion` y el nombre del workspace) y el arreglo de vite. Dos
commits pararon con conflicto, en los archivos que preveía §0:

- **`src/modules/workspace/service.ts`**, en `a9d5258` (paso 1) y en `1046a24`
  (la sesión), solo en los imports: `main` trae `ForbiddenError` de
  `@/server/permissions`, y la rama suma `DurationFormat` y después
  `DURATION_FORMATS` de `@/server/time`. Quedaron las dos cosas. El cambio de
  `WorkspaceRow` a `WorkspaceRead` en `contextOf`, `joinedContext`,
  `bootstrapContext` y `entryWorkspaceIdOf` entró sin conflicto, y
  `canUpdateWorkspaceSettings` y el re-chequeo con bloqueo de WS1
  (`assertCanUpdateSettingsLocked`) siguen como en `main`: ninguno lee
  `findFirstWorkspace`.
- **`docs/parity/workspace.md`**, en `cb67d1b`, en dos lugares:
  - la nota de WS-65 … WS-73: quedaron las dos correcciones, la de WS1 (WS-73
    se prueba en WS2b) y después la de WS2a;
  - §16, el orden de slices: el punto 1 (WS1) es el de `main`, con su
    corrección, y el punto 2 (WS2) es el de la rama, partido en WS2a y WS2b.

La `0019` sigue siendo la `0019`: `main` no trae otra migración. Después del
rebase, `npm run db:generate` da «No schema changes, nothing to migrate»;
`npm ci`, `npm run typecheck` y `npm test` (102 archivos y 2457 tests; `time-ar`
2 y 307) en verde, y `npm run test:integration` en `clock_ws2a_fix_rebase`,
nueva: 32 archivos, 2016 tests, en verde.

| Antes     | Después   | Commit                                                    |
| --------- | --------- | --------------------------------------------------------- |
| `789592e` | `757dfca` | docs: contrato y ADR 0029 (propuesto)                     |
| `1eab1e3` | `550466a` | docs: los diez cambios de architecture-reviewer           |
| `a9d5258` | `1942cfa` | paso 1                                                    |
| `9e55d48` | `dad6512` | `parseDurationInput` con `h:mm:ss`                        |
| `94faef9` | `32c1aa8` | la primera `0019`                                         |
| `cb67d1b` | `8d23a7b` | docs: correcciones de paridad                             |
| `4964ecd` | `3020ae6` | docs: paridad, los textos desactualizados                 |
| `84c3526` | `935fc84` | e2e: el proyecto `duration-full`                          |
| `1046a24` | `5a50c23` | el formato viaja en la sesión                             |
| `b2072e3` | `4e635c3` | `toView` con el formato del workspace                     |
| `d70fd6e` | `7ffd3be` | `cell-text.ts` remite a WS2b                              |
| `68b11cd` | `d516d69` | e2e: el spec del completo                                 |
| `b13cc1f` | `1aa4eb5` | el rastreador y el calendario                             |
| `f5c4c9c` | `d6fe7c7` | la planilla                                               |
| `5b871ec` | `7042a06` | el proveedor de formatos; el reporte, fijo en compacto    |
| `d0516d8` | `76a0257` | el test del `join` con un workspace más viejo sin ajustes |
| `3c7187f` | `d951a1f` | la `0019` regenerada con los `check` de `workspace.name`  |
| `636a898` | `35dff08` | docs: el usuario acepta el ADR 0029                       |
| `8f34945` | `a59eab9` | docs: el registro con §9.3                                |

## Revisiones (2026-10-21)

Las seis, sobre `8f34945`, antes del rebase. Las correcciones las hicieron
`ws2a-fix-back` (backend y registro), `ws2a-fix-front` y `ws2a-fix-e2e` en el
mismo árbol, después del rebase.

| Revisión   | Veredicto          |
| ---------- | ------------------ |
| Backend    | cambios requeridos |
| Clean code | aprobado           |
| Frontend   | aprobado           |
| Paridad    | aprobado           |
| Seguridad  | aprobado           |
| Tests      | cambios requeridos |

### Backend

1. **Mayor: la reversión de §2.3 y §6.5 dejaba la integración en rojo.** Es
   el desvío que este registro ya anotaba. Se corrigió en `29db1b1` y en el
   contrato:
   - (a) `src/server/db/schema.integration.test.ts` importa solo lo que el
     revert conserva: `db`, `schema`, `constraint-error` y `seedWorkspace`. El
     formato se escribe con un `db.update(workspaceSettings)` local y recorre
     `["full", "compact"]`. La guarda «el `check` acepta cada valor de
     `DURATION_FORMATS`» pasó a `workspace/service.integration.test.ts`, que
     además comprueba que la sesión trae cada valor.
   - (b) En §2.3 y §6.5 del contrato, el `checkout` es
     `git checkout HEAD -- drizzle/ src/server/db/schema.ts src/server/db/schema.integration.test.ts`,
     y §2.3 explica por qué ese archivo se conserva.
   - (c) La simulación, repetida: ver «La reversión de §2.3, otra vez».
   - La nota menor: el comentario de `durationFormat` en `schema.ts` dice
     «`compact` o `full`» y ya no nombra `DURATION_FORMATS`.
   - Lo que pedía para el merge, los dos conflictos de `git merge-tree`, está
     en «Rebase sobre `main`».

### Clean code

1. **`knownChoice` duplicada en `resolveDurationFormat`.** Corregido en
   `29db1b1`: pasó de `profile/service.ts` a `src/lib/known-choice.ts`, pura y
   con `known-choice.test.ts`. La usan los dos services, y
   `resolveDurationFormat` queda en
   `return knownChoice(DURATION_FORMATS, value, "compact");`, con la firma de
   D-WS2a-2. El comentario que explicaba por qué la sesión no se cae sin la
   fila pasó al docstring. El mensaje del error es el de `knownChoice`
   («Valor fuera de lista: …»); ningún test afirmaba el anterior.
2. **El comentario repetido de `timeSettingsOf`** (`profile/service.ts:145`).
   Corregido en `29db1b1`: se borró y quedó el docstring.
3. **`timesButton` y `trackerWeek` duplicados en la e2e.** Corregido en
   `0bff31c`, `4f00052` y `64ffa09` (`ws2a-fix-e2e`): se exportan de
   `e2e/tracker-page.ts`, y el spec del completo, `bulk-actions.spec.ts`,
   `entry-times.spec.ts`, `week-and-pagination.spec.ts` y `profile.spec.ts`
   los importan de ahí. En `week-and-pagination.spec.ts`, `weekGroup` pasó a
   llamarse `trackerWeek`. `trackerWeekTotal`, de `calendar.spec.ts:119`, armaba
   a mano la región de la semana, y ahora usa `trackerWeek`. No queda ninguna
   copia de los dos localizadores en `e2e/`.
4. **`rejection` repetido en los tests de integración.** Corregido en
   `29db1b1`, con un desvío que aprobó el team-lead: el helper se exporta una
   vez desde `src/test/queries.ts` y lo usan las otras cinco copias (los
   `schema.integration.test.ts` de `profile`, `workspace`, `time-entry` y
   `project`, y `time-entry/person-keys.integration.test.ts`).
   `src/server/db/schema.integration.test.ts` conserva su copia local, con un
   comentario que explica por qué: la reversión de §2.3 conserva ese archivo y
   quita el export, así que importarlo dejaría el árbol revertido sin compilar.

### Frontend

1. **Con el formato completo, el campo de duración quedaba angosto.**
   Corregido en `72aee90` (`ws2a-fix-front`). Sin `format`, `ClockField` lee
   `useDisplayFormats().duration`, y `fieldWidth` da `w-24` con `full`, `w-20`
   con `compact` (producción no cambia) y `w-26` con 12 h. El comentario de
   `format` se actualizó. `clock-field.test.tsx` suma un caso: con `full` lleva
   `w-24` y no `w-20`, con `compact` lo contrario, y un campo de hora no mira
   la duración. Con `full`, la columna de la planilla crece 16 px por día. El
   ancho se calculó, no se midió en un navegador: `w-24` deja 74 px de
   contenido (96 px, menos 2 × 10 de relleno y 2 de borde).
2. **Un import fuera de su grupo** (`timesheet-view.test.tsx:15`). Corregido
   en `72aee90`: pasó al bloque de `@/`.

### Paridad

Sin hallazgos. La nota sobre `PERIOD_TOTAL` (`e2e/calendar-page.ts:77`), que
solo reconoce el compacto, no es de este slice: el spec del completo no lo
usa. Queda para WS2b, si reusa ese helper con `full`.

### Seguridad

1. **Menor, ajeno a WS2a: `npm audit --audit-level=high` falla también en
   `main`** por `braces`, que llega por `shadcn` y `eslint-config-next`, las
   dos de desarrollo; `--omit=dev` da 0 altas. Queda fuera del slice: la regla
   del CI de seguridad la decide el usuario. La rama no toca `package.json` ni
   `package-lock.json`, y después del rebase hereda el arreglo de vite de
   `main`.
   - La nota para el merge, mantener `canUpdateWorkspaceSettings` y
     `assertCanUpdateSettingsLocked`, se cumplió en el rebase.

### Tests

1. **Mayor: C6 al confirmar no tenía un test que pudiera fallar.** Corregido
   en `0bff31c`: `duration-format.full.spec.ts:387-389` escribe `30` en
   «Duración», confirma con Tab y espera `00:30:00`. La mutación la mata (ver
   «Mutaciones»).
2. **Mayor: C9 en la celda no tenía un test que pudiera fallar.** Corregido en
   `0bff31c`: `duration-format.full.spec.ts:296` confirma con Enter. Con Tab la
   mutación sobrevive, porque el valor nuevo del campo pisa el rótulo; con
   Enter el foco queda en el campo y `ClockField` no toma la foto.
3. **Mayor: faltaban las mutaciones y las corridas del criterio 14.**
   Corregido: ver «Mutaciones» y «El criterio 14».

## La reversión de §2.3, otra vez

Simulada en un worktree temporal sobre `29db1b1`, con la receta nueva: un
merge `--no-ff` de la rama sobre `main` (`467e730`) en `HEAD` suelto, y
después `git revert -m 1 --no-commit <merge>`,
`git checkout HEAD -- drizzle/ src/server/db/schema.ts src/server/db/schema.integration.test.ts`
y `git commit`.

- El diff contra `main` queda en cinco archivos: la `0019`, su instantánea,
  el diario, `schema.ts` (la columna con su comentario y los tres `check`) y
  `schema.integration.test.ts`. En el árbol revertido no queda ningún
  `DURATION_FORMATS`, `setDurationFormat` ni `known-choice`.
- `db:generate`: «No schema changes, nothing to migrate».
- `lint`, `typecheck` y `npx prettier --check .`, sin errores; `npm test`, en
  verde (99 archivos y 2430 tests; `time-ar` 2 y 303).
- **`npm run test:integration`, en verde**: 32 archivos, 1999 tests, en
  `clock_ws2a_fix_rev`, nueva. `global-setup` la migró con el `drizzle/` del
  árbol: 20 filas en `drizzle.__drizzle_migrations`, la última con
  `1792540808202`, y `workspace_settings` con `duration_format`.

El worktree se borró después.

## El criterio 14

Las corrió `ws2a-fix-e2e` sobre `0bff31c`, en una copia limpia, con la suite
entera y sin `--no-deps`. Por proyecto: `setup` / `chromium` /
`duration-full-setup` / `duration-full` / `duration-full-teardown`.

| Corrida                                                                       | Resultado                          | `durationFormatOf()`            |
| ----------------------------------------------------------------------------- | ---------------------------------- | ------------------------------- |
| 1. Base nueva, `clock_ws2a_fix_e2e`                                           | 257 pasaron (1/248/1/6/1), 1,7 min | `compact` al terminar           |
| 2. La misma base, reusada                                                     | 257 pasaron (1/248/1/6/1), 1,8 min | `compact` al terminar           |
| 3. Workspace en `full` a mano (el `update` de §9.4), en `clock_ws2a_fix_e2e3` | 257 pasaron (1/248/1/6/1), 1,7 min | `full` antes, `compact` después |

En la 3, `chromium` pasa entero con el compacto: `workspace.setup.ts` lo
volvió a `compact` al arrancar. Para crear el workspace antes de ponerlo en
`full`, se corrió solo `--project setup` sobre la base nueva.

La corrida 3 se intentó antes tres veces sobre `clock_ws2a_fix_e2e`, ya en su
tercer uso. Las tres fallaron en `chromium`, siempre en specs de equipo, así
que `duration-full` no corrió («7 did not run»). En las tres, la suite dejó el
workspace en `compact`. Ningún fallo es de WS2a:

- `team-link.spec.ts:291`: el clic en «Liberar el correo» no abrió el diálogo.
  No se reproduce: `--repeat-each 5` pasa 5 de 5.
- 9 fallos en `team-link`, `team-status` y `team`, siempre el aviso de
  `/equipo` que no llega en 5 s, con la carga de la máquina en 35 (el vitest
  de otro agente) y 1131 membresías en la base.
- Con la carga en 10, 2 más del mismo tipo (`team-status:382`, `team:164`) y
  `tags.spec.ts:300`, con `ECONNRESET` en `/api/auth/test-session/sign-in`,
  con 1407 membresías.

Es la lentitud de `/equipo` con unas 1100 membresías, que ya figuraba como
preexistente, agravada por la carga.

Las tres corridas son anteriores a `72aee90` y `29db1b1`, el ancho del campo y
las correcciones del backend: el `build` de la e2e no las incluye. Después,
`ws2a-fix-e2e` corrió la suite entera una vez más sobre `64ffa09`, que ya las
trae, con `clock_ws2a_fix_e2e3` reusada por segunda vez: 257 pasaron
(1/248/1/6/1), sin flakes, y `durationFormatOf()` dio `compact`. Esa corrida
cubre los specs que se tocaron, `calendar.spec.ts` y `profile.spec.ts`, pero no
reemplaza la corrida final en una base nueva. Esa queda para después del
próximo rebase: el MCP entra a `main` antes que WS2a, y la migración de WS2a
se regenera como `0020`.

## Corridas después de las revisiones

En `977f469`, con las correcciones de los tres agentes, más este registro:

| Corrida                    | Resultado                                                  |
| -------------------------- | ---------------------------------------------------------- |
| `npm run lint`             | sin errores                                                |
| `npm run typecheck`        | sin errores                                                |
| `npx prettier --check .`   | todo con formato                                           |
| `npm test`                 | unidad 104 archivos, 2463 tests; `time-ar` 2 y 307         |
| `npm run test:integration` | 32 archivos, 2017 tests, en `clock_ws2a_fix_final` (nueva) |

El `build` y la e2e final en base nueva quedan para después del rebase sobre
el MCP.

## Rebase sobre el MCP y corrida final

El 2026-10-21, `git rebase main` con `main` en `34ed2b5`, que trae el merge
del MCP (`5d92b19`) con su `0019_mcp`. Mientras corría, `main` sumó dos
commits de docs (`6db205e`, `8547b76`, solo `docs/mejoras-pedidas.md` y
`docs/slices/estado-fase1.md`), y la rama se volvió a rebasar sin conflictos:
**la base es `8547b76`**.

Pararon los dos commits que tocaban la migración, en `drizzle/meta/` (el
diario y la instantánea `0019`, agregados de los dos lados) y, en el segundo,
el SQL. En los dos quedaron el diario y las instantáneas de `main`, y salió el
`.sql` de la vieja `0019_workspace_duration_format`: `16f1ddf` deja solo la
columna en `schema.ts` y `2fab900`, los `check` del nombre en `schema.ts` y
su test. Entre ellos y `9bfec25` el esquema nombra la columna sin migración:
esos commits no pasan la integración sueltos. Nada más tuvo conflicto; los
archivos que tocan los dos lados (`e2e/database.ts`, `playwright.config.ts`,
`e2e/profile.spec.ts`, `profile/service.ts`, `workspace/service.ts`,
`time-entry/`, `server/time/`) se fusionaron solos. El MCP arma su contexto
con `ensureWorkspaceContext` (`src/server/user-context.ts`), así que un
pedido por token también lleva `settings.durationFormat`; ninguna herramienta
del MCP formatea duraciones.

**La migración** (`9bfec25`): `npm run db:generate -- --name
workspace_duration_format` sobre el diario de `main`.

- Sale **`0020_workspace_duration_format`**, con `when` **`1792584289697`**,
  mayor que el `1792540623295` de la `0019_mcp`; la instantánea `0020` tiene
  de `prevId` el `id` de la `0019` de `main`.
- El SQL es **idéntico byte a byte** al de la vieja `0019` (`diff` contra
  `e41bb75`): la columna, su `check` y los dos `check` de `workspace.name`
  (D-WS2a-10). Ninguno está escrito a mano, así que no hubo nada que reponer.
  Mismo sha256: `abaf2a27d1c00e7a1a8e3f87902325d2fbf13b19c05bbdbad6a89fe0f2abf3c2`.
- Un segundo `db:generate` da «No schema changes, nothing to migrate».
- `9861640` cambia «0019» por «0020» en tres títulos de
  `src/server/db/schema.integration.test.ts`. El contrato sigue diciendo
  `0019`: es lo que preveía D-WS2a-11, que ya nombra la `0020`.

**La subida**, en `clock_ws2a_r2_upgrade`, nueva: migrada con el `drizzle/`
de `8547b76` (un worktree temporal; 20 filas, la última `1792540623295`) y
sembrada con `scripts/report-volume/seed.sql`.

- La consulta previa de `clock-ops/ws2a-0020-previa-control.sql` da
  `1792540623295 | 20 | 1 | 0 | 0 | 0`.
- `npm run db:migrate` desde la rama aplica solo la `0020`: 21 filas, la
  última con `1792584289697` y el sha256 del archivo.
- El control da `text`, `'compact'::text`, `NO`, las tres restricciones y
  `compact:1`. Los conteos (`workspace` 1, `workspace_settings` 1,
  `membership` 31, `time_entry` 187 685) no cambian.
- Un segundo `db:migrate` no aplica nada (siguen 21 filas).

**El bloque para Neon** (`clock-ops/ws2a-0020-do.sql`, de `do-block.cjs` con
`drizzle/` de la rama desde el `idx` 20), en `clock_ws2a_r2_doblock`, una copia
de la base sembrada antes de migrarla: la previa da lo mismo; el bloque corre
y el control da lo mismo que con `db:migrate`, con los conteos iguales; un
`db:migrate` después no aplica nada (21 filas), y el bloque otra vez falla con
«la última migración aplicada no es la 0019_mcp» sin tocar nada. Sobre esa
base, `duration_format = 'decimal'`, `name = ''`, `name = ' x'` y
`name = repeat('a', 101)` fallan con su `check`.

**Las corridas**, en `9861640` (las de código; el árbol de `src/`, `e2e/` y
`drizzle/` es el de la punta, que solo suma este registro):

| Corrida                    | Resultado                                                                   |
| -------------------------- | --------------------------------------------------------------------------- |
| `npm ci`                   | hizo falta: `@better-auth/oauth-provider` llega con el MCP                  |
| `npm run lint`             | sin errores                                                                 |
| `npm run typecheck`        | sin errores                                                                 |
| `npx prettier --check .`   | todo con formato                                                            |
| `npm test`                 | unidad 118 archivos, 2589 tests; `time-ar` 2 y 309                          |
| `npm run test:integration` | 41 archivos, 2187 tests, en `clock_ws2a_r2_int` (nueva), 4,6 min; 21 filas  |
| `npm run build`            | sin `.next`, con las variables de relleno del `ci`: compila, 21 rutas       |
| e2e 1, base nueva          | `clock_ws2a_r2_e2e`: 262 pasaron (1/253/1/6/1), 1,8 min; `compact` al final |
| e2e 2, la misma base       | 262 pasaron (1/253/1/6/1), 1,9 min, sin flakes; `compact` al final          |

Por proyecto: `setup` / `chromium` / `duration-full-setup` / `duration-full`
/ `duration-full-teardown`. Los 5 tests más que antes de este rebase (257) son
los de `e2e/mcp.spec.ts`. La base de la e2e se creó vacía y se migró desde la
rama con `db:migrate`, como en las corridas del criterio 14; terminó con 289
membresías en la primera y 577 en la segunda. No falló ningún spec de
`/equipo`.

Dos cosas del registro del servidor, ninguna de WS2a:

- **El `build`** registra 19 veces `oauth-provider: could not seed
resources at startup; retrying on first resource access`: el plugin del MCP
  consulta `oauth_resource` al cargar, y con las variables de relleno no hay
  base. No corta el `build` (sale con 0). Se le avisa al team-lead: en Vercel
  el `build` corre con la `DATABASE_URL` de cada entorno.
- **La e2e** registra 15 veces `Error: The destination stream closed early.`
  del `[WebServer]`: los specs que cortan la respuesta a propósito («la
  respuesta se perdió»), que pasan.
