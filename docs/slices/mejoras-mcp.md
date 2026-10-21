# Mejora 3: un servidor MCP para cargar horas

Contrato del slice de la mejora 3 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md). **Un asistente ve, carga, edita
y borra las horas de una persona con la cuenta de esa persona**: los de
Anthropic —claude.ai como conector remoto (web, escritorio, móvil) y Claude
Code— y los de OpenAI —ChatGPT como conector remoto y los clientes MCP de
OpenAI que autorizan con OAuth, como Codex—. La persona conecta el asistente
pegando una dirección, entra con Google como siempre, autoriza en una pantalla
de Clock y, desde su perfil, ve y desconecta lo que conectó. Cada herramienta
pasa por los mismos services, el mismo `can()` y el mismo audit log que la
pantalla.

- **Fuente:** el pedido del usuario del 2026-10-19 (OAuth según la
  especificación de autorización de MCP, la autorización con el login de Google
  de Clock) y sus decisiones del mismo día sobre §11. **No es paridad con
  Clockify**: no pasa por `parity-analyst` y no tiene identificadores de
  paridad. Los textos de interfaz son propios.
- **Lugar en el plan:** fuera del mapa de la fase 2, como las otras mejoras
  pedidas. Depende de E2 (en `main` desde `27774d6`) y de **la actualización de
  Better Auth a 1.7.10**, que va sola, mergeada y desplegada antes (§0). Corre en
  paralelo con E2b (§1, «Coordinación con E2b»).
- **Revisión:** `architecture-reviewer` aprobó con cambios dos veces el
  2026-10-19, después de bajar y leer `@better-auth/oauth-provider` 1.7.7,
  1.7.10 y 1.7.11. Los cambios de las dos rondas están aplicados. Pendiente de
  `security-reviewer` antes del merge.
- **Decisiones de arquitectura:**
  - **[ADR 0026](../adr/0026-el-servidor-mcp-autoriza-con-oauth-de-better-auth-y-atiende-sin-estado.md),
    aceptado el 2026-10-19 por el usuario**: quién emite los tokens y con qué
    forma, cómo un token se vuelve un actor, el corte al autorizar, el
    transporte sin estado, la columna del audit log y el interruptor.
  - [ADR 0025](../adr/0025-un-modulo-escribe-en-otro-por-su-service.md): las
    tablas del plugin son de Better Auth y las escribe `src/server/` con la
    transacción de quien llama (D-MCP-5); desactivar revoca por una función de
    ese dueño (D-MCP-6).
  - [ADR 0024](../adr/0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md):
    la regla de ingreso no cambia y se aplica a un token en cada pedido y a
    cada autorización (D-MCP-3, D-MCP-4).
  - [ADR 0007](../adr/0007-el-cliente-elige-el-id-de-las-altas.md): las altas
    aceptan el id del cliente, opcional en la herramienta (D-MCP-10).
  - [ADR 0011](../adr/0011-las-acciones-en-masa-son-todo-o-nada.md) y
    [ADR 0013](../adr/0013-el-dialogo-de-una-entrada-guarda-en-una-mutacion.md):
    los errores y la edición de una entrada se reusan tal cual (D-MCP-9,
    D-MCP-8).

Decisiones del usuario que el contrato da por tomadas (2026-10-19): OAuth y no
tokens personales; cada persona autoriza con su login de Google de Clock; el
ADR 0026; los clientes de Anthropic y de OpenAI; y las demás de §11, todas
decididas. Decisiones del team-lead sobre la revisión (2026-10-19): Better Auth
fijo en 1.7.10, en un cambio aparte y previo; token JWT; el plugin cargado
siempre; sin la regla de clientes públicos.

**Nada del slice depende de que el cliente sea uno en particular.** La regla de
acceso, las herramientas, los textos de las pantallas, los límites y las
anotaciones son los mismos para cualquiera. Lo único que cambia por cliente es
la lista de redirecciones y de `Origin` (D-MCP-2, D-MCP-7), y cómo se registra
uno que no lo hace solo (D-MCP-2).

## Decisiones del contrato

**D-MCP-1 — Better Auth 1.7.10 emite los tokens, con `oauthProvider` a mano y
el plugin `jwt` (ADR 0026, decisión 1).**

- **La versión.** En 1.7.7, un registro sin `application_type` se toma como
  `web` y rechaza las redirecciones `http` de loopback: Claude Code no se
  registra. `clientRegistrationDefaultApplicationType: "infer"` existe desde
  1.7.8 (en 1.7.10, `authorize-dkOG8GqZ.mjs:1718-1722`). Better Auth se fija
  exacto, sin `^`, en 1.7.10, con `better-call` 1.4.2 y `@better-auth/utils`
  0.5.0. **La actualización no es parte de este slice**: va sola y primero
  (§0). Este slice arranca sobre `main` con 1.7.10 fijado y suma
  `@better-auth/oauth-provider` 1.7.10 exacto, sin `^`.
- **`oauthProvider` a mano y no `@better-auth/mcp`.** `mcp()` arma el mismo
  plugin con `resources`, los metadatos del recurso y
  `refreshTokenReuseInterval: 30`. Clock necesita además la validación de
  redirecciones, los privilegios de clientes y recursos, el límite del
  registro, los tipos de concesión y la forma del token, que con `mcp()` habría
  que dejar pasar; los metadatos del recurso son cuatro campos. La
  configuración entera queda en `src/server/mcp-auth.ts`, a la vista de
  `security-reviewer`.
- **El plugin `jwt`** firma los tokens de acceso y guarda sus claves en `jwks`
  (D-MCP-3). Va con `disableSettingJwtHeader: true`: sin eso, cada
  `get-session` firma un JWT para la sesión web y lo manda en la cabecera
  `set-auth-jwt`, con el MCP encendido o apagado. Su endpoint `/token`, que
  emite ese mismo JWT a pedido, va a `disabledPaths`.
- **Alternativas** (ADR 0026): un servidor propio, un proveedor externo y Google
  como servidor.

**D-MCP-2 — El descubrimiento, el registro y los endpoints abiertos.**

- **El recurso** es `<BETTER_AUTH_URL>/api/mcp`, sin barra final. Es la
  audiencia de los tokens (RFC 8707) y la dirección que la persona pega en el
  asistente.
- **El emisor** es `<BETTER_AUTH_URL>/api/auth`.
- **Metadatos del recurso protegido** (RFC 9728), en
  `/.well-known/oauth-protected-resource/api/mcp` —la dirección con el camino
  del recurso, que un cliente prueba primero— y en
  `/.well-known/oauth-protected-resource`, con el mismo cuerpo: `resource`,
  `authorization_servers: ["<BETTER_AUTH_URL>/api/auth"]`, `scopes_supported:
["clock", "offline_access"]` y `bearer_methods_supported: ["header"]`.
- **Metadatos del servidor de autorización** (RFC 8414) en
  `/.well-known/oauth-authorization-server/api/auth` —la del emisor con camino,
  que es la que corresponde— y en `/.well-known/oauth-authorization-server`, con
  el cuerpo de `oauthProviderAuthServerMetadata(auth)`. Next 16 sirve rutas en
  `.well-known` (`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md:113-118`).
  Si V-7 muestra que ChatGPT exige un campo que no publicamos (por ejemplo,
  `/.well-known/openid-configuration`), se suma ahí.
- **Dos alcances**: `clock` —«ver, cargar, editar y borrar tus horas, y leer tus
  proyectos, tareas y etiquetas»— y `offline_access`, que el plugin exige para
  emitir el refresh token. **El 401 pide los dos** (`scope="clock
offline_access"`): un cliente que autoriza con los alcances del 401 recibe
  refresh. Un alcance de solo lectura no entra (§12).
- **Dos tipos de concesión**: `grantTypes: ["authorization_code",
"refresh_token"]`. Sin `client_credentials`: ningún cliente actúa sin una
  persona.
- **El recurso es obligatorio**: `resources: [mcpResourceUrl()]`,
  `clientRegistrationDefaultResources: [mcpResourceUrl()]` y
  `enforcePerClientResources`, que es `true` por omisión. Una autorización sin
  `resource` la corta el gancho de D-MCP-4; una con otro la rechaza el plugin
  con `invalid_target`.
- **Registro dinámico abierto** (`allowDynamicClientRegistration` y
  `allowUnauthenticatedClientRegistration`), con
  `clientRegistrationDefaultApplicationType: "infer"`. La especificación lo
  prevé así para que los asistentes se registren solos. El plugin rechaza
  `skip_consent` en un registro dinámico. **Se aceptan clientes públicos y
  confidenciales por igual**: la amenaza es el destino de la redirección, que
  cubre la lista.
- **Toda redirección tiene que estar en la lista**, al registrar y al
  autorizar:
  - las de `MCP_REDIRECT_URIS`, comparadas exactas. Por omisión:
    - `https://claude.ai/api/mcp/auth_callback` (claude.ai);
    - `https://claude.com/api/mcp/auth_callback` (claude.ai, dominio nuevo);
    - `https://chatgpt.com/connector_platform_oauth_redirect` (conectores de
      ChatGPT).
      **Las tres son a confirmar** en V-7, contra la documentación de cada
      proveedor y contra el registro real en el preview; ninguna se mergea sin
      esa confirmación;
  - cualquier dirección de loopback: esquema `http`, host `localhost` o
    `127.0.0.1`, cualquier puerto y cualquier camino (RFC 8252, §7.3). Es la de
    Claude Code y la de los clientes de línea de comandos de OpenAI, como Codex
    (V-7 lo confirma).

  **Al registrar**, el gancho `hooks.before` del camino de registro rechaza con
  400 `invalid_redirect_uri` un cuerpo con alguna dirección fuera de la lista,
  sin crear la fila. **Al autorizar**, `validateRedirectUri` del plugin es
  `(uri, _registered, matched) => matched && isAllowedRedirect(uri,
env().MCP_REDIRECT_URIS)`: exige **las dos cosas**, que la dirección sea una
  de las que el cliente registró (`matched`, el resultado que el plugin decidió
  por su cuenta) y que siga en la lista. Devolver solo `isAllowedRedirect`
  aceptaría una dirección permitida que el cliente nunca registró. Así, achicar
  la lista corta también a los clientes ya registrados. **Por qué la lista**:
  sin ella, cualquiera registra un cliente con el nombre de un asistente
  conocido y su propio destino, y le manda a una persona de Clock un enlace
  para autorizarlo; el código iría a ese destino.

- **Un cliente que no se registra solo** —si V-7 muestra que ChatGPT, u otro,
  necesita un cliente creado de antemano o confidencial— entra **sin abrir el
  registro**: `scripts/oauth-client/main.ts`, que corre el usuario con
  `--dry-run` y `--apply` como los demás scripts, crea el cliente del lado del
  servidor con la API del plugin (`auth.api`, donde `disabledPaths` no aplica,
  como con `getJwks`), con un nombre y redirecciones que tienen que pasar
  `isAllowedRedirect`, y muestra una sola vez el `client_id` y, si es
  confidencial, el secreto, para pegarlos en la configuración del conector. El
  cliente pasa por la misma autorización, el mismo consentimiento y el mismo
  `validateRedirectUri` que cualquier otro. Se escribe solo si V-7 lo pide; el
  contrato no lo da por necesario.
- **Quedan abiertos** `/oauth2/authorize`, `/oauth2/token`, `/oauth2/register`,
  `/oauth2/consent` y `/oauth2/revoke`, más `/jwks` del plugin `jwt`, que
  publica las claves públicas que anuncian los metadatos.
- **Van a `disabledPaths`, siempre**: `/oauth2/create-client`,
  `/oauth2/get-client`, `/oauth2/get-clients`, `/oauth2/update-client`,
  `/oauth2/delete-client`, `/oauth2/client/rotate-secret`,
  `/oauth2/client/rotate-keys`, `/oauth2/public-client`,
  `/oauth2/public-client-prelogin`, `/oauth2/get-consent`,
  `/oauth2/get-consents`, `/oauth2/update-consent`, `/oauth2/delete-consent`,
  `/oauth2/userinfo`, `/oauth2/end-session`, `/oauth2/end-session/confirm`,
  `/oauth2/introspect`, `/oauth2/continue`, `/admin/oauth2/create-client`,
  `/admin/oauth2/update-client` y `/token` del plugin `jwt`. **Las de
  recursos** (`/admin/oauth2/resources/:identifier…`) llevan parámetros y
  `disabledPaths` compara exacto: se cierran con `resourcePrivileges: () =>
false`. Las de administración de clientes son `SERVER_ONLY` (por HTTP no
  existen) y por `auth.api` se cierran con `clientPrivileges: () => false`: el
  plugin no lo consulta en un registro sin sesión, así que el registro dinámico
  anónimo es el único que crea clientes (un registro que llega con la cookie de
  una sesión recibe 401). **Por qué**: un endpoint de administración deja crear
  o editar un cliente con cualquier destino sin pasar por el gancho del
  registro.
- **Los límites del plugin** se escriben explícitos: `rateLimit.register` en 5,
  `rateLimit.token` en 20 y `rateLimit.authorize` en 30, cada 60 segundos
  (D-MCP-13).

**D-MCP-3 — Del token al actor, en cada pedido; nunca más que una sesión
(ADR 0026, decisiones 2 y 4).** El token de acceso es un **JWT** firmado por el
plugin `jwt` (sale JWT porque toda autorización lleva `resource`,
`introspect-BVm_zFQC.mjs:1807`). Trae `sub`, `azp`, `client_id`, `scope`,
`sid`, `jti`, `aud` (el recurso), `iss` (`<BETTER_AUTH_URL>/api/auth`) y `typ:
"at+jwt"`. `readMcpContext(request)` (§4.5), en este orden:

| Paso | Qué                                                                                                                                                                                                                                                                  | Si no                                                    |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1    | `Authorization: Bearer <token>`, uno solo                                                                                                                                                                                                                            | 401, `WWW-Authenticate` sin `error`                      |
| 2    | `verifyJwsAccessToken(token, { jwksFetch: () => auth.api.getJwks(), jwksCacheKey, verifyOptions: { issuer: "<BETTER_AUTH_URL>/api/auth", audience: mcpResourceUrl(), typ: "at+jwt" } })` de `better-auth/oauth2` (`core/dist/oauth2/verify.d.mts:95`), en el proceso | 401 `invalid_token`                                      |
| 3    | `scope` incluye `clock`                                                                                                                                                                                                                                              | 403 `insufficient_scope`, `scope="clock offline_access"` |
| 4    | `hasGrant(sub, azp)`: el consentimiento del par persona-cliente sigue en la base                                                                                                                                                                                     | 401 `invalid_token`                                      |
| 5    | La fila de `user` de `sub` existe                                                                                                                                                                                                                                    | 401 `invalid_token`                                      |
| 6    | `readUserContext(user)` (§4.6): identidad por pedido y `ensureWorkspaceContext`, como la sesión                                                                                                                                                                      | 401 `invalid_token`                                      |
| 7    | `can(actor, "mcp.connect", workspace)`: membresía activa                                                                                                                                                                                                             | 401 `invalid_token`                                      |

