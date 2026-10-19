# Mejora 3: un servidor MCP para cargar horas

Contrato del slice de la mejora 3 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md). **Un asistente —Claude u otro
cliente MCP— ve, carga, edita y borra las horas de una persona con la cuenta de
esa persona**: desde claude.ai como conector remoto (web, escritorio, móvil) y
desde Claude Code. La persona conecta el asistente pegando una dirección, entra
con Google como siempre, autoriza en una pantalla de Clock y, desde su perfil,
ve y desconecta lo que conectó. Cada herramienta pasa por los mismos services,
el mismo `can()` y el mismo audit log que la pantalla.

- **Fuente:** el pedido del usuario del 2026-10-19 (tres decisiones: OAuth según
  la especificación de autorización de MCP, uso desde claude.ai y desde Claude
  Code, y la autorización con el login de Google de Clock). **No es paridad con
  Clockify**: no pasa por `parity-analyst` y no tiene identificadores de
  paridad. Los textos de interfaz son propios.
- **Lugar en el plan:** fuera del mapa de la fase 2, como las otras mejoras
  pedidas. Depende de E2 (en `main` desde `27774d6`): la regla de ingreso exige
  una membresía activa y desactivar borra las sesiones.
- **Revisión:** pendiente de `architecture-reviewer` y de `security-reviewer`.
- **Decisiones de arquitectura:**
  - **[ADR 0026](../adr/0026-el-servidor-mcp-autoriza-con-oauth-de-better-auth-y-atiende-sin-estado.md),
    propuesto**: quién emite los tokens, cómo un token se vuelve un actor, el
    transporte sin estado, la columna del audit log y el interruptor. **El
    slice no arranca hasta que el usuario lo acepte.**
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md): las
    tablas del plugin son de Better Auth y las escribe `src/server/` con la
    transacción de quien llama (D-MCP-4); desactivar revoca por una función de
    ese dueño (D-MCP-5).
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md):
    la regla de ingreso no cambia y se aplica a un token en cada pedido
    (D-MCP-3).
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): las altas
    aceptan el id del cliente, opcional en la herramienta (D-MCP-9).
  - [ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) y
    [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md):
    los errores y la edición de una entrada se reusan tal cual (D-MCP-8,
    D-MCP-7).

Decisiones del usuario que el contrato da por tomadas (2026-10-19): OAuth y no
tokens personales; claude.ai y Claude Code como clientes que tienen que
funcionar; cada persona autoriza con su login de Google de Clock. Lo que queda
para el usuario está en §11.

## Decisiones del contrato

**D-MCP-1 — Better Auth emite los tokens, con `@better-auth/oauth-provider`
(ADR 0026, decisión 1).** Las alternativas y por qué no, en el ADR: un servidor
propio (código de seguridad que la convención pide no escribir), un proveedor
externo (otro servicio y la regla de ingreso repetida) y Google como servidor
(sin registro dinámico ni audiencia).

- **Por qué este**: vive en el mismo dominio y la misma base que el login, así
  que autorizar un asistente es entrar con Google por `/login`, con sus dos
  cortes (ADR 0024), y consentir. No hay otra identidad que mapear.
- **Lo que no está verificado**: el plugin **no está instalado** y su API no se
  pudo leer. Lo que este contrato dice de él —nombres de opciones, de endpoints
  y de tablas— es la forma esperada, y el §0 la confirma contra el paquete antes
  de implementar (V-1 a V-6). Si el plugin no ofrece lo que D-MCP-2 a D-MCP-4
  piden, **el slice se detiene** y el ADR vuelve al usuario.
- **El plugin `jwt`**, que ya trae `better-auth`, se suma solo si el plugin lo
  exige para firmar tokens o publicar sus claves.

**D-MCP-2 — El descubrimiento, el registro y los endpoints abiertos.**

- **El recurso** es `<BETTER_AUTH_URL>/api/mcp`, sin barra final. Es la
  audiencia que tienen que llevar los tokens (RFC 8707) y la dirección que la
  persona pega en el asistente.
- **Metadatos del recurso protegido** (RFC 9728), en
  `/.well-known/oauth-protected-resource/api/mcp` —la dirección con el camino
  del recurso, que es la que un cliente prueba primero— y en
  `/.well-known/oauth-protected-resource`, con el mismo cuerpo: `resource`,
  `authorization_servers` con el emisor del plugin, `scopes_supported:
["clock", "offline_access"]` y `bearer_methods_supported: ["header"]`.
- **Metadatos del servidor de autorización** (RFC 8414) en
  `/.well-known/oauth-authorization-server` y, si el emisor tiene camino (por
  ejemplo `/api/auth`), también en
  `/.well-known/oauth-authorization-server/<camino>`. El cuerpo lo arma el
  plugin (V-2).
- **Un solo alcance de la aplicación, `clock`**: «ver, cargar, editar y borrar
  tus horas, y leer tus proyectos, tareas y etiquetas». `offline_access` pide
  el refresh token. Un alcance de solo lectura no entra (§12): obliga a una
  pantalla de consentimiento con elección y a un 403 por herramienta.
- **Registro dinámico abierto, con lista de redirecciones.** El registro no
  pide autenticación —la especificación lo prevé así para que claude.ai y Claude
  Code se registren solos—, y por eso **solo acepta clientes públicos (sin
  secreto, `token_endpoint_auth_method: "none"`) cuyas `redirect_uris` estén
  todas en la lista**:
  - las de `MCP_REDIRECT_URIS`, comparadas exactas; por omisión,
    `https://claude.ai/api/mcp/auth_callback` y
    `https://claude.com/api/mcp/auth_callback` (V-7);
  - cualquier dirección de loopback: esquema `http`, host `localhost` o
    `127.0.0.1`, cualquier puerto y cualquier camino (RFC 8252, §7.3). Es la de
    Claude Code.
    El control es un gancho `hooks.before` de Better Auth sobre el camino de
    registro, con una función pura, `isAllowedRedirect(uri, allowed)`, en
    `src/server/mcp-auth.ts`. Un registro con otro destino responde 400
    `invalid_redirect_uri` y no crea nada. **Por qué**: sin la lista, cualquiera
    registra un cliente llamado «Claude» con su propio destino y le manda a una
    persona de Clock un enlace para autorizarlo; el código iría a ese destino.
- **Los demás endpoints del plugin van a `disabledPaths`**: los de
  administración de clientes (crear, listar, editar y borrar fuera del
  registro), `userinfo`, `end-session` y cualquier otro que el flujo no use.
  Quedan: autorizar, token, registro, consentimiento, revocación y, si el
  recurso los necesita para verificar, introspección o las claves públicas. La
  lista exacta sale de V-3 y se escribe en el comentario de `auth.ts`. **Por
  qué**: un endpoint de administración de clientes deja crear un cliente con
  cualquier destino sin pasar por el gancho del registro.

**D-MCP-3 — Del token al actor, en cada pedido; nunca más que una sesión
(ADR 0026, decisión 3).** `readMcpContext(request)` (§4.5), en este orden:

| Paso | Qué                                                                                                | Si no                                     |
| ---- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1    | `Authorization: Bearer <token>`, uno solo                                                          | 401, `WWW-Authenticate` sin `error`       |
| 2    | El plugin lo verifica: emitido acá, sin vencer, sin revocar, audiencia `<BETTER_AUTH_URL>/api/mcp` | 401 `invalid_token`                       |
| 3    | Tiene el alcance `clock`                                                                           | 403 `insufficient_scope`, `scope="clock"` |
| 4    | `hasGrant(userId, clientId)`: el consentimiento del par sigue en la base                           | 401 `invalid_token`                       |
| 5    | La fila de `user` existe                                                                           | 401 `invalid_token`                       |
| 6    | `readUserContext(user)` (§4.6): identidad por pedido y `ensureWorkspaceContext`, como la sesión    | 401 `invalid_token`                       |
| 7    | `can(actor, "mcp.connect", workspace)`: membresía activa                                           | 401 `invalid_token`                       |

- **El paso 4 es lo que hace inmediata una revocación** aunque el token sea
  autocontenido: desconectar desde `/perfil` o desactivar borra el
  consentimiento, y el pedido siguiente no pasa. Es una lectura por índice.
- **Los pasos 5 y 6 son los de una sesión abierta** (`session.ts:50-81`): un
  externo cuya invitación se revocó, un correo cuyo dominio salió de la
  política, una persona quitada del equipo —E6— quedan afuera por el mismo
  motivo que en la pantalla. La función es una sola: `session.ts` la exporta.
- **El paso 7 es más estricto que la pantalla**: una sesión con la membresía
  inactiva ve la pantalla en solo lectura (TT-92), y un token no ve nada. Una
  herramienta de lectura en solo lectura no le sirve a nadie, y en el uso normal
  el caso no existe: desactivar ya borró la autorización (D-MCP-5).
- **Por qué 401 y no 403 en los pasos 5 a 7**: el cliente vuelve a pedir
  autorización, y ese camino termina en `/login` con el motivo (EQ-92 para una
  inactiva). Con 403 el asistente mostraría un error sin salida.
- **El actor es el de la sesión más el cliente**: `{ ...context.actor,
oauthClientId: grant.clientId }` (D-MCP-11). Mismo `userId`, mismo
  `workspaceId` (el de la base, nunca de la entrada), mismo rol y estado, y la
  zona horaria y el primer día de la semana del perfil, por
  `trackerWorkspaceOf(context)`.
- **Por qué un token nunca da más que una sesión**: decide lo mismo con los
  mismos hechos en cada pedido, y las herramientas son operaciones que la
  pantalla ya ofrece, por el mismo `can()` y el mismo service. No hay ninguna
  herramienta sobre datos de otra persona ni de administración.

**D-MCP-4 — La vida de los tokens y la revocación.**

- **Token de acceso: 1 hora. Refresh token: 30 días, con rotación** —cada uso
  emite uno nuevo y anula el anterior—. El consentimiento dura hasta que se
  revoca. Mientras el asistente se use al menos una vez cada 30 días, la
  persona no vuelve a autorizar.
- **Dónde revoca la persona**: la sección «Asistentes conectados» de `/perfil`
  (§5.3) lista sus autorizaciones y ofrece «Desconectar». Desconectar borra en
  una transacción el consentimiento y los tokens de acceso y de refresh del par
  persona-cliente, y deja `mcp.revoke` (§4.3). Es idempotente: desconectar algo
  que ya no está responde éxito sin escribir.
- **Cerrar la sesión web no desconecta nada**: son autorizaciones aparte, como
  en cualquier aplicación con OAuth. La sección lo dice.
- **El endpoint de revocación del plugin** (RFC 7009) queda abierto para el
  cliente que quiera revocar su propio token; no es el camino de la persona.
- **Las tablas del plugin son de Better Auth** (ADR 0025): las lee y escribe
  `src/server/oauth-records.ts`, al lado de `auth-records.ts`, con la
  transacción de quien llama. El módulo `mcp` las muestra y las manda a borrar
  por esas funciones.

**D-MCP-5 — Desactivar revoca las autorizaciones (ADR 0026, decisión 4).**
`changeStatus` de `team`, al desactivar, después de `deleteSessionsOf`
(`team/service.ts:279`), llama a `deleteGrantsOf(tx, actor, target.userId)` de
`oauth-records.ts`: borra los consentimientos y los tokens de la persona y, si
borró alguno, deja `mcp.revokeAll` con la cantidad de clientes. **Orden de
bloqueos**: membresías, `time_entry`, `session` y después las tablas del plugin;
nada toma una membresía después de ellas, así que no hay ciclo. Reactivar no
devuelve nada (EQ-47 sigue igual): la persona vuelve a conectar su asistente.
**E6** (quitar del equipo) llama a la misma función cuando llegue (§12).

