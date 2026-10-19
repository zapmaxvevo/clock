import { describe, expect, it, vi } from "vitest";

import {
  teamView,
  type ChangeRoleInput,
  type ChangeStatusInput,
  type TeamMember,
} from "@/modules/team/schema";
import type { PendingInvitation } from "@/modules/workspace/schema";

import {
  activate,
  chooseStatusChange,
  confirmDeactivation,
  emptyOf,
  feedbackOf,
  filterHref,
  revokeLeavesTable,
  visibleInvitations,
  visibleMembers,
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
        status: "active",
        hasAccount: true,
        statusChange: null,
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
  status: "active",
  hasAccount: true,
  statusChange: null,
});
/** La fila propia de un admin, como la ve él: sin control (D-R8-5). */
const selfAdmin = memberOf({
  membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
  name: "Carla",
  role: "admin",
  isSelf: true,
  change: null,
  status: "active",
  hasAccount: true,
  statusChange: null,
});

describe("activate", () => {
  it("en una fila `promote` manda `admin`", () => {
    const send = vi.fn<(input: ChangeRoleInput) => void>();

    activate(promotable, false, send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      membershipId: promotable.membershipId,
      role: "admin",
    });
  });

  it("en una fila `demote` manda `member`", () => {
    const send = vi.fn<(input: ChangeRoleInput) => void>();

    activate(otherAdmin, false, send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      membershipId: otherAdmin.membershipId,
      role: "member",
    });
  });

  it("en una fila sin `change`, no manda", () => {
    const send = vi.fn<(input: ChangeRoleInput) => void>();

    activate(selfAdmin, false, send);

    expect(send).not.toHaveBeenCalled();
  });

  it("con un pedido en curso, ninguna fila manda", () => {
    const send = vi.fn<(input: ChangeRoleInput) => void>();

    for (const member of [promotable, otherAdmin, selfAdmin]) {
      activate(member, true, send);
    }

    expect(send).not.toHaveBeenCalled();
  });
});