- **`typ: "at+jwt"`** distingue un token de acceso de cualquier otro JWT que
  firmen las mismas claves.
- **`sub` es la persona y `azp` el cliente. No se mira `sid`**: el token no
  queda atado a la sesión web. Con el token opaco del plugin, que sí lo queda,
  pasados los 14 días de la sesión sin abrir Clock cada token nuevo nacería
  inactivo y el asistente dejaría de andar sin motivo visible. El token de
  acceso y el refresh siguen sirviendo después de cerrar la sesión web y con la
  sesión vencida (criterio 10; decisión del usuario, §11).
- **El paso 4 es el corte de revocación**: un JWT no se puede anular antes de
  que venza, y desconectar desde `/perfil` o desactivar borra el
  consentimiento; el pedido siguiente no pasa. Es una lectura por índice.
- **`jwksCacheKey`** guarda las claves públicas por instancia: es una caché de
  material público, no estado de la aplicación. Una clave nueva (rotación de
  `jwt`) la recarga `verifyJwsAccessToken` al no encontrar el `kid`.
  `auth.api.getJwks()` funciona con `/jwks` en `disabledPaths`
  (`api/index.mjs:166-168`).
- **Los pasos 5 y 6 son los de una sesión abierta** (`session.ts:50-81`): un
  externo cuya invitación se revocó, un correo cuyo dominio salió de la
  política, una persona quitada del equipo —E6— quedan afuera por el mismo
  motivo que en la pantalla. La función es una sola (§4.6).
- **El paso 7 es más estricto que la pantalla**: una sesión con la membresía
  inactiva ve la pantalla en solo lectura (TT-92), y un token no ve nada. En el
  uso normal el caso no existe: desactivar ya borró la autorización (D-MCP-6).
- **Por qué 401 y no 403 en los pasos 4 a 7**: el cliente vuelve a autorizar, y
  ese camino termina en `/login` con el motivo por el gancho de D-MCP-4. Con 403
  el asistente mostraría un error sin salida.
- **El actor es el de la sesión más el cliente**: `{ ...context.actor,
oauthClientId: azp }` (D-MCP-12). Mismo `userId`, mismo `workspaceId` (el de
  la base, nunca de la entrada), mismo rol y estado, y la zona horaria y el
  primer día de la semana del perfil, por `trackerWorkspaceOf(context)`.
- **Por qué un token nunca da más que una sesión**: decide lo mismo con los
  mismos hechos en cada pedido, para cualquier cliente, y las herramientas son
  operaciones que la pantalla ya ofrece, por el mismo `can()` y el mismo
  service. No hay ninguna herramienta sobre datos de otra persona ni de
  administración.

**D-MCP-4 — Autorizar exige lo mismo que el pedido (ADR 0026, decisión 5).**
`/oauth2/authorize` y `/oauth2/consent` solo piden una sesión de Better Auth, y
una sesión sigue viva para un externo revocado o un correo cuyo dominio salió de
la política. Sin un corte acá, el asistente cae en un bucle silencioso: 401,
autorizar, código, token, 401. **La puerta**, en `hooks.before`
sobre esos dos caminos (`mcpAuthMiddleware`), en este orden:

| Camino      | Qué                                        | Si no                                                                                                                         |
| ----------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `authorize` | `resource` presente                        | 400 `invalid_request`, **sin redirigir**                                                                                      |
| los dos     | Sin sesión                                 | sigue: `authorize` manda a `loginPage` como siempre; `consent` responde el 401 del plugin                                     |
| los dos     | `readUserContext(session.user)` es `ready` | `authorize`: redirección a `/login?error=<motivo>`, el de `SessionRead`; `consent`: `APIError("FORBIDDEN", { code: motivo })` |
| los dos     | `can(actor, "mcp.connect", workspace)`     | lo mismo, con `membresia_inactiva`                                                                                            |

Las dos últimas filas son `readAssistantContext(user)` de `mcp-auth.ts`, la
misma que usa `readMcpContext` (D-MCP-3).

- **El `resource` lo valida el plugin**: el gancho solo exige que esté. Uno
  distinto de `mcpResourceUrl()` lo rechaza el plugin con `invalid_target`,
  **después** de validar la redirección contra el registro del cliente y la
  lista (`validateRedirectUri`). El gancho no redirige nunca a un
  `redirect_uri`: uno que solo pasó la lista, sin la coincidencia con el
  registro, no es un destino seguro para un error. Si V-7 muestra que un cliente
  de la lista no manda `resource`, el gancho lo completa con `mcpResourceUrl()`
  en `context.query` en lugar de responder 400.
- **Cada motivo es el de `/login`**: un externo revocado o un correo fuera de
  los dominios sin invitación ven `sin_invitacion`; una persona sin contexto,
  `sin_invitacion` (D-E1b-5). Una membresía inactiva con sesión viva —solo el
  pedido en vuelo o por SQL (D-E2-2)— llega a `/login`, que con sesión la manda
  a `/` y ve el aviso de TT-92. Ninguno recibe un código.
- **El gancho corre también en la retoma**: después del ingreso, el gancho
  `after` del plugin vuelve a llamar a `/oauth2/authorize`, y aceptar el
  consentimiento llama a un `authorize` interno; los dos pasan por
  `hooks.before` (`dispatch.mjs:209-210`). La regla se aplica entonces en el
  ingreso (`mapProfileToUser`, `session.create.before`), en la retoma, en
  `/conectar` (`requireSession()` y `mcp.connect`, §4.14) y en el consentimiento.
- **La retoma se prueba sin Google**: `POST /test-session/sign-in` con
  `oauth_query` en el cuerpo crea la sesión de prueba y dispara el gancho
  `after` del plugin, que retoma la autorización. Sirve para la integración y
  el e2e 4 sin tocar `test-session.ts`.
- **El gancho no importa `auth.ts`**: lee la sesión con `getSessionFromCtx` de
  `better-auth/api` y decide con `readUserContext` de
  `src/server/user-context.ts`, que tampoco lo importa (§4.6).

**D-MCP-5 — La vida de los tokens y la revocación (decidido por el usuario,
§11).**

- **Token de acceso: 1 hora. Refresh token: 30 días, con rotación** —cada uso
  emite uno nuevo y el plugin invalida la familia si uno viejo se reusa—, con
  `refreshTokenReuseInterval: 30`: dos renovaciones del mismo cliente con el
  mismo refresh en 30 segundos no cuentan como robo. El consentimiento dura
  hasta que se revoca. Mientras el asistente se use al menos una vez cada 30
  días, la persona no vuelve a autorizar.
- **Dónde revoca la persona**: la sección «Asistentes conectados» de `/perfil`
  (§5.3) lista sus autorizaciones y ofrece «Desconectar». Desconectar borra en
  una transacción el consentimiento y los tokens de acceso y de refresh del par
  persona-cliente, y deja `mcp.revoke` (§4.3). Es idempotente: desconectar algo
  que ya no está responde éxito sin escribir.
- **Cerrar la sesión web no desconecta nada**: son autorizaciones aparte, y el
  JWT no mira la sesión (D-MCP-3). La sección lo dice.
- **`/oauth2/revoke`** (RFC 7009) queda abierto para el cliente: revoca un
  refresh token en el acto; sobre un JWT de acceso no tiene efecto hasta que
  vence. El corte de la persona es el consentimiento (paso 4 de D-MCP-3).
- **Un código emitido antes de desconectar** (vive en `verification` unos
  minutos) se puede canjear después: el token que sale no pasa el paso 4.
- **Las tablas del plugin son de Better Auth** (ADR 0025): las lee y escribe
  `src/server/oauth-records.ts`, al lado de `auth-records.ts`, con la
  transacción de quien llama. El módulo `mcp` las muestra y las manda a borrar
  por esas funciones.

**D-MCP-6 — Desactivar revoca las autorizaciones (ADR 0026, decisión 6).**
`writeStatus` de `team` (`team/service.ts:258-279`), al desactivar, después de
`deleteSessionsOf`, llama a `deleteGrantsOf(tx, actor, target.userId)` de
`oauth-records.ts`: borra los consentimientos y los tokens de la persona y, si
borró alguno, deja `mcp.revokeAll` con la cantidad de clientes.

- **Orden de bloqueos**: las membresías, la fila del timer, las de `session` y,
  **por la misma sentencia**, las de los tokens del plugin: `oauthAccessToken` y
  `oauthRefreshToken` apuntan a `session` con `on delete set null`, así que
  `deleteSessionsOf` ya actualiza esas filas. Después `deleteGrantsOf` borra los
  tokens y los consentimientos. Nada toma una membresía ni una `session` después
  de una fila del plugin, y la verificación de un token no bloquea: no hay
  ciclo.
- **Una renovación cruzada con la desactivación puede dejar un refresh
  suelto.** El plugin no envuelve la renovación (`/oauth2/token` con
  `refresh_token`) en una transacción: si inserta el refresh nuevo después de
  que la desactivación borró los de la persona y confirmó, queda una fila de
  refresh sin consentimiento. **Es inocuo**: el token de acceso que sale con
  ella no pasa el paso 4 de D-MCP-3, y la siguiente renovación tampoco sirve
  para nada. La consulta de §6.5 la muestra; no hace falta borrarla.
- **Reactivar no devuelve nada** (EQ-47 sigue igual): la persona vuelve a
  conectar su asistente.
- **E6** (quitar del equipo) y **E2b** (reemplazar una cuenta, liberar un
  correo) llaman a la misma función (§1, §12).

**D-MCP-7 — El transporte: Streamable HTTP sin estado, en un Route Handler
(ADR 0026, decisión 3).**

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
  servidor ni sesiones que cerrar. Si V-7 muestra que un cliente de la lista
  exige un flujo SSE o sesiones, se para y vuelve al arquitecto.
- **`Origin`**: si el pedido lo trae y no es el de `BETTER_AUTH_URL` ni uno de
  `MCP_ALLOWED_ORIGINS` —por omisión `https://claude.ai`, `https://claude.com` y
  `https://chatgpt.com`, a confirmar en V-7—, 403 (protección contra DNS
  rebinding que la especificación exige). Sin `Origin`, como llegan los pedidos
  de servidor a servidor, pasa.
- **Sin CORS en `/api/mcp`**: los conectores remotos llaman desde los servidores
  de su proveedor y los clientes de línea de comandos desde un proceso local.
  Los metadatos de §4.13 sí llevan `Access-Control-Allow-Origin: *`: son
  públicos.
- **Sin revalidación**: las páginas de Clock leen la sesión en cada pedido y no
  hay caché del servidor que invalidar. Una pestaña abierta ve los cambios del
  asistente al navegar o recargar, como los de otro dispositivo.

**D-MCP-8 — Las herramientas: ocho, sobre lo propio.** Cumplen el mínimo pedido
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
  `handle`, y la herramienta dentro de `runTool`. **Alternativa descartada**:
  que la herramienta repita las tres líneas de la action; es la copia que se
  desincroniza.
- **Borrar entra**, por decisión del usuario (§11), con `destructiveHint`. Las
  anotaciones son del protocolo y no de un cliente: cada uno decide qué hace con
  ellas, y uno que las respeta pide confirmación antes de borrar. V-7 anota qué
  hacen claude.ai y ChatGPT; Clock no depende de eso, porque la constancia
  guarda la fila entera (TT-61).
- **Las que no entran** (§12): continuar, duplicar, descartar el timer, las
  masivas, la planilla, crear proyectos o etiquetas y todo lo que no es de la
  propia persona.
- **Las descripciones van en español**, como los textos de interfaz, y no
  nombran a ningún asistente: dicen que las horas son de pared en la zona de
  `get_context`, que `start_timer` cierra el timer que corría, que un `id`
  repetido no crea dos veces, que `delete_entry` no se deshace.

**D-MCP-9 — Los errores, traducidos una vez.** `failure` de `action.ts` pasa a
`src/server/failure.ts` como `failureOf`, sin cambiar lo que decide: un
`DomainError` con su código y su texto (y las filas, si es `RejectedError`), un
`ForbiddenError` con el texto `forbidden` del módulo, un `ZodError` con su
primer mensaje y cualquier otra cosa como `unexpected`, con `console.error`.
`handle` y `runTool` lo usan.

- **Un error de dominio es un resultado de herramienta con `isError: true`**,
  no un error de JSON-RPC: el asistente lee el texto y corrige. `content` lleva
  el mensaje en español; `structuredContent`, `{ code, message, rejections? }`.
- **Los errores de protocolo** los responde el SDK: un JSON inválido, como
  JSON-RPC `-32700`; una herramienta desconocida, como resultado `isError: true`
  sin `code` (V-8, §4.17).
- **La validación**: el SDK valida contra el `inputSchema` de la herramienta
  (§4.10) y la operación vuelve a parsear con el esquema del módulo, que tiene
  los refinamientos y los textos. Cómo responde el SDK un argumento que no
  cumple el `inputSchema` lo confirma V-8.

**D-MCP-10 — Las altas: `id` opcional, ADR 0007 cuando viene.** `create_entry`
y `start_timer` aceptan un `id` UUID v4 opcional. Si viene, el alta es la de
siempre: repetirla con el mismo id responde la fila del primer intento sin
escribir. Si no viene, `runTool` genera uno con `crypto.randomUUID()` y el alta
no es idempotente entre llamadas. **Por qué opcional**: un modelo no siempre
escribe un UUID v4 válido, y un rechazo por el formato del id es peor que una
carga sin reintento seguro. La descripción le pide al asistente que, si
reintenta la misma carga, mande el `id` que devolvió la primera respuesta o
uno propio desde el principio.

**D-MCP-11 — Aislamiento e IDOR.** Ninguna herramienta recibe `userId` ni
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

**D-MCP-12 — El audit log dice por qué cliente llegó (ADR 0026, decisión 7).**

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

**D-MCP-13 — Los límites.** Son por persona y por IP, nunca por cliente: valen
igual para cualquier asistente.

| Límite                     | Valor          | Dónde                                       | Respuesta                                     |
| -------------------------- | -------------- | ------------------------------------------- | --------------------------------------------- |
| Cuerpo de un `POST`        | 64 KiB         | `maxRequestBodySize` del transporte         | 413, del SDK                                  |
| Pedidos por persona        | 120 por minuto | `consumeCall` (§4.14), antes del transporte | 429 con `Retry-After: 60` y JSON-RPC `-32000` |
| Período de `list_entries`  | 31 días        | `entriesPeriodInput`                        | `validation`, `periodTooLong`                 |
| Entradas de `list_entries` | 500            | `listEntriesOfPeriod`, con `truncated`      | éxito, `truncated: true`                      |
| Descripción, etiquetas     | 3000, 50       | los esquemas de siempre                     | `validation`                                  |
| Registro de clientes       | 5 cada 60 s    | `rateLimit.register` del plugin             | 429 del plugin                                |
| Canjes y renovaciones      | 20 cada 60 s   | `rateLimit.token` del plugin                | 429 del plugin                                |
| Autorizaciones             | 30 cada 60 s   | `rateLimit.authorize` del plugin            | 429 del plugin                                |

