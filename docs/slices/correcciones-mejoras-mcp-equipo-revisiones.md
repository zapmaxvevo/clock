# Mejora 5, el equipo desde el asistente: implementación y revisiones (2026-10-21)

Rama `mejoras/mcp-equipo` sobre `main` `8466e94`, en el worktree
`/home/maxi/program/clock-mcp-equipo`. Contrato:
[`mejoras-mcp-equipo.md`](mejoras-mcp-equipo.md). ADR:
[0030](../adr/0030-el-asistente-lee-horas-ajenas-por-el-alcance-del-reporte.md),
aceptado el 2026-10-21.

## V-1 (SDK 1.32.0), cerrada con una sonda

Un `McpServer` con `summarize_hours` registrada con el `inputSchema` y el
`outputSchema` de §4.5, y un `Client` del mismo SDK por `InMemoryTransport`:

| Caso                                                   | Resultado                                                                                                                                                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tools/list`                                           | JSON Schema draft-07: `enum` en `kind`, `groupBy` y `scope`; `type: ["string", "null"]` en los `.nullable()`; los `.optional()` fuera de `required`; `additionalProperties: false` en los tres niveles |
| El esquema, con Ajv 8 en modo estricto y `ajv-formats` | compila, la salida y la entrada; un ejemplo de tres niveles valida                                                                                                                                     |
| Éxito con un árbol de tres niveles válido              | `structuredContent` llega al cliente, que también lo valida                                                                                                                                            |
| `kind` desconocido en el primer nivel                  | `isError: true`, «Output validation error: … Invalid option»                                                                                                                                           |
| `minutes: 1.5` en el tercer nivel                      | `isError: true`, «… expected int, received number at groups[0].children[0].children[0].minutes»                                                                                                        |
| `client: 3` en un grupo                                | `isError: true`, «… expected string, received number at groups[0].client»                                                                                                                              |

El SDK valida `structuredContent` con el esquema de Zod (`validateToolOutput`)
y anuncia el JSON Schema que arma `toJsonSchemaCompat`: las tres formas fijas
salen sin `$ref` y sin depender de cómo el SDK pasa un esquema recursivo.

## Lo hecho

- `c4e556f`, **tipos y textos** (§4.1, §4.5, `seesTeam`): `HOURS_SUMMARY_MAX_ROWS`,
  los textos nuevos de `reportMessages`, `ReportErrorCode`, `hoursSummaryInput`,
  `HoursSummaryValues`, `PeopleCatalog`; `ReportError`; las entradas y salidas
  de las dos herramientas; `ConsentView.ready.seesTeam`, que `getConsentView`
  arma con `can(timeEntry.others.view)`.
- `721b6b3`, **service y herramientas** (§4.2 a §4.4, §4.6): el modo de lectura
  obligatorio (`PAGE_READ`, `EXPORT_READ`, `ASSISTANT_READ`), `getHoursSummary`,
  `getPeopleCatalog`, `report/operations.ts`, `QUERY_CANCELED`, el correo y el
  filtro de personas de `listWorkspacePeople`, el registro de `list_people` y
  `summarize_hours` y la oración de `list_entries`.
- `3c917cd`, **tests** de unidad e integración de §7.1 y §7.2 que son de
  `backend-dev`: `report/schema.test.ts`, `mcp/schema.test.ts`,
  `mcp/tools.test.ts`, `report/scope.integration.test.ts`,
  `report/service.integration.test.ts`, `workspace/service.integration.test.ts`,
  `mcp/handler.integration.test.ts` (diez herramientas, y las dos nuevas con
  `readOnlyHint: true` y `outputSchema`) y `mcp/service.integration.test.ts`
  (`seesTeam` de owner, admin, `project_manager`, `team_manager` y `member`).

## Desvíos del contrato

1. **Fixtures de `ConsentView` fuera de `backend-dev`.** Para que el commit de
   tipos compilara, `consent-screen.test.tsx` y `app/conectar/page.test.tsx`
   suman `seesTeam: false` a su vista `ready`, y el `toEqual` de
   `mcp/service.integration.test.ts` también. `frontend-dev` siguió desde ahí.
2. **El formato de los ids en `hoursSummaryInput`.** El contrato no da texto
   para un id con otro formato que el de la URL (`PERSON_ID`,
   `LOWERCASE_UUID`). Lleva el de los no encontrados de su lista
   (`peopleNotFound`, `projectsNotFound`, `clientsNotFound`) con el código
   `validation`: un id así no puede estar en ningún catálogo. Importa sobre todo
   con un uuid en mayúsculas, que pasa el `z.uuid()` del `inputSchema`.
3. **`filterValues` recibe el mensaje como parámetro opcional** en lugar de una
   copia: la URL lo llama sin mensaje y sus tests no cambian (82 en
   `report/schema.test.ts`, todos en verde). `REPORT_MAX_FILTER_VALUES` sube
   antes de `reportMessages`, que lo usa en el texto de `filterValues`.
4. **Dos mensajes con 51 proyectos.** El `max` de la lista y el tope de «Sin
   proyecto» del `superRefine` fallan los dos; los dos dicen `filterValues` y
   `failureOf` muestra el primero.
5. **`peopleListOf` exportada** en `tools.ts`, como `summaryOf`, para probar que
   el texto de `content` es el JSON de `structuredContent` en las dos
   herramientas.
6. **El mutante de `ForbiddenError` para horas ajenas no cae en la unidad.** El
   test de unidad de `reportToolMessages` arma él mismo el `ForbiddenError` y el
   `ReportError("forbidden")`, y no puede ver cuál lanza el service. El mutante
   cae en seis tests de integración: los de `scope.integration` que piden
   `ReportError` con `othersForbidden` y los de `tools.integration` que leen el
   texto por `tools/call`.
7. **Un caso más del tope de sentencia**: además del `57014` inyectado, una
   cancelación real (`limitStatementTime(1)` y `pg_sleep`) responde `timeout`.

## Mutaciones

En una copia descartable de `3c917cd` (`git worktree add --detach`), con la
base `clock_mcpe_mut`. Cada mutante corre la unidad de `report` y `mcp` (634
tests) y la integración de `report/scope`, `report/service`, `report/export` y
`mcp/tools.integration` (420 tests, con los de `test-engineer`).

| Mutante (§7.2)                                          | Unidad   | Integración | Cae, entre otros                                                                                 |
| ------------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------------------------------------ |
| `strictFilters: false` en `ASSISTANT_READ`              | 634 bien | 17 caen     | criterio 6: los `not_found` de personas, proyectos y clientes, y los `forbidden` de horas ajenas |
| `strictFilters: true` en `PAGE_READ`                    | 634 bien | 56 caen     | criterio 14: «los ids de B se ignoran», el enlace ajeno, los textos que no viajan                |
| `strictFilters: true` en `EXPORT_READ`                  | 634 bien | 16 caen     | criterio 14 y la exportación con `personas` armado a mano                                        |
| `maxRows` fijo en `REPORT_MAX_ROWS`                     | 634 bien | 3 caen      | criterio 7, en `service.integration` y en `tools.integration`                                    |
| `statementTimeout: false` en `ASSISTANT_READ`           | 634 bien | 3 caen      | criterio 8: `limitStatementTime` con 8000, `show statement_timeout`, la cancelación real         |
| sin la traducción del `57014`                           | 634 bien | 2 caen      | criterio 8: el `57014` inyectado y la cancelación real                                           |
| `chart: true` en `ASSISTANT_READ`                       | 634 bien | 1 cae       | criterio 9: `totalsByBucket` llamado y `chart` distinto de `null`                                |
| `scopeOf` siempre `everyone`                            | 634 bien | 89 caen     | criterio 5: lo propio sin filtro y con el propio id, y los de la página                          |
| sin `checkOwnPeople`                                    | 634 bien | 6 caen      | el `forbidden` del criterio 6, y el del 13 con el mismo token                                    |
| el correo sin `team.manage`                             | 634 bien | 6 caen      | criterio 3, y `email: null` de los roles con `self`                                              |
| `ForbiddenError` en lugar de `ReportError("forbidden")` | 634 bien | 6 caen      | el texto del criterio 6 (`othersForbidden`) por `tools/call` y por el service (desvío 6)         |

## Corridas

En `/home/maxi/program/clock-mcp-equipo`, punta `3c917cd`, base
`clock_mcpe_back`:

- `npm run lint`: sin errores ni advertencias.
- `npm run typecheck`: limpio.
- `npx prettier --check .`: limpio.
- `npm test`: `test:unit`, 118 archivos y 2621 tests; `test:time-ar`, 2 archivos y
  309 tests; en verde.
- `npm run test:integration`: 41 archivos, 2255 tests, en verde.

## Revisiones

Seis revisiones sobre `c108b31`: frontend, backend y paridad aprobaron sin
hallazgos; clean code y tests, con menores; seguridad pidió cambios por un
mayor.

### Seguridad

| Hallazgo                                                                                                                                                                                                            | Lo que se hizo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mayor.** Un lote JSON-RPC esquivaba el tope de 120 llamadas por minuto: el transporte del SDK 1.32.0 acepta hasta 100 mensajes por `POST` y corre los `tools/call` en paralelo, y `consumeCall` cuenta un `POST`. | `82410d5`. `handleMcpRequest` lee una copia del cuerpo con `readRequestBody` del SDK y el mismo tope de 64 KiB; un arreglo responde 400 con JSON-RPC `-32600` y `mcpMessages.batchUnsupported`, antes de `consumeCall`. Un cuerpo que no entra o no es JSON lo sigue respondiendo el transporte. Test en `handler.integration.test.ts`: un lote de dos `create_entry` responde 400, no escribe ni consume del tope, y un mensaje suelto después pasa y cuenta uno. Sin la guarda, el test cae (200 en lugar de 400). El contrato saca `handler.ts` de «Sin cambio» de §1, con el motivo, y lo dice en D-MCPE-6.                                   |
| menor. El tope de 8 s es por sentencia, y un resumido corre unas siete.                                                                                                                                             | `682fda2`, **sin `transaction_timeout`**. Postgres local: **18.6**, que lo soporta, pero al vencer no cancela con `57014`: termina la conexión con `FATAL 25P04` («terminating connection due to transaction timeout»). Con una sonda por drizzle y node-postgres, lo que llega es el fallo del `rollback` («Failed query: rollback», con causa «Connection terminated unexpectedly» y sin `code`), que no se puede traducir a `timeout`, y el cliente de `pg` emite además una excepción no atrapada. D-MCPE-6 dice que la cota es por sentencia y por qué; una cota total, si hace falta, es un plazo en la aplicación. Avisado al coordinador. |

### Clean code

| Hallazgo                                              | Lo que se hizo                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1. La línea de `operations.ts` en `CLAUDE.md`         | `97ba9b7`: «Zod, can() y service de la operación de una herramienta MCP, compartida con la action si la hay».         |
| 2. La copia de `workspaceResource` en `operations.ts` | `8526b7a`: `report/service.ts` la exporta y `operations.ts` la usa.                                                   |
| 3. `ReadPlan` copiaba los campos del modo             | `8526b7a`: `readonly mode: ReadMode`.                                                                                 |
| 4. El comentario de `strictFilters`                   | `8526b7a`: nombra las dos reglas de D-MCPE-4, `checkOwnPeople` y `checkStrictFilters`.                                |
| 5. El comentario de `peopleListOf`                    | `97ba9b7`: una lista blanca, para que un campo nuevo del catálogo no llegue al asistente sin un cambio en `tools.ts`. |
| 6. `kind` y el alcance en `mcp/schema.ts`             | `97ba9b7`: `kind: groupBy` y una sola constante, `summaryScope`, en las dos salidas.                                  |

### Tests

| Hallazgo                                                                        | Lo que se hizo                                                                                                                                                                |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Las descripciones de `tools/list`                                            | `f8f1b16`: la de `list_entries` contiene `summarize_hours` y la de `summarize_hours`, `levelsShown`.                                                                          |
| 2. Los ids mal formados por `tools/call`                                        | `f8f1b16`: `userIds: ["con espacio"]` da `validation` con `peopleNotFound`, y un uuid en mayúsculas en `projectIds`, `validation` con `projectsNotFound`. Fila nueva en §4.8. |
| 3. El `not_found` del criterio 14 en `service.integration` solo miraba la clase | `f8f1b16`: `toMatchObject({ code, message })`, con `peopleNotFound` y `projectsNotFound`.                                                                                     |

### Corrida final

Punta `f8f1b16`, con el árbol quieto, cada cosa en una base nueva:

| Corrida                      | Dónde                                                                              | Resultado                                                                              |
| ---------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run lint`               | el worktree                                                                        | sin errores ni advertencias                                                            |
| `npm run typecheck`          | el worktree                                                                        | limpio                                                                                 |
| `npx prettier --check .`     | el worktree                                                                        | limpio                                                                                 |
| `npm test`                   | el worktree                                                                        | `test:unit` 118 archivos y 2621 tests; `test:time-ar` 2 archivos y 309 tests; en verde |
| `npm run test:integration`   | el worktree, base `clock_mcpe_fin_int`                                             | 41 archivos y 2258 tests, en verde                                                     |
| `npm run build`              | una copia de `f8f1b16` (`git archive`) con `cp -al` de `node_modules`              | en verde                                                                               |
| e2e entera, base nueva       | la copia, `next start` en el puerto 3541, base `clock_mcpe_fin_e2e` recién migrada | 264 pasan (1,7 min)                                                                    |
| e2e entera, reusando la base | lo mismo, sobre la base de la corrida anterior                                     | 264 pasan (1,8 min)                                                                    |

