# 0026. El servidor MCP autoriza con OAuth de Better Auth y atiende sin estado

Fecha: 2026-10-19. Estado: **Propuesto** (lo aprueba el usuario).
Origen: el contrato de [`mejoras-mcp.md`](../slices/mejoras-mcp.md), mejora 3 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md), corregido por la revisión de
`architecture-reviewer` del 2026-10-19, que bajó y leyó el plugin. Extiende el
[ADR 0024](0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md) (la
regla de ingreso vale también para autorizar y para un token) y el
[ADR 0025](0025-un-modulo-escribe-en-otro-por-su-service.md) (las tablas nuevas
del servidor de autorización son de Better Auth).

## Contexto

El usuario pidió el 2026-10-19 que un asistente —Claude u otro cliente MCP—
pueda ver, cargar y editar horas en Clock **con la cuenta de quien lo usa**, y
que funcione **desde claude.ai como conector remoto** (web, escritorio, móvil) y
**desde Claude Code**. Eso fija la autenticación: la especificación de
autorización de MCP (revisión `2025-11-25`, la última que trae el SDK oficial,
`node_modules/@modelcontextprotocol/sdk/dist/esm/types.js:2-4`) pide que el
servidor MCP sea un **servidor de recursos OAuth 2.1**: publica sus metadatos de
recurso protegido (RFC 9728), responde 401 con `WWW-Authenticate` apuntando a
ellos, y acepta tokens de acceso emitidos para él por un servidor de
autorización que publica los suyos (RFC 8414), con PKCE, indicadores de recurso
(RFC 8707) y registro de clientes. Un token personal pegado a mano no sirve:
claude.ai no lo ofrece para un conector remoto.

Lo que ya está fijado:

- **El ingreso** es Google, con la regla de `access.ts` armada por `entry.ts`
  (ADR 0024): identidad por dominio con `hd` o externa con invitación, y acceso
  por membresía activa (E2) o invitación pendiente. Cada pedido de una sesión
  vuelve a decidir la identidad (`decideSessionIdentity`) y arma el contexto con
  `ensureWorkspaceContext` (`src/server/session.ts:50-81`).
- **Desactivar** borra las sesiones de la persona en la transacción de la
  desactivación (D-E2-5), por una función de `src/server/auth-records.ts`.
- **El entorno**: Vercel Hobby, funciones sin estado en memoria, previews
  públicos con su propia base (CLAUDE.md, «Límites del entorno»).
- **Better Auth** no trae un servidor de autorización en su paquete: lo publica
  aparte, en `@better-auth/oauth-provider`, con la misma versión. La revisión lo
  bajó en 1.7.7 y 1.7.11 y confirmó registro dinámico sin autenticación, PKCE
  `S256` obligatorio para clientes públicos y con `offline_access`, indicadores
  de recurso con `enforcePerClientResources`, rotación de refresh con
  invalidación de la familia, revocación, página de consentimiento propia con la
  consulta firmada, y el armado de los metadatos
  (`oauthProviderAuthServerMetadata`). Sus tokens de acceso opacos quedan atados
  a la sesión web con que se autorizó. Existe también `@better-auth/mcp`, que
  envuelve el mismo plugin con los metadatos del recurso.
- **En 1.7.7 Claude Code no se puede registrar**: un registro sin
  `application_type` se toma como `web`, y un cliente web no acepta una
  redirección `http` de loopback. `clientRegistrationDefaultApplicationType:
"infer"` existe desde 1.7.8.
- **El SDK oficial**, `@modelcontextprotocol/sdk` 1.32.0, está en `node_modules`
  solo como dependencia de desarrollo de `shadcn`. Trae un transporte Streamable
  HTTP sobre `Request` y `Response` estándar
  (`server/webStandardStreamableHttp.d.ts`), con modo sin sesión
  (`sessionIdGenerator: undefined`) y respuestas JSON en lugar de SSE
  (`enableJsonResponse`).

