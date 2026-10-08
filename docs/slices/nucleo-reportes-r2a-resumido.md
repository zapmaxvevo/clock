# Núcleo de reportes, R2a: resumido por persona y proyecto

Contrato del segundo slice del núcleo de reportes y el primero con pantalla.
Módulo nuevo `src/modules/report/`, que solo lee; pantalla nueva `/reportes`;
dos acciones nuevas en `can()`. Sin cambios de tablas; un índice parcial si la
medición de §6 lo justifica.

- **Fuente de los comportamientos:** `docs/parity/reportes.md`: RP-01 (con
  P-01), RP-02, RP-03 (vacío), RP-05 y RP-06 (deciden como `member`), RP-07,
  RP-10, RP-11 con persona y proyecto en un nivel, RP-18, RP-19, RP-20 con «Esta
  semana», las flechas y el rango libre, RP-21, RP-22, RP-23, RP-24 para «Esta
  semana», RP-28 («Sin proyecto»), RP-29, RP-30, RP-31, RP-32, RP-33 (el primer
  vacío), RP-34, RP-35, RP-61 y RP-64.
- **Lugar en el plan:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R2a».
  Depende de R1 y del 13, los dos en `main`.
- **Revisión del contrato:** pendiente de `architecture-reviewer`.
- **Decisiones de arquitectura asociadas**, todas aceptadas por el usuario:
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md), condición
    tercera: `report.view`, `timeEntry.others.view`, el `ReportScope`, RP-03
    vacío y `who_sees_all_entries` sin efecto.
  - [ADR 0021](../adr/0021-el-reporte-agrega-en-la-base.md): la agregación en la
    base, la medida por entrada truncada a milisegundos, la suma como `bigint`,
    una sola foto, el índice parcial condicionado al `explain`, el tope de 366
    días y la excepción acotada al ADR 0010.
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    los nombres de la persona, el proyecto y el cliente se leen con `join` en el
    repository propio; el nombre de la persona se compone con `displayNameOf` de
    `profile`.
  - [ADR 0012](../adr/0012-un-solo-juego-de-formatos.md): la zona y los formatos
    se resuelven en el servidor.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** Lo que
  queda para el usuario está en §10.

Decisiones que el contrato da por tomadas (ADR 0020, ADR 0021, mapa §5): solo
owner y admin ven horas ajenas (P-01), sin excepción para el responsable (P-02);
un member con un enlace que nombra a otras personas ve lo propio y el parámetro
se descarta; el timer en curso no se muestra ni se avisa (P-07); el tope es de
366 días; los cortes por tramo, los demás atajos y la fecha como agrupación son
de R2b; los filtros, de R4; la exportación, de R6 y R7; cambiar el rol, de R8.

## Decisiones del contrato

**D-R2a-1 — La forma del `ReportScope` y quién lo arma.** Opciones: (1) un tipo
marcado con un símbolo no exportado y un `as` en el constructor; (2) una clase
con un miembro privado, no exportada, cuyo único constructor está en el service;
(3) un `userId` nulable donde `null` es «todos». **(2)**, con la forma

```ts
type ScopePeople =
  /** `timeEntry.others.view`: todas las personas del workspace, activas e inactivas (RP-02, RP-61). */
  | { readonly kind: "everyone" }
  /** Sin el permiso: solo quien mira (RP-01, P-01). */
  | { readonly kind: "self"; readonly userId: string };
```

y el `workspaceId` del actor, siempre. La clase vive en `report/service.ts`, no
se exporta, y el módulo exporta solo su tipo (`export type ReportScope =
Scope`). Su miembro privado la hace nominal: un literal con las mismas
propiedades no la cumple, así que nadie fuera del service la construye sin un
`as`, que la revisión rechaza. El único constructor es `scopeOf(actor)`,
privado del service, que pregunta `timeEntry.others.view` una vez. (3) se
descarta porque un `null` olvidado abre todo; (1) obliga a un `as` en el código
de producción. Toda función del repository de `report` lo recibe como primer
parámetro y lo traduce a su `where` con una sola función privada, `inScope`; el
repository importa el tipo con `import type` desde el service, un ciclo solo de
tipos que se borra al compilar. Un test de tipos lo afirma (criterio 12).

**D-R2a-2 — Cómo decide cada rol.** `can()` decide; el service solo arma el
alcance con lo que responde.

| Membresía                                   | `report.view` | `timeEntry.others.view` | Qué ve                                                             |
| ------------------------------------------- | ------------- | ----------------------- | ------------------------------------------------------------------ |
| `owner`, `admin` activas                    | sí            | sí                      | todas las personas del workspace, activas e inactivas              |
| `project_manager`, `team_manager`, `member` | sí            | no                      | solo lo propio, aunque sea responsable de un proyecto (RP-05, -06) |
| cualquiera no activa                        | no            | no                      | nada: la pantalla lo dice y no se lee ninguna entrada (RP-07)      |

- **RP-03 no se implementa** (ADR 0020): owner y admin ven todos los proyectos y
  el resto ve solo lo propio, que se ve siempre.
- **RP-32 y RP-34 con un enlace ajeno.** R2a no tiene ningún parámetro que
  nombre personas: el filtro llega en R4. Un member que abre un enlace de un
  admin recibe el mismo rango y la misma agrupación con sus propias horas. **La
  pantalla dice siempre el alcance** —«Ves solo tus horas.» o «Ves las horas de
  todas las personas del workspace.»—, así que el member no confunde su total con
  el del equipo. El parámetro de personas de R4 se descarta para un member, como
  decidió el usuario (mapa §5), y R4 hereda esta línea. La tercera fila de RP-34
  («No tenés permiso para hacer esto.») no se muestra en el reporte: la
  reemplaza la decisión del usuario.
- **RP-07**: sin `report.view`, `getReportState` responde `{ kind: "forbidden" }`
  **sin llamar al repository**. La pantalla muestra el título y «Tu acceso al
  workspace está desactivado. No podés ver reportes.». No es un error de lectura:
  no pasa por `error.tsx`, que diría «Reintentar».
- **RP-64**: una membresía invitada no tiene entradas; R2a no muestra personas
  sin horas (eso es R9), así que no aparece.

**D-R2a-3 — Agrupación.** Un nivel, por persona o por proyecto (RP-11 en R2a),
en la URL como `agrupar=persona` o `agrupar=proyecto`. **Sin parámetro, por
persona**, para los dos alcances: es la pregunta que motivó el núcleo («cuánto
cargó cada uno») y RP-32 pide que un enlace sin parámetro dé la misma vista a
cualquiera; a un member le muestra una fila, la suya. Lo que Clockify trae por
defecto está _no verificado_ (P-05). Orden de los grupos (RP-12): duración
descendente; con la misma duración, por nombre (`compareNames`, que desempata
por id); «Sin proyecto» va después de los proyectos con su misma duración.

**D-R2a-4 — El rango.** Opciones para el rango libre: dos selectores de fecha
sueltos con «Aplicar», o un calendario de rango en un popover con «Aplicar».
**El calendario de rango**, en el mismo botón que muestra el período, como el
`PeriodPicker` del calendario y la planilla; dos `DateField` dentro de un
popover serían popovers anidados, que ya dieron problemas (lección de los
popups dentro de un `Dialog` en `estado-fase1.md`). Lo demás:

- **En la URL**, `desde` y `hasta`, claves de día con **los dos extremos
  incluidos**: `/reportes?desde=2026-10-05&hasta=2026-10-11&agrupar=proyecto`.
- **Sin rango válido, «Esta semana»**: los siete días desde
  `weekStartKey(hoy, primer día de quien mira)` (RP-20, RP-24).
- **Válido** es: las dos claves existen (`parseDayKey`), el día siguiente a
  `hasta` tiene clave de cuatro cifras (es la cota superior de la lectura),
  `hasta >= desde`, y el período tiene a lo sumo 366 días contando los dos
  extremos (RP-21). **Una URL que no cumple se descarta entera, sin aviso**, y
  se muestra «Esta semana» (RP-32); también un parámetro repetido.
- **Los mensajes de RP-34 son del selector**: antes de navegar, valida con el
  mismo esquema que la URL (`reportRangeInput`) y, si falla, muestra el mensaje
  en el popover y no navega. Con el calendario de rango, el fin anterior al
  inicio no se puede elegir; su mensaje queda en el esquema y `parity-analyst`
  registra que la interfaz no lo produce. El de 366 días sí se ve.
- **Un solo día** es un rango: elegido el inicio sin fin, «Aplicar» usa el mismo
  día como fin.
- **Las flechas mueven el período entero** (RP-20): `n` días hacia atrás o
  adelante, con `n` el largo del período. Una flecha cuyo destino no tendría
  clave de cuatro cifras, o cuyo día siguiente al último no la tendría, no se
  dibuja. En R2b, «Este mes» moverá por meses; acá todo período se mueve por
  días.
