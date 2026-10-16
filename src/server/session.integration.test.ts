import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { workspaceRepository } from "@/modules/workspace/repository";
import { db } from "@/server/db";
import { auditLog, invitation, membership, user } from "@/server/db/schema";
import { seedInvitation, seedMember, seedUser, seedWorkspace } from "@/test/factories";
import { updateName } from "@/modules/profile/service";

/**
 * `currentSession` con la sesión de Better Auth reemplazada: el nombre es el de
 * la fila `user` de la base, como lo deja el ingreso por Google, o el de
 * `mocks.name` si un caso lo fija; la foto es la que cada caso pone en
 * `mocks.image`. El resto corre de verdad.
 */
const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; email: string },
  name: undefined as string | undefined,
  image: null as string | null | undefined,
  /** `redirect` de Next lanza; acá lanza con el destino, para afirmarlo. */
  redirect: vi.fn((url: string): never => {
    throw new Error(`redirect ${url}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: async () => {
        if (mocks.user === null) {
          return null;
        }
        const [row] = await db
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, mocks.user.id));
        return {
          user: { ...mocks.user, name: mocks.name ?? row.name, image: mocks.image },
        };
      },
    },
  },
}));

const { currentSession, requireSession } = await import("./session");

let workspaceId: string;

/** Una persona con su membresía activa en el workspace sembrado. */
async function seedPerson() {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedMember(workspaceId, "member", "active", { email });
  return { id, email };
}

beforeEach(async () => {
  ({ workspaceId } = await seedWorkspace());
  mocks.user = await seedPerson();
  mocks.name = undefined;
  mocks.image = null;
  mocks.redirect.mockClear();
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

describe("el nombre de la sesión (criterio 7: PF-08, PF-45)", () => {
  /** El nombre que muestra la sesión de esa persona. */
  async function shownNameOf(person: { id: string; email: string }) {
    mocks.user = person;
    return (await currentSession())?.user.name;
  }

  /** Lo que hace un ingreso por Google con `overrideUserInfoOnSignIn`. */
  async function signInWithGoogleName(id: string, name: string) {
    await db.update(user).set({ name }).where(eq(user.id, id));
  }

  it("da el editado si hay uno y el de la cuenta si no; un ingreso con otro nombre cambia solo el de quien no editó", async () => {
    const actorOf = (id: string) =>
      ({ userId: id, workspaceId, role: "member", status: "active" }) as const;
    const notEdited = await seedPerson();
    const edited = await seedPerson();
    const editedAsAccount = await seedPerson();
    await updateName(actorOf(edited.id), { name: "Ana Prueba" });
    // D1: escribir el nombre de la cuenta también es editarlo.
    await updateName(actorOf(editedAsAccount.id), { name: "Persona de prueba" });

    expect(await shownNameOf(notEdited)).toBe("Persona de prueba");
    expect(await shownNameOf(edited)).toBe("Ana Prueba");
    expect(await shownNameOf(editedAsAccount)).toBe("Persona de prueba");

    for (const person of [notEdited, edited, editedAsAccount]) {
      await signInWithGoogleName(person.id, "Nombre nuevo de Google");
    }

    expect(await shownNameOf(notEdited)).toBe("Nombre nuevo de Google");
    expect(await shownNameOf(edited)).toBe("Ana Prueba");
    expect(await shownNameOf(editedAsAccount)).toBe("Persona de prueba");
  });

  it("sin nombre editado, da el nombre que trae la sesión de Better Auth", async () => {
    mocks.name = "Nombre de la sesión";
    expect((await currentSession())?.user.name).toBe("Nombre de la sesión");
  });
});

describe("una sesión sin acceso (D-E1b-5, criterio 11)", () => {
  it("sin sesión: currentSession da null y requireSession manda a /login", async () => {
    mocks.user = null;

    expect(await currentSession()).toBeNull();
    await expect(requireSession()).rejects.toThrow("redirect /login");
    expect(mocks.redirect.mock.calls).toEqual([["/login"]]);
  });

  it("con sesión y sin membresía ni invitación: null, y a /login?error=sin_invitacion sin escribir", async () => {
    const email = `${randomUUID()}@empresa.com`;
    mocks.user = { id: await seedUser(email), email };

    expect(await currentSession()).toBeNull();
    await expect(requireSession()).rejects.toThrow(
      "redirect /login?error=sin_invitacion",
    );
    expect(mocks.redirect.mock.calls).toEqual([["/login?error=sin_invitacion"]]);
    expect(
      await db.select().from(membership).where(eq(membership.userId, mocks.user.id)),
    ).toEqual([]);
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("con la invitación revocada después de crear la sesión, lo mismo", async () => {
    const email = `${randomUUID()}@gmail.com`;
    await seedInvitation({ workspaceId, email, status: "revoked" });
    mocks.user = { id: await seedUser(email), email };

    expect(await currentSession()).toBeNull();
    await expect(requireSession()).rejects.toThrow(
      "redirect /login?error=sin_invitacion",
    );
    expect((await db.select().from(invitation))[0].status).toBe("revoked");
  });

  it("si la vuelven a invitar, el pedido siguiente acepta y entra", async () => {
    const email = `${randomUUID()}@gmail.com`;
    mocks.user = { id: await seedUser(email), email };
    expect(await currentSession()).toBeNull();

    await seedInvitation({ workspaceId, email });

    expect((await requireSession()).membership.role).toBe("member");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("con acceso, requireSession devuelve el contexto sin redirigir", async () => {
    expect((await requireSession()).user.id).toBe(mocks.user?.id);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

describe("un dominio sacado de la política con la sesión abierta (D-E1b-13)", () => {
  const domains = process.env.GOOGLE_WORKSPACE_DOMAINS;

  beforeEach(() => {
    process.env.GOOGLE_WORKSPACE_DOMAINS = "empresa.com, vieja.com";
  });

  afterEach(() => {
    process.env.GOOGLE_WORKSPACE_DOMAINS = domains;
    vi.restoreAllMocks();
  });

  /** Una persona de `vieja.com` con su membresía y la sesión abierta. */
  async function signedInFromOldDomain() {
    const email = `${randomUUID()}@vieja.com`;
    mocks.user = {
      id: await seedMember(workspaceId, "member", "active", { email }),
      email,
    };
    expect(await currentSession()).not.toBeNull();
    return email;
  }

  it("quien entró sin invitación queda sin acceso en el pedido siguiente", async () => {
    await signedInFromOldDomain();

    process.env.GOOGLE_WORKSPACE_DOMAINS = "empresa.com";

    expect(await currentSession()).toBeNull();
    await expect(requireSession()).rejects.toThrow(
      "redirect /login?error=sin_invitacion",
    );
    expect(await db.select().from(auditLog)).toEqual([]);
  });

  it("quien tiene una invitación aceptada sigue entrando, como externa", async () => {
    const email = await signedInFromOldDomain();
    await seedInvitation({ workspaceId, email, status: "accepted" });

    process.env.GOOGLE_WORKSPACE_DOMAINS = "empresa.com";

    expect((await requireSession()).user.email).toBe(email);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("un correo de los dominios no suma la lectura de los hechos", async () => {
    const entryFacts = vi.spyOn(workspaceRepository, "entryFacts");

    expect(await currentSession()).not.toBeNull();
    expect(entryFacts).not.toHaveBeenCalled();
  });
});
