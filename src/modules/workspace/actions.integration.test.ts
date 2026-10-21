import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { membership, workspace, workspaceSettings } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedInvitation,
  seedMember,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";
import { auditFor, emailOf, invitationOf, invitationsOf } from "@/test/queries";

import { INVITE_LIMIT, invitationMessages, workspaceSettingsMessages } from "./schema";
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
async function signInAs(role: Role, status: MembershipStatus = "active") {
  const email = `${randomUUID()}@empresa.com`;
  const id = await seedUser(email);
  await db
    .insert(membership)
    .values({ workspaceId: seeded.workspaceId, userId: id, role, status });
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
    const inactive = await emailOf(
      await seedMember(seeded.workspaceId, "member", "inactive"),
    );

    const result = await actions.inviteMembers({
      emails: ["no-es-correo", inactive, "ana@gmail.com"],
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
          id: inactive,
          code: "inactive_member",
          message: invitationMessages.inactiveMember(inactive),
        },
      ],
    });
    expect(await invitationsOf(seeded.workspaceId)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/equipo"]);
  });

  it.each([
    ["ningún correo", [], invitationMessages.noEmails],
    ["solo blancos", [" ", "\n"], invitationMessages.noEmails],
    [
      "un texto de más de 1000 caracteres",
      ["a".repeat(1001)],
      invitationMessages.inputTooLong,
    ],
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

  it("descarta los blancos y no los devuelve como rechazo", async () => {
    await signInAs("owner");

    const result = await actions.inviteMembers({ emails: [" ", "ana@gmail.com", ""] });

    expect(result).toEqual({
      ok: true,
      data: { outcomes: [{ email: "ana@gmail.com", result: "invited", external: true }] },
    });
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

describe("updateWorkspaceName (WS1, §4.5)", () => {
  async function workspaceRow() {
    const [row] = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, seeded.workspaceId));
    return row;
  }

  async function nameAudits() {
    return auditFor("workspace", seeded.workspaceId);
  }

  it("sin sesión manda al login sin escribir", async () => {
    const before = await workspaceRow();

    await expect(
      actions.updateWorkspaceName({ name: "Estudio Norte" }),
    ).rejects.toBeInstanceOf(RedirectError);

    expect(mocks.redirects).toEqual(["/login"]);
    expect(await workspaceRow()).toEqual(before);
    expect(await nameAudits()).toEqual([]);
  });

  it("el éxito responde el recortado y revalida el árbol entero (criterio 8, WS-64)", async () => {
    const adminId = await signInAs("admin");

    const result = await actions.updateWorkspaceName({ name: "  Estudio Norte  " });

    expect(result).toEqual({ ok: true, data: { name: "Estudio Norte" } });
    expect((await workspaceRow()).name).toBe("Estudio Norte");
    expect(await nameAudits()).toEqual([
      expect.objectContaining({ action: "workspace.updateName", actorId: adminId }),
    ]);
    expect(mocks.revalidated).toEqual([{ path: "/", type: "layout" }]);
  });

  it.each([
    ["vacío", { name: "" }, workspaceSettingsMessages.nameRequired],
    ["solo espacios", { name: "   " }, workspaceSettingsMessages.nameRequired],
    ["un número", { name: 42 }, workspaceSettingsMessages.nameRequired],
    ["un objeto sin name", {}, workspaceSettingsMessages.nameRequired],
    [
      "101 caracteres después de recortar",
      { name: ` ${"a".repeat(101)} ` },
      workspaceSettingsMessages.nameTooLong,
    ],
    [
      "el carácter nulo",
      { name: "Estudio\u0000Norte" },
      workspaceSettingsMessages.nameNullCharacter,
    ],
  ])(
    "%s responde validation sin escribir (criterio 3)",
    async (_case, input, message) => {
      await signInAs("owner");
      const before = await workspaceRow();

      const result = await actions.updateWorkspaceName(input as never);

      expect(result).toEqual({ ok: false, code: "validation", message });
      expect(await workspaceRow()).toEqual(before);
      expect(await nameAudits()).toEqual([]);
    },
  );

  it("100 caracteres con espacios alrededor responden éxito (WS-71)", async () => {
    await signInAs("owner");
    const name = "a".repeat(100);

    const result = await actions.updateWorkspaceName({ name: `  ${name}  ` });

    expect(result).toEqual({ ok: true, data: { name } });
    expect((await workspaceRow()).name).toBe(name);
  });

  it.each([
    ["un member", "member", "active"],
    ["un admin inactivo", "admin", "inactive"],
  ] as const)(
    "%s responde forbidden con WS-58, sin escribir, y revalida (criterio 8)",
    async (_case, role, status) => {
      await signInAs(role, status);
      const before = await workspaceRow();

      const result = await actions.updateWorkspaceName({ name: "Estudio Norte" });

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: workspaceSettingsMessages.forbidden,
      });
      expect(await workspaceRow()).toEqual(before);
      expect(await nameAudits()).toEqual([]);
      expect(mocks.revalidated).toEqual([{ path: "/", type: "layout" }]);
    },
  );

  it("una falla inesperada responde unexpected con su texto y no escribe", async () => {
    await signInAs("owner");
    const before = await workspaceRow();
    vi.spyOn(workspaceRepository, "updateWorkspaceName").mockRejectedValueOnce(
      new Error("se cayó la base"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.updateWorkspaceName({ name: "Estudio Norte" });

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: workspaceSettingsMessages.unexpected,
    });
    expect(await workspaceRow()).toEqual(before);
    expect(await nameAudits()).toEqual([]);
  });

  it("reintentar después de una respuesta perdida, también con espacios alrededor, responde éxito sin volver a escribir (criterio 12, WS-62)", async () => {
    await signInAs("admin");

    const first = await actions.updateWorkspaceName({ name: "Estudio Norte" });
    const saved = await workspaceRow();
    const retried = await actions.updateWorkspaceName({ name: " Estudio Norte " });

    expect(first).toEqual({ ok: true, data: { name: "Estudio Norte" } });
    expect(retried).toEqual({ ok: true, data: { name: "Estudio Norte" } });
    expect(await workspaceRow()).toEqual(saved);
    expect(await nameAudits()).toEqual([
      expect.objectContaining({ action: "workspace.updateName" }),
    ]);
  });
});

