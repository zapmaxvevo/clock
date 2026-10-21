# Mejora 3, servidor MCP: implementación y revisiones (2026-10-19)

Rama `mejoras/mcp` desde `main` con Better Auth 1.7.10 (`be15763`), en el
worktree `/home/maxi/program/clock-mcp`. Contrato:
[`mejoras-mcp.md`](mejoras-mcp.md). ADR:
[0026](../adr/0026-el-servidor-mcp-autoriza-con-oauth-de-better-auth-y-atiende-sin-estado.md),
aceptado el 2026-10-19.

## Dependencias

- `@better-auth/oauth-provider` 1.7.10 exacto (publicado el 2026-10-15). Sus
  pares coinciden con lo fijado en `main`: `better-call` 1.4.2,
  `@better-auth/utils` 0.5.0, `@better-fetch/fetch` 1.3.2.
- `@modelcontextprotocol/sdk` 1.32.0 exacto, publicado el 2026-10-02 (17 días
  antes). Es la versión que ya resolvía `shadcn` y la que leyó el contrato; la
  1.32.1 (2026-10-05) queda fuera por tener justo 14 días.
- `npm run auth:schema` llamaba a un binario `better-auth` que no existe: pasa a
  `npx -y auth@1.7.10 generate …`. No hace falta forzar `MCP_ENABLED`: los
  plugins se cargan siempre (D-MCP-14). Corrido sin la variable y con
  `MCP_ENABLED=true`, `auth-schema.ts` no cambia, y `db:generate` después no da
  diff (criterio 16).

## V-8 (SDK 1.32.0), cerrada con una sonda

Un `McpServer` con una herramienta y su `outputSchema`, detrás de un
`WebStandardStreamableHTTPServerTransport` sin sesión, con `enableJsonResponse`
y `maxRequestBodySize: 65536` (`mcp.js:139-260`):

| Caso                                               | Respuesta                                                                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Argumento que no cumple el `inputSchema`           | 200, resultado `isError: true` con el texto del SDK en inglés («MCP error -32602: Input validation error: … Invalid UUID at id»), sin `structuredContent` |
| `isError: true` con `structuredContent` cualquiera | se devuelve tal cual: con `isError` el SDK no valida contra el `outputSchema` (`validateToolOutput`, `mcp.js:237`)                                        |
| Éxito con `structuredContent` fuera del esquema    | 200, `isError: true` «Output validation error»                                                                                                            |
| Herramienta desconocida                            | 200, resultado `isError: true` («Tool nope not found»), **no** un error JSON-RPC                                                                          |
| JSON inválido                                      | 400, JSON-RPC `-32700`                                                                                                                                    |
| Cuerpo de 70 KiB                                   | 413, JSON-RPC `-32000`                                                                                                                                    |
| `tools/call` sin `initialize` previo               | anda: el modo sin sesión no exige el saludo por pedido                                                                                                    |

Decisión: **se registra el esquema y el SDK valida la forma**. Un argumento
mal formado ya es un resultado `isError` que el asistente lee y corrige, como
pide D-MCP-9; la operación vuelve a parsear con el esquema del módulo, que da
los textos en español y las reglas finas. La alternativa de V-8 («`runTool`
parsea él mismo y registra el esquema solo para el descubrimiento») no hace
falta, y con `McpServer` exigiría reemplazar sus manejadores de
`tools/list` y `tools/call`. Diferencias con el contrato: el error de forma
sale en inglés y sin `{ code, message }`, y una herramienta desconocida no es
un error JSON-RPC (§4.17 dice lo contrario).

## V-7, por la documentación de cada proveedor (antes del preview)

Fuentes, bajadas el 2026-10-19 en Markdown: «Authentication for connectors»
(`claude.com/docs/connectors/building/authentication.md`), «Connect Claude Code
to tools via MCP» (`code.claude.com/docs/en/mcp.md`), «Authentication» del Apps
SDK (`developers.openai.com/apps-sdk/build/auth.md`) y «MCP» de Codex
(`developers.openai.com/codex/mcp.md`). Las citas son literales de esos
archivos.

