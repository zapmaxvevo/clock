# Mejora 5: owner y admin ven las horas del equipo desde el asistente

Contrato del slice de la mejora 5 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md). **Un owner o un admin consulta
desde el asistente las horas de las demás personas del workspace, como ya lo
hace en el reporte**: quiénes son, cuánto cargó cada una en un período, en qué
proyectos, qué días y con qué descripción. Solo leer: nada de crear, editar,
borrar ni parar horas ajenas. Las demás personas usan las mismas herramientas
sobre lo propio, como la página de reportes.

- **Fuente:** el pedido del usuario del 2026-10-21, después de probar el MCP en
  producción. **No es paridad con Clockify**: no pasa por `parity-analyst`. La
  regla de quién ve qué es la del núcleo de reportes (P-01, P-02, P-07 y RP-22
  de [`reportes.md`](../parity/reportes.md)).
- **Lugar en el plan:** fuera del mapa de la fase 2, en paralelo con ella, en el
  worktree `clock-mcp-equipo` (rama `mejoras/mcp-equipo`, rebasada sobre `main`
  `8466e94`, con el MCP en producción y WS2a mergeado).
- **Revisión:** `architecture-reviewer` aprobó con cambios el 2026-10-21; los
  ocho hallazgos están aplicados. Pendiente de `security-reviewer` antes del
  merge (§5).
- **Decisiones de arquitectura:**
  - **[ADR 0030](../adr/0030-el-asistente-lee-horas-ajenas-por-el-alcance-del-reporte.md),
    propuesto**: las horas ajenas se leen solo por el `ReportScope`; filtros
    estrictos en el modo del asistente; el correo sigue a `team.manage`; el
    mismo alcance `clock`. Acota D-MCP-11, la última viñeta de D-MCP-3 y §12 de
    [`mejoras-mcp.md`](mejoras-mcp.md).
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md):
    `timeEntry.others.view` y el `ReportScope` nominal, sin cambios.
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): los días se cortan
    en la zona de quien mira, que es la de `get_context`.
  - [ADR 0026](../adr/0026-el-servidor-mcp-autoriza-con-oauth-de-better-auth-y-atiende-sin-estado.md):
    sin cambios. Un token sigue dando lo mismo que una sesión.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    `report` lee el catálogo de personas por el service de `workspace`.

## Decisiones del contrato

**D-MCPE-1 — Dos herramientas nuevas; `list_entries` no cambia.**

| Herramienta       | Qué hace                                                                                            | Pasa por                                   | Anotaciones    |
| ----------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------- |
| `list_people`     | Las personas cuyas horas puede consultar quien pide, con id y nombre, y el correo con `team.manage` | `report/operations.listPeople` (nueva)     | `readOnlyHint` |
| `summarize_hours` | El resumido del reporte: un período, hasta tres niveles y filtros                                   | `report/operations.summarizeHours` (nueva) | `readOnlyHint` |

- **`summarize_hours` es la página de reportes en forma de herramienta**: el
  mismo período (hasta 366 días), los mismos niveles (`person`, `project`,
  `client`, `task`, `tag`, `date`, `week`, `month`, `description`), los mismos
  filtros (personas, proyectos con «Sin proyecto», clientes), la misma opción
  de las personas sin horas y el mismo alcance. Responde lo que más se pregunta
  de un equipo: cuánto cargó cada una, en qué, quién no cargó nada la semana
  pasada, y —por persona, día y descripción— qué hizo cada día.
- **Por qué no un filtro `userId` en `list_entries`** (ADR 0030): leería horas
  ajenas desde `time-entry`, fuera del `ReportScope`, en un repository que
  acepta cualquier persona; devolvería el timer que corre de otra persona, que
  la aplicación no muestra (P-07), e ids de entradas que invitan a editarlas.
  `list_entries` suma una oración a su descripción que manda a
  `summarize_hours` para las horas de otras personas.
- **Lo que no entra**: el detalle por entrada de otra persona (las horas de
  inicio y fin de cada una). La página tampoco lo tiene (RP-50 es de la fase 3);
  la exportación sí, en un archivo. Si el usuario lo pide, es una tercera
  herramienta por el mismo `ReportScope` (§10, pregunta 1).
- **Las dos se registran para todas las personas** (ADR 0030, decisión 5). Sin
  `timeEntry.others.view`, `list_people` devuelve solo a quien pide y
  `summarize_hours` resume solo lo propio, como la página.

**D-MCPE-2 — La persona se nombra por su id, que da `list_people`.**

- **`summarize_hours` recibe `userIds`**, los ids de `user` tal cual (el mismo
  formato que el filtro de la URL, `PERSON_ID`). El asistente que oye «las horas
  de Juan» llama a `list_people`, elige por nombre y, si hay dos Juan, por
  correo, y pasa el id. Una llamada más, que el modelo hace sola.
- **Por qué no el correo como entrada**: sería un segundo camino de búsqueda,
  con su normalización (`src/lib/email.ts`), sus casos de correo liberado y su
  propio caso de IDOR, para ahorrar una llamada. El id sale de un catálogo que
  ya armó el alcance.
- **`get_context` no cambia.** Ya dice quién es la persona (`name`, `email`);
  `list_people` marca su fila con `self: true` y dice con `scope` si quien pide
  ve a todos (`everyone`) o solo a sí misma (`self`).
- **El correo sigue a `team.manage`** (ADR 0030). Hoy el correo de otra persona
  solo se ve en `/equipo`, que exige `team.manage` (`getTeamView`); ver horas
  ajenas no lo abre. `email` vale `can(actor, "team.manage", workspace) &&
!isReleasedEmail(email) ? email : null`, también en la fila propia: el correo
  propio ya lo da `get_context`. Hoy owner y admin tienen los dos permisos, así
  que con `scope: "everyone"` el asistente ve los correos; si alguna vez se
  separan, distingue homónimos por id y nombre.

**D-MCPE-3 — La regla: los permisos de siempre, en los lugares de siempre.**
Sin acción nueva en `can()`.

- **`report.view`** (todas las membresías activas) para entrar: lo afirma
  `report/operations.ts` antes de llamar al service, y el service lo vuelve a
  mirar, como la página (RP-07).
- **`timeEntry.others.view`** (owner y admin) decide si se ve a todos o solo lo
  propio. Lo consulta `scopeOf` del service de `report`, el único lugar donde se
  consulta hoy (ADR 0020). `project_manager` y `team_manager` deciden como
  `member` (P-02).
- **`team.manage`** (owner y admin) decide si `list_people` muestra correos
  (D-MCPE-2), con la misma regla que `/equipo`.
- **El token sigue dando lo mismo que una sesión** (ADR 0026, decisión 4): el
  actor se arma en cada pedido con la membresía de la base, así que un owner
  degradado a `member` deja de ver a los demás en la llamada siguiente, sin
  reconectar.

**D-MCPE-4 — Aislamiento e IDOR: en el modo del asistente los filtros son
estrictos (ADR 0030, decisión 3).** La página ignora en silencio un id que no
está en su catálogo (D-R4-5); para un modelo eso es peligroso, porque un filtro
de personas que queda vacío lee a todo el equipo. En `getHoursSummary` (§4.2):

