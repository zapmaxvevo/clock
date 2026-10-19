import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedAccount,
  seedMember,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor, membershipOf } from "@/test/queries";

import { teamRepository } from "./repository";
import { teamMessages } from "./schema";

/**
 * La capa de actions con sus tres puertas de Next y de Better Auth
 * reemplazadas, como en `profile` y `project`: el resto corre de verdad
 * (`requireSession`, `ensureWorkspaceContext`, Zod, `can()`, el service y la
 * base). Se verifica la traducción a `ActionResult` y que el árbol entero se
 * revalide también en el camino de error (D-R8-8).
 */
const mocks = vi.hoisted(() => ({
  sessionUser: null as null | { id: string; email: string },
  revalidated: [] as (string | { path: string; type: string })[],
  redirects: [] as string[],
}));

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect ${to}`);
  }
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string, type?: string) => {
    mocks.revalidated.push(type === undefined ? path : { path, type });
  },
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mocks.redirects.push(path);
    throw new RedirectError(path);
  },
}));

vi.mock("@/server/auth", () => ({
  auth: {
    api: {
      getSession: async () =>
        mocks.sessionUser === null
          ? null
          : {
              user: {
                id: mocks.sessionUser.id,
                email: mocks.sessionUser.email,
                name: "Persona de prueba",
                image: null,
              },
            },
    },
  },
}));

const actions = await import("./actions");

const wholeTree = { path: "/", type: "layout" };

let seeded: SeededWorkspace;

/**
 * Una sesión en el único workspace sembrado, con la membresía ya creada con el
 * rol y el estado del caso: `ensureWorkspaceContext` la encuentra y no crea
 * otra.
 */
async function signInAs(role: Role, status: MembershipStatus = "active") {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role, status });
  mocks.sessionUser = { id, email };
  return id;
}

async function seedTarget(role: Role, status: MembershipStatus = "active") {
  return membershipOf(
    seeded.workspaceId,
    await seedMember(seeded.workspaceId, role, status),
  );
}

beforeEach(async () => {
  mocks.sessionUser = null;
  mocks.revalidated.length = 0;
  mocks.redirects.length = 0;
  seeded = await seedWorkspace();
});

afterEach(() => {
  mocks.sessionUser = null;
  vi.restoreAllMocks();
});

describe("changeRole sin sesión (criterio 15)", () => {
  it("manda al login sin cambiar nada ni revalidar", async () => {
    const target = await seedTarget("member");

    await expect(
      actions.changeRole({ membershipId: target.id, role: "admin" }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(await auditFor("membership")).toEqual([]);
  });
});

describe("changeRole (criterio 15)", () => {
  it("el éxito responde el rol que quedó y revalida el árbol", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");

    const result = await actions.changeRole({ membershipId: target.id, role: "admin" });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, role: "admin" },
    });
    expect((await membershipOf(seeded.workspaceId, target.userId)).role).toBe("admin");
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un member responde forbidden con su texto y revalida", async () => {
    await signInAs("member");
    const target = await seedTarget("member");

    const result = await actions.changeRole({ membershipId: target.id, role: "admin" });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.forbidden,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un admin que pide member para otro admin responde forbidden con adminOwnerOnly y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("admin");

    const result = await actions.changeRole({ membershipId: target.id, role: "member" });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.adminOwnerOnly,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(await auditFor("membership")).toEqual([]);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un id que no existe responde not_found y revalida", async () => {
    await signInAs("admin");

    const result = await actions.changeRole({
      membershipId: randomUUID(),
      role: "admin",
    });

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      message: teamMessages.notFound,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("una project_manager responde role_locked y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("project_manager");

    const result = await actions.changeRole({ membershipId: target.id, role: "admin" });

    expect(result).toEqual({
      ok: false,
      code: "role_locked",
      message: teamMessages.roleLocked,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("el owner sobre la suya responde role_locked con el texto del propietario", async () => {
    mocks.sessionUser = { id: seeded.ownerId, email: `${seeded.ownerId}@empresa.com` };
    const own = await membershipOf(seeded.workspaceId, seeded.ownerId);

    const result = await actions.changeRole({ membershipId: own.id, role: "member" });

    expect(result).toEqual({
      ok: false,
      code: "role_locked",
      message: teamMessages.ownerLocked,
    });
    expect(await membershipOf(seeded.workspaceId, seeded.ownerId)).toEqual(own);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("una membresía inactive responde inactive_membership y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");

    const result = await actions.changeRole({ membershipId: target.id, role: "admin" });

    expect(result).toEqual({
      ok: false,
      code: "inactive_membership",
      message: teamMessages.inactive,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it.each(["owner", "project_manager", "Admin"])(
    "el rol %s responde validation con «Ese rol no está disponible.» y no cambia nada",
    async (role) => {
      await signInAs("admin");
      const target = await seedTarget("member");

      const result = await actions.changeRole({
        membershipId: target.id,
        // @ts-expect-error: un pedido armado a mano, con un rol fuera de member y admin.
        role,
      });

      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: teamMessages.roleUnavailable,
      });
      expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
      expect(await auditFor("membership")).toEqual([]);
      expect(mocks.revalidated).toEqual([wholeTree]);
    },
  );

  it("un id que no es uuid responde validation con «Esa persona ya no está en el equipo.»", async () => {
    await signInAs("admin");

    const result = await actions.changeRole({ membershipId: "42", role: "admin" });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: teamMessages.notFound,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });
});

describe("changeStatus sin sesión (§4.10)", () => {
  it("manda al login sin cambiar nada ni revalidar", async () => {
    const target = await seedTarget("member");

    await expect(
      actions.changeStatus({ membershipId: target.id, status: "inactive" }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(await auditFor("membership")).toEqual([]);
  });
});

describe("changeStatus (§4.10, criterio 23)", () => {
  it("desactivar responde el estado que quedó y revalida el árbol", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, status: "inactive" },
    });
    expect((await membershipOf(seeded.workspaceId, target.userId)).status).toBe(
      "inactive",
    );
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("reactivar con cuenta responde el estado que quedó y revalida el árbol", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");
    await seedAccount(target.userId);

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "active",
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, status: "active" },
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("el estado que ya tenía responde éxito sin escribir", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, status: "inactive" },
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(await auditFor("membership")).toEqual([]);
  });

  it.each([
    ["un id que no existe", async () => randomUUID()],
    ["una membresía invited", async () => (await seedTarget("member", "invited")).id],
  ])("%s responde not_found con EQ-82 y revalida", async (_label, idOf) => {
    await signInAs("admin");

    const result = await actions.changeStatus({
      membershipId: await idOf(),
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      message: teamMessages.notFound,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un id que no es uuid responde validation con EQ-82", async () => {
    await signInAs("admin");

    const result = await actions.changeStatus({ membershipId: "42", status: "inactive" });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: teamMessages.notFound,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it.each(["invited", "Inactive", "deleted"])(
    "el estado %s responde validation con «Ese estado no está disponible.» sin escribir",
    async (status) => {
      await signInAs("admin");
      const target = await seedTarget("member");

      const result = await actions.changeStatus({
        membershipId: target.id,
        // @ts-expect-error: un pedido armado a mano, con un estado fuera de active e inactive.
        status,
      });

      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: teamMessages.statusUnavailable,
      });
      expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
      expect(mocks.revalidated).toEqual([wholeTree]);
    },
  );

  it("un member responde forbidden con EQ-90 sin escribir", async () => {
    await signInAs("member");
    const target = await seedTarget("member");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.forbiddenAction,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un admin sobre otro admin responde forbidden con EQ-85", async () => {
    await signInAs("admin");
    const target = await seedTarget("admin");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.adminStatusOwnerOnly,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
  });

  it("la propia responde status_locked con EQ-84", async () => {
    const id = await signInAs("admin");
    const own = await membershipOf(seeded.workspaceId, id);

    const result = await actions.changeStatus({
      membershipId: own.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "status_locked",
      message: teamMessages.selfStatusLocked,
    });
  });

  it("la del owner, pedida por un admin, responde status_locked con EQ-83", async () => {
    await signInAs("admin");
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);

    const result = await actions.changeStatus({
      membershipId: owner.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "status_locked",
      message: teamMessages.ownerStatusLocked,
    });
    expect(await membershipOf(seeded.workspaceId, seeded.ownerId)).toEqual(owner);
  });

  it("reactivar sin account responde no_account con EQ-114 sin escribir", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "active",
    });

    expect(result).toEqual({
      ok: false,
      code: "no_account",
      message: teamMessages.noAccount,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un error de la base responde unexpected con su texto y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(teamRepository, "lockForChange").mockRejectedValueOnce(
      new Error("conexión cortada"),
    );

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "inactive",
    });

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: teamMessages.unexpectedStatus,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });
});
