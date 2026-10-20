import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
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
      data: { membershipId: target.id, status: "inactive", linkRequested: false },
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
      data: { membershipId: target.id, status: "active", linkRequested: false },
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
      data: { membershipId: target.id, status: "inactive", linkRequested: false },
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

/** La marca de una membresía, para afirmar que no se escribió. */
async function markOf(membershipId: string) {
  const [row] = await db
    .select({
      at: membership.accountLinkRequestedAt,
      by: membership.accountLinkRequestedById,
    })
    .from(membership)
    .where(eq(membership.id, membershipId));
  return row;
}

describe("setAccountLink y releaseEmail sin sesión (§4.10 de E2b)", () => {
  it("mandan al login sin escribir ni revalidar", async () => {
    const active = await seedTarget("member");
    const inactive = await seedTarget("member", "inactive");

    await expect(
      actions.setAccountLink({ membershipId: active.id, link: true }),
    ).rejects.toBeInstanceOf(RedirectError);
    await expect(
      actions.releaseEmail({ membershipId: inactive.id }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login", "/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await markOf(active.id)).toEqual({ at: null, by: null });
    expect(await auditFor("membership")).toEqual([]);
    expect(await auditFor("user")).toEqual([]);
  });
});

describe("setAccountLink (§4.10 de E2b, criterio 23)", () => {
  it("pedir responde linkPending y revalida el árbol; cancelar, lo contrario", async () => {
    const adminId = await signInAs("admin");
    const target = await seedTarget("member");

    const requested = await actions.setAccountLink({
      membershipId: target.id,
      link: true,
    });
    const cancelled = await actions.setAccountLink({
      membershipId: target.id,
      link: false,
    });

    expect([requested, cancelled]).toEqual([
      { ok: true, data: { membershipId: target.id, linkPending: true } },
      { ok: true, data: { membershipId: target.id, linkPending: false } },
    ]);
    expect(mocks.revalidated).toEqual([wholeTree, wholeTree]);
    expect(
      (await auditFor("membership")).map((row) => [row.action, row.actorId]),
    ).toEqual(
      expect.arrayContaining([
        ["membership.linkRequest", adminId],
        ["membership.linkCancel", adminId],
      ]),
    );
  });

  it("ya estaba así: éxito sin escribir", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");

    const result = await actions.setAccountLink({ membershipId: target.id, link: false });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, linkPending: false },
    });
    expect(await auditFor("membership")).toEqual([]);
  });

  it("un id que no es uuid responde validation con EQ-82", async () => {
    await signInAs("admin");

    const result = await actions.setAccountLink({ membershipId: "abc", link: true });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: teamMessages.notFound,
    });
  });

  it("un link que no es booleano responde validation con «Esa vinculación no está disponible.»", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");

    const result = await actions.setAccountLink({
      membershipId: target.id,
      // @ts-expect-error: un pedido armado a mano, con un texto en lugar de un booleano.
      link: "true",
    });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: teamMessages.linkUnavailable,
    });
    expect(await markOf(target.id)).toEqual({ at: null, by: null });
  });

  it("un id que no existe responde not_found con EQ-82", async () => {
    await signInAs("admin");

    const result = await actions.setAccountLink({
      membershipId: randomUUID(),
      link: true,
    });

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      message: teamMessages.notFound,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un member responde forbidden con EQ-90", async () => {
    await signInAs("member");
    const target = await seedTarget("member");

    const result = await actions.setAccountLink({ membershipId: target.id, link: true });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.forbiddenAction,
    });
    expect(await markOf(target.id)).toEqual({ at: null, by: null });
  });

  it("un admin sobre otro admin, sobre sí mismo o sobre el owner responde forbidden con EQ-117", async () => {
    const adminId = await signInAs("admin");
    const other = await seedTarget("admin");
    const own = await membershipOf(seeded.workspaceId, adminId);
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);

    for (const target of [other, own, owner]) {
      expect(
        await actions.setAccountLink({ membershipId: target.id, link: true }),
      ).toEqual({
        ok: false,
        code: "forbidden",
        message: teamMessages.linkAdminOwnerOnly,
      });
      expect(await markOf(target.id)).toEqual({ at: null, by: null });
    }
  });

  it("una inactiva responde inactive_membership con EQ-118", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");

    expect(await actions.setAccountLink({ membershipId: target.id, link: true })).toEqual(
      {
        ok: false,
        code: "inactive_membership",
        message: teamMessages.linkInactive,
      },
    );
  });

  it("una con el correo liberado responde email_released con EQ-121, también al reactivar", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");
    expect((await actions.releaseEmail({ membershipId: target.id })).ok).toBe(true);
    const failure = {
      ok: false,
      code: "email_released",
      message: teamMessages.emailReleased,
    };

    expect(await actions.setAccountLink({ membershipId: target.id, link: true })).toEqual(
      failure,
    );
    expect(
      await actions.changeStatus({ membershipId: target.id, status: "active" }),
    ).toEqual(failure);
  });

  it("un error de la base responde unexpected con su texto y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(teamRepository, "lockForChange").mockRejectedValueOnce(
      new Error("conexión cortada"),
    );

    const result = await actions.setAccountLink({ membershipId: target.id, link: true });

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: teamMessages.unexpectedLink,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });
});

