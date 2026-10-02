import { describe, expect, it } from "vitest";

import { seedUser } from "@/test/factories";

import { ensureWorkspaceContext } from "./service";

describe("ensureWorkspaceContext", () => {
  it("crea el workspace y deja como owner a la cuenta configurada", async () => {
    const userId = await seedUser("owner@empresa.com");

    const context = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });

    expect(context.workspace.name).toBe("Workspace");
    expect(context.actor.role).toBe("owner");
    expect(context.actor.status).toBe("active");
    expect(context.actor.workspaceId).toBe(context.workspace.id);
  });

  it("reutiliza el workspace existente y no duplica la membresía", async () => {
    const userId = await seedUser("owner@empresa.com");

    const first = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });
    const second = await ensureWorkspaceContext({
      id: userId,
      email: "owner@empresa.com",
    });

    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.membership.id).toBe(first.membership.id);
  });

  it("suma al resto del equipo como member en el workspace que ya existe", async () => {
    const ownerId = await seedUser("owner@empresa.com");
    await ensureWorkspaceContext({ id: ownerId, email: "owner@empresa.com" });

    const otherId = await seedUser("ana@empresa.com");
    const context = await ensureWorkspaceContext({
      id: otherId,
      email: "ana@empresa.com",
    });

    expect(context.actor.role).toBe("member");
    expect(context.workspace.ownerId).toBe(ownerId);
  });
});