- **El límite por persona se cuenta en la base**, en una fila por persona de
  `mcp_call_window` (§2), con un `insert … on conflict do update` que suma o
  reinicia según el minuto de `now()`. Una sentencia por pedido; sin estado en
  memoria. Cuenta todo `POST` autenticado (`initialize` y `tools/list`
  incluidos): cualquier asistente queda lejos de 120 por minuto, también una
  persona con dos conectados a la vez.
- **Los del plugin** guardan en memoria por instancia, como el limitador de
  Better Auth (`node_modules/better-auth/dist/api/rate-limiter/index.mjs:213-231`):
  en Vercel es un freno parcial. Los registros de un conector remoto llegan
  desde las IP de su proveedor, compartidas por todos sus usuarios: 5 cada 60 s
  por instancia alcanza para una empresa que conecta de a uno. Pasarlo a la base
  cambia el límite de todos los endpoints de Better Auth, también el del
  ingreso, que con la oficina detrás de una sola IP dejaría afuera a quien entre
  cuarto en diez segundos. No se cambia; el riesgo está en §10.

**D-MCP-14 — El interruptor `MCP_ENABLED`, con el plugin siempre cargado
(ADR 0026, decisión 8).** Por omisión `false`.

- **El plugin y `jwt` se cargan siempre**, con el interruptor como esté. Si
  dependieran de la variable, un `npm run auth:schema` corrido sin
  `MCP_ENABLED` sacaría sus tablas de `auth-schema.ts`, y el `db:generate`
  siguiente generaría una migración que las borra.
- **Cargado siempre no cambia el ingreso**: `jwt` va con
  `disableSettingJwtHeader: true` (D-MCP-1), así `get-session` no firma nada ni
  manda `set-auth-jwt`, con el MCP encendido o apagado (criterio 16).
- **Apagado** actúa en dos lugares: `mcpDisabledPaths()` suma a la lista fija
  de D-MCP-2 todas las rutas OAuth del plugin (`/oauth2/authorize`,
  `/oauth2/token`, `/oauth2/register`, `/oauth2/consent`, `/oauth2/revoke`),
  `/jwks` y las de `.well-known` que el plugin registre bajo `/api/auth`; y
  `/api/mcp`, los metadatos de §4.13 y `/conectar` responden 404 propio. La
  sección de `/perfil` no se muestra. La lista fija, con
  `/oauth2/client/rotate-keys`, vale encendido y apagado.
- **Las tablas están igual**, y las autorizaciones vuelven a servir al
  encenderlo. Producción se despliega apagada y se enciende después de la
  prueba en un preview (§6; decisión del usuario, §11).

**D-MCP-15 — El consentimiento es una página de Clock, y el login lo retoma el
plugin.**

- **`/conectar`** (`src/app/conectar/page.tsx`), como `/login`, pide su sesión
  con `requireSession()` y no tiene la barra lateral: es una pantalla de paso.
  Recibe la consulta firmada de la autorización (`client_id`, `scope`,
  `redirect_uri`, `state`, `code_challenge`, `resource`, `exp`, `ba_iat`,
  `ba_param`, `sig`), la verifica con `verifyOAuthQueryParams` y su vencimiento,
  y muestra quién pide, qué y adónde vuelve (§5.1). Ningún texto nombra a un
  asistente: el nombre es el que declaró el cliente y el destino, el host del
  `redirect_uri` firmado.
- **Aceptar o cancelar** es una action del módulo `mcp` que hace
  `POST /oauth2/consent { accept, oauth_query }` con la sesión del pedido **y
  `accept: application/json`**: así el plugin responde `{ redirect: true, url }`
  en lugar de lanzar un `FOUND` (`authorize-*.mjs:5471-5479`). La action
  devuelve `url` y el navegador la sigue con `window.location.assign`. **Por qué
  no un `<form>` que redirige**: la CSP tiene `form-action 'self'
https://accounts.google.com` (`next.config.ts:17`), y un navegador la aplica
  también a la redirección que sigue a un envío.
- **El login lo retoma el plugin, no `/login`.** Sin sesión, `/oauth2/authorize`
  manda a `/login` con la misma consulta firmada. `oauthProviderClient()` en
  `src/lib/auth-client.ts` hace que `signIn.social` lleve `oauth_query` en el
  cuerpo de `/sign-in/social`, y el gancho `after` del plugin retoma la
  autorización cuando vuelve Google, pasando otra vez por el gancho de D-MCP-4.
  `/login` no arma destinos: el botón sigue con `callbackURL: "/"`.
- **Con sesión abierta**, la autorización solo manda a `/login` cuando el
  cliente pidió `prompt=login` o `max_age`, y entonces `/login` **no redirige a
  `/`**: muestra el botón para volver a entrar. Lo reconoce
  `isOAuthLoginQuery(searchParams)` (§4.4), por la presencia de `sig` y
  `client_id`. Una consulta armada a mano solo consigue que `/login` muestre el
  botón en lugar de redirigir.

## 0. Precondición de arranque

- **`main` con Better Auth 1.7.10 fijado y desplegado** (abajo, «La
  actualización de Better Auth»), sobre E2 (`27774d6`). La hace otro agente, en
  su worktree, antes de que este slice arranque.
- **El ADR 0026, aceptado** el 2026-10-19, y **§11, decidido** el 2026-10-19.
- **Las verificaciones abiertas** (V-7 y V-8), hechas por `backend-dev` antes
  de escribir el código del MCP, con el resultado en el registro del slice
  (`docs/slices/correcciones-mejoras-mcp-revisiones.md`). V-7 se completa en el
  preview (§6.6). Una que falle detiene el slice y vuelve al arquitecto.
- Las citas de abajo son del árbol en `27774d6`. El worktree `clock-mcp` no
  tiene `node_modules`: las citas de paquetes son del checkout principal, con
  `better-auth` 1.7.7 y `@modelcontextprotocol/sdk` 1.32.0, y las del plugin y
  de Better Auth 1.7.10, de la lectura de `architecture-reviewer`. Con la
  actualización en `main`, `backend-dev` confirma que las de `better-auth`
  siguen en el mismo lugar.

### La actualización de Better Auth (fuera del slice, va primero)

Decisión del usuario (2026-10-19): **va sola y primero**, mergeada y desplegada
antes que el MCP, en su propio worktree. Esta sección es su especificación.

- **`package.json`**: `better-auth` y `@better-auth/core` en `1.7.10` exacto,
  sin `^`, con `better-call` 1.4.2 y `@better-auth/utils` 0.5.0 exactos (V-9).
  No instala `@better-auth/oauth-provider`: lo suma el MCP.
- **`npm run auth:schema`** con 1.7.10: el diff de `auth-schema.ts` **no puede
  tocar `user`, `session`, `account` ni `verification`**. Si los toca, se para y
  se avisa. No trae migración.
- **Lo que se vuelve a probar del ingreso**, sin cambiar lo que afirman los
  tests:
  - `mapProfileToUser` y su redirección `FOUND` a `/login?error=…`
    (`auth.ts:77-89`);
  - `session.create.before` y `session.create.after` con
    `dropSessionOfInactive` (`auth.ts:106-134`);
  - `user.update.before`, que no deja cambiar el correo (`auth.ts:93-104`);
  - `accountLinking.disableImplicitLinking`;
  - `disabledPaths` (`/update-user`, `/link-social`, `/unlink-account`);
  - la sesión de prueba (`test-session.ts`);
  - `onAPIError.errorURL`.

  Las suites: `auth.integration.test.ts`, `session.integration.test.ts`,
  `entry.integration.test.ts` y los e2e de ingreso y de equipo
  (`invitations.spec.ts`, `entry.spec.ts`, `team.spec.ts`,
  `team-status.spec.ts`).

- **Despliegue**: sin migración. Después del push, el humo del ingreso: entrar
  con Google con una cuenta del dominio y ver `/`; en una ventana privada,
  `/login?error=membresia_inactiva` muestra EQ-92.
- **Coordinación**: el MCP y E2b arrancan o rebasan sobre `main` con la
  actualización ya mergeada.

### Verificaciones

| Id   | Qué                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Estado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V-1  | El plugin existe y es compatible                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | **Cerrada**: `@better-auth/oauth-provider@1.7.7` existe; el MCP suma 1.7.10 sobre la actualización (D-MCP-1).                                                                                                                                                                                                                                                                                                                                                                                            |
| V-2  | Registro dinámico, PKCE, RFC 8707, rotación, revocación, consentimiento, metadatos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | **Cerrada**: todo está (ADR 0026, «Contexto»).                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| V-3  | Los endpoints del plugin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | **Cerrada**: la lista de D-MCP-2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| V-4  | La página de consentimiento                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | **Cerrada**: consulta firmada; `POST /oauth2/consent { accept, oauth_query }` con `accept: application/json` responde `{ redirect: true, url }`, y sin esa cabecera lanza un `FOUND` (`authorize-*.mjs:5471-5479`); `verifyOAuthQueryParams` (D-MCP-15).                                                                                                                                                                                                                                                 |
| V-5  | Cómo sigue la autorización después del login                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | **Corregida**: `oauth_query` en `/sign-in/social` y el gancho `after` del plugin; `oauthContinuationOf` se quitó (D-MCP-15). La retoma pasa por `hooks.before` (`dispatch.mjs:209-210`).                                                                                                                                                                                                                                                                                                                 |
| V-6  | Cómo verifica el recurso un token, y las tablas                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **Corregida**: JWT con `verifyJwsAccessToken` (D-MCP-3); las tablas de §2.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| V-7  | **Abierta. Los clientes reales**, capturados en el preview (§6.6) y contra la documentación de cada proveedor. **Anthropic** (claude.ai, claude.com, Claude Code) y **OpenAI** (ChatGPT como conector remoto; Codex y los demás clientes MCP de OpenAI que autorizan con OAuth). Por cada uno: (a) la dirección de vuelta real; (b) si registra por RFC 7591, por documento de metadatos del cliente o necesita un cliente creado de antemano, y el cuerpo del registro; (c) `application_type` y `token_endpoint_auth_method`; (d) si manda `resource` y PKCE `S256`; (e) los alcances que pide; (f) si sus pedidos al recurso traen `Origin`, y cuál; (g) si exige algo de los metadatos que hoy no publicamos (`openid-configuration`, `code_challenge_methods_supported`, `registration_endpoint`, otro campo); (h) si usa `GET` o sesiones en el transporte; (i) qué hace con `destructiveHint`. | Se corrigen los valores por omisión de `MCP_REDIRECT_URIS` y `MCP_ALLOWED_ORIGINS` y los cuerpos del criterio 2. Si un cliente no manda `resource`, el gancho lo completa (D-MCP-4). Si uno necesita un cliente creado de antemano, se escribe el script de D-MCP-2. Si uno exige un campo de metadatos, se suma. Si uno exige SSE o sesiones, se para.                                                                                                                                                  |
| V-8  | **Abierta.** En el SDK 1.32.0: cómo responde un argumento que no cumple el `inputSchema`, y que con `isError: true` no valida `structuredContent` contra el `outputSchema`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `runTool` parsea él mismo y registra el esquema solo para el descubrimiento.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| V-9  | Las opciones de §4.2 en 1.7.10, la firma de `verifyJwsAccessToken`, los claims, el JWT con `resource`, `getJwks` con `/jwks` cerrado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Cerrada**: las opciones existen en 1.7.10 con los mismos nombres (`"infer"` en `authorize-dkOG8GqZ.mjs:1718-1722`); `verifyJwsAccessToken(token, { jwksFetch, jwksCacheKey?, verifyOptions: { issuer, audience } })` (`core/dist/oauth2/verify.d.mts:95`); el JWT trae `sub`, `azp`, `client_id`, `scope`, `sid`, `jti`, `aud`, `iss` y `typ: "at+jwt"`; sale JWT con `resource` (`introspect-BVm_zFQC.mjs:1807`); `auth.api.getJwks()` anda con `/jwks` en `disabledPaths` (`api/index.mjs:166-168`). |
| V-10 | El chequeo de origen de Better Auth con pedidos de servidor a servidor                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Cerrada**: `validateOrigin` solo exige `Origin` cuando hay cookies (`origin-check.mjs:96-111`); el registro y el token entre servidores pasan sin excepción en `auth.ts`.                                                                                                                                                                                                                                                                                                                              |

`.well-known` en el App Router: **cerrada**,
`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md:113-118`.

### Supuestos sobre el árbol, con archivo y línea en `27774d6`

| Supuesto                                                                                                         | Dónde                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `auth.ts` arma Better Auth con `plugins: testSessionPlugins()`, `disabledPaths` y `onAPIError` propios           | `src/server/auth.ts:22-53`                                                                                 |
| Los ganchos del ingreso: `mapProfileToUser`, `user.update.before`, `session.create.before` y `after`             | `auth.ts:77-89`, `:92-136`                                                                                 |
| Sin `rateLimit` configurado: el de Better Auth corre en memoria                                                  | `auth.ts:22-137`; `node_modules/better-auth/dist/context/create-context.mjs:175`                           |
| `readSession`: `getSession`, identidad por pedido, `ensureWorkspaceContext` y `profileOf`; privada y con `cache` | `src/server/session.ts:35-81`                                                                              |
| `decideSessionIdentity` decide solo la identidad                                                                 | `src/server/entry.ts:62-68`                                                                                |
| `ensureWorkspaceContext` arma el `Actor` con rol y estado de la membresía                                        | `src/modules/workspace/service.ts:60-75`, `:160-170`                                                       |
| `can()` corta todo lo que no es `active`; `ProfileResource` es solo el propio                                    | `src/server/permissions/index.ts:188-213`                                                                  |
| `Actor` tiene cuatro campos                                                                                      | `permissions/index.ts:7-12`                                                                                |
| `failure` es privada de `action.ts`; `handle` llama a `requireSession()`                                         | `src/server/action.ts:44-95`                                                                               |
| `AuditEntry` y `rowOf`, sin cliente                                                                              | `src/server/audit.ts:4-28`                                                                                 |
| `deleteSessionsOf` y su lugar en `writeStatus`                                                                   | `src/server/auth-records.ts:22-44`; `src/modules/team/service.ts:258-279`                                  |
| Las actions de `time-entry`: `parse`, `assertCan`, service, con `trackerWorkspaceOf(session)`                    | `src/modules/time-entry/actions.ts:77-158`                                                                 |
| `createManualEntry`, `startTimer`, `stopTimer`, `deleteEntry`, `updateEntry`                                     | `time-entry/service.ts:955-994`, `:574-611`, `:743-762`, `:838-860`, `:1414`                               |
| `authorizeEntry`: `not_found` o `forbidden` por el dueño real                                                    | `time-entry/service.ts:240-263`                                                                            |
| `findRunning` y `listClosedBetween` (inicio en `[from, to)`), sin tope                                           | `time-entry/repository.ts:545-560`, `:611-629`                                                             |
| Los esquemas de alta manual y de edición; los códigos del módulo                                                 | `time-entry/schema.ts:148-163`, `:314-335`, `:657-658`                                                     |
| `getTrackingCatalog`: proyectos donde se puede cargar, con tareas y etiquetas                                    | `src/modules/project/service.ts:555-571`; `project/schema.ts:158-184`                                      |
| `env()` valida con Zod y lanza si falta algo                                                                     | `src/server/env.ts:7-40`                                                                                   |
| La CSP: `form-action` y `frame-ancestors`                                                                        | `next.config.ts:8-19`                                                                                      |
| `/login` redirige a `/` con sesión; el botón entra con `callbackURL: "/"`                                        | `src/app/login/page.tsx:9-13`; `src/components/layout/google-sign-in-button.tsx:15`                        |
| El cliente de Better Auth, sin plugins                                                                           | `src/lib/auth-client.ts:1-6`                                                                               |
| La sesión de prueba crea `user` y `session` por cabecera secreta                                                 | `src/server/test-session.ts:67-119`                                                                        |
| El transporte del SDK: modo sin sesión, JSON, tope de cuerpo                                                     | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.d.ts:41-116`, `:145-173` |
| `AuthInfo` del SDK: token, cliente, alcances, vencimiento, recurso, `extra`                                      | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/auth/types.d.ts:4-31`                              |
| `registerTool` con `inputSchema`, `outputSchema` y `annotations`                                                 | `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.d.ts:161-168`                                  |

