import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { changeRoleInput, teamMessages, teamView, type TeamMember } from "./schema";

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
      members: [
        member({ role: "owner", change: null, isSelf: true }),
        member({ role: "admin", change: "demote" }),
        member({ role: "project_manager", change: null }),
        member({ role: "team_manager", change: null }),
        member({ role: "member", change: "promote" }),
      ],
    };
    expect(teamView.parse(view)).toEqual(view);
  });

  it("rechaza un rol que no existe", () => {
    expect(
      teamView.safeParse({ kind: "ready", members: [{ ...member(), role: "guest" }] })
        .success,
    ).toBe(false);
  });

  it.each([
    ["otra acción", "transfer"],
    ["el texto vacío", ""],
    ["la ausencia", undefined],
  ])("rechaza %s en `change`", (_label, change) => {
    expect(
      teamView.safeParse({ kind: "ready", members: [{ ...member(), change }] }).success,
    ).toBe(false);
  });
});