| Caso                                                                                                               | Respuesta                                                   |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Sin `timeEntry.others.view`, con `userIds` que nombra a otra persona                                               | `forbidden`, `othersForbidden`, **antes de leer**           |
| Sin `timeEntry.others.view`, con `userIds: [<propio>]`                                                             | lo propio, como sin filtro                                  |
| Un id de persona de otro workspace, inexistente o de una invitada sin alta                                         | `not_found`, `peopleNotFound`; el mismo texto para los tres |
| Una persona inactiva del workspace                                                                                 | sus horas, con `inactive: true` (RP-61, P-08)               |
| Un proyecto que no está en el catálogo de quien pide (otro workspace, privado ajeno para un `member`, inexistente) | `not_found`, `projectsNotFound`                             |
| Un cliente que no está en el catálogo                                                                              | `not_found`, `clientsNotFound`                              |
| `workspaceId`                                                                                                      | no existe en ninguna entrada: sale del token                |

- **Los dos `forbidden` dicen cosas distintas.** El de horas ajenas es un
  `ReportError("forbidden", othersForbidden)`, con su texto. Sin `report.view`
  —una membresía activa siempre lo tiene; queda como guarda— sale un
  `ForbiddenError("report.view")`, que `failureOf` traduce con el `forbidden`
  genérico de las herramientas del reporte (`viewForbidden`), nunca con el de
  horas ajenas.
- **El catálogo y la lectura son la misma foto**: la comprobación corre dentro
  de la transacción `repeatable read` de `readReport`, después de leer los
  catálogos y antes de los niveles. Una membresía sin horas que se borra entre
  dos llamadas no ensancha nada.
- **`list_people`** filtra por `actor.workspaceId` en la consulta (la de
  `listPeople`, sin cambios en ese `where`) y, sin `timeEntry.others.view`, lee
  solo la fila de quien pide.
- **Las invitadas** no están en el catálogo (no tienen membresía activa ni
  inactiva) ni tienen horas.
- **Un caso que se acepta**: un `member` que perdió el acceso a un proyecto
  privado sigue viendo sus horas en él al agrupar (PR-71), pero filtrar por ese
  proyecto responde `not_found`, porque el catálogo de filtros es el de
  `project.view`. La página hace lo mismo, en silencio.

**D-MCPE-5 — Las salidas: minutos enteros, un árbol de tres niveles fijos, un
tope de 500 filas.**

- **Minutos enteros, como hoy**: cada grupo y cada total con `wholeMinutes`
  (hacia abajo, por separado). La suma de los hijos puede quedar uno o dos
  minutos debajo del padre; la descripción lo dice. El formato de duración del
  workspace (WS2a) no aplica: la herramienta no formatea.
- **El árbol no es recursivo en el esquema**: hay como mucho tres niveles, así
  que `outputSchema` declara tres formas (hoja, medio, primero) y no depende de
  cómo el SDK pase un esquema recursivo a JSON Schema.
- **Un grupo dice qué es sin rótulos de pantalla**: `kind`, `key` (el id, o el
  primer día del tramo en las de tiempo), `name` (`null` solo en los «Sin …»),
  `minutes`, y lo propio de cada clase (§4.5). Sin colores, sin el `partial`
  formateado de las semanas, sin atajos ni gráfico.
- **Tope de filas: 500** (`HOURS_SUMMARY_MAX_ROWS`), contra 3000 de la página
  (`REPORT_MAX_ROWS`); decisión del coordinador sobre la revisión. Con más, el
  service hace lo de la página (D-R3-6): lee los niveles que entran y lo dice
  con `levelsShown`. 500 grupos en JSON son unos 60 KB, el doble con
  `content`: el techo razonable de una respuesta para un modelo.
- **La cuenta del uso principal**: el tope suma las filas de todos los niveles
  leídos. Con 30 personas, una semana por persona, día y descripción da 30
  filas en el primer nivel, unas 150 en el segundo (30 × 5 días hábiles) y, con
  tres descripciones distintas por persona y día, unas 450 en el tercero: 630,
  más que 500. El service muestra dos niveles (`levelsShown: 2`) y el asistente
  ve por persona y día sin las descripciones. **La descripción de
  `summarize_hours` le dice qué hacer**: pedir por `userIds` (una o unas pocas
  personas por llamada, que con 30 personas son 21 filas por persona) o bajar a
  dos niveles. Con un equipo de diez, la misma semana entra entera (210).
- **El timer que corre no cuenta** (P-07), como en la página.

**D-MCPE-6 — Anotaciones, límites y el costo de una lectura.**

- **`readOnlyHint: true`** en las dos, como `get_context`, `list_projects` y
  `list_entries`. Ninguna otra anotación: las de solo lectura de hoy no llevan
  más.
- **`mcp_call_window` no cambia**: cada `POST` cuenta uno, las herramientas
  nuevas también, con el mismo tope de 120 por minuto y persona (D-MCP-13). Un
  `POST` lleva un solo mensaje: un lote responde 400 sin consumir del tope
  (§1).
- **Tope de duración por sentencia: el de las exportaciones**, `set local
statement_timeout` de 8 s (`REPORT_EXPORT_STATEMENT_TIMEOUT_MS`, S3 de
  `correcciones-nucleo-reportes-r6a-revisiones.md`). Un asistente se parece
  más a una exportación que a una persona: puede pedir un año en tres niveles
  varias veces por minuto, sin mirar. El tope vale para toda la transacción del
  resumido.
- **Un tope vencido no es `unexpected`**: Postgres cancela la sentencia con
  `57014`, y `getHoursSummary` lo responde como `ReportError("timeout",
summaryTooSlow)`, que pide un período más corto, menos niveles o menos
  personas. Las exportaciones no cambian: siguen con su `exportFailed`.
- **Sin gráfico**: el modo del asistente no llama a `totalsByBucket` y el estado
  sale con `chart: null`, que la herramienta no devuelve. Una consulta menos
  por llamada.
- **El costo que queda**: los dos catálogos, hasta tres niveles y el total, en
  una transacción de solo lectura, acotados por las 500 filas y los 8 s.

**D-MCPE-7 — Una lectura no deja constancia.** Ni la página de reportes ni sus
exportaciones escriben en `audit_log`, y D-MCP-12 dejó fuera los pedidos de
lectura del MCP. La lectura del resumido corre en una transacción `read only`
(ADR 0021): escribir una constancia ahí obligaría a abrir otra. Si el usuario
quiere un rastro de quién miró horas ajenas desde un asistente, es una
decisión aparte que vale también para la página (§10, pregunta 3).

**D-MCPE-8 — El mismo alcance `clock`; el consentimiento lo dice (ADR 0030,
decisión 4).**

- **El alcance no cambia** y no hay que reconectar: un owner o admin con el
  asistente conectado ve las herramientas nuevas en cuanto el cliente vuelve a
  pedir `tools/list` (§8).
- **`/conectar` suma una oración** para quien tiene `timeEntry.others.view`:
  «Como propietario o administrador, también va a poder ver las horas de las
  demás personas del workspace.». `ConsentView` `ready` suma `seesTeam`, que
  arma `getConsentView` con `can()`. Para el resto, la pantalla no cambia.
- **«Asistentes conectados» en `/perfil` no cambia**: su texto («pueden ver y
  editar tus horas») sigue siendo cierto, aunque no exhaustivo.
- **La autorización de un owner o admin anterior al cambio** sigue sirviendo sin
  haber leído la oración nueva (§10, pregunta 2).

## 0. Precondición de arranque

- `main` con el MCP mergeado y la `0019_mcp` aplicada en producción, y WS2a
  mergeado (`8466e94`). El worktree `clock-mcp-equipo` está rebasado ahí.