describe("feedbackOf", () => {
  it("sin desenlace, sin aviso", () => {
    expect(feedbackOf(null)).toBeNull();
  });

  it("una falla inesperada es un error con el nombre, el cuerpo propio y «Reintentar»", () => {
    // El cuerpo no repite «No se pudo cambiar el rol», que ya dice el título.
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
      message: "Revisá la conexión y volvé a intentar.",
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

  it("una revocación es informativa, con el correo", () => {
    expect(feedbackOf({ kind: "revoked", email: "ana@otro.com" })).toEqual({
      tone: "info",
      title: "Invitación de ana@otro.com revocada.",
      retry: false,
    });
  });

  it("una revocación inesperada es un error con el correo, el cuerpo propio y «Reintentar»", () => {
    expect(
      feedbackOf({
        kind: "revokeFailed",
        email: "ana@otro.com",
        code: "unexpected",
        message:
          "No se pudo revocar la invitación. Revisá la conexión y volvé a intentar.",
      }),
    ).toEqual({
      tone: "error",
      title: "No se pudo revocar la invitación de ana@otro.com.",
      message: "Revisá la conexión y volvé a intentar.",
      retry: true,
    });
  });

  it.each(["forbidden", "not_found", "not_pending"] as const)(
    "una revocación con `%s` es un error con la causa, sin «Reintentar»",
    (code) => {
      expect(
        feedbackOf({
          kind: "revokeFailed",
          email: "ana@otro.com",
          code,
          message: "Esa invitación ya no está pendiente.",
        }),
      ).toEqual({
        tone: "error",
        title: "No se pudo revocar la invitación de ana@otro.com.",
        message: "Esa invitación ya no está pendiente.",
        retry: false,
      });
    },
  );
});

describe("revokeLeavesTable", () => {
  it("con éxito, la fila sale: el foco va al título", () => {
    expect(revokeLeavesTable({ kind: "revoked", email: "ana@otro.com" })).toBe(true);
  });

  it.each(["not_pending", "not_found"] as const)(
    "con `%s`, la revalidación también saca la fila",
    (code) => {
      expect(
        revokeLeavesTable({
          kind: "revokeFailed",
          email: "ana@otro.com",
          code,
          message: "Esa invitación ya no está pendiente.",
        }),
      ).toBe(true);
    },
  );

  it.each(["unexpected", "forbidden", "validation"] as const)(
    "con `%s`, la fila sigue y el foco queda en su botón",
    (code) => {
      expect(
        revokeLeavesTable({
          kind: "revokeFailed",
          email: "ana@otro.com",
          code,
          message: "El mensaje.",
        }),
      ).toBe(false);
    },
  );

  it("un cambio de rol no saca ninguna invitación", () => {
    expect(revokeLeavesTable({ kind: "changed", name: "Ana", role: "admin" })).toBe(
      false,
    );
    expect(
      revokeLeavesTable({ kind: "failed", name: "Ana", code: "not_found", message: "x" }),
    ).toBe(false);
  });
});

/** Una activa con menú, una inactiva con cuenta y una inactiva sin cuenta, en el orden de la vista. */
const activeMember = memberOf({
  membershipId: "3b8fa04d-bc75-4f7e-8d84-4a5c6b7d8e94",
  name: "Dora",
  statusChange: "deactivate",
});
const inactiveMember = memberOf({
  membershipId: "4c9ab15e-cd86-4a8f-9e95-5b6d7c8e9fa5",
  name: "Ema",
  status: "inactive",
  change: null,
  statusChange: "reactivate",
});
const inactiveNoAccount = memberOf({
  membershipId: "5dabc26f-de97-4b9a-8fa6-6c7e8d9fab16",
  name: "Fede",
  status: "inactive",
  hasAccount: false,
  change: null,
  statusChange: null,
});
const roster = [activeMember, inactiveMember, inactiveNoAccount];
const names = (members: readonly TeamMember[]) => members.map((member) => member.name);

const invitation: PendingInvitation = {
  id: "6ebcd370-ef08-4cab-9a07-7d8e9fa0bc27",
  email: "gala@empresa.com",
  external: false,
};

describe("visibleMembers", () => {
  it.each([
    ["activas", ["Dora"]],
    ["inactivas", ["Ema", "Fede"]],
    ["invitadas", []],
    ["todas", ["Dora", "Ema", "Fede"]],
  ] as const)(
    "con «%s», las personas de D-E2-8 en el orden de la vista",
    (filter, shown) => {
      expect(names(visibleMembers(roster, filter, new Set()))).toEqual(shown);
    },
  );

  it("EQ-11: la fila cambiada se queda en su lugar aunque el filtro ya no la incluya", () => {
    const deactivated = { ...activeMember, status: "inactive" as const };
    const reactivated = { ...inactiveMember, status: "active" as const };
    const changed = [deactivated, reactivated, inactiveNoAccount];

    expect(
      visibleMembers(changed, "activas", new Set([deactivated.membershipId])),
    ).toEqual([deactivated, reactivated]);
    expect(
      visibleMembers(changed, "inactivas", new Set([reactivated.membershipId])),
    ).toEqual([deactivated, reactivated, inactiveNoAccount]);
  });

  it("sin ids que se quedan, la fila cambiada sale del filtro", () => {
    const deactivated = { ...activeMember, status: "inactive" as const };

    expect(visibleMembers([deactivated], "activas", new Set())).toEqual([]);
  });

  it("un id que se queda y ya no está en la vista no inventa una fila", () => {
    expect(
      names(visibleMembers(roster, "activas", new Set(["no-esta-en-la-vista"]))),
    ).toEqual(["Dora"]);
  });
});

describe("visibleInvitations", () => {
  it.each(["activas", "invitadas", "todas"] as const)("con «%s», todas", (filter) => {
    expect(visibleInvitations([invitation], filter)).toEqual([invitation]);
  });

  it("con «inactivas», ninguna", () => {
    expect(visibleInvitations([invitation], "inactivas")).toEqual([]);
  });
});

describe("filterHref", () => {
  it.each([
    ["activas", "/equipo"],
    ["inactivas", "/equipo?estado=inactivas"],
    ["invitadas", "/equipo?estado=invitadas"],
    ["todas", "/equipo?estado=todas"],
  ] as const)("«%s» lleva a %s", (filter, href) => {
    expect(filterHref(filter)).toBe(href);
  });
});

describe("emptyOf", () => {
  const many = { members: 3, invitations: 1, canInvite: true };

  it("EQ-94: «inactivas» sin filas", () => {
    expect(emptyOf("inactivas", { members: 0, invitations: 0 }, many)).toBe("inactive");
  });

  it("EQ-94: «invitadas» sin filas", () => {
    expect(emptyOf("invitadas", { members: 0, invitations: 0 }, many)).toBe("invited");
  });

  it("con alguna fila, la tabla", () => {
    expect(emptyOf("inactivas", { members: 1, invitations: 0 }, many)).toBeNull();
    expect(emptyOf("invitadas", { members: 0, invitations: 1 }, many)).toBeNull();
    expect(emptyOf("activas", { members: 2, invitations: 1 }, many)).toBeNull();
  });

  it.each(["activas", "todas"] as const)(
    "EQ-93 con «%s»: una sola membresía y ninguna invitada",
    (filter) => {
      expect(
        emptyOf(
          filter,
          { members: 1, invitations: 0 },
          { members: 1, invitations: 0, canInvite: true },
        ),
      ).toBe("invitations");
    },
  );

  it("una inactiva cuenta como otra persona: sin EQ-93 aunque «Activas» muestre una fila", () => {
    expect(
      emptyOf(
        "activas",
        { members: 1, invitations: 0 },
        { members: 2, invitations: 0, canInvite: true },
      ),
    ).toBeNull();
  });

  it("sin `member.invite`, sin EQ-93", () => {
    expect(
      emptyOf(
        "activas",
        { members: 1, invitations: 0 },
        { members: 1, invitations: 0, canInvite: false },
      ),
    ).toBeNull();
  });

  it("con «invitadas» y quien mira solo, EQ-94 y no EQ-93", () => {
    expect(
      emptyOf(
        "invitadas",
        { members: 0, invitations: 0 },
        { members: 1, invitations: 0, canInvite: true },
      ),
    ).toBe("invited");
  });
});

describe("chooseStatusChange", () => {
  function handlers() {
    return {
      confirm: vi.fn<(member: TeamMember) => void>(),
      send: vi.fn<(input: ChangeStatusInput) => void>(),
    };
  }

  it("«Desactivar» abre la confirmación y no manda", () => {
    const spy = handlers();

    chooseStatusChange(activeMember, false, spy);

    expect(spy.confirm).toHaveBeenCalledExactlyOnceWith(activeMember);
    expect(spy.send).not.toHaveBeenCalled();
  });

  it("«Reactivar» manda `active` sin confirmar", () => {
    const spy = handlers();

    chooseStatusChange(inactiveMember, false, spy);

    expect(spy.send).toHaveBeenCalledExactlyOnceWith({
      membershipId: inactiveMember.membershipId,
      status: "active",
    });
    expect(spy.confirm).not.toHaveBeenCalled();
  });

  it("sin `statusChange`, nada", () => {
    const spy = handlers();

    chooseStatusChange(inactiveNoAccount, false, spy);

    expect(spy.confirm).not.toHaveBeenCalled();
    expect(spy.send).not.toHaveBeenCalled();
  });

  it("con un pedido en curso, ningún menú manda ni abre la confirmación", () => {
    const spy = handlers();

    for (const member of roster) {
      chooseStatusChange(member, true, spy);
    }

    expect(spy.confirm).not.toHaveBeenCalled();
    expect(spy.send).not.toHaveBeenCalled();
  });
});

describe("confirmDeactivation", () => {
  it("manda `inactive` para la fila que se confirmaba", () => {
    const send = vi.fn<(input: ChangeStatusInput) => void>();

    confirmDeactivation(activeMember, false, send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      membershipId: activeMember.membershipId,
      status: "inactive",
    });
  });

  it("sin fila, o con un pedido en curso, no manda", () => {
    const send = vi.fn<(input: ChangeStatusInput) => void>();

    confirmDeactivation(null, false, send);
    confirmDeactivation(activeMember, true, send);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("feedbackOf con un cambio de estado", () => {
  it.each([
    ["inactive", "Desactivaste a Dora."],
    ["active", "Reactivaste a Dora."],
  ] as const)("un éxito con `%s` es informativo, con el nombre", (status, title) => {
    expect(feedbackOf({ kind: "statusChanged", name: "Dora", status })).toEqual({
      tone: "info",
      title,
      retry: false,
    });
  });

  it.each([
    ["inactive", "No se pudo desactivar a Dora."],
    ["active", "No se pudo reactivar a Dora."],
  ] as const)(
    "una falla inesperada con `%s` lleva el título, el cuerpo propio y «Reintentar»",
    (status, title) => {
      expect(
        feedbackOf({
          kind: "statusFailed",
          name: "Dora",
          status,
          code: "unexpected",
          message: "No se pudo cambiar el estado. Revisá la conexión y volvé a intentar.",
        }),
      ).toEqual({
        tone: "error",
        title,
        message: "Revisá la conexión y volvé a intentar.",
        retry: true,
      });
    },
  );

  it.each([
    "forbidden",
    "not_found",
    "status_locked",
    "no_account",
    "validation",
  ] as const)(
    "una falla con `%s` muestra el mensaje del resultado, sin «Reintentar»",
    (code) => {
      expect(
        feedbackOf({
          kind: "statusFailed",
          name: "Ema",
          status: "active",
          code,
          message: "El mensaje.",
        }),
      ).toEqual({
        tone: "error",
        title: "No se pudo reactivar a Ema.",
        message: "El mensaje.",
        retry: false,
      });
    },
  );

  it("un cambio de estado no saca ninguna invitación", () => {
    expect(
      revokeLeavesTable({ kind: "statusChanged", name: "Dora", status: "inactive" }),
    ).toBe(false);
  });
});
