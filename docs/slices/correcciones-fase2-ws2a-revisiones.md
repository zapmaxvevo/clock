# WS2a: implementación y revisiones

Rama `fase2/ws2a-formato` desde `main` en `c08369d`, en el worktree
`/home/maxi/program/clock-ws2a` (fuera del repositorio). Contrato:
[`fase2-ws2a-formato.md`](fase2-ws2a-formato.md) en `1eab1e3`; ADR
[0029](../adr/0029-el-formato-de-duracion-es-del-workspace-y-solo-cambia-lo-que-se-muestra.md),
aceptado por el usuario el 2026-10-20 (`636a898`).

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
  contrato no se tocó; lo decide el team-lead.

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