- **El ADR 0030, aceptado por el usuario**, y las preguntas de §10 respondidas.
- **V-1**, antes de escribir las herramientas: `backend-dev` confirma con el SDK
  instalado que un `outputSchema` con `z.enum`, `.nullable()`, `.optional()` y
  arreglos anidados de tres formas sale en `tools/list` como JSON Schema válido
  y que el SDK valida `structuredContent` contra él. Es el mismo camino de las
  ocho de hoy (V-8 de `mejoras-mcp.md`), con un anidamiento más. Si falla, se
  para y vuelve al arquitecto.

## 1. Alcance

Entra:

- `list_people` y `summarize_hours` (D-MCPE-1), con sus esquemas de entrada y
  salida en `mcp/schema.ts` y su registro en `mcp/tools.ts`.
- `report/operations.ts`, nuevo, con las dos operaciones.
- En el service de `report`: `getHoursSummary` y `getPeopleCatalog`, el modo de
  lectura obligatorio con sus tres constantes, y la traducción del `57014`
  (§4.2).
- `QUERY_CANCELED` en `src/server/db/constraint-error.ts`.
- En `workspace`: el correo en `WorkspacePerson` y el filtro opcional de
  personas en `listWorkspacePeople` (§4.4).
- La oración del consentimiento (D-MCPE-8, §4.7).
- La descripción de `list_entries` (D-MCPE-1).
- Tests de unidad, integración y e2e (§7).

Queda afuera: §11.

### Consecuencias sobre código ya entregado

| Archivo                                                      | Qué cambia                                                                                                                                                                            | Qué hay que volver a probar                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/modules/report/service.ts`                              | `readReportState` recibe `mode` obligatorio; `ReadPlan` cambia `exporting` por `statementTimeout` y suma `strictFilters`, `maxRows` y `chart`; `readLevelsWithinLimit` recibe el tope | `report/service.integration.test.ts` y `scope.integration.test.ts` sin cambios en lo que afirman, también los de `limitStatementTime`; `export/handler.integration.test.ts` |
| `src/modules/report/schema.ts`                               | `hoursSummaryInput`, `HOURS_SUMMARY_MAX_ROWS`, textos nuevos en `reportMessages`                                                                                                      | `report/schema.test.ts`                                                                                                                                                     |
| `src/server/db/constraint-error.ts`                          | `QUERY_CANCELED = "57014"`                                                                                                                                                            | —                                                                                                                                                                           |
| `src/modules/workspace/service.ts`, `repository.ts`          | `WorkspacePerson.email`; `listWorkspacePeople(tx, actor, userIds?)`                                                                                                                   | `workspace/service.integration.test.ts`; los del reporte que siembran personas                                                                                              |
| `src/modules/mcp/schema.ts`, `tools.ts`                      | Dos herramientas; la descripción de `list_entries`; `ConsentView.seesTeam`                                                                                                            | `mcp/schema.test.ts`, `tools.test.ts`, `tools.integration.test.ts`                                                                                                          |
| `src/modules/mcp/service.ts`                                 | `getConsentView` arma `seesTeam`                                                                                                                                                      | `mcp/service.integration.test.ts`                                                                                                                                           |
| `src/modules/mcp/handler.integration.test.ts`                | La lista de `tools/list` pasa de ocho a diez                                                                                                                                          | ese test                                                                                                                                                                    |
| `src/modules/mcp/components/consent-screen.tsx`, `labels.ts` | La oración con `seesTeam`                                                                                                                                                             | `consent-screen.test.tsx`; e2e 1 de `mcp.spec.ts`                                                                                                                           |

- **`src/modules/mcp/handler.ts`** rechaza un lote JSON-RPC con 400 y `-32600`
  antes de `consumeCall` (revisión de seguridad, mayor): el transporte del SDK
  acepta hasta 100 mensajes por `POST` y el tope cuenta uno por `POST`, así que
  un lote multiplicaba por cien las 120 llamadas por minuto. La versión
  2025-06-18 del protocolo ya no tiene lotes, y claude.ai y Claude Code no los
  mandan. Se prueba en `handler.integration.test.ts`.
- **Sin cambio**: `can()` y `permissions.test.ts`, `time-entry/`,
  `mcp-context.ts`, `mcp-auth.ts`, `oauth-records.ts`, `audit.ts`,
  `export/handler.ts`, la página de reportes, `/equipo`, el esquema de la base.
- **La página y las exportaciones** pasan `PAGE_READ` y `EXPORT_READ`: deciden
  lo mismo que hoy, con el mismo tope de 8 s solo en la exportación.

### Coordinación con la fase 2

- **WS2a ya está en `main`** (comprobado en el worktree): `TimeSettings.formats`
  tiene `duration`, `WorkspaceContext` tiene `settings` (`durationFormat`) y
  `timeSettingsOf` lo lee, y `src/test/factories.ts` tiene `defaultFormats`
  (con `duration: "compact"`) y `setDurationFormat`. Para este slice:
  - todo `TimeSettings` que un test arme a mano usa `defaultFormats`, y todo
    `ProfileContext` o `McpContext` armado a mano lleva `settings`; ningún
    `"compact"` ni `"full"` literal fuera de `factories.ts`, para no romper la
    búsqueda de §9.6 de WS2b;
  - `summarize_hours` no formatea duraciones: minutos enteros (D-MCPE-5).
- **WS2b está en curso** (`/home/maxi/program/clock-ws2b`,
  `fase2-ws2b-selector.md`, §1 y §7). Lo que comparte con este slice:
  - **`workspace/repository.ts` y `service.ts`**: WS2b suma al final
    `findWorkspaceSettings`, `lockWorkspaceSettings`,
    `updateWorkspaceSettings`, `getWorkspaceSettingsView` (pasa a `async`) y
    `updateWorkspaceSetting`; este slice cambia `listPeople` y
    `listWorkspacePeople` y el tipo `WorkspacePerson`. Son funciones distintas
    del mismo archivo: el conflicto es de texto, si lo hay.
  - **`workspace/schema.ts`**: lo toca WS2b; este slice no.
  - **`report/export/`** (`types.ts`, `document.ts`, `cell-text.ts`, `csv.ts`,
    `xlsx.ts`, `pdf-layout.ts`, `entry-size.ts`) y
    `export/handler.integration.test.ts`: los toca WS2b; este slice no los
    toca, pero cambia la firma interna de `readReportState`, que
    `getReportExport` llama. `export/handler.ts` no cambia en ninguno de los
    dos.
  - **`src/test/factories.ts`**: este slice no lo edita; si hace falta una
    fábrica nueva (por ejemplo, un correo liberado), va al final del archivo.
  - WS2b declara que no toca el service, el repository ni `schema.ts` del
    reporte, ni `mcp`.
- **Después de cada rebase**: `npm run typecheck`, y las suites de `report`,
  `workspace` y `mcp` (unidad e integración), además de la búsqueda de §9.6 de
  WS2b si WS2b ya mergeó.

## 2. Esquema y migración

**Ninguna.** No hay tablas ni columnas nuevas: `user.email` ya existe y las
lecturas usan los índices de siempre (`time_entry_workspace_user_started_idx`,
la clave de `membership`).

## 3. Permisos

**Sin acciones nuevas.** La unión `Action`, `resourceKinds` y `allowedRoles` no
cambian.

| Acción                  | Roles        | Dónde se consulta en este slice                                                               |
| ----------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| `mcp.connect`           | `everyone`   | en cada pedido a `/api/mcp`, como hoy (D-MCP-3)                                               |
| `report.view`           | `everyone`   | `report/operations.ts` (`assertCan`) y `readReportState` / `getPeopleCatalog`, como la página |
| `timeEntry.others.view` | owner, admin | `scopeOf` de `report/service.ts`, como hoy; y `getConsentView`, para `seesTeam`               |
| `team.manage`           | owner, admin | `getPeopleCatalog`, para el correo (D-MCPE-2), con la regla de `getTeamView`                  |

`getConsentView` usa `can()` para mostrar una oración, no para decidir acceso:
lo que el asistente ve lo decide `scopeOf` en cada llamada.

## 4. Contrato

### 4.1 `report/schema.ts`

```ts
/** D-MCPE-5: el tope de filas de los niveles de un resumido para el asistente. */
export const HOURS_SUMMARY_MAX_ROWS = 500;

