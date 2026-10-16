import { describe, expect, it } from "vitest";

import { distinctEmails, planInvitations } from "./invitation-plan";
import type { InvitationRow, MemberByEmail } from "./repository";
import { EMAIL_MAX_LENGTH, invitationMessages } from "./schema";

const domains = ["empresa.com"];

function invitationRow(
  email: string,
  status: InvitationRow["status"],
  id = `id-${email}`,
): InvitationRow {
  return { id, email, status };
}

describe("distinctEmails (EQ-105)", () => {
  it("descarta los que quedan vacíos al normalizar", () => {
    expect(distinctEmails([" ", "ana@empresa.com", "\n"])).toEqual(["ana@empresa.com"]);
  });

  it("normaliza y quita los repetidos, conservando el primero y el orden", () => {
    expect(
      distinctEmails(["Ana@Empresa.com ", "leo@gmail.com", "ana@empresa.com"]),
    ).toEqual(["ana@empresa.com", "leo@gmail.com"]);
  });
});

describe("planInvitations (D-E1a-7)", () => {
  it("un correo sin membresía ni invitación se inserta y sale «invited»", () => {
    const plan = planInvitations(["ana@empresa.com"], domains, [], []);

    expect(plan).toEqual({
      outcomes: [{ email: "ana@empresa.com", result: "invited", external: false }],
      rejections: [],
      toInsert: ["ana@empresa.com"],
      toReinvite: [],
    });
  });

  it("marca externo al correo fuera de los dominios", () => {
    const plan = planInvitations(["leo@gmail.com"], domains, [], []);

    expect(plan.outcomes).toEqual([
      { email: "leo@gmail.com", result: "invited", external: true },
    ]);
  });

  it("con invitación pendiente sale «already_invited» sin escribir (EQ-19)", () => {
    const plan = planInvitations(
      ["ana@empresa.com"],
      domains,
      [],
      [invitationRow("ana@empresa.com", "pending")],
    );

    expect(plan.outcomes).toEqual([
      { email: "ana@empresa.com", result: "already_invited", external: false },
    ]);
    expect(plan.toInsert).toEqual([]);
    expect(plan.toReinvite).toEqual([]);
  });

  it.each(["revoked", "accepted"] as const)(
    "con invitación %s y sin membresía vuelve a pending la misma fila (EQ-23)",
    (status) => {
      const row = invitationRow("ana@empresa.com", status);
      const plan = planInvitations(["ana@empresa.com"], domains, [], [row]);

      expect(plan.outcomes).toEqual([
        { email: "ana@empresa.com", result: "invited", external: false },
      ]);
      expect(plan.toReinvite).toEqual([row]);
      expect(plan.toInsert).toEqual([]);
    },
  );

  it("una membresía activa sale «already_member» sin escribir (EQ-20)", () => {
    const plan = planInvitations(
      ["ana@empresa.com"],
      domains,
      [{ email: "ana@empresa.com", status: "active" }],
      [],
    );

    expect(plan.outcomes).toEqual([
      { email: "ana@empresa.com", result: "already_member", external: false },
    ]);
    expect(plan.toInsert).toEqual([]);
  });

  it.each(["inactive", "invited"] as const)(
    "una membresía %s es un rechazo inactive_member (EQ-79)",
    (status) => {
      const plan = planInvitations(
        ["ana@empresa.com"],
        domains,
        [{ email: "ana@empresa.com", status }],
        [],
      );

      expect(plan.rejections).toEqual([
        {
          id: "ana@empresa.com",
          code: "inactive_member",
          message: invitationMessages.inactiveMember("ana@empresa.com"),
        },
      ]);
    },
  );

  it("la membresía tiene prioridad sobre la invitación", () => {
    const members: MemberByEmail[] = [
      { email: "ana@empresa.com", status: "active" },
      { email: "leo@gmail.com", status: "inactive" },
    ];
    const invitations = [
      invitationRow("ana@empresa.com", "revoked"),
      invitationRow("leo@gmail.com", "pending"),
    ];

    const plan = planInvitations(
      ["ana@empresa.com", "leo@gmail.com"],
      domains,
      members,
      invitations,
    );

    expect(plan.outcomes).toEqual([
      { email: "ana@empresa.com", result: "already_member", external: false },
    ]);
    expect(plan.rejections.map((rejection) => rejection.code)).toEqual([
      "inactive_member",
    ]);
    expect(plan.toReinvite).toEqual([]);
  });

  it("un correo inválido es un rechazo invalid_email (EQ-76)", () => {
    const plan = planInvitations(["ana@", "sin-arroba"], domains, [], []);

    expect(plan.rejections).toEqual([
      {
        id: "ana@",
        code: "invalid_email",
        message: invitationMessages.invalidEmail("ana@"),
      },
      {
        id: "sin-arroba",
        code: "invalid_email",
        message: invitationMessages.invalidEmail("sin-arroba"),
      },
    ]);
    expect(plan.toInsert).toEqual([]);
  });

  it(`acepta un correo de ${EMAIL_MAX_LENGTH} caracteres y rechaza uno más largo`, () => {
    const local = (length: number) => "a".repeat(length - "@empresa.com".length);
    const atLimit = `${local(EMAIL_MAX_LENGTH)}@empresa.com`;
    const overLimit = `${local(EMAIL_MAX_LENGTH + 1)}@empresa.com`;
    expect(atLimit).toHaveLength(EMAIL_MAX_LENGTH);
    expect(overLimit).toHaveLength(EMAIL_MAX_LENGTH + 1);

    const plan = planInvitations([atLimit, overLimit], domains, [], []);

    expect(plan.toInsert).toEqual([atLimit]);
    expect(plan.rejections.map((rejection) => rejection.id)).toEqual([overLimit]);
  });

  it("deja los resultados y los rechazos en el orden del pedido", () => {
    const plan = planInvitations(
      ["zoe@gmail.com", "mal", "ana@empresa.com", "otro-mal", "leo@empresa.com"],
      domains,
      [{ email: "leo@empresa.com", status: "active" }],
      [invitationRow("ana@empresa.com", "pending")],
    );

    expect(plan.outcomes.map((outcome) => outcome.email)).toEqual([
      "zoe@gmail.com",
      "ana@empresa.com",
      "leo@empresa.com",
    ]);
    expect(plan.rejections.map((rejection) => rejection.id)).toEqual(["mal", "otro-mal"]);
  });
});
