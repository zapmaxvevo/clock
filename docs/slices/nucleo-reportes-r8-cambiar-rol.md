# Núcleo de reportes, R8: cambiar el rol entre member y admin

Contrato del slice R8 del núcleo de reportes. Trae una pantalla mínima,
`/equipo`, donde el owner y los admins pasan una membresía activa de `member` a
`admin` y de vuelta, con `team.manage` sobre el `MembershipResource` que ya
existe y una fila de `audit_log` por cambio. Sin cambios de tablas, de índices
ni de permisos.

- **Fuente:** [mapa del núcleo](nucleo-reportes-mapa.md), §3 «R8», §5
  (decisión del usuario del 2026-10-08: «Admins antes de la fase 2: el slice
  R8») y §6 (la deuda de `ensureWorkspaceContext`). En `docs/parity/` no hay
  documento de equipo: lo que se sabe de Clockify está en `reportes.md` (RP-02,
  RP-07, RP-08, RP-60) y en `perfil.md` (PF-01, PF-17), y lo demás queda _no
  verificado_ (§9).
- **Lugar en el plan:** depende de R2a, en `main`, que es lo que hace que el rol
  importe (`timeEntry.others.view`). No toca la pantalla ni el módulo del
  reporte. **El usuario decidió implementarlo el 2026-10-13**, en un worktree
  aparte y en paralelo a R7b (§6.6).
- **Revisión del contrato:** la primera ronda de `architecture-reviewer` pidió
  cambios; están aplicados con las decisiones del team-lead (2026-10-09). La
  segunda ronda lo aprobó, con retoques de texto ya aplicados. La tercera, una
  ronda corta del 2026-10-13 contra `main` en `10b8af0`, lo aprobó con retoques,
  ya aplicados: las citas corridas, las descargas en D-R8-8,
  `listWorkspacePeople` ya en `main` (D-R8-1), la coordinación con R7b (§6.6),
  el comentario de `setRole` y los ayudantes que se reusan (§6).
- **Decisiones de arquitectura asociadas**, todas aceptadas:
  - [ADR 0010](../adr/0010-un-modulo-consulta-las-reglas-de-otro-por-su-service.md):
    lo que solo se muestra de otro módulo se lee con un `join` en el repository
    propio; «un ciclo entre módulos es la señal de que una regla o una pieza
    está en el módulo equivocado» (D-R8-1).
  - [ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md): no es una
    operación en masa, así que no hay `RejectedError`; cada causa responde con
    su código, como una operación de una fila. De este ADR se toma la regla de
    los bloqueos: dos filas se bloquean en una sola sentencia con `order by id`
    (D-R8-7).
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): **no
    aplica**. El cambio no crea filas, y el reintento es idempotente por
    construcción (D-R8-7).
  - [ADR 0020](../adr/0020-nucleo-de-reportes-antes-de-la-fase-2.md):
    `timeEntry.others.view` para `owner` y `admin`; «Hasta que exista una forma
    de nombrar admins, solo el owner ve el reporte de equipo». R8 es esa forma.

  **Este contrato no abre ningún ADR y no contradice ninguno aceptado.** La
  elección de mayor alcance, el módulo nuevo (D-R8-1), la impone el ADR 0010;
  el team-lead decidió no llevarla a un ADR propio (§9, punto 1).

Decisiones que el contrato da por tomadas (mapa §5, ADR 0020, `reportes.md` §8):
solo owner y admin ven horas ajenas (P-01); `project_manager` y `team_manager`
deciden como `member`; desactivar a alguien sigue por el procedimiento SQL del
mapa hasta la fase 2; no hay variable de entorno de admins.

## Decisiones del contrato

**D-R8-1 — Un módulo nuevo, `team`.** Opciones: (1) la pantalla y la mutación
en `src/modules/workspace/`, que ya lee y crea membresías; (2) un módulo nuevo,
`src/modules/team/`, para administrar las membresías que ya existen. **(2).**

- **(1) cierra un ciclo.** La lista muestra el nombre de cada persona con
  `displayNameOf`, que vive en `profile/service.ts` (`:113-118`), y
  `profile/service.ts` ya importa `weekStartOf` y `WorkspaceContext` de
  `workspace/service.ts` (`:20`). Copiar la regla del nombre en SQL
  (`coalesce(display_name, name)`) la dejaría en dos lugares. El ADR 0010 lo
  dice: un ciclo es la señal de que la pieza va en otro módulo.
- **Con (2) las dependencias van en una dirección**: `team` importa de `profile`
  (`displayNameOf`) y de nadie más; `workspace` y `profile` no importan de
  `team`. Lo importan solo `src/app/`.
- **El reparto de `membership`**: `workspace` la **crea** al entrar
  (`ensureWorkspaceContext`, `createMembership`) y la lee para la sesión;
  `team` la **administra** después: el rol desde R8 y, en la fase 2, el estado,
  el primer día de la semana (PF-01) y la capacidad. Son escrituras de
  columnas distintas con dueño distinto, y ninguna regla queda en dos lugares.
  `team/repository.ts` es el único lugar de `team` con acceso a datos y filtra
  siempre por el `workspace_id` de la sesión.
- **`workspace` también lista personas**: `listWorkspacePeople`
  (`workspace/service.ts:105-124`, que lee con `listPeople`,
  `workspace/repository.ts:103-122`), el catálogo del filtro de personas y de
  las personas sin horas del reporte, con `team.view`, activas e inactivas, el
  `userId`, los dos nombres, el estado y `joinedAt` (`WorkspacePerson`,
  `workspace/service.ts:89-103`). R8 no la extiende y lee su lista en `team`
  (`listActiveMembers`): cambian el permiso (`team.manage` contra `team.view`),
  los estados (solo `active` contra `active` e `inactive`), las columnas
  (además el email, el rol y el id de la membresía) y quién la usa (la pantalla
  de equipo contra el catálogo de otro módulo, que la recibe con la transacción
  del que llama). Las dos leen los nombres con un `join` en el repository del
  módulo que dibuja, que es lo que pide el ADR 0010; ninguna aplica una regla
  de la otra.
- **Es el módulo de la pantalla de equipo de la fase 2**, que lo extiende sin
  moverlo: invitar, desactivar, el primer día de la semana y la capacidad entran
  acá.

**D-R8-2 — La pantalla `/equipo`, y quién la ve.**

- **La ruta es `/equipo`**, con su entrada «Equipo» en la navegación después de
  «Proyectos». La entrada se dibuja **solo con `team.manage`** sobre el
  workspace: el layout pregunta `canManageTeam(actor)` y se lo pasa a `AppNav`.
- **Un `member` activo** (y `project_manager` y `team_manager`, que deciden
  como él) no tiene la entrada. Si abre `/equipo` a mano ve el título «Equipo» y
  «No tenés permiso para administrar el equipo.», sin tabla, y **no se lee
  ninguna membresía**. No ve la lista en solo lectura: `team.view` (todos) es de
  la pantalla de equipo de la fase 2, que decide qué ve un member —en Clockify
  ve la página de equipo salvo que se la escondan (RP-08)—; R8 no lo abre.
- **Queda abierto para la fase 2**, sin decidir acá: cuando la pantalla de
  equipo use `team.view`, si `listWorkspacePeople` sigue en `workspace` o se
  muda a `team` (§9, punto 4).
- **Una membresía `inactive` o `invited`** ve el aviso común,
  «Tu acceso al workspace está desactivado.», con «No podés administrar el
  equipo.» (como RP-07 en el reporte).
- **Owner y admin activos** ven la lista de D-R8-3.

**D-R8-3 — Qué se lista y qué se puede cambiar.**

- **Se listan las membresías activas del workspace de quien mira**, una fila por
  persona, en el orden de `compareNames` sobre el nombre que se muestra
  (desempata por el id de la membresía). Las `inactive` y las `invited` no se
  listan: no tienen acceso, y su rol es de la fase 2, con la reactivación.
- **Cada fila** muestra el nombre (`displayNameOf`: el editado o el de Google),
  el email en gris —dos personas pueden llamarse igual (RP-31)—, «(vos)» en la
  de quien mira y el rol con su rótulo (§5.6).
- **El control** está solo en las filas con rol `member` («Hacer
  administrador») o `admin` («Quitar administrador»). La del owner, y las de
  `project_manager` y `team_manager`, no tienen control (D-R8-4).
- **Para esas filas no se llama a `can()` por fila**: con la vista lista, quien
  mira ya tiene `team.manage` sobre el workspace, y sobre una membresía
  `member` o `admin` `can()` decide igual (la regla del owner,
  `permissions/index.ts:202-209`, solo mira la membresía del owner, que nunca
  tiene control). La mutación sí lo consulta sobre la fila leída (D-R8-7).

**D-R8-4 — El owner y los otros roles no se tocan.**

- **El rol del owner no cambia desde acá**, tampoco por el owner mismo. `can()`
  deja al owner tocar su propia membresía (`team.manage` con `role: "owner"` y
  actor owner da `true`, `permissions.test.ts:56-65`), así que la regla vive en
  el service: bajar al owner dejaría un workspace cuyo `owner_id` no tiene el
  rol `owner`. Cambiar de owner es `workspace.transfer`, de la fase 2. Un admin
  que lo intenta recibe `forbidden` de `can()` antes de llegar a la regla.
- **`project_manager` y `team_manager` no se cambian**: «no cambia otros roles»
  (mapa §3). Hoy solo existen por SQL; pasarlos a `admin` y de vuelta a `member`
  les perdería el rol original sin aviso. El service responde `role_locked`.
- **El pedido solo puede llevar `member` o `admin`**: el esquema rechaza
  cualquier otro valor, también `owner` (§4.1).

**D-R8-5 — Un admin puede bajarse a sí mismo, con confirmación; no hay mínimo
de admins.**

- **Bajarse a sí mismo se permite.** Opciones: (1) permitirlo; (2) prohibirlo,
  que es una regla de acceso nueva en `can()` (`team.manage` sobre la membresía
  propia) y alcanzaría también a «desactivar» de la fase 2. **(1)**: no deja el
  workspace sin nadie que administre, porque el owner no se toca (D-R8-4), y
  agregar una regla a `can()` para un caso que el owner deshace en un clic no se
  justifica. En Clockify está _no verificado_ (§9).
