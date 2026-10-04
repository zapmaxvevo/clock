import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { user } from "@/server/db/schema";

/**
 * El handler real de Better Auth. La sesión de prueba se habilita antes de
 * importarlo para entrar con una cookie válida: así el 404 no puede venir de
 * que falte la sesión.
 */
const secret = "un-secreto-de-prueba-de-al-menos-32-caracteres";
const original = {
  allow: process.env.ALLOW_TEST_SESSION,
  secret: process.env.E2E_TEST_SESSION_SECRET,
};
process.env.ALLOW_TEST_SESSION = "true";
process.env.E2E_TEST_SESSION_SECRET = secret;
const { auth } = await import("./auth");

afterAll(() => {
  for (const [name, value] of [
    ["ALLOW_TEST_SESSION", original.allow],
    ["E2E_TEST_SESSION_SECRET", original.secret],
  ] as const) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

const origin = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Entra con la sesión de prueba y devuelve la cookie y el id de la persona. */
async function signIn() {
  const response = await post(
    "/test-session/sign-in",
    { email: "ana@empresa.com", name: "Ana López" },
    { "x-test-session": secret },
  );
  expect(response.status).toBe(200);
  const { userId } = (await response.json()) as { userId: string };
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  return { userId, cookie };
}

describe("la identidad no se edita por la API de Better Auth (PF-09)", () => {
  it("/update-user responde 404 a una sesión válida y no cambia el nombre ni la foto", async () => {
    const { userId, cookie } = await signIn();

    const response = await post(
      "/update-user",
      { name: "Otro nombre", image: "https://example.com/foto.png" },
      { cookie },
    );

    expect(response.status).toBe(404);
    const [row] = await db
      .select({ name: user.name, image: user.image })
      .from(user)
      .where(eq(user.id, userId));
    expect(row).toEqual({ name: "Ana López", image: null });
  });
});