- **«Esta semana»** es un enlace que aparece cuando el período no es la semana
  actual, como en la planilla.
- **El rótulo**: si el período es una semana alineada al primer día de quien
  mira, `weekKeyLabel` («Esta semana», «Semana anterior» o «28/09 – 04/10»); si
  no, `dayRangeLabel` (nuevo, §4.2): «05/10 – 18/10», con año en los dos
  extremos si alguno no es del año de hoy, y un solo día sin guion.
- **La agrupación sobrevive** a las flechas, al selector y a «Esta semana»; el
  rango sobrevive al cambio de agrupación. Una sola función arma las URL
  (`reportHref`).

**D-R2a-5 — La zona de corte y cómo la dice la pantalla** (RP-22). Los días y
el rango se cortan en la zona del perfil de quien mira (`timeSettingsOf`), con
`startOfDayKey`; ninguna cuenta de zona va al SQL (ADR 0021). La lectura es un
solo intervalo `[startOfDayKey(desde), startOfDayKey(hasta + 1))`, así que R2a
no necesita los cortes por tramo de R2b (mapa §3). La pantalla lo dice debajo
del título: «Los días se cortan en tu zona horaria: America/Argentina/Buenos_Aires.»,
con el valor tal como está en el perfil. Sin desplazamiento: en un período que
cruza un cambio de horario, un solo desplazamiento sería falso en una parte.

**D-R2a-6 — Qué cuenta y cómo se mide** (ADR 0021, con su excepción al ADR 0010).
Cuenta la entrada con `ended_at is not null` y `started_at` en
`[from, to)`, sin ninguna condición sobre el estado de la membresía, del
proyecto ni de la tarea (RP-29, RP-30, RP-61). La duración de cada entrada es

```sql
floor(extract(epoch from date_trunc('milliseconds', ended_at) - date_trunc('milliseconds', started_at)))
```

que es `durationSeconds` sobre los instantes como los ve JS: el driver entrega
`timestamptz` como texto y Drizzle lo convierte con `new Date(texto)`
(`drizzle-orm/node-postgres/session.js:26-29`,
`pg-core/columns/timestamp.js:30-33`), que conserva hasta los milisegundos. Que
los trunque y no los redondee no está escrito en ningún lugar del árbol: lo fija
el criterio 8, que compara con la planilla y no con un número escrito a mano; si
el driver redondea, el SQL lo sigue. Con `milliseconds`, `date_trunc` no depende
de la zona de la sesión. Cada entrada se trunca a segundos enteros y después se
suman; `sum()` devuelve `numeric`, la consulta lo convierte con `::bigint` y el
repository lo pasa a número con una comprobación de entero seguro y no
negativo. El total facturable es la misma suma con `filter (where billable)` y
`coalesce(…, 0)`. **El test que ata las dos copias de la regla** (ADR 0021)
compara el total del reporte con el `closedSeconds` de `getTimesheetState` para
una persona y una semana, con entradas escritas con microsegundos (criterio 8).

**D-R2a-7 — Una sola foto.** Opciones: los grupos y la cabecera en una
sentencia con `grouping sets`; dos sentencias en `repeatable read`; una
sentencia de grupos y la cabecera sumada en el service. **La tercera**: con un
solo nivel de persona o de proyecto, cada entrada está en exactamente un grupo,
así que la suma de los grupos es el total, en enteros y sin redondeo. Una
sentencia por pedido, sin transacción. R3, que trae la etiqueta (una entrada en
varios grupos), tiene que leer el total aparte; su contrato elige entre las
otras dos.

**D-R2a-8 — Cómo se leen los nombres.** La sentencia agrega primero sobre
`time_entry`, en una subconsulta o un CTE agrupado por `(workspace_id,
user_id)` o `(workspace_id, project_id)`, y después une a lo sumo unas decenas
de filas:

- **por persona**: `membership` con `join` interno por `(workspace_id,
user_id)` —R1 garantiza que existe— para el estado; `"user"` con `join`
  interno por el nombre de la cuenta; `user_preference` con `left join` por el
  nombre editado. El service compone con `displayNameOf`, que pasa a aceptar
  `Pick<StoredProfile, "displayName">` (hoy pide el `StoredProfile` entero, con
  preferencias que el reporte no tiene);
- **por proyecto**: `project` con `left join` por `(workspace_id, id)` —un
  `project_id` nulo es «Sin proyecto» (RP-28)— y `client` con `left join` por
  `(workspace_id, id)` contra `project.client_id`. Archivados o no (RP-29). El
  color se estrecha con `isPaletteKey` y, si no es de la paleta, lanza, como
  `projectRefOf` en `time-entry`.

**D-R2a-9 — Volumen, presupuesto e índice.** Ver §6: un volumen sintético
reproducible (30 personas, tres años, 8 entradas por día hábil), cuatro
consultas medidas con `explain (analyze, buffers)` en un Postgres de la misma
versión mayor que Neon, un presupuesto por consulta y una regla escrita para
sumar o no el índice parcial del ADR 0021.

**D-R2a-10 — Ruta, navegación y error.** La ruta es `/reportes` y la entrada
«Reportes» va entre «Planilla» y «Proyectos»: después de las pantallas donde se
cargan horas y antes de la de administración. Se dibuja para todos:
`report.view` es de los cinco roles, y una membresía inactiva ve el aviso de
D-R2a-2. El título visible es «Reporte resumido»: el detallado y el semanal de
la fase 3 serán otras vistas bajo «Reportes». `error.tsx` muestra «No se pudo
cargar el reporte.» con «Reintentar» (RP-35), como `planilla`. **Sin caché
compartida**: la página lee la sesión, así que es dinámica; el módulo no usa
`"use cache"`, `unstable_cache` ni `revalidate`, y `cache()` de React solo
dentro del pedido, como `currentSession`.

**D-R2a-11 — Los e2e del reporte.** La regla del mapa, con los helpers
concretos (§8.3), y la lista de lo que no se prueba en e2e (§8.4).

**D-R2a-12 — El test de tipos.** Que una lectura sin `ReportScope` no compile se
afirma con un archivo `report/scope.test-d.ts` que `npm run typecheck` revisa
(`tsconfig.json:25-32` incluye todo `.ts`) y vitest no corre
(`vitest.config.ts:8` incluye solo `*.test.ts` y `*.test.tsx`). Lleva
`// @ts-expect-error` con su motivo, que `@typescript-eslint/ban-ts-comment`
admite con descripción (`eslint.config.mjs:15`). No silencia al compilador: la
directiva falla si el compilador deja de dar el error.

## 0. Precondición de arranque

- **`main` en `b4aaff2`**, con R1 y el 13 mergeados. Las citas de abajo son de
  ese árbol. El 13b está en revisión en otra rama y toca componentes de la
  planilla; si entra antes del arranque de R2a, una ronda corta de
  `architecture-reviewer` contra el árbol, con atención a
  `time-entry/components/calendar/period-picker.tsx` y `date-field.tsx`, que este
  contrato toca (§1).
- **La versión mayor de Postgres de Neon**, que da el usuario (§10), antes de
  la medición de §6. Los tests de integración y CI usan `postgres:17-alpine`.
- **Para desplegar, no para mergear**: la consulta de verificación de R1 en
  producción (§2.3 de su contrato) dio las dos claves validadas. R2a lee el
  estado de la persona con un `join` interno.

### Supuestos sobre el árbol, con archivo y línea en `b4aaff2`