Hay que decidir quién emite los tokens y con qué forma, cómo un token se vuelve
el `Actor` de siempre sin dar más que una sesión, y cómo se atiende el protocolo
en Vercel.

## Opciones

### Quién emite los tokens

1. **Better Auth como servidor de autorización**, con
   `@better-auth/oauth-provider`. Vive en el mismo dominio y la misma base, y la
   autorización arranca de la sesión de Google que ya existe: quien autoriza
   entra con el login de siempre, con sus dos cortes. Suma una dependencia, unas
   tablas que genera `npm run auth:schema` y una actualización de Better Auth.
2. **Un servidor de autorización propio** sobre la sesión de Better Auth:
   registro, `authorize`, `token` con PKCE, rotación de refresh, revocación y
   metadatos escritos a mano. Sin dependencia nueva, pero son varios cientos de
   líneas de código de seguridad que la convención («el mecanismo idiomático
   antes que una implementación propia») pide no escribir.
3. **Un proveedor externo** (Auth0, WorkOS, Stytch) federado con Google. Un
   servicio y unos secretos más, una identidad que hay que volver a mapear a
   `user.id` por correo, y la regla de ingreso de `access.ts` aplicada de nuevo
   del lado del recurso, porque el proveedor no la conoce.
4. **Google como servidor de autorización**, aceptando sus tokens. Google no
   ofrece registro dinámico ni tokens con audiencia del recurso (RFC 8707), y
   claude.ai no tendría cómo registrarse.

### `@better-auth/mcp` o `oauthProvider` configurado a mano

1. **`@better-auth/mcp`**: `mcp()` arma `oauthProvider` con `resources`, los
   metadatos del recurso y `refreshTokenReuseInterval: 30`. Menos
   configuración, otra dependencia con la misma versión, y los valores que fija
   quedan del lado del paquete.
2. **`oauthProvider` a mano**, con el plugin `jwt`: la configuración entera en
   `src/server/mcp-auth.ts`, a la vista de la revisión de seguridad. Clock
   necesita opciones que `mcp()` no fija y tendría que dejar pasar —la
   validación de redirecciones, los privilegios de clientes y recursos, el
   límite del registro, la forma del token—, y los metadatos del recurso son un
   objeto de cuatro campos.

### La forma del token de acceso

1. **Opaco, verificado por el plugin**: una fila por token. El plugin lo da por
   inactivo cuando la sesión web con que se autorizó ya no existe: pasados los
   14 días de la sesión sin abrir Clock, o después de cerrar la sesión, cada
   token nuevo nace inactivo y el asistente deja de funcionar sin motivo visible.
2. **JWT firmado con el plugin `jwt`, verificado en el proceso** con
   `verifyJwsAccessToken` de `better-auth/oauth2`, contra las claves que da
   `auth.api.getJwks()`, con emisor y audiencia. No depende de la sesión web. No
   se puede anular antes de que venza, así que la revocación necesita otro
   corte.

### Cómo se atiende el protocolo

1. **Streamable HTTP con sesión del servidor** (`Mcp-Session-Id`). El SDK guarda
   la sesión en memoria: en Vercel, el pedido siguiente cae en otra instancia y
   no la encuentra. Habría que guardarla en la base.
2. **Streamable HTTP sin sesión, con respuestas JSON**: cada `POST` arma un
   servidor y un transporte nuevos, atiende y termina. `GET` y `DELETE`
   responden 405, que la especificación admite cuando el servidor no ofrece un
   flujo propio ni sesiones. Clock no manda notificaciones del servidor.
3. **JSON-RPC escrito a mano** en el Route Handler, sin SDK. Menos dependencia,
   pero la negociación de versión, la validación de las herramientas y el
   formato de los resultados quedan a cargo propio.
4. **Un servicio aparte** (un worker fuera de Vercel). Otra base de código, otro
   despliegue y otra copia de las reglas, o una API interna para llamarlas.