| V-7                      | claude.ai (web, escritorio, móvil)                                                                                                         | Claude Code                                                                                                             | ChatGPT (conector)                                                                                                                                                                                        | Codex                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| (a) vuelta               | «register exactly this redirect URI: `https://claude.ai/api/mcp/auth_callback`». `claude.com` no aparece                                   | loopback de puerto efímero: «`http://localhost:3118/callback`»; declara también `http://127.0.0.1/callback`             | estable `https://chatgpt.com/connector_platform_oauth_redirect` **si** el servidor cumple RFC 9207; si no, `https://chatgpt.com/connector/oauth/{callback_id}`                                            | loopback `http://127.0.0.1:<puerto>/callback`, o con `/<callback_id>` si el servidor no anuncia RFC 9207 |
| (b) registro             | DCR si hay `registration_endpoint`; CIMD solo si los metadatos anuncian `client_id_metadata_document_supported` y `none`                   | igual que claude.ai (su CIMD es `https://claude.ai/oauth/claude-code-client-metadata`)                                  | CIMD preferido si se anuncia; si no, DCR, «once for the MCP server connection»                                                                                                                            | CIMD si se anuncia; si no, DCR                                                                           |
| (c) tipo y autenticación | «DCR and CIMD register Claude as a public client»                                                                                          | público                                                                                                                 | sin dato del cuerpo de DCR; con CIMD usa `none` o `private_key_jwt`                                                                                                                                       | sin dato                                                                                                 |
| (d) `resource` y PKCE    | PKCE `S256` siempre; `resource` igual al URL que pega la persona                                                                           | ídem                                                                                                                    | «append `resource=…` to both the authorization and token requests»; PKCE `S256`                                                                                                                           | sin dato                                                                                                 |
| (e) alcances             | los del `scope` del 401; suma `offline_access` si los metadatos lo anuncian                                                                | los del 401 o `oauth.scopes`; suma `offline_access`                                                                     | pide por defecto los OIDC que se anuncien (no anunciamos ninguno)                                                                                                                                         | prefiere los `scopes_supported` del servidor                                                             |
| (f) `Origin`             | llama desde `160.79.104.0/21`, servidor a servidor: sin dato de `Origin`                                                                   | proceso local: sin dato                                                                                                 | servidor a servidor, con mTLS de OpenAI: sin dato                                                                                                                                                         | proceso local: sin dato                                                                                  |
| (g) metadatos            | 401 con `resource_metadata`; usa solo el primer `authorization_servers`; prueba `/.well-known/oauth-protected-resource/<camino>` y la raíz | v2: rechaza un `iss` inesperado en la respuesta                                                                         | `code_challenge_methods_supported` con `S256` obligatorio; `iss` del metadato igual al de `authorization_servers`; `iss` en toda respuesta si se anuncia `authorization_response_iss_parameter_supported` | rechaza un `iss` distinto o ausente si se anuncia                                                        |
| (h) transporte           | Streamable HTTP                                                                                                                            | Streamable HTTP; en v2 negocia la revisión 2026-07-28 solo si el servidor la soporta (el SDK 1.32.0 llega a 2025-11-25) | sin dato                                                                                                                                                                                                  | sin dato                                                                                                 |
| (i) `destructiveHint`    | sin dato                                                                                                                                   | sin dato                                                                                                                | sin dato                                                                                                                                                                                                  | `default_tools_approval_mode = "writes"` pide aprobación para las herramientas sin `readOnlyHint`        |

Lo que esto cambia o confirma:

- **RFC 9207 está en el plugin**: anuncia
  `authorization_response_iss_parameter_supported: true` y pone `iss` en el
  código y en los errores que redirige (`authorize-dkOG8GqZ.mjs:713`, `:5436`,
  `:5886`). El `iss` es `ctx.context.baseURL`, `<BETTER_AUTH_URL>/api/auth`,
  igual a `mcpIssuer()`. Por eso ChatGPT y Codex usan la vuelta estable y la
  lista exacta alcanza. Lo prueba `decideConsent` en
  `mcp/service.integration.test.ts` (el callback trae `iss`).
- **`MCP_REDIRECT_URIS` por omisión queda en dos**: `claude.ai` y la estable de
  ChatGPT. `https://claude.com/api/mcp/auth_callback` sale: la documentación
  actual no la nombra y el contrato no mergea una sin confirmar. Se suma con la
  variable si el preview la muestra.
- **`MCP_ALLOWED_ORIGINS` no cambia**: ninguna fuente dice qué `Origin` mandan;
  los conectores llaman de servidor a servidor. Se confirma en el preview.
- **Loopback** cubre Claude Code (`localhost` y `127.0.0.1`) y Codex.
- **Ningún cliente necesita un cliente creado de antemano**: los cuatro
  registran por DCR cuando no se anuncia CIMD. El script de §4.16 no se escribe.
- **Abierto para el preview**: los cuerpos reales de DCR de claude.ai y de
  ChatGPT (c), el `Origin` real (f), si alguno usa `GET` o sesiones (h) y qué
  hacen con `destructiveHint` (i).

## Implementación (`backend-dev`)

