# Mejoras: Better Auth 1.7.10

Slice chico, pedido por el usuario el 2026-10-19: subir Better Auth de 1.7.7 a 1.7.10, solo y
antes del MCP y de E2b. Rama `mejoras/better-auth-1710` desde `main` en `2800c94`. El MCP
necesita `clientRegistrationDefaultApplicationType: "infer"`, que existe desde 1.7.8; se fija
1.7.10 y no 1.7.11, que salió el mismo día (D-MCP-1 y §1 de
`docs/slices/mejoras-mcp.md`, en la rama del MCP; ADR 0026). A diferencia de ese §1, acá **no** se instala
`@better-auth/oauth-provider` ni el SDK de MCP: los suma el slice del MCP.

**No cambia código de la aplicación, ni el esquema, ni las migraciones.**

## Qué se subió

| Paquete                                         | Antes | Después | En `package.json`               |
| ----------------------------------------------- | ----- | ------- | ------------------------------- |
| `better-auth`                                   | 1.7.7 | 1.7.10  | `1.7.10` exacto (era `^1.7.7`)  |
| `@better-auth/core`                             | 1.7.7 | 1.7.10  | `1.7.10` exacto (nueva directa) |
| `better-call`                                   | 1.4.0 | 1.4.2   | no: transitiva, la fija el lock |
| `@better-auth/utils`                            | 0.4.2 | 0.5.0   | no: transitiva, la fija el lock |
| `@better-auth/drizzle-adapter`                  | 1.7.7 | 1.7.10  | no: transitiva                  |
| los otros adaptadores, `@better-auth/telemetry` | 1.7.7 | 1.7.10  | no: transitivas                 |

**El adaptador de Drizzle** suma `customTransformInput` con `toDriverDate` y pasa
`customTransformOutput` a `fromDriverDate` (`drizzle-adapter/dist/index.mjs:552`,
`dist/relations-v2/index.mjs:536`). No nos toca: `toDriverDate` solo convierte en columnas de
texto, y `auth-schema.ts` usa `timestamp()` en modo Date; `fromDriverDate` de un `Date` da lo
mismo que el `new Date(data)` de 1.7.7, así que la comparación de `expiresAt` no cambia.
`@better-auth/telemetry` 1.7.10 sale idéntico a 1.7.7 salvo el `package.json`.

`better-call` y `@better-auth/utils` no son dependencias directas de Clock (ningún archivo las
importa), así que quedan en el lock: `better-auth@1.7.10` declara `better-call` 1.4.2 y
`@better-auth/utils` 0.5.0 exactos, y `npm ls` lo confirma sin otra copia. Todos los
`@better-auth/*` quedan en 1.7.10; la copia anidada de `@better-auth/utils` 0.5.0 que traía
`better-call` 1.4.0 desaparece.

**El lock.** `npm install` sobre el lock de 1.7.7 cortaba con `ERESOLVE`: el árbol guardado
fijaba `better-call` 1.4.0 y el par de `@better-auth/core` 1.7.10 pide 1.4.2. Se borraron del
lock solo las entradas de `better-auth`, `@better-auth/*` y `better-call` y se volvió a
correr `npm install`; el diff del lock toca solo esas entradas. `npm audit` da los mismos 15
avisos que en `main`, ninguno de Better Auth.

## El esquema de Better Auth

**Sin cambios**: `auth-schema.ts` regenerado con 1.7.10 sale idéntico, y no hace falta
migración.

`npm run auth:schema` no corre, ni en `main`: llama al binario `better-auth`, que el paquete
`better-auth` no trae (la CLI es el paquete `auth`, que no está instalado). Se corrió la misma
orden con la CLI de la misma versión, sin instalarla en el proyecto y con un entorno de
relleno:

```sh
npx -y auth@1.7.10 generate --config src/server/auth.ts --output src/server/db/auth-schema.ts -y
```

Queda para quien decida: cambiar el script por `npx auth@<versión> generate …` o sumar `auth` a
las `devDependencies`. Este slice no lo toca.

## Qué cambió entre versiones y si nos toca

Leído sobre los tarballs de 1.7.7, 1.7.8, 1.7.9 y 1.7.10 de `better-auth` y
`@better-auth/core`, más `better-call` 1.4.0 y 1.4.2 y `@better-auth/utils` 0.4.2 y 0.5.0.

### 1.7.8