**D-MCP-6 — El transporte: Streamable HTTP sin estado, en un Route Handler
(ADR 0026, decisión 2).**

- **`src/app/api/mcp/route.ts`**, fuera de `(app)`: no hereda el shell y no usa
  `requireSession()`. Exporta `POST`, `GET` y `DELETE`, y
  `dynamic = "force-dynamic"` como el cron. Llama a `handleMcpRequest` del
  módulo (§4.12), como las descargas llaman a `handleReportExport`.
- **Cada `POST` arma su servidor**: `new McpServer(...)`, las herramientas del
  actor del pedido, un `WebStandardStreamableHTTPServerTransport` con
  `sessionIdGenerator: undefined`, `enableJsonResponse: true` y
  `maxRequestBodySize: 65536`, `connect` y `handleRequest(request, { authInfo })`.
  No queda nada en memoria entre pedidos.
- **`GET` y `DELETE` responden 405** con `Allow: POST`: no hay flujo SSE del
  servidor ni sesiones que cerrar. La especificación admite las dos respuestas.
- **`Origin`**: si el pedido lo trae y no es el de `BETTER_AUTH_URL` ni uno de
  `MCP_ALLOWED_ORIGINS` (por omisión `https://claude.ai,https://claude.com`),
  403 (protección contra DNS rebinding que la especificación exige). Sin
  `Origin`, como llegan los pedidos de servidor a servidor, pasa (V-7).
- **Sin CORS en `/api/mcp`**: claude.ai llama desde sus servidores y Claude Code
  desde un proceso local. Los metadatos de §4.13 sí llevan
  `Access-Control-Allow-Origin: *`: son públicos y un cliente de navegador los
  lee.
- **Sin revalidación**: las páginas de Clock leen la sesión en cada pedido y no
  hay caché del servidor que invalidar. Una pestaña abierta ve los cambios del
  asistente al navegar o recargar, como los de otro dispositivo.

**D-MCP-7 — Las herramientas: ocho, sobre lo propio.** Cumplen el mínimo pedido
(listar un período, crear, editar, borrar, iniciar y detener el timer, y el
catálogo para elegir) y suman `get_context`, sin la cual el asistente no sabe
qué es «hoy» ni en qué zona escribe las horas.

| Herramienta     | Qué hace                                                   | Pasa por                                        | Anotaciones       |
| --------------- | ---------------------------------------------------------- | ----------------------------------------------- | ----------------- |
| `get_context`   | Quién es, su zona, hoy, el primer día y el timer que corre | `timeSettingsOf`, `getRunningEntry` (nueva)     | `readOnlyHint`    |
| `list_projects` | Proyectos con tareas, por cliente, y etiquetas             | `getTrackingCatalog` de `project`               | `readOnlyHint`    |
| `list_entries`  | Las entradas propias de un período de hasta 31 días        | `listEntriesOfPeriod` (nueva)                   | `readOnlyHint`    |
| `create_entry`  | Una entrada cerrada con día, inicio y fin                  | `createManualEntry`                             | —                 |
| `update_entry`  | Los grupos de campos que cambian, en una mutación          | `updateEntry` (ADR 0013)                        | `idempotentHint`  |
| `delete_entry`  | Borra una entrada                                          | `deleteEntry`                                   | `destructiveHint` |
| `start_timer`   | Arranca un timer; cierra el que corría (ADR 0003)          | `startTimer`                                    | —                 |
| `stop_timer`    | Detiene el timer, el pedido o el que corre                 | `stopTimer`, con `getRunningEntry` si no hay id | —                 |

- **Cada herramienta pasa por la misma operación que su action.** El recorrido
  de CLAUDE.md —Zod, `can()`, service, audit— vive una sola vez por operación,
  en `src/modules/time-entry/operations.ts` (§4.9): la action lo llama dentro de
  `handle`, y la herramienta dentro de `runTool`. Así una regla nueva en la
  action no se olvida en el MCP. **Alternativa descartada**: que la herramienta
  repita las tres líneas de la action; es la copia que se desincroniza.
- **Las que no entran** (§12): continuar, duplicar, descartar el timer, las
  masivas, la planilla, crear proyectos o etiquetas y todo lo que no es de la
  propia persona.
- **Las descripciones van en español**, como los textos de interfaz, y dicen lo
  que el asistente necesita: que las horas son de pared en la zona de
  `get_context`, que `start_timer` cierra el timer que corría, que un `id`
  repetido no crea dos veces, que `delete_entry` no se deshace.

**D-MCP-8 — Los errores, traducidos una vez.** `failure` de `action.ts` pasa a
`src/server/failure.ts` como `failureOf`, sin cambiar lo que decide: un
`DomainError` con su código y su texto (y las filas, si es `RejectedError`), un
`ForbiddenError` con el texto `forbidden` del módulo, un `ZodError` con su
primer mensaje y cualquier otra cosa como `unexpected`, con `console.error`.
`handle` y `runTool` lo usan.

- **Un error de dominio es un resultado de herramienta con `isError: true`**,
  no un error de JSON-RPC: el asistente lee el texto y corrige. `content` lleva
  el mensaje en español; `structuredContent`, `{ code, message, rejections? }`.
- **Los errores de protocolo** —herramienta desconocida, JSON inválido— los
  responde el SDK como JSON-RPC.
- **La validación**: el SDK valida contra el `inputSchema` de la herramienta
  (§4.10) y la operación vuelve a parsear con el esquema del módulo, que tiene
  los refinamientos y los textos. Cómo responde el SDK un argumento que no
  cumple el `inputSchema` lo confirma V-8.

**D-MCP-9 — Las altas: `id` opcional, ADR 0007 cuando viene.** `create_entry` y
`start_timer` aceptan un `id` UUID v4 opcional. Si viene, el alta es la de
siempre: repetirla con el mismo id responde la fila del primer intento sin
escribir. Si no viene, `runTool` genera uno con `crypto.randomUUID()` y el alta
no es idempotente entre llamadas. **Por qué opcional**: un modelo no siempre
escribe un UUID v4 válido, y un rechazo por el formato del id es peor que una
carga sin reintento seguro. La descripción le pide al asistente que, si
reintenta la misma carga, mande el `id` que devolvió la primera respuesta o
uno propio desde el principio.

**D-MCP-10 — Aislamiento e IDOR.** Ninguna herramienta recibe `userId` ni
`workspaceId`: salen del token por D-MCP-3. Los ids que llegan son de entradas,
proyectos, tareas y etiquetas, y cada service ya los resuelve así:

- **Una entrada de otro workspace** no la encuentra el repository (filtra por
  `actor.workspaceId`): `not_found`.
- **Una entrada de otra persona del workspace**: `authorizeEntry` responde
  `forbidden` con «No tenés permiso para editar esta entrada.»
  (`time-entry/service.ts:240-263`), como la pantalla.
- **Un proyecto, tarea o etiqueta ajenos o privados**: `assertNewEntryPair`,
  `assertTrackable` y `assertTaggable`, con sus códigos de siempre.
- **Un `id` de alta que ya usa otra fila**: `createOnce` responde `forbidden`
  sin decir de quién es (ADR 0007).
- **`list_entries` y `get_context` leen solo las del actor**: las lecturas
  filtran por `actor.userId`.

**D-MCP-11 — El audit log dice por qué cliente llegó (ADR 0026, decisión 5).**

- **`audit_log.oauth_client_id`**, `text`, nulo para la aplicación, sin clave
  foránea: la constancia queda aunque el cliente se borre.
- **`Actor` suma `oauthClientId?: string`**, que solo pone `readMcpContext`.
  `can()` no lo mira; su comentario lo dice.
- **`auditActorOf(actor)`**, nueva en `src/server/audit.ts`, devuelve
  `{ workspaceId, actorId, oauthClientId }`, y **cada constancia que se arma
  con un `Actor` la usa** en lugar de escribir `workspaceId` y `actorId` a mano:
  las de `time-entry`, `project`, `team`, `profile`, `workspace` y
  `auth-records`, también las entradas que arma `recordAudits`. La de
  `invitation.accept`, sin `Actor`, sigue igual. **Por qué en todas y no solo
  en `time-entry`**: una herramienta futura que escriba en otro módulo queda
  marcada sin que nadie se acuerde.
- **El autor sigue siendo la persona** (`actor_id`). Lo que no se registra: el
  token, el id del consentimiento, los argumentos de la herramienta ni los
  pedidos de lectura.
- **Alternativas descartadas**: no marcar (se pierde si una carga la hizo la
  persona o su asistente); una fila `mcp.call` aparte, en otra transacción (no
  cae junto con el cambio); un contexto por `AsyncLocalStorage` que lea
  `recordAudit` (estado de módulo que la convención no admite).

**D-MCP-12 — Los límites.**

| Límite                     | Valor                       | Dónde                                          | Respuesta                                     |
| -------------------------- | --------------------------- | ---------------------------------------------- | --------------------------------------------- |
| Cuerpo de un `POST`        | 64 KiB                      | `maxRequestBodySize` del transporte            | 413, del SDK                                  |
| Pedidos por persona        | 120 por minuto              | `consumeCall` (§4.14), antes del transporte    | 429 con `Retry-After: 60` y JSON-RPC `-32000` |
| Período de `list_entries`  | 31 días                     | `entriesPeriodInput`                           | `validation`, `periodTooLong`                 |
| Entradas de `list_entries` | 500                         | `listEntriesOfPeriod`, con `truncated`         | éxito, `truncated: true`                      |
| Descripción, etiquetas     | 3000, 50                    | los esquemas de siempre                        | `validation`                                  |
| Registro de clientes       | el limitador de Better Auth | `rateLimit.customRules` del camino de registro | 429 del plugin                                |

- **El límite por persona se cuenta en la base**, en una fila por persona de
  `mcp_call_window` (§2), con un `insert … on conflict do update` que suma o
  reinicia según el minuto de `now()`. Una sentencia por pedido; sin estado en
  memoria. Cuenta todo `POST` autenticado (`initialize` y `tools/list`
  incluidos): cualquier asistente queda lejos de 120 por minuto.
