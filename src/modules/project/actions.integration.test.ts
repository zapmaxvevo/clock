import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "@/server/db";
import { client, membership, project } from "@/server/db/schema";
import type { MembershipStatus, Role } from "@/server/permissions";
import {
  seedClient,
  seedProject,
  seedUser,
  seedWorkspace,
  type SeededWorkspace,
} from "@/test/factories";

import { projectMessages } from "./schema";

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
  it("crea el proyecto y responde su vista", async () => {
    await signInAs("member");
    const id = randomUUID();
    expect(
      await actions.createProject({ id, name: "Web", clientId: null, color: "lime" }),
    ).toEqual({
      ok: true,
      data: {
        project: {
          id,
          name: "Web",
          color: "lime",
          isPublic: true,
          canCreateTask: true,
          tasks: [],
        },
      },
    });
    expect(mocks.revalidated).toEqual(["/proyectos"]);
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
    expect(mocks.revalidated).toEqual(["/proyectos"]);
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
    expect(mocks.revalidated).toEqual(["/proyectos"]);
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
