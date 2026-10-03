import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";

import {
  accessDenialMessage,
  decideGoogleAccess,
  isAllowedEmail,
  type AccessPolicy,
} from "@/server/access";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { env } from "@/server/env";
import {
  assertTestSessionNotInProduction,
  testSessionPlugins,
} from "@/server/test-session";

function policy(): AccessPolicy {
  const config = env();
  return {
    domains: config.GOOGLE_WORKSPACE_DOMAINS,
    invitedEmails: config.EXTERNAL_INVITE_EMAILS,
  };
}

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
  plugins: testSessionPlugins(),
  socialProviders: {
    google: {
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      // Sin la opción `hd` de Better Auth a propósito. No es una sugerencia de
      // interfaz: la librería verifica ese claim contra un único dominio
      // exacto y rechaza antes de llamar a mapProfileToUser, de modo que
      // dejaría afuera a todo dominio de GOOGLE_WORKSPACE_DOMAINS que no sea
      // el primero y a todos los invitados externos, que no traen `hd`.
      // El control vive entero en decideGoogleAccess, que exige el claim para
      // la vía de dominio, y en el hook de sesión, que lo revalida en cada
      // inicio.
      mapProfileToUser: (profile) => {
        const decision = decideGoogleAccess(
          {
            email: profile.email,
            email_verified: profile.email_verified,
            hd: "hd" in profile && typeof profile.hd === "string" ? profile.hd : null,
          },
          policy(),
        );
        if (!decision.allowed) {
          throw new APIError("FORBIDDEN", {
            message: accessDenialMessage[decision.reason],
          });
        }
        return { name: profile.name, image: profile.picture };
      },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Se vuelve a comprobar en cada inicio de sesión: quitar a alguien de
        // la lista de invitados le cierra el acceso sin tocar la base.
        before: async (session) => {
          const user = await db.query.user.findFirst({
            where: (table, { eq }) => eq(table.id, session.userId),
            columns: { email: true },
          });
          if (user === undefined || !isAllowedEmail(user.email, policy())) {
            throw new APIError("FORBIDDEN", {
              message: accessDenialMessage.dominio_no_habilitado,
            });
          }
          return { data: session };
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