| Supuesto                                                                                                                                                                                      | Dónde                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| La unión `Action` sale de `ResourceByAction`; `resourceKinds` y `allowedRoles` tienen una fila por acción; `everyone` son los cinco roles                                                     | `src/server/permissions/index.ts:54-79`, `:87-105`, `:107-133`                                          |
| `can` niega una membresía no activa, un recurso de otro workspace y un `kind` que la acción no admite, en ese orden                                                                           | `permissions/index.ts:173-182`                                                                          |
| `WorkspaceResource` es `{ kind: "workspace", workspaceId }`; `project/service.ts` lo arma con una función privada                                                                             | `permissions/index.ts:14-17`; `src/modules/project/service.ts:52-54`                                    |
| Los tests de `can` arman el actor y el recurso de workspace con literales                                                                                                                     | `src/server/permissions/permissions.test.ts:14-18`                                                      |
| `requireSession()` devuelve `actor`, `membership` y las preferencias; `currentSession` es `cache()` de React, una lectura por pedido                                                          | `src/server/session.ts:34-64`                                                                           |
| `timeSettingsOf(context)` da zona, primer día de la semana (de `weekStartOf`) y formatos                                                                                                      | `src/modules/profile/service.ts:134-143`; `src/modules/workspace/service.ts:18-20`                      |
| `displayNameOf(stored: StoredProfile, accountName)` lee solo `displayName`; lo usan `session.ts` y un test de `profile`                                                                       | `profile/service.ts:97-101`, `:112-115`; `session.ts:50`; `profile/service.integration.test.ts:594-597` |
| `weekBounds`, `formatDuration` (minutos a `h:mm`), `dayKey`, `durationSeconds` (milisegundos, `floor`), `parseDayKey` (solo años de cuatro cifras), `addDaysToKey`, `formatDayKey`            | `src/server/time/index.ts:42-52`, `:61-66`, `:82-84`, `:123-125`, `:166-184`, `:192-203`, `:222-241`    |
| `weekStartKey`, `startOfDayKey` (un día que falta entero empieza en el siguiente), `weekKeyLabel`                                                                                             | `time/index.ts:350-357`, `:368-381`, `:395-417`                                                         |
| No hay función que cuente días entre dos claves ni que rotule un rango que no sea una semana                                                                                                  | `time/index.ts` (las exportadas, `:6-735`)                                                              |
| `time_entry.user_id` → `user` en `restrict` y la clave compuesta `time_entry_membership_fk` (R1): toda entrada tiene membresía en su workspace                                                | `src/server/db/schema.ts:411-413`, `:477-481`                                                           |
| `time_entry` tiene `billable` no nulo, el índice `(workspace_id, user_id, started_at desc)`, `ended_at >= started_at` y el proyecto en `set null`                                             | `schema.ts:424`, `:436-440`, `:442-445`, `:450-454`                                                     |
| `membership` es única por `(workspace_id, user_id)` y su `status` es `active`, `inactive` o `invited`                                                                                         | `schema.ts:33-37`, `:97-123`                                                                            |
| `user_preference.display_name` nulable; `user.name` no nulo                                                                                                                                   | `schema.ts:145`; `src/server/db/auth-schema.ts:4-15`                                                    |
| `project.color` se restringe a la paleta con un `check`; `project.client_id` apunta a `client (workspace_id, id)`; archivados por `archived_at`                                               | `schema.ts:252-309`                                                                                     |
| `who_sees_all_entries` arranca en `admins`, con el comentario de R1                                                                                                                           | `schema.ts:67-72`                                                                                       |
| La última migración es la 0014                                                                                                                                                                | `drizzle/meta/_journal.json:100-107`                                                                    |
| `inSpan` de `time-entry` filtra cerradas por persona e inicio en `[from, to)`; `listTimesheetEntries` lee la semana de la planilla en una sentencia                                           | `src/modules/time-entry/repository.ts:154-162`, `:495-514`                                              |
| `getTimesheetState` corta la semana con `startOfDayKey` y suma `durationSeconds` por entrada (`closedSecondsOf`); `TrackerWorkspace` es `TimeSettings`                                        | `time-entry/service.ts:127`, `:2374-2381`, `:2467-2509`                                                 |
| Producción habla con Neon por `neon-serverless`; local y tests, por `node-postgres`                                                                                                           | `src/server/db/index.ts:16-22`                                                                          |
| Drizzle recibe `timestamptz` como texto y lo convierte con `new Date(texto)`                                                                                                                  | `node_modules/drizzle-orm/node-postgres/session.js:26-29`; `pg-core/columns/timestamp.js:30-33`         |
| La integración migra con `node-postgres` contra `postgres:17-alpine`; CI usa la misma imagen                                                                                                  | `src/test/global-setup.ts:11-26`; `.github/workflows/ci.yml:43-44`                                      |
| `seedMember(workspaceId, role)` no recibe estado; `seedTimeEntry` convierte los instantes con `new Date` (pierde los microsegundos); `seedPreferences` escribe `display_name`                 | `src/test/factories.ts:60-64`, `:107-123`, `:75-81`                                                     |
| `actorIn` y `workspaceOf` arman el actor y la configuración de tiempo de un test                                                                                                              | `src/test/time-entry.ts:20-34`                                                                          |
| `compareNames` desempata por id; `isPaletteKey` y `ProjectRef`                                                                                                                                | `src/lib/text.ts:27-39`; `src/modules/project/palette.ts:24`; `project/schema.ts:129-133`               |
| La navegación es una lista literal con «Inicio», «Calendario», «Planilla» y «Proyectos»; un e2e afirma un subconjunto en orden                                                                | `src/components/layout/app-nav.tsx:9-14`; `e2e/calendar.spec.ts:171-173`                                |
| La planilla compone `requireSession`, `safeParse` de la URL y `Suspense`; su `error.tsx` usa `ActionFeedback` con `retry`                                                                     | `src/app/(app)/planilla/page.tsx:11-25`; `planilla/error.tsx:10-17`                                     |
| `next.config.ts` no activa `cacheComponents` ni ninguna caché de páginas                                                                                                                      | `next.config.ts:33-37`                                                                                  |
| `PeriodPicker` abre un `Calendar` de un día en un `Popover` y navega con `router.push`; `civilDate` vive en `time-entry/components` y lo importan solo `period-picker.tsx` y `date-field.tsx` | `time-entry/components/calendar/period-picker.tsx:31-77`; `time-entry/components/civil-date.ts:9-21`    |
| Cada e2e entra con una persona propia (email único) y todas se llaman `PERSON_NAME`; el workspace es el más viejo (`FIRST_WORKSPACE`), del owner `owner@<dominio>`                            | `e2e/session.ts:7-8`, `:63-71`; `e2e/database.ts:14`; `e2e/workspace.setup.ts:19`                       |
| `seedEntries` exige un proyecto por nombre y la membresía de la persona; `updateOne` exige exactamente una fila                                                                               | `e2e/database.ts:299-359`, `:109-116`                                                                   |
| `@typescript-eslint/ban-ts-comment` en `error`; `tsc` incluye todo `.ts`; vitest de unidad incluye solo `*.test.ts(x)`                                                                        | `eslint.config.mjs:15`; `tsconfig.json:25-32`; `vitest.config.ts:8`                                     |

## 1. Alcance

Entra:

- **Permisos**: `report.view` y `timeEntry.others.view` (§3).
- **El módulo `report`**: esquemas, service, repository y componentes (§4, §5).
- **La pantalla `/reportes`**: rango con «Esta semana», flechas y rango libre;
  agrupación por persona o por proyecto; total y total facturable; alcance y
  zona dichos en la pantalla; vacío; error de lectura; aviso de membresía
  inactiva; entrada en la navegación.
- **`src/server/time`**: `daysBetweenKeys` y `dayRangeLabel` (§4.2).
- **La medición de volumen** y, si la justifica, el índice parcial (§6).
- **La regla de los e2e del reporte** con sus helpers (§8.3).

Queda afuera:

- Los demás atajos, la fecha como agrupación y los cortes por tramo: R2b.
- Subgrupos, tarea y etiqueta: R3. Filtros: R4. Gráfico: R5. Exportación: R6 y
  R7. Cambiar el rol: R8. Personas sin horas: R9.
- RP-14 (del resumido al detallado), RP-36 (redondeo) y RP-09 (importes).
- El importe y el porcentaje por grupo.

### Consecuencias sobre código ya entregado

| Archivo                                                         | Qué cambia                                                                                  | Qué hay que volver a probar                                                              |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `src/server/permissions/index.ts`                               | Dos acciones en las tres tablas. Ninguna fila existente cambia.                             | `permissions.test.ts` entero                                                             |
| `src/server/time/index.ts`                                      | Suma `daysBetweenKeys` y `dayRangeLabel`. No cambia ninguna función existente.              | `time.test.ts` entero                                                                    |
| `src/modules/profile/service.ts`                                | `displayNameOf` recibe `Pick<StoredProfile, "displayName">`. El cuerpo no cambia.           | `profile/service.integration.test.ts`; `session.ts` compila                              |
| `src/components/layout/app-nav.tsx`                             | Suma «Reportes» entre «Planilla» y «Proyectos».                                             | `e2e/calendar.spec.ts:171-173` (subconjunto en orden: no cambia)                         |
| `time-entry/components/civil-date.ts` → `src/lib/civil-date.ts` | Se mueve sin cambios; `period-picker.tsx` y `date-field.tsx` cambian el import.             | `calendar.spec.ts`, `timesheet.spec.ts` (el selector de período), `manual-entry.spec.ts` |
| `src/test/factories.ts`                                         | `seedMember` acepta un `status` opcional, `active` por omisión.                             | —                                                                                        |
| `e2e/database.ts`                                               | Cuatro helpers nuevos; `SeedEntry.project` opcional, sin cambiar a quien ya lo pasa (§8.3). | Los specs que usan `seedEntries`                                                         |
| `src/server/db/schema.ts`, `drizzle/`                           | Solo si §6 lo justifica: el índice parcial y la migración 0015.                             | La suite de integración entera (migra desde cero)                                        |

`civil-date.ts` se mueve porque `report` no importa de `time-entry` (ADR 0021:
`report` importa de `profile`, `workspace` y `project`), y es una utilidad pura
que comparten servidor y navegador, lo que `src/lib` declara. **Ninguna
afirmación de un test existente cambia.**