// En reportMessages:
//   viewForbidden: "No podés ver reportes.",
//   othersForbidden: "Solo un propietario o un administrador ve las horas de otras personas.",
//   peopleNotFound: "Alguna de las personas pedidas no es del workspace.",
//   projectsNotFound: "Alguno de los proyectos pedidos no existe o no lo podés ver.",
//   clientsNotFound: "Alguno de los clientes pedidos no existe.",
//   summaryTooSlow:
//     "El resumen tardó demasiado. Pedí un período más corto, menos niveles o menos personas.",
//   levelsRepeated: "Los niveles de agrupación no se pueden repetir.",
//   filterValues: `Cada filtro lleva de 1 a ${REPORT_MAX_FILTER_VALUES} valores, sin repetir.`,

/** D-MCPE-4, D-MCPE-6: los códigos de `ReportError`. */
export type ReportErrorCode = ActionErrorCode | "timeout";

/**
 * D-MCPE-1: el pedido de `summarize_hours`, con los textos del módulo. El
 * período pasa por `reportRangeInput`; los ids, por los mismos formatos que la
 * URL (`PERSON_ID`, `LOWERCASE_UUID`).
 */
export const hoursSummaryInput = z
  .object({
    from: z.string(),
    to: z.string(),
    groupBy: z.enum(REPORT_GROUP_BYS).default(DEFAULT_GROUP_BY),
    subgroups: z.array(z.enum(REPORT_GROUP_BYS)).max(2).default([]),
    userIds: filterValues(z.string().regex(PERSON_ID)).optional(),
    projectIds: filterValues(z.string().regex(LOWERCASE_UUID)).optional(),
    withoutProject: z.boolean().default(false),
    clientIds: filterValues(z.string().regex(LOWERCASE_UUID)).optional(),
    includePeopleWithoutTime: z.boolean().default(false),
  })
  // el período, con el texto de rangeProblem, en `to`
  // los niveles sin repetir, con levelsRepeated, en `subgroups`
  // projectFilterCount(projectIds, withoutProject) <= REPORT_MAX_FILTER_VALUES, con filterValues
  .transform((values): HoursSummaryValues => …);
export type HoursSummaryInput = z.input<typeof hoursSummaryInput>;

/** Lo que recibe `getHoursSummary`: un `ReportRequest` con el período siempre presente. */
export type HoursSummaryValues = {
  readonly range: ReportRange;
  readonly groupBy: ReportGroupBy;
  readonly subgroups: readonly ReportGroupBy[];
  readonly filters: ReportFilters;
  readonly peopleWithoutTime: boolean;
};

/** D-MCPE-2: una persona del catálogo del asistente. */
export type PeopleCatalogPerson = {
  readonly id: string;
  /** `displayNameOf`. */
  readonly name: string;
  /** Con `team.manage` y sin liberar; si no, `null` (D-MCPE-2). */
  readonly email: string | null;
  readonly inactive: boolean;
  readonly self: boolean;
};
export type PeopleCatalog = {
  /** El de `scopeLineOf`: `everyone` con `timeEntry.others.view`, si no `self`. */
  readonly scope: "everyone" | "self";
  /** En el orden de `compareNames`; con `self`, solo quien pide. */
  readonly people: readonly PeopleCatalogPerson[];
};
```

`filterValues` lleva el mensaje `filterValues` en sus tres reglas (`min`, `max`
y sin repetir); los de la URL siguen sin mensaje, porque la URL los descarta con
`safeParse`. Si ponerle mensaje cambia lo que afirman los tests de la URL,
`hoursSummaryInput` usa una copia con mensaje y la de la URL queda igual.

### 4.2 `report/service.ts`

```ts
/** Error de dominio del reporte. La herramienta lo traduce con `failureOf`. */
export class ReportError extends DomainError<ReportErrorCode> {}

/**
 * Cómo lee una puerta de entrada. `readReportState` lo recibe obligatorio y sin
 * valor por omisión: una llamada que no elige modo no compila.
 */
type ReadMode = {
  /** D-MCPE-4: un id fuera de su catálogo corta en lugar de ignorarse (D-R4-5). */
  readonly strictFilters: boolean;
  /** D-R3-6, D-MCPE-5: el tope de filas de los niveles. */
  readonly maxRows: number;
  /** S3 de R6a, D-MCPE-6: `set local statement_timeout` en la transacción. */
  readonly statementTimeout: boolean;
  /** D-MCPE-6: si lee las barras; sin ellas, `chart: null`. */
  readonly chart: boolean;
};

const PAGE_READ: ReadMode = {
  strictFilters: false,
  maxRows: REPORT_MAX_ROWS,
  statementTimeout: false,
  chart: true,
};
const EXPORT_READ: ReadMode = { ...PAGE_READ, statementTimeout: true };
const ASSISTANT_READ: ReadMode = {
  strictFilters: true,
  maxRows: HOURS_SUMMARY_MAX_ROWS,
  statementTimeout: true,
  chart: false,
};

/**
 * D-MCPE-1, D-MCPE-4, D-MCPE-6: el resumido para el asistente, con
 * `ASSISTANT_READ`. Lo mismo que `getReportState` para el mismo pedido, salvo
 * lo que decide el modo; sin `report.view`, `ForbiddenError`; un tope de
 * sentencia vencido, `ReportError("timeout")`.
 */
export async function getHoursSummary(
  actor: Actor,
  settings: TimeSettings,
  request: HoursSummaryValues,
  now?: Date,
): Promise<ReportReadyState>;

/**
 * D-MCPE-2: las personas cuyas horas puede consultar `actor`: con
 * `timeEntry.others.view`, todas las del workspace, activas e inactivas; si no,
 * solo él. El correo, con `team.manage`. Sin `report.view`, `ForbiddenError`.
 * Una transacción de solo lectura.
 */