- **El registro de clientes**: el limitador de Better Auth guarda en memoria por
  instancia (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:213-231`),
  así que en Vercel es un freno parcial. Pasarlo a la base cambia el límite de
  todos los endpoints de Better Auth, también el del ingreso, que con la oficina
  detrás de una sola IP dejaría afuera a quien entre cuarto en diez segundos. No
  se cambia; el riesgo está en §10.

**D-MCP-13 — El interruptor `MCP_ENABLED` (ADR 0026, decisión 6).** Por omisión
`false`. Apagado: `/api/mcp` y los metadatos responden 404, la sección de
`/perfil` no se muestra, `/conectar` responde 404 y los endpoints del plugin
quedan en `disabledPaths`. Las tablas están igual. Producción se despliega
apagada y se enciende después de la prueba en un preview (§6).

**D-MCP-14 — El consentimiento es una página de Clock, fuera del shell.** El
plugin redirige a `consentPage` con lo que identifica el pedido (V-4).
`src/app/conectar/page.tsx`, como `/login`, pide su sesión con `requireSession()`
y no tiene la barra lateral: es una pantalla de paso. Muestra quién pide, qué y
adónde vuelve (§5.1). Aceptar o cancelar es una action del módulo `mcp` que
llama al endpoint de consentimiento del plugin y devuelve la dirección a la que
el navegador sigue con `window.location.assign`.

- **Por qué no un `<form>` que redirige**: la CSP tiene
  `form-action 'self' https://accounts.google.com` (`next.config.ts:17`), y un
  navegador la aplica también a la redirección que sigue a un envío. Una
  redirección a `claude.ai` después de un `POST` de formulario se bloquearía.
- **`/login` sigue el pedido de autorización**: cuando el plugin manda a
  `/login` a alguien sin sesión, `/login` arma el `callbackURL` del botón de
  Google con la continuación del plugin, y con sesión ya abierta la sigue en vez
  de ir a `/`. La continuación la valida `oauthContinuationOf` (§4.4): solo un
  camino del mismo origen que empiece por el de autorización del plugin; nada
  más se acepta como destino (V-5).

## 0. Precondición de arranque

- **`main` en `27774d6`**, con E2 mergeado. Las citas de abajo son de ese árbol.
  El worktree `clock-mcp` no tiene `node_modules`: las citas de paquetes son del
  checkout principal, con `better-auth` 1.7.7 y `@modelcontextprotocol/sdk`
  1.32.0.
- **El ADR 0026, aceptado** por el usuario.
- **Las preguntas de §11**, respondidas.
- **Las verificaciones V-1 a V-8**, hechas por `backend-dev` antes de escribir
  código, con el resultado en el registro del slice
  (`docs/slices/correcciones-mejoras-mcp-revisiones.md`). Una que falle detiene
  el slice y vuelve al arquitecto.

### Verificaciones

| Id  | Qué se confirma                                                                                                                                                                                                                                                                    | Si falla                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| V-1 | `npm view @better-auth/oauth-provider versions peerDependencies`: hay una versión compatible con `better-auth` 1.7.7. Se instala exacta, con `@modelcontextprotocol/sdk` como dependencia directa.                                                                                 | El slice se detiene (ADR 0026, decisión 1).                                  |
| V-2 | El plugin ofrece: registro dinámico (RFC 7591) sin autenticación, clientes públicos, PKCE `S256` obligatorio, `resource` (RFC 8707) con audiencias válidas, refresh con rotación, revocación (RFC 7009), página de consentimiento propia, y el cuerpo de los metadatos (RFC 8414). | El slice se detiene.                                                         |
| V-3 | La lista de endpoints que el plugin registra, para armar `disabledPaths` (D-MCP-2), y el camino exacto del registro, para el gancho.                                                                                                                                               | Se completa §4.2 con lo que haya.                                            |
| V-4 | Qué parámetros recibe `consentPage` y cómo se acepta o rechaza (el endpoint, su cuerpo y lo que devuelve). Qué lee la página para mostrar el cliente y el alcance.                                                                                                                 | Se ajusta §4.14 y §5.1; si no hay página propia, se detiene.                 |
| V-5 | Cómo sigue el pedido de autorización después de `loginPage`: con qué parámetros llega a `/login` y adónde tiene que volver el `callbackURL` del ingreso con Google.                                                                                                                | Se ajusta `oauthContinuationOf`.                                             |
| V-6 | Cómo verifica el recurso un token: si es opaco (fila) o JWT (claves), con qué función del plugin, qué devuelve (persona, cliente, alcances, audiencia, vencimiento), y los nombres de las tablas que genera `npm run auth:schema`.                                                 | Se ajusta §4.3 y §4.5.                                                       |
| V-7 | Las direcciones de vuelta de claude.ai y claude.com en la documentación de Anthropic para conectores remotos, si claude.ai registra por RFC 7591 o por documento de metadatos del cliente, y si sus pedidos al recurso traen `Origin`.                                             | Se corrige el valor por omisión de las dos variables.                        |
| V-8 | En el SDK 1.32.0: cómo responde un argumento que no cumple el `inputSchema` (resultado con `isError` o error JSON-RPC), y que con `isError: true` no valida `structuredContent` contra el `outputSchema`.                                                                          | `runTool` parsea él mismo y registra el esquema solo para el descubrimiento. |

Y dos del árbol, sin paquete: que Next 16.3.8 sirve un Route Handler en una
carpeta `src/app/.well-known/` (si no, una `rewrite` en `next.config.ts` hacia
`/api/oauth-metadata/...`), y que el chequeo de origen de Better Auth deja pasar
el registro y el token pedidos de servidor a servidor, sin `Origin` ni cookie.

### Supuestos sobre el árbol, con archivo y línea en `27774d6`

| Supuesto                                                                                                         | Dónde                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth.ts` arma Better Auth con `plugins: testSessionPlugins()` y `disabledPaths` propios                         | `src/server/auth.ts:22-53`                                                                                 |
| Sin `rateLimit` configurado: el de Better Auth corre en memoria                                                  | `auth.ts:22-137`; `node_modules/better-auth/dist/context/create-context.mjs:175`                           |
| `readSession`: `getSession`, identidad por pedido, `ensureWorkspaceContext` y `profileOf`; privada y con `cache` | `src/server/session.ts:35-81`                                                                              |
| `decideSessionIdentity` decide solo la identidad                                                                 | `src/server/entry.ts:62-68`                                                                                |
| `ensureWorkspaceContext` arma el `Actor` con rol y estado de la membresía                                        | `src/modules/workspace/service.ts:60-75`, `:160-170`                                                       |
| `can()` corta todo lo que no es `active`; `ProfileResource` es solo el propio                                    | `src/server/permissions/index.ts:188-213`                                                                  |
| `Actor` tiene cuatro campos                                                                                      | `permissions/index.ts:7-12`                                                                                |
| `failure` es privada de `action.ts`; `handle` llama a `requireSession()`                                         | `src/server/action.ts:44-95`                                                                               |
| `AuditEntry` y `rowOf`, sin cliente                                                                              | `src/server/audit.ts:4-28`                                                                                 |
| `deleteSessionsOf` y su lugar en la desactivación                                                                | `src/server/auth-records.ts:22-44`; `src/modules/team/service.ts:275-279`                                  |
| Las actions de `time-entry`: `parse`, `assertCan`, service, con `trackerWorkspaceOf(session)`                    | `src/modules/time-entry/actions.ts:77-158`                                                                 |
| `createManualEntry`, `startTimer`, `stopTimer`, `deleteEntry`, `updateEntry`                                     | `time-entry/service.ts:955-994`, `:574-611`, `:743-762`, `:838-860`, `:1414`                               |
| `authorizeEntry`: `not_found` o `forbidden` por el dueño real                                                    | `time-entry/service.ts:240-263`                                                                            |
| `findRunning` y `listClosedBetween` (inicio en `[from, to)`), sin tope                                           | `time-entry/repository.ts:545-560`, `:611-629`                                                             |
| Los esquemas de alta manual y de edición; los códigos del módulo                                                 | `time-entry/schema.ts:148-163`, `:314-335`, `:657-658`                                                     |
| `getTrackingCatalog`: proyectos donde se puede cargar, con tareas y etiquetas                                    | `src/modules/project/service.ts:555-571`; `project/schema.ts:158-184`                                      |
| `env()` valida con Zod y lanza si falta algo                                                                     | `src/server/env.ts:7-40`                                                                                   |
| La CSP: `form-action` y `frame-ancestors`                                                                        | `next.config.ts:8-19`                                                                                      |
| `/login` redirige a `/` con sesión; el botón entra con `callbackURL: "/"`                                        | `src/app/login/page.tsx:9-13`; `src/components/layout/google-sign-in-button.tsx:15`                        |
| La sesión de prueba crea `user` y `session` por cabecera secreta                                                 | `src/server/test-session.ts:67-119`                                                                        |
| El transporte del SDK: modo sin sesión, JSON, tope de cuerpo                                                     | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.d.ts:41-116`, `:145-173` |
| `AuthInfo` del SDK: token, cliente, alcances, vencimiento, recurso, `extra`                                      | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/types.d.ts:4-31`                              |
| `registerTool` con `inputSchema`, `outputSchema` y `annotations`                                                 | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:161-168`                                  |
| Ni `mcp` ni `oidc-provider` en los plugins de `better-auth`                                                      | `node_modules/better-auth/dist/plugins/index.d.mts:1-69`                                                   |

## 1. Alcance

Entra:

- **El servidor de autorización**: el plugin en `auth.ts`, el gancho del
  registro, `disabledPaths` y el interruptor (D-MCP-1, D-MCP-2, D-MCP-13).
- **Los metadatos** del recurso y del servidor de autorización (D-MCP-2).
- **El recurso MCP**: `/api/mcp`, la verificación del token y el armado del
  actor, el límite por persona (D-MCP-3, D-MCP-6, D-MCP-12).
- **Las ocho herramientas** y `time-entry/operations.ts` (D-MCP-7 a D-MCP-10).
- **La columna del audit log** y `auditActorOf` (D-MCP-11).
- **Desactivar revoca** (D-MCP-5).
- **Las pantallas**: el consentimiento y «Asistentes conectados» en `/perfil`,
  y `/login` que sigue la autorización (§5).
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: §12.

### Consecuencias sobre código ya entregado

| Archivo                                                           | Qué cambia                                                                                          | Qué hay que volver a probar                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/server/auth.ts`                                              | El plugin, el gancho del registro, `disabledPaths` según el interruptor                             | `auth.integration.test.ts` entero (el ingreso no cambia)            |
| `src/server/session.ts`                                           | Exporta `readUserContext` y `SessionRead`; `readSession` la usa                                     | `session.integration.test.ts` sin cambios en lo que afirma          |
| `src/server/action.ts`, `failure.ts` nuevo                        | `failure` se muda como `failureOf`                                                                  | los `actions.integration.test.ts` de todos los módulos              |
| `src/server/permissions/index.ts`                                 | `mcp.connect`, `mcp.grant.revoke`; `Actor.oauthClientId`                                            | `permissions.test.ts` entero                                        |
| `src/server/audit.ts` y cada constancia armada con un `Actor`     | `auditActorOf`; `oauthClientId` en la fila                                                          | los tests de audit de cada módulo (deben seguir verdes sin cambiar) |
| `src/server/env.ts`                                               | Tres variables opcionales                                                                           | `env.test.ts` si existe; el arranque sin ellas                      |
| `src/modules/time-entry/actions.ts`, `operations.ts` nuevo        | Cinco actions delegan en `operations.ts`                                                            | `time-entry/actions.integration.test.ts`                            |
| `src/modules/time-entry/service.ts`, `repository.ts`, `schema.ts` | `listEntriesOfPeriod`, `getRunningEntry`, `listClosedStartingIn`, `entriesPeriodInput` y dos textos | `time-entry/service.integration.test.ts`                            |
| `src/modules/team/service.ts`                                     | Desactivar llama a `deleteGrantsOf`                                                                 | `team/service.integration.test.ts`, criterio 1 de E2                |
| `src/app/login/page.tsx`, `google-sign-in-button.tsx`             | La continuación de la autorización                                                                  | `login/page.test.tsx`; los e2e de ingreso                           |
| `src/app/(app)/perfil/page.tsx`                                   | Compone la sección de `mcp`                                                                         | los e2e de perfil                                                   |
| `CLAUDE.md`, «Estructura» y «Recorrido de una mutación»           | Las líneas nuevas (§7)                                                                              | —                                                                   |
| `package.json`, `package-lock.json`                               | `@better-auth/oauth-provider` y `@modelcontextprotocol/sdk`                                         | `npm run build`                                                     |

- **Sin cambio**: `access.ts`, `entry.ts`, `workspace/` y `report/` (salvo sus
  constancias), la CSP, el cron y las demás actions.
- **El ingreso por Google no cambia** para quien no autoriza un asistente:
  `/login` sin continuación hace lo de hoy.

## 2. Esquema y migración

Una migración, `0017_mcp`, con `npm run auth:schema` y después
`npm run db:generate`. Todo es aditivo.

- **Las tablas del plugin**, generadas en `src/server/db/auth-schema.ts` por
  `npm run auth:schema` con el plugin configurado: clientes, tokens de acceso,
  refresh tokens y consentimientos, y `jwks` si entra el plugin `jwt`. Los
  nombres los fija V-6; este contrato los llama `oauth_client`,
  `oauth_access_token`, `oauth_refresh_token` y `oauth_consent`. **El diff de
  `auth-schema.ts` solo suma tablas**: si el generador cambia `user`, `session`,
  `account` o `verification`, se para y se avisa.
- **`mcp_call_window`**, del módulo `mcp`, en `src/server/db/schema.ts`:

  ```ts
  /** D-MCP-12: el minuto en curso de pedidos al MCP, una fila por persona. */
  export const mcpCallWindow = pgTable(
    "mcp_call_window",
    {
      userId: text("user_id")
        .primaryKey()
        .references(() => user.id, { onDelete: "cascade" }),
      windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
      calls: integer("calls").notNull(),
    },
    (table) => [check("mcp_call_window_calls_positive", sql`${table.calls} > 0`)],
  );
  ```

- **`audit_log.oauth_client_id`**: `text("oauth_client_id")`, nula, sin clave
  foránea ni índice (nadie consulta por ella todavía). `ADD COLUMN` nula sin
  valor por omisión no reescribe la tabla.
- **Reversión**: una migración hacia adelante que borra las tablas nuevas y la
  columna. Se pierden las autorizaciones (la persona vuelve a conectar) y la
  marca de cliente de las constancias escritas mientras tanto. **No hace
  falta para apagar el MCP**: alcanza con `MCP_ENABLED=false` (§6.5).

## 3. Permisos

Dos acciones nuevas, en la unión `Action`, en `resourceKinds` y en
`allowedRoles`:

| Acción             | Recurso             | Roles      | Se consulta                                                                                  |
| ------------------ | ------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| `mcp.connect`      | `WorkspaceResource` | `everyone` | al mostrar y al aceptar el consentimiento, y en cada pedido a `/api/mcp` (paso 7 de D-MCP-3) |
| `mcp.grant.revoke` | `ProfileResource`   | `everyone` | al desconectar un asistente propio, con `ownProfileResource(actor)`                          |

- Comentario de `mcp.connect`: «ADR 0026, D-MCP-3: autorizar un asistente y
  usarlo. Una membresía no activa no lo tiene, por la regla común de `can()`.».
- Comentario de `mcp.grant.revoke`: «D-MCP-4: desconectar un asistente propio.
  `ProfileResource`: la autorización es de la cuenta, y `can()` ya exige que
  sea la propia.».
- **`Actor.oauthClientId?: string`**, con el comentario «D-MCP-11: el cliente
  OAuth por el que llegó el pedido, si vino por MCP. `can()` no lo mira; lo
  usa `auditActorOf`.». El cuerpo de `can()` no cambia.
- **Cada herramienta consulta el mismo permiso que su action**, dentro de
  `operations.ts`. Las lecturas propias no consultan más que `mcp.connect`,
  como las lecturas de la pantalla no consultan más que la sesión.

## 4. Contrato

### 4.1 Variables de entorno (`src/server/env.ts`)

```ts
/** Una lista de direcciones separadas por coma, sin vacíos. */
const urlList = z
  .string()
  .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
  .pipe(z.array(z.url()));

/** D-MCP-13: el servidor MCP y la autorización de asistentes. Apagado por omisión. */
MCP_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
/** D-MCP-2: las redirecciones HTTPS que acepta el registro de clientes, exactas. */
MCP_REDIRECT_URIS: urlList.default([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
]),
/** D-MCP-6: los `Origin` que acepta `/api/mcp` además del propio. */
MCP_ALLOWED_ORIGINS: urlList.default(["https://claude.ai", "https://claude.com"]),
```

Las tres son opcionales: un entorno que no las declara arranca igual, con el MCP
apagado. Los valores por omisión de las dos listas los confirma V-7.

### 4.2 Better Auth (`src/server/auth.ts`)

Forma esperada; los nombres exactos salen de V-2 a V-6:

```ts
plugins: [
  ...mcpAuthPlugins(),        // de src/server/mcp-auth.ts; vacía con MCP_ENABLED=false
  ...testSessionPlugins(),
],
disabledPaths: [
  "/update-user", "/link-social", "/unlink-account",
  ...mcpDisabledPaths(),      // D-MCP-2; todos los del plugin con MCP_ENABLED=false
],
hooks: { before: mcpRegistrationGuard },   // D-MCP-2
rateLimit: { customRules: { [MCP_REGISTER_PATH]: { window: 3600, max: 10 } } },
```

`mcpAuthPlugins()` devuelve el plugin con: `loginPage: "/login"`,
`consentPage: "/conectar"`, registro dinámico sin autenticación, solo clientes
públicos, PKCE obligatorio, `scopes: ["clock", "offline_access"]`, audiencia
válida `mcpResourceUrl()`, token de acceso de 3600 s y refresh de 30 días con
rotación (D-MCP-4). El comentario de `auth.ts` lista los endpoints que quedan
abiertos (V-3) y remite a D-MCP-2.

**`mcpRegistrationGuard`** corre solo sobre el camino del registro: lee
`redirect_uris` y `token_endpoint_auth_method` del cuerpo y, si alguna dirección
no pasa `isAllowedRedirect` o el método no es `none`, lanza
`APIError("BAD_REQUEST", { code: "invalid_redirect_uri" })` o
`invalid_client_metadata`. Sobre cualquier otro camino no hace nada.

### 4.3 Las tablas del plugin (`src/server/oauth-records.ts`, nuevo)

```ts
/**
 * Lo que la aplicación lee y escribe de las tablas del servidor de autorización
 * fuera de sus endpoints (ADR 0025, ADR 0026): son de Better Auth y de este
 * código. Cada función que escribe recibe la transacción de quien llama.
 */

/** Una autorización vigente de la persona: el consentimiento de un cliente. */
export type GrantRow = {
  readonly clientId: string;
  /** `client_name` del registro: lo declara el cliente, no se confía en él. */
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
  readonly scopes: readonly string[];
  readonly grantedAt: Date;
};

/** El cliente registrado, para la pantalla de consentimiento. */
export type ClientRow = {
  readonly clientId: string;
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
};

/** D-MCP-4: las autorizaciones de `userId`, por fecha, la más nueva primero. Solo lee. */
export async function listGrantsOf(
  tx: Transaction,
  userId: string,
): Promise<readonly GrantRow[]>;

/** D-MCP-3, paso 4: si el consentimiento del par sigue. Sin transacción: una lectura por índice. */
export async function hasGrant(userId: string, clientId: string): Promise<boolean>;

/** D-MCP-14: el cliente que pide. `undefined` si no existe. */
export async function findClient(clientId: string): Promise<ClientRow | undefined>;

/**
 * D-MCP-4: borra el consentimiento y los tokens de acceso y de refresh del par y,
 * si borró algo, deja `mcp.revoke` (`entity: "oauth_client"`, `entityId: clientId`,
 * `previousValue: { scopes }`) con `auditActorOf(actor)`. No consulta permisos:
 * la usa `revokeGrant` de `mcp`, que ya los decidió. Devuelve si borró.
 */
export async function deleteGrant(
  tx: Transaction,
  actor: Actor,
  clientId: string,
): Promise<boolean>;

/**
 * D-MCP-5: borra los consentimientos y los tokens de `userId` y, si borró alguno,
 * deja `mcp.revokeAll` (`entity: "user"`, `entityId: userId`, `previousValue:
 * { clients: n }`). La usa `changeStatus` de `team` al desactivar. Devuelve
 * cuántos clientes.
 */
export async function deleteGrantsOf(
  tx: Transaction,
  actor: Actor,
  userId: string,
): Promise<number>;
```

- **Ninguna constancia guarda tokens** ni hashes: solo el cliente, los alcances
  y la cantidad.
- `deleteGrant` filtra por `actor.userId`: nunca borra lo de otra persona,
  aunque el `clientId` exista.
- Los registros de clientes **no se borran** al revocar: un cliente sin
  consentimiento no puede usar nada, y Claude Code reusa su registro.

### 4.4 La configuración del servidor de autorización (`src/server/mcp-auth.ts`, nuevo)

Lo que importa `auth.ts`, y funciones puras. **No importa `auth.ts`**: así no
hay ciclo.

```ts
/** D-MCP-2: el camino del registro dinámico en el plugin (V-3). */
export const MCP_REGISTER_PATH: string;

/** D-MCP-1, D-MCP-13: el plugin (y `jwt` si hace falta) con su configuración; vacía si está apagado. */
export function mcpAuthPlugins(): BetterAuthPlugin[];

/** D-MCP-2, D-MCP-13: los endpoints del plugin que no se usan; todos si está apagado. */
export function mcpDisabledPaths(): string[];

/** D-MCP-2: el gancho `hooks.before` que valida el registro. */
export const mcpRegistrationGuard: AuthMiddleware;

/** D-MCP-2: `<BETTER_AUTH_URL>/api/mcp`, sin barra final. Audiencia y dirección para pegar. */
export function mcpResourceUrl(): string;

/** D-MCP-2: el cuerpo de los metadatos del recurso protegido (RFC 9728). */
export function protectedResourceMetadata(): {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: readonly string[];
  readonly bearer_methods_supported: readonly ["header"];
};

/** D-MCP-2: loopback de cualquier puerto, o una de `allowed`, exacta. Pura. */
export function isAllowedRedirect(uri: string, allowed: readonly string[]): boolean;

/**
 * D-MCP-14: la continuación de la autorización que `/login` recibe del plugin, como
 * camino del mismo origen, o `null` si los parámetros no son una. Pura.
 */
export function oauthContinuationOf(
  searchParams: Record<string, string | string[] | undefined>,
): string | null;
```

### 4.5 La verificación del recurso (`src/server/mcp-context.ts`, nuevo)

Importa `auth.ts` (o la función de verificación del plugin, V-6),
`session.ts` y `oauth-records.ts`.

```ts
/** Lo que el token dice, ya verificado (D-MCP-3, pasos 1 a 4). */
export type McpGrant = {
  readonly userId: string;
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly expiresAt: number;
};

/** El contexto de la sesión con el actor marcado con su cliente (D-MCP-11). */
export type McpContext = SessionContext;

export type McpContextRead =
  | {
      readonly kind: "unauthorized";
      readonly error: "invalid_request" | "invalid_token" | null;
    }
  | { readonly kind: "insufficient_scope" }
  | { readonly kind: "ready"; readonly context: McpContext; readonly grant: McpGrant };

/** D-MCP-3, los siete pasos. No lanza por un token malo: lo dice el resultado. */
export async function readMcpContext(request: Request): Promise<McpContextRead>;

/** 401 o 403 con `WWW-Authenticate: Bearer resource_metadata="…", scope="clock"[, error="…"]`. */
export function mcpAuthErrorResponse(
  read: Exclude<McpContextRead, { kind: "ready" }>,
): Response;
```

`error: null` es el paso 1: sin token, el 401 no lleva `error`.

### 4.6 La sesión (`src/server/session.ts`)

```ts
export type SessionRead = …;                     // pasa a exportarse, sin cambios
/** La persona de una sesión o de un token, como la guarda `user`. */
export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly image: string | null | undefined;
};