## 2. Esquema e índices

**Ninguna tabla cambia.** El índice parcial del ADR 0021 entra solo si la
medición de §6 lo justifica, con esta definición en `timeEntry`:

```ts
// ADR 0021: el reporte de todas las personas en un rango. La medición de R2a
// está en `correcciones-nucleo-reportes-r2a-revisiones.md`.
index("time_entry_workspace_started_closed_idx")
  .on(table.workspaceId, table.startedAt)
  .where(sql`${table.endedAt} is not null`),
```

y `npm run db:generate -- --name=time_entry_report_idx`, que tiene que generar
exactamente el `CREATE INDEX` (la 0015). El predicado es literalmente el de la
consulta (`isNotNull(timeEntry.endedAt)`), que es lo que deja al planificador
usar un índice parcial. La migración corre en una transacción y bloquea las
escrituras de `time_entry` mientras construye el índice: con el volumen de hoy
son milisegundos; el usuario la despliega fuera del horario de uso, como R1.

Si el índice no entra, `schema.ts` y `drizzle/` no se tocan, y la medición
queda registrada igual, con el plan que se eligió sin él.

## 3. Permisos

Dos acciones nuevas, las dos sobre `WorkspaceResource` (ADR 0020):

| Acción                  | `resourceKinds` | `allowedRoles`       | Quién la consulta                                       |
| ----------------------- | --------------- | -------------------- | ------------------------------------------------------- |
| `report.view`           | `["workspace"]` | `everyone`           | `getReportState`, antes de cualquier lectura            |
| `timeEntry.others.view` | `["workspace"]` | `["owner", "admin"]` | `scopeOf`, una vez por pedido, después de `report.view` |

- En `ResourceByAction`, junto a las de `timeEntry.own.*`, con un comentario:
  «ADR 0020. `who_sees_all_entries` no entra: si la fase 2 la vuelve editable,
  `timeEntry.others.view` declara un recurso propio (ADR 0009).»
- **RP-07 viene de `can()`**: corta por estado antes que por rol.
- El comentario de `can()` sobre las acciones `.own` (`:186-187`) sigue siendo
  cierto y no cambia.
- **Ninguna decisión de acceso fuera de `can()`**: el service no compara roles.

## 4. Contrato de lectura

### 4.1 Los tipos (`report/schema.ts`, nuevo)

```ts
/** RP-21, ADR 0021: el período más largo, en días, con los dos extremos. */
export const REPORT_MAX_DAYS = 366;

export const reportMessages = {
  /** RP-34. Con el calendario de rango la interfaz no lo produce (D-R2a-4). */
  endBeforeStart: "La fecha de fin no puede ser anterior a la de inicio.",
  /** RP-34, ADR 0021. */
  rangeTooLong: `Elegí un período de hasta ${REPORT_MAX_DAYS} días.`,
  invalidDate: "Fecha inválida.",
} as const;

export type ReportRange = { readonly first: string; readonly last: string };

/**
 * El período con los dos extremos incluidos. Una sola validación para la URL y
 * para el selector (D-R2a-4), en este orden: las claves existen, el día
 * siguiente al último tiene clave, el fin no es anterior al inicio, el largo.
 * El largo se cuenta con `daysBetweenKeys`, no comparando claves de años
 * distintos.
 */
export const reportRangeInput; // { first, last } → ReportRange

/** `?desde=…&hasta=…` con `safeParse`: lo inválido o repetido se descarta (RP-32). */
export const reportRangeParams; // { desde, hasta } → reportRangeInput

export const REPORT_GROUP_BYS = ["person", "project"] as const;
export type ReportGroupBy = (typeof REPORT_GROUP_BYS)[number];

/** `?agrupar=persona|proyecto` con `safeParse`; cualquier otro valor se descarta. */
export const reportGroupParams; // → ReportGroupBy

const reportRangeView = z.object({ first: z.string(), last: z.string() });

const reportPersonGroup = z.object({
  kind: z.literal("person"),
  userId: z.string(),
  /** `displayNameOf`: el editado o el de la cuenta. */
  name: z.string(),
  /** RP-31, RP-61: sus horas cuentan y la fila lo dice. */
  inactive: z.boolean(),
  seconds: z.number().int().min(0),
});

const reportProjectGroup = z.object({
  kind: z.literal("project"),
  /** `null` es «Sin proyecto» (RP-28). Archivado o no (RP-29). */
  project: z
    .object({ id: z.uuid(), name: z.string(), color: z.enum(PALETTE_KEYS) })
    .nullable(),
  /** En gris; `null` sin cliente o sin proyecto. */
  client: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  seconds: z.number().int().min(0),
});

export const reportReadyState = z.object({
  kind: z.literal("ready"),
  todayKey: z.string(),
  range: reportRangeView,
  /** «Esta semana», «Semana anterior», «05/10 – 18/10» (D-R2a-4). */
  rangeLabel: z.string(),
  /** `null` si el destino no tendría clave de cuatro cifras. */
  previous: reportRangeView.nullable(),
  next: reportRangeView.nullable(),
  /** El destino del enlace «Esta semana». */
  currentWeek: reportRangeView,
  groupBy: z.enum(REPORT_GROUP_BYS),
  /** Lo que dice la línea del alcance (D-R2a-2). */
  scope: z.enum(["everyone", "self"]),
  /** La zona con que se cortaron los días, tal como está en el perfil (D-R2a-5). */
  timeZone: z.string(),
  /** Exactos: la suma de los grupos (D-R2a-7). */
  totalSeconds: z.number().int().min(0),
  billableSeconds: z.number().int().min(0),
  /** En el orden de D-R2a-3. */
  groups: z.array(z.discriminatedUnion("kind", [reportPersonGroup, reportProjectGroup])),
});

export type ReportState =
  | z.infer<typeof reportReadyState>
  /** RP-07: sin `report.view`. No se leyó nada. */
  | { readonly kind: "forbidden" };
```

- **La URL usa `persona` y `proyecto`; el código, `person` y `project`**, como
  `vista=dia` del calendario.
- `z.object` descarta las claves que no declara: un `personas=…` armado a mano no
  llega a ningún lado (criterio 5).

### 4.2 Lo que suma `src/server/time`

```ts
/**
 * Días civiles de `first` a `last`: 0 si son el mismo, negativo si `last` es
 * anterior. Aritmética en UTC, sin zona. Lanza si alguna clave no es un día.
 */
export function daysBetweenKeys(first: string, last: string): number;

/**
 * El rótulo de un período que no es una semana: «05/10 – 18/10», o «05/10» si
 * es un día. Si alguno de los extremos no es del año de `todayKey`, los dos
 * llevan el año: «29/12/2025 – 04/01/2026».
 */
export function dayRangeLabel(
  first: string,
  last: string,
  todayKey: string,
  format: DateFormat,
): string;
```

`dayRangeLabel` usa `formatDayKey`; el guion es el mismo `–` de `weekKeyLabel`.

### 4.3 Repository (`report/repository.ts`, nuevo)

```ts
/** El intervalo de instantes que lee el reporte: `[from, to)`. */
export type ReportSpan = { readonly from: Date; readonly to: Date };

export type PersonTotalRow = {
  readonly userId: string;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
  readonly status: MembershipStatus;
  readonly seconds: number;
  readonly billableSeconds: number;
};

export type ProjectTotalRow = {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly color: string;
  } | null;
  readonly client: { readonly id: string; readonly name: string } | null;
  readonly seconds: number;
  readonly billableSeconds: number;
};

export const reportRepository = {
  /** Una fila por persona con horas cerradas en `span`, dentro de `scope`. Una sentencia. */
  totalsByPerson(scope: ReportScope, span: ReportSpan): Promise<readonly PersonTotalRow[]>;
  /** Una fila por proyecto, y una sin proyecto, con horas cerradas en `span`. Una sentencia. */
  totalsByProject(scope: ReportScope, span: ReportSpan): Promise<readonly ProjectTotalRow[]>;
};
```

- **`inScope(scope)`**, privada: `workspace_id = scope.workspaceId` y, con
  `self`, también `user_id = scope.people.userId`. Es la única traducción del
  alcance; ninguna consulta arma su propio filtro de personas.
- **`closedIn(span)`**, privada: `ended_at is not null`, `started_at >= from`,
  `started_at < to`. Es la copia de la regla de `inSpan` que el ADR 0021 admite.
- **`entrySeconds`**, privada: la expresión de D-R2a-6.
- **Cada función es una sentencia**: la agregación sobre `time_entry` en una
  subconsulta o CTE, y los `join` de D-R2a-8 afuera. Sin orden: lo pone el
  service.
- **Los números** salen de la base como texto y se convierten con una función
  privada que lanza si el valor no es un entero seguro no negativo.
- El orden de los parámetros es `(scope, span)`, el alcance primero, en toda
  función que se sume después (R2b a R6).

