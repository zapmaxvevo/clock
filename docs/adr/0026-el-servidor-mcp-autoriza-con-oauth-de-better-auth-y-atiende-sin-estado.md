# 0026. El servidor MCP autoriza con OAuth de Better Auth y atiende sin estado

Fecha: 2026-10-19. Estado: **Propuesto** (lo aprueba el usuario).
Origen: el contrato de [`mejoras-mcp.md`](../slices/mejoras-mcp.md), mejora 3 de
[`mejoras-pedidas.md`](../mejoras-pedidas.md). Extiende el
[ADR 0024](0024-donde-vive-una-invitacion-y-donde-se-corta-el-ingreso.md) (la
regla de ingreso vale también para un token) y el
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
autorización que publica los suyos (RFC 8414), con PKCE y con registro de
clientes —dinámico (RFC 7591) o por documento de metadatos del cliente—. Un
token personal pegado a mano no sirve: claude.ai no lo ofrece para un conector
remoto.

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
- **Better Auth 1.7.7** no trae en su paquete un servidor de autorización: sus
  plugins (`node_modules/better-auth/dist/plugins/index.d.mts:1-69`) incluyen
  `jwt`, `bearer`, `oauth-proxy` y `device-authorization`, pero ni `mcp` ni
  `oidc-provider`. El ecosistema lo publica aparte, como
  `@better-auth/oauth-provider`, que **no está instalado**.
- **El SDK oficial**, `@modelcontextprotocol/sdk` 1.32.0, está en `node_modules`
  solo como dependencia de desarrollo de `shadcn` (`package-lock.json`). Trae un
  transporte Streamable HTTP sobre `Request` y `Response` estándar
  (`server/webStandardStreamableHttp.d.ts`), con modo sin sesión
  (`sessionIdGenerator: undefined`) y respuestas JSON en lugar de SSE
  (`enableJsonResponse`).

Hay que decidir quién emite los tokens, cómo un token se vuelve el `Actor` de
siempre sin dar más que una sesión, y cómo se atiende el protocolo en Vercel.

## Opciones

### Quién emite los tokens

1. **Better Auth como servidor de autorización**, con el plugin
   `@better-auth/oauth-provider` (y el plugin `jwt`, si lo pide). Vive en el
   mismo dominio y la misma base, y la autorización arranca de la sesión de
   Google que ya existe: quien autoriza entra con el login de siempre, con sus
   dos cortes. Suma una dependencia y unas tablas que genera
   `npm run auth:schema`.
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

1. **Better Auth emite los tokens, con `@better-auth/oauth-provider`** (opción 1
   de la primera lista), **condicionado a la verificación del §0 del contrato**:
   que el plugin exista para la versión de `better-auth` del proyecto y ofrezca
   registro dinámico, PKCE, página de consentimiento propia, refresh con
   rotación, revocación y tokens con audiencia. Si no lo cumple, el slice se
   detiene y este ADR vuelve a discutirse con la opción 2; no se implementa
   la 2 sin pasar otra vez por el usuario.
   - **Las tablas del plugin son de Better Auth** y, por el ADR 0025, del código
     de `src/server/` que configura el ingreso: las lee y escribe
     `src/server/oauth-records.ts`, con la transacción de quien llama.
   - **Solo quedan abiertos los endpoints que el flujo usa**: autorizar, token,
     registro, consentimiento, revocación y metadatos. Los de administración de
     clientes y los de OpenID que el flujo no usa van a `disabledPaths`.
   - **El registro dinámico acepta solo redirecciones de una lista**: las de
     `MCP_REDIRECT_URIS` (por omisión, las de claude.ai) y cualquier dirección
     de loopback (`http://localhost`, `http://127.0.0.1`, RFC 8252), que es la
     de Claude Code. Un cliente registrado con otro destino no se crea. Es lo
     que impide que alguien registre un cliente con el nombre «Claude» y su
     propio destino, y le pase a una persona de Clock un enlace para autorizarlo.

