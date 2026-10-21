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
