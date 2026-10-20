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

describe("can sobre etiquetas (PR-44, PR-60, PR-62)", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const actions = ["tag.create", "tag.view"] as const;

  it("deja a los cinco roles crear y ver etiquetas", () => {
    for (const role of roles) {
      for (const action of actions) {
        expect([role, action, can(actor(role), action, workspace)]).toEqual([
          role,
          action,
          true,
        ]);
      }
    }
  });

  it("niega las dos a una membresía inactive o invited", () => {
    for (const status of ["inactive", "invited"] as const) {
      for (const action of actions) {
        expect([
          status,
          action,
          can(actor("owner", { status }), action, workspace),
        ]).toEqual([status, action, false]);
      }
    }
  });

  it("niega las dos con el workspace de otro", () => {
    const foreign = {
      kind: "workspace",
      workspaceId: "22222222-2222-2222-2222-222222222222",
    } as const;
    for (const action of actions) {
      expect(can(actor("owner"), action, foreign)).toBe(false);
    }
  });

  it("niegan un recurso de otra clase", () => {
    const ownEntry = { kind: "timeEntry", workspaceId, userId: "u1" } as const;
    // @ts-expect-error: tag.create pide un recurso workspace.
    expect(can(actor("owner"), "tag.create", ownEntry)).toBe(false);
    // @ts-expect-error: tag.view pide un recurso workspace.
    expect(can(actor("owner"), "tag.view", ownEntry)).toBe(false);
  });
});