- `d03965b`: dependencias, `mcp/schema.ts` (§4.10 con los esquemas de salida),
  las variables de §4.1 y las funciones puras. Aviso a `mcp-front`,
  `mcp-tests` y `mcp-e2e`.
- `839de45`: el servidor entero.
- `a467ec6`: las dos correcciones de abajo (`submitConsent` con el pedido,
  cancelar pasa la puerta), con los tests del service y de las actions.
- `481c5d2`: los tests de unidad e integración de cada función entregada.
- El registro, `CLAUDE.md` y el script `auth:schema`: el commit de este
  archivo.

### Desvíos del contrato

- **Las funciones puras viven en `src/lib/oauth.ts`** (`isAllowedRedirect`,
  `isLoopbackRedirect`, `isOAuthLoginQuery`, `oauthQueryOf`), no en
  `mcp-auth.ts`: `/login` importa `isOAuthLoginQuery`, y `mcp-auth.ts` arrastra
  `entry.ts` y la base; el test de `login/page.tsx` dejaba de cargar.
- **El gancho de `/oauth2/consent` solo corta con `accept: true`.** Con
  «Cancelar» bloqueado, la vista `forbidden` de `/conectar`, que solo ofrece
  «Cancelar», terminaba en `unexpectedConsent`. Cancelar no emite nada: devuelve
  `access_denied` a la redirección firmada. Lo cubre
  `mcp/actions.integration.test.ts`.
- **`submitConsent` pasa un `Request` y `asResponse: false` a
  `auth.api.oauth2Consent`**: el `authorize` interno que emite el código lanza
  `request not found` sin pedido (`authorize-dkOG8GqZ.mjs:5644`), y con el pedido
  la API devuelve un `Response` si no se pide el objeto. Los tests de
  `mcp-tests` no lo veían porque consienten por HTTP.
- **`decideConsent` del service** traduce `expired` a `consent_expired` (y lo
  mismo con el MCP apagado: `auth.api` no mira `disabledPaths`); la action solo
  hace sesión, Zod y `mcp.connect`.
- **`revokeGrant`**: `mcp.grant.revoke` en el service, como dice §4.14; la action
  parsea.
- **`handleMcpRequest` no pasa `authInfo` al transporte**: `AuthInfo.token` es
  obligatorio en el SDK y el contrato no copia el token; las herramientas toman
  el contexto por cierre.
- **`/admin/oauth2/resources`, exacta, va a `disabledPaths`** además de
  `resourcePrivileges: () => false`.
- **`get_context.weekStart`** es la clave del primer día de la semana en curso
  (`weekStartKey(today, …)`), no el número de `WeekStart`.
- **`SessionUser.image` es opcional** (`image?: string | null`), como el `user`
  de Better Auth.
- **Las tablas generadas** se llaman en snake_case (`oauth_consent`,
  `oauth_access_token`, …) y sus `user_id` tienen `on delete cascade`. §2 decía
  «sin cascada»; es lo que genera el plugin y no se edita a mano. Borrar una
  fila de `user` borra sus autorizaciones. La consulta de §6.5 tiene que usar
  `"oauth_consent" c` y `c.user_id`.

### Observaciones para `security-reviewer`

- Los metadatos del plugin anuncian `introspection_endpoint` y
  `revocation_endpoint`; introspect está en `disabledPaths` y responde 404.
- `verifyJwsAccessToken` no rechaza un token con `cnf` (DPoP): uno así sirve
  como portador. No baja de la seguridad de un token sin DPoP.
- Hallazgo de `mcp-tests`: el plugin trae por omisión límites por IP de 20
  pedidos cada 60 s en `/oauth2/token` y 30 en `/oauth2/authorize`
  (`authorize-dkOG8GqZ.mjs:5371-5414`), que D-MCP-13 no nombra. Con conectores
  remotos, los canjes y las renovaciones de toda la empresa llegan desde las IP
  del proveedor; el limitador es en memoria y por instancia, como el del
  registro.
- `truncateAll` vacía también `oauth_client` (`dba7e14`): un cliente registrado
  sin sesión no tiene `user_id` y sobrevivía entre tests.
- El plugin siembra la fila de `oauth_resource` de `mcpResourceUrl()` en su
  `init`, también con el MCP apagado (`seedResourcesOnce`, solo inserta). Sin
  la migración, lo registra como error y sigue; producción migra antes del
  push (§6.1). Cada preview con su `BETTER_AUTH_URL` deja su fila.