- **Con confirmación**: en la fila propia de un admin, «Quitar administrador»
  abre un diálogo que dice qué pierde. Las demás filas cambian con un clic,
  porque el cambio se deshace con otro.
- **El workspace puede quedar sin admins además del owner**: es el estado de
  antes de R8. El piso es el owner. Si la membresía del owner estuviera
  inactiva por SQL y el último admin se baja, nadie administra el equipo y la
  salida es SQL (§8).

**D-R8-6 — Ids ajenos, inexistentes e inactivos.**

- **El pedido nombra la membresía por su id** (`membership.id`, uuid). El
  workspace sale siempre de la sesión: el repository busca por
  `(workspace_id del actor, id)`.
- **Un id de otro workspace y uno que no existe responden lo mismo**,
  `not_found` con «Esa persona ya no está en el equipo.»: no se distingue si la
  fila existe en otro workspace.
- **Una membresía `inactive` o `invited`** responde `inactive_membership` con
  «Esa persona ya no está activa en el workspace.». Llega por una pestaña vieja
  (la desactivaron por SQL después de cargar la lista) o por un pedido armado a
  mano. La revalidación de `handle` la saca de la lista.

**D-R8-7 — Autoridad leída bajo el mismo bloqueo, idempotente, y con
`for no key update`.**

- **La autoridad de quien actúa se vuelve a leer dentro de la transacción.** El
  `Actor` de la sesión se armó al empezar el pedido, en otra transacción
  (`ensureWorkspaceContext`). En esta pantalla la autoridad es justamente lo que
  cambia: dos admins que se bajan uno al otro a la vez terminarían los dos como
  `member` si cada uno decidiera con su sesión. Por eso el service bloquea **en
  una sola sentencia, ordenada por `id`**, la membresía pedida y la de quien
  actúa, y decide `can()` con el rol y el estado recién leídos. Es la regla del
  ADR 0011 para dos filas: un `order by` debajo del bloqueo, nunca dos
  sentencias en el orden pedido, que pueden esperarse en círculo (`40P01`).
- **Antes de abrir la transacción**, `can(actor, "team.manage", workspace)` con
  el actor de la sesión: sin permiso no se abre (como el reporte con
  `report.view`).
- **El bloqueo es `for no key update`, no `for update`.** Insertar una entrada
  de horas toma `for key share` sobre la membresía de la persona, por la clave
  `time_entry_membership_fk` (`schema.ts:477-481`), y también lo hacen las
  claves de `project_member` y `task_assignee`. `for update` choca con
  `for key share`: cambiar el rol de alguien esperaría a que termine cualquier
  alta de horas suya en curso, y al revés. `for no key update` no choca, y es
  el bloqueo que toma el `update` de una columna que no es clave, como `role`.
- **Idempotente**: si la membresía ya tiene el rol pedido, responde éxito con
  ese rol, **sin escribir y sin auditar** (como el perfil, TT-89). El reintento
  de una respuesta perdida llega a lo mismo. No hace falta un id del cliente
  (ADR 0007): no se crean filas.
- **Dos cambios de la misma membresía** se ponen en fila en el bloqueo y gana el
  último; cada uno lee el rol bajo el bloqueo, así que las filas de auditoría
  encadenan (el anterior de la segunda es el siguiente de la primera).

**D-R8-8 — El efecto en una sesión abierta.** El servidor no guarda estado: la
sesión lee la membresía en cada pedido (`currentSession` →
`ensureWorkspaceContext`, con `cache` de React, que dura un pedido,
`session.ts:34-55`), y el reporte decide el alcance en cada lectura
(`scopeOf`, `report/service.ts:121-131`; lo llama `readReportState` en
`:986-997`, el cuerpo común de `getReportState`, `:1095`, y de
`getReportExport`, `:1176`; el handler de una descarga pide la sesión con
`requireSession()`, `report/export/handler.ts:122`). Entonces, para la persona
cuyo rol cambia:

- **Todo pedido posterior al commit decide con el rol nuevo**: recargar, navegar
  a otra pantalla o dentro del reporte (cambiar el período o la agrupación es
  navegar), y cualquier server action. También una descarga de
  `/reportes/exportar/<formato>/` (R6, R7), que lee con `getReportExport` por el
  mismo `scopeOf`, y una URL con `personas` o con las personas sin horas, que
  con el alcance propio no aplican (D-R4-4, D-R9-5; `report/service.ts:832-842`
  y `:1006-1007`). Un admin bajado no lee una hora ajena más; uno ascendido ve
  las de todos al próximo pedido.
- **Lo que ya está dibujado en su navegador queda** hasta ese pedido. Un
  reporte de equipo abierto sigue mostrando lo que ya leyó; no puede pedir más;
  si exporta desde esa pantalla, el archivo sale con el rol nuevo. Volver con
  «Atrás» puede mostrar una página ya dibujada desde la caché del cliente, sin
  leer de nuevo (`staleTimes.md`: el caché de atrás y adelante no cambia).
- **La entrada «Equipo» de su navegación cambia en la próxima carga completa o
  en la próxima server action suya que revalide**: Next no vuelve a pedir el
  layout en una navegación del cliente (`staleTimes.md`: «shared layouts won't
  automatically be refetched on every navigation»). Un admin bajado que todavía
  la ve y la usa llega a la vista sin permiso; uno ascendido la ve al recargar,
  al entrar o después de una action suya.
- **Una mutación de esa persona en vuelo** decide con la autoridad leída bajo el
  bloqueo (D-R8-7).
- **Quien actúa** ve su cambio enseguida, y su navegación cambia **porque la
  action revalida**: la regla es `{ path: "/", type: "layout" }`, como
  `profile/actions.ts:22`. En Next 16.3.8 toda server action que revalida
  redibuja desde la raíz (`server-action-reducer.js:296-299`,
  `action-handler.js:963`), así que al bajarse a sí mismo la pantalla y la
  navegación cambian sin recargar.
- **No se cierra ninguna sesión**: a diferencia del procedimiento de
  desactivar (mapa §5), cambiar el rol no borra filas de `session`.

**D-R8-9 — La auditoría.** Una fila de `audit_log` por cambio efectivo, en la
transacción del cambio, con `recordAudit`: `workspaceId` y `actorId` de quien
actúa, `action: "membership.changeRole"`, `entity: "membership"`, `entityId`
el id de la membresía, `previousValue: { role }` y `nextValue: { role }`. Un
pedido sin efecto (D-R8-7) o rechazado no deja fila.

**D-R8-10 — El control: un botón por fila.** Opciones: (1) un selector de rol;
(2) un grupo de dos radios «Miembro» / «Administrador»; (3) un botón con la
acción. **(3).** Un grupo de radios cambia la selección con las flechas, y acá
cambiar la selección escribe; un selector de dos opciones esconde la acción
detrás de un desplegable. El botón dice la acción («Hacer administrador»,
«Quitar administrador») y su nombre accesible suma la persona, porque la misma
acción se repite en cada fila.

**D-R8-11 — Los e2e.** Heredan la regla de §8.3 de R2a: el workspace es común,
así que cada recorrido usa su propia persona (la de la sesión del test, con el
rol que le da `setRole`) y siembra con `seedPerson` a la persona cuyo rol
cambia, con un nombre único; **ninguna afirmación es sobre la lista entera**,
que en una corrida tiene cientos de filas. El owner de la suite no se toca. Para
ver el efecto en la sesión de la otra persona, el recorrido abre un segundo
contexto del navegador y entra con su email (`signIn` acepta una cuenta que ya
existe, `test-session.ts:84-99`). **El email de la persona sembrada es
`…@${TEST_EMAIL_DOMAIN}`**, como en `seedOtherPerson`
(`e2e/reports.spec.ts:177-185`): el hook `session.create` de Better Auth
vuelve a comprobar el dominio en cada inicio de sesión
(`src/server/auth.ts:104-112`), así que con otro dominio el segundo contexto no
entra.

**D-R8-12 — Sin comprobación contra Neon.** La única forma nueva es la cláusula
`for no key update`, SQL fijo sin parámetros: Drizzle 0.45.3 la escribe tal
cual (`drizzle-orm/pg-core/dialect.js:290`). La sentencia lleva tres
parámetros —el workspace (uuid), la membresía (uuid) y el `user_id` de quien
actúa (texto)—, de tipos que ya viajan en producción; el precedente de un
bloqueo con `neon-serverless` es el `for update` de una fila de
`profile/repository.ts:53`. Si `backend-dev` necesita otra forma, avisa y la
comprobación vuelve con el procedimiento de §6.3 de R2b.

## 0. Precondición de arranque

- **`main` en `10b8af0`**, con R4a, R4b, R10a, R10b, R5, R6a, R6b, R9 y R7a. Las
  citas de abajo son de ese árbol. Los tests de integración y CI usan
  `postgres:18-alpine`, la versión mayor de Neon.
- **Sin pendientes del usuario para arrancar**: decidió implementarlo el
  2026-10-13. Las preguntas de §9 no bloquean.
- **La ronda corta de `architecture-reviewer` contra `10b8af0`** (lección de los
  contratos viejos en `estado-fase1.md`) se hizo el 2026-10-13, y sus retoques
  están aplicados. Si `main` ya no está en `10b8af0` al crear el worktree, otra
  ronda corta confirma las citas de §0.

### Supuestos sobre el árbol, con archivo y línea en `10b8af0`