### 4.4 Service (`report/service.ts`, nuevo)

```ts
/** El alcance de las lecturas (D-R2a-1). Solo `scopeOf` lo construye. */
export type ReportScope = Scope;

export type ReportRequest = {
  /** El rango de la URL ya validado, o `null`: «Esta semana». */
  readonly range: ReportRange | null;
  /** La agrupación de la URL ya validada, o `null`: por persona. */
  readonly groupBy: ReportGroupBy | null;
};

/**
 * RP-10: el resumido de quien mira, armado en el servidor con su zona y su
 * primer día de la semana. `now` existe para que los tests fijen el día.
 */
export async function getReportState(
  actor: Actor,
  settings: TimeSettings,
  request: ReportRequest,
  now: Date = new Date(),
): Promise<ReportState>;
```

En este orden:

1. **`can(actor, "report.view", workspaceResource(actor))`**; si no,
   `{ kind: "forbidden" }`, sin ninguna lectura.
2. **`scopeOf(actor)`** (D-R2a-1).
3. **El período**: `todayKey = dayKey(now, zona)`; `currentWeek` desde
   `weekStartKey(todayKey, primer día)`, siete días; `range = request.range ??
currentWeek`. `span = [startOfDayKey(first), startOfDayKey(last + 1))`.
4. **Una lectura**: `totalsByPerson` o `totalsByProject` según `groupBy ??
"person"`.
5. **Los grupos**: por persona, `name = displayNameOf({ displayName },
accountName)` e `inactive = status !== "active"`; por proyecto, el color
   estrechado. Orden de D-R2a-3.
6. **Los totales**: `totalSeconds` y `billableSeconds`, sumas de las filas
   (D-R2a-7).
7. **La navegación**: `n = daysBetweenKeys(first, last) + 1`; `previous` y
   `next` a `n` días, o `null` (D-R2a-4); `rangeLabel` de D-R2a-4.

- **El service no valida el rango de nuevo**: la página, y en R6 la ruta de
  exportación, lo reciben de `reportRangeParams`. Un rango inválido que llegue
  por un error de programación sale como excepción sin traducir (`error.tsx`).
- **R2a no tiene error de dominio propio**: ni mutaciones ni actions. El
  `ReportError` llega con el primer slice que lo necesite.
- `workspaceResource(actor)` es una función privada del service, como la de
  `project`.

### 4.5 Costo

Una sentencia por carga de la página, y ninguna con membresía inactiva. La
agregación toca las cerradas del rango; los `join` tocan una fila por grupo.

## 5. Pantalla

### 5.1 La ruta, la página y el error

- **`src/app/(app)/reportes/page.tsx`**: `requireSession()`;
  `reportRangeParams.safeParse` y `reportGroupParams.safeParse` sobre
  `await searchParams`, cada uno por su lado (D-R2a-4); `<Suspense
fallback={<ReportSkeleton />}>` con `<ReportScreen actor settings request />`,
  donde `settings = timeSettingsOf(session)`.
- **`src/app/(app)/reportes/error.tsx`**: el título y `ActionFeedback` con
  «No se pudo cargar el reporte.» y «Reintentar» (RP-35), como el de la planilla.
- **`ReportScreen`** (Server Component, `report/components/report-screen.tsx`):
  `getReportState`; el `h1` «Reporte resumido»; con `forbidden`, el aviso y nada
  más; si no, la barra (§5.2), las dos líneas de alcance y zona, los totales y
  `ReportView`.
- **La navegación**: «Reportes» con `href: "/reportes"` entre «Planilla» y
  «Proyectos», como literal, igual que las demás entradas.
- **`reportHref({ range, groupBy })`** (`report/components/report-href.ts`) es
  la única función que arma `/reportes?desde=…&hasta=…&agrupar=…`, siempre con
  los tres.

### 5.2 La barra

En este orden:

- **«Período anterior»** y **«Período siguiente»**: enlaces con ícono a
  `reportHref` de `previous` y `next`, con esos nombres accesibles; el que es
  `null` no se dibuja.
- **El período**: `RangePicker` (cliente, `report/components/range-picker.tsx`).
  Botón con el ícono y `rangeLabel`, nombre accesible «Elegir período:
  {rangeLabel}». Abre un `Popover` con `Calendar mode="range"`, `locale` `es`,
  `today` en la zona de quien mira (`civilDate(todayKey)`), el rango actual
  elegido y su mes a la vista, y los rótulos de mes anterior y siguiente propios
  del módulo. Debajo, «Aplicar» y una región `role="alert"` siempre montada.
  «Aplicar» valida con `reportRangeInput` (un solo día si falta el fin): con
  error, el mensaje en la región y el popover sigue abierto; sin error, cierra y
  `router.push(reportHref({ range, groupBy }))`. Sin día elegido, «Aplicar»
  lleva `aria-disabled` y no hace nada. Esc cierra sin navegar; al cerrar, el
  foco vuelve al botón.
- **«Esta semana»**: enlace a `reportHref({ range: currentWeek, groupBy })`,
  solo si `range` no es `currentWeek`.
- **«Agrupar por»**: un grupo (`role="group"`, nombrado por su rótulo visible)
  con dos enlaces, «Persona» y «Proyecto», a `reportHref` con el mismo rango; el
  elegido lleva `aria-current="true"`.

### 5.3 Las líneas, los totales y la tabla

- **Alcance** (D-R2a-2): «Ves solo tus horas.» o «Ves las horas de todas las
  personas del workspace.».
- **Zona** (D-R2a-5): «Los días se cortan en tu zona horaria: {timeZone}.».
- **Totales** (RP-18): una lista de definiciones con «Total» y «Facturable»,
  cada uno con `formatDuration(Math.floor(segundos / 60))` (RP-19).
- **`ReportView`** (`report/components/report-view.tsx`, sin hooks): una
  `<table>` nombrada por el `h1`; encabezados «Persona» o «Proyecto» y
  «Duración», con `scope="col"`. Cada fila: el encabezado de fila
  (`scope="row"`) y la duración con el mismo formato.
  - **Persona**: el nombre; inactiva, seguido de «(inactiva)» en gris (RP-31).
  - **Proyecto**: el punto del color, el nombre y el cliente en gris, como la
    planilla; «Sin proyecto» en gris, sin punto ni cliente.
  - **Sin grupos** (RP-33): una fila que ocupa las dos columnas con «No hay
    horas en este período»; los totales siguen, en `0:00`.
- **La carga**: `ReportSkeleton` con `role="status"`, `aria-busy` y «Cargando el
  reporte».
- **La duración de cada fila se trunca al minuto por separado**: la suma de lo
  que muestran las filas puede quedar hasta un minuto por fila debajo del total,
  que también se trunca una vez. Es la misma regla que la planilla (§9).

### 5.4 Textos (`report/components/labels.ts`, nuevo)

| Clave            | Texto                                                        |
| ---------------- | ------------------------------------------------------------ |
| `heading`        | «Reporte resumido»                                           |
| `loading`        | «Cargando el reporte»                                        |
| `loadFailed`     | «No se pudo cargar el reporte.»                              |
| `forbiddenTitle` | «Tu acceso al workspace está desactivado.»                   |
| `forbiddenBody`  | «No podés ver reportes.»                                     |
| `previousPeriod` | «Período anterior»                                           |
| `nextPeriod`     | «Período siguiente»                                          |
| `thisWeek`       | «Esta semana»                                                |
| `pickRange`      | `(período) =>` «Elegir período: {período}»                   |
| `previousMonth`  | «Mes anterior»                                               |
| `nextMonth`      | «Mes siguiente»                                              |
| `apply`          | «Aplicar»                                                    |
| `groupBy`        | «Agrupar por»                                                |
| `byPerson`       | «Persona»                                                    |
| `byProject`      | «Proyecto»                                                   |
| `duration`       | «Duración»                                                   |
| `total`          | «Total»                                                      |
| `billable`       | «Facturable»                                                 |
| `scopeSelf`      | «Ves solo tus horas.»                                        |
| `scopeEveryone`  | «Ves las horas de todas las personas del workspace.»         |
| `zone`           | `(zona) =>` «Los días se cortan en tu zona horaria: {zona}.» |
| `inactivePerson` | «(inactiva)»                                                 |
| `empty`          | «No hay horas en este período»                               |

«Sin proyecto» es `projectLabels.noProject`.

## 6. Volumen, presupuesto e índice

Lo hace `backend-dev` con el repository terminado y antes de dar el índice por
decidido. Es el riesgo principal del slice (mapa §3).

### 6.1 El volumen

`scripts/report-volume/seed.sql` (nuevo), determinista (`setseed` al principio),
sobre una base vacía migrada hasta la 0014:

- un workspace con su configuración; 30 personas con membresía (el owner, 27
  activas y 2 inactivas), con nombre de cuenta y la mitad con `display_name`;