- Por la especificación de MCP, `destructiveHint` vale `true` por omisión en
  una herramienta sin `readOnlyHint`: `create_entry`, `start_timer` y
  `stop_timer` se anuncian como destructivas. Es lo que pide la tabla de
  D-MCP-8; si el preview muestra confirmaciones de más, se suma
  `destructiveHint: false` en esas tres.

## Mutaciones (en una copia, base `clock_mcp_back_mut`)

Cada una aplicada sobre una copia del árbol, corrida con los archivos que la
tienen que detectar y revertida. Las quince caen.

| Id  | Mutación                                             | Cae en                                                                                                |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| M1  | Sin el paso 4 de D-MCP-3 (`hasGrant`)                | criterio 12 (desconectar) y 13 (desactivar), y el consentimiento borrado por SQL del 11, en `handler` |
| M2  | Sin `deleteGrantsOf` en `writeStatus`                | criterio 13 en `team/service` (cuatro casos) y en `handler`                                           |
| M3  | Sin el gancho de D-MCP-4 (`denialOf` siempre `null`) | criterio 5: las tres personas al autorizar, al consentir y en la retoma (siete casos)                 |
| M4  | Mirando `sid`: el token exige una `session` viva     | criterio 10                                                                                           |
| M5  | `validateRedirectUri` sin `matched`                  | criterio 5, «una dirección de la lista que el cliente no registró»                                    |
| M5b | `validateRedirectUri` solo con `matched`             | criterio 5, «una redirección que salió de `MCP_REDIRECT_URIS`», y el esquema propio al autorizar      |
| M6  | `jwt()` sin `disableSettingJwtHeader`                | criterio 16, `get-session` encendido y apagado                                                        |
| M7  | Sin el gancho del registro                           | criterio 2 (cuatro cuerpos) y el esquema propio al registrar                                          |
| M8  | El gancho corta también «Cancelar»                   | `decideConsent` sin `mcp.connect`                                                                     |
| M9  | `oauth2Consent` sin `request`                        | `decideConsent` del service y de la action                                                            |
| M10 | `auditActorOf` sin el cliente                        | criterio 9 en `tools` y `deleteGrant` con un actor por MCP                                            |
| M11 | Límite en 121                                        | criterio 14 en `handler` y `consumeCall`                                                              |
| M12 | `truncated` con 500 justas                           | «con 500 justas, todas y sin truncated»                                                               |
| M13 | `deleteGrant` sin filtrar por la persona             | el `clientId` de otra persona, en `oauth-records` y en el service                                     |
| M14 | Sin el paso 7 de D-MCP-3 (`mcp.connect`)             | criterio 11, membresía inactiva por SQL                                                               |
| M15 | Sin exigir `resource` al autorizar                   | criterio 5, «sin resource responde 400»                                                               |

El test del esquema propio usaba primero `com.example.app:/oauth2redirect`, que
el plugin ya rechaza por su `SafeUrlSchema` (pide autoridad): con M5b y M7
seguía verde. Pasó a `cursor://anysphere.cursor-mcp/oauth/callback`, la forma
con host que el plugin sí registra, y con una aserción sobre el destino
(`/login?error=invalid_redirect`); con eso cae en las dos.

## Corridas

Base `clock_mcp_back` en `clock-pg`, migrada con `0017_mcp` (desde el
2026-10-20, `0018_mcp`: ver «Rebase sobre E2b»).

- `npm run lint`: limpio.
- `npm run typecheck`: limpio.
- `npm test`: 107 archivos, 2399 tests; `test:time-ar`, 2 archivos, 305
  tests.
- `npm run test:integration` en `clock_mcp_back`: 39 archivos, 1999 tests, con
  las suites de `mcp-tests` y las propias. Después del ajuste del test del
  esquema propio, las siete del MCP otra vez: 134 tests.
- `npm run build`: compila; `/api/mcp`, `/conectar` y los cuatro
  `.well-known`, dinámicos.
- `npm run auth:schema` sin `MCP_ENABLED` y con `MCP_ENABLED=true`: sin cambios
  en `auth-schema.ts`; `db:generate`: «No schema changes».

## Rebase sobre E2b (2026-10-20)

`mejoras/mcp` rebasada en local sobre `main` en `80e2f6c` (merge de E2b, con la
`0017_membership_account_link` aplicada en producción). El commit temporal de
V-7 se queda en la rama para el preview.

**Conflictos y cómo quedaron:**

- `e2e/database.ts`: las funciones de E2b (`ensureOwnerGoogleAccount`,
  `accountCountOf`, la vinculación) y `grantCountOf` del MCP, todas.
- `team/service.ts`: los imports de los dos; el comentario de `writeStatus`
  junta la cancelación de la vinculación (D-E2b-7) y el borrado de las
  autorizaciones (D-MCP-6), con el orden de bloqueos del MCP.