/**
 * D-MCP-3: el armado de un pedido a partir de la persona, sin cookies: identidad
 * por pedido, `ensureWorkspaceContext` y el perfil. Lo usan `readSession` y
 * `readMcpContext`; la regla vive una vez.
 */
export async function readUserContext(user: SessionUser): Promise<SessionRead>;
```

`readSession` queda: `getSession`; `null` → `anonymous`; si no,
`readUserContext(session.user)`. Lo demás no cambia.

### 4.7 El audit log (`src/server/audit.ts`)

```ts
export type AuditEntry = {
  …
  /** D-MCP-11: el cliente OAuth si el cambio vino por MCP; nulo desde la aplicación. */
  readonly oauthClientId?: string | null;
};

/** D-MCP-11: quién escribe una constancia, tomado del actor. */
export function auditActorOf(actor: Actor): Pick<AuditEntry, "workspaceId" | "actorId" | "oauthClientId">;
```

`rowOf` escribe `oauthClientId ?? null`. Cada constancia armada con un `Actor`
pasa de `workspaceId: actor.workspaceId, actorId: actor.userId` a
`...auditActorOf(actor)`.

### 4.8 Los errores (`src/server/failure.ts`, nuevo)

```ts
export type Failure<Code extends string> = {
  readonly code: Code | ActionErrorCode;
  readonly message: string;
  readonly rejections?: readonly Rejection<Code>[];
};