- 6 clientes y 24 proyectos (16 con cliente, 4 archivados), con tareas en la
  mitad;
- **tres años de días hábiles** que terminan ayer, lunes a viernes; **8 entradas
  por persona y por día**, entre las 08:00 y las 19:00 de Buenos Aires, de 30 a
  75 minutos, sin superponerse; 10 % sin proyecto, 40 % facturables; unas
  188 000 filas;
- un timer abierto para cinco personas;
- `analyze` al final.

Las etiquetas no se siembran: llegan con R3, que extiende el script.

### 6.2 Las consultas medidas

Las sentencias que emite el repository (`.toSQL()`), con sus parámetros, en
`scripts/report-volume/explain.sql` (nuevo):

| Consulta | Qué                                                                       | Presupuesto (mediana) |
| -------- | ------------------------------------------------------------------------- | --------------------- |
| Q1       | `totalsByPerson`, `everyone`, la semana actual (la página sin parámetros) | ≤ 15 ms               |
| Q2       | `totalsByProject`, `everyone`, los 366 días del año pasado                | ≤ 150 ms              |
| Q3       | `totalsByPerson`, `self`, los mismos 366 días                             | ≤ 30 ms               |
| Q4       | la sentencia de `listTimesheetEntries` de una persona y una semana        | el plan no cambia     |

Cada una, una corrida de calentamiento y cinco `explain (analyze, buffers)`; se
toma la mediana del `Execution Time`. **En `postgres:<versión mayor de Neon>`**
(§10), en una base propia que se borra al terminar. Se mide **sin el índice y
con él**, creado a mano con la definición de §2.

### 6.3 Cuándo entra el índice

- **Entra** si el planificador lo usa en Q1 o en Q2 y la mediana de esa consulta
  baja al menos a la mitad, o si sin él Q1 o Q2 pasan el presupuesto y con él no.
- **No entra** si ninguna consulta lo usa, o si lo usa sin esa mejora: ADR 0021,
  «lo retira si el plan no lo usa».
- **Q4 no cambia de plan** con el índice: sigue en
  `time_entry_workspace_user_started_idx`. Si cambia, el índice no entra sin una
  ronda con `architect`.
- **Si con el índice alguna consulta pasa su presupuesto, el slice se detiene**
  y vuelve a `architect`: el tope de 366 días se revisa con mediciones (ADR 0021) y no se resuelve en la implementación.

El informe de `backend-dev` lleva, por consulta y con y sin índice, el plan
(los nodos y el índice que usa) y las cinco medidas. El team-lead lo copia al
documento de revisiones; los scripts quedan en el árbol para que R2b, R3 y R6
vuelvan a medir con el mismo volumen.

**La medición es local.** Neon agrega la ida y vuelta de red y un cómputo más
chico; el presupuesto local deja margen para eso, pero no lo mide (§9).

## 7. Reparto de archivos

Rutas absolutas; **(nuevo)** marca lo que el slice crea.

### backend-dev

```
/home/maxi/program/clock/src/server/permissions/index.ts
/home/maxi/program/clock/src/server/permissions/permissions.test.ts
/home/maxi/program/clock/src/server/time/index.ts
/home/maxi/program/clock/src/server/time/time.test.ts
/home/maxi/program/clock/src/modules/profile/service.ts                       (solo la firma de displayNameOf)
/home/maxi/program/clock/src/modules/report/schema.ts                         (nuevo)
/home/maxi/program/clock/src/modules/report/schema.test.ts                    (nuevo)
/home/maxi/program/clock/src/modules/report/repository.ts                     (nuevo)
/home/maxi/program/clock/src/modules/report/service.ts                        (nuevo)
/home/maxi/program/clock/src/modules/report/service.integration.test.ts       (nuevo)
/home/maxi/program/clock/src/modules/report/scope.test-d.ts                   (nuevo)
/home/maxi/program/clock/src/test/factories.ts                                (solo el estado de seedMember)
/home/maxi/program/clock/scripts/report-volume/seed.sql                       (nuevo)
/home/maxi/program/clock/scripts/report-volume/explain.sql                    (nuevo)
/home/maxi/program/clock/src/server/db/schema.ts                              (solo si §6.3)
/home/maxi/program/clock/drizzle/0015_time_entry_report_idx.sql               (nuevo, solo si §6.3)
/home/maxi/program/clock/drizzle/meta/0015_snapshot.json                      (nuevo, solo si §6.3)
/home/maxi/program/clock/drizzle/meta/_journal.json                           (solo si §6.3)
```

### frontend-dev

```
/home/maxi/program/clock/src/app/(app)/reportes/page.tsx                      (nuevo)
/home/maxi/program/clock/src/app/(app)/reportes/error.tsx                     (nuevo)
/home/maxi/program/clock/src/components/layout/app-nav.tsx
/home/maxi/program/clock/src/lib/civil-date.ts                                (movido)
/home/maxi/program/clock/src/modules/time-entry/components/civil-date.ts      (se borra)
/home/maxi/program/clock/src/modules/time-entry/components/calendar/period-picker.tsx (solo el import)
/home/maxi/program/clock/src/modules/time-entry/components/date-field.tsx     (solo el import)
/home/maxi/program/clock/src/modules/report/components/                       (nuevo)
    report-screen.tsx, report-toolbar.tsx, range-picker.tsx, report-view.tsx,
    report-href.ts, labels.ts,
    report-href.test.ts, range-picker.test.tsx, report-view.test.tsx
```

Los nombres dentro de `components/` son orientativos salvo `report-href.ts`,
`labels.ts`, `report-view.tsx` y `range-picker.tsx`, que citan los tests.

### test-engineer

```
/home/maxi/program/clock/src/modules/report/scope.integration.test.ts         (nuevo)
```

Escribe los tests del alcance (criterios 4, 5 y 11) sin mirar la implementación
de `scopeOf`, contra las firmas del paso 1, y corre la tabla de mutantes de §8.1
en una copia propia. Que los tests de acceso los escriba alguien que no escribió
el alcance es lo que pide la revisión de seguridad del ADR 0020 para la primera
pantalla con horas ajenas.

### e2e-tester

```
/home/maxi/program/clock/e2e/reports.spec.ts                                  (nuevo)
/home/maxi/program/clock/e2e/reports-page.ts                                  (nuevo)
/home/maxi/program/clock/e2e/database.ts                                      (los helpers de §8.3)
```

`reports-page.ts`: `goToReportsByNav`, `reportsUrl(range, groupBy)`, la tabla,
la fila de un grupo por su nombre y su duración, los totales, las líneas de
alcance y zona, las flechas, «Esta semana», el selector de período con
«Aplicar», los enlaces de agrupación y el aviso de membresía inactiva.

### parity-analyst

```
/home/maxi/program/clock/docs/parity/reportes.md
```

Antes del merge, una sección «Núcleo, R2a» y la corrección fechada de cada
regla que el slice precisa:

- **RP-11 y RP-12**: un nivel, persona o proyecto; por persona sin parámetro
  (D-R2a-3), _no verificado_ en Clockify (P-05); el orden con su desempate.
- **RP-18 y RP-19**: «Total» y «Facturable»; cada fila truncada al minuto.
- **RP-20 y RP-24**: los parámetros, el rango libre con calendario de rango y
  «Aplicar», las flechas por el largo del período, los rótulos.
- **RP-22**: la línea de la zona, sin desplazamiento.
- **RP-32 y RP-34**: la URL inválida se descarta entera; los mensajes son del
  selector; el primero no lo produce la interfaz; el tercero no se usa, por la
  decisión del usuario (mapa §5), y la línea del alcance lo reemplaza.
- **RP-07, RP-31 y RP-33**: los textos de §5.4.
- **RP-15, RP-20, RP-21, RP-34 y §6**: «pendiente de aprobación del ADR 0021»
  pasa a «aceptado el 2026-10-08».

### Lo que no toca nadie

`src/server/action.ts` (R2a no tiene mutaciones ni actions),
`src/server/audit.ts`, `src/server/session.ts`, `src/server/auth.ts`,
`src/modules/time-entry/` salvo los dos imports de `civil-date`,
`src/modules/project/`, `src/modules/workspace/`, los ADR. El mapa y el estado
los actualiza el team-lead.

### Orden

0. **El usuario da la versión mayor de Neon** (§10). No bloquea el paso 1.
1. **Primer commit de `backend-dev`**: las dos acciones con sus tests,
   `daysBetweenKeys` y `dayRangeLabel` con los suyos, `report/schema.ts` con
   `schema.test.ts`, y en `report/service.ts` los tipos públicos con
   `getReportState` sin cuerpo útil (lanza). **Avisa a `frontend-dev`,
   `test-engineer` y `e2e-tester`**: desde acá las formas son las finales.
2. **`frontend-dev` arranca en paralelo con el paso 1** por la navegación, el
   movimiento de `civil-date`, `labels.ts` y `report-href.ts`; con el paso 1 en
   la rama, la pantalla, contra estados armados a mano en sus tests.