- `workspace/service.ts` y `auth-records.ts`: los imports de los dos y, en
  `auth-records`, las funciones de E2b junto a `findSessionUser`.
- `team/service.integration.test.ts`: los dos `vi.mock` y las cuatro banderas
  de fallo inyectado.
- Las constancias que E2b arma con un `Actor` (`membership.linkRequest`,
  `membership.linkCancel`, `invitation.register`, `account.link`,
  `user.releaseEmail`) pasan a `auditActorOf`, como pide D-MCP-12.
  `membership.linkUse` e `invitation.accept` se arman en el ingreso, sin actor,
  y quedan como estaban.

**La migración.** La `0017_mcp` de la rama se descartó (con su instantánea y
su entrada del diario, que quedan las de E2b) y se regeneró en el mismo commit
del servidor con `npm run db:generate -- --name mcp` sobre el esquema rebasado:
sale **`0018_mcp`**, `when` `1792501602020` (mayor que el `1792456513460` de la
`0017`). El SQL es idéntico byte a byte al de la `0017_mcp` anterior: solo las
tablas del plugin, `mcp_call_window` y `audit_log.oauth_client_id`. La
instantánea `0018` tiene `prevId` igual al `id` de la `0017` de E2b, y se
diferencia de ella solo en las tablas del MCP y en `audit_log`. Un
`db:generate` después: «No schema changes». En `clock_mcp_rb_a`, una base nueva,
`db:migrate` aplica las 19, de la `0000` a la `0018`. El mensaje del commit del
servidor (`1af26c5`) todavía dice `0017_mcp`: el rebase no lo reescribe.

**El hallazgo condicional de security de E2b** (§1, el MCP mergea segundo):
`bindGoogleAccount` llama a `deleteGrantsOf(tx, person, person.userId)` y
`releaseEmailOf` a `deleteGrantsOf(tx, actor, userId)`, las dos justo después
de `deleteSessionsOf`. La firma de `deleteGrantsOf` ya era
`(tx, actor, userId)`. Tests:

- `auth-records.integration.test.ts`: después de vincular y de liberar, la
  persona no tiene consentimientos, refresh ni tokens de acceso; los de otra
  persona con el mismo cliente quedan; hay un `mcp.revokeAll` con la cantidad
  de clientes y el autor de cada caso.
- Los dos todo o nada del criterio 22 de E2b (`auth.integration.test.ts` y
  `team/service.integration.test.ts`) suman una autorización y la encuentran
  entera después del fallo.
- **Mutante**: sin las dos llamadas, fallan los dos casos nuevos de
  `auth-records.integration.test.ts` (2 de 13); revertido sin commitear.

**Corridas** (base `clock_mcp_rb_a`):

- `npm run lint` y `npm run typecheck`: limpios.
- `npm test`: 109 archivos, 2520 tests; `test:time-ar`, 2 archivos, 305 tests.
- `npm run test:integration`: 39 archivos, 2111 tests.

## Rebase sobre WS0 y WS1 (2026-10-20)

`mejoras/mcp` rebasada en local sobre `main` en `2dc1452` (merge de WS1, con
WS0 A y B; la `0018_drop_unused_columns` de B, aplicada en producción con `when`
`1792502701085`, borra doce columnas de `workspace`, `workspace_settings` y
`membership`). El commit temporal de V-7 se queda en la rama para el preview.

**Conflictos y cómo quedaron:**

- Los únicos con marcas, en el commit del servidor: `drizzle/meta/_journal.json`
  y `drizzle/meta/0018_snapshot.json` (alta en los dos lados). Quedan los de
  WS0; ver «La migración».
- `src/server/db/schema.ts` se fusionó solo pero sin compilar: WS0 sacó
  `integer` de los imports de `drizzle-orm/pg-core` porque se fue su última
  columna, y `mcp_call_window` lo usa. Vuelve el import; sin él, `db:generate`
  corta con `ReferenceError: integer is not defined`.
- La constancia que WS1 arma con un `Actor` (`workspace.updateName`, en
  `updateWorkspaceName`) pasa a `auditActorOf`, como pide D-MCP-12. WS0 no
  suma constancias.
- El resto se fusionó solo: `e2e/database.ts` (las funciones de WS1 y
  `grantCountOf`), `workspace/service.ts` (los imports de los dos),
  `permissions/index.ts` y `schema.ts` (las columnas que borra WS0 y las tablas
  del MCP). Nada del MCP lee las columnas borradas: `typecheck` limpio.

