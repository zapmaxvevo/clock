import { describe, expect, it, vi } from "vitest";

import { teamView, type TeamMember } from "@/modules/team/schema";

import {
  activate,
  confirmSelfDemotion,
  feedbackOf,
  type RowHandlers,
} from "./team-members-model";

/** Una fila de la vista, validada con el esquema de la vista. */
function memberOf(fields: Partial<TeamMember>): TeamMember {
  const view = teamView.parse({
    kind: "ready",
    members: [
      {
        membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
        name: "Ana",
        email: "ana@empresa.com",
        role: "member",
        isSelf: false,
        change: "promote",
        ...fields,
      },
    ],
  });
  const [member] = view.kind === "ready" ? view.members : [];
  if (member === undefined) {
    throw new Error("La vista de prueba tiene una fila.");
  }
  return member;
}

const promotable = memberOf({});
const otherAdmin = memberOf({
  membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
  name: "Bruno",
  role: "admin",
  change: "demote",
});
const selfAdmin = memberOf({
  membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
  name: "Carla",
  role: "admin",
  isSelf: true,
  change: "demote",
});

function handlers() {
  return { send: vi.fn<RowHandlers["send"]>(), confirm: vi.fn<RowHandlers["confirm"]>() };
}

describe("activate", () => {
  it("en una fila `promote` manda `admin`, sin confirmar", () => {
    const row = handlers();

    activate(promotable, false, row);

    expect(row.send).toHaveBeenCalledExactlyOnceWith({
      membershipId: promotable.membershipId,
      role: "admin",
    });
    expect(row.confirm).not.toHaveBeenCalled();
  });

  it("en una fila `demote` ajena manda `member`, sin confirmar", () => {
    const row = handlers();

    activate(otherAdmin, false, row);

    expect(row.send).toHaveBeenCalledExactlyOnceWith({
      membershipId: otherAdmin.membershipId,
      role: "member",
    });
    expect(row.confirm).not.toHaveBeenCalled();
  });

  it("en la fila propia con `demote` pide confirmación y no manda (D-R8-5)", () => {
    const row = handlers();

    activate(selfAdmin, false, row);

    expect(row.confirm).toHaveBeenCalledExactlyOnceWith(selfAdmin);
    expect(row.send).not.toHaveBeenCalled();
  });

  it("con un pedido en curso, ninguna fila llama a nada", () => {
    const row = handlers();

    for (const member of [promotable, otherAdmin, selfAdmin]) {
      activate(member, true, row);
    }

    expect(row.send).not.toHaveBeenCalled();
    expect(row.confirm).not.toHaveBeenCalled();
  });
});

describe("confirmSelfDemotion", () => {
  it("manda `member` para la fila propia", () => {
    const send = vi.fn();

    confirmSelfDemotion(selfAdmin, false, send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      membershipId: selfAdmin.membershipId,
      role: "member",
    });
  });

  it("con un pedido en curso, no manda", () => {
    const send = vi.fn();

    confirmSelfDemotion(selfAdmin, true, send);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("feedbackOf", () => {
  it("sin desenlace, sin aviso", () => {
    expect(feedbackOf(null)).toBeNull();
  });

  it("una falla inesperada es un error con el nombre, el mensaje y «Reintentar»", () => {
    expect(
      feedbackOf({
        kind: "failed",
        name: "Ana",
        code: "unexpected",
        message: "No se pudo cambiar el rol. Revisá la conexión y volvé a intentar.",
      }),
    ).toEqual({
      tone: "error",
      title: "No se pudo cambiar el rol de Ana.",
      message: "No se pudo cambiar el rol. Revisá la conexión y volvé a intentar.",
      retry: true,
    });
  });

  it.each(["forbidden", "not_found", "role_locked", "inactive_membership"] as const)(
    "una falla con `%s` es un error sin «Reintentar»: ya describe el estado real",
    (code) => {
      expect(
        feedbackOf({ kind: "failed", name: "Bruno", code, message: "El mensaje." }),
      ).toEqual({
        tone: "error",
        title: "No se pudo cambiar el rol de Bruno.",
        message: "El mensaje.",
        retry: false,
      });
    },
  );

  it.each([
    ["admin", "Rol de Ana: Administrador."],
    ["member", "Rol de Ana: Miembro."],
  ] as const)("un cambio a `%s` es informativo, con el rótulo del rol", (role, title) => {
    expect(feedbackOf({ kind: "changed", name: "Ana", role })).toEqual({
      tone: "info",
      title,
      retry: false,
    });
  });
});