2. **El protocolo se atiende sin estado** (opción 2 de la segunda lista), en un
   Route Handler de Next, `src/app/api/mcp/route.ts`, con el transporte
   `WebStandardStreamableHTTPServerTransport` y `McpServer` del SDK oficial, que
   pasa a ser una dependencia directa. Cada `POST` arma su servidor con las
   herramientas del actor del pedido y no guarda nada entre pedidos.

3. **Un token se vuelve un actor por el mismo armado que una sesión.** Cada
   pedido:
   1. verifica el token —firma o fila, vencimiento y audiencia, que tiene que
      ser la dirección del recurso MCP—;
   2. **confirma en la base que la autorización del par persona-cliente sigue
      vigente**, aunque el token sea autocontenido: revocar desde Clock corta el
      pedido siguiente, no el vencimiento;
   3. arma el contexto con **la misma función que la sesión**: identidad por
      pedido (`decideSessionIdentity`), `ensureWorkspaceContext` y el perfil.
      `session.ts` la exporta para los dos caminos;
   4. exige `can(actor, "mcp.connect", workspace)`, que corta a una membresía no
      activa.
      Cualquiera que falle responde 401 con `WWW-Authenticate`. Por eso un token
      nunca da más que una sesión: decide lo mismo, con los mismos hechos, en cada
      pedido, y las herramientas son un subconjunto de lo que la pantalla deja
      hacer, por el mismo `can()` y los mismos services.

4. **Desactivar revoca también las autorizaciones**, en la misma transacción que
   borra las sesiones (D-E2-5), con una función de `oauth-records.ts`. Reactivar
   no las devuelve: la persona vuelve a conectar su asistente.

5. **El audit log dice por qué cliente llegó un cambio.** `audit_log` suma
   `oauth_client_id`, nulo para la aplicación. El `Actor` lleva el cliente
   cuando el pedido viene por MCP, `can()` no lo mira, y cada constancia lo toma
   del actor con `auditActorOf`. El autor sigue siendo la persona.

6. **El servidor MCP se enciende con `MCP_ENABLED`.** Apagado, `/api/mcp` y los
   metadatos responden 404 y los endpoints del plugin quedan en
   `disabledPaths`. Producción lo enciende después de probarlo en un preview.

## Consecuencias

- **Dos dependencias de producción nuevas**: `@better-auth/oauth-provider`, con
  la versión que corresponda a `better-auth` 1.7.7, y `@modelcontextprotocol/sdk`.
  El SDK arrastra `express` y `hono`, que el servidor no importa: el Route
  Handler carga solo `server/mcp` y `server/webStandardStreamableHttp`.
- **Tablas nuevas de Better Auth** (clientes, tokens, consentimientos y, si el
  plugin `jwt` hace falta, sus claves), generadas con `npm run auth:schema`,
  más una tabla propia para el límite de frecuencia y la columna de
  `audit_log`. Todo es aditivo: el código anterior no las ve.
- **El ingreso no cambia**: autorizar un asistente pasa por `/login`, con sus dos
  cortes, y por la página de consentimiento. `/login` aprende a seguir el pedido
  de autorización después de entrar.
- **La regla de un token es la de una sesión, decidida en el pedido.** Lo que el
  ADR 0024 decide para una sesión abierta —una invitación revocada a un externo,
  un dominio que sale de la política, una membresía inactiva— corta también un
  token, en el pedido siguiente, sin tocar las tablas del plugin.
- **Una revocación es inmediata** gracias al paso 2 de la decisión 3, que suma
  una lectura por índice a cada pedido.
- **Sin estado en memoria**: el límite de frecuencia se cuenta en la base, y
  ninguna herramienta usa flujos SSE, notificaciones ni muestreo.
- **Las operaciones que comparten la pantalla y el MCP** se escriben una vez:
  la validación, el permiso y la llamada al service de cada una viven en un
  archivo del módulo que llaman la action y la herramienta.
- **Un cliente nuevo fuera de Claude** se habilita sumando su redirección a
  `MCP_REDIRECT_URIS`, sin código.
- **Si el plugin no cumple el §0**, la alternativa es la opción 2, con un ADR
  que reemplace a este.