**La migración.** La `0018_mcp` de la rama se descartó (con su instantánea y su
entrada del diario, que quedan las de WS0) y se regeneró en el mismo commit del
servidor con `npm run db:generate -- --name mcp` sobre el esquema rebasado:
sale **`0019_mcp`**, `when` `1792540623295` (mayor que el `1792502701085` de la
`0018`). El SQL es idéntico byte a byte al de la `0018_mcp` anterior: solo las
tablas del plugin, `mcp_call_window` y `audit_log.oauth_client_id`. La
instantánea `0019` tiene `prevId` igual al `id` de la `0018` de WS0 y se
diferencia de ella solo en las nueve tablas del MCP y en `audit_log`; los enums,
iguales. Un `db:generate` después: «No schema changes». En `clock_mcp_rb_b`, una
base nueva, `db:migrate` aplica las 20, de la `0000` a la `0019`. El mensaje del
commit del servidor todavía dice `0017_mcp`: el rebase no lo reescribe.

**Corridas** (bases nuevas `clock_mcp_rb_b` para la e2e y `clock_mcp_rb_b_test`
para la integración):

- `npm run lint`, `npm run typecheck` y `npx prettier --check .`: limpios.
- `npm test`: 111 archivos, 2541 tests; `test:time-ar`, 2 archivos, 303 tests
  (WS0 borra dos casos de `time.test.ts`).
- `npm run test:integration`: 41 archivos, 2153 tests.
- `npm run build`, con los valores de relleno del CI: compila; `/api/mcp`,
  `/conectar`, los cuatro `.well-known` y `/configuracion`, dinámicos.
- `npm run test:e2e` entera, con `DATABASE_URL` en `clock_mcp_rb_b` migrada:
  254 pasan, ninguna falla ni se saltea; las cinco de `mcp.spec.ts` y las de
  `workspace-settings.spec.ts` entre ellas.

## Revisiones (2026-10-21)

Seis revisiones sobre `0ac018c` (antes del rebase sobre `467e730`):
`mcp-rev-back` y `mcp-rev-front` aprobaron, `mcp-rev-sec` aprobó con un
hallazgo, y `mcp-rev-clean`, `mcp-rev-tests` y `mcp-rev-parity` pidieron
cambios. Las correcciones de backend van en `bcdd978` (`mcp-fix-back`); las de
frontend, en los commits de `mcp-fix-front`.

### Seguridad

- **S1, DPoP** (`mcp-rev-sec`). Un token con `cnf.jkt`, que el plugin emite si
  el canje trae la cabecera `DPoP`, pasaba como portador (RFC 9449 §7.2 lo
  prohíbe). **Quedó**: `claims` lleva `cnf: z.never().optional()`, así
  cualquier `cnf` da `invalid_token`. `z.undefined()`, la forma que proponía la
  revisión, en Zod 4 exige la clave y rechazaba todos los tokens; lo mostró la
  integración. Caso nuevo en `mcp-auth.integration.test.ts`: un canje con una
  prueba DPoP firmada en el test da `token_type: "DPoP"` y `/api/mcp` responde
  401 `invalid_token`.
- **S2, los límites del plugin** (`mcp-rev-sec`, sugerencia).
  `rateLimit.token` (20/60 s) y `rateLimit.authorize` (30/60 s) quedan escritos
  en `mcpAuthPlugins()`, con los mismos valores que el plugin trae por omisión,
  y nombrados en D-MCP-13 y en §4.2 del contrato.

### Backend

- **B1, el `catch {}` de `verifiedClaims`** (`mcp-rev-back`). **Quedó**: una
  cabecera que `decodeProtectedHeader` no lee, o un `JOSEError` de jose, dan
  `null`; las tres fallas de las claves que el plugin también relanza
  (`JWKSTimeout`, `JWKSInvalid`, `JWKSMultipleMatchingKeys`) y cualquier otro
  error se relanzan, y `handleMcpRequest` responde 500 `-32603` con
  `console.error`. La cabecera se decodifica antes de verificar para no tener
  que reconocer el `TypeError` que lanza jose. `jose` pasa a dependencia
  directa, fija en la 6.2.12 que ya resolvía (sin cambios en el árbol de
  `node_modules`). Tests: `mcp-context.test.ts` (un token que no verifica con
  las claves da `invalid_token`; si `getJwks` rechaza, `readMcpContext`
  rechaza con ese error) y `mcp/handler.test.ts`, nuevo (si `readMcpContext`
  rechaza, 500 `-32603` sin `id`, `no-store` y `console.error`).
