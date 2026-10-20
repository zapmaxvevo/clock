import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import {
  changeRoleInput,
  changeStatusInput,
  releaseEmailInput,
  setAccountLinkInput,
  teamMessages,
  teamSearchParams,
  teamView,
  type TeamMember,
} from "./schema";

function messageOf(result: z.ZodSafeParseResult<unknown>): string | undefined {
  return result.success ? undefined : result.error.issues.at(0)?.message;
}

const membershipId = randomUUID();

function member(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    membershipId: randomUUID(),
    name: "Ana Pérez",
    email: "ana@example.com",
    role: "member",
    isSelf: false,
    change: "promote",
    status: "active",
    hasAccount: true,
    statusChange: "deactivate",
    link: null,
    linkActions: [],
    registersExternal: false,
    canReleaseEmail: false,
    ...overrides,
  };
}

describe("changeRoleInput (D-R8-4, D-R8-6)", () => {
  it.each(["member", "admin"] as const)("acepta %s con un uuid", (role) => {
    const result = changeRoleInput.safeParse({ membershipId, role });
    expect(result.success && result.data).toEqual({ membershipId, role });
  });

  it.each([
    ["owner", "owner"],
    ["project_manager", "project_manager"],
    ["team_manager", "team_manager"],
    ["un rol con otra capitalización", "Admin"],
    ["el texto vacío", ""],
    ["un número", 1],
    ["un nulo", null],
  ])("rechaza %s con «Ese rol no está disponible.»", (_label, role) => {
    expect(messageOf(changeRoleInput.safeParse({ membershipId, role }))).toBe(
      teamMessages.roleUnavailable,
    );
  });

  it("rechaza un pedido sin rol con «Ese rol no está disponible.»", () => {
    expect(messageOf(changeRoleInput.safeParse({ membershipId }))).toBe(
      teamMessages.roleUnavailable,
    );
  });

  it.each([
    ["un texto que no es uuid", "abc"],
    ["un id numérico", "42"],
    ["el texto vacío", ""],
    ["un número", 42],
    ["un nulo", null],
  ])("rechaza %s como id con «Esa persona ya no está en el equipo.»", (_label, id) => {
    expect(
      messageOf(changeRoleInput.safeParse({ membershipId: id, role: "admin" })),
    ).toBe(teamMessages.notFound);
  });

  it("rechaza un pedido sin id con «Esa persona ya no está en el equipo.»", () => {
    expect(messageOf(changeRoleInput.safeParse({ role: "admin" }))).toBe(
      teamMessages.notFound,
    );
  });

  it.each([
    ["un nulo", null],
    ["un texto", "admin"],
    ["una lista", [membershipId, "admin"]],
  ])(
    "rechaza %s en lugar del objeto con «Ese rol no está disponible.»",
    (_label, input) => {
      expect(messageOf(changeRoleInput.safeParse(input))).toBe(
        teamMessages.roleUnavailable,
      );
    },
  );
});

describe("changeStatusInput (D-E2-3)", () => {
  it.each(["active", "inactive"] as const)("acepta %s con un uuid", (status) => {
    const result = changeStatusInput.safeParse({ membershipId, status });
    expect(result.success && result.data).toEqual({ membershipId, status });
  });

  it.each([
    ["invited", "invited"],
    ["un estado con otra capitalización", "Inactive"],
    ["el texto vacío", ""],
    ["un número", 1],
    ["un nulo", null],
  ])("rechaza %s con «Ese estado no está disponible.»", (_label, status) => {
    expect(messageOf(changeStatusInput.safeParse({ membershipId, status }))).toBe(
      teamMessages.statusUnavailable,
    );
  });

  it("rechaza un pedido sin estado con «Ese estado no está disponible.»", () => {
    expect(messageOf(changeStatusInput.safeParse({ membershipId }))).toBe(
      teamMessages.statusUnavailable,
    );
  });

  it.each([
    ["un texto que no es uuid", "abc"],
    ["el texto vacío", ""],
    ["un número", 42],
    ["un nulo", null],
  ])("rechaza %s como id con «Esa persona ya no está en el equipo.»", (_label, id) => {
    expect(
      messageOf(changeStatusInput.safeParse({ membershipId: id, status: "inactive" })),
    ).toBe(teamMessages.notFound);
  });

  it.each([
    ["un nulo", null],
    ["un texto", "inactive"],
  ])(
    "rechaza %s en lugar del objeto con «Ese estado no está disponible.»",
    (_label, input) => {
      expect(messageOf(changeStatusInput.safeParse(input))).toBe(
        teamMessages.statusUnavailable,
      );
    },
  );
});

describe("teamSearchParams (D-E2-8)", () => {
  it.each(["activas", "inactivas", "invitadas", "todas"] as const)(
    "acepta ?estado=%s",
    (estado) => {
      const result = teamSearchParams.safeParse({ estado });
      expect(result.success && result.data).toEqual({ estado });
    },
  );

  it("sin parámetro, no trae estado", () => {
    const result = teamSearchParams.safeParse({});
    expect(result.success && result.data).toEqual({});
  });

  it.each([
    ["un valor desconocido", "suspendidas"],
    ["otra capitalización", "Inactivas"],
    ["el texto vacío", ""],
    ["un parámetro repetido", ["inactivas", "todas"]],
  ])("rechaza %s", (_label, estado) => {
    expect(teamSearchParams.safeParse({ estado }).success).toBe(false);
  });
});