## 1. Alcance

Entra:

- **El servidor de autorización**: el plugin y `jwt` en `auth.ts`, el gancho del
  registro y el de autorizar y consentir, `disabledPaths`, los privilegios y el
  interruptor (D-MCP-1, D-MCP-2, D-MCP-4, D-MCP-14).
- **Los metadatos** del recurso y del servidor de autorización (D-MCP-2).
- **El recurso MCP**: `/api/mcp`, la verificación del JWT y el armado del
  actor, el límite por persona (D-MCP-3, D-MCP-7, D-MCP-13).
- **Las ocho herramientas** y `time-entry/operations.ts` (D-MCP-8 a D-MCP-11).
- **La columna del audit log** y `auditActorOf` (D-MCP-12).
- **Desactivar revoca** (D-MCP-6).
- **Las pantallas**: el consentimiento, «Asistentes conectados» en `/perfil` y
  `/login` con `oauthProviderClient` (§5).
- **Si V-7 lo pide**, el script de un cliente creado de antemano (D-MCP-2).
- **Tests** de unidad, integración y e2e (§9).

Queda afuera: la actualización de Better Auth (§0) y §12.

### Consecuencias sobre código ya entregado

| Archivo                                                           | Qué cambia                                                                                          | Qué hay que volver a probar                                                                                      |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `package.json`, `package-lock.json`                               | `@better-auth/oauth-provider` 1.7.10 exacto; `@modelcontextprotocol/sdk`                            | `npm run build`                                                                                                  |
| `src/server/auth.ts`                                              | El plugin y `jwt`, los dos ganchos, `disabledPaths`                                                 | `auth.integration.test.ts` entero (el ingreso no cambia con el plugin cargado); `get-session` sin `set-auth-jwt` |
| `src/server/session.ts`, `user-context.ts` nuevo                  | `readUserContext` y sus tipos se mudan; `readSession` la usa                                        | `session.integration.test.ts` sin cambios en lo que afirma                                                       |
| `src/lib/auth-client.ts`                                          | `oauthProviderClient()`                                                                             | los e2e de ingreso                                                                                               |
| `src/app/login/page.tsx`                                          | Con sesión y una consulta de autorización, no redirige                                              | `login/page.test.tsx`                                                                                            |
| `src/server/action.ts`, `failure.ts` nuevo                        | `failure` se muda como `failureOf`                                                                  | los `actions.integration.test.ts` de todos los módulos                                                           |
| `src/server/permissions/index.ts`                                 | `mcp.connect`, `mcp.grant.revoke`; `Actor.oauthClientId`                                            | `permissions.test.ts` entero                                                                                     |
| `src/server/audit.ts` y cada constancia armada con un `Actor`     | `auditActorOf`; `oauthClientId` en la fila                                                          | los tests de audit de cada módulo (deben seguir verdes sin cambiar)                                              |
| `src/server/env.ts`                                               | Tres variables opcionales                                                                           | `env.test.ts` si existe; el arranque sin ellas                                                                   |
| `src/modules/time-entry/actions.ts`, `operations.ts` nuevo        | Cinco actions delegan en `operations.ts`                                                            | `time-entry/actions.integration.test.ts`                                                                         |
| `src/modules/time-entry/service.ts`, `repository.ts`, `schema.ts` | `listEntriesOfPeriod`, `getRunningEntry`, `listClosedStartingIn`, `entriesPeriodInput` y dos textos | `time-entry/service.integration.test.ts`                                                                         |
| `src/modules/team/service.ts`                                     | `writeStatus` llama a `deleteGrantsOf`                                                              | `team/service.integration.test.ts`, criterios 1 y 17 de E2                                                       |
| `src/app/(app)/perfil/page.tsx`                                   | Compone la sección de `mcp`                                                                         | los e2e de perfil                                                                                                |
| `CLAUDE.md`, «Estructura» y «Recorrido de una mutación»           | Las líneas nuevas (§7)                                                                              | —                                                                                                                |

- **Sin cambio**: `access.ts`, `entry.ts`, `test-session.ts`,
  `google-sign-in-button.tsx`, `workspace/` y `report/` (salvo sus
  constancias), la CSP, el cron y las demás actions.
- **El ingreso por Google no cambia** para quien no autoriza un asistente: sin
  consulta de autorización, `/login` y el botón hacen lo de hoy.

### Coordinación con E2b

E2b (`/home/maxi/program/clock-e2b`, `fase2-e2b-sin-cuenta.md`) va en paralelo y
toca lo mismo en tres lugares:

- **`writeStatus` de `team`**: los dos slices la editan. Se resuelve en el
  merge.
- **La migración `0017`**: los dos traen una. **El que mergee segundo renumera
  la suya** (y su `meta/_journal.json`) y vuelve a correr `db:generate` para
  confirmar que no queda diff.
- **`bindGoogleAccount` y `releaseEmailOf`** (`auth-records`), que reemplazan
  una cuenta de Google y liberan un correo: quien deja de ser esa persona no
  puede quedarse con sus asistentes. **Si el MCP mergea segundo**, suma
  `deleteGrantsOf(tx, actor, userId)` en las dos, con su caso en
  `auth-records.integration.test.ts` y en los criterios de todo o nada de E2b.
  Si mergea primero, lo anota en el registro de E2b para que lo sume E2b.

> **Nota del 2026-10-20.** E2b mergeó primero (`80e2f6c`), y después WS0 B
> con su `0018_drop_unused_columns`. Con el rebase de `mejoras/mcp` sobre
> `main`, la migración del MCP es **`0019_mcp`**, regenerada con
> `db:generate -- --name mcp` sobre el esquema rebasado (el SQL es el mismo de
> la `0017_mcp` original), y `bindGoogleAccount` y `releaseEmailOf` llaman a
> `deleteGrantsOf` después de `deleteSessionsOf` (detalle en el registro,
> «Rebase sobre E2b» y «Rebase sobre WS0 y WS1»).

## 2. Esquema y migración

Una migración, `0019_mcp` (era `0017_mcp` antes de los rebases sobre E2b y
WS0; nota del 2026-10-20 en §1), con `npm run auth:schema` y después
`npm run db:generate`. Todo es aditivo.

- **Las tablas del plugin**, generadas en `src/server/db/auth-schema.ts` por
  `npm run auth:schema` con el plugin y `jwt` configurados: los modelos
  `oauthClient`, `oauthResource`, `oauthClientResource`, `oauthAccessToken`,
  `oauthRefreshToken`, `oauthConsent`, `oauthClientAssertion` y `jwks`, con los
  nombres de tabla que genere. Los códigos de autorización van a `verification`,
  que ya existe. **El diff solo suma tablas.**
- **Las claves foráneas que importan**: los tokens apuntan a `session` por
  `sessionId` con `on delete set null` (D-MCP-6), y los tokens, los
  consentimientos y los clientes registrados con sesión apuntan a `user` por
  `userId` con **`on delete cascade`**: borrar una fila de `user` se lleva sus
  autorizaciones sin constancia. Nada en Clock borra `user` hoy; quien lo haga
  (E2b, un script) borra antes con `deleteGrantsOf`, que deja `mcp.revokeAll`.
- **`mcp_call_window`**, del módulo `mcp`, en `src/server/db/schema.ts`. **No
  lleva `workspace_id`**: es una tabla técnica por persona, como
  `user_preference`, que cuenta pedidos y no guarda datos del workspace; filtra
  por el `user_id` del token, nunca por uno de la entrada.

  ```ts
  /** D-MCP-13: el minuto en curso de pedidos al MCP, una fila por persona. */
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
  falta para apagar el MCP**: alcanza con `MCP_ENABLED=false` (§6.4).

## 3. Permisos

Dos acciones nuevas, en la unión `Action`, en `resourceKinds` y en
`allowedRoles`:

| Acción             | Recurso             | Roles      | Se consulta                                                                                                      |
| ------------------ | ------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `mcp.connect`      | `WorkspaceResource` | `everyone` | al autorizar y consentir (D-MCP-4), al mostrar y aceptar en `/conectar`, y en cada pedido a `/api/mcp` (D-MCP-3) |
| `mcp.grant.revoke` | `ProfileResource`   | `everyone` | al desconectar un asistente propio, con `ownProfileResource(actor)`                                              |

- Comentario de `mcp.connect`: «ADR 0026, D-MCP-3, D-MCP-4: autorizar un
  asistente y usarlo. Una membresía no activa no lo tiene, por la regla común
  de `can()`.».
- Comentario de `mcp.grant.revoke`: «D-MCP-5: desconectar un asistente propio.
  `ProfileResource`: la autorización es de la cuenta, y `can()` ya exige que
  sea la propia.».
- **Ninguna acción para ver o desconectar asistentes ajenos**: decisión del
  usuario (§11).
- **`Actor.oauthClientId?: string`**, con el comentario «D-MCP-12: el cliente
  OAuth por el que llegó el pedido, si vino por MCP. `can()` no lo mira; lo
  usa `auditActorOf`.». El cuerpo de `can()` no cambia.
- **Cada herramienta consulta el mismo permiso que su action**, dentro de
  `operations.ts`. Las lecturas propias no consultan más que `mcp.connect`,
  como las lecturas de la pantalla no consultan más que la sesión.
- **Los privilegios del plugin** (`clientPrivileges`, `resourcePrivileges`) no
  son decisiones de acceso de Clock: cierran endpoints de administración que
  no se usan (D-MCP-2). Su comentario lo dice.

## 4. Contrato

### 4.1 Variables de entorno (`src/server/env.ts`)

```ts
/** Una lista de direcciones separadas por coma, sin vacíos. */
const urlList = z
  .string()
  .transform((value) => value.split(",").map((item) => item.trim()).filter(Boolean))
  .pipe(z.array(z.url()));

/** D-MCP-14: el servidor MCP y la autorización de asistentes. Apagado por omisión. */
MCP_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
/**
 * D-MCP-2: las redirecciones HTTPS que se aceptan al registrar y al autorizar,
 * exactas. Las de los conectores remotos de Anthropic y de OpenAI (V-7).
 */
MCP_REDIRECT_URIS: urlList.default([
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
]),
/** D-MCP-7: los `Origin` que acepta `/api/mcp` además del propio (V-7). */
MCP_ALLOWED_ORIGINS: urlList.default([
  "https://claude.ai",
  "https://claude.com",
  "https://chatgpt.com",
]),
```

Las tres son opcionales: un entorno que no las declara arranca igual, con el MCP
apagado. **Los valores por omisión de las dos listas son a confirmar en V-7**, y
el merge espera esa confirmación; un cliente más se suma con la variable, sin
código.

### 4.2 Better Auth (`src/server/auth.ts`)

Las opciones existen en 1.7.10 con estos nombres (V-9).

```ts
plugins: [
  ...mcpAuthPlugins(),        // jwt y oauthProvider, siempre (D-MCP-14)
  ...testSessionPlugins(),
],
disabledPaths: [
  "/update-user", "/link-social", "/unlink-account",
  ...mcpDisabledPaths(),      // la lista fija de D-MCP-2, y las rutas OAuth con MCP_ENABLED=false
],
hooks: { before: mcpAuthMiddleware },   // registro (D-MCP-2), autorizar y consentir (D-MCP-4)
```

`mcpAuthPlugins()` devuelve `jwt({ disableSettingJwtHeader: true })` (D-MCP-1,
D-MCP-14) y `oauthProvider({ … })` con:

| Opción                                     | Valor                                                                                       | Por      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- | -------- |
| `loginPage`                                | `"/login"`                                                                                  | D-MCP-15 |
| `consentPage`                              | `"/conectar"`                                                                               | D-MCP-15 |
| `scopes`                                   | `["clock", "offline_access"]`                                                               | D-MCP-2  |
| `grantTypes`                               | `["authorization_code", "refresh_token"]`                                                   | D-MCP-2  |
| `resources`                                | `[mcpResourceUrl()]`                                                                        | D-MCP-2  |
| `clientRegistrationDefaultResources`       | `[mcpResourceUrl()]`                                                                        | D-MCP-2  |
| `clientRegistrationDefaultApplicationType` | `"infer"`                                                                                   | D-MCP-1  |
| `allowDynamicClientRegistration`           | `true`                                                                                      | D-MCP-2  |
| `allowUnauthenticatedClientRegistration`   | `true`                                                                                      | D-MCP-2  |
| `validateRedirectUri`                      | `(uri, _registered, matched) => matched && isAllowedRedirect(uri, env().MCP_REDIRECT_URIS)` | D-MCP-2  |
| `clientPrivileges`                         | `() => false`                                                                               | D-MCP-2  |
| `resourcePrivileges`                       | `() => false`                                                                               | D-MCP-2  |
| `accessTokenExpiresIn`                     | `3600`                                                                                      | D-MCP-5  |
| `refreshTokenExpiresIn`                    | `60 * 60 * 24 * 30`                                                                         | D-MCP-5  |
| `refreshTokenReuseInterval`                | `30`                                                                                        | D-MCP-5  |
| `rateLimit.token`                          | `{ window: 60, max: 20 }`                                                                   | D-MCP-13 |
| `rateLimit.authorize`                      | `{ window: 60, max: 30 }`                                                                   | D-MCP-13 |
| `rateLimit.register`                       | `{ window: 60, max: 5 }`                                                                    | D-MCP-13 |

El tercer argumento de `validateRedirectUri` es el resultado que el plugin ya
decidió (la dirección coincide con una registrada por el cliente). El
comentario de `auth.ts` lista los cinco endpoints que quedan abiertos y remite
a D-MCP-2. **Sin `customRules`** en el `rateLimit` de Better Auth.

### 4.3 Las tablas del plugin (`src/server/oauth-records.ts`, nuevo)

```ts
/**
 * Lo que la aplicación lee y escribe de las tablas del servidor de autorización
 * fuera de sus endpoints (ADR 0025, ADR 0026): son de Better Auth y de este
 * código. Cada función que escribe recibe la transacción de quien llama.
 */