export async function getPeopleCatalog(actor: Actor): Promise<PeopleCatalog>;
```

`ReportError` sigue el molde de `ProjectError` (constructor con `code` y
`message`, y su `name`).

**El modo**, dentro de `readReportState` y `readReport`:

- `readReportState(actor, settings, request, now, read, mode: ReadMode)`.
  `getReportState` pasa `PAGE_READ`; `getReportExport`, `EXPORT_READ`;
  `getHoursSummary`, `ASSISTANT_READ`. Hay tres constantes y no dos porque el
  tope de la exportación hoy sale de `exporting` (`read !== null`), y pasa a
  salir del modo.
- `ReadPlan` cambia `exporting` por `statementTimeout` (lo único que
  `exporting` decidía era el tope) y suma `strictFilters`, `maxRows` y `chart`,
  copiados del modo. `readLevelsWithinLimit` recibe `maxRows` en lugar de leer
  la constante. Con `chart: false`, `readReport` no llama a `totalsByBucket` y
  `chartOf` no corre: el estado sale con `chart: null`.
- **Antes de abrir la transacción**, con `strictFilters` y el alcance `self`:
  si `request.filters.people` tiene algún id distinto de `actor.userId`, lanza
  `ReportError("forbidden", reportMessages.othersForbidden)`. Con solo el
  propio sigue: el alcance `self` ya es eso, y `effectiveFiltersOf` lo descarta
  como hoy.
- **Dentro de `readReport`**, después de `effectiveFiltersOf` y antes de
  `readLevelsWithinLimit`, con `strictFilters`: si los filtros efectivos tienen
  menos personas (solo con el alcance `everyone`), proyectos o clientes que los
  pedidos, lanza `ReportError("not_found", …)` con el texto de la primera lista
  que no coincide, en ese orden. `withoutProject` no se compara: no está en
  ningún catálogo.
- `getHoursSummary` convierte el estado `forbidden` de `readReportState` en
  `ForbiddenError("report.view")`, y un error con
  `hasCode(error, QUERY_CANCELED)` en `ReportError("timeout",
reportMessages.summaryTooSlow)`; cualquier otro lo relanza.
- Comentario de `getHoursSummary`: que es la única puerta del asistente a horas
  ajenas, que pasa por `scopeOf` como la página y que la página no usa el modo
  estricto porque una URL armada a mano no debe romperla (D-R4-5).

**`getPeopleCatalog`**: `scopeOf(actor)`; en una transacción `read only`,
`listWorkspacePeople(tx, actor)` con el alcance `everyone` y
`listWorkspacePeople(tx, actor, [actor.userId])` con `self`; cada una a
`PeopleCatalogPerson` con `displayNameOf`, `email: seesEmails &&
!isReleasedEmail(email) ? email : null` (con `seesEmails = can(actor,
"team.manage", workspace)`, consultado una vez), `status === "inactive"` y
`userId === actor.userId`; ordenadas con `compareNames`.

`QUERY_CANCELED = "57014"` se suma a `src/server/db/constraint-error.ts`, al
lado de los otros códigos de Postgres, con su comentario («Postgres: sentencia
cancelada, también por `statement_timeout`»).

### 4.3 `report/operations.ts` (nuevo, sin `"use server"`)

```ts
/**
 * D-MCPE-1: la validación, el permiso y el service de las lecturas del reporte
 * que usa el asistente. Una regla nueva de la operación va acá.
 */
export async function summarizeHours(
  context: ProfileContext,
  input: HoursSummaryInput,
): Promise<ReportReadyState>;
// hoursSummaryInput.parse; assertCan(actor, "report.view", workspace);
// service.getHoursSummary(context.actor, timeSettingsOf(context), values)

export async function listPeople(context: ProfileContext): Promise<PeopleCatalog>;
// assertCan(actor, "report.view", workspace); service.getPeopleCatalog(context.actor)
```

La zona y el primer día de la semana son los del perfil de quien pide
(`timeSettingsOf`): los días se cortan donde los corta `get_context` (RP-22).

### 4.4 `workspace` (`service.ts`, `repository.ts`)

- `WorkspacePerson` suma `readonly email: string` (`user.email`, tal cual; la
  traducción del correo liberado y el permiso son de quien muestra).
- `listPeople(tx, workspaceId, userIds?)` suma `user.email` al `select` y, con
  `userIds`, `inArray(membership.userId, userIds)` al `where`.
- `listWorkspacePeople(tx, actor, userIds?: readonly string[])` lo pasa. Su
  comentario suma que el catálogo del asistente lo llama con el alcance
  `everyone`, o con solo la persona propia con `self`, y que el correo solo se
  muestra con `team.manage`.
- `toPersonOptions` del reporte no cambia: copia campo por campo, y el correo
  no llega a la página.

### 4.5 `mcp/schema.ts`

**Entradas:**

```ts
const groupBy = z.enum(REPORT_GROUP_BYS);

export const summarizeHoursToolInput = z.object({
  from: dayKey,
  to: dayKey.describe("Último día del período, incluido; hasta 366 días desde from."),
  groupBy: groupBy
    .optional()
    .describe("El primer nivel de agrupación; sin el campo, person."),
  subgroups: z
    .array(groupBy)
    .max(2)
    .optional()
    .describe("Hasta dos niveles debajo de groupBy, distintos entre sí y de groupBy."),
  userIds: z
    .array(z.string())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de list_people; sin el campo, todas las personas que se pueden ver."),
  projectIds: z
    .array(z.uuid())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de proyecto de list_projects o de un grupo por proyecto."),
  withoutProject: z
    .boolean()
    .optional()
    .describe(
      "Suma las entradas sin proyecto al filtro de proyectos, o las elige solas.",
    ),
  clientIds: z
    .array(z.uuid())
    .min(1)
    .max(REPORT_MAX_FILTER_VALUES)
    .optional()
    .describe("Ids de cliente de list_projects o de un grupo por cliente."),
  includePeopleWithoutTime: z
    .boolean()
    .optional()
    .describe(
      "Con groupBy person y si se ve a todas: suma en 0 a las personas activas sin horas en el período.",
    ),
});
```

`list_people` no tiene entrada.

**Salidas:**

```ts
/** D-MCPE-5: lo común a un grupo de cualquier nivel. */
const summaryGroupFields = {
  kind: z.enum(REPORT_GROUP_BYS),
  /**
   * El id de la persona, el proyecto, el cliente, la tarea, la etiqueta o el
   * hash de la descripción; el primer día del tramo (AAAA-MM-DD) en date, week
   * y month; `null` en los «Sin …».
   */
  key: z.string().nullable(),
  /** El nombre, la descripción (hasta 100 caracteres) o el mismo día de key; `null` en los «Sin …». */
  name: z.string().nullable(),
  minutes: z.number().int(),
  /** Solo en person (RP-61). */
  inactive: z.boolean().optional(),
  /** Solo en project: el nombre del cliente, o `null`. */
  client: z.string().nullable().optional(),
  /** Solo en task: el nombre del proyecto, o `null`. */
  project: z.string().nullable().optional(),
  /** Solo en description: el texto entero es más largo que name. */
  truncated: z.boolean().optional(),
};
const summaryLeaf = z.object(summaryGroupFields);
const summaryMiddle = summaryLeaf.extend({ children: z.array(summaryLeaf).optional() });
const summaryGroup = summaryLeaf.extend({ children: z.array(summaryMiddle).optional() });

export const summarizeHoursToolOutput = z.object({
  timezone: z.string(),
  from: z.string(),
  to: z.string(),
  /** `everyone` si se ve a todas las personas; `self`, solo lo propio. */
  scope: z.enum(["everyone", "self"]),
  groupBy,
  subgroups: z.array(groupBy),
  /** Los niveles que entraron en el tope: menos que los pedidos si no (D-R3-6). */
  levelsShown: z.number().int(),
  totalMinutes: z.number().int(),
  billableMinutes: z.number().int(),
  groups: z.array(summaryGroup),
});

export const listPeopleToolOutput = z.object({
  scope: z.enum(["everyone", "self"]),
  people: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      email: z.string().nullable(),
      inactive: z.boolean(),
      self: z.boolean(),
    }),
  ),
});

