import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";

/**
 * Sesión de prueba para los e2e, que no pasan por el login de Google.
 *
 * Solo existe cuando E2E_TEST_SESSION_SECRET está definido y el entorno no es
 * producción: en Vercel esa variable no se carga, así que el endpoint no se
 * registra. El secreto va en la cabecera, de modo que tenerlo habilitado por
 * error tampoco alcanza para entrar.
 */
const signInBody = z.object({
  email: z.email(),
  name: z.string().min(1).default("Persona de prueba"),
});

export function testSessionEnabled(): boolean {
  const secret = process.env.E2E_TEST_SESSION_SECRET;
  return (
    process.env.NODE_ENV !== "production" && secret !== undefined && secret.length > 0
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