3. **`e2e-tester` arranca con el paso 1**: los helpers y el spec, y confirma que
   falla por la funcionalidad y no por el arnés.
4. **`test-engineer` arranca con el paso 1**: `scope.integration.test.ts`, que
   falla hasta el paso 5.
5. **`backend-dev`**: repository, `getReportState`,
   `service.integration.test.ts` y `scope.test-d.ts`.
6. **`backend-dev`**: la medición de §6 y, si §6.3 lo pide, el índice y la 0015
   en un commit propio.
7. **`test-engineer`**: los mutantes de §8.1 en su copia; `parity-analyst`,
   antes del merge.

## 8. Criterios de aceptación

1. **Los permisos** — `report.view` es verdadero para los cinco roles activos;
   `timeEntry.others.view`, solo para `owner` y `admin`. Las dos son falsas con
   una membresía `inactive` o `invited` (también la del owner), con un
   `workspaceId` de otro workspace y con un recurso que no es `workspace`.
2. **Los esquemas** — `reportRangeInput` acepta un día suelto, una semana y 366
   días; rechaza 367 con `rangeTooLong`, el fin anterior al inicio con
   `endBeforeStart`, una clave que no existe y `hasta = 9999-12-31` con
   `invalidDate`; un rango de 367 días que termina en 9999-12-31 da
   `invalidDate` primero. `reportRangeParams` no pasa con un parámetro repetido
   ni con uno solo de los dos; `reportGroupParams` pasa con `persona` y
   `proyecto` y no con otro valor.
3. **`src/server/time`** — `daysBetweenKeys` con el mismo día, un año bisiesto,
   un cruce de año y el orden invertido, con el proceso en otra zona;
   `dayRangeLabel` con un día, un rango del año de hoy, uno que cruza el año y
   los cuatro formatos.
4. **El alcance, por rol** (D-R2a-2) — con entradas de tres personas en el
   workspace A (una inactiva) y de una de ellas en el workspace B, donde también
   es miembro: owner y admin de A ven las tres, con la inactiva marcada, en las
   dos agrupaciones, y nada de B; `project_manager` —responsable con
   `is_manager` de un proyecto donde las otras dos tienen horas—, `team_manager`
   y `member` ven solo lo propio en A, en las dos agrupaciones, y el total es el
   suyo; la persona de A con horas en B ve en A solo lo de A.
5. **El enlace ajeno** (RP-32) — el pedido que arma un admin (rango y
   agrupación) da a un member su propia fila y su total; la página ignora
   `personas=…` y cualquier otra clave (`reportRangeParams` y
   `reportGroupParams` no la dejan pasar).
6. **Qué cuenta** — solo cerradas: el timer abierto no está en ningún grupo ni
   total (RP-30); una entrada que empieza exactamente en `from` cuenta y una en
   `to` no; una que empieza el día anterior al rango y termina adentro no
   cuenta; una que empieza el último día y termina el siguiente cuenta entera
   (RP-23); un proyecto archivado y una tarea hecha cuentan (RP-29); una
   entrada sin proyecto va a «Sin proyecto» (RP-28); las horas de una persona
   inactiva cuentan (RP-61).
7. **La zona y la semana de quien mira** (RP-22, RP-24) — la misma entrada del
   lunes a las 01:00 UTC está en la semana actual de quien mira en Madrid y en
   la anterior de quien mira en Buenos Aires; con el primer día en domingo,
   «Esta semana» empieza el domingo; una semana que cruza el atraso de Madrid
   del 2026-10-25 cuenta la entrada de las 23:30 del domingo; en `Pacific/Apia`,
   `desde = hasta = 2011-12-30` da cero sin error.
8. **La medida** (ADR 0021) — para una persona y una semana, `totalSeconds` del
   reporte `self` y la fila de esa persona en el de un admin son iguales al
   `closedSeconds` de `getTimesheetState`, con entradas escritas con
   microsegundos por SQL (no por `seedTimeEntry`, que los pierde): una de
   `10:00:00.000900` a `10:00:01.000500`, una de `11:00:00.000500` a
   `11:00:01.000400` y dos de 1,5 s exactos. El test compara con la planilla, no
   con un número escrito; con los instantes truncados a milisegundos, las cuatro
   miden 1 s. `billableSeconds` suma solo las facturables.
9. **La agrupación y el orden** (D-R2a-3, D-R2a-8) — por persona, el nombre
   editado o, sin él, el de la cuenta; por proyecto, nombre, color y cliente, y
   «Sin proyecto» sin cliente; orden por duración descendente, con el empate por
   nombre y con «Sin proyecto» después de un proyecto de igual duración; la
   agrupación por omisión es por persona; los totales son la suma de los
   grupos.
10. **El período** (D-R2a-4) — sin rango, la semana de hoy de quien mira; con
    rango, ese; `rangeLabel` «Esta semana», «Semana anterior», un rango de
    semana lejana y un rango libre; `previous` y `next` a `n` días para una
    semana y para un rango de 10 días; `null` cuando el destino saldría de los
    años de cuatro cifras; `currentWeek`.
11. **Membresía no activa** (RP-07) — `inactive` e `invited` reciben
    `{ kind: "forbidden" }` y el repository no se llama (espía sobre
    `reportRepository`).
12. **El tipo** (D-R2a-1, D-R2a-12) — en `scope.test-d.ts`, un literal con
    `workspaceId` y `people` no es un `ReportScope`, y llamar a
    `totalsByPerson` o `totalsByProject` sin alcance no compila; `npm run
typecheck` lo revisa.
13. **La pantalla** — `report-view.test.tsx`: el vacío con los totales en
    `0:00`; las filas de persona con «(inactiva)» y de proyecto con cliente y
    «Sin proyecto»; las dos líneas; la tabla nombrada por el título.
    `range-picker.test.tsx`: un período de 367 días muestra «Elegí un período de
    hasta 366 días.» y no navega; un día solo navega con `desde = hasta`; Esc
    cierra sin navegar y devuelve el foco. `report-href.test.ts`: la URL con los
    tres parámetros.
14. **El rendimiento** (§6) — el informe trae las medidas y la decisión del
    índice con su regla; Q1 a Q3 dentro del presupuesto; Q4 sin cambio de plan.
    Si el índice entra, `npm run db:generate` después del último commit no
    genera nada.
15. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`, `next
build` y la suite e2e entera, sin cambiar ninguna afirmación.
16. **La pantalla de punta a punta** — los recorridos de §8.2.

### 8.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo        | Archivo                                                                | Mutante que tiene que caer                                                                                                                                                                                                |
| -------- | ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad      | `permissions.test.ts`                                                  | `timeEntry.others.view` con `everyone`; `report.view` solo para owner y admin; `resourceKinds` con `timeEntry`                                                                                                            |
| 2        | unidad      | `report/schema.test.ts`                                                | `REPORT_MAX_DAYS` como último día excluido (366 rechazado); sin la comprobación del día siguiente; el largo comparando claves de texto; el orden de los `refine` cambiado                                                 |
| 3        | unidad      | `time.test.ts`                                                         | `daysBetweenKeys` con la zona del proceso; `dayRangeLabel` con año solo en el extremo de otro año                                                                                                                         |
| 4        | integración | `report/scope.integration.test.ts`                                     | `scopeOf` siempre `everyone`; `everyone` por rol comparado en el service y no por `can()`; `self` sin `workspace_id` (aparece lo de B); `everyone` sin `workspace_id`; `project_manager` con `everyone` si es responsable |
| 5        | integración | `report/scope.integration.test.ts`                                     | un parámetro de personas que el esquema deja pasar y el service usa                                                                                                                                                       |
| 6        | integración | `report/service.integration.test.ts`                                   | sin `ended_at is not null`; `<=` en `to`; filtrar por `ended_at` en vez de `started_at`; `inner join` con `project` (pierde «Sin proyecto»); `archived_at is null`; `membership.status = 'active'`                        |
| 7        | integración | `report/service.integration.test.ts`                                   | el día cortado en UTC; la semana con el primer día fijo en lunes; los extremos con `dayBounds` del instante en vez de `startOfDayKey`                                                                                     |
| 8        | integración | `report/service.integration.test.ts`                                   | sin `date_trunc` (0 s en las dos primeras); `round` en vez de truncar milisegundos; `floor` del total en vez de por entrada (3 s en las dos de 1,5 s); `billable` sin `filter`                                            |
| 9        | integración | `report/service.integration.test.ts`                                   | el nombre de la cuenta antes que el editado; orden alfabético; «Sin proyecto» primero en el empate; agrupación por omisión por proyecto; el total con una segunda lectura que no suma «Sin proyecto»                      |
| 10       | integración | `report/service.integration.test.ts`                                   | las flechas a 7 días fijos; `rangeLabel` siempre `dayRangeLabel`; la flecha dibujada fuera de los años de cuatro cifras                                                                                                   |
| 11       | integración | `report/scope.integration.test.ts`                                     | `report.view` consultado después de leer; `invited` tratado como activo                                                                                                                                                   |
| 12       | tipos       | `report/scope.test-d.ts`                                               | exportar la clase `Scope`; sacar el miembro privado; un parámetro de alcance opcional                                                                                                                                     |
| 13       | componente  | `report-view.test.tsx`; `range-picker.test.tsx`; `report-href.test.ts` | validar en el selector sin `reportRangeInput` (navega con 367); `aria-disabled` sin efecto; «(inactiva)» ausente; la URL sin `agrupar`                                                                                    |
| 14       | manual      | informe de `backend-dev`                                               | —                                                                                                                                                                                                                         |
| 15       | todas       | las suites existentes                                                  | —                                                                                                                                                                                                                         |
| 16       | e2e         | `e2e/reports.spec.ts`                                                  | —                                                                                                                                                                                                                         |

**Mutante declarado equivalente:** quitar el `::bigint` de las sumas. `sum()`
de `bigint` es `numeric` y `node-postgres` entrega tanto `numeric` como `int8`
como texto, así que el repository recibe lo mismo. El cast queda porque lo fija
el ADR 0021. Antes de darlo por equivalente, `test-engineer` corre el criterio 8
y el 9 con el mutante —con una persona sin facturables (el `coalesce`), una
inactiva y un pedido de una membresía inactiva— y anota que las respuestas son
las mismas.

**Cualquier otro mutante declarado equivalente** se prueba antes igual:
respuesta y filas, con pedidos de una membresía inactiva, de otro workspace y
de un member con horas ajenas en el rango (lección del 11b).

### 8.2 Recorridos obligatorios de `e2e/reports.spec.ts`

Dueño: `e2e-tester`. Cada recorrido sigue la regla de §8.3. Las entradas van en
la semana anterior a la de hoy, en la zona del workspace, y se siembran antes de
abrir la pantalla.

1. **Entrar y el vacío** (RP-20, RP-22, RP-33). «Reportes» en la navegación
   lleva a `/reportes` y queda marcado; el título; «Elegir período: Esta
   semana»; «Ves solo tus horas.»; «Los días se cortan en tu zona horaria:
   America/Argentina/Buenos_Aires.»; «No hay horas en este período» y «Total»
   en `0:00`; «Persona» marcado en «Agrupar por».
2. **Un member ve lo propio aunque el enlace venga de otro** (RP-01, RP-10,
   RP-28, RP-32). La persona del test, member, con nombre propio, tiene dos
   entradas en P (con sufijo) y una sin proyecto; otra persona sembrada tiene
   horas en P. Con `reportsUrl(semana anterior, persona)` más `personas=x`: una
   sola fila, la suya, con su total, y el nombre de la otra no está; el total es
   el suyo. «Proyecto»: la fila de P con solo sus horas y «Sin proyecto» con la
   suya; la URL conserva el rango.
3. **Un admin ve a todo el equipo** (RP-02, RP-12, RP-31, RP-61). La persona del
   test pasa a `admin`; dos personas sembradas, B activa y C inactiva, con
   horas en P2 (con sufijo), B más que C. En la semana anterior, por persona: la
   fila de B antes que la de C, cada una con su total, y C con «(inactiva)»; «Ves
   las horas de todas las personas del workspace.». Por proyecto: la fila de P2
   con la suma de B y C. Ninguna afirmación sobre el total ni sobre «Sin
   proyecto».
4. **Navegar el período** (RP-20). Desde «Esta semana», «Período anterior»: la
   URL dice la semana anterior, el rótulo «Semana anterior», aparece «Esta
   semana» y vuelve. Con el selector, del lunes de la semana anterior al domingo
   de esta, «Aplicar»: la URL dice esos dos días, el rótulo es el rango, y
   «Período anterior» mueve 14 días. La agrupación elegida se conserva en los
   tres pasos.
5. **La URL inválida** (RP-32). `desde` después de `hasta`, un rango de 400
   días, un `desde` sin `hasta` y `agrupar=otro`: cada una muestra «Esta semana»
   por persona, sin aviso.
6. **Membresía inactiva** (RP-07). La persona del test pasa a `inactive`: el
   título y el aviso, sin tabla ni totales.

### 8.3 La regla de los e2e del reporte

La fija este contrato y la heredan R2b a R9 (mapa §3, «Lo que vale para
todos»):

- **Cada test tiene sus personas**: la de la sesión (el `email` del fixture,
  ya único) y las que siembra, todas con un `display_name` único que lleva el
  sufijo del test (`uniqueSuffix`).
- **Afirmaciones solo sobre las filas de esas personas, o de proyectos con el
  sufijo del test**. Nunca sobre el total del workspace, ni sobre «Sin
  proyecto» con alcance `everyone`. El total se afirma solo con alcance propio.
- **El rol y el estado los cambia la persona del test sobre sí misma**: nunca
  el owner del workspace ni la sesión de otro test.
- Helpers nuevos en `e2e/database.ts`, con `updateOne` o `insertOneRow` para que
  otra cantidad de filas corte el test:
  - `seedPerson({ email, displayName, status? })`: un `user` (id aleatorio,
    `PERSON_NAME`, `email_verified`), su membresía `member` en
    `FIRST_WORKSPACE` con el estado pedido (`active` por omisión) y su
    `user_preference` con el nombre, en una transacción;
  - `setDisplayName(email, name)`: el `display_name` de la persona de la sesión,
    con `insert … on conflict (user_id) do update`;
  - `setRole(email, role)` y `setMembershipStatus(email, status)`: su membresía
    en `FIRST_WORKSPACE`; cortan si la persona es el owner del workspace;
  - `SeedEntry.project` pasa a opcional: sin él, la entrada va sin proyecto. Con
    él, la sentencia de hoy, sin cambios.

### 8.4 Lo que no se prueba en e2e

- **El volumen y el rendimiento**: es la medición de §6.
- **El driver de Neon**: los e2e corren contra Postgres local; ver §9.
- **La igualdad con la planilla con microsegundos**: la interfaz no escribe
  microsegundos a voluntad; es el criterio 8.
- **Las zonas, los cambios de horario y el día que falta**: criterio 7. Cambiar
  la zona desde `/perfil` en un e2e solo repetiría lo que la integración ya
  fija.
- **El error de lectura** (RP-35): no hay forma de hacer fallar la lectura desde
  el navegador sin tocar el servidor; `error.tsx` es el patrón de la planilla.
- **Los roles `project_manager` y `team_manager`**: criterio 4; en e2e solo
  cambiaría el helper.
- **El total del workspace con alcance `everyone`**: no es reproducible (§8.3).
- **El mensaje de 366 días**: elegir 367 días en el calendario son trece meses
  de clics; es el criterio 13.

## 9. Deuda conocida del slice

- **Medición solo local**: Q1 a Q3 se miden en Docker con la versión mayor de
  Neon, no en Neon. Una comprobación en un preview —el total del reporte del
  owner y el de su planilla en una semana con entradas del timer, que tienen
  microsegundos— cubriría el driver `neon-serverless` y la red; necesita
  `E2E_DATABASE_URL` del preview (§10).
- **Cada fila se trunca al minuto por separado** (§5.3): con muchas filas, la
  suma visible puede quedar unos minutos debajo del total. Es la regla de la
  planilla; la exportación de R6 lleva los segundos o las horas decimales.
- **Dos personas con el mismo nombre** se ven iguales: la fila no muestra el
  correo. R4 trae el filtro de personas, que tendrá el mismo problema.
- **Hasta R8, solo el owner ve el reporte de equipo** (ADR 0020).
- **La URL inválida se descarta sin aviso** (RP-32): quien edita la URL a mano
  ve «Esta semana» sin saber por qué.
- **Las flechas mueven por días**: un período de un mes calendario se mueve 30
  o 31 días. R2b trae los atajos de mes y su aritmética.
- **`scripts/` es una carpeta nueva** solo para la medición; no lo ejecuta CI.

## 10. Pendiente del usuario

- **La versión mayor de Postgres de Neon** (`select version();` en la consola de
  Neon), antes del paso 6 del orden. Si es 17, la imagen de los tests sirve.
- **Antes de desplegar R2a**: la consulta de verificación de R1 en producción
  (§2.3 de su contrato), con las dos claves validadas. Si el índice entra, la
  0015 se despliega fuera del horario de uso.
- **Opcional, recomendado**: `E2E_DATABASE_URL` del preview (ya pendiente en
  `estado-fase1.md`) para la comprobación contra Neon de §9.
- **Si el presupuesto de §6 no se cumple con el índice**, el tope de 366 días
  vuelve a `architect` y, si cambia, al usuario: es un número del ADR 0021 que
  RP-21 y RP-34 muestran.