export type SummarizeHoursToolOutput = z.infer<typeof summarizeHoursToolOutput>;
export type ListPeopleToolOutput = z.infer<typeof listPeopleToolOutput>;
export type SummaryGroup = z.infer<typeof summaryGroup>;
```

**De `ReportGroup` a `SummaryGroup`** (`summaryGroupOf`, en `tools.ts`):

| `kind`        | `key`                     | `name`                      | Además                                       |
| ------------- | ------------------------- | --------------------------- | -------------------------------------------- |
| `person`      | `userId`                  | `name`                      | `inactive`                                   |
| `project`     | `project?.id ?? null`     | `project?.name ?? null`     | `client: client?.name ?? null`               |
| `client`      | `client?.id ?? null`      | `client?.name ?? null`      | —                                            |
| `task`        | `task?.id ?? null`        | `task?.name ?? null`        | `project: project?.name ?? null`             |
| `tag`         | `tag?.id ?? null`         | `tag?.name ?? null`         | —                                            |
| `date`        | `dayKey`                  | `dayKey`                    | —                                            |
| `week`        | `weekStart`               | `weekStart`                 | —                                            |
| `month`       | `monthStart`              | `monthStart`                | —                                            |
| `description` | `description?.id ?? null` | `description?.text ?? null` | `truncated: description?.truncated ?? false` |

`minutes` es `wholeMinutes(seconds)`; `children`, si la vista los trae, cada uno
con `summaryGroupOf`. Una persona sin horas (D-R9-3) sale con `minutes: 0` y sin
`children`. El `switch` sobre `kind` es exhaustivo: una clase nueva en
`REPORT_GROUP_BYS` no compila sin su fila.

**Consentimiento**: `ConsentView` `ready` suma `readonly seesTeam: boolean`.

### 4.6 `mcp/tools.ts`

`registerTools` suma las dos después de `list_entries`; el comentario pasa de
«las ocho herramientas» a «las diez».

- **`list_people`**: título «Personas del equipo»; descripción: «Las personas
  cuyas horas puede consultar la persona con summarize_hours, con el id que
  pide userIds, el nombre, si está inactiva y cuál es ella misma. El correo
  viene solo si la persona administra el equipo y no se liberó; si no, null.
  Con scope everyone son todas las del workspace, activas e inactivas; con
  scope self, solo ella.». `runTool(() => reportOperations.listPeople(context),
present, reportToolMessages)`.
- **`summarize_hours`**: título «Resumen de horas»; descripción: «Las horas
  cerradas que empiezan entre from y to, los dos incluidos, hasta 366 días,
  sumadas en minutos y agrupadas en hasta tres niveles, como el reporte de
  Clock. Con scope everyone se ve a todo el workspace y se puede filtrar por
  userIds de list_people; con scope self, solo lo propio. El timer que corre no
  cuenta. Cada grupo redondea sus minutos hacia abajo por separado. Para saber
  qué hizo alguien cada día, agrupá por person, date y description. La
  respuesta tiene un tope de 500 grupos entre todos los niveles: si levelsShown
  es menor que los niveles pedidos, no entraron todos; volvé a pedir con
  userIds de una o pocas personas, o con dos niveles en lugar de tres, o con un
  período más corto. Los días se cortan en la zona de la persona que devuelve
  get_context.». Sin `WALL_CLOCK`: la respuesta no trae horas de pared.
  `runTool(() => reportOperations.summarizeHours(context, input), summaryOf,
reportToolMessages)`.
- **`reportToolMessages`**: `{ forbidden: reportMessages.viewForbidden,
unexpected: mcpMessages.unexpected }`. Es el texto de un `ForbiddenError`
  (`failure.ts`, la rama de `ForbiddenError`), que acá solo puede venir de
  `report.view`. El `forbidden` de horas ajenas, el `not_found` y el `timeout`
  son `ReportError` y salen con su propio texto por la rama de `DomainError`.
- **`summaryOf(report)`**, exportada para el test de unidad, anotada con
  `SummarizeHoursToolOutput`: `timezone: report.timeZone`, `from:
report.range.first`, `to: report.range.last`, `scope`, `groupBy`,
  `subgroups`, `levelsShown`, `totalMinutes: wholeMinutes(totalSeconds)`,
  `billableMinutes: wholeMinutes(billableSeconds)`, `groups:
