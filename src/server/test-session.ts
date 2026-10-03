import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import type { BetterAuthPlugin } from "better-auth/types";
import { z } from "zod";

const signInBody = z.object({
  email: z.email(),
  name: z.string().min(1).default("Persona de prueba"),
});

const SECRET_MIN_LENGTH = 32;

/**
 * Decide si el endpoint de sesión de prueba se registra. Es opt-in explícito:
 * un entorno que no se declara no lo habilita. Antes dependía de que
 * `VERCEL_ENV` dijera «production», y eso fallaba abierto en cualquier
 * despliegue donde esa variable no exista —Vercel con las variables de
 * sistema apagadas, o cualquier host que no sea Vercel—.
 */
export function testSessionEnabled(): boolean {
  if (process.env.ALLOW_TEST_SESSION !== "true") {
    return false;
  }
  if (process.env.VERCEL_ENV === "production") {
    return false;
  }
  const secret = process.env.E2E_TEST_SESSION_SECRET;
  return secret !== undefined && secret.length >= SECRET_MIN_LENGTH;
}

/**
 * Una configuración que pide la sesión de prueba en producción rompe el
 * arranque en vez de apagarse en silencio: si alguien deja la variable
 * alcanzando al entorno equivocado, tiene que enterarse en el despliegue y no
 * descubrirlo cuando ya no importa.
 */
export function assertTestSessionNotInProduction(): void {
  if (process.env.VERCEL_ENV !== "production") {
    return;
  }
  if (process.env.ALLOW_TEST_SESSION === "true") {
    throw new Error(
      "ALLOW_TEST_SESSION está en true en producción. Sacá esa variable del entorno de producción.",
    );
  }
  if (process.env.E2E_TEST_SESSION_SECRET !== undefined) {
    throw new Error(
      "E2E_TEST_SESSION_SECRET llega al entorno de producción. Dejala solo en preview y en local.",
    );
  }
}

/**
 * Sesión de prueba para los e2e, que no pasan por el login de Google.
 *
 * Se registra solo con `ALLOW_TEST_SESSION=true`, con `E2E_TEST_SESSION_SECRET`
 * de al menos 32 caracteres y con `VERCEL_ENV` distinto de producción, que
 * actúa como segundo cerrojo. El discriminante no es `NODE_ENV` porque todo
 * build corre con `NODE_ENV` en «production», incluido el del preview, donde
 * los e2e sí necesitan entrar. El secreto viaja en la cabecera, así que
 * dejarlo habilitado por error tampoco alcanza para entrar.
 *
 * El preview tiene que apuntar a su propia rama de base de datos: el endpoint
 * fabrica una sesión para cualquier email del dominio, y en Hobby los previews
 * son públicos.
 */
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