- **B2, `Bearer` con mayúsculas** (`mcp-rev-back`). La regex lleva la bandera
  `i`; `mcp-context.test.ts` prueba `Bearer`, `bearer` y `BEARER`, y que otro
  esquema da `invalid_request`.

### Clean code (`mcp-rev-clean`)

- **C1.** Sin `McpGrant` ni `grant` en `ready`; `handler.ts` llama a
  `consumeCall(read.context.actor.userId)`. `claims` ya no lee `exp`, que
  verifica jose.
- **C2.** `runTool<T, Out extends Record<string, unknown>>` con
  `present: (value: T) => Out`, y cada `present` anotado con su `*ToolOutput`.
  Se borraron los cinco `*ToolInput` sin uso y `McpToolName`; `MCP_TOOL_NAMES`
  vive en `handler.integration.test.ts`, el único que la usaba.
- **C3.** `readAssistantContext(user)` en `mcp-auth.ts`, `{ kind: "ready",
context } | { kind: "denied", reason }` con `membresia_inactiva` sin
  `mcp.connect`. La usan `denialOf` y `readMcpContext`; `mcp-context.ts` ya no
  importa `can` ni `readUserContext`.
- **C4.** `stop_timer` sin id pasa a `time-entry`:
  `operations.stopRunningTimer(context, { id? })` con `stopRunningTimerInput`,
  y `service.stopTimer` recibe `{ id?: string }` y sin `id` lee el timer propio
  con `findRunning` en su transacción. Sin timer, `TimeEntryError("not_found",
timeEntryMessages.noRunningTimer)`; el texto sale de `mcpMessages`. Las
  actions de la pantalla siguen con `stopTimer` y su `id` obligatorio. Casos
  nuevos en `time-entry/service.integration.test.ts`: sin id cierra el propio y
  no el de otra persona del workspace; sin timer propio, `noRunningTimer` sin
  tocar el ajeno.
- **C5.** Los comentarios nombran `mcpAuthMiddleware` y `readAssistantContext`.
- **C6.** `readUserContext` devuelve `Exclude<SessionRead, { kind: "anonymous" }>`;
  la rama inalcanzable se fue con C3.
- **C7.** `wholeMinutes(seconds)` en `src/server/time` (trunca; un negativo da
  0), con su test, en `toolEntryOf` y en `totalMinutes`.
- **C8.** `findSessionUser` devuelve `Promise<SessionUser | undefined>`, con
  `import type`.
- **C9.** `GrantRow` sin `scopes` (la pantalla no lo usaba; su test, ajustado);
  `workspaceResource` exportada de `mcp/service.ts` y usada en `actions.ts`;
  `resourceMetadataUrl` en `mcp-auth.ts` con `originOf`.

### Tests (`mcp-rev-tests`)

- **Criterio 18, `/login` con sesión** (mayor): `mcp-fix-front`, `dd708a3`.
- **T2, criterio 16, `/conectar` apagado** (mayor). `getConsentView` devuelve
  `{ kind: "disabled" }` con el MCP apagado (`ConsentRead`, tipo nuevo), con su
  caso en `service.integration.test.ts`, y la página responde `notFound()` con
  ese resultado. La página conserva además su corte antes de `requireSession`:
  sin él, un anónimo con el MCP apagado recibiría 307 a `/login` en vez del 404
  del criterio. El test de la página es de `mcp-fix-front` (`0a88123`).
  **Desvío: dos cortes para lo mismo**, aceptado por el team-lead: el de la
  página, por `env()` antes de la sesión, para el anónimo; y el de
  `getConsentView`, por consistencia con `getGrantsView`, que la página atiende
  con un segundo `notFound()`.
- **T3, criterio 17, clientes por `auth.api`** (mayor). `clientPrivileges`
  pasa a `() => false`: el plugin solo lo consulta con sesión
  (`assertClientPrivileges`, y en el registro `if (session)`), así que el
  registro dinámico anónimo sigue creando y `adminCreateOAuthClient` y
  `adminUpdateOAuthClient` responden 401. Efecto de borde: un `/oauth2/register`
  que llegue con la cookie de una sesión también recibe 401; ningún cliente de
  V-7 registra desde el navegador. Tests nuevos: el alta por `auth.api` con la
  sesión de un member responde 401 y no suma filas a `oauth_client`; la edición
  de un cliente **propio** (sembrado con `userId`, porque el plugin rechaza a
  quien no es dueño antes de mirar los privilegios) responde 401 y deja sus
  `redirect_uris`. `CLOSED_PATHS` ya no tiene los dos casos HTTP de
  `/admin/oauth2/…`, con la nota de que son `SERVER_ONLY`; siguen en
  `ALWAYS_DISABLED_PATHS`, donde no estorban. El registro de los criterios 2 y
  3 sigue en verde.
