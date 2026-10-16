import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership } from "@/server/db/schema";
import type { Role } from "@/server/permissions";
import {
  seedInvitation,
  seedMember,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor, invitationOf, invitationsOf } from "@/test/queries";

import { INVITE_LIMIT, invitationMessages } from "./schema";
import { workspaceRepository } from "./repository";

/**
 * La capa de actions con sus tres puertas de Next y de Better Auth
 * reemplazadas, como en `profile` y `project`: el resto corre de verdad
 * (`requireSession`, `ensureWorkspaceContext`, Zod, `can()`, el service y la
 * base). Se verifica la traducción a `ActionResult` y que `/equipo` se revalide
 * también en el camino de error (§4.7, §9.2).
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

let seeded: SeededWorkspace;

/**
 * Una sesión en el único workspace sembrado, con la membresía ya creada con el
 * rol del caso: `ensureWorkspaceContext` la encuentra y no crea otra.
 */
async function signInAs(role: Role) {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role });
  mocks.sessionUser = { id, email };
  return id;
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

describe("inviteMembers", () => {
  it("sin sesión manda al login sin escribir ni revalidar", async () => {
    await expect(
      actions.inviteMembers({ emails: ["ana@gmail.com"] }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await invitationsOf(seeded.workspaceId)).toEqual([]);
  });

  it("el éxito responde los resultados y revalida /equipo", async () => {
    await signInAs("admin");

    const result = await actions.inviteMembers({ emails: ["Ana@Gmail.com"] });

    expect(result).toEqual({
      ok: true,
      data: { outcomes: [{ email: "ana@gmail.com", result: "invited", external: true }] },
    });
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it("un rechazo responde rejected con la lista y revalida (ADR 0011)", async () => {
    await signInAs("owner");
    const inactive = await seedMember(seeded.workspaceId, "member", "inactive");

    const result = await actions.inviteMembers({
      emails: ["no-es-correo", `${inactive}@empresa.com`, "ana@gmail.com"],
    });

    expect(result).toEqual({
      ok: false,
      code: "rejected",
      message: invitationMessages.rejected,
      rejections: [
        {
          id: "no-es-correo",
          code: "invalid_email",
          message: invitationMessages.invalidEmail("no-es-correo"),
        },
        {
          id: `${inactive}@empresa.com`,
          code: "inactive_member",
          message: invitationMessages.inactiveMember(`${inactive}@empresa.com`),
        },
      ],
    });
    expect(await invitationsOf(seeded.workspaceId)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it.each([
    ["ningún correo", [], invitationMessages.noEmails],
    [
      `${INVITE_LIMIT + 1} correos`,
      Array.from({ length: INVITE_LIMIT + 1 }, (_, index) => `p${index}@gmail.com`),
      invitationMessages.tooMany,
    ],
  ])("%s responde validation sin lista (criterio 7)", async (_case, emails, message) => {
    await signInAs("owner");

    const result = await actions.inviteMembers({ emails });

    expect(result).toEqual({ ok: false, code: "validation", message });
    expect(await invitationsOf(seeded.workspaceId)).toEqual([]);
  });

  it("una entrada armada a mano responde validation", async () => {
    await signInAs("owner");

    const result = await actions.inviteMembers({ emails: "ana@gmail.com" } as never);

    expect(result).toMatchObject({ ok: false, code: "validation" });
  });

  it("un member responde forbidden con EQ-90 y revalida (criterio 13)", async () => {
    await signInAs("member");

    const result = await actions.inviteMembers({ emails: ["ana@gmail.com"] });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: invitationMessages.forbidden,
    });
    expect(await invitationsOf(seeded.workspaceId)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it("una falla inesperada responde unexpected con su texto y revalida", async () => {
    await signInAs("owner");
    vi.spyOn(workspaceRepository, "insertInvitations").mockRejectedValueOnce(
      new Error("se cayó la base"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.inviteMembers({ emails: ["ana@gmail.com"] });

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: invitationMessages.unexpectedInvite,
    });
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });
});

describe("revokeInvitation", () => {
  it("el éxito responde el id, revoca y revalida /equipo", async () => {
    await signInAs("admin");
    const row = await seedInvitation({
      workspaceId: seeded.workspaceId,
      email: "ana@gmail.com",
    });

    const result = await actions.revokeInvitation({ invitationId: row.id });

    expect(result).toEqual({ ok: true, data: { invitationId: row.id } });
    expect((await invitationOf(seeded.workspaceId, "ana@gmail.com"))?.status).toBe(
      "revoked",
    );
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it("una aceptada responde not_pending y revalida", async () => {
    await signInAs("owner");
    const row = await seedInvitation({
      workspaceId: seeded.workspaceId,
      email: "ana@gmail.com",
      status: "accepted",
    });

    const result = await actions.revokeInvitation({ invitationId: row.id });

    expect(result).toEqual({
      ok: false,
      code: "not_pending",
      message: invitationMessages.notPending,
    });
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it("un id que no está responde not_found con el texto de EQ-81", async () => {
    await signInAs("owner");

    const result = await actions.revokeInvitation({ invitationId: randomUUID() });

    expect(result).toEqual({
      ok: false,
      code: "not_found",
      message: invitationMessages.notPending,
    });
  });

  it("un id que no es un uuid responde validation con el texto de EQ-81", async () => {
    await signInAs("owner");

    const result = await actions.revokeInvitation({ invitationId: "no-es-un-id" });

    expect(result).toEqual({
      ok: false,
      code: "validation",
      message: invitationMessages.notPending,
    });
  });

  it("un member responde forbidden sin escribir", async () => {
    await signInAs("member");
    const row = await seedInvitation({
      workspaceId: seeded.workspaceId,
      email: "ana@gmail.com",
    });

    const result = await actions.revokeInvitation({ invitationId: row.id });

    expect(result).toEqual({
      ok: false,
      code: "forbidden",
      message: invitationMessages.forbidden,
    });
    expect(await auditFor("invitation")).toEqual([]);
  });

  it("una falla inesperada responde unexpected con su texto", async () => {
    await signInAs("owner");
    const row = await seedInvitation({
      workspaceId: seeded.workspaceId,
      email: "ana@gmail.com",
    });
    vi.spyOn(workspaceRepository, "revoke").mockRejectedValueOnce(new Error("se cayó"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.revokeInvitation({ invitationId: row.id });

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: invitationMessages.unexpectedRevoke,
    });
    expect((await invitationOf(seeded.workspaceId, "ana@gmail.com"))?.status).toBe(
      "pending",
    );
  });
});