| Supuesto                                                                                                                                                                                                            | Dónde                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `MembershipResource` lleva `workspaceId`, `userId` y `role`; `team.manage` acepta `workspace` y `membership`, para `owner` y `admin`                                                                                | `src/server/permissions/index.ts:19-24`, `:59`, `:96`, `:126`                                                                               |
| `can()` corta por estado y por workspace antes que por rol; la membresía del owner solo la toca el owner (y el owner, también la suya)                                                                              | `permissions/index.ts:181-186`, `:202-209`; `permissions.test.ts:56-65`                                                                     |
| `permissions.test.ts` ya prueba `team.manage` con otro workspace, la membresía del owner y los dos tipos de recurso                                                                                                 | `src/server/permissions/permissions.test.ts:47-65`, `:307-317`, `:437-443`                                                                  |
| `currentSession` lee la membresía en cada pedido con `ensureWorkspaceContext`, con `cache` de React por pedido                                                                                                      | `src/server/session.ts:34-55`                                                                                                               |
| `ensureWorkspaceContext` toma el workspace más viejo, busca la membresía y, si no existe, la crea como `owner` o `member`                                                                                           | `src/modules/workspace/service.ts:35-87`; `workspace/repository.ts:42-64`, `:80-101`                                                        |
| `profile/service.ts` importa de `workspace/service.ts`; `displayNameOf` es la única regla del nombre                                                                                                                | `src/modules/profile/service.ts:20`, `:113-118`                                                                                             |
| `membership`: `id` uuid, `role` y `status` con sus enums, única por `(workspace_id, user_id)`, `updated_at` con `$onUpdate`                                                                                         | `src/server/db/schema.ts:25-37`, `:97-123`                                                                                                  |
| `time_entry_membership_fk` apunta a `membership(workspace_id, user_id)`; también `project_member_membership_fk` y `task_assignee_membership_fk`                                                                     | `schema.ts:477-481`, `:553-555`, `:587-589`                                                                                                 |
| `audit_log` y `recordAudit`, dentro de la transacción                                                                                                                                                               | `schema.ts:595-614`; `src/server/audit.ts:34-36`                                                                                            |
| `DomainError` con código, `failure` y `handle` con la revalidación también en el error                                                                                                                              | `src/server/action.ts:8`, `:28-36`, `:72-99`, `:106-123`                                                                                    |
| Una action que revalida el árbol entero                                                                                                                                                                             | `src/modules/profile/actions.ts:18-27`                                                                                                      |
| Una action que deja el permiso al service, porque el recurso necesita la fila leída; primero `not_found`, después `can()` sobre la fila                                                                             | `src/modules/project/actions.ts:30-32`; `src/modules/time-entry/service.ts:239-276`                                                         |
| `scopeOf` decide `everyone` o `self` con `timeEntry.others.view` en cada lectura; la página (`getReportState`) y las descargas (`getReportExport`) lo leen por `readReportState`                                    | `src/modules/report/service.ts:121-131`, `:986-997`, `:1095`, `:1176`                                                                       |
| `AppNav` es de cliente, con la lista fija de entradas; el layout de `(app)` la dibuja sin props                                                                                                                     | `src/components/layout/app-nav.tsx:9-15`; `src/app/(app)/layout.tsx:7-30`                                                                   |
| La página compone y pasa las actions por props; `error.tsx` con «Reintentar»                                                                                                                                        | `src/app/(app)/perfil/page.tsx:6-15`; `src/app/(app)/planilla/error.tsx`                                                                    |
| `useAction`, `retryHandlerOf`, `ActionFeedback` e `InactiveMembershipNotice`                                                                                                                                        | `src/hooks/use-action.ts:46-111`; `src/components/action-feedback.tsx`; `src/components/inactive-membership-notice.tsx`                     |
| Un diálogo de confirmación con `finalFocus`                                                                                                                                                                         | `src/modules/time-entry/components/timesheet/remove-row-dialog.tsx:43-60`                                                                   |
| La lógica de un control de cliente en un modelo puro con pruebas de unidad, y el hook que la cablea                                                                                                                 | `src/modules/time-entry/components/timesheet/row-removals.ts`, `use-row-removals.ts`                                                        |
| El arnés de unidad es `environment: "node"`, sin DOM: los componentes se prueban con `renderToStaticMarkup`                                                                                                         | `vitest.config.ts:11`                                                                                                                       |
| `compareNames` desempata por id                                                                                                                                                                                     | `src/lib/text.ts:27-39`                                                                                                                     |
| Fábricas e instrumentos de test: `seedWorkspace`, `seedMember` (rol, estado, id; devuelve `userId`), `seedPreferences`, `seedTimeEntry`; `auditFor`; `failureOf`; las barreras de concurrencia, con `finishedEarly` | `src/test/factories.ts:47-74`, `:85`, `:117`; `src/test/queries.ts:37-43`; `src/test/time-entry.ts:48-92`; `src/test/concurrency.ts:56-172` |
| Las actions se prueban con `next/headers`, `next/cache`, `next/navigation` y `auth` reemplazados; `signInAs` siembra un solo workspace                                                                              | `src/modules/profile/actions.integration.test.ts:24-90`; `src/modules/project/actions.integration.test.ts:76-90`                            |
| e2e: `seedPerson` siembra un `member` activo con nombre editado; `setRole` y `setMembershipStatus` cambian la membresía de una persona que no es el owner; `setDisplayName`                                         | `e2e/database.ts:402-426`, `:433-445`, `:452-477`                                                                                           |
| e2e: cada test entra con un usuario propio; `signIn` entra con una cuenta existente si el email ya está; el dominio se comprueba en cada sesión                                                                     | `e2e/session.ts:24-37`, `:63-71`; `src/server/test-session.ts:84-99`; `src/server/auth.ts:104-112`                                          |
| e2e: `REPORTS_PATH`, `SCOPE_SELF` y `SCOPE_EVERYONE` exportados; `seedOtherPerson` arma el email con `TEST_EMAIL_DOMAIN`                                                                                            | `e2e/reports-page.ts:32`, `:41`, `:44`; `e2e/reports.spec.ts:177-185`                                                                       |
| e2e: retener la respuesta de una server action y contar los pedidos; un clic con `{ force: true }` sobre un control con `aria-disabled="true"`                                                                      | `e2e/network.ts` (`holdActionResponses`, `recordActions`); `e2e/manual-entry.spec.ts:236`                                                   |
| Next no vuelve a pedir un layout compartido en una navegación del cliente; el caché de atrás y adelante no cambia                                                                                                   | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md:32-36`                                       |
| Next 16.3.8: una server action que revalida redibuja desde la raíz                                                                                                                                                  | `server-action-reducer.js:296-299`; `action-handler.js:963`                                                                                 |

## 1. Alcance

Entra:

- **El módulo `src/modules/team/`** (nuevo): el esquema de la entrada y de la
  vista, la lectura de la lista, la mutación `changeRole` con su transacción, su
  bloqueo y su auditoría, y la action.
- **La pantalla `/equipo`**: la lista con el botón por fila, la confirmación al
  bajarse a sí mismo, los avisos y la vista sin permiso; su `error.tsx`.
- **La entrada «Equipo»** en la navegación, solo con `team.manage`.
- **Tests** de unidad, integración, concurrencia y e2e (§7).

Queda afuera: ver §10.

### Consecuencias sobre código ya entregado

| Archivo                                      | Qué cambia                                                                           | Qué hay que volver a probar      |
| -------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------- |
| `src/app/(app)/layout.tsx`                   | Pasa `showTeam={canManageTeam(session.actor)}` a `AppNav`                            | e2e entera (todas pasan por acá) |
| `src/components/layout/app-nav.tsx`          | Recibe `showTeam`; suma `{ href: "/equipo", label: "Equipo" }` al final si es `true` | `app-nav.test.tsx` (nuevo)       |
| `src/server/permissions/permissions.test.ts` | Suma los casos del criterio 2. **`index.ts` no cambia**                              | —                                |
| `e2e/database.ts`                            | El comentario de `setRole` (`:456`) deja de decir que no hay pantalla                | —                                |

- **Ninguna afirmación existente cambia de valor.** Ningún e2e cuenta las
  entradas de la navegación (`goToReportsByNav` busca «Reportes» por nombre).
- `src/modules/workspace/`, `src/modules/profile/` y `src/modules/report/` no
  cambian.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La lectura de la lista usa
`membership_workspace_idx`; el bloqueo, la clave primaria y
`membership_workspace_user_unq`. Sin migración.

## 3. Permisos

**Ninguna acción nueva.** `team.manage` ya existe, para `owner` y `admin`, sobre
`WorkspaceResource` y `MembershipResource`. Cómo decide sobre una membresía, que
el criterio 2 fija:

| Quien actúa (activo)                        | Sobre `member` o `admin` | Sobre `owner`                   | De otro workspace |
| ------------------------------------------- | ------------------------ | ------------------------------- | ----------------- |
| `owner`                                     | sí                       | sí (su propia; la frena D-R8-4) | no                |
| `admin`                                     | sí (también la propia)   | no                              | no                |
| `project_manager`, `team_manager`, `member` | no                       | no                              | no                |
| cualquiera `inactive` o `invited`           | no                       | no                              | no                |

- **Toda decisión de acceso es `can()`**: `canManageTeam(actor)` es
  `can(actor, "team.manage", { kind: "workspace", workspaceId })` y la usan el
  layout (la entrada), la página (la vista) y la mutación (antes de abrir la
  transacción); dentro, `can()` con el actor leído y la membresía leída.
- **Las reglas de D-R8-4 y D-R8-6 no son de acceso**: el owner que no cambia, los
  roles que no se tocan y la membresía inactiva son reglas del dominio del
  equipo, con sus códigos.

## 4. Contrato de la mutación

El recorrido de `CLAUDE.md`: la action obtiene la sesión con `handle`, valida
con Zod y llama al service; el service consulta `can()` —antes de abrir la
transacción, sobre el workspace, y dentro, sobre la fila leída, porque el
recurso necesita el rol de la membresía— y aplica las reglas en una
transacción que escribe el audit log; la action revalida.

### 4.1 Los esquemas (`team/schema.ts`)

```ts
import { z } from "zod";

import type { ActionErrorCode, ActionResult } from "@/server/action";
import type { Role } from "@/server/permissions";

/**
 * Los cinco roles, para la vista. El tipo mapeado exige una clave por cada
 * valor de `Role` y ninguna más: un rol nuevo en `workspace_role` no compila
 * hasta sumarlo acá. Sin importar `@/server/db/schema`: lo carga el navegador.
 */
const ROLE_VALUES = {
  owner: "owner",
  admin: "admin",
  project_manager: "project_manager",
  team_manager: "team_manager",
  member: "member",
} as const satisfies { readonly [R in Role]: R };

/** D-R8-4: los únicos roles que R8 escribe. */
export const CHANGEABLE_ROLES = ["member", "admin"] as const;
export type ChangeableRole = (typeof CHANGEABLE_ROLES)[number];