describe("changeStatus sin cuenta (§4.10 de E2b, D-E2b-5)", () => {
  it("un admin reactiva a un member sin cuenta y queda la marca", async () => {
    const adminId = await signInAs("admin");
    const target = await seedTarget("member", "inactive");

    const result = await actions.changeStatus({
      membershipId: target.id,
      status: "active",
    });

    expect(result).toEqual({
      ok: true,
      data: { membershipId: target.id, status: "active", linkRequested: true },
    });
    expect((await markOf(target.id)).by).toBe(adminId);
    expect(mocks.revalidated).toEqual([wholeTree]);
  });

  it("un admin que reactiva a un admin sin cuenta responde forbidden con EQ-85", async () => {
    await signInAs("admin");
    const target = await seedTarget("admin", "inactive");

    expect(
      await actions.changeStatus({ membershipId: target.id, status: "active" }),
    ).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.adminStatusOwnerOnly,
    });
    expect(await membershipOf(seeded.workspaceId, target.userId)).toEqual(target);
  });
});

describe("releaseEmail (§4.10 de E2b, criterio 23)", () => {
  it("libera, responde el id y revalida el árbol; repetirlo es éxito sin escribir", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");
    await seedAccount(target.userId);

    const first = await actions.releaseEmail({ membershipId: target.id });
    const audits = await auditFor("user");
    const second = await actions.releaseEmail({ membershipId: target.id });

    expect([first, second]).toEqual([
      { ok: true, data: { membershipId: target.id } },
      { ok: true, data: { membershipId: target.id } },
    ]);
    expect(await auditFor("user")).toEqual(audits);
    expect(mocks.revalidated).toEqual([wholeTree, wholeTree]);
  });

  it("un id que no es uuid responde validation con EQ-82", async () => {
    await signInAs("admin");

    expect(await actions.releaseEmail({ membershipId: "abc" })).toEqual({
      ok: false,
      code: "validation",
      message: teamMessages.notFound,
    });
  });

  it("un member responde forbidden con EQ-90", async () => {
    await signInAs("member");
    const target = await seedTarget("member", "inactive");

    expect(await actions.releaseEmail({ membershipId: target.id })).toEqual({
      ok: false,
      code: "forbidden",
      message: teamMessages.forbiddenAction,
    });
  });

  it("un admin sobre otro admin, sobre sí mismo o sobre el owner responde forbidden con EQ-119", async () => {
    const adminId = await signInAs("admin");
    const other = await seedTarget("admin", "inactive");
    const own = await membershipOf(seeded.workspaceId, adminId);
    const owner = await membershipOf(seeded.workspaceId, seeded.ownerId);

    for (const target of [other, own, owner]) {
      expect(await actions.releaseEmail({ membershipId: target.id })).toEqual({
        ok: false,
        code: "forbidden",
        message: teamMessages.releaseAdminOwnerOnly,
      });
    }
    expect(await auditFor("user")).toEqual([]);
  });

  it("una activa responde active_membership con EQ-120", async () => {
    await signInAs("admin");
    const target = await seedTarget("member");

    expect(await actions.releaseEmail({ membershipId: target.id })).toEqual({
      ok: false,
      code: "active_membership",
      message: teamMessages.releaseActive,
    });
  });

  it("un id de otro workspace responde not_found con EQ-82", async () => {
    await signInAs("admin");
    const other = await seedWorkspace();
    const foreign = await seedMember(other.workspaceId, "member", "inactive");
    const target = await membershipOf(other.workspaceId, foreign);

    expect(await actions.releaseEmail({ membershipId: target.id })).toEqual({
      ok: false,
      code: "not_found",
      message: teamMessages.notFound,
    });
  });

  it("un error de la base responde unexpected con su texto y revalida", async () => {
    await signInAs("admin");
    const target = await seedTarget("member", "inactive");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(teamRepository, "lockForChange").mockRejectedValueOnce(
      new Error("conexión cortada"),
    );

    expect(await actions.releaseEmail({ membershipId: target.id })).toEqual({
      ok: false,
      code: "unexpected",
      message: teamMessages.unexpectedRelease,
    });
    expect(mocks.revalidated).toEqual([wholeTree]);
  });
});
