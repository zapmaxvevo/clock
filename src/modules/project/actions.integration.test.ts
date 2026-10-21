import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import { client, membership, project, projectMember, tag } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedClient,
  seedProject,
  seedTag,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";

import { auditFor } from "@/test/queries";

import { projectRepository } from "./repository";
import { projectMessages } from "./schema";

/** D-P1-5: el alta y la edición de un proyecto revalidan el árbol entero. */
const tree = { path: "/", type: "layout" } as const;

/**
 * La capa de actions con sus tres puertas de Next y de Better Auth
 * reemplazadas, como en `time-entry`: el resto corre de verdad
 * (`requireSession`, `ensureWorkspaceContext`, Zod, `can()`, el service y la
 * base). Se verifica la traducción a `ActionResult`, el desenlace de cada
 * permiso y que `/proyectos` se revalide también en el camino de error.
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
 * Una sesión en el workspace sembrado, con la membresía ya creada con el rol
 * y el estado del caso: `ensureWorkspaceContext` la encuentra y no crea otra.
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
});

describe("sin sesión", () => {
  it("manda al login sin ejecutar ni revalidar", async () => {
    await expect(
      actions.createClient({ id: randomUUID(), name: "Acme" }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await db.select().from(client)).toEqual([]);
  });
});

describe("createClient", () => {
  it("crea el cliente en el workspace de la sesión y revalida /proyectos", async () => {
    const userId = await signInAs("member");
    const id = randomUUID();

    const result = await actions.createClient({ id, name: " Acme " });

    expect(result).toEqual({ ok: true, data: { client: { id, name: "Acme" } } });
    const [row] = await db.select().from(client);
    expect(row).toMatchObject({ workspaceId: seeded.workspaceId, createdBy: userId });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("traduce el ZodError con su mensaje y revalida", async () => {
    await signInAs("member");
    expect(await actions.createClient({ id: randomUUID(), name: "   " })).toEqual({
      ok: false,
      code: "validation",
      message: projectMessages.nameRequired,
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("conserva el código y el mensaje del nombre repetido", async () => {
    await signInAs("member");
    await seedClient({ workspaceId: seeded.workspaceId, name: "Acme" });
    expect(await actions.createClient({ id: randomUUID(), name: "acme" })).toEqual({
      ok: false,
      code: "validation",
      message: projectMessages.clientNameTaken,
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("con la membresía inactiva responde PR-84 y revalida", async () => {
    await signInAs("member", "inactive");
    expect(await actions.createClient({ id: randomUUID(), name: "Acme" })).toEqual({
      ok: false,
      code: "forbidden",
      message: projectMessages.forbidden,
    });
    expect(await db.select().from(client)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });
});

describe("createProject", () => {
  it("crea el proyecto, responde su ProjectRef y revalida el árbol (D-P1-5, D-P1-12)", async () => {
    await signInAs("member");
    const id = randomUUID();
    expect(
      await actions.createProject({ id, name: "Web", clientId: null, color: "lime" }),
    ).toEqual({ ok: true, data: { project: { id, name: "Web", color: "lime" } } });
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("acepta el facturable por defecto y lo guarda (PR-21)", async () => {
    await signInAs("member");
    const id = randomUUID();
    const result = await actions.createProject({
      id,
      name: "Facturable",
      clientId: null,
      color: null,
      billableByDefault: true,
    });
    expect(result).toMatchObject({ ok: true, data: { project: { id } } });
    const [row] = await db.select().from(project);
    expect(row.billableByDefault).toBe(true);
  });

  it("un facturable por defecto que no es booleano responde validation y no escribe", async () => {
    await signInAs("member");
    const result = await actions.createProject({
      id: randomUUID(),
      name: "Web",
      clientId: null,
      color: null,
      // @ts-expect-error: un pedido armado a mano, con un facturable que no es booleano.
      billableByDefault: "sí",
    });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(await db.select().from(project)).toEqual([]);
  });

  it("conserva el not_found del cliente archivado (PR-83)", async () => {
    await signInAs("member");
    const archived = await seedClient({
      workspaceId: seeded.workspaceId,
      archived: true,
    });
    expect(
      await actions.createProject({
        id: randomUUID(),
        name: "Web",
        clientId: archived.id,
        color: null,
      }),
    ).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.clientUnavailable,
    });
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("traduce un color fuera de la paleta como validation", async () => {
    await signInAs("member");
    const result = await actions.createProject({
      id: randomUUID(),
      name: "Web",
      clientId: null,
      // @ts-expect-error: un pedido armado a mano, con un color que no es clave.
      color: "magenta",
    });
    expect(result).toMatchObject({ ok: false, code: "validation" });
    expect(await db.select().from(project)).toEqual([]);
  });

  it("con la membresía inactiva responde PR-84 y revalida", async () => {
    await signInAs("admin", "inactive");
    expect(
      await actions.createProject({
        id: randomUUID(),
        name: "Web",
        clientId: null,
        color: null,
      }),
    ).toEqual({ ok: false, code: "forbidden", message: projectMessages.forbidden });
    expect(await db.select().from(project)).toEqual([]);
    expect(mocks.revalidated).toEqual([tree]);
  });
});

describe("createTask", () => {
  it("crea la tarea si quien pide es responsable del proyecto", async () => {
    const userId = await signInAs("member");
    const web = await seedProject({
      workspaceId: seeded.workspaceId,
      members: [{ userId, isManager: true }],
    });
    const id = randomUUID();
    expect(await actions.createTask({ id, projectId: web.id, name: "Diseño" })).toEqual({
      ok: true,
      data: { task: { id, name: "Diseño" } },
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("un member que no es responsable recibe PR-84", async () => {
    await signInAs("member");
    const web = await seedProject({ workspaceId: seeded.workspaceId });
    expect(
      await actions.createTask({ id: randomUUID(), projectId: web.id, name: "Diseño" }),
    ).toEqual({ ok: false, code: "forbidden", message: projectMessages.forbidden });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("con la membresía inactiva responde PR-72, aunque sea responsable (§4.3)", async () => {
    const userId = await signInAs("owner", "inactive");
    const web = await seedProject({
      workspaceId: seeded.workspaceId,
      members: [{ userId, isManager: true }],
    });
    expect(
      await actions.createTask({ id: randomUUID(), projectId: web.id, name: "Diseño" }),
    ).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("traduce el ZodError de un proyecto que no es un UUID", async () => {
    await signInAs("owner");
    expect(
      await actions.createTask({ id: randomUUID(), projectId: "web", name: "Diseño" }),
    ).toMatchObject({ ok: false, code: "validation" });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("un proyecto de otro workspace responde PR-72", async () => {
    await signInAs("owner");
    const other = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: other.workspaceId });
    expect(
      await actions.createTask({
        id: randomUUID(),
        projectId: foreign.id,
        name: "Diseño",
      }),
    ).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
  });
});

describe("createTag (criterio 15 del 11b)", () => {
  it("crea la etiqueta en el workspace de la sesión, responde su TagRef y revalida /proyectos", async () => {
    const userId = await signInAs("member");
    const id = randomUUID();

    const result = await actions.createTag({ id, name: " Diseño " });

    expect(result).toEqual({ ok: true, data: { tag: { id, name: "Diseño" } } });
    const [row] = await db.select().from(tag);
    expect(row).toMatchObject({ workspaceId: seeded.workspaceId, createdBy: userId });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("traduce el ZodError con su mensaje y revalida", async () => {
    await signInAs("member");
    expect(await actions.createTag({ id: randomUUID(), name: "   " })).toEqual({
      ok: false,
      code: "validation",
      message: projectMessages.nameRequired,
    });
    expect(
      await actions.createTag({ id: "no-es-un-uuid", name: "Diseño" }),
    ).toMatchObject({
      ok: false,
      code: "validation",
    });
    expect(await db.select().from(tag)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/proyectos", "/proyectos"]);
  });

  it("conserva el ProjectError del nombre repetido (PR-80) y revalida", async () => {
    await signInAs("member");
    await seedTag({ workspaceId: seeded.workspaceId, name: "Diseño" });
    expect(await actions.createTag({ id: randomUUID(), name: "diseño" })).toEqual({
      ok: false,
      code: "validation",
      message: projectMessages.tagNameTaken,
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("con la membresía inactiva responde PR-84 y revalida", async () => {
    await signInAs("member", "inactive");
    expect(await actions.createTag({ id: randomUUID(), name: "Diseño" })).toEqual({
      ok: false,
      code: "forbidden",
      message: projectMessages.forbidden,
    });
    expect(await db.select().from(tag)).toEqual([]);
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });

  it("un error cualquiera responde unexpected con el mensaje del módulo y revalida", async () => {
    await signInAs("member");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const insertTag = vi
      .spyOn(projectRepository, "insertTag")
      .mockRejectedValue(new Error("la base se cayó"));
    try {
      expect(await actions.createTag({ id: randomUUID(), name: "Diseño" })).toEqual({
        ok: false,
        code: "unexpected",
        message: projectMessages.unexpected,
      });
    } finally {
      insertTag.mockRestore();
      logged.mockRestore();
    }
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });
});

describe("un error que no es de dominio", () => {
  it("handle responde unexpected con el mensaje del módulo, lo registra y revalida /proyectos", async () => {
    await signInAs("member");
    const { handle } = await import("@/server/action");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("la base se cayó");

    const result = await handle(
      async () => {
        throw cause;
      },
      {
        paths: ["/proyectos"],
        messages: {
          forbidden: projectMessages.forbidden,
          unexpected: projectMessages.unexpected,
        },
      },
    );

    expect(result).toEqual({
      ok: false,
      code: "unexpected",
      message: projectMessages.unexpected,
    });
    expect(logged).toHaveBeenCalledWith(cause);
    logged.mockRestore();
    expect(mocks.revalidated).toEqual(["/proyectos"]);
  });
});

describe("updateProject (§4.6, criterio 11 de P1)", () => {
  /** Un proyecto de Acme con un responsable `member` que es quien tiene la sesión. */
  async function seedManaged() {
    const userId = await signInAs("member");
    const acme = await seedClient({ workspaceId: seeded.workspaceId, name: "Acme" });
    const web = await seedProject({
      workspaceId: seeded.workspaceId,
      clientId: acme.id,
      name: "Web",
      color: "teal",
      members: [{ userId, isManager: true }],
    });
    return { userId, acme, web };
  }

  async function nameOf(id: string) {
    const [row] = await db.select().from(project).where(eq(project.id, id));
    return row.name;
  }

  async function updatesOf(id: string) {
    return (await auditFor("project", id)).filter(
      (row) => row.action === "project.update",
    );
  }

  it("el responsable cambia el nombre, responde ProjectSettings y revalida el árbol", async () => {
    const { acme, web } = await seedManaged();
    expect(await actions.updateProject({ id: web.id, name: " App " })).toEqual({
      ok: true,
      data: {
        project: {
          id: web.id,
          name: "App",
          clientId: acme.id,
          color: "teal",
          note: "",
          billableByDefault: false,
        },
      },
    });
    expect(await nameOf(web.id)).toBe("App");
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("nada difiere: responde ok sin dejar constancia", async () => {
    const { web } = await seedManaged();
    expect(await actions.updateProject({ id: web.id, name: "Web" })).toMatchObject({
      ok: true,
    });
    expect(await updatesOf(web.id)).toEqual([]);
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("el reintento de una respuesta perdida, con lo mismo, deja una sola constancia", async () => {
    const { web } = await seedManaged();
    const input = { id: web.id, note: "Una vez" };
    const first = await actions.updateProject(input);
    const again = await actions.updateProject(input);
    expect(again).toEqual(first);
    expect(await updatesOf(web.id)).toHaveLength(1);
  });

  it.each([
    ["el nombre vacío", { name: "   " }, projectMessages.nameRequired],
    [
      "el nombre de 101 caracteres",
      { name: "a".repeat(101) },
      projectMessages.nameTooLong,
    ],
    ["el carácter nulo", { name: "We\u0000b" }, projectMessages.nullCharacter],
    [
      "la nota de 3001 caracteres",
      { note: "a".repeat(3001) },
      projectMessages.noteTooLong,
    ],
  ] as const)(
    "%s responde validation con su texto, sin escribir",
    async (_, fields, message) => {
      const { web } = await seedManaged();
      expect(await actions.updateProject({ id: web.id, ...fields })).toEqual({
        ok: false,
        code: "validation",
        message,
      });
      expect(await updatesOf(web.id)).toEqual([]);
      expect(mocks.revalidated).toEqual([tree]);
    },
  );

  it("un color fuera de la paleta o null responde validation, sin escribir", async () => {
    const { web } = await seedManaged();
    for (const color of ["magenta", null]) {
      expect(
        // @ts-expect-error: un pedido armado a mano, con un color que no es clave.
        await actions.updateProject({ id: web.id, color }),
      ).toMatchObject({ ok: false, code: "validation" });
    }
    expect(await updatesOf(web.id)).toEqual([]);
  });

  it("el nombre repetido para el cliente responde PR-77", async () => {
    const { acme, web } = await seedManaged();
    await seedProject({
      workspaceId: seeded.workspaceId,
      clientId: acme.id,
      name: "App",
    });
    expect(await actions.updateProject({ id: web.id, name: "app" })).toEqual({
      ok: false,
      code: "validation",
      message: projectMessages.projectNameTaken,
    });
    expect(await nameOf(web.id)).toBe("Web");
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("un proyecto inexistente, de otro workspace, privado ajeno o archivado responde PR-72", async () => {
    await signInAs("member");
    const other = await seedWorkspace();
    const foreign = await seedProject({ workspaceId: other.workspaceId });
    const vault = await seedProject({ workspaceId: seeded.workspaceId, isPublic: false });
    const shelved = await seedProject({
      workspaceId: seeded.workspaceId,
      archived: true,
    });
    for (const id of [randomUUID(), foreign.id, vault.id, shelved.id]) {
      expect(await actions.updateProject({ id, name: "Otro" })).toEqual({
        ok: false,
        code: "not_found",
        message: projectMessages.projectUnavailable,
      });
    }
    expect(await auditFor("project")).toEqual([]);
    expect(mocks.revalidated).toEqual([tree, tree, tree, tree]);
  });

  it("un admin con la membresía inactiva responde PR-72 sin escribir", async () => {
    const web = await seedProject({ workspaceId: seeded.workspaceId, name: "Web" });
    await signInAs("admin", "inactive");
    expect(await actions.updateProject({ id: web.id, name: "App" })).toEqual({
      ok: false,
      code: "not_found",
      message: projectMessages.projectUnavailable,
    });
    expect(await nameOf(web.id)).toBe("Web");
  });

  it("un cliente archivado o de otro workspace responde PR-83", async () => {
    const { web } = await seedManaged();
    const gone = await seedClient({ workspaceId: seeded.workspaceId, archived: true });
    const other = await seedWorkspace();
    const foreign = await seedClient({ workspaceId: other.workspaceId });
    for (const clientId of [gone.id, foreign.id]) {
      expect(await actions.updateProject({ id: web.id, clientId })).toEqual({
        ok: false,
        code: "not_found",
        message: projectMessages.clientUnavailable,
      });
    }
    expect(await updatesOf(web.id)).toEqual([]);
  });

  it("un member que no es responsable recibe PR-84 y revalida", async () => {
    const { web, userId } = await seedManaged();
    await db
      .update(projectMember)
      .set({ isManager: false })
      .where(eq(projectMember.userId, userId));
    expect(await actions.updateProject({ id: web.id, name: "App" })).toEqual({
      ok: false,
      code: "forbidden",
      message: projectMessages.forbidden,
    });
    expect(await nameOf(web.id)).toBe("Web");
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("un error cualquiera responde unexpected con el mensaje del módulo y revalida", async () => {
    const { web } = await seedManaged();
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const update = vi
      .spyOn(projectRepository, "updateProject")
      .mockRejectedValue(new Error("la base se cayó"));
    try {
      expect(await actions.updateProject({ id: web.id, name: "App" })).toEqual({
        ok: false,
        code: "unexpected",
        message: projectMessages.unexpected,
      });
    } finally {
      update.mockRestore();
      logged.mockRestore();
    }
    expect(mocks.revalidated).toEqual([tree]);
  });

  it("sin sesión manda al login sin escribir ni revalidar", async () => {
    const web = await seedProject({ workspaceId: seeded.workspaceId, name: "Web" });
    await expect(
      actions.updateProject({ id: web.id, name: "App" }),
    ).rejects.toBeInstanceOf(RedirectError);
    expect(mocks.redirects).toEqual(["/login"]);
    expect(mocks.revalidated).toEqual([]);
    expect(await nameOf(web.id)).toBe("Web");
  });
});

describe("la revalidación de las otras tres altas no cambia (D-P1-5)", () => {
  it("createClient, createTask y createTag revalidan solo /proyectos", async () => {
    const userId = await signInAs("member");
    const web = await seedProject({
      workspaceId: seeded.workspaceId,
      members: [{ userId, isManager: true }],
    });
    await actions.createClient({ id: randomUUID(), name: "Acme" });
    await actions.createTask({ id: randomUUID(), projectId: web.id, name: "Diseño" });
    await actions.createTag({ id: randomUUID(), name: "Urgente" });
    expect(mocks.revalidated).toEqual(["/proyectos", "/proyectos", "/proyectos"]);
  });
});
