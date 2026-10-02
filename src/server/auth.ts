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

function policy(): AccessPolicy {
  const config = env();
  return {
    domains: config.GOOGLE_WORKSPACE_DOMAINS,
    invitedEmails: config.EXTERNAL_INVITE_EMAILS,
  };
}

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
    useSecureCookies: env().NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
  },
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: env().GOOGLE_CLIENT_ID,
      clientSecret: env().GOOGLE_CLIENT_SECRET,
      // Sugerencia de interfaz para el selector de cuenta. El control real
      // está en mapProfileToUser y en el hook de sesión.
      hd: env().GOOGLE_WORKSPACE_DOMAINS[0],
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
