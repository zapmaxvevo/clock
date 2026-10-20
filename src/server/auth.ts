import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  decideProfileEntry,
  decideStoredEmailEntry,
  dropSessionOfInactive,
  loginErrorUrl,
  sessionEntryError,
} from "@/server/entry";
import { env } from "@/server/env";
import { mcpAuthMiddleware, mcpAuthPlugins, mcpDisabledPaths } from "@/server/mcp-auth";
import {
  assertTestSessionNotInProduction,
  testSessionPlugins,
} from "@/server/test-session";

assertTestSessionNotInProduction();

export const auth = betterAuth({
  appName: "Clock",
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    // Por el esquema de la URL y no por NODE_ENV: todo build corre en
    // «production», incluido el que se sirve por http en local.
    useSecureCookies: env().BETTER_AUTH_URL.startsWith("https://"),
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  emailAndPassword: { enabled: false },
  account: {
    // Sin enlace implícito: una cuenta de Google que no creó la fila no entra a
    // ella aunque traiga su correo. Con una dirección reciclada, la persona nueva
    // entraría a la cuenta de la anterior, con su rol y sus horas.
    accountLinking: { disableImplicitLinking: true },
  },
  // El nombre y la foto no se editan por la API de Better Auth (PF-09): sin
  // esto, cualquier sesión los reescribe y llegan al avatar. La aplicación
  // tampoco enlaza ni desenlaza cuentas: quién entra a qué fila lo decide solo
  // el ingreso por Google, sin enlace implícito.
  //
  // D-MCP-2, D-MCP-14: del servidor de autorización de los asistentes quedan
  // abiertos `/oauth2/authorize`, `/oauth2/token`, `/oauth2/register`,
  // `/oauth2/consent`, `/oauth2/revoke` y `/jwks`, y solo con `MCP_ENABLED`.
  disabledPaths: [
    "/update-user",
    "/link-social",
    "/unlink-account",
    ...mcpDisabledPaths(),
  ],
  // D-E1a-14: el rechazo del gancho de sesión, con su código, y los errores
  // propios del callback terminan en `/login`, que muestra solo los motivos que
  // conoce.
  onAPIError: { errorURL: new URL("/login", env().BETTER_AUTH_URL).toString() },
  // D-MCP-14: `jwt` y `oauthProvider` se cargan siempre; el interruptor actúa en
  // `disabledPaths` y en las rutas propias.
  plugins: [...mcpAuthPlugins(), ...testSessionPlugins()],
  // D-MCP-2: la lista de redirecciones al registrar; D-MCP-4: autorizar y
  // consentir exigen lo mismo que un pedido.
  hooks: { before: mcpAuthMiddleware },
  socialProviders: {
    google: {
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      // Solo el ingreso por redirección: sin esto, `/sign-in/social` también
      // acepta un `id_token` que manda el cliente. Clock no lo usa, y es una
      // entrada menos que cuidar.
      disableIdTokenSignIn: true,
      // PF-45: el nombre y la foto de Google llegan en cada ingreso. El nombre que
      // la persona editó vive en `user_preference` y esto no lo toca (PF-08).
      overrideUserInfoOnSignIn: true,
      // Sin la opción `hd` de Better Auth a propósito. No es una sugerencia de
      // interfaz: la librería verifica ese claim contra un único dominio
      // exacto y rechaza antes de llamar a mapProfileToUser, de modo que
      // dejaría afuera a todo dominio de GOOGLE_WORKSPACE_DOMAINS que no sea
      // el primero y a todos los invitados externos, que no traen `hd`.
      // El control vive entero en decideProfileEntry, que exige el claim para
      // la vía de dominio, y en el hook de sesión, que lo revalida en cada
      // inicio.
      //
      // D-E1a-14: el rechazo es una redirección a `/login` con el motivo. Better
      // Auth llama a esta función fuera de todo `try` del callback: un error
      // sin cabeceras saldría como un JSON 403.
      //
      // D-E2b-3: corre antes de que Better Auth busque la cuenta por `sub`. Con
      // una vinculación vigente, la decisión escribe la cuenta de `sub` en la
      // fila antes de devolver, y Better Auth la encuentra como ya enlazada. Un
      // error de esa escritura vuelve como el código `vinculacion_fallida`.
      mapProfileToUser: async (profile) => {
        const decision = await decideProfileEntry({
          email: profile.email,
          email_verified: profile.email_verified,
          hd: "hd" in profile && typeof profile.hd === "string" ? profile.hd : null,
          sub: profile.sub,
        });
        if (!decision.allowed) {
          throw new APIError("FOUND", undefined, {
            Location: loginErrorUrl(decision.reason),
          });
        }
        return { name: profile.name, image: profile.picture };
      },
    },
  },
  databaseHooks: {
    user: {
      update: {
        // PF-06: el correo es la identidad y no cambia. Sin esto, cada ingreso lo
        // reescribe con el de Google (`overrideUserInfoOnSignIn`), y uno que ya es
        // el de otra fila hace lanzar el update y deja el ingreso en un 500.
        before: async (data) => {
          if (data.email === undefined) {
            return;
          }
          return { data: { email: undefined } };
        },
      },
    },
    session: {
      create: {
        // Se vuelve a comprobar en cada inicio de sesión: revocar la invitación
        // de alguien antes de su primer ingreso le cierra la entrada.
        before: async (session) => {
          const user = await db.query.user.findFirst({
            where: (table, { eq }) => eq(table.id, session.userId),
            columns: { email: true },
          });
          if (user === undefined) {
            throw sessionEntryError("dominio_no_habilitado");
          }
          const decision = await decideStoredEmailEntry(user.email);
          if (!decision.allowed) {
            throw sessionEntryError(decision.reason);
          }
          return { data: session };
        },
        // D-E2-2: el `before` lee lo confirmado, así que una desactivación en
        // curso no lo frena y la sesión se inserta igual. Esto relee la membresía
        // `for share`, que espera a esa desactivación, y borra la sesión si quedó
        // inactiva. No lanza: la fila ya está confirmada y un error no la
        // deshace; solo saldría de `createSession` en todo camino que crea
        // sesiones. La cookie de una sesión borrada no sirve en el pedido
        // siguiente, que va a `/login`.
        after: async (session) => {
          await dropSessionOfInactive(session);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