/** D-MCP-8: la traducción de `handle`, sin cambios, para las actions y las herramientas. */
export function failureOf<Code extends string>(
  error: unknown,
  messages: ActionMessages,
): Failure<Code>;
```

`ActionMessages` se muda con ella. `action.ts` responde `{ ok: false,
...failureOf(error, options.messages) }`.

### 4.9 `time-entry`

**`operations.ts`** (nuevo), sin `"use server"`:

```ts
/**
 * D-MCP-7: la validación, el permiso y el service de cada operación que comparten
 * la action y la herramienta del MCP. Una regla nueva de la operación va acá.
 */
export async function startTimer(
  context: ProfileContext,
  input: StartTimerInput,
): Promise<StartTimerResult>;
export async function stopTimer(
  context: ProfileContext,
  input: StopTimerInput,
): Promise<StopTimerResult>;
export async function createManualEntry(
  context: ProfileContext,
  input: CreateManualEntryInput,
): Promise<CreateManualEntryResult>;
export async function updateEntry(
  context: ProfileContext,
  input: UpdateEntryInput,
): Promise<UpdateEntryResult>;
export async function deleteEntry(
  context: ProfileContext,
  input: DeleteEntryInput,
): Promise<DeleteEntryResult>;
export async function listEntriesOfPeriod(
  context: ProfileContext,
  input: EntriesPeriodInput,
): Promise<EntriesOfPeriod>;
export async function getRunningEntry(
  context: ProfileContext,
): Promise<TimeEntryView | null>;
```

Cada una de las cinco primeras es el cuerpo de hoy de su action
(`actions.ts:77-158`), con `context` en lugar de `session`. Las cinco actions
quedan `handle((session) => operations.<op>(session, input), options)`. Las
demás actions no cambian.

**`service.ts`** suma:

```ts
/** D-MCP-7: las cerradas propias con inicio en el período, y el timer, en un snapshot. */
export async function listEntriesOfPeriod(
  actor: Actor,
  workspace: TrackerWorkspace,
  period: EntriesPeriodValues,
): Promise<EntriesOfPeriod>;

/** D-MCP-7: el timer que corre, o `null`. Sin bloqueo. */
export async function getRunningEntry(
  actor: Actor,
  workspace: TrackerWorkspace,
): Promise<TimeEntryView | null>;
```

`listEntriesOfPeriod`: `[startOfDayKey(from), startOfDayKey(to + 1 día))` en la
zona de la persona; en una transacción `repeatable read`, `findRunning` y
`listClosedStartingIn(..., ENTRIES_OF_PERIOD_MAX + 1)`; con más de
`ENTRIES_OF_PERIOD_MAX`, devuelve las primeras y `truncated: true`. El corte es
el del rastreador y la planilla: cada entrada cuenta entera en el día en que
empieza.

**`repository.ts`** suma `listClosedStartingIn(workspaceId, userId, from, to,
limit, tx)`: como `listClosedBetween`, por `started_at` y `id` ascendentes, con
`limit`.

**`schema.ts`** suma:

```ts
/** D-MCP-12: el período más largo que lee `listEntriesOfPeriod`. */
export const ENTRIES_PERIOD_MAX_DAYS = 31;
/** D-MCP-12: el tope de entradas de una lectura de período. */
export const ENTRIES_OF_PERIOD_MAX = 500;

export const entriesPeriodInput = z
  .object({ from: dayKeyInput, to: dayKeyInput })
  .refine((period) => period.from <= period.to, {
    message: timeEntryMessages.periodInverted,
    path: ["to"],
  })
  .refine((period) => spanDays(period) <= ENTRIES_PERIOD_MAX_DAYS, {
    message: timeEntryMessages.periodTooLong,
    path: ["to"],
  });

export type EntriesOfPeriod = {
  readonly from: string;
  readonly to: string;
  /** Por inicio ascendente. */
  readonly entries: readonly TimeEntryView[];
  readonly running: TimeEntryView | null;
  /** Exacto, de las devueltas. */
  readonly closedSeconds: number;
  readonly truncated: boolean;
};
```

Textos nuevos en `timeEntryMessages`: `periodInverted` «La fecha de fin no
puede ser anterior a la de inicio.» y `periodTooLong` «El período puede tener
hasta 31 días.». `spanDays` sale de `src/server/time` (la diferencia de claves
de día, más uno); si no existe, se agrega ahí.

### 4.10 El módulo `mcp`: esquemas (`src/modules/mcp/schema.ts`)

```ts
export const MCP_SCOPE = "clock";
export const MCP_CALLS_PER_MINUTE = 120;

export const MCP_TOOL_NAMES = [
  "get_context",
  "list_projects",
  "list_entries",
  "create_entry",
  "update_entry",
  "delete_entry",
  "start_timer",
  "stop_timer",
] as const;
export type McpToolName = (typeof MCP_TOOL_NAMES)[number];

export const mcpMessages = {
  unexpected: "No se pudo completar el pedido. Volvé a intentar.",
  noRunningTimer: "No hay ningún timer corriendo.",
  rateLimited: "Demasiados pedidos seguidos. Esperá un minuto y volvé a intentar.",
  grantForbidden: "No tenés permiso para hacer esto.",
  consentExpired: "El pedido de conexión venció. Volvé a conectar desde el asistente.",
  consentForbidden: "Tu acceso al workspace no permite conectar asistentes.",
  unexpectedRevoke: "No se pudo desconectar. Revisá la conexión y volvé a intentar.",
  unexpectedConsent:
    "No se pudo completar la conexión. Volvé a intentar desde el asistente.",
} as const;
```

**Entradas de las herramientas.** Cada campo lleva `.describe()` en español,
que el SDK pasa al JSON Schema. Los textos y las reglas finas los aplica el
esquema del módulo en `operations.ts`; estos fijan la forma:

```ts
const dayKey = z.string().describe("Día en la zona de la persona, AAAA-MM-DD.");
const clock = z
  .string()
  .describe("Hora de pared en la zona de la persona, HH:mm de 24 h.");
const pair = {
  projectId: z
    .uuid()
    .nullable()
    .optional()
    .describe("Proyecto de list_projects; null es sin proyecto."),
  taskId: z.uuid().nullable().optional().describe("Tarea del proyecto; exige projectId."),
};
const tagIds = z
  .array(z.uuid())
  .max(TAGS_MAX)
  .optional()
  .describe("Etiquetas de list_projects; el conjunto entero.");
const newId = z
  .uuidv4()
  .optional()
  .describe("Id de la entrada nueva. Repetirlo no crea dos veces.");

export const listEntriesToolInput = z.object({ from: dayKey, to: dayKey });
export const createEntryToolInput = z.object({
  id: newId,
  date: dayKey,
  start: clock,
  end: clock.describe("Hora de fin; menor que el inicio es el día siguiente."),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  ...pair,
  billable: z.boolean().optional(),
  tagIds,
});
export const updateEntryToolInput = z.object({
  id: z.uuid(),
  description: z.string().max(DESCRIPTION_MAX).optional(),
  project: z
    .object({ projectId: z.uuid().nullable(), taskId: z.uuid().nullable() })
    .optional(),
  times: z
    .object({ date: dayKey, start: clock, end: clock })
    .optional()
    .describe("Día, inicio y fin de una entrada cerrada, los tres juntos."),
  runningStart: z
    .object({ date: dayKey, start: clock })
    .optional()
    .describe("Nuevo inicio del timer que corre."),
  billable: z.boolean().optional(),
  tagIds,
});
export const deleteEntryToolInput = z.object({ id: z.uuid() });
export const startTimerToolInput = z.object({
  id: newId,
  description: z.string().max(DESCRIPTION_MAX).optional(),
  ...pair,
  billable: z.boolean().optional(),
  tagIds,
});
export const stopTimerToolInput = z.object({
  id: z.uuid().optional().describe("El timer a detener; sin id, el que corre."),
});
```

`get_context` y `list_projects` no tienen entrada.

**Salidas.** Una entrada, como la ve el asistente (`toolEntryOf(view)`):

```ts
export type ToolEntry = {
  readonly id: string;
  readonly description: string;
  /** `dayDate` de la vista: el día local del inicio. */
  readonly date: string;
  /** `startClock` y `endClock`: HH:mm de 24 h en la zona de la persona. */
  readonly start: string;
  readonly end: string | null;
  /** Días que cruza el fin (TT-72). */
  readonly extraDays: number;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly durationMinutes: number | null;
  readonly running: boolean;
  readonly project: { readonly id: string; readonly name: string } | null;
  readonly task: { readonly id: string; readonly name: string } | null;
  readonly billable: boolean;
  readonly tags: readonly { readonly id: string; readonly name: string }[];
};
```

| Herramienta           | `structuredContent`                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_context`         | `{ user: { name, email }, timezone, today, now, weekStart, running: ToolEntry \| null }`                                                   |
| `list_projects`       | `{ groups: [{ client: { id, name } \| null, projects: [{ id, name, billableByDefault, tasks: [{ id, name }] }] }], tags: [{ id, name }] }` |
| `list_entries`        | `{ timezone, from, to, entries: ToolEntry[], running: ToolEntry \| null, totalMinutes, truncated }`                                        |
| `create_entry`        | `{ entry: ToolEntry }`                                                                                                                     |
| `update_entry`        | `{ entry: ToolEntry }`                                                                                                                     |
| `delete_entry`        | `{ id }`                                                                                                                                   |
| `start_timer`         | `{ running: ToolEntry, stopped: ToolEntry \| null }`                                                                                       |
| `stop_timer`          | `{ stopped: ToolEntry }`                                                                                                                   |
| cualquiera, con error | `isError: true`, `structuredContent: { code, message, rejections? }`                                                                       |

`content` lleva siempre un bloque de texto: el JSON de `structuredContent`, o
el mensaje si es un error. `totalMinutes` es `Math.floor(closedSeconds / 60)`.
Cada herramienta declara su `outputSchema` (V-8).

**Las pantallas:**

```ts
export type GrantView = {
  readonly clientId: string;
  /** El nombre que declaró el cliente, o «Asistente sin nombre». */
  readonly name: string;
  /** El host de la primera redirección, o «esta computadora» si es loopback. */
  readonly returnsTo: string;
  /** El día, con el formato de la persona. */
  readonly grantedOn: string;
};
export type GrantsView =
  | { readonly kind: "disabled" }
  | {
      readonly kind: "ready";
      readonly serverUrl: string;
      readonly grants: readonly GrantView[];
      readonly canRevoke: boolean;
    };

export const revokeGrantInput = z.object({ clientId: z.string().min(1).max(255) });
export type RevokeGrantInput = z.infer<typeof revokeGrantInput>;
export type RevokeGrantResult = { readonly clientId: string };

export type ConsentView =
  /** Sin pedido, vencido o de un cliente que no existe. */
  | { readonly kind: "invalid" }
  /** Sin `mcp.connect`. */
  | { readonly kind: "forbidden" }
  | {
      readonly kind: "ready";
      readonly request: string;
      readonly clientName: string;
      readonly returnsTo: string;
      readonly email: string;
    };

export const decideConsentInput = z.object({
  request: z.string().min(1).max(4096),
  accept: z.boolean(),
});
export type DecideConsentInput = z.infer<typeof decideConsentInput>;
/** La dirección a la que el navegador sigue: la del cliente, con el código o con `access_denied`. */
export type DecideConsentResult = { readonly redirectTo: string };

export type McpErrorCode = ActionErrorCode | "consent_expired";
```

