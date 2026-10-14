# Núcleo de reportes, R8: cambiar el rol entre member y admin

Contrato del slice R8 del núcleo de reportes. Trae una pantalla mínima,
`/equipo`, donde el owner y los admins pasan una membresía activa de `member` a
`admin`, y solo el owner la pasa de `admin` a `member`, con `team.manage` y
`team.admin.revoke` sobre el `MembershipResource` que ya existe y una fila de
`audit_log` por cambio. Sin cambios de tablas ni de índices; una acción de
permiso nueva (D-R8-13). _Corrección del 2026-10-13_: decía que el owner y los
admins pasaban la membresía de un rol al otro y en los dos sentidos, sin
cambios de permisos.

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
  **Corrección del 2026-10-13**, por decisión del usuario y con la rama ya
  implementada hasta `7f81486`, `f641c85` y `0d48375`: replicar Clockify, solo
  el owner quita el rol de admin. Cambian D-R8-3, D-R8-5, D-R8-7, D-R8-8 y
  D-R8-11; entra D-R8-13. Con ellas cambian §1, §3, §4, §5, los criterios 2 a 5,
  11, 12, 14, 15 y 17, §7.1 (con la nota B2 de la revisión de backend), los
  recorridos de §7.2, §7.3, §8 y §9. La misma corrección suma tres puntos de
  las revisiones de la rama: el tope de membresías activas de la base de e2e
  (revisión de tests; §6 y §8), el aviso de `unexpected` sin el texto repetido
  (revisión de paridad; §5.4 y §5.6) y los homónimos con el mismo nombre
  accesible, como deuda (revisión de paridad; §8). También deja en §4.2 y §4.3
  el `workspaceId` de la membresía bloqueada, que la rama ya tiene desde
  `0d48375` (B1 de la revisión de backend). El reparto de esa ronda está en §6,
  en «Ronda de la corrección del 2026-10-13». La revisión de la corrección
  (`1379b29`) la aprobó con retoques, ya aplicados: el reintento de un admin
  con `member` (criterio 4), el foco sin suponer el orden de la respuesta y la
  revalidación (§5.4), los ayudantes de `src/test/` (§6), la coordinación con
  R7b ya mergeada, con `main` mergeado en la rama en `ed87784` (§6.6), el
  procedimiento para seguir en una base de e2e nueva (§6), el ADR como pregunta
  para el usuario (§9) y retoques de texto en D-R8-13 y §7. Después el usuario
  decidió abrir el
  [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md) para
  D-R8-13 (§9, punto 5).