| Cambio                                                                                                                                                                                                                                                                               | ¿Nos toca?                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `clockTolerance: 30` al verificar un `id_token` (`core/dist/social-providers/google.mjs:31`, `core/dist/oauth2/verify-id-token.mjs:52`)                                                                                                                                              | No. Es la verificación del `id_token` que manda el cliente, apagada por `disableIdTokenSignIn`. El callback de Google no la usa: decodifica el `id_token` del intercambio con `decodeJwt`, sin verificar, igual que antes.                                                                                                                                                                                                                                               |
| `runWithTransaction` (`core/src/context/transaction.ts`): reinicia los ganchos pendientes en cada intento, y con un adaptador sin transacción real (`transaction: false`) corre los ganchos encolados aunque el trabajo lance                                                        | No. El adaptador de Drizzle de Clock no configura `transaction`, que queda en `false` (`drizzle-adapter/dist/index.mjs:563`). Pero el único gancho `after` de Clock es `session.create.after`, y en el ingreso `createSession` corre fuera de la transacción (`link-account.mjs:322`; la transacción de `:274` solo crea el usuario y la cuenta, sin ganchos nuestros). Fuera de una transacción, `queueAfterTransactionHook` corre el gancho en el acto, como en 1.7.7. |
| `getAsyncLocalStorage` (`core/src/async_hooks/index.ts`) prueba primero `process.getBuiltinModule`                                                                                                                                                                                   | No: mismo `AsyncLocalStorage` en Node.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `encodeDeterministicId` (`core/src/db/adapter/get-id-field.ts`) para `reserveVerificationValue`                                                                                                                                                                                      | No: con el `generateId` por defecto da el mismo base64url que antes.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `internal-adapter.mjs`: con `secondaryStorage` y `storeSessionInDatabase`, `listSessions` y `findSessions` caen a la base; `findSessions` deduplica tokens y descarta solo la sesión sin usuario en vez de devolver vacío; el espejo de `createSession` se encola después del commit | No: Clock no tiene `secondaryStorage` ni usa `findSessions` (multi-sesión).                                                                                                                                                                                                                                                                                                                                                                                              |
| `update-user.mjs`: el cambio de contraseña y la revocación de sesiones en una transacción                                                                                                                                                                                            | No: sin contraseñas, y `/update-user` está en `disabledPaths`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `get-schema.mjs` y `get-migration.mjs`: las referencias entre tablas se resuelven por la clave del modelo                                                                                                                                                                            | No: el esquema generado no cambia (arriba).                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `to-zod.mjs`: tabla estática de esquemas Zod                                                                                                                                                                                                                                         | No: mismos esquemas.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `utils/redirect-uri.ts`: acepta esquemas propios con host (`cursor://…/callback`)                                                                                                                                                                                                    | Hoy no. Es del proveedor OAuth: le toca al MCP.                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Microsoft Entra ID, Atlassian, contraseñas, sign-up, email OTP, magic link, teléfono, organización, generic OAuth, custom session, open API                                                                                                                                          | No: Clock no los usa.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 1.7.9