/** Textos que la interfaz muestra tal cual (§5.6). */
export const teamMessages = {
  forbidden: "No tenés permiso para cambiar roles.",
  notFound: "Esa persona ya no está en el equipo.",
  inactive: "Esa persona ya no está activa en el workspace.",
  ownerLocked: "El rol del propietario no se cambia.",
  roleLocked: "Este rol no se cambia desde acá.",
  roleUnavailable: "Ese rol no está disponible.",
  unexpected: "No se pudo cambiar el rol. Revisá la conexión y volvé a intentar.",
} as const;

export type TeamErrorCode = ActionErrorCode | "role_locked" | "inactive_membership";

/** Un cambio por pedido. El workspace sale de la sesión, nunca de acá (D-R8-6). */
export const changeRoleInput = z.object(
  {
    membershipId: z.uuid({ error: teamMessages.notFound }),
    role: z.enum(CHANGEABLE_ROLES, { error: teamMessages.roleUnavailable }),
  },
  { error: teamMessages.roleUnavailable },
);
export type ChangeRoleInput = z.infer<typeof changeRoleInput>;

/** El rol que quedó, también si ya era ese (D-R8-7). */
export type ChangeRoleResult = {
  readonly membershipId: string;
  readonly role: ChangeableRole;
};

const teamMember = z.object({
  membershipId: z.uuid(),
  /** `displayNameOf`: el editado o el de Google. */
  name: z.string(),
  email: z.string(),
  role: z.enum(ROLE_VALUES),
  /** La fila de quien mira: «(vos)», y bajarse pide confirmación (D-R8-5). */
  isSelf: z.boolean(),
  /** D-R8-3: `promote` para `member`, `demote` para `admin`, `null` sin control. */
  change: z.enum(["promote", "demote"]).nullable(),
});

export const teamView = z.discriminatedUnion("kind", [
  /** Sin `team.manage`: no se leyó nada. `inactive` si la membresía no está activa. */
  z.object({ kind: z.literal("forbidden"), reason: z.enum(["inactive", "role"]) }),
  /** Las membresías activas, en el orden de `compareNames`. */
  z.object({ kind: z.literal("ready"), members: z.array(teamMember) }),
]);

export type TeamMember = z.infer<typeof teamMember>;
export type TeamView = z.infer<typeof teamView>;

/** Las actions, como las recibe la pantalla por props desde `page.tsx`. */
export type TeamActions = {
  readonly changeRole: (
    input: ChangeRoleInput,
  ) => Promise<ActionResult<ChangeRoleResult, TeamErrorCode>>;
};
```

- **`z.enum` con un objeto** toma sus valores, como con un enum de TypeScript.
  Si `backend-dev` prefiere una tupla, vale cualquier forma que el compilador
  rechace con un rol de menos; la del objeto lo hace con el `satisfies`.
- **Un id que no es uuid** responde `validation` con el texto de `not_found`:
  para quien lo ve, es la misma situación.
- `change` no se arma con `can()` por fila (D-R8-3).

### 4.2 Repository (`team/repository.ts`)

```ts
/** Lo que la lista muestra de una membresía activa (ADR 0010: `join`, sin reglas). */
export type TeamMemberRow = {
  readonly membershipId: string;
  readonly userId: string;
  readonly role: Role;
  /** `user.name`, el de Google. */
  readonly accountName: string;
  readonly email: string;
  /** `user_preference.display_name`, o `null`. */
  readonly displayName: string | null;
};

/** Una membresía bloqueada para cambiar el rol. */
export type LockedMembership = {
  readonly id: string;
  readonly userId: string;
  readonly role: Role;
  readonly status: MembershipStatus;
};

/** Único lugar del módulo con acceso a datos. */
export const teamRepository = {
  /**
   * Las membresías `active` de `workspaceId`, con `"user"` interno y
   * `user_preference` con `left join`. Sin orden.
   */
  listActiveMembers(workspaceId: string): Promise<readonly TeamMemberRow[]>;

  /**
   * D-R8-7: en una sentencia, las membresías de `workspaceId` con
   * `id = membershipId` o `user_id = actorUserId`, `order by id`,
   * `for no key update`. Devuelve las que existen: ninguna, una (también si
   * son la misma) o dos.
   */
  lockForRoleChange(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    actorUserId: string,
  ): Promise<readonly LockedMembership[]>;

  /** El rol de `(workspaceId, membershipId)`. `updated_at` lo pone `$onUpdate`. */
  updateRole(
    tx: Transaction,
    workspaceId: string,
    membershipId: string,
    role: ChangeableRole,
  ): Promise<void>;
};
```

- **Toda consulta filtra por el `workspaceId` que le pasa el service**, que es el
  del actor de la sesión.
- **`lockForRoleChange` es una sola sentencia** con `.orderBy(asc(membership.id))`
  y `.for("no key update")`. Dos sentencias, o el orden de los parámetros,
  pueden cerrar un ciclo de espera (ADR 0011).
- **`updateRole` escribe solo `role`** (y `updated_at`): ninguna otra columna de
  `membership` es de R8.
- **`listActiveMembers` no es `listWorkspacePeople` de R4** (D-R8-1): otro
  permiso, otros estados, otras columnas y otro consumidor.

### 4.3 Service (`team/service.ts`)

```ts
export class TeamError extends DomainError<TeamErrorCode> {
  constructor(code: TeamErrorCode, message: string);
}

/** `can(actor, "team.manage", workspace)`: la entrada de la navegación, la vista y la puerta de la mutación. */
export function canManageTeam(actor: Actor): boolean;

/** D-R8-2, D-R8-3. Sin `team.manage`, no lee. */
export async function getTeamView(actor: Actor): Promise<TeamView>;

/** D-R8-4 a D-R8-9. */
export async function changeRole(
  actor: Actor,
  input: ChangeRoleInput,
): Promise<ChangeRoleResult>;
```

**`getTeamView`**:

1. Sin `canManageTeam(actor)`: `{ kind: "forbidden", reason }`, con `inactive`
   si `actor.status` no es `active` y `role` si no. No llama al repository.
2. `listActiveMembers(actor.workspaceId)`. Cada fila lleva el nombre de
   `displayNameOf(fila, fila.accountName)`, `isSelf` si su `userId` es el de
   quien mira, y `change` por su rol: `member` → `promote`, `admin` →
   `demote`, los demás → `null`.
3. Ordena con `compareNames` sobre `{ id: membershipId, name }`.

**`changeRole`**, en este orden:

1. **Sin `canManageTeam(actor)`**: `TeamError("forbidden", teamMessages.forbidden)`,
   sin abrir la transacción.
2. **`db.transaction`** (`read committed`, la de siempre):
   1. `lockForRoleChange(tx, actor.workspaceId, input.membershipId, actor.userId)`.
   2. **La pedida no está** (otro workspace o inexistente):
      `TeamError("not_found", teamMessages.notFound)`.
   3. **La de quien actúa no está**: `forbidden`. Con ella, el actor fresco es
      `{ userId, workspaceId: actor.workspaceId, role, status }` de la fila.
   4. **`can()` con el actor fresco, `team.manage` y el `MembershipResource` de
      la pedida** (su workspace, su `userId` y su rol) es `false`:
      `forbidden`. Cubre al admin bajado entre la sesión y el bloqueo, a la
      membresía desactivada por SQL y al admin que pide la del owner.
   5. **La pedida es `owner`**: `TeamError("role_locked", teamMessages.ownerLocked)`.
   6. **La pedida no es `member` ni `admin`**:
      `TeamError("role_locked", teamMessages.roleLocked)`.
   7. **La pedida no está `active`**:
      `TeamError("inactive_membership", teamMessages.inactive)`.
   8. **Ya tiene el rol pedido**: devuelve `{ membershipId, role }` sin escribir
      ni auditar.
   9. **`updateRole`** y **`recordAudit`** (D-R8-9) en la misma transacción;
      devuelve `{ membershipId, role }`.

- El orden de 2 a 4 es el de `authorizeEntry` de `time-entry`: primero si la
  fila existe, después el permiso sobre ella. Un admin que pide la del owner
  recibe `forbidden`, no `role_locked`.
- **Ninguna decisión de acceso fuera de `can()`**: el service no compara roles
  para decidir acceso; 5 a 7 son reglas del dominio (§3).

### 4.4 Action (`team/actions.ts`)

```ts
"use server";

// El permiso lo consulta el service: el recurso necesita la membresía leída, y
// la autoridad se vuelve a leer bajo el bloqueo (D-R8-7).
const options = {
  // D-R8-8: bajarse a sí mismo cambia la navegación y todas las pantallas.
  paths: [{ path: "/", type: "layout" }],
  messages: { forbidden: teamMessages.forbidden, unexpected: teamMessages.unexpected },
} as const;

