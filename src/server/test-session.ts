import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";

/**
 * Sesión de prueba para los e2e, que no pasan por el login de Google.
 *
 * El endpoint se registra solo si se cumplen dos condiciones: que
 * E2E_TEST_SESSION_SECRET esté cargada, y que el entorno de Vercel no sea
 * producción. El discriminante es VERCEL_ENV y no NODE_ENV porque todo build
 * corre con NODE_ENV en «production», incluido el del preview, donde los e2e
 * sí necesitan entrar. En producción la variable no se carga y además la
 * segunda condición lo apaga igual. El secreto viaja en la cabecera, así que
 * dejarlo habilitado por error tampoco alcanza para entrar.
 */
const signInBody = z.object({
  email: z.email(),
  name: z.string().min(1).default("Persona de prueba"),
});

export function testSessionEnabled(): boolean {
  const secret = process.env.E2E_TEST_SESSION_SECRET;
  return (
    process.env.VERCEL_ENV !== "production" && secret !== undefined && secret.length > 0
  );
}

function testSessionPlugin(): BetterAuthPlugin {
  return {
    id: "test-session",
    endpoints: {
      testSessionSignIn: createAuthEndpoint(
        "/test-session/sign-in",
        { method: "POST", body: signInBody },
        async (ctx) => {
          const expected = process.env.E2E_TEST_SESSION_SECRET;
          if (expected === undefined || ctx.headers?.get("x-test-session") !== expected) {
            throw new APIError("UNAUTHORIZED", {
              message: "Secreto de prueba inválido.",
            });
          }

          const { email, name } = ctx.body;
          const adapter = ctx.context.internalAdapter;
          const existing = await ctx.context.adapter.findOne<{ id: string }>({
            model: "user",
            where: [{ field: "email", value: email }],
          });
          const user =
            existing ??
            (await adapter.createUser(
              {
                email,
                name,
                emailVerified: true,
                createdAt: new Date(),
                updatedAt: new Date(),
              },
              { method: "test-session" },
            ));

          const session = await adapter.createSession(user.id);
          const full = await adapter.findUserById(user.id);
          if (full === null) {
            throw new APIError("INTERNAL_SERVER_ERROR", {
              message: "No se pudo crear la sesión de prueba.",
            });
          }

          await setSessionCookie(ctx, { session, user: full });
          return ctx.json({ userId: user.id });
        },
      ),
    },
  };
}

/** Lista de plugins para `betterAuth`. Vacía en producción. */
export function testSessionPlugins(): BetterAuthPlugin[] {
  return testSessionEnabled() ? [testSessionPlugin()] : [];
}
