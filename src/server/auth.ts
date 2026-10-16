import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  decideProfileEntry,
  decideStoredEmailEntry,
  loginErrorUrl,
  sessionEntryError,
} from "@/server/entry";
import { env } from "@/server/env";
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
  disabledPaths: ["/update-user", "/link-social", "/unlink-account"],
  // D-E1a-14: el rechazo del gancho de sesión, con su código, y los errores
  // propios del callback terminan en `/login`, que muestra solo los motivos que
  // conoce.
  onAPIError: { errorURL: new URL("/login", env().BETTER_AUTH_URL).toString() },
  plugins: testSessionPlugins(),
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
      mapProfileToUser: async (profile) => {
        const decision = await decideProfileEntry({
          email: profile.email,
          email_verified: profile.email_verified,
          hd: "hd" in profile && typeof profile.hd === "string" ? profile.hd : null,
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
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