report.groups.map(summaryGroupOf)`. No lee `chart`.
- **`list_entries`**: su descripción empieza «Las entradas propias…» como hoy y
  suma al final «Para las horas de otras personas, summarize_hours.».

### 4.7 El consentimiento

- `getConsentView` (`mcp/service.ts`) suma `seesTeam: can(context.actor,
"timeEntry.others.view", workspaceResource(context.actor))` en `ready`.
- `consentLabels.teamBody`: «Como propietario o administrador, también va a
  poder ver las horas de las demás personas del workspace.».
- `ConsentScreen` muestra `teamBody` en un párrafo propio, después de `body`,
  solo con `seesTeam`. Sin otro cambio de diseño.

### 4.8 Las respuestas

| Situación                                                                   | Resultado                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `list_people` de un owner o admin                                           | `scope: "everyone"`, todas las activas e inactivas, sin invitadas, con correos |
| `list_people` de cualquier otro rol                                         | `scope: "self"`, una fila, `self: true`, `email: null`                         |
| `list_people` sin `team.manage` (por `permissionOverrides`)                 | los correos en `null`                                                          |
| `summarize_hours` sin filtros de un owner o admin                           | todo el workspace, `scope: "everyone"`                                         |
| `summarize_hours` de otro rol                                               | lo propio, `scope: "self"`                                                     |
| `userIds` con otra persona, sin `timeEntry.others.view`                     | `isError`, `forbidden`, `othersForbidden`; sin leer                            |
| Sin `report.view` (guarda; una membresía activa lo tiene)                   | `isError`, `forbidden`, `viewForbidden`                                        |
| `userIds` con un id que no está en el catálogo                              | `isError`, `not_found`, `peopleNotFound`                                       |
| `projectIds` o `clientIds` con un id que no está en el catálogo             | `isError`, `not_found`, `projectsNotFound` o `clientsNotFound`                 |
| Período invertido, de más de 366 días o con un día que no existe            | `isError`, `validation`, el texto de `rangeProblem`                            |
| Niveles repetidos, más de dos `subgroups`, filtros de más de 50 o repetidos | `isError`, `validation` (del SDK o del módulo, V-8)                            |
| Una sentencia que pasa los 8 s                                              | `isError`, `timeout`, `summaryTooSlow`                                         |
| Más filas que el tope                                                       | éxito, `levelsShown` menor que los niveles pedidos                             |
| `includePeopleWithoutTime` con otro `groupBy` o con `scope: "self"`         | éxito, sin personas en cero (D-R9-5, como la página)                           |
| Cualquiera de las dos, en `audit_log`                                       | ninguna fila                                                                   |

## 5. Reparto de archivos

### backend-dev

- **V-1** (§0), antes de escribir las herramientas.
- `src/modules/report/schema.ts` (§4.1), `service.ts` (§4.2) y
  `operations.ts` (§4.3), con sus tests de unidad e integración de §7.
- `src/server/db/constraint-error.ts` (`QUERY_CANCELED`).
- `src/modules/workspace/service.ts` y `repository.ts` (§4.4).
- `src/modules/mcp/schema.ts` (§4.5), `tools.ts` (§4.6) y `service.ts`
  (§4.7, `seesTeam`). Avisa a `frontend-dev` cuando `ConsentView` tiene
  `seesTeam`.
- `CLAUDE.md` no cambia: «`operations.ts`» ya describe el archivo nuevo.

### frontend-dev

- `src/modules/mcp/components/consent-screen.tsx`, `labels.ts` y
  `consent-screen.test.tsx` (§4.7).

### test-engineer

- Los casos de integración por `tools/call` de §7.2 en
  `mcp/tools.integration.test.ts`, con `issueTestGrant` para un owner, un admin,
  un `member` y un `project_manager` del mismo workspace y un owner de otro.

### e2e-tester

- Los recorridos de §7.3 en `e2e/mcp.spec.ts`, con el cliente de `e2e/mcp.ts`.

### security-reviewer

- D-MCPE-2 a D-MCPE-4 y D-MCPE-6 contra el código, antes del merge: que ninguna
  lectura nueva de horas ajenas exista fuera de `getHoursSummary` y
  `getPeopleCatalog`, que los dos pasen por `scopeOf`, que el correo siga a
  `team.manage`, que `ASSISTANT_READ` lleve el tope de sentencia, y la tabla de
  §4.8.

### Orden

1. `backend-dev`: V-1; los tipos y textos de §4.1 y §4.5 y `seesTeam`; avisa.
2. En paralelo: `backend-dev` con el service y las herramientas;
   `frontend-dev` con la pantalla; `test-engineer` con la matriz de §7.2;
   `e2e-tester` con el spec.
3. Revisiones, con `security-reviewer`; correcciones; `npm run lint && npm run
typecheck && npm run test:all` y la e2e entera.

## 6. Criterios de aceptación

1. **`tools/list`** trae diez herramientas: las ocho de hoy, `list_people` y
   `summarize_hours`, las dos con `readOnlyHint: true` y su `outputSchema`.
2. **`list_people`**: un owner y un admin reciben `scope: "everyone"` con todas
   las personas del workspace, activas e inactivas (marcadas), sin invitadas y
   sin nadie de otro workspace, con `self: true` en la propia, los correos, y
   `null` para una con el correo liberado; un `member`, un `project_manager` y
   un `team_manager` reciben `scope: "self"`, solo su fila y `email: null`.
3. **El correo sigue a `team.manage`**: un owner al que `permissionOverrides`
   le niega `team.manage` recibe `scope: "everyone"` con todos los correos en
   `null`.
4. **`summarize_hours` de un owner o admin** suma lo mismo que la página de
   reportes para el mismo período, niveles y filtros, en minutos: por persona,
   por persona y proyecto, por persona, fecha y descripción; con `userIds` de
   una persona, solo ella; con una inactiva, sus horas y `inactive: true`; con
   `includePeopleWithoutTime`, las activas sin horas en 0.
5. **`summarize_hours` de cualquier otro rol** suma solo lo propio, con
   `scope: "self"`; con `userIds: [<propio>]`, lo mismo.
6. **IDOR**, cada uno como resultado `isError` y sin leer horas ajenas: un
   `member` con el id de otra persona, `forbidden` con `othersForbidden`; un
   owner con el id de una persona de otro workspace, con uno inexistente o con
   el de una invitada, `not_found` con el mismo texto; un proyecto de otro
   workspace, `not_found`; un cliente inexistente, `not_found`.
7. **El tope de filas**: con más de 500 filas en los niveles pedidos,
   `levelsShown` menor que los pedidos y los grupos de los niveles que
   entraron; la página, con el mismo pedido, sigue mostrando hasta 3000.
8. **El tope de sentencia**: el resumido llama a `limitStatementTime` una vez,
   con 8000, antes de la primera lectura; una cancelación `57014` responde
   `timeout` con `summaryTooSlow`, no `unexpected`. `getReportState` sigue sin
   tope.
9. **Sin gráfico**: el resumido no llama a `totalsByBucket`; la página y las
   exportaciones sí.
10. **El día es el de quien pide**: una entrada que empieza a las 23:30 en la
    zona de quien pide cuenta en ese día aunque en la zona de quien la cargó sea
    el siguiente (RP-22).
11. **El timer que corre no cuenta** en ningún total.
12. **Sin constancias**: ninguna de las dos escribe en `audit_log`.
13. **El permiso se decide en cada llamada**: un owner pasado a `member` por SQL
    recibe `scope: "self"` en la llamada siguiente con el mismo token
    (`tools.integration`); un owner al que `permissionOverrides` le niega
    `timeEntry.others.view` recibe `scope: "self"` y solo lo propio
    (`scope.integration`).
14. **La página y las exportaciones no cambian**: sus suites siguen en verde
    sin cambiar lo que afirman, también con un id ajeno en la URL, que se sigue
    ignorando.
15. **El consentimiento**: `/conectar` de un owner o admin muestra la oración de
    `teamBody`; la de un `member`, no.
16. **`list_entries` no cambia**: lee solo lo propio, como hoy, y su
    descripción manda a `summarize_hours`.

## 7. Plan de tests

Los `TimeSettings` armados a mano usan `defaultFormats` de
`src/test/factories.ts`, y los contextos armados a mano llevan `settings`
(WS2a); ningún `"compact"` ni `"full"` literal (§1, «Coordinación»).

### 7.1 Unidad

- `report/schema.test.ts`: `hoursSummaryInput` con 366 y 367 días, invertido,
  un día que no existe, niveles repetidos, tres `subgroups`, `userIds` vacío,
  con 51 y con repetidos, un uuid en mayúsculas, 50 proyectos más
  `withoutProject`; los valores por omisión.
- `mcp/schema.test.ts`: `summarizeHoursToolInput` y las dos salidas con un
  ejemplo de cada forma.
- `mcp/tools.test.ts`: `summaryGroupOf` con cada `kind` y cada «Sin …»; los tres
  niveles anidados; `summaryOf` con minutos redondeados hacia abajo (59 s es 0,
  119 s es 1) y `billableMinutes`; el texto de `content` igual a
  `structuredContent` en las dos herramientas; `failureOf` con
  `reportToolMessages` da `viewForbidden` para un `ForbiddenError` y
  `othersForbidden` para el `ReportError("forbidden")`.
- `consent-screen.test.tsx`: con y sin `seesTeam`.

### 7.2 Integración (Postgres)

- **`report/scope.integration.test.ts`** (ADR 0020: cada puerta nueva suma su
  caso con un `member` que no ve nada ajeno): `getHoursSummary` y
  `getPeopleCatalog` con un owner, un admin, un `member`, un `project_manager`,
  un owner al que `permissionOverrides` le niega `timeEntry.others.view`
  (criterio 13, la parte del override) y un owner de otro workspace con horas.
  Cada caso de D-MCPE-4, incluido que un `forbidden` antes de leer no abra la
  transacción. El correo: un owner al que `permissionOverrides` le niega
  `team.manage` recibe los correos en `null` (criterio 3).
- **`report/service.integration.test.ts`**: `getHoursSummary` da los mismos
  grupos y totales que `getReportState` para el mismo pedido sin ids fuera del
  catálogo; el tope de 500 con `levelsShown`; las personas sin horas; el día de
  quien pide (criterio 10); el timer fuera (criterio 11). El tope de sentencia
  (criterio 8), con el molde de los de la exportación: `limitStatementTime`
  espiado, una vez, con 8000, antes de la primera lectura; `show