`request` es lo que el plugin le pasa a `consentPage` para identificar el pedido
(V-4).

### 4.11 Las herramientas (`src/modules/mcp/tools.ts`)

```ts
/**
 * D-MCP-7, D-MCP-8: registra las ocho herramientas sobre `server`, con el contexto
 * del pedido. Cada una mapea su entrada a la del módulo, llama a `operations` o a
 * `getTrackingCatalog`, y devuelve el resultado de `runTool`.
 */
export function registerTools(server: McpServer, context: McpContext): void;

/** D-MCP-8: corre el trabajo y traduce cualquier error con `failureOf`. */
export async function runTool<T>(
  work: () => Promise<T>,
  present: (value: T) => Record<string, unknown>,
  messages: ActionMessages,
): Promise<CallToolResult>;
```

- **`create_entry`**: `operations.createManualEntry(context, { ...input, id:
input.id ?? crypto.randomUUID() })`.
- **`update_entry`**: arma `{ id, changes }` con los campos presentes;
  `tagIds` va como `changes.tags`. Sin ningún campo, la operación responde
  `validation` con `bulkNoChanges`, como hoy.
- **`stop_timer`** sin `id`: `operations.getRunningEntry(context)`; `null`
  responde `not_found` con `noRunningTimer`; si no, `stopTimer` con su id. Si
  otro pedido lo detuvo en el medio, `already_stopped`.
- **`get_context`**: `timeSettingsOf(context)`, `dayKey(now, timezone)` y
  `getRunningEntry`.
- **`list_projects`**: `getTrackingCatalog(context.actor)`; no consulta más
  permisos que los suyos (`project.track`, `tag.view`).
- Los mensajes `forbidden` y `unexpected` de `runTool` son los de
  `timeEntryMessages` en las de entradas y los de `mcpMessages` en el resto.

### 4.12 El recurso (`src/modules/mcp/handler.ts` y `src/app/api/mcp/route.ts`)

```ts
/** D-MCP-6: el `POST` de `/api/mcp`. */
export async function handleMcpRequest(request: Request): Promise<Response>;
/** D-MCP-6: `GET` y `DELETE`: 405 con `Allow: POST`, o 404 con el MCP apagado. */
export function mcpMethodNotAllowed(): Response;
```

`handleMcpRequest`, en orden: `MCP_ENABLED` (404); `Origin` (403);
`readMcpContext` (401 o 403 con `mcpAuthErrorResponse`); `consumeCall(userId)`
(429); el servidor y el transporte de D-MCP-6, con `authInfo` armado del
`McpGrant` (el token no se copia: el SDK no lo necesita); la respuesta del
transporte con `Cache-Control: no-store`. Un error inesperado fuera de una
herramienta responde 500 con un JSON-RPC `-32603` y `console.error`.

`route.ts`: `POST` llama a `handleMcpRequest`; `GET` y `DELETE`, a
`mcpMethodNotAllowed`; `dynamic = "force-dynamic"`.

### 4.13 Los metadatos (`src/app/.well-known/…/route.ts`)

- `oauth-protected-resource/route.ts` y
  `oauth-protected-resource/api/mcp/route.ts`: `GET` con
  `protectedResourceMetadata()`.
- `oauth-authorization-server/route.ts` (y la variante con el camino del
  emisor, si lo tiene): `GET` con el cuerpo del plugin (V-2).
- Todos: 404 con el MCP apagado; `Access-Control-Allow-Origin: *`;
  `Cache-Control: public, max-age=300`.

### 4.14 El módulo `mcp`: service, repository y actions

**`repository.ts`**:

```ts
/**
 * D-MCP-12: suma un pedido al minuto en curso de `userId`, o reinicia la ventana si
 * el minuto cambió, en una sentencia; devuelve los pedidos del minuto.
 */
async consumeCall(userId: string): Promise<number>;
```

```sql
insert into mcp_call_window (user_id, window_start, calls)
values ($1, date_trunc('minute', now()), 1)
on conflict (user_id) do update
set calls = case when mcp_call_window.window_start = excluded.window_start
                 then mcp_call_window.calls + 1 else 1 end,
    window_start = excluded.window_start
returning calls;
```

**`service.ts`**:

```ts
/** D-MCP-12: `true` si el pedido entra en el minuto. */
export async function consumeCall(userId: string): Promise<boolean>;

/** D-MCP-4, §5.3: las autorizaciones propias; `disabled` con el MCP apagado. */
export async function getGrantsView(context: ProfileContext): Promise<GrantsView>;

/** D-MCP-4: `mcp.grant.revoke`, después `deleteGrant` en una transacción. Idempotente. */
export async function revokeGrant(
  actor: Actor,
  input: RevokeGrantInput,
): Promise<RevokeGrantResult>;

/** D-MCP-14, §5.1: lo que muestra `/conectar`. */
export async function getConsentView(
  context: SessionContext,
  request: string | null,
): Promise<ConsentView>;
```

**`actions.ts`** (`"use server"`):

```ts
export async function revokeGrant(
  input: RevokeGrantInput,
): Promise<ActionResult<RevokeGrantResult, McpErrorCode>>;
// handle(…, { paths: ["/perfil"], messages: { forbidden: grantForbidden, unexpected: unexpectedRevoke } })

export async function decideConsent(
  input: DecideConsentInput,
): Promise<ActionResult<DecideConsentResult, McpErrorCode>>;
// parse; con accept, assertCan(actor, "mcp.connect", workspace); llama al endpoint de
// consentimiento del plugin con las cabeceras del pedido (V-4); un pedido vencido o
// desconocido responde consent_expired. Cancelar no consulta permisos.
// handle(…, { paths: [], messages: { forbidden: consentForbidden, unexpected: unexpectedConsent } })
```

### 4.15 `team` (`src/modules/team/service.ts`)

Al desactivar, después de `deleteSessionsOf(tx, actor, target.userId)`:
`deleteGrantsOf(tx, actor, target.userId)` (D-MCP-5). El comentario de la
desactivación suma la cuarta escritura y el orden de bloqueos.

### 4.16 Las respuestas

| Situación                                                  | Respuesta                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------- |
| MCP apagado                                                | 404 en `/api/mcp`, metadatos, `/conectar`; sin sección en `/perfil`  |
| `GET` o `DELETE` a `/api/mcp`                              | 405, `Allow: POST`                                                   |
| `Origin` ajeno                                             | 403                                                                  |
| Sin token                                                  | 401, `WWW-Authenticate: Bearer resource_metadata="…", scope="clock"` |
| Token inválido, vencido, revocado, de otra audiencia       | 401, `error="invalid_token"`                                         |
| Sin el alcance `clock`                                     | 403, `error="insufficient_scope"`                                    |
| Consentimiento borrado, identidad o membresía que no pasan | 401, `error="invalid_token"`                                         |
| Más de 120 pedidos en el minuto                            | 429, `Retry-After: 60`, JSON-RPC `-32000` con `rateLimited`          |
| Cuerpo de más de 64 KiB                                    | 413                                                                  |
| Error de dominio en una herramienta                        | 200, resultado `isError: true` con `{ code, message }`               |
| Herramienta desconocida, JSON inválido                     | error JSON-RPC, del SDK                                              |
| Registro con una redirección fuera de la lista             | 400 `invalid_redirect_uri`                                           |
| Registro de un cliente con secreto                         | 400 `invalid_client_metadata`                                        |
| Consentimiento cancelado                                   | el cliente recibe `error=access_denied`                              |
| Consentimiento vencido                                     | `consent_expired`, «El pedido de conexión venció…»                   |
| Desconectar algo que ya no está                            | éxito sin escribir                                                   |

## 5. Pantallas

### 5.1 El consentimiento (`src/app/conectar/page.tsx`)

`ConnectPage({ searchParams }: PageProps<"/conectar">)`: `MCP_ENABLED` o
`notFound()`; `requireSession()`; `getConsentView(session, <request de los
parámetros>)`; `ConsentScreen` de `mcp/components/consent-screen.tsx` con la
vista y `decideConsent`. Misma caja que `/login` (centrada, `max-w-sm`).

- **`ready`**:
  - Título: «Conectar {clientName} con Clock».
  - Texto: «{clientName} va a poder ver, cargar, editar y borrar tus horas, y
    leer tus proyectos, tareas y etiquetas, con tu cuenta ({email}).».
  - Una línea en gris: «Vuelve a: {returnsTo}». `returnsTo` es el host de la
    redirección (`claude.ai`) o «esta computadora» para loopback. **El nombre
    lo declara el cliente; el destino es lo que se puede creer**, y por eso va
    siempre.
  - «Podés desconectarlo cuando quieras desde tu perfil.».
  - Botones «Cancelar» (secundario) y «Conectar» (primario).
- **`forbidden`**: el texto de `consentForbidden` y solo «Cancelar».
- **`invalid`**: «El pedido de conexión venció o no es válido. Volvé a
  conectar desde el asistente.», sin botones.
- **Al elegir**: los dos botones en `aria-disabled` y «Conectando…» en el
  primario; con éxito, `window.location.assign(redirectTo)`; con error, el
  mensaje en un `Alert` y los botones de nuevo, salvo `consent_expired`, que
  pasa a `invalid`.

### 5.2 `/login` con continuación

`LoginPage`: `const continuation = oauthContinuationOf(await searchParams)`.
Con sesión, `redirect(continuation ?? "/")`. El botón recibe
`callbackURL={continuation ?? "/"}`; `GoogleSignInButton` suma la prop
`callbackURL: string` con `"/"` por omisión. Un motivo de error se muestra como
hoy. Sin continuación, `/login` hace exactamente lo de hoy.

### 5.3 «Asistentes conectados» en `/perfil`

`ProfilePage` suma `getGrantsView(session)` y, si no es `disabled`, debajo de
`ProfileScreen`, `AssistantGrants` de `mcp/components/assistant-grants.tsx` con
la vista y `revokeGrant`. La página compone; ningún componente de `profile`
importa de `mcp`.

- **Encabezado** «Asistentes conectados» (`h2`, como las secciones del perfil)
  y el texto «Los asistentes que conectaste pueden ver y editar tus horas con tu
  cuenta. Cerrar la sesión no los desconecta.».
- **«Dirección para conectar»**: `serverUrl` en un campo de solo lectura con
  un botón «Copiar» (`navigator.clipboard.writeText`; al copiar, el botón dice
  «Copiada» y un `status` lo anuncia).
- **La lista** (`ul`), una fila por autorización: el nombre en negrita; debajo,
  en gris, «Vuelve a {returnsTo} · Conectado el {grantedOn}»; a la derecha,
  «Desconectar» si `canRevoke`.
- **Vacía**: «No conectaste ningún asistente.».
- **Desconectar** abre una confirmación (`AlertDialog`, como la de revocar una
  invitación): «¿Desconectar {nombre}?», «Va a dejar de poder ver y editar tus
  horas. Para volver a usarlo, conectalo de nuevo desde el asistente.»,
  «Cancelar» y «Desconectar» (`destructive`). Confirmar cierra el diálogo y
  manda el pedido; con éxito, la fila se va y un `status` dice «Desconectaste
  {nombre}.»; el foco va al encabezado de la sección. Con error, el mensaje y,
  con `unexpected`, «Reintentar». Un pedido a la vez.

### 5.4 Textos (`mcp/components/labels.ts`)

Los de §5.1 a §5.3. Los de error salen de `mcpMessages`.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no migra; el usuario migra producción con `!` antes del
push del merge que lo necesita. Previews públicos, con la rama `preview` de
Neon y `BETTER_AUTH_URL` declarada por rama.