## Decisión

1. **Better Auth emite los tokens, con `@better-auth/oauth-provider` configurado
   a mano y el plugin `jwt`** (opción 1 de la primera lista y opción 2 de la
   segunda).
   - **Better Auth se fija exacto en 1.7.10**, sin `^`: `better-auth`,
     `@better-auth/core`, `@better-auth/oauth-provider` y los pares exactos que
     pide esa versión (entre ellos `better-call` y `@better-auth/utils`). Es la
     versión con `clientRegistrationDefaultApplicationType: "infer"`, sin la
     cual Claude Code no se registra, publicada hace más de un día. La
     actualización va en un commit propio, antes del MCP, y se prueba sola: el
     ingreso entero.
   - **Las tablas del plugin son de Better Auth** y, por el ADR 0025, del código
     de `src/server/` que configura el ingreso: las lee y escribe
     `src/server/oauth-records.ts`, con la transacción de quien llama.
   - **Solo quedan abiertos los endpoints que el flujo usa**: autorizar, token,
     registro, consentimiento y revocación. Los de administración de clientes,
     recursos y consentimientos, los de OpenID y el `/token` del plugin `jwt` van
     a `disabledPaths`; los que llevan parámetros en el camino se cierran con los
     privilegios del plugin.
   - **Toda redirección tiene que estar en una lista**, al registrar y al
     autorizar: las de `MCP_REDIRECT_URIS` (por omisión, las de claude.ai) y
     cualquier dirección de loopback (`http://localhost`, `http://127.0.0.1`,
     RFC 8252), que es la de Claude Code. Es lo que impide que alguien registre
     un cliente con el nombre «Claude» y su propio destino, y le pase a una
     persona de Clock un enlace para autorizarlo. Clientes públicos y
     confidenciales se aceptan por igual: la amenaza es el destino, no el
     secreto.

2. **El token de acceso es un JWT, verificado en el proceso** (opción 2 de la
   tercera lista), con emisor `<BETTER_AUTH_URL>/api/auth` y audiencia, la
   dirección del recurso MCP. `sub` es la persona y `azp` el cliente. **No se
   mira `sid`**: el asistente sigue funcionando aunque la persona cierre la
   sesión web o no abra Clock en semanas.

3. **El protocolo se atiende sin estado** (opción 2 de la última lista), en un
   Route Handler de Next, `src/app/api/mcp/route.ts`, con el transporte
   `WebStandardStreamableHTTPServerTransport` y `McpServer` del SDK oficial, que
   pasa a ser una dependencia directa. Cada `POST` arma su servidor con las
   herramientas del actor del pedido y no guarda nada entre pedidos.

4. **Un token se vuelve un actor por el mismo armado que una sesión.** Cada
   pedido:
   1. verifica el JWT —firma, vencimiento, emisor y audiencia—;
   2. **confirma en la base que la autorización del par persona-cliente sigue
      vigente**: es el corte de revocación, porque el JWT no se puede anular
      antes de vencer;
   3. arma el contexto con **la misma función que la sesión**: identidad por
      pedido (`decideSessionIdentity`), `ensureWorkspaceContext` y el perfil.
      `session.ts` la exporta para los dos caminos;
   4. exige `can(actor, "mcp.connect", workspace)`, que corta a una membresía no
      activa.
      Cualquiera que falle responde 401 con `WWW-Authenticate`. Por eso un token
      nunca da más que una sesión: decide lo mismo, con los mismos hechos, en cada
      pedido, y las herramientas son un subconjunto de lo que la pantalla deja
      hacer, por el mismo `can()` y los mismos services.

5. **Autorizar exige lo mismo que el pedido.** El plugin solo pide una sesión de
   Better Auth para autorizar y consentir, y una sesión puede seguir viva para
   quien ya no tiene acceso (un externo revocado, un dominio que salió de la
   política). Un gancho `hooks.before` sobre autorizar y consentir aplica los
   pasos 3 y 4 de la decisión 4 y, si no pasan, manda a `/login` con el motivo.
   Sin eso, el asistente quedaría en un bucle de 401 y autorizaciones que nunca
   sirven.