describe("setAccountLinkInput (D-E2b-6)", () => {
  it.each([true, false])("acepta link %s con un uuid", (link) => {
    const result = setAccountLinkInput.safeParse({ membershipId, link });
    expect(result.success && result.data).toEqual({ membershipId, link });
  });

  it.each([
    ["un id que no es uuid", "abc"],
    ["un id vacío", ""],
    ["un id numérico", 1],
  ])("rechaza %s con EQ-82", (_label, id) => {
    expect(
      messageOf(setAccountLinkInput.safeParse({ membershipId: id, link: true })),
    ).toBe(teamMessages.notFound);
  });

  it.each([
    ["un texto", "true"],
    ["un número", 1],
    ["un nulo", null],
    ["la ausencia", undefined],
  ])(
    "rechaza `link` con %s con «Esa vinculación no está disponible.»",
    (_label, link) => {
      expect(messageOf(setAccountLinkInput.safeParse({ membershipId, link }))).toBe(
        teamMessages.linkUnavailable,
      );
    },
  );

  it("rechaza un pedido que no es un objeto con «Esa vinculación no está disponible.»", () => {
    expect(messageOf(setAccountLinkInput.safeParse(null))).toBe(
      teamMessages.linkUnavailable,
    );
  });
});

describe("releaseEmailInput (D-E2b-9)", () => {
  it("acepta un uuid", () => {
    const result = releaseEmailInput.safeParse({ membershipId });
    expect(result.success && result.data).toEqual({ membershipId });
  });

  it.each([
    ["un id que no es uuid", { membershipId: "abc" }],
    ["la ausencia del id", {}],
    ["un pedido que no es un objeto", null],
  ])("rechaza %s con EQ-82", (_label, input) => {
    expect(messageOf(releaseEmailInput.safeParse(input))).toBe(teamMessages.notFound);
  });
});

describe("teamView", () => {
  it("admite la vista sin permiso con sus dos motivos", () => {
    for (const reason of ["inactive", "role"] as const) {
      expect(teamView.safeParse({ kind: "forbidden", reason }).success).toBe(true);
    }
    expect(teamView.safeParse({ kind: "forbidden", reason: "other" }).success).toBe(
      false,
    );
  });

  it("admite la lista con una fila de cada uno de los cinco roles", () => {
    const view = {
      kind: "ready",
      linkTtlDays: 7,
      members: [
        member({ role: "owner", change: null, isSelf: true, statusChange: null }),
        member({ role: "admin", change: "demote" }),
        member({ role: "project_manager", change: null }),
        member({ role: "team_manager", change: null }),
        member({ role: "member", change: "promote" }),
        member({ status: "inactive", change: null, statusChange: "reactivate" }),
        member({
          status: "inactive",
          change: null,
          hasAccount: false,
          statusChange: null,
        }),
      ],
    };
    expect(teamView.parse(view)).toEqual(view);
  });

  it("admite la vinculación, el correo liberado y las entradas de E2b", () => {
    const requestedAt = new Date("2026-10-19T12:00:00Z");
    const expiresAt = new Date("2026-10-26T12:00:00Z");
    const view = {
      kind: "ready",
      linkTtlDays: 7,
      members: [
        member({
          link: { requestedAt, expiresAt, expired: false },
          linkActions: ["cancel"],
          registersExternal: true,
        }),
        member({
          link: { requestedAt, expiresAt, expired: true },
          linkActions: ["request", "cancel"],
        }),
        member({
          status: "inactive",
          change: null,
          statusChange: "reactivate",
          canReleaseEmail: true,
        }),
        member({
          status: "inactive",
          change: null,
          email: null,
          hasAccount: false,
          statusChange: null,
        }),
      ],
    };
    expect(teamView.parse(view)).toEqual(view);
  });

  it("rechaza la lista sin `linkTtlDays`", () => {
    expect(teamView.safeParse({ kind: "ready", members: [member()] }).success).toBe(
      false,
    );
  });

  it("rechaza un rol que no existe", () => {
    expect(
      teamView.safeParse({
        kind: "ready",
        linkTtlDays: 7,
        members: [{ ...member(), role: "guest" }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["otra acción", "transfer"],
    ["el texto vacío", ""],
    ["la ausencia", undefined],
  ])("rechaza %s en `change`", (_label, change) => {
    expect(
      teamView.safeParse({
        kind: "ready",
        linkTtlDays: 7,
        members: [{ ...member(), change }],
      }).success,
    ).toBe(false);
  });

  it.each([
    ["invited", "status", "invited"],
    ["la ausencia del estado", "status", undefined],
    ["otra acción", "statusChange", "remove"],
    ["la ausencia de la acción", "statusChange", undefined],
    ["la ausencia de la cuenta", "hasAccount", undefined],
    ["la ausencia del correo", "email", undefined],
    ["la ausencia de la marca", "link", undefined],
    ["otra entrada de vinculación", "linkActions", ["renew"]],
    ["la ausencia de las entradas", "linkActions", undefined],
    ["la ausencia del registro externo", "registersExternal", undefined],
    ["la ausencia de liberar", "canReleaseEmail", undefined],
  ])("rechaza %s", (_label, key, value) => {
    expect(
      teamView.safeParse({
        kind: "ready",
        linkTtlDays: 7,
        members: [{ ...member(), [key]: value }],
      }).success,
    ).toBe(false);
  });
});