## Rebase sobre WS2b

`mejoras/mcp-equipo` rebasada sobre `main` `9a6eb0b` (el merge de WS2b), desde
`8466e94`: los 16 commits se aplicaron sin conflictos de texto y
`npm run typecheck` no muestra choques de tipos. WS2b suma al final de
`workspace/repository.ts` y `service.ts` sus funciones de ajustes; las de este
slice (`listPeople`, `listWorkspacePeople`, `WorkspacePerson`) conviven sin
cambios. `npm ci` después del rebase.

**La búsqueda de §9.6 de WS2b**
(`rg -n 'formatDuration\(|durationLabel\(|"compact"|"full"' src scripts --glob '!**/*.test.*'`)
da las mismas 29 líneas en la rama que en `main` `9a6eb0b`, y el diff de la
rama contra `main` no suma ningún `"compact"`, `"full"`, `formatDuration(` ni
`durationLabel(`, tampoco en los tests.

Corrida sobre la punta rebasada `6b97cdb`, cada cosa en una base nueva:

| Corrida                      | Dónde                                                                               | Resultado                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm run lint`               | el worktree                                                                         | sin errores ni advertencias                                                            |
| `npm run typecheck`          | el worktree                                                                         | limpio                                                                                 |
| `npx prettier --check .`     | el worktree                                                                         | limpio                                                                                 |
| `npm test`                   | el worktree                                                                         | `test:unit` 119 archivos y 2673 tests; `test:time-ar` 2 archivos y 309 tests; en verde |
| `npm run test:integration`   | el worktree, base `clock_mcpe_fin2_int`                                             | 41 archivos y 2303 tests, en verde                                                     |
| `npm run build`              | una copia de `6b97cdb` (`git archive`) con `cp -al` de `node_modules`               | en verde                                                                               |
| e2e entera, base nueva       | la copia, `next start` en el puerto 3541, base `clock_mcpe_fin2_e2e` recién migrada | 275 pasan (1,8 min)                                                                    |
| e2e entera, reusando la base | lo mismo, sobre la base de la corrida anterior                                      | 275 pasan (1,9 min)                                                                    |