statement_timeout` en `8s` dentro de la transacción; un `57014` inyectado en
  una función del repository (un error con `code: "57014"` en la cadena de
  `cause`) da `ReportError("timeout")`. Sin gráfico (criterio 9):
  `totalsByBucket` espiado, sin llamadas en el resumido y con una en
  `getReportState`. Un id ajeno en `getReportState` y en `getReportExport` se
  sigue ignorando (criterio 14).
- **`workspace/service.integration.test.ts`**: `listWorkspacePeople` con el
  correo y con `userIds`.
- **`mcp/tools.integration.test.ts`**: criterios 2, 4 a 6 y 12 por `tools/call`
  con tokens de `issueTestGrant`; el 12 cuenta las filas de `audit_log` antes y
  después; el 13, solo el cambio de rol por SQL entre dos llamadas con el
  mismo token.
- **`mcp/handler.integration.test.ts`**: la lista de diez (criterio 1).
- **`mcp/service.integration.test.ts`**: `getConsentView` con `seesTeam` para
  owner, admin y `member`.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia. Los mutantes que tienen que caer:

- sin el modo estricto, el `not_found` del id de otro workspace devuelve las
  horas de todo el equipo: cae el criterio 6;
- `strictFilters: true` en `getReportState` o en `getReportExport`: cae el
  criterio 14 (el id ajeno de la URL deja de ignorarse);
- `maxRows` fijo en `REPORT_MAX_ROWS`: cae el 7;
- `statementTimeout: false` en `ASSISTANT_READ`: cae el 8;
- sin la traducción del `57014`: cae el 8 (sale `unexpected`);
- `chart: true` en `ASSISTANT_READ`: cae el 9;
- `scopeOf` reemplazado por `everyone`: cae el 5;
- sin la comprobación previa del alcance `self`: cae el `forbidden` del 6;
- el correo sin `team.manage`: cae el 3;
- `ForbiddenError` en lugar de `ReportError("forbidden")` para horas ajenas:
  cae el test de unidad de `failureOf` con `reportToolMessages` y el texto del
  criterio 6.

### 7.3 E2E (`e2e/mcp.spec.ts`)

Con correos y nombres únicos, sin afirmar sobre la base entera.

1. **El equipo desde el asistente**: el owner abre `/conectar` y ve la oración
   de `teamBody`; conecta; una persona P del workspace tiene una entrada de 90
   minutos ayer; `list_people` trae a P con su correo; `summarize_hours` de
   ayer con `userIds: [P]` responde 90 minutos en el grupo de P.
2. **Un miembro no ve a los demás**: P conecta, `/conectar` no tiene la
   oración; `summarize_hours` con el id del owner responde `isError` con
   `forbidden`; sin `userIds`, sus 90 minutos y `scope: "self"`.

### 7.4 Lo que no se prueba en e2e

Los casos de IDOR, los topes, el correo sin `team.manage` y los cambios de rol
(integración), y los clientes reales (el usuario, §8).

## 8. Despliegue

- **Sin migración ni variables nuevas.** El push a `main` despliega a
  producción; nada que correr antes ni después.
- **Las herramientas nuevas aparecen cuando el cliente vuelve a pedir
  `tools/list`**: el servidor no tiene sesiones ni manda
  `notifications/tools/list_changed` (D-MCP-7). En Claude Code alcanza con
  reiniciar la sesión; en claude.ai y ChatGPT, con abrir una conversación nueva
  o, si no aparecen, desconectar y volver a conectar. El usuario lo confirma
  con un owner después del despliegue.
- **Revertir** es revertir el merge: no hay datos que deshacer.

## 9. Riesgos

- **Un modelo que pide demasiado**: un año por persona, proyecto y día son
  miles de grupos. El tope de 500, `levelsShown` y la descripción, que dice
  cómo achicar el pedido, lo frenan; el tope de 8 s corta una lectura cara antes
  de que ocupe la conexión.
- **El tope de 500 recorta el uso principal en equipos grandes** (D-MCPE-5): con
  30 personas, persona × día × descripción de una semana no entra y el
  asistente tiene que pedir por persona. Es la decisión del coordinador; si el
  uso muestra que molesta, el número es una constante.
- **Un modelo que confunde personas**: dos con el mismo nombre. `list_people`
  trae el correo a quien administra el equipo, y la respuesta trae el nombre
  de cada grupo de persona para que el asistente lo muestre.
- **Un cambio futuro que lea horas ajenas fuera del `ReportScope`**: el ADR
  0030 lo prohíbe y `security-reviewer` lo verifica en cada herramienta nueva
  sobre datos ajenos, como el ADR 0020 pide para cada puerta de entrada.
- **El modo se pierde en un refactor del reporte**: `mode` es obligatorio y sin
  valor por omisión, y los mutantes de §7.2 cubren cada campo de
  `ASSISTANT_READ`.
- **Una autorización anterior al cambio**: el owner o admin no leyó la oración
  nueva (§10, pregunta 2).
- **Sin rastro de lecturas**: quién miró horas ajenas desde un asistente no
  queda en ningún lado, como desde la página (§10, pregunta 3).
- **El merge con WS2b**, por `workspace/repository.ts` y `service.ts`, y por
  la firma interna de `readReportState` que llama `getReportExport` (§1).

## 10. Preguntas abiertas para el usuario

**Respondidas por el usuario el 2026-10-21, las cuatro como la recomendación:**
sin detalle por entrada por ahora, las autorizaciones anteriores siguen
sirviendo, sin constancia en `audit_log` y el ADR 0030 aceptado.

1. **¿Hace falta ya el detalle por entrada de otra persona** (hora de inicio y
   fin de cada entrada)? Este contrato da totales por persona, día y
   descripción, que es lo que muestra la página. El detalle es una tercera
   herramienta, `list_team_entries`, por el mismo `ReportScope` (la lectura de
   entradas que ya usa la exportación), con hasta 31 días y 500 entradas como
   `list_entries`. **Recomendación: no por ahora**; sumarla si el uso lo pide.
2. **¿Las autorizaciones de owner y admin anteriores al cambio siguen sirviendo
   sin volver a consentir?** **Recomendación: sí**: es lo que esa persona ya ve
   en la aplicación, el token nunca da más que una sesión, y un alcance nuevo
   obligaría a reconectar (ADR 0030). Si preferís que reconsientan, es un
   alcance `clock.team` y un slice algo más grande.
3. **¿Una consulta de horas ajenas desde un asistente deja constancia en
   `audit_log`?** **Recomendación: no**, como la página y las exportaciones
   (D-MCPE-7). Si la querés, conviene decidirla para la página también, en un
   cambio aparte.
4. **El ADR 0030, en estado «Propuesto»**, espera tu aceptación.

## 11. Fuera de alcance

- **Editar, crear, borrar o parar horas de otra persona**, por cualquier
  herramienta (`timeEntry.others.update` no existe).
- **El detalle por entrada de otra persona** (§10, pregunta 1) y el timer que
  corre de otra persona (P-07).
- **Un filtro de persona en `list_entries`** (D-MCPE-1, ADR 0030).
- **Nombrar a una persona por correo** en la entrada (D-MCPE-2).
- **Un alcance OAuth nuevo** o registrar herramientas por rol (ADR 0030).
- **Constancias de lectura** (D-MCPE-7).
- **Filtros por tarea, etiqueta, descripción o facturable**, que la página
  tampoco tiene (ADR 0020).
- **Importes y tarifas** (RP-09), **el reporte semanal** y **el tablero**.
- **Cambios en «Asistentes conectados»** de `/perfil` (D-MCPE-8).
- **El texto de error de las exportaciones ante un tope vencido**: siguen con
  `exportFailed` (D-MCPE-6).