/** Una autorización vigente de la persona, por cliente. */
export type GrantRow = {
  readonly clientId: string;
  /** `client_name` del registro: lo declara el cliente, no se confía en él. */
  readonly clientName: string | null;
  readonly redirectUris: readonly string[];
  /** El consentimiento más viejo del cliente. */
  readonly grantedAt: Date;
};

/**
 * D-MCP-5: las autorizaciones de `userId`, **una por cliente**: `oauthConsent` no
 * tiene índice único por persona y cliente, así que se agrupa. La más nueva
 * primero. Solo lee.
 */
export async function listGrantsOf(
  tx: Transaction,
  userId: string,
): Promise<readonly GrantRow[]>;

/** D-MCP-3, paso 4: si queda algún consentimiento del par. Sin transacción: una lectura por índice. */
export async function hasGrant(userId: string, clientId: string): Promise<boolean>;

/** D-MCP-15: el nombre que declaró el cliente, para la pantalla. `undefined` si no existe. */
export async function findClientName(
  clientId: string,
): Promise<{ readonly name: string | null } | undefined>;

/**
 * D-MCP-5: borra los consentimientos y los tokens de acceso y de refresh del par
 * y, si borró algo, deja `mcp.revoke` (`entity: "oauth_client"`, `entityId:
 * clientId`, `previousValue: { scopes }`) con `auditActorOf(actor)`. No consulta
 * permisos: la usa `revokeGrant` de `mcp`, que ya los decidió. Devuelve si borró.
 */
export async function deleteGrant(
  tx: Transaction,
  actor: Actor,
  clientId: string,
): Promise<boolean>;

/**
 * D-MCP-6: borra los consentimientos y los tokens de `userId` y, si borró alguno,
 * deja `mcp.revokeAll` (`entity: "user"`, `entityId: userId`, `previousValue:
 * { clients: n }`). La usan `writeStatus` de `team` al desactivar y, con E2b,
 * `bindGoogleAccount` y `releaseEmailOf`. Devuelve cuántos clientes.
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
  consentimiento no puede usar nada, y los clientes de línea de comandos
  reusan su registro.

### 4.4 La configuración del servidor de autorización (`src/server/mcp-auth.ts`, nuevo)

Lo que importa `auth.ts`, y funciones puras. **No importa `auth.ts` ni
`session.ts`**: así no hay ciclo. El gancho decide con `user-context.ts`.

```ts
/** D-MCP-1, D-MCP-14: `jwt` y `oauthProvider` con la tabla de §4.2. Siempre los dos. */
export function mcpAuthPlugins(): BetterAuthPlugin[];

/** D-MCP-2, D-MCP-14: la lista fija; con el MCP apagado, también las rutas OAuth, `/jwks` y sus `.well-known`. */
export function mcpDisabledPaths(): string[];

/**
 * El gancho `hooks.before`: sobre el registro, la lista de redirecciones (D-MCP-2);
 * sobre `/oauth2/authorize` y `/oauth2/consent`, la puerta de D-MCP-4 con
 * `readAssistantContext`, también en la retoma después del ingreso y en el
 * `authorize` interno del consentimiento. Sobre cualquier otro camino no hace nada.
 */
export const mcpAuthMiddleware: AuthMiddleware;

export type AssistantContextRead =
  | { readonly kind: "ready"; readonly context: SessionContext }
  | { readonly kind: "denied"; readonly reason: AccessDenialReason };

/**
 * D-MCP-3, D-MCP-4: `readUserContext` y, además, `mcp.connect`; sin él,
 * `denied` con `membresia_inactiva`. La usan `readMcpContext` y el gancho.
 */
export async function readAssistantContext(
  user: SessionUser,
): Promise<AssistantContextRead>;

/** D-MCP-2: `<BETTER_AUTH_URL>/.well-known/oauth-protected-resource/api/mcp`. */
export function resourceMetadataUrl(): string;

/** D-MCP-2: `<BETTER_AUTH_URL>/api/mcp`, sin barra final. Audiencia y dirección para pegar. */
export function mcpResourceUrl(): string;

/** D-MCP-2: `<BETTER_AUTH_URL>/api/auth`. */
export function mcpIssuer(): string;

/** D-MCP-2: el cuerpo de los metadatos del recurso protegido (RFC 9728). */
export function protectedResourceMetadata(): {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: readonly ["clock", "offline_access"];
  readonly bearer_methods_supported: readonly ["header"];
};

/** D-MCP-2: loopback de cualquier puerto, o una de `allowed`, exacta. Pura. */
export function isAllowedRedirect(uri: string, allowed: readonly string[]): boolean;

/** D-MCP-15: si `/login` llegó con la consulta firmada de una autorización (`sig` y `client_id`). Pura. */
export function isOAuthLoginQuery(
  searchParams: Record<string, string | string[] | undefined>,
): boolean;

/**
 * D-MCP-15: la consulta firmada como la recibió la página, con los parámetros
 * repetidos en su orden, para verificarla y mandarla como `oauth_query`. Pura.
 */
export function oauthQueryOf(
  searchParams: Record<string, string | string[] | undefined>,
): string;
```

### 4.5 La verificación del recurso (`src/server/mcp-context.ts`, nuevo)

Lo que necesita `auth.ts`. Importa `auth.ts`, `user-context.ts`,
`oauth-records.ts` y `mcp-auth.ts`.

```ts
/** El contexto de la sesión con el actor marcado con su cliente (D-MCP-12). */
export type McpContext = SessionContext;

export type McpContextRead =
  | {
      readonly kind: "unauthorized";
      readonly error: "invalid_request" | "invalid_token" | null;
    }
  | { readonly kind: "insufficient_scope" }
  | { readonly kind: "ready"; readonly context: McpContext };

/**
 * D-MCP-3, los siete pasos. El paso 2 es `verifyJwsAccessToken` con
 * `verifyOptions: { issuer: mcpIssuer(), audience: mcpResourceUrl(), typ: "at+jwt" }`.
 * No lanza por un token malo: lo dice el resultado. Una falla de la base o de
 * las claves se relanza.
 */
export async function readMcpContext(request: Request): Promise<McpContextRead>;

/**
 * 401 o 403 con `WWW-Authenticate: Bearer resource_metadata="<…>/.well-known/
 * oauth-protected-resource/api/mcp", scope="clock offline_access"[, error="…"]`.
 */
export function mcpAuthErrorResponse(
  read: Exclude<McpContextRead, { kind: "ready" }>,
): Response;

/**
 * D-MCP-15: `POST /oauth2/consent { accept, oauth_query }` con las cabeceras del
 * pedido más `accept: application/json`; devuelve el `url` de `{ redirect: true,
 * url }`, o `expired` si la consulta venció o no verifica.
 */
export async function submitConsent(
  requestHeaders: Headers,
  oauthQuery: string,
  accept: boolean,
): Promise<{ readonly redirectTo: string } | "expired">;
```

`error: null` es el paso 1: sin token, el 401 no lleva `error`.

- **El esquema `Bearer` no distingue mayúsculas** (RFC 7235 §2.1).
- **Un token con `cnf` no pasa** (`invalid_token`): RFC 9449 §7.2 prohíbe
  aceptar como portador un token atado a una clave DPoP, y el recurso no
  verifica pruebas DPoP.
- **Solo un token que no verifica es `invalid_token`**: una cabecera que no se
  decodifica o un `JOSEError` de jose. Las fallas de las claves (`JWKSTimeout`,
  `JWKSInvalid`, `JWKSMultipleMatchingKeys`) y cualquier otro error se
  relanzan, y `handleMcpRequest` responde 500 `-32603` con `console.error`.

### 4.6 El armado de un pedido (`src/server/user-context.ts`, nuevo, y `session.ts`)

`readUserContext` sale de `session.ts` a un archivo que no importa `auth.ts` ni
`next/headers`, para que lo usen la sesión, el token y el gancho de D-MCP-4.

```ts
/** Se mudan desde `session.ts`, sin cambios. */
export type CurrentUser = …;
export type SessionContext = …;
export type SessionRead = …;

/** La persona de una sesión o de un token, como la guarda `user`. */
export type SessionUser = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly image: string | null | undefined;
};

/**
 * D-MCP-3, D-MCP-4: el armado de un pedido a partir de la persona, sin cookies:
 * identidad por pedido, `ensureWorkspaceContext` y el perfil. Lo usan
 * `readSession` y `readAssistantContext`, que lee el token del MCP en
 * `readMcpContext` y autoriza en `mcpAuthMiddleware`; la regla vive una vez.
 */
export async function readUserContext(
  user: SessionUser,
): Promise<Exclude<SessionRead, { kind: "anonymous" }>>;
```

`googlePhotoOf` y `NO_ACCESS` se mudan con ella. `session.ts` reexporta
`CurrentUser` y `SessionContext`, así ningún import existente cambia, y
`readSession` queda: `getSession`; `null` → `anonymous`; si no,
`readUserContext(session.user)`.

### 4.7 El audit log (`src/server/audit.ts`)

```ts
export type AuditEntry = {
  …
  /** D-MCP-12: el cliente OAuth si el cambio vino por MCP; nulo desde la aplicación. */
  readonly oauthClientId?: string | null;
};

/** D-MCP-12: quién escribe una constancia, tomado del actor. */
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