describe("updateWorkspaceSetting (WS2b, §4.6)", () => {
  async function settingsRow() {
    const [row] = await db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, seeded.workspaceId));
    return row;
  }

  async function settingAudits() {
    return auditFor("workspace_settings", seeded.workspaceId);
  }

  const toFull = { key: "durationFormat", value: "full" } as const;

  it("sin sesión manda al login sin escribir", async () => {
    const before = await settingsRow();

    await expect(actions.updateWorkspaceSetting(toFull)).rejects.toBeInstanceOf(
      RedirectError,
    );

    expect(mocks.redirects).toEqual(["/login"]);
    expect(await settingsRow()).toEqual(before);
    expect(await settingAudits()).toEqual([]);
  });

  it("el éxito responde los ajustes y revalida el árbol entero (criterio 9, WS-64)", async () => {
    const adminId = await signInAs("admin");

    const result = await actions.updateWorkspaceSetting(toFull);

    expect(result).toEqual({ ok: true, data: { settings: { durationFormat: "full" } } });
    expect((await settingsRow())?.durationFormat).toBe("full");
    expect(await settingAudits()).toEqual([
      expect.objectContaining({ action: "workspace.updateSetting", actorId: adminId }),
    ]);
    expect(mocks.revalidated).toEqual([{ path: "/", type: "layout" }]);
  });

  it("el mismo formato responde éxito sin escribir (criterio 2, WS-04)", async () => {
    await signInAs("owner");
    const before = await settingsRow();

    const result = await actions.updateWorkspaceSetting({
      key: "durationFormat",
      value: "compact",
    });

    expect(result).toEqual({
      ok: true,
      data: { settings: { durationFormat: "compact" } },
    });
    expect(await settingsRow()).toEqual(before);
    expect(await settingAudits()).toEqual([]);
  });

  it.each([
    ["el decimal", { key: "durationFormat", value: "decimal" }],
    ["un valor vacío", { key: "durationFormat", value: "" }],
    ["un número", { key: "durationFormat", value: 1 }],
    ["un valor nulo", { key: "durationFormat", value: null }],
    ["sin valor", { key: "durationFormat" }],
    ["el primer día", { key: "weekStart", value: 1 }],
    ["una clave que no existe", { key: "foo", value: "full" }],
    ["sin clave", { value: "full" }],
    ["un pedido que no es un objeto", "full"],
  ])(
    "%s responde validation con WS-56 sin escribir (criterio 3)",
    async (_case, input) => {
      await signInAs("owner");
      const before = await settingsRow();

      const result = await actions.updateWorkspaceSetting(input as never);

      expect(result).toEqual({
        ok: false,
        code: "validation",
        message: workspaceSettingsMessages.formatUnavailable,
      });
      expect(await settingsRow()).toEqual(before);
      expect(await settingAudits()).toEqual([]);
    },
  );

  it.each([
    ["un project_manager", "project_manager", "active"],
    ["un member", "member", "active"],
    ["un admin inactivo", "admin", "inactive"],
  ] as const)(
    "%s responde forbidden con WS-58, sin escribir, y revalida (criterios 4 y 9)",
    async (_case, role, status) => {
      await signInAs(role, status);
      const before = await settingsRow();

      const result = await actions.updateWorkspaceSetting(toFull);

      expect(result).toEqual({
        ok: false,
        code: "forbidden",
        message: workspaceSettingsMessages.forbidden,
      });
      expect(await settingsRow()).toEqual(before);
      expect(await settingAudits()).toEqual([]);
      expect(mocks.revalidated).toEqual([{ path: "/", type: "layout" }]);
    },
  );

  it("sin la fila de ajustes responde unexpected, no la crea y revalida (criterios 8 y 9, WS-73)", async () => {
    await signInAs("owner");
    await db
      .delete(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, seeded.workspaceId));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.updateWorkspaceSetting(toFull);

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: workspaceSettingsMessages.unexpected,
    });
    expect(await settingsRow()).toBeUndefined();
    expect(await settingAudits()).toEqual([]);
    expect(mocks.revalidated).toEqual([{ path: "/", type: "layout" }]);
  });

  it("una falla inesperada responde unexpected con su texto y no escribe", async () => {
    await signInAs("owner");
    const before = await settingsRow();
    vi.spyOn(workspaceRepository, "updateWorkspaceSettings").mockRejectedValueOnce(
      new Error("se cayó la base"),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await actions.updateWorkspaceSetting(toFull);

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: workspaceSettingsMessages.unexpected,
    });
    expect(await settingsRow()).toEqual(before);
    expect(await settingAudits()).toEqual([]);
  });

  it("reintentar después de una respuesta perdida responde éxito y deja una sola constancia (WS-62)", async () => {
    await signInAs("admin");

    const first = await actions.updateWorkspaceSetting(toFull);
    const saved = await settingsRow();
    const retried = await actions.updateWorkspaceSetting(toFull);

    expect(first).toEqual({ ok: true, data: { settings: { durationFormat: "full" } } });
    expect(retried).toEqual(first);
    expect(await settingsRow()).toEqual(saved);
    expect(await settingAudits()).toEqual([
      expect.objectContaining({ action: "workspace.updateSetting" }),
    ]);
  });
});