export async function changeRole(
  input: ChangeRoleInput,
): Promise<ActionResult<ChangeRoleResult, TeamErrorCode>> {
  return handle(
    async (session) => service.changeRole(session.actor, changeRoleInput.parse(input)),
    options,
  );
}
```

### 4.5 Las respuestas

| Situación                                              | Código                 | Texto             | Escribe | Audita |
| ------------------------------------------------------ | ---------------------- | ----------------- | ------- | ------ |
| Cambio efectivo                                        | `ok`                   | —                 | sí      | sí     |
| Ya tenía el rol                                        | `ok`                   | —                 | no      | no     |
| Rol fuera de `member` y `admin`, o entrada mal formada | `validation`           | `roleUnavailable` | no      | no     |
| Id que no es uuid                                      | `validation`           | `notFound`        | no      | no     |
| Quien actúa sin `team.manage` (sesión o fila leída)    | `forbidden`            | `forbidden`       | no      | no     |
| Admin sobre la membresía del owner                     | `forbidden`            | `forbidden`       | no      | no     |
| Id inexistente o de otro workspace                     | `not_found`            | `notFound`        | no      | no     |
| El owner sobre la suya                                 | `role_locked`          | `ownerLocked`     | no      | no     |
| Membresía `project_manager` o `team_manager`           | `role_locked`          | `roleLocked`      | no      | no     |
| Membresía `inactive` o `invited`                       | `inactive_membership`  | `inactive`        | no      | no     |
| Sin sesión                                             | redirección a `/login` | —                 | no      | no     |

## 5. Pantalla

### 5.1 La navegación

- `AppNav` recibe `showTeam: boolean` y, con `true`, dibuja «Equipo» después de
  «Proyectos», con `aria-current="page"` en `/equipo` como las demás.
- `layout.tsx` le pasa `canManageTeam(session.actor)`. El comentario «Cada fase
  agrega su entrada acá» sigue valiendo: la entrada vive en `app-nav.tsx`.

### 5.2 La página (`src/app/(app)/equipo/page.tsx`)

```tsx
export default async function TeamPage() {
  const session = await requireSession();
  return <TeamScreen view={await getTeamView(session.actor)} actions={{ changeRole }} />;
}
```

`error.tsx` (cliente), como el de la planilla: el título «Equipo» y
`ActionFeedback` con «No se pudo cargar el equipo.» y «Reintentar».

### 5.3 Los estados (`team/components/team-screen.tsx`, servidor)

| Estado                            | Qué se ve                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------- |
| `forbidden`, `reason: "role"`     | `<h1>` «Equipo» y el párrafo «No tenés permiso para administrar el equipo.»        |
| `forbidden`, `reason: "inactive"` | `<h1>` «Equipo» e `InactiveMembershipNotice` con «No podés administrar el equipo.» |
| `ready`                           | `<h1>` «Equipo», el párrafo de §5.6 (`intro`) y la tabla de `TeamMembers`          |
| Error de lectura                  | `error.tsx`                                                                        |

Una lista `ready` nunca está vacía: tiene, al menos, la fila de quien mira.

### 5.4 La tabla: modelo, vista y cableado

El arnés de unidad no tiene DOM (`vitest.config.ts:11`, D-R3-13): un clic no se
puede simular en unidad. Por eso la tabla se parte en tres piezas, como las
filas de la planilla (`row-removals.ts` y `use-row-removals.ts`): la lógica del
clic y del aviso en un modelo puro, la vista sin hooks y el componente que los
cablea.

**El modelo (`team/components/team-members-model.ts`)**:

```ts
/** Lo que hace la tabla con un clic; los dos los pasa el componente. */
export type RowHandlers = {
  /** `run` de `useAction` con `changeRole`. */
  readonly send: (input: ChangeRoleInput) => void;
  /** Abre la confirmación de §5.5 para la fila. */
  readonly confirm: (member: TeamMember) => void;
};

/**
 * El clic en el botón de una fila. Con un pedido en curso no hace nada. La fila
 * propia con `demote` pide confirmación y no manda; las demás mandan
 * `{ membershipId, role }` con `admin` (`promote`) o `member` (`demote`).
 */
export function activate(
  member: TeamMember,
  pending: boolean,
  handlers: RowHandlers,
): void;

/** «Dejar de ser administrador» en la confirmación: manda `member`. Con un pedido en curso, nada. */
export function confirmSelfDemotion(
  member: TeamMember,
  pending: boolean,
  send: RowHandlers["send"],
): void;

/** El último desenlace de la tabla, con el nombre de la fila al hacer clic. */
export type TeamOutcome =
  | { readonly kind: "changed"; readonly name: string; readonly role: ChangeableRole }
  | {
      readonly kind: "failed";
      readonly name: string;
      /** `unexpected` ya está en `ActionErrorCode`. */
      readonly code: TeamErrorCode;
      readonly message: string;
    };

/** El aviso de la tabla (§5.6). */
export type TeamFeedback = {
  readonly tone: "error" | "info";
  readonly title: string;
  readonly message?: string;
  /** Solo con `unexpected`. */
  readonly retry: boolean;
};