### 6.1 Antes del push

1. **El usuario migra producción** (`npm run db:migrate` con la URL de
   producción). La migración solo suma: el código de `main` sigue igual.
2. **No toca las variables de producción**: sin `MCP_ENABLED`, el MCP queda
   apagado.

### 6.2 El despliegue

El team-lead mergea y pushea. Con el MCP apagado, lo único visible es que nada
cambió: `/perfil` sin sección, `/api/mcp` en 404. Lo que sí corre desde el
primer pedido: `auditActorOf` en todas las constancias (con
`oauth_client_id` nulo), `failureOf` en las actions, `operations.ts` en cinco
actions, y la desactivación con `deleteGrantsOf` (que borra cero filas).

### 6.3 Encenderlo

Después de §6.6 en un preview:

1. El usuario pone `MCP_ENABLED=true` en el entorno de producción de Vercel
   (y, si V-7 lo pidió, `MCP_REDIRECT_URIS` y `MCP_ALLOWED_ORIGINS`) y
   **vuelve a desplegar** el último despliegue: una variable nueva no llega a
   uno ya hecho.
2. **Humo**, con la cuenta del owner: en claude.ai, «Agregar conector
   personalizado» con `https://<producción>/api/mcp`; conectar, entrar con
   Google, ver `/conectar` con «Vuelve a: claude.ai», conectar; pedir «¿qué
   horas cargué esta semana?» (`get_context` y `list_entries`). En `/perfil`,
   la fila de Claude. Desconectar, y el pedido siguiente del asistente pide
   volver a conectar. **No se cargan horas de prueba en producción**: lo de
   escribir lo cubren la integración, la e2e y el preview.

### 6.4 Después

La consulta, sin urgencia, que muestra que ninguna persona inactiva conserva
autorizaciones (tiene que dar cero filas; los nombres de tabla según V-6):

```sql
with ws as (select id from workspace order by created_at, id limit 1)
select lower(btrim(u.email)) as correo, m.status as estado, count(c.*) as autorizaciones
from membership m
join ws on ws.id = m.workspace_id
join "user" u on u.id = m.user_id
join oauth_consent c on c.user_id = u.id
where m.status <> 'active'
group by u.email, m.status;
```

### 6.5 Apagar y revertir

- **Apagar**: `MCP_ENABLED=false` y volver a desplegar. Las autorizaciones
  quedan en la base y vuelven a servir al encenderlo.
- **Revertir**: `git revert -m 1 <merge>` y push. El código anterior no lee las
  tablas nuevas ni la columna; no hace falta la migración de reversión de §2,
  que solo se corre si se quiere borrar todo.

### 6.6 Preview

Para probar claude.ai contra un preview de `mejoras/mcp`, el usuario:

1. Declara en Vercel, entorno Preview, rama `mejoras/mcp`:
   `BETTER_AUTH_URL=https://<dirección del preview de la rama>` (sin ella,
   «invalid origin») y `MCP_ENABLED=true`.
2. Suma `https://<preview>/api/auth/callback/google` al cliente OAuth de
   Google, como en las otras ramas con `BETTER_AUTH_URL` propia.
3. Migra la rama `preview` de Neon.
4. En claude.ai, un conector personalizado con `https://<preview>/api/mcp`, con
   una cuenta que tenga membresía activa en esa base (datos sintéticos).

### 6.7 En local, con Claude Code

1. `docker compose up -d`, `npm run db:migrate`, `.env.local` con
   `MCP_ENABLED=true` y `BETTER_AUTH_URL=http://localhost:3000` (la
   especificación admite `http` para `localhost`).
2. `npm run dev`.
3. `claude mcp add --transport http clock-local http://localhost:3000/api/mcp`.
4. En Claude Code, `/mcp`, elegir `clock-local` y autenticar: abre el
   navegador, Google con la cuenta de siempre (el cliente de Google de
   desarrollo ya tiene el callback de `localhost`), `/conectar` con «Vuelve a:
   esta computadora», «Conectar».
5. Pedirle «¿qué cargué hoy?» y «cargá 9 a 10 en {proyecto}». La entrada
   aparece en `http://localhost:3000/`.

Sin Google, la sesión de prueba (`ALLOW_TEST_SESSION=true`) abre la sesión en el
navegador antes del paso 4, como en los e2e.

## 7. Reparto de archivos

### backend-dev

- **Primero**: V-1 a V-8 y las dos del árbol (§0), con el resultado en el
  registro; las dependencias en `package.json`. Después fija y avisa a
  `frontend-dev` y a `e2e-tester`: `GrantsView`, `ConsentView`, los inputs y
  resultados de las dos actions, `McpErrorCode`, `mcpMessages`, la prop
  `callbackURL` y `oauthContinuationOf`.
- `src/server/env.ts` (§4.1); `src/server/auth.ts` y la regeneración de
  `auth-schema.ts` (§4.2, §2); `src/server/oauth-records.ts` (§4.3);
  `src/server/mcp-auth.ts` (§4.4); `src/server/mcp-context.ts` (§4.5);
  `src/server/session.ts` (§4.6); `src/server/audit.ts` y cada constancia
  armada con un `Actor` (§4.7); `src/server/failure.ts` y `action.ts` (§4.8);
  `src/server/permissions/index.ts` (§3).
- `src/server/db/schema.ts` y la migración `0017_mcp` (§2).
- `src/modules/time-entry/operations.ts`, `actions.ts`, `service.ts`,
  `repository.ts`, `schema.ts` (§4.9).
- `src/modules/mcp/schema.ts`, `tools.ts`, `handler.ts`, `repository.ts`,
  `service.ts`, `actions.ts` (§4.10 a §4.14).
- `src/app/api/mcp/route.ts` y `src/app/.well-known/**/route.ts` (§4.12,
  §4.13).
- `src/modules/team/service.ts` (§4.15).
- `src/app/login/page.tsx` y `src/app/conectar/page.tsx`: las páginas, que
  componen; las pantallas son de `frontend-dev`.
- `CLAUDE.md`: en «Estructura», `api/mcp/`, `.well-known/`, `conectar/`,
  `modules/<modulo>/operations.ts`, `src/server/mcp-auth.ts`,
  `mcp-context.ts`, `oauth-records.ts` y `failure.ts`; en «Recorrido de una
  mutación», una línea: «Una herramienta del MCP sigue el mismo recorrido: el
  token reemplaza a la sesión (`readMcpContext`) y la operación compartida de
  `operations.ts` hace el resto.».

### frontend-dev

- `src/modules/mcp/components/`: `consent-screen.tsx`, `assistant-grants.tsx`,
  `revoke-grant-dialog.tsx`, `labels.ts` y sus tests de componente (§5.1, §5.3,
  §5.4).
- `src/components/layout/google-sign-in-button.tsx`: la prop `callbackURL`
  (§5.2).
- `src/app/(app)/perfil/page.tsx`: la composición de la sección (§5.3).

### test-engineer

- Los tests de integración de §9.2 que no son de `backend-dev`: el recorrido
  completo con tokens reales (`src/test/mcp.ts`, el helper que los emite) y la
  matriz de D-MCP-3. `backend-dev` escribe los de cada función que entrega.

### e2e-tester

- `e2e/mcp.ts`: el cliente de prueba (registro, PKCE, autorización en el
  navegador con la sesión de prueba, intercambio del código, `tools/call`).
- `e2e/mcp.spec.ts` con los recorridos de §9.3; confirma que fallan antes de la
  implementación.
- `e2e/database.ts`: `grantCountOf(email)`.

### security-reviewer

Revisa D-MCP-2, D-MCP-3, D-MCP-4, D-MCP-6 y D-MCP-14 contra la especificación
de autorización de MCP y contra el código, antes del merge.

### Lo que no toca nadie

`access.ts`, `entry.ts`, `test-session.ts`, `workspace/`, `report/` y
`project/` (salvo sus constancias), `next.config.ts` y el cron.

### Orden

1. `backend-dev`: §0 entero. Si algo falla, se para.
2. `backend-dev`: los tipos y textos de §4.10 y la prop; avisa.
3. En paralelo: `backend-dev` con el servidor; `frontend-dev` con las pantallas;
   `e2e-tester` con el arnés y el spec; `test-engineer` con el helper y la
   matriz.
4. Revisiones, con `security-reviewer`; correcciones; la e2e en una base nueva
   y en una que se reusa; la prueba de §6.6 con claude.ai, que hace el usuario.

## 8. Criterios de aceptación

1. **Descubrimiento**: con el MCP encendido, `POST /api/mcp` sin token responde
   401 con `WWW-Authenticate` que apunta a
   `/.well-known/oauth-protected-resource/api/mcp`; esa dirección y la raíz
   devuelven `resource`, `authorization_servers` y `scopes_supported`; los
   metadatos del servidor de autorización anuncian el registro, PKCE `S256` y
   los dos alcances.
2. **Registro con lista**: un registro con
   `https://claude.ai/api/mcp/auth_callback` y uno con
   `http://127.0.0.1:53111/callback` se crean; uno con
   `https://evil.example/cb`, o con una lista que mezcle una permitida y una
   no, responde 400 sin fila; uno que pide secreto responde 400.
3. **El recorrido completo**: registro, autorización con PKCE y `resource`,
   `/login` sin sesión que vuelve a la autorización después de entrar,
   `/conectar` con el nombre y «Vuelve a», «Conectar», código, token con
   refresh, `initialize`, `tools/list` con las ocho, `tools/call`. Funciona con
   Claude Code en local y con claude.ai en el preview (§6.6, lo verifica el
   usuario).
4. **Cancelar**: el cliente recibe `access_denied` y no queda autorización.
5. **Cada herramienta hace lo de su action**: `create_entry` crea la entrada
   con las horas de pared en la zona del perfil, el facturable por omisión del
   proyecto y las etiquetas; `update_entry` con `times`, `project`, `tagIds` y
   `runningStart`; `delete_entry`; `start_timer` cierra el que corría en el
   mismo instante; `stop_timer` con y sin id; `list_entries` con el corte por
   día de inicio; `list_projects` con lo que el selector del rastreador
   ofrece; `get_context` con zona, hoy y el timer.
6. **Los mismos errores**: una entrada de otra persona responde `forbidden`
   con «No tenés permiso para editar esta entrada.»; una de otro workspace,
   `not_found`; un proyecto privado ajeno, el error de `assertTrackable`; una
   hora que no existe, `nonexistentClock`; un período de 32 días,
   `periodTooLong`; `stop_timer` sin timer, `noRunningTimer`. Todos como
   resultado `isError: true` con código y texto, sin escribir.
7. **Idempotencia** (ADR 0007): `create_entry` y `start_timer` con el mismo
   `id` dos veces dejan una fila y una constancia; sin `id`, dos llamadas
   crean dos.
8. **El audit log**: cada constancia que deja una herramienta tiene
   `actor_id` de la persona y `oauth_client_id` del cliente; las de la
   pantalla, nulo. Todas las constancias que dejan los tests de integración de
   la pantalla siguen iguales.
9. **Nunca más que una sesión** (D-MCP-3), cada uno con 401 y sin escribir:
   token vencido; token de otra audiencia; consentimiento borrado por SQL;
   membresía pasada a `inactive` por SQL; externo con la invitación revocada;
   correo cuyo dominio salió de `GOOGLE_WORKSPACE_DOMAINS` sin invitación;
   `user` borrado. Sin el alcance `clock`, 403.
10. **Desconectar** (D-MCP-4): desde `/perfil`, la fila se va, queda
    `mcp.revoke`, el token de acceso vigente recibe 401 en el pedido siguiente y
    el refresh token no emite otro. Desconectar otra vez responde éxito sin
    constancia. Un `clientId` de otra persona no borra nada.