- **Decisiones de arquitectura asociadas**, aceptadas salvo la 0023, que está
  propuesta:
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
  - [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
    **propuesto** (lo aprueba el usuario): quitar el rol de admin es una acción
    propia, `team.admin.revoke`, solo del owner y consultada solo sobre una
    membresía `admin` (D-R8-5, D-R8-13).

  **Este contrato abre el ADR 0023 y no contradice ninguno aceptado.** La
  elección de mayor alcance de la primera versión, el módulo nuevo (D-R8-1), la
  impone el ADR 0010; el team-lead decidió no llevarla a un ADR propio (§9,
  punto 1). La acción nueva de D-R8-13 va al ADR 0023, por decisión del usuario
  (§9, punto 5). _Corrección del 2026-10-13_: decía «Este contrato no abre
  ningún ADR», y que la acción nueva solo sumaba una fila a las tablas de
  `can()`.

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
- **El control** está en las filas con rol `member` («Hacer administrador») y,
  solo si quien mira es el owner, en las de rol `admin` («Quitar
  administrador»). No tienen control la del owner, las de `project_manager` y
  `team_manager` (D-R8-4) y, para un admin, las de rol `admin`, también la suya
  (D-R8-5). _Corrección del 2026-10-13_: un admin tenía «Quitar administrador»
  en todas las filas de admin.
- **`change` se arma con `can()` por fila**: `team.manage` sobre la membresía
  para `promote` y `team.admin.revoke` para `demote` (D-R8-13). La mutación lo
  vuelve a consultar sobre la fila leída (D-R8-7). _Corrección del
  2026-10-13_: no se llamaba a `can()` por fila, porque sobre una membresía
  `member` o `admin` decidía igual para el owner y para un admin; con
  D-R8-5 ya no decide igual.

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

**D-R8-5 — Solo el owner quita el rol de admin; no hay mínimo de admins.**
_Corrección del 2026-10-13, decisión del usuario: replicar Clockify._

- **Ascienden el owner y los admins; a un admin lo baja solo el owner**,
  también cuando el admin pide bajarse a sí mismo. Clockify, relevado por
  `parity-analyst` el 2026-10-13 con FOUND literal confirmado dos veces: «Only
  the Workspace owner can remove an admin role from someone, transfer ownership
  to another user, and delete the workspace.» (página de invitar personas) y
  «Manage users | Yes (except removing Admin role – Owner only)», con «Assign
  user roles | Yes» para el admin
  (https://clockify.me/help/administration/user-roles-and-permissions/admins).
- **Es una regla de acceso y vive en `can()`**, con la acción `team.admin.revoke`
  (D-R8-13): la vista (`change`, D-R8-3) y la mutación (§4.3) la heredan.
- **Nadie se baja a sí mismo**: un admin, por D-R8-5; el owner, por D-R8-4. Por
  eso no hay confirmación de bajarse a sí mismo (§5.5).
- **El workspace puede quedar sin admins además del owner**: es el estado de
  antes de R8. El piso es el owner. Si la membresía del owner estuviera
  inactiva por SQL, nadie puede bajar a un admin y la salida es SQL (§8).
- _La versión anterior_: «Un admin puede bajarse a sí mismo, con confirmación».
  Un admin bajaba a otro admin y a sí mismo; en su fila propia, «Quitar
  administrador» abría un diálogo que decía qué perdía. Prohibirlo se había
  descartado porque era una regla de acceso nueva para un caso que el owner
  deshacía en un clic, y en Clockify estaba _no verificado_.

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
  cambia: si el owner baja a un admin mientras ese admin asciende a otra
  persona, el ascenso no puede pasar con la autoridad de una sesión que ya la
  perdió. Por eso el service bloquea **en una sola sentencia, ordenada por
  `id`**, la membresía pedida y la de quien actúa, y decide `can()` con el rol
  y el estado recién leídos. Es la regla del ADR 0011 para dos filas: un
  `order by` debajo del bloqueo, nunca dos sentencias en el orden pedido, que
  pueden esperarse en círculo (`40P01`) cuando dos pedidos nombran las mismas
  dos filas al revés, como dos admins que se piden `admin` uno al otro.
  _Corrección del 2026-10-13_: el ejemplo eran dos admins que se bajan uno al
  otro, que con D-R8-5 ya no puede pasar.
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
  de una respuesta perdida llega a lo mismo, también el de un admin que
  ascendió a alguien: pedir `admin` para quien ya es admin no quita el rol, así
  que no consulta `team.admin.revoke` (D-R8-13). No hace falta un id del
  cliente (ADR 0007): no se crean filas.
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
- **Quien actúa** ve su cambio enseguida porque la action revalida: la regla es
  `{ path: "/", type: "layout" }`, como `profile/actions.ts:22`. En Next 16.3.8
  toda server action que revalida redibuja desde la raíz
  (`server-action-reducer.js:296-299`, `action-handler.js:963`).
  _Corrección del 2026-10-13_: el motivo de revalidar el árbol entero era
  bajarse a sí mismo, para que la pantalla y la navegación cambiaran sin
  recargar; con D-R8-5 nadie cambia sus propios permisos desde acá. La regla
  queda como está: no cambia nada observable y el criterio 15 la sigue fijando.
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
que en una corrida tiene cientos de filas. La membresía del owner de la suite
no se toca. Para ver el efecto en la sesión de la otra persona, el recorrido
abre un segundo contexto del navegador y entra con su email (`signIn` acepta
una cuenta que ya existe, `test-session.ts:84-99`). **El email de la persona
sembrada es `…@${TEST_EMAIL_DOMAIN}`**, como en `seedOtherPerson`
(`e2e/reports.spec.ts:177-185`): el hook `session.create` de Better Auth
vuelve a comprobar el dominio en cada inicio de sesión
(`src/server/auth.ts:104-112`), así que con otro dominio el segundo contexto no
entra. _Corrección del 2026-10-13_: como solo el owner baja a un admin, el
recorrido 2 entra con la cuenta del owner, `owner@${TEST_EMAIL_DOMAIN}` (la
misma de `e2e/workspace.setup.ts:19`), en un contexto propio; lee la lista y
cambia la fila de la persona del test, nunca la suya. Antes decía «El owner de
la suite no se toca», y ningún recorrido entraba con su cuenta. También del
2026-10-13: la lista entera crece con cada corrida en una base que se reusa, y
por encima de 1.500 membresías activas el setup corta antes de los recorridos
(§8).

**D-R8-12 — Sin comprobación contra Neon.** La única forma nueva es la cláusula
`for no key update`, SQL fijo sin parámetros: Drizzle 0.45.3 la escribe tal
cual (`drizzle-orm/pg-core/dialect.js:290`). La sentencia lleva tres
parámetros —el workspace (uuid), la membresía (uuid) y el `user_id` de quien
actúa (texto)—, de tipos que ya viajan en producción; el precedente de un
bloqueo con `neon-serverless` es el `for update` de una fila de
`profile/repository.ts:53`. Si `backend-dev` necesita otra forma, avisa y la
comprobación vuelve con el procedimiento de §6.3 de R2b.

**D-R8-13 — Quitar el rol de admin es una acción propia, `team.admin.revoke`,
solo del owner.** _Agregada el 2026-10-13 con la corrección de D-R8-5._ La
registra el
[ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md),
propuesto. Opciones: (1) una regla dentro de `team.manage`: sobre un
`MembershipResource` con rol `admin`, solo el owner; (2) una acción nueva,
`team.admin.revoke`, sobre `MembershipResource`, con `["owner"]` en la tabla de
roles; (3) la regla en el service. **(2).**

- **(3) no**: es una regla de acceso, y ninguna decisión de acceso vive fuera
  de `can()`.
- **(1) decide por el rol que la membresía tiene, no por el cambio pedido.** Un
  admin se quedaría sin `team.manage` sobre cualquier membresía `admin`, y eso
  pega en dos lugares:
  - **la idempotencia de D-R8-7**: el reintento de un ascenso cuya respuesta se
    perdió encuentra a la persona ya `admin` y respondería `forbidden` en vez de
    éxito sin escribir; dos admins que ascienden a la misma persona a la vez,
    igual: el segundo, `forbidden`;
  - **la fase 2**: `team.manage` sobre la membresía de un admin le cerraría a
    otro admin todo lo demás de esa persona (desactivarla, su primer día de la
    semana, su capacidad), y Clockify solo exceptúa quitar el rol: «Manage
    users | Yes (except removing Admin role – Owner only)».
- **(2) nombra la excepción exacta.** El service consulta `team.admin.revoke`
  solo cuando el pedido quita el rol —la membresía es `admin` y se pide
  `member`—, además de `team.manage`; la vista, para dibujar `demote`. Elegir
  qué acción consultar según el pedido no es decidir acceso en el service:
  decide `can()`.
- **`can()` no gana ninguna regla**: alcanzan el corte por estado, el de
  workspace, el de la clase de recurso y la tabla de roles. Es una fila más,
  como `workspace.transfer` y `workspace.delete`, que también son solo del
  owner. La regla de la membresía del owner (`permissions/index.ts:202-209`)
  no entra en juego: el owner nunca tiene rol `admin`.
- **`can()` no mira el rol de la membresía para esta acción**: sobre una
  `member`, el owner también recibe `true`. Por eso la vista y el service la
  consultan solo sobre una fila `admin`, y así tiene que hacerlo quien la reuse
  en la fase 2. _Agregado el 2026-10-13, revisión de la corrección._

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
- **La pantalla `/equipo`**: la lista con el botón por fila, los avisos y la
  vista sin permiso; su `error.tsx`. _Corrección del 2026-10-13_: sin la
  confirmación de bajarse a sí mismo (D-R8-5).
- **La entrada «Equipo»** en la navegación, solo con `team.manage`.
- **La acción `team.admin.revoke`** en `src/server/permissions/index.ts`
  (D-R8-13, ADR 0023). _Agregado el 2026-10-13._
- **Tests** de unidad, integración, concurrencia y e2e (§7).

Queda afuera: ver §10.

### Consecuencias sobre código ya entregado

| Archivo                                      | Qué cambia                                                                                                                                  | Qué hay que volver a probar       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `src/app/(app)/layout.tsx`                   | Pasa `showTeam={canManageTeam(session.actor)}` a `AppNav`                                                                                   | e2e entera (todas pasan por acá)  |
| `src/components/layout/app-nav.tsx`          | Recibe `showTeam`; suma `{ href: "/equipo", label: "Equipo" }` al final si es `true`                                                        | `app-nav.test.tsx` (nuevo)        |
| `src/server/permissions/index.ts`            | Suma `team.admin.revoke` a `ResourceByAction`, `resourceKinds` y `allowedRoles`; el cuerpo de `can()` no cambia (corrección del 2026-10-13) | `permissions.test.ts` entero      |
| `src/server/permissions/permissions.test.ts` | Suma los casos del criterio 2                                                                                                               | —                                 |
| `e2e/database.ts`                            | El comentario de `setRole` ya está (`:456-458`); suma el conteo de membresías activas (corrección del 2026-10-13)                           | —                                 |
| `e2e/workspace.setup.ts`                     | Corta por encima de 1.500 membresías activas y dice cómo seguir en una base nueva (corrección del 2026-10-13)                               | e2e entera (todas dependen de él) |

- **Ninguna afirmación existente cambia de valor.** Ningún e2e cuenta las
  entradas de la navegación (`goToReportsByNav` busca «Reportes» por nombre), y
  ningún test existente recorre las acciones de `can()` una por una.
- `src/modules/workspace/`, `src/modules/profile/` y `src/modules/report/` no
  cambian.
- _Corrección del 2026-10-13_: la fila de `permissions.test.ts` decía
  «**`index.ts` no cambia**», y `e2e/workspace.setup.ts` no estaba.

## 2. Esquema e índices

**Ninguna tabla ni índice cambia.** La lectura de la lista usa
`membership_workspace_idx`; el bloqueo, la clave primaria y
`membership_workspace_user_unq`. Sin migración.

## 3. Permisos

**Una acción nueva, `team.admin.revoke`** (D-R8-13, ADR 0023): sobre
`MembershipResource`, solo para `owner`. `team.manage` sigue como estaba, para
`owner` y `admin`, sobre `WorkspaceResource` y `MembershipResource`. Cómo
deciden sobre una membresía, que el criterio 2 fija:

| Quien actúa (activo)                        | `team.manage` sobre `member` o `admin` | `team.admin.revoke` sobre `admin` | Sobre `owner`                   | De otro workspace |
| ------------------------------------------- | -------------------------------------- | --------------------------------- | ------------------------------- | ----------------- |
| `owner`                                     | sí                                     | sí                                | sí (su propia; la frena D-R8-4) | no                |
| `admin`                                     | sí (también la propia)                 | no (tampoco la propia)            | no                              | no                |
| `project_manager`, `team_manager`, `member` | no                                     | no                                | no                              | no                |
| cualquiera `inactive` o `invited`           | no                                     | no                                | no                              | no                |

- **Ascender** (`member` → `admin`) pide `team.manage` sobre la membresía.
  **Bajar** (`admin` → `member`) pide `team.manage` y `team.admin.revoke`.
  Pedir el rol que ya tiene pide solo `team.manage` (D-R8-7).
- **Toda decisión de acceso es `can()`**: `canManageTeam(actor)` es
  `can(actor, "team.manage", { kind: "workspace", workspaceId })` y la usan el
  layout (la entrada), la página (la vista) y la mutación (antes de abrir la
  transacción); dentro, `can()` con el actor leído y la membresía leída. La
  vista arma `change` con `can()` por fila (D-R8-3).
- **Las reglas de D-R8-4 y D-R8-6 no son de acceso**: el owner que no cambia, los
  roles que no se tocan y la membresía inactiva son reglas del dominio del
  equipo, con sus códigos.
- _Corrección del 2026-10-13_: decía «Ninguna acción nueva», y la tabla tenía
  una sola columna para `member` y `admin`, con «sí (también la propia)» para
  el admin.

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
  /** D-R8-5: un admin que pide quitar el rol de admin, a otro o a sí mismo. */
  adminOwnerOnly: "Solo el propietario quita el rol de administrador.",
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
  /** La fila de quien mira: «(vos)». */
  isSelf: z.boolean(),
  /**
   * D-R8-3: `promote` si `can()` deja ascender a un `member`, `demote` si deja
   * quitarle el rol a un `admin` (`team.admin.revoke`), `null` sin control.
   */
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
- **`change` se arma con `can()` por fila** (D-R8-3). _Corrección del
  2026-10-13_: decía que no; `adminOwnerOnly` es nuevo, y los comentarios de
  `isSelf` y `change` nombraban la confirmación y el rol de la fila.
- **`unexpected` queda como está**: es el texto de la action, que se entiende
  solo. La tabla no lo repite debajo de su título (§5.4).

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
  /** El de la fila leída: el service lo usa en el recurso de `can()` (§4.3). */
  readonly workspaceId: string;
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
   * `for no key update`. Selecciona `id`, `workspace_id`, `user_id`, `role` y
   * `status`. Devuelve las que existen: ninguna, una (también si son la misma)
   * o dos.
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
- **`LockedMembership` lleva el `workspaceId` de la fila**, y el service no
  confía en que el filtro del repository lo haya dejado igual al del actor: el
  recurso de `can()` lleva el de la fila y `freshActorOf` exige el del actor
  (§4.3). Si el filtro por workspace faltara, la membresía de otro workspace
  responde `forbidden` y no se toca (criterio 8).
- **`updateRole` escribe solo `role`** (y `updated_at`): ninguna otra columna de
  `membership` es de R8.
- **`listActiveMembers` no es `listWorkspacePeople` de R4** (D-R8-1): otro
  permiso, otros estados, otras columnas y otro consumidor.
- _Corrección del 2026-10-13, B1 de la revisión de backend, ya implementada en
  `0d48375`_: `LockedMembership` no tenía `workspaceId` ni lo leía el `select`
  de `lockForRoleChange`. La regla de D-R8-5 no toca el repository.

### 4.3 Service (`team/service.ts`)

```ts
export class TeamError extends DomainError<TeamErrorCode> {
  constructor(code: TeamErrorCode, message: string);
}

/** `can(actor, "team.manage", workspace)`: la entrada de la navegación, la vista y la puerta de la mutación. */
export function canManageTeam(actor: Actor): boolean;

/** D-R8-2, D-R8-3. Sin `team.manage`, no lee. */
export async function getTeamView(actor: Actor): Promise<TeamView>;

/** D-R8-4 a D-R8-9, D-R8-13. */
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
   quien mira, y `change` con `can()` sobre su `MembershipResource` (el
   workspace de quien mira, el `userId` y el rol de la fila): `member` →
   `promote` si `can(actor, "team.manage", fila)`; `admin` → `demote` si
   `can(actor, "team.admin.revoke", fila)`; si no, y en los demás roles,
   `null`.
3. Ordena con `compareNames` sobre `{ id: membershipId, name }`.

**`changeRole`**, en este orden:

1. **Sin `canManageTeam(actor)`**: `TeamError("forbidden", teamMessages.forbidden)`,
   sin abrir la transacción.
2. **`db.transaction`** (`read committed`, la de siempre):
   1. `lockForRoleChange(tx, actor.workspaceId, input.membershipId, actor.userId)`.
   2. **La pedida no está** (otro workspace o inexistente):
      `TeamError("not_found", teamMessages.notFound)`.
   3. **La de quien actúa no está** —`freshActorOf` busca la fila con el
      `userId` **y** el `workspaceId` del actor—: `forbidden`. Con ella, el
      actor fresco es `{ userId, workspaceId: actor.workspaceId, role, status }`
      de la fila.
   4. **`can()` con el actor fresco, `team.manage` y el `MembershipResource` de
      la pedida** (`workspaceId: target.workspaceId`, su `userId` y su rol) es
      `false`: `forbidden`. Cubre al admin bajado entre la sesión y el bloqueo,
      a la membresía desactivada por SQL, al admin que pide la del owner y a
      una membresía de otro workspace, si el filtro del repository faltara.
   5. **La pedida es `admin`, se pide `member` y `can()` con el actor fresco,
      `team.admin.revoke` y el mismo recurso es `false`**:
      `TeamError("forbidden", teamMessages.adminOwnerOnly)`. Cubre al admin
      que pide bajar a otro admin o a sí mismo (D-R8-5), también si la pedida
      está inactiva: el acceso va antes que las reglas del dominio.
   6. **La pedida es `owner`**: `TeamError("role_locked", teamMessages.ownerLocked)`.
   7. **La pedida no es `member` ni `admin`**:
      `TeamError("role_locked", teamMessages.roleLocked)`.
   8. **La pedida no está `active`**:
      `TeamError("inactive_membership", teamMessages.inactive)`.
   9. **Ya tiene el rol pedido**: devuelve `{ membershipId, role }` sin escribir
      ni auditar.
   10. **`updateRole`** y **`recordAudit`** (D-R8-9) en la misma transacción;
       devuelve `{ membershipId, role }`.

- El orden de 2 a 5 es el de `authorizeEntry` de `time-entry`: primero si la
  fila existe, después el permiso sobre ella. Un admin que pide la del owner
  recibe `forbidden`, no `role_locked`.
- **El paso 5 elige la acción por el pedido** (quitar el rol) **y la decide
  `can()`** (D-R8-13). Pedir `admin` para quien ya es admin no pasa por ahí y
  llega al paso 9: el reintento de un ascenso sigue siendo idempotente.
- **Ninguna decisión de acceso fuera de `can()`**: el service no compara roles
  para decidir acceso; 6 a 8 son reglas del dominio (§3).
- _Corrección del 2026-10-13_: el paso 5 es nuevo (los que siguen se corrieron
  uno), y `change` se decidía solo por el rol de la fila. Por B1 de la revisión
  de backend, ya implementada en `0d48375`, el recurso de los pasos 4 y 5 lleva
  `workspaceId: target.workspaceId` —decía «su workspace» sin fijar de dónde
  salía, y el service usaba el del actor— y `freshActorOf` filtra también por
  workspace (`service.ts:88-101`, `:124-129`).

### 4.4 Action (`team/actions.ts`)

```ts
"use server";

// El permiso lo consulta el service: el recurso necesita la membresía leída, y
// la autoridad se vuelve a leer bajo el bloqueo (D-R8-7).
const options = {
  // D-R8-8: el árbol entero, como el perfil.
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

_Corrección del 2026-10-13_: el comentario de `paths` decía «bajarse a sí
mismo cambia la navegación y todas las pantallas» (D-R8-8).

### 4.5 Las respuestas

| Situación                                              | Código                 | Texto             | Escribe | Audita |
| ------------------------------------------------------ | ---------------------- | ----------------- | ------- | ------ |
| Cambio efectivo                                        | `ok`                   | —                 | sí      | sí     |
| Ya tenía el rol                                        | `ok`                   | —                 | no      | no     |
| Rol fuera de `member` y `admin`, o entrada mal formada | `validation`           | `roleUnavailable` | no      | no     |
| Id que no es uuid                                      | `validation`           | `notFound`        | no      | no     |
| Quien actúa sin `team.manage` (sesión o fila leída)    | `forbidden`            | `forbidden`       | no      | no     |
| Admin sobre la membresía del owner                     | `forbidden`            | `forbidden`       | no      | no     |
| Admin que pide `member` para un admin, otro o sí mismo | `forbidden`            | `adminOwnerOnly`  | no      | no     |
| Id inexistente o de otro workspace                     | `not_found`            | `notFound`        | no      | no     |
| El owner sobre la suya                                 | `role_locked`          | `ownerLocked`     | no      | no     |
| Membresía `project_manager` o `team_manager`           | `role_locked`          | `roleLocked`      | no      | no     |
| Membresía `inactive` o `invited`                       | `inactive_membership`  | `inactive`        | no      | no     |
| Sin sesión                                             | redirección a `/login` | —                 | no      | no     |

La interfaz nunca manda el pedido de la fila de `adminOwnerOnly`: un admin no
tiene «Quitar administrador» en ninguna fila. Llega por un pedido armado a
mano. _Agregada el 2026-10-13._

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
/**
 * El clic en el botón de una fila. Con un pedido en curso, o sin `change`, no
 * hace nada; si no, manda `{ membershipId, role }` con `admin` (`promote`) o
 * `member` (`demote`).
 */
export function activate(
  member: TeamMember,
  pending: boolean,
  /** `run` de `useAction` con `changeRole`. */
  send: (input: ChangeRoleInput) => void,
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

/**
 * El aviso de un desenlace, o `null` sin desenlace. Con `unexpected`, el
 * cuerpo es `teamLabels.unexpectedBody` y no el mensaje del resultado: el
 * título ya dice que no se pudo cambiar el rol.
 */
export function feedbackOf(outcome: TeamOutcome | null): TeamFeedback | null;
```

_Corrección del 2026-10-13_: salen `RowHandlers`, con su `confirm`, y
`confirmSelfDemotion`; `activate` recibía los dos manejadores y, en la fila
propia con `demote`, pedía confirmación en vez de mandar. `feedbackOf` usaba el
mensaje del resultado también con `unexpected`.

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
  si `change` no es `null`, el botón. **El encabezado de fila lleva
  `tabIndex={-1}` y un `id` propio de la membresía**, para recibir el foco
  (abajo).
- **El botón**: texto «Hacer administrador» (`promote`) o «Quitar
  administrador» (`demote`); nombre accesible «{texto}: {nombre}», que contiene
  el texto visible. Su `onClick` llama a `onActivate` con la fila.
- **Con `pending`, todos los botones llevan `aria-disabled="true"`** y ninguno
  `disabled`, que tira el foco a `body`. Que el clic no mande nada lo decide
  `activate` en el modelo.
- **El aviso vive en la tabla, no en la fila**: una fila puede irse con la
  revalidación (`not_found`, `inactive_membership`) y llevarse su aviso. Encima
  de la tabla, un solo `ActionFeedback` con `feedback`:
  - **error**: título «No se pudo cambiar el rol de {nombre}.», el cuerpo de
    `feedbackOf` y «Reintentar» (con `onRetry`) **solo si `feedback.retry`**:
    la vista no vuelve a decidir por el código, así que el test de `feedbackOf`
    protege lo que se dibuja. El cuerpo es el mensaje del resultado salvo con
    `unexpected`, que lleva «Revisá la conexión y volvé a intentar.»
    (`unexpectedBody`): así el aviso no dice dos veces «No se pudo cambiar el
    rol»;
  - **éxito**: `tone="info"`, título «Rol de {nombre}: {rol}.».
- _Corrección del 2026-10-13, revisión de paridad_: con `unexpected` el aviso
  decía «No se pudo cambiar el rol de {nombre}. No se pudo cambiar el rol.
  Revisá la conexión y volvé a intentar.». Se corrige en el modelo y no en
  `teamMessages.unexpected`, que sigue siendo una oración completa para quien
  lea el resultado de la action sin la tabla, como el `unexpected` de los otros
  módulos.

**El componente (`TeamMembers`, cliente)**: recibe `members` y `changeRole`, no
la vista entera; tiene un solo `useAction` para la tabla y el último
`TeamOutcome`. Dibuja `TeamMembersView` con
`onActivate = (member) => activate(member, pending, send)`,
`feedback = feedbackOf(outcome)` y `onRetry = retry`.

**El foco** después de un éxito:

- **Si la fila sigue con botón**, el botón conserva el foco: la fila es la
  misma (`key`) y el botón cambia su texto. Pasa cuando el owner asciende o
  baja a alguien.
- **Si la fila se queda sin botón**, el foco pasa a su encabezado de fila. Pasa
  cuando un admin asciende a alguien: la fila queda `admin`, y un admin no la
  puede bajar (D-R8-5). Sin esto, el foco caería a `body` con el botón que se
  desmonta. El componente guarda el `membershipId` y el `role` del último
  éxito (`data`). Un efecto que depende de esa marca y de `members` busca la
  fila. Si la fila todavía no trae ese rol, espera. Cuando lo trae, enfoca su
  encabezado si su `change` es `null` y borra la marca; si tiene botón, solo la
  borra. Un `send` nuevo también la borra. No supone si llega primero la
  respuesta o la revalidación: `onSuccess` corre en su propia transición
  (`use-action.ts:72-78`).

_Corrección del 2026-10-13_: el componente tenía además la fila de la
confirmación abierta y el diálogo de §5.5, y el foco siempre quedaba en el
botón, porque toda fila con control lo conservaba. La revisión de la
corrección cambió el segundo punto, que decía «El componente recuerda la
membresía del último éxito y, cuando llegan los `members` revalidados, si esa
fila tiene `change` `null`, enfoca su encabezado una vez»: suponía que la
revalidación llega después de `onSuccess`.

### 5.5 La confirmación de bajarse a sí mismo

_Corrección del 2026-10-13_: **ya no existe.** Nadie se baja a sí mismo
(D-R8-5): un admin no tiene control en su fila y el owner tampoco (D-R8-4).
`team/components/self-demotion-dialog.tsx` se borra, con sus textos de §5.6
(`selfDemoteTitle`, `selfDemoteBody`, `selfDemoteConfirm` y `cancel`) y
`confirmSelfDemotion` del modelo. No queda una rama defensiva: si una vista
trajera `demote` en la fila propia, el clic mandaría el pedido y el service
respondería `adminOwnerOnly`.

La versión anterior: un `Dialog` con `finalFocus` al botón de la fila, como
`remove-row-dialog.tsx`, con el título «¿Dejar de ser administrador?», la
descripción de lo que se perdía, «Dejar de ser administrador» (destructivo) y
«Cancelar»; después del éxito, la vista sin permiso y la navegación sin
«Equipo».

### 5.6 Textos (`team/components/labels.ts`)

| Clave            | Texto                                                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `heading`        | «Equipo»                                                                                                                                                                                         |
| `intro`          | «Un administrador ve las horas de todas las personas en los reportes y puede hacer administradoras a otras personas. Solo el propietario quita el rol de administrador, y el suyo no se cambia.» |
| `forbiddenRole`  | «No tenés permiso para administrar el equipo.»                                                                                                                                                   |
| `forbiddenBody`  | «No podés administrar el equipo.»                                                                                                                                                                |
| `loadFailed`     | «No se pudo cargar el equipo.»                                                                                                                                                                   |
| `personColumn`   | «Persona»                                                                                                                                                                                        |
| `roleColumn`     | «Rol»                                                                                                                                                                                            |
| `changeColumn`   | «Cambiar rol»                                                                                                                                                                                    |
| `self`           | «(vos)»                                                                                                                                                                                          |
| `promote`        | «Hacer administrador»                                                                                                                                                                            |
| `demote`         | «Quitar administrador»                                                                                                                                                                           |
| `actionName`     | `(acción, nombre) =>` «{acción}: {nombre}»                                                                                                                                                       |
| `changeFailed`   | `(nombre) =>` «No se pudo cambiar el rol de {nombre}.»                                                                                                                                           |
| `unexpectedBody` | «Revisá la conexión y volvé a intentar.» (el cuerpo del aviso con `unexpected`, §5.4)                                                                                                            |
| `changed`        | `(nombre, rol) =>` «Rol de {nombre}: {rol}.»                                                                                                                                                     |
| `roles`          | `owner` «Propietario», `admin` «Administrador», `project_manager` «Responsable de proyectos», `team_manager` «Responsable de equipo», `member` «Miembro» (`satisfies Record<Role, string>`)      |

La entrada de la navegación, «Equipo», va en `app-nav.tsx` con las demás. El
texto de `adminOwnerOnly` es de `teamMessages` (§4.1), no de acá.

_Corrección del 2026-10-13_: `intro` decía «Un administrador ve las horas de
todas las personas en los reportes y cambia roles. El rol del propietario no
se cambia.»; la tabla tenía `selfDemoteTitle`, `selfDemoteBody`,
`selfDemoteConfirm` y `cancel` (§5.5), y no tenía `unexpectedBody`.

## 6. Reparto de archivos

Rutas relativas a la raíz del worktree de R8, que crea el team-lead;
**(nuevo)** marca lo que el slice crea. Lo que cambia la corrección del
2026-10-13 está en «Ronda de la corrección del 2026-10-13», al final de esta
sección; lo que sigue es el reparto original.

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

Los nombres de los componentes son orientativos salvo los que citan los tests
(el modelo y `TeamMembersView`, con sus props de §5.4). _Corrección del
2026-10-13_: decía que el diálogo podía ir en su propio archivo, que se borra
(§5.5).

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
opcional, es el id del usuario. El id de la membresía lo da
`membershipOf(workspaceId, userId)` (`src/test/queries.ts`), sumado en la ronda
de revisión de código. _Corrección del 2026-10-13_: decía que cada test lo
buscaba con un `select` en su propio archivo, porque `src/test/` no estaba en
el reparto.

### e2e-tester

```
e2e/team.spec.ts                                   (nuevo)
e2e/team-page.ts                                   (nuevo)
e2e/database.ts
e2e/workspace.setup.ts
README.md
```

- `team-page.ts`: `TEAM_PATH`, los textos de §5.6 que afirman los recorridos,
  `teamNavLink(page)`, `memberRow(page, nombre)` (la fila cuyo encabezado de
  fila empieza con el nombre), `roleCell(row)`, `roleButton(page, acción,
nombre)` por su nombre accesible y `teamFeedback(page)`. _Corrección del
  2026-10-13_: también `selfDemoteDialog(page)`, que sale.
- **El comentario de `setRole` ya está** (`e2e/database.ts:456-458`); de ese
  archivo queda solo el conteo de membresías activas (abajo). Las funciones
  alcanzan: `seedPerson`, `setRole` y `setDisplayName`. De
  `e2e/reports-page.ts` solo importa `REPORTS_PATH`, `SCOPE_SELF`,
  `SCOPE_EVERYONE` y `goToReportsByNav`, sin editarlo. De `e2e/network.ts`, sin
  editarlo, `holdActionResponses`, `recordActions` y `openSecondTab`.
  _Corrección del 2026-10-13_: decía que cambiaba el comentario de `setRole`,
  que ya se cambió.
- **El tope de membresías activas** (corrección del 2026-10-13, revisión de
  tests): `e2e/database.ts` exporta una función que cuenta las membresías
  `active` del workspace de los e2e (`${FIRST_WORKSPACE}`), y
  `e2e/workspace.setup.ts`, después de `renewWorkspace()` (`:24`), corta con
  un error por encima de **1.500**. El tope es una constante con nombre en
  `workspace.setup.ts`. Así una base reusada demasiado grande falla en el
  setup, con su causa, y no aparece como un recorrido _flaky_. El mensaje dice
  cuántas hay, el tope, por qué (`/equipo` lista todas y por encima de eso el
  recorrido 1 no llega a tiempo, §8) y cómo seguir **sin tocar la base de
  desarrollo**, que es la de los e2e por omisión (`clock`: `README.md:37-38`,
  `e2e/environment.ts:62`):
  1. crear una base nueva:
     `docker compose exec postgres psql -U clock -d postgres -c "CREATE DATABASE clock_e2e_<fecha>"`;
  2. migrarla:
     `DATABASE_URL=postgresql://clock:clock@localhost:5432/clock_e2e_<fecha> npm run db:migrate`;
  3. correr la suite con ese `DATABASE_URL`.

  _Corrección del 2026-10-13, revisión de la corrección_: el mensaje decía solo
  «recreá la base de e2e», y la base de e2e por omisión es la de desarrollo.

- **`README.md`**, en la sección de los e2e (`:37-41`): el tope de 1.500
  membresías activas y el procedimiento de arriba. _Agregado el 2026-10-13._
- **La cabecera de `e2e/team.spec.ts`** (`:39-45`) dice «El owner de la suite
  no se toca»: pasa a decir que su membresía no se toca y que el recorrido 2
  entra con su cuenta (D-R8-11). _Agregado el 2026-10-13._
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
del merge. Las citas son de la rama en `ed87784`, con R7b:

- **RP-02** (`reportes.md:360-371`): corrección fechada: desde R8, owner y
  admin ven el reporte de equipo, y un admin se nombra en `/equipo`. Cubre
  también «Hasta R8 el único que lo ve es el owner…» (`:370-371`).
- **§9.5** (`:2406`): corrección fechada de «Hasta R8, solo el owner ve el
  reporte de equipo (RP-02).».
- **Sección «18. Núcleo, R8»** al final, después de «17. Núcleo, R7»
  (`:3718`), que con R7b termina en «17.5 Qué puede hacer cada rol»
  (`:3976-3988`): la pantalla, quién la ve, las reglas (D-R8-3 a D-R8-6), el
  efecto en una sesión abierta (D-R8-8) y las divergencias visibles: un member
  no ve `/equipo` (en Clockify ve la página de equipo salvo que se la
  escondan, RP-08); un solo rol por persona. _Corrección del 2026-10-13_: la
  regla de D-R8-5 se replica, con las dos citas que relevó `parity-analyst` ese
  día; no es una divergencia.
- **§7, un punto P-12 nuevo** con lo _no verificado_ de §9, para la sesión del
  usuario en Clockify. P-12 está libre: P-11 es el último (`:2298`).
  _Corrección del 2026-10-13_: sin los dos puntos que quedaron documentados
  (§9, punto 2).

_Corrección del 2026-10-13_: las citas eran de `10b8af0` (RP-02 `:345-356`,
§9.5 `:2344`, la §17 `:3656`, P-11 `:2236`); R7b corrió el archivo.

### Lo que no toca nadie

`src/server/db/`, `drizzle/`, `src/server/session.ts`, `src/server/action.ts`,
`src/server/audit.ts`, `src/modules/workspace/`, `src/modules/profile/`,
`src/modules/report/`, `src/modules/project/`, `e2e/reports-page.ts`,
`e2e/reports.spec.ts`, `e2e/network.ts`, los ADR salvo el 0023, que escribe el
arquitecto del slice. El mapa y el estado los actualiza el team-lead.
_Corrección del 2026-10-13_: `src/server/permissions/index.ts` estaba en esta
lista; ahora es de `backend-dev` (D-R8-13). También estaban `src/test/` y
`src/modules/time-entry/`: la revisión de código movió a `src/test/` los
ayudantes de equipo y `outcomeWhileHeld` (`f641c85`, `363a5c0`); esta ronda no
los toca.

### 6.6 Coordinación con R7b

R7b se mergeó a `main` el 2026-10-13 (`a8f3e70`) y `main` se mergeó en R8
(`ed87784`); no comparten archivos de código. Lo compartido es
`docs/parity/reportes.md`, que se corrió con R7b. El reparto de R7b está en el
[contrato de R7](nucleo-reportes-r7-exportar-pdf.md), §7, «R7b» y «Lo que no
toca nadie» (`:1248-1279`).

| Archivo                                                   | R8                                                           | R7b                                                                   | Riesgo                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `src/app/(app)/layout.tsx`, `app-nav.tsx`                 | edita                                                        | no los toca: excluye `src/components/` y «el resto de `src/app/`»     | ninguno                                                                                                    |
| `src/server/permissions/index.ts` y `permissions.test.ts` | suma `team.admin.revoke` y sus casos                         | no toca `src/server/`                                                 | ninguno                                                                                                    |
| `e2e/database.ts`                                         | el conteo de membresías (el comentario de `setRole` ya está) | no lo toca                                                            | ninguno                                                                                                    |
| `e2e/workspace.setup.ts`                                  | el tope de membresías activas                                | no lo toca: solo el recorrido 29                                      | con R8 en main, cualquier suite local sobre una base con más de 1.500 membresías activas corta en el setup |
| `e2e/reports.spec.ts`, `src/modules/report/export/`       | no los toca                                                  | el recorrido 29; `types.ts`, `document.ts`, `pdf.ts`, `pdf-layout.ts` | sin cruce                                                                                                  |
| `e2e/reports-page.ts`                                     | importa tres constantes y `goToReportsByNav`                 | no cambia (`readPdf` y `chartCaption` ya estaban)                     | ninguno                                                                                                    |
| `docs/parity/reportes.md`                                 | RP-02, §9.5, §18 nueva, P-12                                 | RP-53 y la §17                                                        | **conflicto de texto**, ya resuelto en `ed87784`; las citas de §6 son de la rama                           |

- R4 ya está en `main`: `listWorkspacePeople` existe y D-R8-1 dice por qué R8 no
  la extiende; dónde vive la lectura de la fase 2 queda abierto (§9, punto 4).
- **Los e2e no comparten servidor con otro árbol.** Con el `webServer` por
  omisión, todos usan `http://localhost:3000` (`playwright.config.ts:16`) y,
  fuera de CI, `reuseExistingServer` es `true` (`:62-71`): un worktree puede
  correr la suite contra el servidor de otro árbol sin darse cuenta. Cada uno
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
- _Corrección del 2026-10-13, revisión de la corrección_: la sección hablaba de
  R7b en paralelo, con «El que mergea segundo rebasa», las citas del contrato
  de R7 en `:1050-1069` y, para `e2e/workspace.setup.ts`, el riesgo de que la
  suite de R7b cortara con R8 mergeada.

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

### Ronda de la corrección del 2026-10-13

Sobre la rama del worktree, implementada hasta `7f81486`, `f641c85` y
`0d48375`; las citas de esta sección son de ese árbol. Cada agente conserva su
base de test. El `workspaceId` de `LockedMembership` y de los recursos de
`changeRole` (§4.2, §4.3) ya está en `0d48375` y no es parte de la ronda.

**`backend-dev`**:

- `src/server/permissions/index.ts`: `"team.admin.revoke": MembershipResource`
  en `ResourceByAction` (`:54-81`), `["membership"]` en `resourceKinds`
  (`:91-111`) y `["owner"]` en `allowedRoles` (`:121-141`), con un comentario
  que cite D-R8-5, la frase de Clockify y el ADR 0023. El cuerpo de `can()`
  (`:176-214`) no cambia.
- `src/modules/team/schema.ts`: `adminOwnerOnly` en `teamMessages` (`:24-32`) y
  los comentarios de `isSelf` y `change` (`:58-61`), como en §4.1.
  `unexpected` (`:31`) no cambia.
- `src/modules/team/service.ts`: `changeOf` (`:41-51`) pasa a recibir el actor
  y la fila, y decide con `can()` (§4.3, `getTeamView`, paso 2); `toTeamMember`
  (`:53-62`) se lo pasa. En `changeRole`, el paso 5 de §4.3 va después de la
  consulta de `team.manage` (`:123-132`) y antes de la regla del owner
  (`:133-137`).
- `src/modules/team/actions.ts`: el comentario de `:17` (§4.4).
- `src/modules/team/service.integration.test.ts`: criterio 3 (`:54-119`: el
  caso de `:82-104` pasa a ser el de un admin que asciende, sale el de
  `:106-118` y entra el owner que baja a un admin); criterio 4 (`:121-139`,
  con los dos casos del admin); criterio 5 (`:141-176`); criterio 14
  (`:345-448`, con el segundo admin, y el caso de `:435-448`, que hoy espera
  `demote` en la fila propia del admin).
- `src/modules/team/actions.integration.test.ts`: el caso de `adminOwnerOnly`
  del criterio 15, junto al de `forbidden` (`:141-155`).

**`test-engineer`**:

- `src/server/permissions/permissions.test.ts`: un `describe` de
  `team.admin.revoke` después del de `team.manage` sobre una membresía
  (`:435-529`), con los casos del criterio 2. Los de `:454-461` no cambian:
  `team.manage` de un admin sobre otro admin y sobre la propia sigue en `true`.
- `src/modules/team/concurrency.integration.test.ts`: el criterio 11 nuevo, con
  sus dos casos, reemplaza `:65-112`; en el 12 (`:114-153`) se invierten los
  actores.
- Los mutantes de §7.1 que cambian (criterios 2, 3, 4, 5, 11, 12 y 14) y los
  dos equivalentes declarados, en su copia.

**`frontend-dev`**:

- `team-members-model.ts`: salen `RowHandlers` (`:17-23`) y
  `confirmSelfDemotion` (`:48-58`); `activate` (`:25-46`) toma la firma de §5.4.
  `feedbackOf` (`:80-102`): con `unexpected`, el cuerpo es
  `teamLabels.unexpectedBody` (§5.4, revisión de paridad).
- `team-members.tsx`: salen el diálogo, `confirm`, `confirming` y `dialogOpen`
  (`:16`, `:19`, `:45-46`, `:70-73`, `:89-103`), y `changeButtonId` con el `id`
  del botón (`:26-29`, `:214`), que solo servían al `finalFocus`. Entran el
  `tabIndex={-1}` y el `id` del encabezado de fila (`:181`) y el foco de §5.4,
  con la marca del último éxito. El comentario de `:37-42` deja de nombrar la
  confirmación.
- `self-demotion-dialog.tsx`: se borra.
- `labels.ts`: `intro` (`:11-12`); salen `selfDemoteTitle`, `selfDemoteBody`,
  `selfDemoteConfirm` y `cancel` (`:30-35`); entra `unexpectedBody`.
- `team-members-model.test.ts`: el import (`:7`), la fila propia de `:40-52`, los
  casos de `:54-119` y el de `unexpected` de `feedbackOf` (`:126-140`), según el
  criterio 17. Las vistas armadas a mano de `team-screen.test.tsx` (`:27-34`) y
  `team-members.test.tsx` (`:26-27`) dejan de tener una fila propia con
  `demote`, que el service ya no produce: la fila propia de un admin va con
  `change: null`, y una de admin con `demote` va ajena, como la ve el owner. El
  `feedback` de error de `team-members.test.tsx` (`:64-80`) lleva el cuerpo
  nuevo.

**`e2e-tester`**:

- `e2e/team-page.ts`: salen `SELF_DEMOTE_TITLE`, `SELF_DEMOTE_CONFIRM`, `CANCEL`
  (`:32-35`) y `selfDemoteDialog` (`:93-95`); entra `OWNER_EMAIL`,
  `` `owner@${TEST_EMAIL_DOMAIN}` `` con el dominio de `e2e/environment.ts`,
  como `e2e/workspace.setup.ts:19`.
- `e2e/team.spec.ts`: los recorridos 1 (`:94-164`) y 2 (`:166-205`) de §7.2, y
  la cabecera (`:39-45`); el 3 (`:207-214`) no cambia.
- `e2e/database.ts` y `e2e/workspace.setup.ts` (`:18-25`): el tope de 1.500
  membresías activas, con el mensaje que dice cómo seguir en una base nueva;
  `README.md` (`:37-41`), el tope y ese procedimiento. Como dice la lista de
  `e2e-tester` de arriba (revisión de tests y de la corrección).

**`parity-analyst`**: los textos de su lista de arriba, con las correcciones
del 2026-10-13 y las citas de la rama en `ed87784`.

**El arquitecto del slice**: el
[ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md), en
estado «Propuesto», que aprueba el usuario (§9, punto 5).

**Orden**:

1. **`backend-dev`**: `index.ts` y `schema.ts` en un commit, y avisa a los
   otros tres.
2. **En paralelo**: `test-engineer`, el criterio 2; `frontend-dev`, su lista
   con vistas armadas a mano; `e2e-tester`, el tope del setup primero y
   después los recorridos, y confirma que fallan por la funcionalidad (un
   botón que sobra en la fila de un admin), no por el arnés; `backend-dev`, el
   service y sus tests.
3. **`test-engineer`**, con el service en la rama: los criterios 11 y 12, y los
   mutantes.
4. **Cierre**: como mínimo las revisiones de código y de seguridad. En la de
   seguridad: que la vista y la mutación preguntan `team.admin.revoke` y nada
   más decide quitar el rol, y que un admin con un pedido armado a mano no
   baja a nadie, tampoco a sí mismo. Después, la suite entera, sobre una base
   de e2e recién creada con el procedimiento de §6 (`e2e-tester`): las locales
   que ya existen tienen entre 1.800 y 1.965 membresías activas y cortan en el
   setup.

## 7. Criterios de aceptación

_Corrección del 2026-10-13_: cambian los criterios 2 a 5, 11, 12, 14, 15 y 17;
cada uno dice qué decía antes.

1. **Los esquemas** (unidad) — `changeRoleInput` pasa con `member` y con
   `admin` y un uuid; con `owner`, `project_manager`, `team_manager`, `Admin`,
   vacío o sin `role` falla con `roleUnavailable`; con un id que no es uuid o
   sin id, con `notFound`. `teamView` admite las dos formas, admite los cinco
   roles en una fila y rechaza un `change` fuera de `promote`, `demote` y
   `null`.
2. **`team.manage` y `team.admin.revoke` sobre una membresía** (unidad,
   `permissions.test.ts`) — la tabla de §3 entera. `team.manage`: owner sobre
   `member`, `admin` y la del owner; admin sobre `member`, `admin` (también con
   su propio `userId`) y no sobre la del owner; `project_manager`,
   `team_manager` y `member` sobre ninguna; owner y admin `inactive` o
   `invited` sobre ninguna; ninguna de otro workspace. `team.admin.revoke`: el
   owner activo sobre un `admin`, sí; un admin sobre otro admin y sobre el
   suyo, no; `project_manager`, `team_manager` y `member`, no; owner `inactive`
   o `invited`, no; sobre un admin de otro workspace, no; con un recurso
   `workspace`, no (`@ts-expect-error`). Antes: solo `team.manage`.
3. **Ascender y bajar** (integración) — el owner pasa a M de `member` a `admin`:
   la fila tiene `admin`, su `updated_at` avanzó, el resultado es
   `{ membershipId, role: "admin" }` y hay una fila de `audit_log` con el
   workspace, el owner como actor, `membership.changeRole`, `membership`, el id
   de la membresía, `{"role":"member"}` y `{"role":"admin"}`. Un admin pasa a N
   de `member` a `admin`, con su fila y el admin como actor. El owner pasa a un
   admin D a `member`, con su fila, `{"role":"admin"}` y `{"role":"member"}`.
   Antes: un admin bajaba a otro admin, y otro caso lo hacía bajarse a sí mismo.
4. **Sin efecto** (integración) — pedir el rol que ya tiene responde éxito, no
   cambia `updated_at` y no deja fila de auditoría, para `member` y para
   `admin`, pedido por el owner; y un admin que pide `admin` para quien ya es
   admin, que es el reintento de su ascenso, y `member` para quien ya es
   member: los dos, éxito sin escribir (D-R8-7, D-R8-13). Antes: solo el
   owner.
5. **El owner y el rol de admin** (integración) — el owner sobre la suya, con
   `member` y con `admin`: `role_locked` con `ownerLocked`, la fila igual y sin
   auditoría. Un admin sobre la del owner: `forbidden` con `forbidden`. Un
   admin que pide `member` para otro admin, para sí mismo y para un admin
   `inactive`: `forbidden` con `adminOwnerOnly`, la fila igual y sin
   auditoría. Antes: solo los dos primeros.
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
11. **La autoridad bajo el bloqueo** (concurrencia), dos casos:
    - **El owner baja a A mientras A asciende a M.** A `admin`, M `member`. En
      fila detrás de una barrera que sostiene `for no key update` sobre la
      membresía de A (`queueBehindBarrier`), primero el owner pide `member`
      para A y después A pide `admin` para M. El owner responde éxito y A,
      `forbidden` con `forbidden`: leyó su rol bajo el bloqueo, después del
      commit del owner. A queda `member`, M sigue `member`, y hay una sola fila
      de auditoría, la del owner sobre A.
    - **Dos admins que se piden `admin` uno al otro.** A y B `admin`; con una
      barrera sobre las dos filas, los dos trabados antes de soltarla
      (`raceThroughBarrier`), A pide `admin` para B y B para A. Los dos
      responden éxito sin escribir y sin auditoría; ninguno de los dos rechaza
      con `40P01`.

    Antes: «Dos admins que se bajan uno al otro», con un ganador y un
    `forbidden`, que con D-R8-5 ya no puede pasar.

12. **Dos cambios de la misma membresía** (concurrencia) — M `member`; en fila
    detrás de una barrera sobre M (`queueBehindBarrier`), primero un admin la
    pasa a `admin` y después el owner la pasa a `member`: los dos responden
    éxito, M queda `member` y hay dos filas de auditoría, la segunda con
    `{"role":"admin"}` como valor anterior. Antes: primero el owner ascendía y
    después un admin bajaba, que ahora responde `adminOwnerOnly`.
13. **El bloqueo no espera a las horas** (concurrencia) — con otra transacción
    abierta que insertó una entrada de M (y sostiene `for key share` sobre su
    membresía), el cambio de rol de M termina sin trabarse; la espera se mide
    con `waitForBlockedBackends` contra la respuesta, con `outcomeWhileHeld`
    (`src/test/concurrency.ts:113`), sin esperas fijas.
14. **La lista** (integración) — workspace A con el owner O, los admins D y E,
    M con nombre editado, N sin nombre editado, una `project_manager`, una
    `team_manager`, una `inactive` y una `invited`, y el workspace B con un
    member. Para O: `ready` con O, D, E, M, N y las dos de rol bloqueado, ni la
    inactiva, ni la invitada, ni la de B; M con su nombre editado y N con el de
    Google; los emails; el orden de `compareNames`; `isSelf` solo en O;
    `change` `null` en O y en las dos de rol bloqueado, `demote` en D y E, y
    `promote` en M y N. Para D: `isSelf` en D, `change` `null` en D y en E,
    `promote` en M y N. Para un member: `forbidden` con `role`, y para un admin
    `inactive`, con `inactive`, los dos sin llamar a `listActiveMembers`
    (espía). Antes: un solo admin, y para él `demote` en su propia fila.
15. **Las actions** (integración) — `changeRole` traduce a `ActionResult` el
    éxito, `forbidden` (con `forbidden` y con `adminOwnerOnly`), `not_found`,
    `role_locked`, `inactive_membership` y `validation` con sus textos;
    revalida `{ path: "/", type: "layout" }` en el éxito y en el error; sin
    sesión, redirige a `/login` sin cambiar nada. Antes: sin `adminOwnerOnly`.
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
      fila del owner ni en una de admin con `change` `null`; cada encabezado de
      fila con `tabindex="-1"`, en minúsculas como sale de
      `renderToStaticMarkup`, y su `id`.
    - `team-members-model.test.ts`, con `send` simulado (`vi.fn()`): `activate`
      en una fila `promote` llama a `send` con `{ membershipId, role: "admin" }`
      y en una `demote` con `member`; en una fila sin `change`, no llama; **con
      `pending`, ninguna fila llama** (el segundo clic). `feedbackOf`: `null`
      sin desenlace; una falla da `tone: "error"` y el título
      `changeFailed(nombre)`; con `unexpected`, el cuerpo `unexpectedBody` (no
      el mensaje del resultado) y `retry`; con `forbidden`, `not_found`,
      `role_locked` o `inactive_membership`, el mensaje del resultado y sin
      `retry`; un cambio da `tone: "info"` y el título
      `changed(nombre, rótulo del rol)`.
    - `team-members.test.tsx`, sobre `TeamMembersView` con sus props de §5.4:
      sin `pending` ni `feedback`, ningún botón con `aria-disabled` y ningún
      aviso; **con `pending`, todos los botones con `aria-disabled="true"` y
      ninguno con `disabled`**; con un `feedback` de error, `role="alert"`, el
      título, el cuerpo y «Reintentar» solo si `feedback.retry`; con uno de
      éxito, `role="status"` y sin «Reintentar».
    - `app-nav.test.tsx`: «Equipo» solo con `showTeam`.

    El foco y el cableado de `TeamMembers` son de los recorridos 1 y 2 de §7.2.
    Antes: el modelo tenía `confirm` y `confirmSelfDemotion`, con sus casos;
    «Cancelar» del diálogo era de los recorridos, y con `unexpected` el cuerpo
    era el mensaje del resultado.

18. **De punta a punta** — los recorridos de §7.2.
19. **Lo existente sigue verde** — lint, typecheck, `npm run test:all`,
    `next build` y la suite e2e entera, sobre una base de e2e por debajo del
    tope de membresías activas (§6, `e2e-tester`).

### 7.1 Con qué se verifica cada criterio, y qué mutante mata

| Criterio | Tipo         | Archivo                                | Mutante que tiene que caer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | ------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | unidad       | `team/schema.test.ts`                  | `role` como `z.string()`; `owner` en `CHANGEABLE_ROLES`; `membershipId` como texto libre. **Cae en typecheck**: un rol de menos en `ROLE_VALUES`                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2        | unidad       | `permissions.test.ts`                  | la regla del owner quitada; `project_manager` en `team.manage`; el corte por estado quitado; `admin` en `team.admin.revoke`; `team.admin.revoke` con `workspace` en `resourceKinds`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 3        | integración  | `team/service.integration.test.ts`     | sin `recordAudit`; anterior y siguiente invertidos; `entityId` con el `userId`; el actor de la auditoría con la persona cambiada; `team.admin.revoke` consultado también al ascender (el admin no asciende a N)                                                                                                                                                                                                                                                                                                                                                                                                               |
| 4        | integración  | ídem                                   | escribir y auditar siempre, también sin cambio; `team.admin.revoke` consultado por el rol de la fila y no por el pedido (el reintento del admin responde `forbidden`); `team.admin.revoke` consultado por el rol pedido y no por la fila (el admin que pide `member` para un member responde `adminOwnerOnly`)                                                                                                                                                                                                                                                                                                                |
| 5        | integración  | ídem                                   | la regla del owner quitada: el owner sobre la suya cae en la de los otros roles y responde `role_locked` con `roleLocked`, así que **muere por el texto** (`roleLocked` en lugar de `ownerLocked`), no porque el workspace quede sin owner (B2 de la revisión de backend); la regla del owner antes de `can()` (el admin recibe `role_locked`); la consulta de `team.admin.revoke` quitada (el admin baja a otro y a sí mismo); esa consulta después de la regla del estado (el admin sobre un admin `inactive` recibe `inactive_membership`)                                                                                 |
| 6        | integración  | ídem                                   | solo la regla del owner, sin la de los otros roles                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 7        | integración  | ídem                                   | la regla del estado quitada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 8        | integración  | ídem                                   | `lockForRoleChange` sin `workspace_id` (la de B se encuentra y responde `forbidden`, no `not_found`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 9        | integración  | ídem                                   | la puerta de antes de la transacción quitada (abre la transacción); `team.manage` cambiado por `team.view`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 10       | integración  | ídem                                   | `can()` dentro de la transacción con el actor de la sesión                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 11       | concurrencia | `team/concurrency.integration.test.ts` | bloquear solo la membresía pedida, o leer la de quien actúa sin bloqueo: A no se traba en la barrera y cae por `finishedEarly`, o asciende a M con la autoridad vieja (primer caso); dos sentencias en el orden pedido (`40P01`: en el test de concurrencia uno de los dos rechaza; en la action sería `unexpected`; segundo caso)                                                                                                                                                                                                                                                                                            |
| 12       | concurrencia | ídem                                   | `lockForRoleChange` sin bloqueo: no se traba en la barrera y la segunda vuelve sin escribir; cae por `finishedEarly` (`src/test/concurrency.ts:139-143`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 13       | concurrencia | ídem                                   | `for update` en lugar de `for no key update` (queda trabado)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 14       | integración  | `team/service.integration.test.ts`     | sin `status = 'active'` (aparecen la inactiva y la invitada); sin `workspace_id` (aparece la de B); `user_preference` con `inner join` (se pierde N); `change` en el owner; la lista leída sin `team.manage`; `change` por el rol, sin `can()` (para D, `demote` en D y en E)                                                                                                                                                                                                                                                                                                                                                 |
| 15       | integración  | `team/actions.integration.test.ts`     | `paths` solo con `/equipo`; el parseo de la entrada después del service; el texto de `adminOwnerOnly` cambiado por el `forbidden` de la action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 16       | integración  | `team/service.integration.test.ts`     | un caché de la membresía fuera del pedido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 17       | componente   | los cuatro de §6 con tests de unidad   | el botón en la fila del owner; el nombre accesible sin la persona; **con `pending`, `disabled` en vez de `aria-disabled`** (cae en la vista con `pending`, no en la primera pintura); `activate` que manda con un pedido en curso o sin `change`; `demote` que manda `admin`; `promote` con `member`; el encabezado de fila sin `tabIndex`; `feedbackOf` con el mensaje del resultado también con `unexpected` (el aviso repite «No se pudo cambiar el rol»); «Reintentar» con cualquier código; la vista que dibuja «Reintentar» sin mirar `feedback.retry`; el éxito con `tone` de error; «Equipo» siempre en la navegación |
| 18       | e2e          | `e2e/team.spec.ts`                     | los del final de §7.2                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 19       | todas        | las suites existentes                  | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

_Corrección del 2026-10-13_: el criterio 5 decía que la regla del owner quitada
caía porque «el workspace queda sin owner»; no llega a escribir (B2 de la
revisión de backend). Las filas 2, 3, 4, 5, 11, 14, 15 y 17 suman o cambian sus
mutantes por D-R8-5 y D-R8-13; la 17 pierde «la fila propia que manda sin
confirmar» y «confirmar con `admin`», y suma el cuerpo de `unexpected`. La
fila 8 no cambia: con `0d48375`, el mutante sin `workspace_id` muere con
`forbidden`, como dice (revisión de tests), porque el recurso de `can()` lleva
el workspace de la fila leída (§4.3). La revisión de la corrección sumó a la
fila 4 el mutante del rol pedido, cambió el texto del `40P01` de la fila 11 y
corrigió la cita de `finishedEarly` de la fila 12 (decía `:111-115`).

**Mutantes declarados equivalentes:** `promote` sin `can()` por fila y `demote`
sin `team.manage`: con la puerta de `getTeamView` ya pasada, `can()` responde
`true` en los dos casos. `test-engineer` corre el criterio 14 con cada uno y
anota que las vistas son iguales. _Corrección del 2026-10-13_: decía «Sin
mutante declarado equivalente»; antes de la corrección, el equivalente era
«`change` armado también con `can()` por fila, o sin él», que con D-R8-13 ya
no lo es para `demote`.

### 7.2 Recorridos de `e2e/team.spec.ts`

Dueño: `e2e-tester`. Con la regla de D-R8-11: U es la persona de la sesión del
test, con `setDisplayName` y un nombre único; P y Q, personas sembradas con
`seedPerson`, también con nombre único y email `…@${TEST_EMAIL_DOMAIN}`. Antes
de `setRole`, U entra a una pantalla, que le crea la membresía; después, una
carga completa, porque la navegación es del layout (D-R8-8).

1. **Un admin asciende a otra persona, no puede bajarla, y la sesión abierta de
   esa persona sigue el rol** (D-R8-3, D-R8-5, D-R8-8). U `admin`; P y Q
   sembradas. En un segundo contexto, P entra y abre `/reportes`:
   `SCOPE_SELF` y la navegación sin «Equipo». U entra a «Equipo» por la
   navegación: su fila dice «(vos)» y «Administrador» y no tiene botón; la de
   P dice «Miembro» y tiene «Hacer administrador: P». **Con la respuesta
   retenida** (`holdActionResponses`) y los pedidos contados
   (`recordActions`): clic en «Hacer administrador: P»; mientras no vuelve,
   «Hacer administrador: P» sigue en pantalla con `aria-disabled="true"` (y
   también «Hacer administrador: Q»), y **un segundo clic en «Hacer
   administrador: P»**, con `{ force: true }` (§6, `e2e-tester`), deja un solo
   pedido. Al soltar la respuesta: el aviso «Rol de P: Administrador.», la fila
   dice «Administrador», **no tiene botón** —no hay «Quitar administrador:
   P»— y el foco está en su encabezado de fila (§5.4). U recarga: lo mismo. P
   recarga `/reportes`: `SCOPE_EVERYONE` y «Equipo» en la navegación; P abre
   `/equipo` y ve la lista, con «(vos)» en su fila, sin botón, y la fila de U
   sin botón.
2. **El owner baja a un admin, y la sesión abierta del admin sigue el rol**
   (D-R8-5, D-R8-8). U `admin`, en `/equipo` por la navegación. En un segundo
   contexto, el owner entra con `OWNER_EMAIL` y abre `/equipo`: la fila de U
   dice «Administrador» y tiene «Quitar administrador: U». Con los pedidos del
   owner contados, clic: un pedido; el aviso «Rol de U: Miembro.», la fila
   dice «Miembro», el botón dice «Hacer administrador: U» y tiene el foco.
   **U, sin recargar, navega a «Reportes» por la navegación**: `SCOPE_SELF`. U
   abre `/equipo` por la URL: el título y «No tenés permiso para administrar el
   equipo.», sin tabla; al recargar, la navegación no tiene «Equipo».
3. **Un member no ve el equipo** (D-R8-2). U `member`: la navegación no tiene
   «Equipo»; `/equipo` por la URL muestra el título y `forbiddenRole`, sin
   tabla.

Los mutantes que tienen que caer en e2e: la entrada «Equipo» para todos;
«Quitar administrador» para un admin, en la fila de otro admin o en la suya;
sin «Quitar administrador» para el owner; el botón que no cambia de texto; el
foco que se pierde después del clic, en el botón (recorrido 2) o en el
encabezado de fila (recorrido 1); un segundo pedido con el primero en curso;
una lectura de rol cacheada entre pedidos (el paso de U sin recargar del
recorrido 2). Una action que revalidara solo `/equipo` no cae acá —en Next
16.3.8 toda action que revalida redibuja desde la raíz—: la mata el criterio 15.

_Corrección del 2026-10-13_: el recorrido 1 era «Un admin asciende y baja a
otra persona», con «Quitar administrador: P» enfocado después de ascender y el
paso de P sin recargar después de que U la bajaba; el 2, «Un admin se baja a
sí mismo, con confirmación», con «Cancelar» y la navegación que cambiaba sin
recargar. Los mutantes «bajarse sin confirmación» y «“Cancelar” que manda el
pedido» salen con el diálogo.

### 7.3 Lo que no se prueba en e2e

- **La fila del owner y su `role_locked`**: criterios 5 y 14. _Corrección del
  2026-10-13_: decía «El owner: es la cuenta común de la suite y su email no
  está en el arnés»; el email está (`e2e/workspace.setup.ts:19`) y el
  recorrido 2 entra con él, sin tocar su membresía.
- **Inactivas, invitadas, ajenas y los roles bloqueados**: criterios 6 a 8 y 14.
- **La concurrencia y el bloqueo**: criterios 11 a 13.
- **La auditoría**: criterio 3.
- **Los avisos de error por código**, también `adminOwnerOnly`, que la
  interfaz no produce: criterios 5, 15 y 17.
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
- **Sin piso de admins.** Con el owner inactivo por SQL, nadie puede bajar a un
  admin y la salida es SQL. El procedimiento de desactivar del mapa no toca al
  owner. _Corrección del 2026-10-13_: decía «Con el owner inactivo por SQL y el
  último admin bajado, nadie administra el equipo».
- **Un admin no deshace su propio ascenso** (D-R8-5): si un admin hace admin a
  alguien por error, lo baja el owner. Es la regla de Clockify. _Agregado el
  2026-10-13._
- **El rol de una membresía inactiva queda como estaba**: un admin desactivado
  por SQL sigue con `admin`, sin efecto (`can()` corta por estado). Al
  reactivar, en la fase 2, vuelve admin; esa pantalla decide si lo baja.
- **Dos lecturas de personas en dos módulos** (D-R8-1): `team.listActiveMembers`
  y `workspace.listWorkspacePeople` (`workspace/service.ts:105-124`). Comparten
  los dos nombres por `join` y nada más; dónde vive la de la fase 2 queda
  abierto (§9, punto 4).
- **La lista no tiene tope ni búsqueda.** Lo acota el tamaño de la empresa: el
  login está restringido al dominio. La fase 2 suma búsqueda si hace falta; la
  paginación sigue fuera de alcance (§10).
- **La base de e2e que se reusa hace crecer la lista sin límite.** _Agregado el
  2026-10-13, revisión de tests._ `/equipo` lista todas las membresías activas
  del workspace común de los e2e; cada test suma un usuario, y
  `renewWorkspace` (`e2e/database.ts:63`) solo mueve la creación del
  workspace, así que una base reusada acumula corrida tras corrida. Medido con
  `--repeat-each=3` y 8 workers, el recorrido 1 tarda 4,6 s con 249 filas y
  22,9 s con 3.023, y falla 3 de 3 con 5.233: la respuesta de la action no
  vuelve en 5 s. Las bases locales que ya existen tienen entre 1.800 y 1.965.
  Decisión del team-lead: el setup de los e2e corta por encima de 1.500
  membresías activas y dice cómo seguir en una base nueva sin tocar la de
  desarrollo, que es la de los e2e por omisión (§6, `e2e-tester`), para que no
  aparezca como un recorrido _flaky_. Con una base nueva por corrida, como en
  CI, el tope no se alcanza.
- **La deuda de `ensureWorkspaceContext`** (mapa §6) sigue: cualquiera del
  dominio que entra queda `member`. R8 no la agrava: solo cambia el rol de
  membresías que existen y nunca crea una.
- **El foco después de que un admin asciende a alguien va al encabezado de
  fila** (§5.4): la fila se queda sin botón. _Corrección del 2026-10-13_: el
  riesgo anterior era el foco a `body` después de bajarse a sí mismo, que ya no
  pasa.
- **Dos personas con el mismo nombre dan dos botones con el mismo nombre
  accesible.** _Agregado el 2026-10-13, revisión de paridad._ El email las
  distingue en pantalla (RP-31), pero «Hacer administrador: {nombre}» es igual
  en las dos filas, y un lector de pantalla que recorre los botones no sabe
  cuál es cuál sin leer la fila. Queda como deuda; si se arregla, el nombre
  accesible suma el email.
- **Un solo pedido a la vez en la tabla**: mientras uno está en curso, los demás
  botones esperan. Es una pantalla de uso esporádico.
- **El cableado de `TeamMembers` solo tiene e2e**: el arnés de unidad no tiene
  DOM; lo que decide el clic y el aviso está en el modelo, con unidad.
- **Los rótulos de `project_manager` y `team_manager`** aparecen solo si alguien
  los puso por SQL; «Responsable de proyectos» no es la marca de responsable de
  un proyecto (PR-19).
- **`team.admin.revoke` es de R8 y de la fase 2** (D-R8-13, ADR 0023): la
  pantalla de equipo de la fase 2 la reusa si ofrece quitar el rol de admin
  desde otro lugar, la consulta solo sobre una fila `admin` y decide aparte qué
  más de un admin puede tocar otro admin.

## 9. Pendiente del usuario y preguntas abiertas

1. **ADR para el módulo `team`: decidido, no hay** (team-lead, 2026-10-09).
   D-R8-1 reparte `membership` entre dos módulos —`workspace` la crea y `team`
   la administra— y lo resuelve con el ADR 0010.
2. **Clockify, para la sesión de relevamiento del usuario** (P-12 nuevo de
   `reportes.md`). Lo que se sabe, ya documentado: «Only Workspace admins and
   owners can deactivate a user.» (RP-60); «Workspace owner and admins can see
   everything (time and financials).» (RP-02); los members ven la página de
   equipo salvo que se la escondan (RP-08); el primer día de la semana lo edita
   un admin desde el perfil de la persona en la pantalla de equipo (PF-01); y,
   desde el 2026-10-13, «Only the Workspace owner can remove an admin role from
   someone, transfer ownership to another user, and delete the workspace.» y
   «Manage users | Yes (except removing Admin role – Owner only)», con «Assign
   user roles | Yes» para el admin (D-R8-5). Lo _no verificado_, que no se pudo
   relevar sin acceso al workspace:
   - si el rol del owner se cambia solo transfiriendo el workspace;
   - cómo muestra los roles la página de equipo (columna, «Edit roles», si los
     roles se combinan —admin y responsable de proyecto a la vez—: Clock tiene
     un solo rol por membresía);
   - si se puede cambiar el rol de una persona inactiva o invitada;
   - si el cambio vale en una sesión abierta sin volver a entrar;
   - los nombres de los roles en la interfaz en español.

   Queda lo de este contrato hasta entonces. No bloquea. _Corrección del
   2026-10-13_: la lista empezaba con «si un admin puede dar el rol de admin o
   solo el owner» y «si un admin puede quitarse el rol a sí mismo, y si pide
   confirmación», que quedaron documentados.

3. **Nota para el usuario, no es pregunta: un member no ve `/equipo`.** En
   Clockify un member ve la página de equipo por omisión (RP-08). R8 no la
   abre porque solo trae el control de rol; qué ve un member es de la pantalla
   de equipo de la fase 2 (`team.view`).
4. **Para la fase 2, sin decidir acá**: cuando la pantalla de equipo use
   `team.view`, ¿`listWorkspacePeople` sigue en `workspace` como catálogo del
   reporte o se muda a `team`, junto a `listActiveMembers`? Lo decide el
   contrato de esa pantalla. No bloquea R8.
5. **ADR para `team.admin.revoke`: el usuario decidió abrirlo** (2026-10-13):
   [ADR 0023](../adr/0023-quitar-el-rol-de-admin-es-una-accion-propia.md), en
   estado «Propuesto». **Pendiente del usuario: aprobarlo.** No bloquea la
   implementación: el ADR registra D-R8-13 tal como está. _Corrección del
   2026-10-13_: era una pregunta para el usuario, con la recomendación de no
   abrir ADR porque la acción es una fila más de las tablas de `can()`
   (`permissions/index.ts:49-53`); antes, el team-lead lo había dado por
   decidido sin ADR.

## 10. Fuera de alcance

- Invitar, desactivar, reactivar y quitar personas (RP-60, RP-63, fase 2).
- Los roles `project_manager` y `team_manager` como opción, y transferir el
  workspace (`workspace.transfer`).
- La lista para un member (`team.view`), con o sin emails.
- Las personas inactivas e invitadas en la lista.
- El primer día de la semana (PF-01), la capacidad y los días laborables.
- Búsqueda, orden por columnas y paginación de la lista. También con la base
  de e2e grande (§8): el tope del setup la cubre sin paginar.
- Cerrar las sesiones de quien pierde el rol.
- Un registro de auditoría visible en pantalla.