/** El aviso de un desenlace, o `null` sin desenlace. */
export function feedbackOf(outcome: TeamOutcome | null): TeamFeedback | null;
```

**La vista (`TeamMembersView`, exportada de `team-members.tsx`, sin hooks)**.
Sus props son exactamente estas:

```ts
type TeamMembersViewProps = {
  readonly members: readonly TeamMember[];
  readonly pending: boolean;
  /** Lo de `feedbackOf`; `null` sin aviso. */
  readonly feedback: TeamFeedback | null;
  /** El clic en el botón de una fila. */
  readonly onActivate: (member: TeamMember) => void;
  /** Siempre el `retry` de `useAction`; se ofrece solo si `feedback.retry`. */
  readonly onRetry: () => void;
};
```

- Una tabla nombrada por el `<h1>` (`aria-labelledby`), con tres columnas:
  «Persona», «Rol» y «Cambiar rol».
- **Cada fila**, con `key` el id de la membresía: un encabezado de fila con el
  nombre, «(vos)» si `isSelf`, y debajo el email en gris; el rótulo del rol; y,
  si `change` no es `null`, el botón.
- **El botón**: texto «Hacer administrador» (`promote`) o «Quitar
  administrador» (`demote`); nombre accesible «{texto}: {nombre}», que contiene
  el texto visible. Su `onClick` llama a `onActivate` con la fila.
- **Con `pending`, todos los botones llevan `aria-disabled="true"`** y ninguno
  `disabled`, que tira el foco a `body`. Que el clic no mande nada lo decide
  `activate` en el modelo.
- **El aviso vive en la tabla, no en la fila**: una fila puede irse con la
  revalidación (`not_found`, `inactive_membership`) y llevarse su aviso. Encima
  de la tabla, un solo `ActionFeedback` con `feedback`:
  - **error**: título «No se pudo cambiar el rol de {nombre}.», el mensaje del
    resultado y «Reintentar» (con `onRetry`) **solo si `feedback.retry`**: la
    vista no vuelve a decidir por el código, así que el test de `feedbackOf`
    protege lo que se dibuja;
  - **éxito**: `tone="info"`, título «Rol de {nombre}: {rol}.».

**El componente (`TeamMembers`, cliente)**: recibe `members` y `changeRole`, no
la vista entera; tiene un solo `useAction` para la tabla, el último
`TeamOutcome` y la fila de la confirmación abierta. Dibuja `TeamMembersView` con
`onActivate = (member) => activate(member, pending, { send: run, confirm })`,
`feedback = feedbackOf(outcome)` y `onRetry = retry`, y el diálogo. **El
foco**: después de un éxito la fila sigue (misma `key`) y el botón cambia su
texto sin perder el foco.

### 5.5 La confirmación de bajarse a sí mismo

Un `Dialog` con `finalFocus` al botón de la fila, como `remove-row-dialog.tsx`,
sin importar nada de `time-entry`:

- título «¿Dejar de ser administrador?»;
- descripción «Vas a dejar de ver las horas de las otras personas en los
  reportes y de administrar el equipo. Para volver, el propietario u otro
  administrador te tiene que cambiar el rol.»;
- «Dejar de ser administrador» (variante destructiva) llama a
  `confirmSelfDemotion`;
- «Cancelar», Esc o un clic afuera cierran sin mandar y el foco vuelve al botón.

Después del éxito, la revalidación del árbol entero dibuja la vista sin permiso
(`reason: "role"`) y saca «Equipo» de la navegación de quien se bajó: la
confirmación ya dijo qué pasaba.

### 5.6 Textos (`team/components/labels.ts`)

| Clave               | Texto                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `heading`           | «Equipo»                                                                                                                                                                                    |
| `intro`             | «Un administrador ve las horas de todas las personas en los reportes y cambia roles. El rol del propietario no se cambia.»                                                                  |
| `forbiddenRole`     | «No tenés permiso para administrar el equipo.»                                                                                                                                              |
| `forbiddenBody`     | «No podés administrar el equipo.»                                                                                                                                                           |
| `loadFailed`        | «No se pudo cargar el equipo.»                                                                                                                                                              |
| `personColumn`      | «Persona»                                                                                                                                                                                   |
| `roleColumn`        | «Rol»                                                                                                                                                                                       |
| `changeColumn`      | «Cambiar rol»                                                                                                                                                                               |
| `self`              | «(vos)»                                                                                                                                                                                     |
| `promote`           | «Hacer administrador»                                                                                                                                                                       |
| `demote`            | «Quitar administrador»                                                                                                                                                                      |
| `actionName`        | `(acción, nombre) =>` «{acción}: {nombre}»                                                                                                                                                  |
| `changeFailed`      | `(nombre) =>` «No se pudo cambiar el rol de {nombre}.»                                                                                                                                      |
| `changed`           | `(nombre, rol) =>` «Rol de {nombre}: {rol}.»                                                                                                                                                |
| `selfDemoteTitle`   | «¿Dejar de ser administrador?»                                                                                                                                                              |
| `selfDemoteBody`    | «Vas a dejar de ver las horas de las otras personas en los reportes y de administrar el equipo. Para volver, el propietario u otro administrador te tiene que cambiar el rol.»              |
| `selfDemoteConfirm` | «Dejar de ser administrador»                                                                                                                                                                |
| `cancel`            | «Cancelar»                                                                                                                                                                                  |
| `roles`             | `owner` «Propietario», `admin` «Administrador», `project_manager` «Responsable de proyectos», `team_manager` «Responsable de equipo», `member` «Miembro» (`satisfies Record<Role, string>`) |

La entrada de la navegación, «Equipo», va en `app-nav.tsx` con las demás.

## 6. Reparto de archivos

Rutas relativas a la raíz del worktree de R8, que crea el team-lead;
**(nuevo)** marca lo que el slice crea.

### backend-dev

```
src/modules/team/schema.ts                         (nuevo)
src/modules/team/schema.test.ts                    (nuevo)
src/modules/team/repository.ts                     (nuevo)
src/modules/team/service.ts                        (nuevo)
src/modules/team/service.integration.test.ts       (nuevo)
src/modules/team/actions.ts                        (nuevo)
src/modules/team/actions.integration.test.ts       (nuevo)
```

### frontend-dev

```
src/modules/team/components/labels.ts                   (nuevo)
src/modules/team/components/team-screen.tsx             (nuevo)
src/modules/team/components/team-screen.test.tsx        (nuevo)
src/modules/team/components/team-members-model.ts       (nuevo)
src/modules/team/components/team-members-model.test.ts  (nuevo)
src/modules/team/components/team-members.tsx            (nuevo)
src/modules/team/components/team-members.test.tsx       (nuevo)
src/app/(app)/equipo/page.tsx                           (nuevo)
src/app/(app)/equipo/error.tsx                          (nuevo)
src/app/(app)/layout.tsx
src/components/layout/app-nav.tsx
src/components/layout/app-nav.test.tsx                  (nuevo)
```

El diálogo puede ir en su propio archivo de `team/components/`; los nombres de
los componentes son orientativos salvo los que citan los tests (el modelo y
`TeamMembersView`, con sus props de §5.4).

**Reuso recomendado**: para «las filas en el orden recibido» del criterio 17,
`team-screen.test.tsx` lee las celdas con `bodyRows` de `src/test/markup.ts:7-14`
(importarlo no es editar `src/test/`).

### test-engineer

```
src/server/permissions/permissions.test.ts
src/modules/team/concurrency.integration.test.ts   (nuevo)
```

Escribe los criterios 2, 11, 12 y 13 contra las firmas publicadas, sin mirar la
implementación de `lockForRoleChange`, y corre las tablas de mutantes de §7.1
en una copia propia.

**Para `backend-dev` y `test-engineer`**: `seedMember` devuelve el `userId`, no
el id de la membresía (`src/test/factories.ts:61-74`); su cuarto parámetro,
opcional, es el id del usuario. El id de la membresía, que es lo que recibe
`changeRole`, lo busca cada test con un `select` en su propio archivo:
`src/test/` no está en el reparto.

### e2e-tester

```
e2e/team.spec.ts                                   (nuevo)
e2e/team-page.ts                                   (nuevo)
e2e/database.ts
```

- `team-page.ts`: `TEAM_PATH`, los textos de §5.6 que afirman los recorridos,
  `teamNavLink(page)`, `memberRow(page, nombre)` (la fila cuyo encabezado de
  fila empieza con el nombre), `roleCell(row)`, `roleButton(page, acción,
nombre)` por su nombre accesible, `selfDemoteDialog(page)` y
  `teamFeedback(page)`.
- **De `e2e/database.ts` cambia solo el comentario de `setRole`** (`:456`), que
  dice «La fase 1 no tiene pantalla para eso (R8).»; por ejemplo, «La pantalla
  /equipo (R8) solo pasa entre member y admin; esto prepara el estado del
  test». Las funciones alcanzan: `seedPerson`, `setRole` y `setDisplayName`. De
  `e2e/reports-page.ts` solo importa `REPORTS_PATH`, `SCOPE_SELF`,
  `SCOPE_EVERYONE` y `goToReportsByNav`, sin editarlo. De `e2e/network.ts`, sin
  editarlo, `holdActionResponses`, `recordActions` y `openSecondTab`.
- **Reuso recomendado**: `openSecondTab(browser, email, path)`
  (`e2e/network.ts:60-70`) para el segundo contexto de P, y `goToReportsByNav`
  (`e2e/reports-page.ts:505-509`) para «P, sin recargar, navega a Reportes»:
  espera la tabla, que está aunque el reporte esté vacío (un member sin horas,
  `e2e/reports.spec.ts:272`, `:285`).
- **Un clic sobre un botón con `aria-disabled="true"`** lleva
  `{ force: true }`: Playwright 1.63 lo trata como no habilitado y, sin
  `force`, espera hasta el tope en vez de hacer clic. Precedente:
  `e2e/manual-entry.spec.ts:236`.

### parity-analyst

```
docs/parity/reportes.md
```

No escribe: manda el texto con su lugar exacto y lo aplica el team-lead, antes
del merge:

- **RP-02** (`reportes.md:345-356`): corrección fechada: desde R8, owner y
  admin ven el reporte de equipo, y un admin se nombra en `/equipo`. Cubre
  también «Hasta R8 el único que lo ve es el owner…» (`:355-356`).
- **§9.5** (`:2344`): corrección fechada de «Hasta R8, solo el owner ve el
  reporte de equipo (RP-02).».
- **Sección «18. Núcleo, R8»** al final, después de «17. Núcleo, R7»
  (`:3656`), que R7b amplía: la pantalla, quién la ve, las reglas (D-R8-3 a
  D-R8-6), el efecto en una sesión abierta (D-R8-8) y las divergencias
  visibles: un member no ve `/equipo` (en Clockify ve la página de equipo salvo
  que se la escondan, RP-08); un solo rol por persona.
- **§7, un punto P-12 nuevo** con lo _no verificado_ de §9, para la sesión del
  usuario en Clockify. P-12 está libre: P-11 es el último (`:2236`).

### Lo que no toca nadie

`src/server/permissions/index.ts`, `src/server/db/`, `drizzle/`,
`src/server/session.ts`, `src/server/action.ts`, `src/server/audit.ts`,
`src/modules/workspace/`, `src/modules/profile/`, `src/modules/report/`,
`src/modules/time-entry/`, `src/modules/project/`, `src/test/`,
`e2e/reports-page.ts`, `e2e/reports.spec.ts`, `e2e/network.ts`, los ADR. El
mapa y el estado los actualiza el team-lead.

### 6.6 Coordinación con R7b

R8 se implementa en un worktree propio, en paralelo a R7b, el gráfico en el PDF
del reporte. Los archivos que pueden cruzarse, contra el reparto de R7b en el
[contrato de R7](nucleo-reportes-r7-exportar-pdf.md), §7, «R7b» y «Lo que no
toca nadie» (`:1050-1069`):

| Archivo                                             | R8                                           | R7b                                                                   | Riesgo                                                   |
| --------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/app/(app)/layout.tsx`, `app-nav.tsx`           | edita                                        | no los toca: excluye `src/components/` y «el resto de `src/app/`»     | ninguno                                                  |
| `src/server/permissions/permissions.test.ts`        | suma casos                                   | no toca `src/server/`                                                 | ninguno                                                  |
| `e2e/database.ts`                                   | el comentario de `setRole`                   | no lo toca                                                            | ninguno                                                  |
| `e2e/reports.spec.ts`, `src/modules/report/export/` | no los toca                                  | el recorrido 29; `types.ts`, `document.ts`, `pdf.ts`, `pdf-layout.ts` | sin cruce                                                |
| `e2e/reports-page.ts`                               | importa tres constantes y `goToReportsByNav` | puede sumar ayudantes para el recorrido 29                            | bajo: el segundo merge rebasa                            |
| `docs/parity/reportes.md`                           | RP-02, §9.5, §18 nueva, P-12                 | RP-53 y la §17                                                        | **conflicto de texto**; lo aplica el team-lead, de a uno |

- **El que mergea segundo rebasa.** R4 ya está en `main`: `listWorkspacePeople`
  existe y D-R8-1 dice por qué R8 no la extiende; dónde vive la lectura de la
  fase 2 queda abierto (§9, punto 4).
- **Los e2e de los dos worktrees no comparten servidor.** Con el `webServer`
  por omisión, los dos usan `http://localhost:3000` (`playwright.config.ts:16`)
  y, fuera de CI, `reuseExistingServer` es `true` (`:62-71`): un worktree puede
  correr la suite contra el servidor del otro sin darse cuenta. Cada uno
  compila y levanta el suyo con `next start -p <puerto>`, con el entorno de
  `localServerEnv` (`playwright.config.ts:23-37`) y `BETTER_AUTH_URL` en ese
  puerto, y corre la suite con `E2E_BASE_URL` apuntando ahí, el mismo
  `E2E_TEST_SESSION_SECRET` que el servidor (`e2e/environment.ts:22-40`) y
  `E2E_DATABASE_URL` con su base de e2e (`:60-71`). Es la regla de un servidor
  por directorio, con su puerto (`estado-fase1.md:485-487`).
- **Lint desde cada árbol.** Si el worktree vive dentro del árbol principal
  (`.claude/worktrees/`), `npm run lint` del árbol principal lo recorre: los
  `ignores` de `eslint.config.mjs:105-112` no lo excluyen (deuda anotada en
  `estado-fase1.md:334-335`).

### Orden

Lecciones del pipeline: **cada agente con su base de test propia**, creada y
migrada por el team-lead antes de lanzarlo, y borrada al terminar; **la base de
e2e creada y migrada antes de lanzar a `e2e-tester`**; corridas en primer plano;
Postgres 18, local y de Neon.

1. **Primer commit de `backend-dev`**: `schema.ts` con su forma final y
   `schema.test.ts`; `repository.ts` y `service.ts` con las firmas de §4 y
   cuerpos que lanzan, salvo `canManageTeam`, que ya decide; `actions.ts`
   completa. **Avisa a `frontend-dev`, `test-engineer` y `e2e-tester`**: desde
   acá las formas son las finales.
2. **Los otros tres arrancan con el paso 1.** `frontend-dev`: la pantalla, el
   modelo, la navegación y sus tests, con vistas armadas a mano y validadas con
   `teamView.parse`. `test-engineer`: el criterio 2 se commitea ya (`can()` no
   cambia, pasa desde el principio); los criterios 11 a 13 se escriben y se
   commitean después del paso 3. `e2e-tester`: el spec, y confirma que falla
   por la funcionalidad (la ruta o el control que faltan), no por el arnés.
3. **`backend-dev`**: el repository y el service; los criterios 1, 3 a 10 y 14
   a 16.
4. **`test-engineer`**, con el paso 3 en la rama: los criterios 11 a 13 y los
   mutantes de §7.1.
5. **Cierre**: las seis revisiones; en la de seguridad, que la entrada de la
   navegación, la vista y la mutación preguntan `can()` y nada más; que el
   workspace sale siempre de la sesión; que un member con un pedido armado a
   mano (otro id, otro workspace, `role: "owner"`) no cambia nada y no abre la
   transacción; que la autoridad se lee bajo el bloqueo; que la lista no se lee
   sin `team.manage`. El texto de `parity-analyst`, antes del merge.

## 7. Criterios de aceptación

1. **Los esquemas** (unidad) — `changeRoleInput` pasa con `member` y con
   `admin` y un uuid; con `owner`, `project_manager`, `team_manager`, `Admin`,
   vacío o sin `role` falla con `roleUnavailable`; con un id que no es uuid o
   sin id, con `notFound`. `teamView` admite las dos formas, admite los cinco
   roles en una fila y rechaza un `change` fuera de `promote`, `demote` y
   `null`.