| Cambio                                                                                                                                | ¿Nos toca?                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api/index.mjs:196-203`: el `onError` del router espera `onAPIError.onError` y registra si lanza; el `FOUND` sigue saliendo en `:196` | No. Clock usa `onAPIError.errorURL`, no `onError`. El `return` de un `APIError` `FOUND` (la redirección de `mapProfileToUser`) está igual: es lo que deja pasar el rechazo del ingreso como redirección. |

### 1.7.10

| Cambio                                                                                                                  | ¿Nos toca?                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Plugin `one-tap` y `last-login-method`                                                                                  | No: no los usamos.                                                                              |
| `core/src/oauth2/verify.ts`: la caché del JWKS une las descargas en vuelo, corta a los 5 s y espacia las de `kid` nuevo | Hoy no. Es `verifyJwsAccessToken`, que el MCP usa para leer el token (D-MCP-1, paso 2 de §4.5). |

### `better-call` 1.4.0 → 1.4.2 y `@better-auth/utils` 0.4.2 → 0.5.0

- `better-call`, `context.mjs`: toma las cabeceras de `context.headers` si no es `undefined`, si
  no las del `request`. `cookies.mjs`: reescrito; además fuerza `Secure` con
  `SameSite=None` o `Partitioned`, y reconoce `__Host-` sin importar mayúsculas. Clock usa
  `sameSite: "lax"` y `Secure` según el esquema de `BETTER_AUTH_URL`: la cookie sale igual.
  `endpoint.mjs` y `to-response.mjs`: no pisan el estado con `undefined`.
- `@better-auth/utils` 0.5.0 es una recompilación (formato, `bytes.mjs` compartido) con los
  mismos algoritmos de hash, HMAC, base64 y azar. `better-call` 1.4.0 ya usaba 0.5.0 anidada.

## Lo que usa Clock, punto por punto

| Qué                                                        | Dónde, en 1.7.10                                                                                                                                                | Resultado                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `mapProfileToUser` y su `FOUND` a `/login?error=…`         | `core/dist/social-providers/google.mjs:125` (fuera de todo `try`); `better-auth/dist/api/index.mjs:196`                                                         | Sin cambio de comportamiento; `google.mjs` solo corre una línea por el `clockTolerance`. |
| `session.create.before` y `after`, `dropSessionOfInactive` | `better-auth/dist/db/with-hooks.mjs` idéntico; `createSession` cambió solo en la rama de `secondaryStorage`                                                     | Sin cambio.                                                                              |
| `user.update.before`                                       | `with-hooks.mjs` idéntico                                                                                                                                       | Sin cambio.                                                                              |
| `accountLinking.disableImplicitLinking`                    | `better-auth/dist/oauth2/link-account.mjs` idéntico                                                                                                             | Sin cambio.                                                                              |
| `disabledPaths`                                            | `better-auth/dist/api/index.mjs`: el único cambio es el `onError` de 1.7.9                                                                                      | Sin cambio.                                                                              |
| `disableIdTokenSignIn`                                     | `core/dist/oauth2/verify-id-token.mjs:23` y `:39`                                                                                                               | Sin cambio; las dos guardas siguen.                                                      |
| `onAPIError.errorURL`                                      | `better-auth/dist/api/routes/callback.mjs:35` y `:79`, idéntico                                                                                                 | Sin cambio.                                                                              |
| El rate limit                                              | `better-auth/dist/api/rate-limiter/index.mjs` idéntico                                                                                                          | Sin cambio.                                                                              |
| La sesión de prueba (`test-session.ts`)                    | `createAuthEndpoint` de `core/dist/api` y `setSessionCookie` de `better-auth/dist/cookies/index.mjs`, idénticos; solo cambió el tipo de `domain` en el `.d.mts` | Sin cambio; `typecheck` en verde.                                                        |
| El texto `"account not linked"`                            | `better-auth/dist/oauth2/link-account.mjs:142`, idéntico                                                                                                        | Sin cambio; lo afirma `auth.integration.test.ts:261`.                                    |

## Verificaciones para E2b

Sobre el árbol instalado de 1.7.10. Todas confirmadas.

| Lo que dejó escrito el revisor                                                                 | En 1.7.10                                                                                                                                                                            | En 1.7.7        |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| `core/dist/social-providers/google.mjs`: `decodeJwt` en la 120, `mapProfileToUser` en la 125   | `:120` `const user = decodeJwt(token.idToken);` y `:125` `const userMap = await options.mapProfileToUser?.(user);`                                                                   | `:119` y `:124` |
| `better-auth/dist/db/internal-adapter.mjs`: `findAccountOwnerByKey` en la 557, lanza en la 570 | `:557` `findAccountOwnerByKey: async ({ providerId, accountId }) => {` y `:570` `if (accountsWithUsers.length > 1) throw new BetterAuthError(\`Multiple accounts match …\`)`         | `:542` y `:555` |
| `callback.mjs`, `link-account.mjs`, `account-key.mjs` y `account.mjs` idénticos a 1.7.7        | Idénticos byte a byte: `better-auth/dist/api/routes/callback.mjs`, `oauth2/link-account.mjs`, `oauth2/account-key.mjs`, `api/routes/account.mjs` y `core/dist/db/schema/account.mjs` | —               |
| `core/dist/oauth2/verify-id-token.mjs:23` y `:39`                                              | `:23` y `:39`: `if (options.disableIdTokenSignIn) return false;`, en `supportsIdTokenSignIn` y en `verifyProviderIdToken`                                                            | `:24` y `:40`   |

El corrimiento de `internal-adapter.mjs` (+15) es la rama nueva de `listSessions`; el de
`google.mjs` (+1), el `clockTolerance`; el de `verify-id-token.mjs` (−1), un comentario de
región que se fue. `internal-adapter.mjs:698` lanza el mismo error en el otro buscador de
cuentas.

## Corridas

Todas sobre `8dfd115`, sin cambiar ningún test.

| Corrida                                          | Resultado                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `npm run lint`                                   | verde                                                                                              |
| `npm run typecheck`                              | verde                                                                                              |
| `npx prettier --check .`                         | verde                                                                                              |
| `npm test`                                       | 95 archivos, 2288 tests; zona de Buenos Aires: 2 archivos, 305 tests. Todo verde                   |
| `npm run test:integration` contra `clock_ba_int` | 30 archivos, 1840 tests, verde. Del ingreso: `auth` 18, `auth-records` 5, `entry` 33, `session` 20 |
| `npm run build` con el entorno de relleno de CI  | verde                                                                                              |
| e2e completa contra `clock_ba_e2e`, puerto 3117  | 235 de 235, verde (1,4 min)                                                                        |

La e2e corrió contra `next start -p 3117` con el build de arriba, `E2E_BASE_URL`,
`E2E_DATABASE_URL` y un secreto de sesión de prueba generado para la corrida. El log del
servidor trae 13 `Error: The destination stream closed early.` de Next, sin marcos de Better
Auth; por la forma, respuestas que el navegador corta al navegar, no errores del ingreso.

`backend-reviewer` lo comparó contra `main` con la e2e completa, una corrida tras otra:
`main` (1.7.7) dio 235/235 con 18 mensajes y la rama (1.7.10), 235/235 con 16. Todos llevan
el mismo `digest` y solo marcos ignorados; ninguno nombra a Better Auth ni a `/api/auth`. Ya
estaban en `main`: no los trae la subida.

## Revisiones

`security-auditor` y `backend-reviewer` aprobaron sin bloqueantes ni mayores. Los dos menores
de documentación (la fila del adaptador de Drizzle y la cita por función en el comentario de
`auth.integration.test.ts`) están en `7b80fd0`. Las cookies de sesión y de state salen
idénticas byte a byte entre 1.7.7 y 1.7.10, con http y con https; el ingreso (redirección
`FOUND`, `disableIdTokenSignIn`, `disabledPaths`, rate limit y la sesión de prueba) responde
igual en las dos versiones.