6. **Desactivar revoca también las autorizaciones**, en la misma transacción
   que borra las sesiones (D-E2-5), con una función de `oauth-records.ts`.
   Reactivar no las devuelve: la persona vuelve a conectar su asistente.

7. **El audit log dice por qué cliente llegó un cambio.** `audit_log` suma
   `oauth_client_id`, nulo para la aplicación. El `Actor` lleva el cliente
   cuando el pedido viene por MCP, `can()` no lo mira, y cada constancia lo toma
   del actor con `auditActorOf`. El autor sigue siendo la persona.

8. **El servidor MCP se enciende con `MCP_ENABLED`, y el plugin se carga
   siempre.** Apagado, todas las rutas del plugin y las de `.well-known` que
   registre quedan en `disabledPaths`, y `/api/mcp`, los metadatos y
   `/conectar` responden 404. Cargarlo siempre hace que `npm run auth:schema`
   genere las mismas tablas con el interruptor como esté: si el plugin
   dependiera de la variable, un esquema generado con el MCP apagado sacaría sus
   tablas y la migración siguiente las borraría. Producción lo enciende después
   de probarlo en un preview.

## Consecuencias

- **Dependencias**: Better Auth pasa de `^1.7.7` a `1.7.10` exacto, con sus
  pares, en un commit propio que vuelve a probar el ingreso entero antes de que
  entre el MCP. Se suman `@better-auth/oauth-provider` 1.7.10 y
  `@modelcontextprotocol/sdk`. El SDK arrastra `express` y `hono`, que el
  servidor no importa: el Route Handler carga solo `server/mcp` y
  `server/webStandardStreamableHttp`.
- **Tablas nuevas de Better Auth** (clientes, recursos, tokens de acceso y de
  refresh, consentimientos, aserciones de cliente y las claves de `jwt`),
  generadas con `npm run auth:schema`, más una tabla propia para el límite de
  frecuencia y la columna de `audit_log`. Todo es aditivo: el código anterior no
  las ve. Los tokens apuntan a `user` sin borrado en cascada: borrar una persona
  exige borrar antes sus autorizaciones.
- **El ingreso no cambia**: autorizar un asistente pasa por `/login`, con sus dos
  cortes, y por la página de consentimiento. El plugin retoma la autorización
  después de entrar con su propio cliente (`oauthProviderClient`), sin que
  `/login` arme destinos.
- **La regla de un token es la de una sesión**, decidida en el pedido y al
  autorizar. Lo que el ADR 0024 decide para una sesión abierta —una invitación
  revocada a un externo, un dominio que sale de la política, una membresía
  inactiva— corta también un token y una autorización, sin tocar las tablas del
  plugin.
- **Una revocación es inmediata** por el paso 2 de la decisión 4, que suma una
  lectura por índice a cada pedido. Revocar un JWT de acceso por el endpoint
  RFC 7009 del plugin no tiene efecto hasta que vence; el corte es el
  consentimiento.
- **Sin estado en memoria**: el límite de frecuencia se cuenta en la base, y
  ninguna herramienta usa flujos SSE, notificaciones ni muestreo.
- **Las operaciones que comparten la pantalla y el MCP** se escriben una vez:
  la validación, el permiso y la llamada al service de cada una viven en un
  archivo del módulo que llaman la action y la herramienta.
- **Un cliente nuevo fuera de Claude** se habilita sumando su redirección a
  `MCP_REDIRECT_URIS`, sin código; sacarla corta también a los clientes ya
  registrados con ella, en la autorización siguiente.
- **Una actualización futura de Better Auth** sube los cuatro paquetes juntos y
  vuelve a probar el ingreso y el flujo OAuth.
