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

Base `clock_mcp_back` en `clock-pg`, migrada con `0017_mcp`.

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