2. **`team.manage` sobre una membresía** (unidad, `permissions.test.ts`) — la
   tabla de §3 entera: owner sobre `member`, `admin` y la del owner; admin sobre
   `member`, `admin` (también con su propio `userId`) y no sobre la del owner;
   `project_manager`, `team_manager` y `member` sobre ninguna; owner y admin
   `inactive` o `invited` sobre ninguna; ninguna de otro workspace.
3. **Ascender y bajar** (integración) — el owner pasa a M de `member` a `admin`:
   la fila tiene `admin`, su `updated_at` avanzó, el resultado es
   `{ membershipId, role: "admin" }` y hay una fila de `audit_log` con el
   workspace, el owner como actor, `membership.changeRole`, `membership`, el id
   de la membresía, `{"role":"member"}` y `{"role":"admin"}`. Un admin pasa a
   otro admin a `member`, con su fila y el admin como actor.
4. **Sin efecto** (integración) — pedir el rol que ya tiene responde éxito, no
   cambia `updated_at` y no deja fila de auditoría, para `member` y para
   `admin`.
5. **El owner** (integración) — el owner sobre la suya, con `member` y con
   `admin`: `role_locked` con `ownerLocked`, la fila igual y sin auditoría. Un
   admin sobre la del owner: `forbidden`.
6. **Los otros roles** (integración) — el owner sobre una `project_manager` y
   una `team_manager`, con los dos roles: `role_locked` con `roleLocked`, sin
   cambios.
7. **Inactivas e invitadas** (integración) — el owner sobre una `inactive` y una
   `invited`, `member` y `admin`: `inactive_membership`, sin cambios ni
   auditoría.
8. **Ajenas e inexistentes** (integración) — un uuid que no existe y el id de
   una membresía `member` del workspace B pedidos por el owner de A:
   `not_found` los dos; la de B sigue `member` y no hay auditoría en ninguno de
   los dos workspaces.
9. **Sin permiso** (integración) — `member`, `project_manager` y `team_manager`
   activos, y un admin `inactive` o `invited`: `forbidden`, sin llamar a
   `db.transaction` (espía) y sin cambios.
10. **La autoridad fresca** (integración) — un `Actor` armado a mano con `admin`
    y `active` para una persona cuya fila dice `member`: `forbidden`; lo mismo
    si la fila dice `admin` e `inactive`. En los dos casos la membresía pedida
    no cambia.
11. **Dos admins que se bajan uno al otro** (concurrencia) — A y B admins; con
    una barrera que sostiene `for no key update` sobre las dos filas, A pide
    bajar a B y B pide bajar a A, los dos trabados antes de soltarla
    (`raceThroughBarrier`): exactamente uno responde éxito y el otro
    `forbidden`; quedan un admin y un member, y una sola fila de auditoría.
12. **Dos cambios de la misma membresía** (concurrencia) — M `member`; en fila
    detrás de una barrera sobre M (`queueBehindBarrier`), primero el owner la
    pasa a `admin` y después un admin la pasa a `member`: los dos responden
    éxito, M queda `member` y hay dos filas de auditoría, la segunda con
    `{"role":"admin"}` como valor anterior.
13. **El bloqueo no espera a las horas** (concurrencia) — con otra transacción
    abierta que insertó una entrada de M (y sostiene `for key share` sobre su
    membresía), el cambio de rol de M termina sin trabarse; la espera se mide
    con `waitForBlockedBackends` contra la respuesta, como `outcomeWhileLocked`,
    sin esperas fijas.
14. **La lista** (integración) — workspace A con el owner O, el admin D, M con
    nombre editado, N sin nombre editado, una `project_manager`, una
    `team_manager`, una `inactive` y una `invited`, y el workspace B con un
    member. Para O: `ready` con O, D, M, N y las dos de rol bloqueado, ni la
    inactiva, ni la invitada, ni la de B; M con su nombre editado y N con el de
    Google; los emails; el orden de `compareNames`; `isSelf` solo en O;
    `change` `null` en O y en las dos de rol bloqueado, `demote` en D y
    `promote` en M y N. Para D: `isSelf` en D con `demote`. Para un member:
    `forbidden` con `role`, y para un admin `inactive`, con `inactive`, los dos
    sin llamar a `listActiveMembers` (espía).
15. **Las actions** (integración) — `changeRole` traduce a `ActionResult` el
    éxito, `forbidden`, `not_found`, `role_locked`, `inactive_membership` y
    `validation` con sus textos; revalida `{ path: "/", type: "layout" }` en el
    éxito y en el error; sin sesión, redirige a `/login` sin cambiar nada.
16. **La sesión siguiente** (integración) — con **un solo workspace sembrado**,
    como `signInAs` (`project/actions.integration.test.ts:76-90`), porque
    `ensureWorkspaceContext` toma el workspace más viejo: M `member`.
    `ensureWorkspaceContext` de M antes de cambiar: `member` y sin
    `timeEntry.others.view`. El owner la pasa a `admin`; otra vez: `admin` y
    con el permiso. El owner la baja; otra vez: `member` y sin él.
17. **La pantalla** (unidad) —
    - `team-screen.test.tsx`: `forbidden` con `role` dibuja el título y
      `forbiddenRole`, sin tabla; con `inactive`, el aviso común con
      `forbiddenBody`; `ready`, la tabla nombrada por el título con las filas en
      el orden recibido, «(vos)», el email, el rótulo de cada rol, y el botón
      solo con `change`, con su texto y su nombre accesible; ningún botón en la
      fila del owner.
    - `team-members-model.test.ts`, con `send` y `confirm` simulados
      (`vi.fn()`): `activate` en una fila `promote` llama a `send` con
      `{ membershipId, role: "admin" }` y en una `demote` ajena con `member`,
      sin llamar a `confirm`; en la fila propia con `demote` llama a `confirm`
      con esa fila y no a `send`; **con `pending`, ninguna fila llama a nada**
      (el segundo clic). `confirmSelfDemotion` llama a `send` con
      `{ membershipId, role: "member" }`, y con `pending` no llama. `feedbackOf`:
      `null` sin desenlace; una falla da `tone: "error"`, el título
      `changeFailed(nombre)`, el mensaje y `retry` solo con `unexpected` (no con
      `forbidden`, `not_found`, `role_locked` ni `inactive_membership`); un
      cambio da `tone: "info"` y el título `changed(nombre, rótulo del rol)`.
    - `team-members.test.tsx`, sobre `TeamMembersView` con sus props de §5.4:
      sin `pending` ni `feedback`, ningún botón con `aria-disabled` y ningún
      aviso; **con `pending`, todos los botones con `aria-disabled="true"` y
      ninguno con `disabled`**; con un `feedback` de error, `role="alert"`, el
      título, el mensaje y «Reintentar» solo si `feedback.retry`; con uno de
      éxito, `role="status"` y sin «Reintentar».
    - `app-nav.test.tsx`: «Equipo» solo con `showTeam`.

    «Cancelar» en el diálogo, el foco y el cableado de `TeamMembers` son de los
    recorridos 1 y 2 de §7.2.