11. **Desactivar revoca** (D-MCP-5): el owner desactiva a P con dos asistentes
    conectados: cero consentimientos y tokens de P, `mcp.revokeAll` con
    `{ clients: 2 }`, y el criterio 1 de E2 sigue valiendo. Si algo falla
    después, todo vuelve atrás (criterio 17 de E2). Reactivar no devuelve
    autorizaciones.
12. **Límite por persona**: el pedido 121 del minuto responde 429 con
    `Retry-After`; el primero del minuto siguiente pasa; otra persona no se
    entera.
13. **Transporte**: `GET` y `DELETE` responden 405; un cuerpo de 70 KiB, 413;
    un `Origin: https://evil.example`, 403; uno de `MCP_ALLOWED_ORIGINS` y uno
    ausente pasan; ninguna respuesta lleva `Mcp-Session-Id`.
14. **Interruptor**: con `MCP_ENABLED` sin declarar, `/api/mcp`, los
    metadatos y `/conectar` responden 404, los endpoints del plugin no existen
    y `/perfil` no tiene la sección. El resto de la aplicación igual.
15. **`/login`**: sin continuación, lo de hoy (redirige a `/` con sesión, el
    botón con `callbackURL: "/"`); con una continuación válida, la sigue; con
    una que apunta a otro origen o a otro camino, la ignora.
16. **Las pantallas**: `/conectar` en sus tres estados con sus textos;
    «Asistentes conectados» con la dirección para copiar, la lista, el vacío,
    la confirmación, el aviso y el foco de §5.3.
17. **La e2e entera en verde**, en una base nueva y en una que se reusa; los
    recorridos de ingreso, perfil y equipo sin cambiar lo que afirman.

## 9. Plan de tests

### 9.1 Unidad

- `mcp-auth.test.ts`: `isAllowedRedirect` (exacta, loopback con y sin puerto,
  `localhost` con `https`, `127.0.0.2`, `localhost.evil.example`, mayúsculas,
  barra final); `oauthContinuationOf` (válida, otro origen, `//evil`, otro
  camino, repetida); `protectedResourceMetadata`.
- `mcp-context.test.ts`: `mcpAuthErrorResponse` con cada caso.
- `permissions.test.ts`: `mcp.connect` y `mcp.grant.revoke` con cada rol, con
  un actor inactivo, sobre otro workspace y, la segunda, sobre otra persona.
- `audit.test.ts`: `auditActorOf` con y sin cliente.
- `failure.test.ts`: los cuatro caminos de `failureOf`, mudados de los de
  `action.ts` si los hay.
- `env.test.ts`: las tres variables, ausentes y con valores.
- `time-entry/schema.test.ts`: `entriesPeriodInput` (invertido, 31 y 32 días,
  día inválido).
- `mcp/schema.test.ts` y `tools.test.ts`: los esquemas de entrada; el mapeo de
  `update_entry` a `changes`; `toolEntryOf`.
- Los tests de componente de `consent-screen`, `assistant-grants` y
  `revoke-grant-dialog`; `login/page.test.tsx` con y sin continuación;
  `google-sign-in-button` con la prop.

### 9.2 Integración (Postgres)

- **`src/test/mcp.ts`**, el helper de `test-engineer`: `issueTestGrant(email,
{ redirectUri })` corre registro, autorización, consentimiento y token contra
  `auth.handler` con la cookie de la sesión de prueba, y devuelve el token de
  acceso, el refresh y el `clientId`. `callMcp(token, body)` llama a
  `handleMcpRequest` con un `Request` armado.
- **`mcp/handler.integration.test.ts`**: criterios 1, 9 (cada fila), 12 y 13,
  por `handleMcpRequest`. El 12 con `MCP_CALLS_PER_MINUTE` pedidos seguidos;
  el cambio de minuto, escribiendo `window_start` un minuto atrás.
- **`mcp/tools.integration.test.ts`**: criterios 5 a 8 por `tools/call`: cada
  herramienta, sus errores y las constancias con `oauth_client_id`. El 8 cuenta
  las filas nuevas de `audit_log` de cada llamada y afirma el cliente en todas.
- **`mcp/service.integration.test.ts`**: `getGrantsView`, `revokeGrant`
  (criterio 10, también con el `clientId` de otra persona), `getConsentView` en
  sus tres estados, `consumeCall`.
- **`mcp/actions.integration.test.ts`**: `revokeGrant` y `decideConsent` con
  cada fila de §4.16 que les toca; sin sesión, a `/login` sin escribir.
- **`oauth-records.integration.test.ts`**: `listGrantsOf`, `hasGrant`,
  `deleteGrant` y `deleteGrantsOf` borran solo lo de la persona, dejan su
  constancia y no la dejan sin filas.
- **`auth.integration.test.ts`**: criterio 2 por el handler; el criterio 14
  con el interruptor apagado; el ingreso por Google sin cambios.
- **`team/service.integration.test.ts`**: criterio 11, con `issueTestGrant`
  dos veces para P; el fallo inyectado de E2 después de `deleteGrantsOf`.
- **`time-entry/service.integration.test.ts`**: `listEntriesOfPeriod` (corte
  por día de inicio en la zona, el timer aparte, el tope con `truncated`) y
  `getRunningEntry`.
- **`session.integration.test.ts`**: `readUserContext` da lo mismo que
  `readSession` para los casos que ya prueba.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores. En particular: sin el paso 4 de D-MCP-3
el criterio 10 falla con un token autocontenido; sin `deleteGrantsOf`, el 11.

### 9.3 E2E (`e2e/mcp.spec.ts`)

Con correos y nombres únicos, sin afirmar sobre la base entera.

1. **Conectar y cargar**: P entra con `signIn`. El cliente de prueba registra
   `http://127.0.0.1:<puerto>/callback`, abre la autorización en la pestaña de
   P, `/conectar` muestra el nombre y «Vuelve a: esta computadora», P elige
   «Conectar», la prueba captura el código con `page.route`, lo cambia por un
   token y llama a `create_entry` con un proyecto de P. En `/`, la entrada está.
   En `/perfil`, «Asistentes conectados» tiene la fila.
2. **Desconectar**: P elige «Desconectar», confirma; el aviso dice
   «Desconectaste {nombre}.»; `tools/call` con el mismo token responde 401;
   `grantCountOf(P)` en 0.
3. **Cancelar**: en `/conectar`, «Cancelar» lleva al callback con
   `error=access_denied`; `/perfil` sin la fila.
4. **Sin sesión**: la autorización abierta en una pestaña sin sesión lleva a
   `/login`; con la sesión de prueba abierta en esa pestaña, volver a la
   continuación llega a `/conectar` (el ingreso con Google no se automatiza).
5. **Desactivar corta**: con P conectada, el owner la desactiva desde
   `/equipo`; `tools/call` responde 401 y `grantCountOf(P)` da 0.

### 9.4 Lo que no se prueba en e2e

El ingreso con Google (como siempre); claude.ai y Claude Code, que prueba el
usuario en §6.6 y §6.7; el límite de frecuencia, el tamaño del cuerpo y el
`Origin` (integración); el refresh y su rotación (integración, si V-6 deja
emitirlos en el helper).

## 10. Riesgos

- **El plugin no es lo que este contrato supone** (D-MCP-1): §0 lo frena antes
  de escribir código. Si V-1 o V-2 fallan, el slice vuelve al ADR.
- **Phishing de consentimiento con un cliente de la lista**: alguien registra un
  cliente llamado «Clock oficial» con la redirección de claude.ai; el código iría
  a claude.ai, no al atacante, así que no le sirve. Con loopback, el código va a
  la computadora de la persona: un atacante tendría que estar corriendo en ella.
  La pantalla muestra el destino.
- **Registros de clientes que nadie usa**: el registro es abierto y el
  limitador de Better Auth es por instancia (D-MCP-12). Cada registro es una
  fila sin acceso a nada. Si crecen, una limpieza de clientes sin
  consentimiento de más de un día entra en el cron; no se hace ahora.
- **Una herramienta futura que escriba sin `auditActorOf`** perdería la marca:
  el criterio 8 cuenta las constancias de cada llamada, y una herramienta nueva
  suma su caso.
- **Una regla nueva en una action que no pasa por `operations.ts`**: solo cinco
  actions la usan. Una herramienta nueva sobre otra operación la muda primero.
- **El paso 4 de D-MCP-3 se pierde en un cambio futuro**: con tokens
  autocontenidos, revocar dejaría de ser inmediato. El criterio 10 lo frena.
- **El costo por pedido**: verificar, leer el consentimiento, la identidad, el
  contexto, el perfil y el límite son unas seis consultas por índice antes de
  la herramienta. Un asistente hace pocas llamadas por minuto.
- **El modelo escribe horas en una zona equivocada** si no llama a
  `get_context`: las descripciones lo piden y la respuesta de cada entrada trae
  la hora de pared y el instante ISO.
- **Borrar es irreversible**: `delete_entry` lleva `destructiveHint`, y
  claude.ai pide confirmación antes de usarla. La constancia guarda la fila
  entera (TT-61), como en la pantalla.
- **Una pestaña abierta no ve lo que cargó el asistente** hasta navegar o
  recargar (D-MCP-6), como con otro dispositivo.
- **Las variables de producción**: encender sin volver a desplegar no hace
  nada (§6.3).

## 11. Para decidir el usuario

1. **¿Aceptás el ADR 0026?** Con dos dependencias de producción nuevas
   (`@better-auth/oauth-provider` y `@modelcontextprotocol/sdk`). Recomiendo
   sí.
2. **¿Qué clientes se pueden conectar?** Recomiendo **solo Claude** al
   principio: las redirecciones de claude.ai y claude.com, y loopback para
   Claude Code. Otro cliente (ChatGPT, Cursor) se habilita sumando su
   redirección a `MCP_REDIRECT_URIS`, sin código. La alternativa —aceptar
   cualquier redirección— abre el phishing de §10 con un destino del atacante.
3. **¿La vida de los tokens?** Recomiendo acceso de 1 hora y refresh de 30
   días con rotación: con un uso por mes, la persona no vuelve a autorizar, y
   desconectar o desactivar corta al instante igual (D-MCP-3, paso 4). Más
   corto obliga a reconectar seguido en el móvil.
4. **¿Encender en producción después del preview**, con `MCP_ENABLED` apagado
   por omisión? Recomiendo sí (§6.3).
5. **¿Puede el asistente borrar entradas?** El pedido decía «cargar, ver y
   editar»; el team-lead sumó borrar al mínimo. Recomiendo dejarla, con
   `destructiveHint`, que hace que claude.ai pida confirmación.
6. **¿Owner y admin necesitan ver o desconectar los asistentes de otras
   personas, o apagar el MCP para el workspace?** Recomiendo que no en este
   slice: desactivar a alguien ya los corta, y el interruptor es de entorno. Si
   hace falta, es un slice aparte con su permiso.

## 12. Fuera de alcance

- **Más herramientas**: continuar, duplicar, descartar el timer, las masivas,
  la planilla, crear clientes, proyectos, tareas o etiquetas, el reporte y
  cualquier dato de otra persona.
- **Un alcance de solo lectura** y el consentimiento con elección (D-MCP-2).
- **Que owner o admin vean o revoquen autorizaciones ajenas**, y un interruptor
  por workspace (§11, pregunta 6).
- **Registro por documento de metadatos del cliente** (`client_id` como URL),
  salvo que V-7 muestre que claude.ai lo exige y el plugin lo ofrezca.
- **Notificaciones del servidor, recursos y prompts de MCP.**
- **La limpieza de clientes sin consentimiento** en el cron (§10).
- **E6 (quitar del equipo)** llama a `deleteGrantsOf` cuando llegue: lo anota
  su contrato.