- **T4, criterio 5** (menor). Las dos redirecciones rechazadas afirman
  `/login?error=invalid_redirect` en el origen propio y que no queda
  consentimiento.
- **T5, `e2e/profile.spec.ts`** (menor): `mcp-fix-front`, `f45b0c3`.
- **T6, criterio 8** (menor). `it.each` con `create_entry` y `start_timer` sin
  id: dos llamadas dejan dos filas y la primera queda cerrada.

### Frontend (`mcp-rev-front`)

- `/perfil/error.tsx`: `mcp-fix-front`, `b9c4b8e`. El criterio 18 y el orden
  del import de `/login`: `mcp-fix-front`. El `Dialog` de «Desconectar»: ver
  abajo.

### Paridad y contrato (`mcp-rev-parity`)

- **El contrato** (`mejoras-mcp.md`): `0019_mcp` en §1, §2 y §10; `on delete
cascade` hacia `user` en §2 y §10 (la migración lo pone desde el principio;
  borrar una persona se lleva sus autorizaciones sin constancia, por eso quien
  borre llama antes a `deleteGrantsOf`); la consulta de §6.5 sobre
  `oauth_consent c … c.user_id`; §4.17 y D-MCP-9, una herramienta desconocida
  da 200 con `isError` (V-8) y un JSON inválido, 400 `-32700`.
- **§5.3** (`mcp-rev-parity` y `mcp-rev-front`): «`Dialog`, como la de revocar
  una invitación». **Desvío**: la confirmación de Desconectar es `Dialog`, como
  las demás confirmaciones destructivas; el proyecto no tiene `AlertDialog`.
- **Lo que sigue bloqueando el merge**, sin cambios acá: V-7 abierta (criterio 20) y el commit temporal de la captura, hoy `14c78ac` (era `191cc09`), que se
  revierte después del preview.

El contrato suma, además, lo que estas correcciones cambian: D-MCP-2 y §4.2
(`clientPrivileges`), D-MCP-4 (`readAssistantContext`), D-MCP-13 (los tres
límites del plugin), §4.3 a §4.6, §4.9 a §4.12 y §4.14 (las firmas nuevas),
§5.1 (los dos cortes de `/conectar`), el criterio 17 y §9.

### Mutantes (en una copia del árbol, base `clock_mcp_fix_back_test`)

Cada una hace fallar el test nuevo; revertidas sin commitear.

| Mutante                                   | Falla                                                |
| ----------------------------------------- | ---------------------------------------------------- |
| S1: sin `cnf` en `claims`                 | el canje con `DPoP` da un token que pasa             |
| B1: el `catch` vuelve a tragarse todo     | «una falla al leer las claves se relanza»            |
| B2: sin la bandera `i`                    | `bearer` y `BEARER` (2 de 3)                         |
| T3: `clientPrivileges` deja `create`      | el alta por `auth.api`                               |
| T3: `clientPrivileges` deja `update`      | la edición del cliente propio                        |
| T2: sin el corte en `getConsentView`      | «apagado, disabled aunque la consulta firmada valga» |
| C4: sin `id` no busca el timer            | «sin id, cierra el timer propio»                     |
| C4: `findRunning` sin filtrar por persona | los dos casos sin `id` de `time-entry`               |
| T6: `start_timer` sin `id` con un id fijo | «start_timer sin id dos veces crea dos entradas»     |
| C7: `wholeMinutes` redondea               | «trunca al minuto entero»                            |

La primera versión del test de edición de T3 usaba un cliente registrado sin
sesión y pasaba con la mutante de `update`: el plugin lo rechaza por no ser
del dueño. Se reescribió con un cliente propio. T4 solo ajusta aserciones: no
lleva mutante.

### Corridas (bases nuevas `clock_mcp_fix_back` y `clock_mcp_fix_back_test`)

- `npm run lint`, `npm run typecheck` y `npx prettier --check .`: limpios.
- `npm test`: 113 archivos, 2555 tests; `test:time-ar`, 2 archivos, 305 tests.
- `npm run test:integration`: 41 archivos, 2158 tests.
- `npm run build`, con los valores de relleno del CI: compila; `/api/mcp`,
  `/conectar`, los cuatro `.well-known`, `/configuracion` y `/perfil`,
  dinámicos. El log trae el aviso del plugin de que no pudo sembrar
  `resources` sin base: sale de `resources` en la configuración, que estas
  correcciones no tocan.
- `npm audit --omit=dev --audit-level=high`: solo moderados; `jose` no suma
  avisos.