18. **De punta a punta** — los recorridos de §7.2.
19. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`,
    `next build` y la suite e2e entera.

### 7.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo         | Archivo                                | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------- | ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad       | `team/schema.test.ts`                  | `role` como `z.string()`; `owner` en `CHANGEABLE_ROLES`; `membershipId` como texto libre. **Cae en typecheck**: un rol de menos en `ROLE_VALUES`                                                                                                                                                                                                                                                                                                                                          |
| 2        | unidad       | `permissions.test.ts`                  | la regla del owner quitada; `project_manager` en `team.manage`; el corte por estado quitado                                                                                                                                                                                                                                                                                                                                                                                               |
| 3        | integración  | `team/service.integration.test.ts`     | sin `recordAudit`; anterior y siguiente invertidos; `entityId` con el `userId`; el actor de la auditoría con la persona cambiada                                                                                                                                                                                                                                                                                                                                                          |
| 4        | integración  | ídem                                   | escribir y auditar siempre, también sin cambio                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 5        | integración  | ídem                                   | la regla del owner quitada (el workspace queda sin owner); la regla del owner antes de `can()` (el admin recibe `role_locked`)                                                                                                                                                                                                                                                                                                                                                            |
| 6        | integración  | ídem                                   | solo la regla del owner, sin la de los otros roles                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 7        | integración  | ídem                                   | la regla del estado quitada                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 8        | integración  | ídem                                   | `lockForRoleChange` sin `workspace_id` (la de B se encuentra y responde `forbidden`, no `not_found`)                                                                                                                                                                                                                                                                                                                                                                                      |
| 9        | integración  | ídem                                   | la puerta de antes de la transacción quitada (abre la transacción); `team.manage` cambiado por `team.view`                                                                                                                                                                                                                                                                                                                                                                                |
| 10       | integración  | ídem                                   | `can()` dentro de la transacción con el actor de la sesión                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 11       | concurrencia | `team/concurrency.integration.test.ts` | bloquear solo la membresía pedida; leer la de quien actúa sin bloqueo; dos sentencias en el orden pedido (`40P01`, sale `unexpected`)                                                                                                                                                                                                                                                                                                                                                     |
| 12       | concurrencia | ídem                                   | `lockForRoleChange` sin bloqueo: no se traba en la barrera y la segunda vuelve sin escribir; cae por `finishedEarly` (`src/test/concurrency.ts:111-115`)                                                                                                                                                                                                                                                                                                                                  |
| 13       | concurrencia | ídem                                   | `for update` en lugar de `for no key update` (queda trabado)                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 14       | integración  | `team/service.integration.test.ts`     | sin `status = 'active'` (aparecen la inactiva y la invitada); sin `workspace_id` (aparece la de B); `user_preference` con `inner join` (se pierde N); `change` en el owner; la lista leída sin `team.manage`                                                                                                                                                                                                                                                                              |
| 15       | integración  | `team/actions.integration.test.ts`     | `paths` solo con `/equipo`; el parseo de la entrada después del service                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 16       | integración  | `team/service.integration.test.ts`     | un caché de la membresía fuera del pedido                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17       | componente   | los cuatro de §6 con tests de unidad   | el botón en la fila del owner; el nombre accesible sin la persona; **con `pending`, `disabled` en vez de `aria-disabled`** (cae en la vista con `pending`, no en la primera pintura); `activate` que manda con un pedido en curso; la fila propia que manda sin confirmar; confirmar con `admin`; `promote` con `member`; «Reintentar» con cualquier código; la vista que dibuja «Reintentar» sin mirar `feedback.retry`; el éxito con `tone` de error; «Equipo» siempre en la navegación |
| 18       | e2e          | `e2e/team.spec.ts`                     | los del final de §7.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 19       | todas        | las suites existentes                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Mutante declarado equivalente:** `change` armado también con `can()` por fila
(D-R8-3), o sin él. Antes de darlo por equivalente, `test-engineer` corre el
criterio 14 con los dos, con un actor admin, owner, de otro workspace e
inactivo, y anota que las vistas son iguales.

### 7.2 Recorridos de `e2e/team.spec.ts`

Dueño: `e2e-tester`. Con la regla de D-R8-11: U es la persona de la sesión del
test, con `setDisplayName` y un nombre único; P, la persona sembrada con
`seedPerson`, también con nombre único y email `…@${TEST_EMAIL_DOMAIN}`. Antes
de `setRole`, U entra a una pantalla, que le crea la membresía; después, una
carga completa, porque la navegación es del layout (D-R8-8).

1. **Un admin asciende y baja a otra persona, y la sesión abierta de esa persona
   sigue el rol** (D-R8-3, D-R8-8). U `admin`; P sembrada. En un segundo
   contexto, P entra y abre `/reportes`: `SCOPE_SELF` y la navegación sin
   «Equipo». U entra a «Equipo» por la navegación: la fila de P dice
   «Miembro» y tiene «Hacer administrador: P». **Con la respuesta retenida**
   (`holdActionResponses`) y los pedidos contados (`recordActions`): clic en
   «Hacer administrador: P»; mientras no vuelve, «Hacer administrador: P»
   sigue en pantalla con `aria-disabled="true"` (y también el botón de la fila
   de U), y **un segundo clic en «Hacer administrador: P»**, con
   `{ force: true }` (§6, `e2e-tester`), deja un solo pedido. No se prueba con
   el botón de U: su fila propia abre la confirmación y nunca llama a `send`.
   Al soltar la respuesta: el aviso «Rol de P: Administrador.», la fila dice
   «Administrador», el botón dice «Quitar administrador: P» y tiene el foco. U
   recarga: lo mismo. P recarga `/reportes`: `SCOPE_EVERYONE` y «Equipo» en la
   navegación; P abre `/equipo` y ve la lista. U baja a P: la fila dice
   «Miembro». **P, sin recargar, navega a «Reportes» por la navegación**:
   `SCOPE_SELF`. P abre `/equipo` por la URL: el título y «No tenés permiso
   para administrar el equipo.», sin tabla.
2. **Un admin se baja a sí mismo, con confirmación** (D-R8-5). U `admin`, en
   `/equipo`, con los pedidos contados: su fila dice «(vos)». «Quitar
   administrador: U» abre «¿Dejar de ser administrador?» y no hay pedido.
   «Cancelar»: el diálogo se cierra, el foco vuelve al botón, la fila sigue
   «Administrador» y sigue sin pedido. Otra vez, y «Dejar de ser
   administrador»: un pedido; la pantalla muestra «No tenés permiso para
   administrar el equipo.» y **la navegación ya no tiene «Equipo», sin
   recargar**, porque la action revalida (D-R8-8). Después, en `/reportes`,
   `SCOPE_SELF`; al recargar, la navegación sigue sin «Equipo».
3. **Un member no ve el equipo** (D-R8-2). U `member`: la navegación no tiene
   «Equipo»; `/equipo` por la URL muestra el título y `forbiddenRole`, sin
   tabla.

Los mutantes que tienen que caer en e2e: la entrada «Equipo» para todos; el
botón que no cambia de texto; el foco que se pierde después del clic; un
segundo pedido con el primero en curso; una lectura de rol cacheada entre
pedidos (el paso de P sin recargar del recorrido 1); bajarse sin confirmación;
«Cancelar» que manda el pedido. Una action que revalidara solo `/equipo` no
cae acá —en Next 16.3.8 toda action que revalida redibuja desde la raíz—: la
mata el criterio 15.

### 7.3 Lo que no se prueba en e2e

- **El owner**: es la cuenta común de la suite y su email no está en el arnés;
  criterios 5 y 14.
- **Inactivas, invitadas, ajenas y los roles bloqueados**: criterios 6 a 8 y 14.
- **La concurrencia y el bloqueo**: criterios 11 a 13.
- **La auditoría**: criterio 3.
- **Los avisos de error por código**: criterios 15 y 17.
- **«Atrás» después de perder el rol** (D-R8-8): es el caché del navegador, no
  una lectura.
- **La descarga de un admin bajado** (D-R8-8): la cubren los criterios de R6,
  porque la exportación y la página comparten `readReportState`.

## 8. Riesgos y deuda conocida

- **Lo ya dibujado no se borra** (D-R8-8): un admin bajado conserva en pantalla
  lo que ya leyó, también con «Atrás», hasta el próximo pedido. Cortar eso
  necesitaría empujar algo al navegador, y el servidor no guarda estado.
- **La entrada «Equipo» cambia en la próxima carga completa o en la próxima
  server action que revalide** de la persona cuyo rol cambió (D-R8-8). Una
  entrada vieja lleva a la vista sin permiso, que no lee nada.
- **Sin piso de admins.** Con el owner inactivo por SQL y el último admin
  bajado, nadie administra el equipo y la salida es SQL. El procedimiento de
  desactivar del mapa no toca al owner.
- **El rol de una membresía inactiva queda como estaba**: un admin desactivado
  por SQL sigue con `admin`, sin efecto (`can()` corta por estado). Al
  reactivar, en la fase 2, vuelve admin; esa pantalla decide si lo baja.
- **Dos lecturas de personas en dos módulos** (D-R8-1): `team.listActiveMembers`
  y `workspace.listWorkspacePeople` (`workspace/service.ts:105-124`). Comparten
  los dos nombres por `join` y nada más; dónde vive la de la fase 2 queda
  abierto (§9, punto 4).
- **La lista no tiene tope ni búsqueda.** Lo acota el tamaño de la empresa: el
  login está restringido al dominio. En la base de e2e, una corrida deja
  cientos de filas; los recorridos buscan por nombre. La fase 2 suma búsqueda
  si hace falta.
- **La deuda de `ensureWorkspaceContext`** (mapa §6) sigue: cualquiera del
  dominio que entra queda `member`. R8 no la agrava: solo cambia el rol de
  membresías que existen y nunca crea una.
- **Después de bajarse a sí mismo el foco cae a `body`**: la pantalla pasa a la
  vista sin permiso y el botón ya no existe. La confirmación lo anticipa.
- **Un solo pedido a la vez en la tabla**: mientras uno está en curso, los demás
  botones esperan. Es una pantalla de uso esporádico.
- **El cableado de `TeamMembers` solo tiene e2e**: el arnés de unidad no tiene
  DOM; lo que decide el clic y el aviso está en el modelo, con unidad.
- **Los rótulos de `project_manager` y `team_manager`** aparecen solo si alguien
  los puso por SQL; «Responsable de proyectos» no es la marca de responsable de
  un proyecto (PR-19).

## 9. Pendiente del usuario y preguntas abiertas

1. **ADR para el módulo `team`: decidido, no hay** (team-lead, 2026-10-09).
   D-R8-1 reparte `membership` entre dos módulos —`workspace` la crea y `team`
   la administra— y lo resuelve con el ADR 0010.
2. **Clockify, para la sesión de relevamiento del usuario** (P-12 nuevo de
   `reportes.md`). Lo que se sabe, ya documentado: «Only Workspace admins and
   owners can deactivate a user.» (RP-60); «Workspace owner and admins can see
   everything (time and financials).» (RP-02); los members ven la página de
   equipo salvo que se la escondan (RP-08); el primer día de la semana lo edita
   un admin desde el perfil de la persona en la pantalla de equipo (PF-01). Lo
   _no verificado_, que no se pudo relevar sin acceso al workspace:
   - si un admin puede dar el rol de admin o solo el owner;
   - si un admin puede quitarse el rol a sí mismo, y si pide confirmación;
   - si el rol del owner se cambia solo transfiriendo el workspace;
   - cómo muestra los roles la página de equipo (columna, «Edit roles», si los
     roles se combinan —admin y responsable de proyecto a la vez—: Clock tiene
     un solo rol por membresía);
   - si se puede cambiar el rol de una persona inactiva o invitada;
   - si el cambio vale en una sesión abierta sin volver a entrar;
   - los nombres de los roles en la interfaz en español.

   Queda lo de este contrato hasta entonces. No bloquea.

3. **Nota para el usuario, no es pregunta: un member no ve `/equipo`.** En
   Clockify un member ve la página de equipo por omisión (RP-08). R8 no la
   abre porque solo trae el control de rol; qué ve un member es de la pantalla
   de equipo de la fase 2 (`team.view`).
4. **Para la fase 2, sin decidir acá**: cuando la pantalla de equipo use
   `team.view`, ¿`listWorkspacePeople` sigue en `workspace` como catálogo del
   reporte o se muda a `team`, junto a `listActiveMembers`? Lo decide el
   contrato de esa pantalla. No bloquea R8.

## 10. Fuera de alcance

- Invitar, desactivar, reactivar y quitar personas (RP-60, RP-63, fase 2).
- Los roles `project_manager` y `team_manager` como opción, y transferir el
  workspace (`workspace.transfer`).
- La lista para un member (`team.view`), con o sin emails.
- Las personas inactivas e invitadas en la lista.
- El primer día de la semana (PF-01), la capacidad y los días laborables.
- Búsqueda, orden por columnas y paginación de la lista.
- Cerrar las sesiones de quien pierde el rol.
- Un registro de auditoría visible en pantalla.