describe("can con un recurso de otra clase", () => {
  it("las acciones de proyecto niegan un recurso workspace, aunque actúe el owner", () => {
    // @ts-expect-error: task.create pide un recurso project; el par no compila.
    expect(can(actor("owner"), "task.create", workspace)).toBe(false);
    // @ts-expect-error: project.view pide un recurso project.
    expect(can(actor("owner"), "project.view", workspace)).toBe(false);
    // @ts-expect-error: project.track pide un recurso project.
    expect(can(actor("owner"), "project.track", workspace)).toBe(false);
  });

  it("client.create y project.create niegan un recurso membership o timeEntry, que ninguna otra regla mira", () => {
    const ownMembership = {
      kind: "membership",
      workspaceId,
      userId: "u1",
      role: "member",
    } as const;
    const ownEntry = { kind: "timeEntry", workspaceId, userId: "u1" } as const;
    // @ts-expect-error: client.create pide un recurso workspace.
    expect(can(actor("owner"), "client.create", ownMembership)).toBe(false);
    // @ts-expect-error: project.create pide un recurso workspace.
    expect(can(actor("owner"), "project.create", ownEntry)).toBe(false);
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

describe("can sobre el perfil (PF-34)", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const own = { kind: "profile", workspaceId, userId: "u1" } as const;
  const other = { kind: "profile", workspaceId, userId: "u2" } as const;

  it("deja a los cinco roles editar el perfil propio", () => {
    for (const role of roles) {
      expect([role, can(actor(role), "profile.own.update", own)]).toEqual([role, true]);
    }
  });

  it("no deja a ningún rol editar el perfil de otra persona, tampoco al owner", () => {
    for (const role of roles) {
      expect([role, can(actor(role), "profile.own.update", other)]).toEqual([
        role,
        false,
      ]);
    }
  });

  it("niega a una membresía inactive o invited", () => {
    for (const status of ["inactive", "invited"] as const) {
      expect(can(actor("owner", { status }), "profile.own.update", own)).toBe(false);
    }
  });

  it("niega cuando el recurso lleva otro workspace que la membresía con que se actúa", () => {
    expect(
      can(actor("owner"), "profile.own.update", {
        ...own,
        workspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toBe(false);
  });

  it("niega un recurso de otra clase, también un workspace con el owner y una entrada propia", () => {
    // @ts-expect-error: profile.own.update pide un recurso profile.
    expect(can(actor("owner"), "profile.own.update", workspace)).toBe(false);
    const ownEntry = { kind: "timeEntry", workspaceId, userId: "u1" } as const;
    // @ts-expect-error: profile.own.update pide un recurso profile.
    expect(can(actor("owner"), "profile.own.update", ownEntry)).toBe(false);
  });

  it("las acciones de las entradas niegan un recurso profile propio", () => {
    // @ts-expect-error: timeEntry.own.update pide un recurso timeEntry.
    expect(can(actor("owner"), "timeEntry.own.update", own)).toBe(false);
  });
});

describe("can sobre el reporte (ADR 0020, P-01, RP-07)", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const actions = ["report.view", "timeEntry.others.view"] as const;

  it("deja a los cinco roles ver el reporte", () => {
    for (const role of roles) {
      expect([role, can(actor(role), "report.view", workspace)]).toEqual([role, true]);
    }
  });

  it("solo owner y admin ven las horas ajenas, también si son responsables de un proyecto (P-02)", () => {
    expect(
      roles.map((role) => [role, can(actor(role), "timeEntry.others.view", workspace)]),
    ).toEqual([
      ["owner", true],
      ["admin", true],
      ["project_manager", false],
      ["team_manager", false],
      ["member", false],
    ]);
  });

  it("niega las dos a una membresía inactive o invited, también la del owner", () => {
    for (const status of ["inactive", "invited"] as const) {
      for (const role of roles) {
        for (const action of actions) {
          expect([
            status,
            role,
            action,
            can(actor(role, { status }), action, workspace),
          ]).toEqual([status, role, action, false]);
        }
      }
    }
  });

  it("niega las dos con el workspace de otro", () => {
    const foreign = {
      kind: "workspace",
      workspaceId: "22222222-2222-2222-2222-222222222222",
    } as const;
    for (const action of actions) {
      expect([action, can(actor("owner"), action, foreign)]).toEqual([action, false]);
    }
  });

  it("niegan un recurso de otra clase, también una entrada propia", () => {
    const ownEntry = { kind: "timeEntry", workspaceId, userId: "u1" } as const;
    const ownProfile = { kind: "profile", workspaceId, userId: "u1" } as const;
    // @ts-expect-error: report.view pide un recurso workspace.
    expect(can(actor("owner"), "report.view", ownEntry)).toBe(false);
    // @ts-expect-error: timeEntry.others.view pide un recurso workspace.
    expect(can(actor("owner"), "timeEntry.others.view", ownEntry)).toBe(false);
    // @ts-expect-error: report.view pide un recurso workspace.
    expect(can(actor("owner"), "report.view", ownProfile)).toBe(false);
  });
});

describe("team.manage sobre una membresía (R8, §3)", () => {
  const otherWorkspace = "22222222-2222-2222-2222-222222222222";

  function target(role: Role, userId = "u2", inWorkspace = workspaceId) {
    return { kind: "membership", workspaceId: inWorkspace, userId, role } as const;
  }

  const member = target("member");
  const admin = target("admin");
  const ownerMembership = target("owner", "u9");

  it("el owner activo cambia a un member y a un admin, y la regla le deja tocar la suya", () => {
    expect([
      can(actor("owner"), "team.manage", member),
      can(actor("owner"), "team.manage", admin),
      can(actor("owner"), "team.manage", target("owner", "u1")),
    ]).toEqual([true, true, true]);
  });

  it("un admin activo cambia a un member, a otro admin y a sí mismo, y no al owner", () => {
    expect([
      can(actor("admin"), "team.manage", member),
      can(actor("admin"), "team.manage", admin),
      can(actor("admin"), "team.manage", target("admin", "u1")),
      can(actor("admin"), "team.manage", ownerMembership),
    ]).toEqual([true, true, true, false]);
  });

  it("project_manager, team_manager y member activos no cambian ninguna", () => {
    for (const role of ["project_manager", "team_manager", "member"] as const) {
      expect([
        role,
        can(actor(role), "team.manage", member),
        can(actor(role), "team.manage", admin),
        can(actor(role), "team.manage", ownerMembership),
        can(actor(role), "team.manage", target(role, "u1")),
      ]).toEqual([role, false, false, false, false]);
    }
  });

  it("un owner o un admin inactive o invited no cambian ninguna, tampoco la propia", () => {
    for (const status of ["inactive", "invited"] as const) {
      for (const role of ["owner", "admin"] as const) {
        expect([
          status,
          role,
          can(actor(role, { status }), "team.manage", member),
          can(actor(role, { status }), "team.manage", admin),
          can(actor(role, { status }), "team.manage", ownerMembership),
          can(actor(role, { status }), "team.manage", target(role, "u1")),
        ]).toEqual([status, role, false, false, false, false]);
      }
    }
  });

  it("nadie cambia una membresía de otro workspace, tampoco el owner sobre un member", () => {
    for (const role of ["owner", "admin"] as const) {
      for (const targetRole of ["member", "admin", "owner"] as const) {
        expect([
          role,
          targetRole,
          can(actor(role), "team.manage", target(targetRole, "u2", otherWorkspace)),
        ]).toEqual([role, targetRole, false]);
      }
    }
  });

  it("sobre el workspace, la puerta de la pantalla: solo owner y admin activos", () => {
    const roles = [
      "owner",
      "admin",
      "project_manager",
      "team_manager",
      "member",
    ] as const;
    expect(
      roles.map((role) => [role, can(actor(role), "team.manage", workspace)]),
    ).toEqual([
      ["owner", true],
      ["admin", true],
      ["project_manager", false],
      ["team_manager", false],
      ["member", false],
    ]);
    for (const status of ["inactive", "invited"] as const) {
      for (const role of ["owner", "admin"] as const) {
        expect([
          status,
          role,
          can(actor(role, { status }), "team.manage", workspace),
        ]).toEqual([status, role, false]);
      }
    }
  });
});

describe("team.admin.revoke sobre una membresía admin (R8, D-R8-13)", () => {
  const otherAdmin = {
    kind: "membership",
    workspaceId,
    userId: "u2",
    role: "admin",
  } as const;
  const ownAdmin = { ...otherAdmin, userId: "u1" } as const;

  it("el owner activo le quita el rol a un admin", () => {
    expect(can(actor("owner"), "team.admin.revoke", otherAdmin)).toBe(true);
  });

  it("un admin no se lo quita a otro admin ni a sí mismo", () => {
    expect([
      can(actor("admin"), "team.admin.revoke", otherAdmin),
      can(actor("admin"), "team.admin.revoke", ownAdmin),
    ]).toEqual([false, false]);
  });

  it("project_manager, team_manager y member activos no se lo quitan a nadie", () => {
    for (const role of ["project_manager", "team_manager", "member"] as const) {
      expect([role, can(actor(role), "team.admin.revoke", otherAdmin)]).toEqual([
        role,
        false,
      ]);
    }
  });

  it("un owner inactive o invited no se lo quita a nadie", () => {
    for (const status of ["inactive", "invited"] as const) {
      expect([
        status,
        can(actor("owner", { status }), "team.admin.revoke", otherAdmin),
      ]).toEqual([status, false]);
    }
  });

  it("el owner no se lo quita a un admin de otro workspace", () => {
    expect(
      can(actor("owner"), "team.admin.revoke", {
        ...otherAdmin,
        workspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toBe(false);
  });

  it("niega un recurso workspace, aunque actúe el owner", () => {
    // @ts-expect-error: team.admin.revoke pide un recurso membership.
    expect(can(actor("owner"), "team.admin.revoke", workspace)).toBe(false);
  });
});

describe("team.admin.setStatus sobre una membresía admin (E2, D-E2-4, P-07)", () => {
  const otherAdmin = {
    kind: "membership",
    workspaceId,
    userId: "u2",
    role: "admin",
  } as const;
  const ownAdmin = { ...otherAdmin, userId: "u1" } as const;

  it("el owner activo desactiva o reactiva a un admin", () => {
    expect(can(actor("owner"), "team.admin.setStatus", otherAdmin)).toBe(true);
  });

  it("un admin no lo hace sobre otro admin ni sobre sí mismo", () => {
    expect([
      can(actor("admin"), "team.admin.setStatus", otherAdmin),
      can(actor("admin"), "team.admin.setStatus", ownAdmin),
    ]).toEqual([false, false]);
  });

  it("project_manager, team_manager y member activos no lo hacen sobre nadie", () => {
    for (const role of ["project_manager", "team_manager", "member"] as const) {
      expect([role, can(actor(role), "team.admin.setStatus", otherAdmin)]).toEqual([
        role,
        false,
      ]);
    }
  });

  it("un owner inactive o invited no lo hace sobre nadie", () => {
    for (const status of ["inactive", "invited"] as const) {
      expect([
        status,
        can(actor("owner", { status }), "team.admin.setStatus", otherAdmin),
      ]).toEqual([status, false]);
    }
  });

  it("el owner no lo hace sobre un admin de otro workspace", () => {
    expect(
      can(actor("owner"), "team.admin.setStatus", {
        ...otherAdmin,
        workspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toBe(false);
  });

  it("niega un recurso workspace, aunque actúe el owner", () => {
    // @ts-expect-error: team.admin.setStatus pide un recurso membership.
    expect(can(actor("owner"), "team.admin.setStatus", workspace)).toBe(false);
  });
});

describe.each(["team.account.link", "team.email.release"] as const)(
  "%s sobre una membresía (E2b, D-E2b-4)",
  (action) => {
    const roles = [
      "owner",
      "admin",
      "project_manager",
      "team_manager",
      "member",
    ] as const;
    const member = {
      kind: "membership",
      workspaceId,
      userId: "u2",
      role: "member",
    } as const;
    const ownerMembership = { ...member, role: "owner" } as const;

    it("el owner y el admin activos lo hacen sobre un member; el resto, no", () => {
      expect(roles.map((role) => [role, can(actor(role), action, member)])).toEqual([
        ["owner", true],
        ["admin", true],
        ["project_manager", false],
        ["team_manager", false],
        ["member", false],
      ]);
    });

    it("sobre la membresía del owner, solo el owner, también la propia", () => {
      expect([
        can(actor("owner"), action, ownerMembership),
        can(actor("owner"), action, { ...ownerMembership, userId: "u1" }),
        can(actor("admin"), action, ownerMembership),
      ]).toEqual([true, true, false]);
    });

    it("no mira si la fila es admin: eso lo pide `team.admin.account`", () => {
      expect(can(actor("admin"), action, { ...member, role: "admin" })).toBe(true);
    });

    it("un owner o un admin inactive o invited no lo hacen sobre nadie", () => {
      for (const role of ["owner", "admin"] as const) {
        for (const status of ["inactive", "invited"] as const) {
          expect([role, status, can(actor(role, { status }), action, member)]).toEqual([
            role,
            status,
            false,
          ]);
        }
      }
    });

    it("el owner no lo hace sobre una membresía de otro workspace", () => {
      expect(
        can(actor("owner"), action, {
          ...member,
          workspaceId: "22222222-2222-2222-2222-222222222222",
        }),
      ).toBe(false);
    });

    it("niega un recurso workspace, aunque actúe el owner", () => {
      // @ts-expect-error: la acción pide un recurso membership.
      expect(can(actor("owner"), action, workspace)).toBe(false);
    });
  },
);

describe("team.admin.account sobre una membresía admin (E2b, D-E2b-4, P-07)", () => {
  const otherAdmin = {
    kind: "membership",
    workspaceId,
    userId: "u2",
    role: "admin",
  } as const;
  const ownAdmin = { ...otherAdmin, userId: "u1" } as const;

  it("solo el owner activo, sobre otro admin", () => {
    expect(
      (["owner", "admin", "project_manager", "team_manager", "member"] as const).map(
        (role) => [role, can(actor(role), "team.admin.account", otherAdmin)],
      ),
    ).toEqual([
      ["owner", true],
      ["admin", false],
      ["project_manager", false],
      ["team_manager", false],
      ["member", false],
    ]);
  });

  it("un admin no lo hace sobre sí mismo", () => {
    expect(can(actor("admin"), "team.admin.account", ownAdmin)).toBe(false);
  });

  it("un owner inactive o invited no lo hace sobre nadie", () => {
    for (const status of ["inactive", "invited"] as const) {
      expect([
        status,
        can(actor("owner", { status }), "team.admin.account", otherAdmin),
      ]).toEqual([status, false]);
    }
  });

  it("el owner no lo hace sobre un admin de otro workspace", () => {
    expect(
      can(actor("owner"), "team.admin.account", {
        ...otherAdmin,
        workspaceId: "22222222-2222-2222-2222-222222222222",
      }),
    ).toBe(false);
  });

  it("niega un recurso workspace, aunque actúe el owner", () => {
    // @ts-expect-error: team.admin.account pide un recurso membership.
    expect(can(actor("owner"), "team.admin.account", workspace)).toBe(false);
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

describe("can sobre los asistentes (ADR 0026, D-MCP-3 a D-MCP-5)", () => {
  const roles = ["owner", "admin", "project_manager", "team_manager", "member"] as const;
  const own = { kind: "profile", workspaceId, userId: "u1" } as const;
  const other = { kind: "profile", workspaceId, userId: "u9" } as const;
  const otherWorkspace = "22222222-2222-2222-2222-222222222222";

  it("deja a los cinco roles conectar un asistente y desconectar uno propio", () => {
    for (const role of roles) {
      expect([role, can(actor(role), "mcp.connect", workspace)]).toEqual([role, true]);
      expect([role, can(actor(role), "mcp.grant.revoke", own)]).toEqual([role, true]);
    }
  });

  it("niega las dos a una membresía inactive o invited", () => {
    for (const status of ["inactive", "invited"] as const) {
      expect(can(actor("owner", { status }), "mcp.connect", workspace)).toBe(false);
      expect(can(actor("owner", { status }), "mcp.grant.revoke", own)).toBe(false);
    }
  });

  it("niega las dos sobre otro workspace", () => {
    expect(
      can(actor("owner"), "mcp.connect", {
        kind: "workspace",
        workspaceId: otherWorkspace,
      }),
    ).toBe(false);
    expect(
      can(actor("owner"), "mcp.grant.revoke", { ...own, workspaceId: otherWorkspace }),
    ).toBe(false);
  });

  it("no deja a ningún rol desconectar los asistentes de otra persona", () => {
    for (const role of roles) {
      expect([role, can(actor(role), "mcp.grant.revoke", other)]).toEqual([role, false]);
    }
  });

  it("no mira el cliente OAuth del actor", () => {
    const viaMcp = actor("member", { oauthClientId: "cliente" });

    expect(can(viaMcp, "mcp.connect", workspace)).toBe(true);
    expect(
      can(viaMcp, "timeEntry.own.create", {
        kind: "timeEntry",
        workspaceId,
        userId: "u1",
      }),
    ).toBe(true);
  });

  it("niega un recurso de otra clase", () => {
    // @ts-expect-error: mcp.connect pide un recurso workspace.
    expect(can(actor("owner"), "mcp.connect", own)).toBe(false);
    // @ts-expect-error: mcp.grant.revoke pide un recurso profile.
    expect(can(actor("owner"), "mcp.grant.revoke", workspace)).toBe(false);
  });
});
