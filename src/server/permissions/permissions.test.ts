import { describe, expect, it } from "vitest";

import {
  assertCan,
  can,
  ForbiddenError,
  type Actor,
  type ProjectResource,
  type Role,
} from "./index";

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

describe("can sobre proyectos", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const viewers = {
    ninguno: null,
    miembro: { isManager: false },
    responsable: { isManager: true },
  } as const;

  function project(
    isPublic: boolean,
    viewer: ProjectResource["viewer"],
  ): ProjectResource {
    return { kind: "project", workspaceId, isPublic, viewer };
  }

  const isAdmin = (role: Role) => role === "owner" || role === "admin";

  /** §3.1, escrita fila por fila y no derivada de la implementación. */
  const expected = {
    "project.view": (role: Role, isPublic: boolean, viewer: ProjectResource["viewer"]) =>
      isPublic || viewer !== null || isAdmin(role),
    "project.track": (
      _role: Role,
      isPublic: boolean,
      viewer: ProjectResource["viewer"],
    ) => isPublic || viewer !== null,
    "task.create": (role: Role, _isPublic: boolean, viewer: ProjectResource["viewer"]) =>
      isAdmin(role) || viewer?.isManager === true,
  } as const;

  for (const action of ["project.view", "project.track", "task.create"] as const) {
    describe(action, () => {
      for (const role of roles) {
        for (const isPublic of [true, false]) {
          for (const [label, viewer] of Object.entries(viewers)) {
            const allowed = expected[action](role, isPublic, viewer);
            it(`${role}, proyecto ${isPublic ? "público" : "privado"}, ${label}: ${allowed ? "sí" : "no"}`, () => {
              expect(can(actor(role), action, project(isPublic, viewer))).toBe(allowed);
            });
          }
        }
      }
    });
  }

  it("un privado sin pertenencia: owner y admin lo ven, y nadie carga horas en él", () => {
    const hidden = project(false, null);
    expect(can(actor("owner"), "project.view", hidden)).toBe(true);
    expect(can(actor("admin"), "project.view", hidden)).toBe(true);
    expect(can(actor("member"), "project.view", hidden)).toBe(false);
    for (const role of roles) {
      expect(can(actor(role), "project.track", hidden)).toBe(false);
    }
  });

  it("la marca de responsable da task.create a un member, y la pertenencia sola no", () => {
    expect(can(actor("member"), "task.create", project(true, { isManager: true }))).toBe(
      true,
    );
    expect(can(actor("member"), "task.create", project(true, { isManager: false }))).toBe(
      false,
    );
  });

  it("team_manager y project_manager sin marca deciden como member en las cinco (PR-57)", () => {
    const resources = [
      ...[true, false].flatMap((isPublic) =>
        Object.values(viewers).map((viewer) => project(isPublic, viewer)),
      ),
    ];
    for (const role of ["team_manager", "project_manager"] as const) {
      expect(can(actor(role), "client.create", workspace)).toBe(
        can(actor("member"), "client.create", workspace),
      );
      expect(can(actor(role), "project.create", workspace)).toBe(
        can(actor("member"), "project.create", workspace),
      );
      for (const resource of resources) {
        for (const action of ["project.view", "project.track", "task.create"] as const) {
          expect(can(actor(role), action, resource)).toBe(
            can(actor("member"), action, resource),
          );
        }
      }
    }
  });

  it("los cinco roles crean clientes y proyectos (P-18, PR-58)", () => {
    for (const role of roles) {
      expect(can(actor(role), "client.create", workspace)).toBe(true);
      expect(can(actor(role), "project.create", workspace)).toBe(true);
    }
  });

  it("una membresía inactive o invited no hace ninguna de las cinco (PR-60)", () => {
    const managed = project(true, { isManager: true });
    for (const status of ["inactive", "invited"] as const) {
      const blocked = actor("owner", { status });
      expect(can(blocked, "client.create", workspace)).toBe(false);
      expect(can(blocked, "project.create", workspace)).toBe(false);
      expect(can(blocked, "project.view", managed)).toBe(false);
      expect(can(blocked, "project.track", managed)).toBe(false);
      expect(can(blocked, "task.create", managed)).toBe(false);
    }
  });

  it("niega un proyecto de otro workspace aunque quien actúa sea su responsable", () => {
    const foreign = {
      kind: "project",
      workspaceId: "22222222-2222-2222-2222-222222222222",
      isPublic: true,
      viewer: { isManager: true },
    } as const;
    expect(can(actor("owner"), "project.view", foreign)).toBe(false);
    expect(can(actor("owner"), "task.create", foreign)).toBe(false);
  });
});

describe("can con un recurso de otra clase", () => {
  const managed = {
    kind: "project",
    workspaceId,
    isPublic: true,
    viewer: { isManager: true },
  } as const;

  it("las acciones de proyecto niegan un recurso workspace, aunque actúe el owner", () => {
    // @ts-expect-error: task.create pide un recurso project; el par no compila.
    expect(can(actor("owner"), "task.create", workspace)).toBe(false);
    // @ts-expect-error: project.view pide un recurso project.
    expect(can(actor("owner"), "project.view", workspace)).toBe(false);
    // @ts-expect-error: project.track pide un recurso project.
    expect(can(actor("owner"), "project.track", workspace)).toBe(false);
  });

  it("client.create y project.create niegan un recurso project", () => {
    // @ts-expect-error: client.create pide un recurso workspace.
    expect(can(actor("owner"), "client.create", managed)).toBe(false);
    // @ts-expect-error: project.create pide un recurso workspace.
    expect(can(actor("owner"), "project.create", managed)).toBe(false);
  });

  it("timeEntry.own.update niega un recurso workspace, que antes concedía", () => {
    // @ts-expect-error: timeEntry.own.update pide un recurso timeEntry.
    expect(can(actor("member"), "timeEntry.own.update", workspace)).toBe(false);
  });

  it("team.manage sigue aceptando workspace y membership", () => {
    expect(can(actor("admin"), "team.manage", workspace)).toBe(true);
    expect(
      can(actor("admin"), "team.manage", {
        kind: "membership",
        workspaceId,
        userId: "u9",
        role: "member",
      }),
    ).toBe(true);
  });

  it("assertCan corta con ForbiddenError", () => {
    // @ts-expect-error: task.create pide un recurso project.
    expect(() => assertCan(actor("owner"), "task.create", workspace)).toThrow(
      ForbiddenError,
    );
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
