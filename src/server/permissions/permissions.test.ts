import { describe, expect, it } from "vitest";

import { assertCan, can, ForbiddenError, type Actor, type Role } from "./index";

const workspaceId = "11111111-1111-1111-1111-111111111111";

function actor(role: Role, overrides: Partial<Actor> = {}): Actor {
  return { userId: "u1", workspaceId, role, status: "active", ...overrides };
}

const workspace = { kind: "workspace", workspaceId } as const;

describe("can", () => {
  it("deja al owner y al admin cambiar la configuración del workspace", () => {
    expect(can(actor("owner"), "workspace.settings.update", workspace)).toBe(true);
    expect(can(actor("admin"), "workspace.settings.update", workspace)).toBe(true);
  });

  it("no deja al resto cambiar la configuración del workspace", () => {
    for (const role of ["project_manager", "team_manager", "member"] as const) {
      expect(can(actor(role), "workspace.settings.update", workspace)).toBe(false);
    }
  });

  it("reserva transferir y eliminar el workspace para el owner", () => {
    expect(can(actor("owner"), "workspace.delete", workspace)).toBe(true);
    expect(can(actor("admin"), "workspace.delete", workspace)).toBe(false);
    expect(can(actor("admin"), "workspace.transfer", workspace)).toBe(false);
  });

  it("niega todo a una membresía que no está activa", () => {
    expect(can(actor("owner", { status: "inactive" }), "team.view", workspace)).toBe(
      false,
    );
    expect(can(actor("owner", { status: "invited" }), "team.view", workspace)).toBe(
      false,
    );
  });

  it("niega cuando el recurso es de otro workspace", () => {
    expect(
      can(actor("owner"), "team.manage", {
        kind: "workspace",
        workspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toBe(false);
  });

  it("no deja que un admin toque la membresía del owner", () => {
    const ownerMembership = {
      kind: "membership",
      workspaceId,
      userId: "u9",
      role: "owner",
    } as const;
    expect(can(actor("admin"), "team.manage", ownerMembership)).toBe(false);
    expect(can(actor("owner"), "team.manage", ownerMembership)).toBe(true);
  });
});

describe("can sobre una entrada de horas", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const actions = [
    "timeEntry.own.create",
    "timeEntry.own.update",
    "timeEntry.own.delete",
  ] as const;
  const own = { kind: "timeEntry", workspaceId, userId: "u1" } as const;
  const other = { kind: "timeEntry", workspaceId, userId: "u2" } as const;

  it("deja a los cinco roles crear, editar y borrar las propias", () => {
    for (const role of roles) {
      for (const action of actions) {
        expect(can(actor(role), action, own)).toBe(true);
      }
    }
  });

  it("no deja a ningún rol tocar la entrada de otra persona del workspace", () => {
    for (const role of roles) {
      for (const action of actions) {
        expect(can(actor(role), action, other)).toBe(false);
      }
    }
  });

  it("niega todo a una membresía que no está activa", () => {
    for (const status of ["inactive", "invited"] as const) {
      for (const action of actions) {
        expect(can(actor("member", { status }), action, own)).toBe(false);
      }
    }
  });

  it("niega cuando la entrada es de otro workspace", () => {
    expect(
      can(actor("owner"), "timeEntry.own.update", {
        kind: "timeEntry",
        workspaceId: "22222222-2222-2222-2222-222222222222",
        userId: "u1",
      }),
    ).toBe(false);
  });
});

describe("assertCan", () => {
  it("lanza ForbiddenError cuando can devuelve false", () => {
    expect(() => assertCan(actor("member"), "team.manage", workspace)).toThrow(
      ForbiddenError,
    );
  });

  it("no lanza cuando hay permiso", () => {
    expect(() => assertCan(actor("owner"), "team.manage", workspace)).not.toThrow();
  });
});