/** D-MCP-9: la traducción de `handle`, sin cambios, para las actions y las herramientas. */
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
 * D-MCP-8: la validación, el permiso y el service de cada operación que comparten
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
/** D-MCP-8: el `stop_timer` del MCP: el del `id`, o el que corre si no se manda. */
export async function stopRunningTimer(
  context: ProfileContext,
  input: StopRunningTimerInput,
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

`startTimer`, `stopTimer`, `createManualEntry`, `updateEntry` y `deleteEntry`
son el cuerpo de hoy de su action (`actions.ts:77-158`), con `context` en lugar
de `session`. Las cinco actions
quedan `handle((session) => operations.<op>(session, input), options)`. Las
demás actions no cambian.

**`service.ts`**: `stopTimer` recibe `{ id?: string }`; sin `id` lee el timer
propio con `findRunning` dentro de su transacción, y sin timer responde
`not_found` con `noRunningTimer`. Si otro pedido lo cerró entre la lectura y el
bloqueo, `already_stopped`, como con `id`. Suma además:

```ts
/** D-MCP-8: las cerradas propias con inicio en el período, y el timer, en un snapshot. */
export async function listEntriesOfPeriod(
  actor: Actor,
  workspace: TrackerWorkspace,
  period: EntriesPeriodValues,
): Promise<EntriesOfPeriod>;

/** D-MCP-8: el timer que corre, o `null`. Sin bloqueo. */
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
/** D-MCP-13: el período más largo que lee `listEntriesOfPeriod`. */
export const ENTRIES_PERIOD_MAX_DAYS = 31;
/** D-MCP-13: el tope de entradas de una lectura de período. */
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

`stopRunningTimerInput = z.object({ id: z.uuid().optional() })`, con su tipo
`StopRunningTimerInput`. Textos nuevos en `timeEntryMessages`: `periodInverted`
«La fecha de fin no puede ser anterior a la de inicio.», `periodTooLong` «El
período puede tener hasta 31 días.» y `noRunningTimer` «No hay ningún timer
corriendo.». `spanDays` sale de `src/server/time` (la diferencia de claves
de día, más uno); si no existe, se agrega ahí.

### 4.10 El módulo `mcp`: esquemas (`src/modules/mcp/schema.ts`)

```ts
export const MCP_SCOPES = ["clock", "offline_access"] as const;
export const MCP_CALLS_PER_MINUTE = 120;

export const mcpMessages = {
  unexpected: "No se pudo completar el pedido. Volvé a intentar.",
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

`get_context` y `list_projects` no tienen entrada. De las entradas solo se
exporta el tipo `UpdateEntryToolInput`, que usa `updateChangesOf`; la lista de
las ocho herramientas vive en `handler.integration.test.ts`, que la compara
con `tools/list`.

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
Cada herramienta declara su `outputSchema` (V-8). Un cliente que solo lee
`content` recibe lo mismo que uno que lee `structuredContent`.

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

/** Lo que devuelve `getConsentView`: `disabled` con el MCP apagado, y la página responde 404. */
export type ConsentRead = { readonly kind: "disabled" } | ConsentView;

export type ConsentView =
  /** Sin consulta, con una firma que no verifica, vencida, o de un cliente que no existe. */
  | { readonly kind: "invalid" }
  /** Sin `mcp.connect`. */
  | { readonly kind: "forbidden"; readonly oauthQuery: string }
  | {
      readonly kind: "ready";
      /** La consulta firmada tal como llegó (`oauthQueryOf`), para mandarla como `oauth_query`. */
      readonly oauthQuery: string;
      readonly clientName: string;
      /** El host del `redirect_uri` **firmado**, o «esta computadora» si es loopback. */
      readonly returnsTo: string;
      readonly email: string;
    };

export const decideConsentInput = z.object({
  oauthQuery: z.string().min(1).max(8192),
  accept: z.boolean(),
});
export type DecideConsentInput = z.infer<typeof decideConsentInput>;
/** La dirección a la que el navegador sigue: el `url` del plugin, con el código o con `access_denied`. */
export type DecideConsentResult = { readonly redirectTo: string };

export type McpErrorCode = ActionErrorCode | "consent_expired";
```

### 4.11 Las herramientas (`src/modules/mcp/tools.ts`)

```ts
/**
 * D-MCP-8, D-MCP-9: registra las ocho herramientas sobre `server`, con el contexto
 * del pedido. Cada una mapea su entrada a la del módulo, llama a `operations` o a
 * `getTrackingCatalog`, y devuelve el resultado de `runTool`.
 */
export function registerTools(server: McpServer, context: McpContext): void;

/** D-MCP-9: corre el trabajo y traduce cualquier error con `failureOf`. */
export async function runTool<T, Out extends Record<string, unknown>>(
  work: () => Promise<T>,
  present: (value: T) => Out,
  messages: ActionMessages,
): Promise<CallToolResult>;
```

Cada `present` se anota con el `*ToolOutput` de su herramienta (§4.10), así un
campo de más o de menos no compila. Los minutos salen de `wholeMinutes(seconds)`
de `src/server/time`.

- **`create_entry`**: `operations.createManualEntry(context, { ...input, id:
input.id ?? crypto.randomUUID() })`.
- **`update_entry`**: arma `{ id, changes }` con los campos presentes;
  `tagIds` va como `changes.tags`. Sin ningún campo, la operación responde
  `validation` con `bulkNoChanges`, como hoy.
- **`stop_timer`**: `operations.stopRunningTimer(context, input)`; sin `id`, el
  service resuelve el timer que corre en su transacción (§4.9).
- **`get_context`**: `timeSettingsOf(context)`, `dayKey(now, timezone)` y
  `getRunningEntry`.
- **`list_projects`**: `getTrackingCatalog(context.actor)`; no consulta más
  permisos que los suyos (`project.track`, `tag.view`).
- Los mensajes `forbidden` y `unexpected` de `runTool` son los de
  `timeEntryMessages` en las de entradas y los de `mcpMessages` en el resto.

### 4.12 El recurso (`src/modules/mcp/handler.ts` y `src/app/api/mcp/route.ts`)

```ts
/** D-MCP-7: el `POST` de `/api/mcp`. */
export async function handleMcpRequest(request: Request): Promise<Response>;
/** D-MCP-7: `GET` y `DELETE`: 405 con `Allow: POST`, o 404 con el MCP apagado. */
export function mcpMethodNotAllowed(): Response;
```

`handleMcpRequest`, en orden: `MCP_ENABLED` (404); `Origin` (403);
`readMcpContext` (401 o 403 con `mcpAuthErrorResponse`);
`consumeCall(context.actor.userId)` (429); el servidor y el transporte de
D-MCP-7, sin `authInfo` (el token no se copia: el SDK no lo necesita); la
respuesta del transporte con `Cache-Control: no-store`. Un error inesperado fuera de una
herramienta responde 500 con un JSON-RPC `-32603` y `console.error`.

`route.ts`: `POST` llama a `handleMcpRequest`; `GET` y `DELETE`, a
`mcpMethodNotAllowed`; `dynamic = "force-dynamic"`.

### 4.13 Los metadatos (`src/app/.well-known/…/route.ts`)

- `oauth-protected-resource/route.ts` y
  `oauth-protected-resource/api/mcp/route.ts`: `GET` con
  `protectedResourceMetadata()`.
- `oauth-authorization-server/api/auth/route.ts` y
  `oauth-authorization-server/route.ts`: `GET` con
  `oauthProviderAuthServerMetadata(auth)`.
- Lo que V-7 pida además para un cliente de la lista.
- Todos: 404 con el MCP apagado; `Access-Control-Allow-Origin: *`;
  `Cache-Control: public, max-age=300`.

### 4.14 El módulo `mcp`: service, repository y actions

**`repository.ts`**:

```ts
/**
 * D-MCP-13: suma un pedido al minuto en curso de `userId`, o reinicia la ventana si
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
/** D-MCP-13: `true` si el pedido entra en el minuto. */
export async function consumeCall(userId: string): Promise<boolean>;

/** D-MCP-5, §5.3: las autorizaciones propias, una por cliente; `disabled` con el MCP apagado. */
export async function getGrantsView(context: ProfileContext): Promise<GrantsView>;

/** D-MCP-5: `mcp.grant.revoke`, después `deleteGrant` en una transacción. Idempotente. */
export async function revokeGrant(
  actor: Actor,
  input: RevokeGrantInput,
): Promise<RevokeGrantResult>;

/**
 * D-MCP-15, §5.1: lo que muestra `/conectar`; `disabled` con el MCP apagado. Arma
 * la consulta con `oauthQueryOf`, la verifica con `verifyOAuthQueryParams` y su
 * `exp`, y saca el destino del `redirect_uri` firmado y el nombre de
 * `findClientName(client_id)`.
 */
export async function getConsentView(
  context: SessionContext,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ConsentRead>;

/** El recurso de `mcp.connect`: el workspace de quien pide. Lo usa también la action. */
export function workspaceResource(actor: Actor): WorkspaceResource;
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
// parse; con accept, assertCan(actor, "mcp.connect", service.workspaceResource(actor)); submitConsent(await headers(),
// oauthQuery, accept); "expired" responde consent_expired. Cancelar no consulta permisos.
// handle(…, { paths: [], messages: { forbidden: consentForbidden, unexpected: unexpectedConsent } })
```

### 4.15 `team` (`src/modules/team/service.ts`)

En `writeStatus`, al desactivar, después de `deleteSessionsOf(tx, actor,
target.userId)`: `deleteGrantsOf(tx, actor, target.userId)` (D-MCP-6). El
comentario suma la cuarta escritura y el orden de bloqueos, con el `set null`
de los tokens.

### 4.16 El script de un cliente creado de antemano (`scripts/oauth-client/main.ts`, solo si V-7 lo pide)

- `--dry-run` muestra el cliente que crearía (nombre, redirecciones, si es
  público o confidencial) y si cada redirección pasa `isAllowedRedirect`;
  `--apply` lo crea con la API del plugin del lado del servidor y muestra una
  sola vez el `client_id` y el secreto, que no se guardan en ningún archivo.
- Una redirección que no pasa `isAllowedRedirect` corta antes de crear.
- No crea consentimientos: la persona autoriza como con cualquier cliente.

### 4.17 Las respuestas

| Situación                                                          | Respuesta                                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| MCP apagado                                                        | 404 en `/api/mcp`, metadatos, `/conectar` y las rutas OAuth; sin sección en `/perfil` |
| `GET` o `DELETE` a `/api/mcp`                                      | 405, `Allow: POST`                                                                    |
| `Origin` ajeno                                                     | 403                                                                                   |
| Sin token                                                          | 401, `WWW-Authenticate: Bearer resource_metadata="…", scope="clock offline_access"`   |
| JWT inválido, vencido, de otro emisor, otra audiencia u otro `typ` | 401, `error="invalid_token"`                                                          |
| Sin el alcance `clock`                                             | 403, `error="insufficient_scope"`                                                     |
| Consentimiento borrado, identidad o membresía que no pasan         | 401, `error="invalid_token"`                                                          |
| Más de 120 pedidos en el minuto                                    | 429, `Retry-After: 60`, JSON-RPC `-32000` con `rateLimited`                           |
| Cuerpo de más de 64 KiB                                            | 413                                                                                   |
| Error de dominio en una herramienta                                | 200, resultado `isError: true` con `{ code, message }`                                |
| Herramienta desconocida                                            | 200, resultado `isError: true` del SDK («Tool … not found»), sin `code` (V-8)         |
| JSON inválido                                                      | 400, JSON-RPC `-32700`, del SDK                                                       |
| Registro con una redirección fuera de la lista                     | 400 `invalid_redirect_uri`                                                            |
| Más de 5 registros en 60 s desde una IP                            | 429 del plugin                                                                        |
| Autorizar con una redirección no registrada o fuera de la lista    | la respuesta del plugin, sin redirigir                                                |
| Autorizar sin `resource`                                           | 400 `invalid_request`, sin redirigir                                                  |
| Autorizar con otro `resource`                                      | `invalid_target` del plugin, después de validar la redirección                        |
| Autorizar con sesión y sin acceso                                  | redirección a `/login?error=<motivo>`                                                 |
| Consentimiento cancelado                                           | el cliente recibe `error=access_denied`                                               |
| Consentimiento vencido o con firma que no verifica                 | `/conectar` en `invalid`; la action, `consent_expired`                                |
| Desconectar algo que ya no está                                    | éxito sin escribir                                                                    |

## 5. Pantallas

Ningún texto nombra a un asistente ni a un proveedor: el nombre es el que
declaró el cliente y el destino sale de la redirección firmada.

### 5.1 El consentimiento (`src/app/conectar/page.tsx`)

`ConnectPage({ searchParams }: PageProps<"/conectar">)`: `MCP_ENABLED` o
`notFound()` (antes de la sesión, así un anónimo también recibe 404);
`requireSession()`; `getConsentView(session, await searchParams)`, que con el
MCP apagado da `disabled` y la página responde `notFound()`; `ConsentScreen` de
`mcp/components/consent-screen.tsx` con la vista y `decideConsent`. Misma caja
que `/login` (centrada, `max-w-sm`).

- **`ready`**:
  - Título: «Conectar {clientName} con Clock».
  - Texto: «{clientName} va a poder ver, cargar, editar y borrar tus horas, y
    leer tus proyectos, tareas y etiquetas, con tu cuenta ({email}).».
  - Una línea en gris: «Vuelve a: {returnsTo}». `returnsTo` sale del
    `redirect_uri` de la consulta firmada: el host (`claude.ai`, `chatgpt.com`)
    o «esta computadora» para loopback. **El nombre lo declara el cliente; el
    destino firmado es lo que se puede creer**, y por eso va siempre.
  - «Podés desconectarlo cuando quieras desde tu perfil.».
  - Botones «Cancelar» (secundario) y «Conectar» (primario).
- **`forbidden`**: el texto de `consentForbidden` y solo «Cancelar».
- **`invalid`**: «El pedido de conexión venció o no es válido. Volvé a
  conectar desde el asistente.», sin botones.
- **Al elegir**: los dos botones en `aria-disabled` y «Conectando…» en el
  primario; con éxito, `window.location.assign(redirectTo)`; con error, el
  mensaje en un `Alert` y los botones de nuevo, salvo `consent_expired`, que
  pasa a `invalid`.

### 5.2 `/login` y el cliente de Better Auth

- **`src/lib/auth-client.ts`**: `createAuthClient({ plugins:
[oauthProviderClient()] })`. Con la consulta firmada en la dirección, el
  `signIn.social` del botón lleva `oauth_query`; sin ella, manda lo de hoy (lo
  afirma el criterio 18).
- **`LoginPage`**: con sesión, `redirect("/")` **salvo** que
  `isOAuthLoginQuery(await searchParams)`; en ese caso muestra la pantalla de
  siempre. Un motivo de error se muestra como hoy.
- **`GoogleSignInButton` no cambia**.

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
- **La lista** (`ul`), una fila por cliente: el nombre en negrita; debajo, en
  gris, «Vuelve a {returnsTo} · Conectado el {grantedOn}»; a la derecha,
  «Desconectar» si `canRevoke`.
- **Vacía**: «No conectaste ningún asistente.».
- **Desconectar** abre una confirmación (`Dialog`, como la de revocar una
  invitación): «¿Desconectar {nombre}?», «Va a dejar de poder ver y editar tus
  horas. Para volver a usarlo, conectalo de nuevo desde el asistente.»,
  «Cancelar» y «Desconectar» (`destructive`). Confirmar cierra el diálogo y
  manda el pedido; con éxito, la fila se va y un `status` dice «Desconectaste
  {nombre}.»; el foco va al encabezado de la sección. Con error, el mensaje y,
  con `unexpected`, «Reintentar». Un pedido a la vez.

### 5.4 Textos (`mcp/components/labels.ts`)

Los de §5.1 y §5.3. Los de error salen de `mcpMessages`.

## 6. La transición en producción

Hechos que el contrato da por dados: Vercel despliega `main` a producción en
cada push y el build no migra; el usuario migra producción con `!` antes del
push del merge que lo necesita. Previews públicos, con la rama `preview` de
Neon y `BETTER_AUTH_URL` declarada por rama. **La actualización de Better Auth
ya está en producción** (§0).

### 6.1 Antes del push del MCP

1. **El usuario migra producción** (`npm run db:migrate` con la URL de
   producción). La migración solo suma: el código de `main` sigue igual.
2. **No toca las variables de producción**: sin `MCP_ENABLED`, el MCP queda
   apagado.

### 6.2 El despliegue

El team-lead mergea y pushea. Con el MCP apagado, lo único visible es que nada
cambió: `/perfil` sin sección, `/api/mcp` y las rutas OAuth en 404, y
`get-session` sin `set-auth-jwt`. Lo que sí corre desde el primer pedido:
`auditActorOf` en todas las constancias (con `oauth_client_id` nulo),
`failureOf` en las actions, `operations.ts` en cinco actions,
`oauthProviderClient` en el login (sin consulta no agrega nada) y la
desactivación con `deleteGrantsOf` (que borra cero filas).

### 6.3 Encenderlo

Después de §6.6 en un preview (decisión del usuario, §11):

1. El usuario pone `MCP_ENABLED=true` en el entorno de producción de Vercel
   (y, si V-7 lo pidió, `MCP_REDIRECT_URIS` y `MCP_ALLOWED_ORIGINS`) y
   **vuelve a desplegar** el último despliegue: una variable nueva no llega a
   uno ya hecho.
2. **Humo**, con la cuenta del owner, una vez en claude.ai y una en ChatGPT:
   agregar un conector personalizado con `https://<producción>/api/mcp`;
   conectar, entrar con Google, ver `/conectar` con «Vuelve a: claude.ai» o
   «Vuelve a: chatgpt.com», conectar; pedir «¿qué horas cargué esta semana?»
   (`get_context` y `list_entries`). En `/perfil`, las dos filas. Desconectar
   las dos, y el pedido siguiente de cada asistente pide volver a conectar.
   **No se cargan horas de prueba en producción**: lo de escribir lo cubren la
   integración, la e2e y el preview.

### 6.4 Apagar y revertir

- **Apagar**: `MCP_ENABLED=false` y volver a desplegar. Las autorizaciones
  quedan en la base y vuelven a servir al encenderlo.
- **Revertir el MCP**: `git revert -m 1 <merge>` y push. El código anterior no
  lee las tablas nuevas ni la columna; no hace falta la migración de reversión
  de §2, que solo se corre si se quiere borrar todo. La actualización de Better
  Auth queda: es otro cambio.

### 6.5 Después

La consulta, sin urgencia, que muestra que ninguna persona inactiva conserva
autorizaciones (tiene que dar cero filas). Un refresh suelto de una
renovación cruzada con una desactivación (D-MCP-6) no aparece acá, porque no
tiene consentimiento, y no sirve para nada.

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

### 6.6 Preview

Para probar los conectores contra un preview de `mejoras/mcp`, el usuario:

1. Declara en Vercel, entorno Preview, rama `mejoras/mcp`:
   `BETTER_AUTH_URL=https://<dirección del preview de la rama>` (sin ella,
   «invalid origin») y `MCP_ENABLED=true`.
2. Suma `https://<preview>/api/auth/callback/google` al cliente OAuth de
   Google, como en las otras ramas con `BETTER_AUTH_URL` propia.
3. Migra la rama `preview` de Neon.
4. Conecta, con una cuenta que tenga membresía activa en esa base (datos
   sintéticos): claude.ai, ChatGPT y, si se puede desde la máquina del usuario,
   Codex, cada uno como conector o servidor MCP con
   `https://<preview>/api/mcp`.
5. Captura para V-7 los cuerpos del registro y de la autorización de cada uno y
   los `Origin` de sus pedidos, con un `console.info` temporal de los ganchos y
   del recurso que no llega al merge, o con los logs del preview. Anota qué hace
   cada cliente con `destructiveHint` al pedirle borrar una entrada sintética.
6. Si un cliente falla por algo que V-7 prevé (redirección, `Origin`,
   `resource`, un campo de metadatos, un cliente creado de antemano), se
   corrige y se repite antes del merge.

### 6.7 En local, con Claude Code o Codex

1. `docker compose up -d`, `npm run db:migrate`, `.env.local` con
   `MCP_ENABLED=true` y `BETTER_AUTH_URL=http://localhost:3000` (la
   especificación admite `http` para `localhost`).
2. `npm run dev`.
3. `claude mcp add --transport http clock-local http://localhost:3000/api/mcp`
   (o el comando equivalente de Codex para un servidor MCP por HTTP con OAuth).
4. Autenticar desde el cliente: abre el navegador, Google con la cuenta de
   siempre (el cliente de Google de desarrollo ya tiene el callback de
   `localhost`), `/conectar` con «Vuelve a: esta computadora», «Conectar».
5. Pedirle «¿qué cargué hoy?» y «cargá 9 a 10 en {proyecto}». La entrada
   aparece en `http://localhost:3000/`.

Sin Google, la sesión de prueba (`ALLOW_TEST_SESSION=true`) abre la sesión en el
navegador antes del paso 4, como en los e2e.

## 7. Reparto de archivos

La actualización de Better Auth no está en este reparto: la hace otro agente
antes (§0).

### backend-dev

- **Primero, V-7 y V-8** (§0); V-7 se cierra en el preview (§6.6), con el
  usuario. Fija y avisa a `frontend-dev` y a `e2e-tester`: `GrantsView`,
  `ConsentView`, los inputs y resultados de las dos actions, `McpErrorCode`,
  `mcpMessages` e `isOAuthLoginQuery`.
- `package.json`: `@better-auth/oauth-provider` 1.7.10 exacto y
  `@modelcontextprotocol/sdk`.
- `src/server/env.ts` (§4.1); `src/server/auth.ts` y la regeneración de
  `auth-schema.ts` (§4.2, §2); `src/server/oauth-records.ts` (§4.3);
  `src/server/mcp-auth.ts` (§4.4); `src/server/mcp-context.ts` (§4.5);
  `src/server/user-context.ts` y `session.ts` (§4.6); `src/server/audit.ts` y
  cada constancia armada con un `Actor` (§4.7); `src/server/failure.ts` y
  `action.ts` (§4.8); `src/server/permissions/index.ts` (§3);
  `src/lib/auth-client.ts` (§5.2).
- `src/server/db/schema.ts` y la migración (§2).
- `src/modules/time-entry/operations.ts`, `actions.ts`, `service.ts`,
  `repository.ts`, `schema.ts` (§4.9).
- `src/modules/mcp/schema.ts`, `tools.ts`, `handler.ts`, `repository.ts`,
  `service.ts`, `actions.ts` (§4.10 a §4.14).
- `src/app/api/mcp/route.ts` y `src/app/.well-known/**/route.ts` (§4.12,
  §4.13).
- `src/modules/team/service.ts` (§4.15) y, si el MCP mergea después de E2b,
  `bindGoogleAccount` y `releaseEmailOf` (§1).
- `scripts/oauth-client/`, solo si V-7 lo pide (§4.16).
- `src/app/login/page.tsx` y `src/app/conectar/page.tsx`: las páginas, que
  componen; las pantallas son de `frontend-dev`.
- `CLAUDE.md`: en «Estructura», `api/mcp/`, `.well-known/`, `conectar/`,
  `modules/<modulo>/operations.ts`, `src/server/mcp-auth.ts`,
  `mcp-context.ts`, `user-context.ts`, `oauth-records.ts` y `failure.ts`; en
  «Recorrido de una mutación», una línea: «Una herramienta del MCP sigue el
  mismo recorrido: el token reemplaza a la sesión (`readMcpContext`) y la
  operación compartida de `operations.ts` hace el resto.».

### frontend-dev

- `src/modules/mcp/components/`: `consent-screen.tsx`, `assistant-grants.tsx`,
  `revoke-grant-dialog.tsx`, `labels.ts` y sus tests de componente (§5.1, §5.3,
  §5.4).
- `src/app/(app)/perfil/page.tsx`: la composición de la sección (§5.3).

### test-engineer

- Los tests de integración de §9.2 que no son de `backend-dev`: el recorrido
  completo con tokens reales (`src/test/mcp.ts`, el helper que los emite), la
  matriz de D-MCP-3 y la de D-MCP-4, con la retoma por la sesión de prueba.
  `backend-dev` escribe los de cada función que entrega.

### e2e-tester

- `e2e/mcp.ts`: el cliente de prueba (registro con los cuerpos reales de V-7,
  PKCE, `resource`, autorización en el navegador con la sesión de prueba,
  intercambio del código, `tools/call`).
- `e2e/mcp.spec.ts` con los recorridos de §9.3; confirma que fallan antes de la
  implementación.
- `e2e/database.ts`: `grantCountOf(email)`.

### security-reviewer

Revisa D-MCP-2 a D-MCP-5, D-MCP-7, D-MCP-14 y D-MCP-15 contra la
especificación de autorización de MCP y contra el código, antes del merge, y el
script de §4.16 si existe.

### Lo que no toca nadie

`access.ts`, `entry.ts`, `test-session.ts`, `google-sign-in-button.tsx`,
`workspace/`, `report/` y `project/` (salvo sus constancias), `next.config.ts` y
el cron.

### Orden

0. **Precondición**: la actualización de Better Auth, mergeada y desplegada
   (§0). El worktree del MCP arranca o rebasa sobre ese `main`.
1. `backend-dev`: V-8, y lo que se pueda de V-7 contra la documentación de cada
   proveedor. Si algo falla, se para.
2. `backend-dev`: los tipos y textos de §4.10 e `isOAuthLoginQuery`; avisa.
3. En paralelo: `backend-dev` con el servidor; `frontend-dev` con las pantallas;
   `e2e-tester` con el arnés y el spec; `test-engineer` con el helper y las
   matrices.
4. Preview (§6.6) con el usuario: se cierra V-7 y se corrige lo que haga falta.
5. Revisiones, con `security-reviewer`; correcciones; la e2e en una base nueva
   y en una que se reusa.

## 8. Criterios de aceptación

1. **Descubrimiento**: con el MCP encendido, `POST /api/mcp` sin token responde
   401 con `WWW-Authenticate` que apunta a
   `/.well-known/oauth-protected-resource/api/mcp` y pide `scope="clock
offline_access"`; esa dirección y la raíz devuelven `resource`,
   `authorization_servers` con `<BETTER_AUTH_URL>/api/auth` y los dos alcances;
   `/.well-known/oauth-authorization-server/api/auth` y la raíz anuncian el
   registro, PKCE `S256`, los dos alcances y solo `authorization_code` y
   `refresh_token`.
2. **Registro con lista**, con los cuerpos reales capturados en V-7: el de Claude
   Code, **sin `application_type`** y con `http://127.0.0.1:<puerto>/callback`,
   se crea; los de claude.ai y ChatGPT, con sus redirecciones, se crean (o, si
   V-7 mostró que ChatGPT necesita un cliente creado de antemano, el script de
   §4.16 lo crea y la autorización anda); uno con `https://evil.example/cb`, o
   con una lista que mezcle una permitida y una no, responde 400 sin fila. El
   sexto registro en 60 segundos desde la misma IP responde 429.
3. **El recorrido completo**: registro; autorización con PKCE, `resource` y los
   alcances del 401; sin sesión, `/login` con la consulta firmada, ingreso que
   retoma la autorización por `oauth_query`; `/conectar` con el nombre y «Vuelve
   a» del `redirect_uri` firmado; «Conectar», que con `accept:
application/json` recibe `{ redirect: true, url }` y sigue el `url`; código;
   **token de acceso JWT con `typ: "at+jwt"` y refresh token**; `initialize`,
   `tools/list` con las ocho, `tools/call`. Funciona con Claude Code en local, y
   con claude.ai y ChatGPT en el preview (§6.6, lo verifica el usuario).
4. **Cancelar**: el cliente recibe `access_denied` y no queda autorización.
5. **Autorizar exige acceso** (D-MCP-4), cada caso sin código:
   - con sesión viva, un externo con la invitación revocada y un correo cuyo
     dominio salió de `GOOGLE_WORKSPACE_DOMAINS` terminan en
     `/login?error=sin_invitacion`; una membresía pasada a `inactive` por SQL,
     en `/login?error=membresia_inactiva` y de ahí en `/`;
   - `POST /oauth2/consent` de cualquiera de ellos responde 403;
   - **la retoma** con `POST /test-session/sign-in` y `oauth_query` en el
     cuerpo, para una persona sin acceso, también corta;
   - una autorización sin `resource` responde 400 sin redirigir; una con
     `https://otro.example/api/mcp` recibe `invalid_target` del plugin;
   - una con una dirección que el cliente no registró, aunque esté en la lista,
     no se acepta; una con una redirección que se sacó de `MCP_REDIRECT_URIS`
     después de registrar el cliente tampoco.
6. **Cada herramienta hace lo de su action**: `create_entry` crea la entrada
   con las horas de pared en la zona del perfil, el facturable por omisión del
   proyecto y las etiquetas; `update_entry` con `times`, `project`, `tagIds` y
   `runningStart`; `delete_entry`; `start_timer` cierra el que corría en el
   mismo instante; `stop_timer` con y sin id; `list_entries` con el corte por
   día de inicio; `list_projects` con lo que el selector del rastreador
   ofrece; `get_context` con zona, hoy y el timer.
7. **Los mismos errores**: una entrada de otra persona responde `forbidden`
   con «No tenés permiso para editar esta entrada.»; una de otro workspace,
   `not_found`; un proyecto privado ajeno, el error de `assertTrackable`; una
   hora que no existe, `nonexistentClock`; un período de 32 días,
   `periodTooLong`; `stop_timer` sin timer, `noRunningTimer`. Todos como
   resultado `isError: true` con código y texto, sin escribir.
8. **Idempotencia** (ADR 0007): `create_entry` y `start_timer` con el mismo
   `id` dos veces dejan una fila y una constancia; sin `id`, dos llamadas
   crean dos.
9. **El audit log**: cada constancia que deja una herramienta tiene
   `actor_id` de la persona y `oauth_client_id` del cliente que la pidió —uno
   distinto para dos clientes de la misma persona—; las de la pantalla, nulo.
   Todas las constancias que dejan los tests de integración de la pantalla
   siguen iguales.
10. **El token no depende de la sesión web** (D-MCP-3): después de cerrar la
    sesión web (`/sign-out`) y con la sesión vencida por SQL
    (`expires_at` en el pasado), el token de acceso sigue respondiendo y el
    refresh token emite uno nuevo que también.
11. **Nunca más que una sesión** (D-MCP-3), cada uno con 401 y sin escribir:
    token vencido; token de otro emisor; token de otra audiencia; JWT firmado
    con las mismas claves y otro `typ`; token con la firma alterada;
    consentimiento borrado por SQL; membresía pasada a `inactive` por SQL;
    externo con la invitación revocada; correo cuyo dominio salió de
    `GOOGLE_WORKSPACE_DOMAINS` sin invitación. Sin el alcance `clock`, 403.
12. **Desconectar** (D-MCP-5): desde `/perfil`, la fila se va, queda
    `mcp.revoke`, el token de acceso vigente recibe 401 en el pedido siguiente y
    el refresh token no emite otro; otro cliente de la misma persona sigue
    andando. Desconectar otra vez responde éxito sin constancia. Un `clientId`
    de otra persona no borra nada. Dos consentimientos del mismo cliente se ven
    como una fila y se borran juntos.
13. **Desactivar revoca** (D-MCP-6): el owner desactiva a P con dos asistentes
    conectados: cero consentimientos y tokens de P, `mcp.revokeAll` con
    `{ clients: 2 }`, y el criterio 1 de E2 sigue valiendo. Si algo falla
    después, todo vuelve atrás (criterio 17 de E2), también el `set null` de los
    tokens. Un refresh insertado después de la desactivación da un token que
    responde 401. Reactivar no devuelve autorizaciones.
14. **Límite por persona**: el pedido 121 del minuto responde 429 con
    `Retry-After`, sume los de uno o de dos clientes de la misma persona; el
    primero del minuto siguiente pasa; otra persona no se entera.
15. **Transporte**: `GET` y `DELETE` responden 405; un cuerpo de 70 KiB, 413;
    un `Origin: https://evil.example`, 403; uno de `MCP_ALLOWED_ORIGINS` y uno
    ausente pasan; ninguna respuesta lleva `Mcp-Session-Id`.
16. **Interruptor**: con `MCP_ENABLED` sin declarar, `/api/mcp`, los metadatos,
    `/conectar` y las cinco rutas OAuth responden 404, y `/perfil` no tiene la
    sección. **`npm run auth:schema` sin la variable no cambia
    `auth-schema.ts`.** **`get-session` no trae `set-auth-jwt`**, con el MCP
    encendido y apagado. Con el plugin cargado, las suites del ingreso siguen en
    verde sin cambiar lo que afirman. El resto de la aplicación igual.
17. **Los endpoints cerrados**: cada camino de la lista fija de D-MCP-2, con
    `/oauth2/client/rotate-keys`, responde 404 con el MCP encendido; crear o
    editar clientes por `auth.api` (`adminCreateOAuthClient`,
    `adminUpdateOAuthClient`) con una sesión válida responde 401 sin escribir
    en `oauth_client`, y el registro dinámico anónimo sigue creando; crear,
    editar o listar recursos por las rutas `/admin/oauth2/…` con parámetros
    responde el rechazo de los privilegios; un pedido de token con
    `client_credentials` se rechaza; un token emitido con la cabecera `DPoP`
    (con `cnf`) recibe 401 en `/api/mcp`.
18. **`/login`**: sin consulta, lo de hoy (redirige a `/` con sesión, y el
    ingreso no manda `oauth_query`); con la consulta firmada y sesión abierta
    (`prompt=login`), muestra el botón y no redirige.
19. **Las pantallas**: `/conectar` en sus tres estados con sus textos, con un
    parámetro repetido que se conserva y una firma alterada que da `invalid`;
    «Asistentes conectados» con la dirección para copiar, la lista, el vacío,
    la confirmación, el aviso y el foco de §5.3. Ningún texto nombra a un
    asistente.
20. **V-7 cerrada**: el registro del slice tiene, por cada cliente de §0, lo que
    V-7 pide, y los valores por omisión de §4.1 coinciden con lo capturado.
21. **La e2e entera en verde**, en una base nueva y en una que se reusa; los
    recorridos de ingreso, perfil y equipo sin cambiar lo que afirman.

## 9. Plan de tests

### 9.1 Unidad

- `mcp-auth.test.ts`: `isAllowedRedirect` (cada dirección por omisión, exacta;
  loopback con y sin puerto, `localhost` con `https`, `127.0.0.2`,
  `localhost.evil.example`, `chatgpt.com.evil.example`, mayúsculas, barra
  final); `isOAuthLoginQuery`; `oauthQueryOf` con parámetros repetidos;
  `protectedResourceMetadata`; `mcpDisabledPaths` encendido y apagado, con
  `rotate-keys` en los dos.
- `mcp-context.test.ts`: `mcpAuthErrorResponse` con cada caso; `readMcpContext`
  con el esquema en mayúsculas o minúsculas, otro esquema, un token que no
  verifica (`invalid_token`) y una falla al leer las claves (se relanza).
- `mcp/handler.test.ts`: si `readMcpContext` rechaza, 500 `-32603` con
  `console.error`.
- `time.test.ts`: `wholeMinutes`.
- `permissions.test.ts`: `mcp.connect` y `mcp.grant.revoke` con cada rol, con
  un actor inactivo, sobre otro workspace y, la segunda, sobre otra persona.
- `audit.test.ts`: `auditActorOf` con y sin cliente.
- `failure.test.ts`: los cuatro caminos de `failureOf`, mudados de los de
  `action.ts` si los hay.
- `env.test.ts`: las tres variables, ausentes y con valores.
- `time-entry/schema.test.ts`: `entriesPeriodInput` (invertido, 31 y 32 días,
  día inválido).
- `mcp/schema.test.ts` y `tools.test.ts`: los esquemas de entrada; el mapeo de
  `update_entry` a `changes`; `toolEntryOf`; el texto de `content` igual a
  `structuredContent`.
- Los tests de componente de `consent-screen`, `assistant-grants` y
  `revoke-grant-dialog`; `login/page.test.tsx` con y sin consulta de
  autorización.

### 9.2 Integración (Postgres)

- **`src/test/mcp.ts`**, el helper de `test-engineer`: `issueTestGrant(email,
{ registration })` corre registro (con uno de los cuerpos reales de V-7),
  autorización (que con la cookie de la sesión de prueba redirige a `/conectar`
  con la consulta firmada), `POST /oauth2/consent` con esa consulta y `accept:
application/json`, y el canje del código, contra `auth.handler`; devuelve el
  JWT de acceso, el refresh y el `clientId`. `resumeWithTestSession(email,
oauthQuery)` hace `POST /test-session/sign-in` con `oauth_query` en el cuerpo
  y devuelve la respuesta de la retoma. `callMcp(token, body)` llama a
  `handleMcpRequest` con un `Request` armado.
- **`mcp/handler.integration.test.ts`**: criterios 1, 10, 11 (cada fila), 14 y
  15, por `handleMcpRequest`. El 14 con `MCP_CALLS_PER_MINUTE` pedidos seguidos,
  repartidos entre dos clientes; el cambio de minuto, escribiendo
  `window_start` un minuto atrás. Los tokens de otro emisor, de otra audiencia,
  con otro `typ` y con la firma alterada se firman en el test con una clave
  propia o con las de `jwks`, o se alteran byte a byte.
- **`mcp/tools.integration.test.ts`**: criterios 6 a 9 por `tools/call`: cada
  herramienta, sus errores y las constancias con `oauth_client_id`. El 9 cuenta
  las filas nuevas de `audit_log` de cada llamada y afirma el cliente en todas,
  con dos clientes.
- **`mcp-auth.integration.test.ts`**: criterios 2, 5, 16 y 17 por
  `auth.handler`: el registro con cada cuerpo, el gancho de autorizar y
  consentir con cada caso —también en la retoma con `resumeWithTestSession`—,
  `validateRedirectUri` con una dirección permitida que el cliente no registró,
  el interruptor, `get-session` sin `set-auth-jwt`, las suites del ingreso con
  el plugin cargado, los endpoints cerrados y `client_credentials`.
- **`mcp/service.integration.test.ts`**: `getGrantsView` (dos consentimientos
  del mismo cliente, una fila; dos clientes, dos filas), `revokeGrant`
  (criterio 12, también con el `clientId` de otra persona), `getConsentView` en
  sus tres estados (firma alterada, vencida, parámetro repetido) y `disabled`
  con el MCP apagado, `consumeCall`.
- **`mcp/actions.integration.test.ts`**: `revokeGrant` y `decideConsent` con
  cada fila de §4.17 que les toca; sin sesión, a `/login` sin escribir.
- **`oauth-records.integration.test.ts`**: `listGrantsOf`, `hasGrant`,
  `deleteGrant` y `deleteGrantsOf` borran solo lo de la persona, dejan su
  constancia y no la dejan sin filas.
- **`team/service.integration.test.ts`**: criterio 13, con `issueTestGrant`
  dos veces para P; el fallo inyectado de E2 después de `deleteGrantsOf`; el
  refresh suelto, insertando una fila de refresh de P después de desactivarla y
  renovando con ella.
- **`time-entry/service.integration.test.ts`**: `listEntriesOfPeriod` (corte
  por día de inicio en la zona, el timer aparte, el tope con `truncated`),
  `getRunningEntry` y `stopTimer` sin `id` (el propio que corre, no el de otra
  persona; sin timer, `noRunningTimer`).
- **`session.integration.test.ts`**: `readUserContext` da lo mismo que
  `readSession` para los casos que ya prueba.
- **`scripts/oauth-client`**, si existe: `--dry-run` no escribe; una
  redirección fuera de la lista corta; `--apply` crea un cliente que
  `issueTestGrant` puede usar sin registro.

Cada test nuevo tiene que poder fallar: se verifica con una mutación en una
copia, como en los slices anteriores. En particular: sin el paso 4 de D-MCP-3
el criterio 12 falla; sin `deleteGrantsOf`, el 13; sin el gancho de D-MCP-4, el
5; mirando `sid`, el 10; sin `matched` en `validateRedirectUri`, el 5; sin
`disableSettingJwtHeader`, el 16.

### 9.3 E2E (`e2e/mcp.spec.ts`)

Con correos y nombres únicos, sin afirmar sobre la base entera.

1. **Conectar y cargar**: P entra con `signIn`. El cliente de prueba registra
   el cuerpo de Claude Code con `http://127.0.0.1:<puerto>/callback`, abre la
   autorización en la pestaña de P, `/conectar` muestra el nombre y «Vuelve a:
   esta computadora», P elige «Conectar», la prueba captura el código con
   `page.route`, lo cambia por un token y llama a `create_entry` con un proyecto
   de P. En `/`, la entrada está. En `/perfil`, «Asistentes conectados» tiene la
   fila.
2. **Desconectar**: P elige «Desconectar», confirma; el aviso dice
   «Desconectaste {nombre}.»; `tools/call` con el mismo token responde 401;
   `grantCountOf(P)` en 0.
3. **Cancelar**: en `/conectar`, «Cancelar» lleva al callback con
   `error=access_denied`; `/perfil` sin la fila.
4. **Sin sesión, con la retoma**: la autorización abierta en una pestaña sin
   sesión lleva a `/login` con la consulta firmada. La prueba hace
   `POST /test-session/sign-in` desde esa pestaña con `oauth_query` en el
   cuerpo, la retoma de la autorización lleva a `/conectar`, y «Conectar» termina
   en el callback con un código. Sin tocar `test-session.ts`.
5. **Desactivar corta**: con P conectada, el owner la desactiva desde
   `/equipo`; `tools/call` responde 401 y `grantCountOf(P)` da 0.

### 9.4 Lo que no se prueba en e2e

El ingreso con Google (como siempre; la retoma que dispara se prueba con la
sesión de prueba, e2e 4); claude.ai, ChatGPT, Claude Code y Codex, que prueba el
usuario en §6.6 y §6.7; el límite de frecuencia, el tamaño del cuerpo, el
`Origin`, los casos del gancho de autorizar y el refresh (integración).

## 10. Riesgos

- **Las direcciones de vuelta y los `Origin` por omisión no están confirmados**
  (V-7): las de claude.ai y ChatGPT salen de lo que se sabe hoy de cada
  proveedor, y un proveedor las puede cambiar. Con una equivocada, ese cliente
  no se conecta, pero ningún otro gana acceso. Se corrigen con la variable, sin
  código. El merge espera V-7.
- **Un cliente de la lista que no se registre solo** (V-7): entra por el script
  de §4.16, que no abre el registro.
- **Better Auth fijo**: sin `^`, una corrección de seguridad de Better Auth no
  entra sola. Una actualización sube los cuatro paquetes juntos y vuelve a
  probar el ingreso y el flujo OAuth.
- **Phishing de consentimiento con un cliente de la lista**: alguien registra un
  cliente con el nombre de un asistente conocido y la redirección de claude.ai o
  de ChatGPT; el código iría a ese proveedor, no al atacante, así que no le
  sirve. Con loopback, el código va a la computadora de la persona: un atacante
  tendría que estar corriendo en ella. La pantalla muestra el destino firmado.
- **Registros de clientes que nadie usa**: el registro es abierto y el límite
  del plugin es por instancia (D-MCP-13). Cada registro es una fila sin acceso a
  nada. Si crecen, una limpieza de clientes sin consentimiento de más de un día
  entra en el cron; no se hace ahora.
- **El límite del registro por IP con conectores remotos**: los registros de
  claude.ai o de ChatGPT llegan desde las IP de su proveedor. Si muchas personas
  conectan en el mismo minuto, alguna recibe 429 y vuelve a intentar.
- **Un refresh suelto** de una renovación cruzada con una desactivación
  (D-MCP-6): queda una fila sin consentimiento que no da acceso. Inocuo.
- **Borrar una fila de `user`** se lleva sus autorizaciones por el `on delete
cascade` hacia `user` (§2), sin constancia. Quien borre personas (E2b,
  scripts) llama antes a `deleteGrantsOf`, que la deja.
- **Cambiar `BETTER_AUTH_SECRET`** deja ilegibles las claves privadas de `jwks`
  y, con ellas, todos los tokens: cada persona vuelve a conectar. Igual que hoy
  con las sesiones.
- **Si un cliente no manda `resource`** (V-7), el 400 de D-MCP-4 lo dejaría
  afuera: V-7 lo detecta en el preview, y la salida es completar
  `mcpResourceUrl()` en la consulta en el mismo gancho.
- **Un cliente que ignora `destructiveHint`** borra sin pedir confirmación: es
  la decisión del usuario (§11) y la constancia guarda la fila entera (TT-61),
  como en la pantalla.
- **Una herramienta futura que escriba sin `auditActorOf`** perdería la marca:
  el criterio 9 cuenta las constancias de cada llamada, y una herramienta nueva
  suma su caso.
- **Una regla nueva en una action que no pasa por `operations.ts`**: solo cinco
  actions la usan. Una herramienta nueva sobre otra operación la muda primero.
- **El paso 4 de D-MCP-3 se pierde en un cambio futuro**: revocar dejaría de ser
  inmediato hasta una hora. El criterio 12 lo frena.
- **El costo por pedido**: verificar (sin consulta, con las claves en caché),
  leer el consentimiento, la identidad, el contexto, el perfil y el límite son
  unas cinco consultas por índice antes de la herramienta. Un asistente hace
  pocas llamadas por minuto.
- **El modelo escribe horas en una zona equivocada** si no llama a
  `get_context`: las descripciones lo piden y la respuesta de cada entrada trae
  la hora de pared y el instante ISO.
- **Una pestaña abierta no ve lo que cargó el asistente** hasta navegar o
  recargar (D-MCP-7), como con otro dispositivo.
- **El merge con E2b**: dos migraciones `0017` y `writeStatus` editada en los
  dos (§1). Resuelto el 2026-10-20: la del MCP pasó a `0019_mcp`, después de
  la `0018_drop_unused_columns` de WS0 B (§1).
- **Las variables de producción**: encender sin volver a desplegar no hace
  nada (§6.3).

## 11. Decidido el 2026-10-19

Decisiones del usuario, todas cerradas:

1. **El ADR 0026, aceptado**, con Better Auth fijo en 1.7.10 (hoy `^1.7.7`) y
   dos dependencias de producción nuevas (`@better-auth/oauth-provider` y
   `@modelcontextprotocol/sdk`). La actualización de Better Auth va sola y
   primero, fuera del slice (§0).
2. **Los clientes: los de Anthropic y los de OpenAI.** claude.ai (y
   claude.com), Claude Code, ChatGPT como conector remoto, y Codex y los demás
   clientes MCP de OpenAI que autorizan con OAuth. `MCP_REDIRECT_URIS` y
   `MCP_ALLOWED_ORIGINS` traen por omisión los de los dos proveedores, a
   confirmar en V-7; loopback cubre los de línea de comandos. Otro cliente se
   suma con la variable, sin código; uno que no se registre solo, con el script
   de §4.16. Cambia la recomendación anterior de «solo Claude».
3. **La vida de los tokens**: acceso de 1 hora y refresh de 30 días con
   rotación (D-MCP-5).
4. **El asistente sigue conectado aunque se cierre la sesión web**: se
   desconecta desde `/perfil`, y la sección lo dice (D-MCP-3, D-MCP-5).
5. **Se enciende en producción después del preview**, con `MCP_ENABLED`
   apagado por omisión (D-MCP-14, §6.3).
6. **El asistente puede borrar entradas**, con `destructiveHint` (D-MCP-8).
7. **Sin vista de owner o admin sobre asistentes ajenos** ni interruptor por
   workspace: desactivar a alguien ya los corta, y el interruptor es de entorno
   (§3, §12).

## 12. Fuera de alcance

- **La actualización de Better Auth a 1.7.10**: va sola y primero (§0).
- **Más herramientas**: continuar, duplicar, descartar el timer, las masivas,
  la planilla, crear clientes, proyectos, tareas o etiquetas, el reporte y
  cualquier dato de otra persona.
- **Un alcance de solo lectura** y el consentimiento con elección (D-MCP-2).
- **`@better-auth/mcp`** (D-MCP-1).
- **`client_credentials`** y cualquier cliente que actúe sin una persona
  (D-MCP-2).
- **Un servidor MCP llamado desde una API de un proveedor con un token que pega
  un desarrollador** (por ejemplo, la herramienta MCP remota de la API de
  OpenAI): no hay persona que autorice en el navegador, y tomar un token de
  `/perfil` sería un token personal, que el usuario descartó.
- **Que owner o admin vean o revoquen autorizaciones ajenas**, y un interruptor
  por workspace (§11, decisión 7).
- **Registro por documento de metadatos del cliente** (`client_id` como URL),
  salvo que V-7 muestre que un cliente de la lista lo exige y el plugin lo
  ofrezca.
- **Notificaciones del servidor, recursos y prompts de MCP.**
- **La limpieza de clientes sin consentimiento** en el cron (§10).
- **E6 (quitar del equipo)** llama a `deleteGrantsOf` cuando llegue: lo anota
  su contrato.
