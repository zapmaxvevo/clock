import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import { seedUser, seedWorkspace } from "@/test/factories";

/**
 * `currentSession` con la sesión de Better Auth reemplazada: la foto que
 * devuelve es la que cada caso pone en `mocks.image`. El resto corre de verdad.
 */
const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  image: null as string | null | undefined,
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.user === null
          ? null
          : { user: { ...mocks.user, name: "Ana López", image: mocks.image } },
    },
  },
}));

const { currentSession } = await import("./session");

beforeEach(async () => {
  const { workspaceId } = await seedWorkspace();
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db.insert(membership).values({ workspaceId, userId: id, role: "member" });
  mocks.user = { id, email };
});

describe("la foto de la sesión (PF-09, PF-44)", () => {
  it("pasa la foto del servidor de imágenes de Google", async () => {
    mocks.image = "https://lh3.googleusercontent.com/a/foto=s96-c";
    expect((await currentSession())?.user.image).toBe(
      "https://lh3.googleusercontent.com/a/foto=s96-c",
    );
  });

  it.each([
    ["otro servidor", "https://example.com/foto.png"],
    ["un dominio que empieza igual", "https://lh3.googleusercontent.com.example.com/a"],
    ["http", "http://lh3.googleusercontent.com/a/foto"],
    ["un esquema que no es de red", "javascript:alert(1)"],
    ["una cadena vacía", ""],
    ["sin foto", null],
    ["sin el campo", undefined],
  ])("con %s da null, y quedan las iniciales", async (_label, image) => {
    mocks.image = image;
    expect((await currentSession())?.user.image).toBeNull();
  });
});
