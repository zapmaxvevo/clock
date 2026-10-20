import { describe, expect, it, vi } from "vitest";

import {
  teamView,
  type ChangeRoleInput,
  type ChangeStatusInput,
  type ReleaseEmailInput,
  type SetAccountLinkInput,
  type TeamMember,
} from "@/modules/team/schema";
import type { PendingInvitation } from "@/modules/workspace/schema";

import {
  activate,
  chooseMenuEntry,
  confirmDeactivation,
  confirmLinkRequest,
  confirmRelease,
  emptyOf,
  feedbackOf,
  filterHref,
  linkConfirmationOf,
  linkPendingOf,
  menuEntriesOf,
  revokeLeavesTable,
  rowNoteOf,
  rowNotesOf,
  statusChangedOf,
  visibleInvitations,
  visibleMembers,
  type MenuEntry,
} from "./team-members-model";

/** Una fila de la vista, validada con el esquema de la vista. */
function memberOf(fields: Partial<TeamMember>): TeamMember {
  const view = teamView.parse({
    kind: "ready",
    linkTtlDays: 7,
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
        link: null,
        linkActions: [],
        registersExternal: false,
        canReleaseEmail: false,
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
  linkActions: ["request"],
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

type Link = NonNullable<TeamMember["link"]>;

/** El pedido y el vencimiento de las vinculaciones de prueba, el 12 y el 19 de octubre. */
const REQUESTED: Link["requestedAt"] = new Date("2026-10-12T15:00:00.000Z");
const EXPIRES: Link["expiresAt"] = new Date("2026-10-19T15:00:00.000Z");

function linkOf(expired: boolean): Link {
  return { requestedAt: REQUESTED, expiresAt: EXPIRES, expired };
}

/** Un `formatDay` de prueba: la fecha de quien mira la pone la pantalla. */
function formatDay(moment: Link["requestedAt"]): string {
  return String(moment) === String(REQUESTED) ? "12/10/2026" : "19/10/2026";
}

/** §5.3 de E2b: las filas de la vinculación y del correo, como las ve el owner. */
const activeNoAccount = memberOf({
  membershipId: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
  name: "Gabi",
  email: "gabi@empresa.com",
  hasAccount: false,
  statusChange: "deactivate",
  linkActions: ["request"],
});
const inactiveReactivable = memberOf({
  membershipId: "8b2c3d4e-5f6a-4b7c-9d8e-0f1a2b3c4d5e",
  name: "Hugo",
  email: "hugo@empresa.com",
  status: "inactive",
  change: null,
  hasAccount: false,
  statusChange: "reactivate",
  canReleaseEmail: true,
});
const pendingLink = memberOf({
  membershipId: "9c3d4e5f-6a7b-4c8d-8e9f-1a2b3c4d5e6f",
  name: "Inés",
  email: "ines@empresa.com",
  statusChange: "deactivate",
  link: linkOf(false),
  linkActions: ["cancel"],
});
const expiredLink = memberOf({
  membershipId: "ad4e5f6a-7b8c-4d9e-9f0a-2b3c4d5e6f7a",
  name: "Juan",
  email: "juan@empresa.com",
  statusChange: "deactivate",
  link: linkOf(true),
  linkActions: ["request", "cancel"],
});
const releasable = memberOf({
  membershipId: "be5f6a7b-8c9d-4e0f-8a1b-3c4d5e6f7a8b",
  name: "Karen",
  email: "karen@empresa.com",
  status: "inactive",
  change: null,
  statusChange: "reactivate",
  canReleaseEmail: true,
});
const released = memberOf({
  membershipId: "cf6a7b8c-9d0e-4f1a-9b2c-4d5e6f7a8b9c",
  name: "Luis",
  email: null,
  status: "inactive",
  change: null,
  hasAccount: false,
  statusChange: null,
});
const linkRoster = [
  activeNoAccount,
  inactiveReactivable,
  pendingLink,
  expiredLink,
  releasable,
  released,
];
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

/** Los dobles de `chooseMenuEntry`: ninguno manda de verdad. */
function entryHandlers() {
  return {
    confirmDeactivate: vi.fn<(member: TeamMember) => void>(),
    confirmLink: vi.fn<(request: { member: TeamMember; reactivate: boolean }) => void>(),
    confirmRelease: vi.fn<(member: TeamMember) => void>(),
    sendStatus: vi.fn<(input: ChangeStatusInput) => void>(),
    sendLink: vi.fn<(input: SetAccountLinkInput) => void>(),
  };
}

/** Si ninguno de los dobles se llamó. */
function untouched(spy: ReturnType<typeof entryHandlers>): boolean {
  return Object.values(spy).every((handler) => handler.mock.calls.length === 0);
}

describe("chooseMenuEntry", () => {
  it("«Desactivar» abre la confirmación y no manda", () => {
    const spy = entryHandlers();

    chooseMenuEntry(activeMember, "deactivate", false, spy);

    expect(spy.confirmDeactivate).toHaveBeenCalledExactlyOnceWith(activeMember);
    expect(spy.sendStatus).not.toHaveBeenCalled();
  });

  it("EQ-47: «Reactivar» con cuenta manda `active` sin confirmar", () => {
    const spy = entryHandlers();

    chooseMenuEntry(inactiveMember, "reactivate", false, spy);

    expect(spy.sendStatus).toHaveBeenCalledExactlyOnceWith({
      membershipId: inactiveMember.membershipId,
      status: "active",
    });
    expect(spy.confirmLink).not.toHaveBeenCalled();
  });

  it("D-E2b-5: «Reactivar» sin cuenta abre la confirmación de vincular, como reactivar", () => {
    const spy = entryHandlers();

    chooseMenuEntry(inactiveReactivable, "reactivate", false, spy);

    expect(spy.confirmLink).toHaveBeenCalledExactlyOnceWith({
      member: inactiveReactivable,
      reactivate: true,
    });
    expect(spy.sendStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["requestLink", () => activeNoAccount],
    ["requestOtherLink", () => activeMember],
    ["renewLink", () => expiredLink],
  ] as const)("«%s» abre la confirmación de vincular, sin reactivar", (entry, row) => {
    const spy = entryHandlers();
    const member = row();

    chooseMenuEntry(member, entry, false, spy);

    expect(spy.confirmLink).toHaveBeenCalledExactlyOnceWith({
      member,
      reactivate: false,
    });
    expect(spy.sendLink).not.toHaveBeenCalled();
  });

  it("«Cancelar la vinculación» manda `link: false` sin confirmar", () => {
    const spy = entryHandlers();

    chooseMenuEntry(pendingLink, "cancelLink", false, spy);

    expect(spy.sendLink).toHaveBeenCalledExactlyOnceWith({
      membershipId: pendingLink.membershipId,
      link: false,
    });
    expect(spy.confirmLink).not.toHaveBeenCalled();
  });

  it("«Liberar el correo» abre su confirmación y no manda", () => {
    const spy = entryHandlers();

    chooseMenuEntry(releasable, "releaseEmail", false, spy);

    expect(spy.confirmRelease).toHaveBeenCalledExactlyOnceWith(releasable);
  });

  it("una entrada que la fila no ofrece no hace nada", () => {
    const spy = entryHandlers();

    chooseMenuEntry(inactiveNoAccount, "reactivate", false, spy);
    chooseMenuEntry(activeMember, "cancelLink", false, spy);
    chooseMenuEntry(activeMember, "releaseEmail", false, spy);
    chooseMenuEntry(released, "reactivate", false, spy);

    expect(untouched(spy)).toBe(true);
  });

  it("con un pedido en curso, ningún menú manda ni abre una confirmación", () => {
    const spy = entryHandlers();

    for (const member of [...roster, ...linkRoster]) {
      for (const entry of menuEntriesOf(member)) {
        chooseMenuEntry(member, entry, true, spy);
      }
    }

    expect(untouched(spy)).toBe(true);
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
    expect(
      feedbackOf({ kind: "statusChanged", name: "Dora", status, linkRequested: false }),
    ).toEqual({
      tone: "info",
      title,
      retry: false,
    });
  });

  it("D-E2b-5: reactivar a quien no tenía cuenta dice que la cuenta se vincula en su próximo ingreso", () => {
    expect(
      feedbackOf({
        kind: "statusChanged",
        name: "Fede",
        status: "active",
        linkRequested: true,
      }),
    ).toEqual({
      tone: "info",
      title: "Reactivaste a Fede. Su cuenta de Google se vincula en su próximo ingreso.",
      retry: false,
    });
  });

  it("D-E2b-5: el aviso de la vinculación sigue al resultado aunque la vista diga que tenía cuenta", () => {
    const fede = memberOf({ name: "Fede", status: "inactive", hasAccount: true });
    expect(
      feedbackOf(
        statusChangedOf(fede.name, {
          membershipId: fede.membershipId,
          status: "active",
          linkRequested: true,
        }),
      )?.title,
    ).toBe("Reactivaste a Fede. Su cuenta de Google se vincula en su próximo ingreso.");
  });

  it("D-E2b-5: sin `linkRequested` en el resultado, ningún aviso de vinculación aunque la vista diga que no tenía cuenta", () => {
    const fede = memberOf({ name: "Fede", status: "inactive", hasAccount: false });
    expect(
      feedbackOf(
        statusChangedOf(fede.name, {
          membershipId: fede.membershipId,
          status: "active",
          linkRequested: false,
        }),
      )?.title,
    ).toBe("Reactivaste a Fede.");
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
    "email_released",
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
      revokeLeavesTable({
        kind: "statusChanged",
        name: "Dora",
        status: "inactive",
        linkRequested: false,
      }),
    ).toBe(false);
  });
});

describe("feedbackOf con la vinculación y el correo", () => {
  it.each([
    [true, "Pediste vincular una cuenta de Google a Dora."],
    [false, "Cancelaste la vinculación de Dora."],
  ] as const)("un éxito con `link: %s` es informativo, con el nombre", (link, title) => {
    expect(feedbackOf({ kind: "linkChanged", name: "Dora", link })).toEqual({
      tone: "info",
      title,
      retry: false,
    });
  });

  it("liberar el correo es informativo, con el nombre", () => {
    expect(feedbackOf({ kind: "released", name: "Ema" })).toEqual({
      tone: "info",
      title: "Liberaste el correo de Ema.",
      retry: false,
    });
  });

  it.each([
    [true, "No se pudo vincular una cuenta de Google a Dora."],
    [false, "No se pudo cancelar la vinculación de Dora."],
  ] as const)(
    "una falla inesperada con `link: %s` lleva el título, el cuerpo propio y «Reintentar»",
    (link, title) => {
      expect(
        feedbackOf({
          kind: "linkFailed",
          name: "Dora",
          link,
          code: "unexpected",
          message:
            "No se pudo cambiar la vinculación. Revisá la conexión y volvé a intentar.",
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
    "inactive_membership",
    "email_released",
    "validation",
  ] as const)(
    "una falla de la vinculación con `%s` muestra el mensaje del resultado, sin «Reintentar»",
    (code) => {
      expect(
        feedbackOf({
          kind: "linkFailed",
          name: "Dora",
          link: true,
          code,
          message: "El mensaje.",
        }),
      ).toEqual({
        tone: "error",
        title: "No se pudo vincular una cuenta de Google a Dora.",
        message: "El mensaje.",
        retry: false,
      });
    },
  );

  it("una liberación inesperada lleva el título, el cuerpo propio y «Reintentar»", () => {
    expect(
      feedbackOf({
        kind: "releaseFailed",
        name: "Ema",
        code: "unexpected",
        message: "No se pudo liberar el correo. Revisá la conexión y volvé a intentar.",
      }),
    ).toEqual({
      tone: "error",
      title: "No se pudo liberar el correo de Ema.",
      message: "Revisá la conexión y volvé a intentar.",
      retry: true,
    });
  });

  it.each(["forbidden", "not_found", "active_membership"] as const)(
    "una liberación con `%s` muestra el mensaje del resultado, sin «Reintentar»",
    (code) => {
      expect(
        feedbackOf({ kind: "releaseFailed", name: "Ema", code, message: "El mensaje." }),
      ).toEqual({
        tone: "error",
        title: "No se pudo liberar el correo de Ema.",
        message: "El mensaje.",
        retry: false,
      });
    },
  );
});

describe("confirmLinkRequest", () => {
  function senders() {
    return {
      sendStatus: vi.fn<(input: ChangeStatusInput) => void>(),
      sendLink: vi.fn<(input: SetAccountLinkInput) => void>(),
    };
  }

  it("D-E2b-5: al reactivar manda `active`; el servidor pide la vinculación", () => {
    const spy = senders();

    confirmLinkRequest({ member: inactiveReactivable, reactivate: true }, false, spy);

    expect(spy.sendStatus).toHaveBeenCalledExactlyOnceWith({
      membershipId: inactiveReactivable.membershipId,
      status: "active",
    });
    expect(spy.sendLink).not.toHaveBeenCalled();
  });

  it("al vincular manda `link: true`", () => {
    const spy = senders();

    confirmLinkRequest({ member: activeNoAccount, reactivate: false }, false, spy);

    expect(spy.sendLink).toHaveBeenCalledExactlyOnceWith({
      membershipId: activeNoAccount.membershipId,
      link: true,
    });
    expect(spy.sendStatus).not.toHaveBeenCalled();
  });

  it("sin pedido que confirmar, o con uno en curso, no manda", () => {
    const spy = senders();

    confirmLinkRequest(null, false, spy);
    confirmLinkRequest({ member: activeNoAccount, reactivate: false }, true, spy);
    confirmLinkRequest({ member: inactiveReactivable, reactivate: true }, true, spy);

    expect(spy.sendStatus).not.toHaveBeenCalled();
    expect(spy.sendLink).not.toHaveBeenCalled();
  });
});

describe("confirmRelease", () => {
  it("manda la membresía que se confirmaba", () => {
    const send = vi.fn<(input: ReleaseEmailInput) => void>();

    confirmRelease(releasable, false, send);

    expect(send).toHaveBeenCalledExactlyOnceWith({
      membershipId: releasable.membershipId,
    });
  });

  it("sin fila, o con un pedido en curso, no manda", () => {
    const send = vi.fn<(input: ReleaseEmailInput) => void>();

    confirmRelease(null, false, send);
    confirmRelease(releasable, true, send);

    expect(send).not.toHaveBeenCalled();
  });
});

describe("linkConfirmationOf", () => {
  it("sin cuenta: la primera cuenta, con los días de la vista", () => {
    expect(linkConfirmationOf({ member: activeNoAccount, reactivate: false }, 3)).toEqual(
      {
        title: "¿Vincular una cuenta de Google a Gabi?",
        body: "En los próximos 3 días, la próxima cuenta de Google que entre con gabi@empresa.com va a quedar vinculada a Gabi, con su rol y sus horas. Hacelo solo si ese correo sigue siendo suyo.",
        external: null,
        confirm: "Vincular",
      },
    );
  });

  it("con cuenta: reemplaza a la actual", () => {
    const confirmation = linkConfirmationOf(
      { member: activeMember, reactivate: false },
      7,
    );

    expect(confirmation.title).toBe("¿Vincular otra cuenta de Google a Dora?");
    expect(confirmation.body).toContain("va a reemplazar a la actual");
    expect(confirmation.confirm).toBe("Vincular");
  });

  it("al reactivar, el título y el botón de reactivar", () => {
    const confirmation = linkConfirmationOf(
      { member: inactiveReactivable, reactivate: true },
      7,
    );

    expect(confirmation.title).toBe("¿Reactivar a Hugo?");
    expect(confirmation.body).toContain("va a quedar vinculada a Hugo");
    expect(confirmation.confirm).toBe("Reactivar");
  });

  it("D-E2b-8: con `registersExternal`, el párrafo del externo", () => {
    const external = memberOf({
      ...activeNoAccount,
      email: "gabi@otro.com",
      registersExternal: true,
    });

    expect(linkConfirmationOf({ member: external, reactivate: false }, 7).external).toBe(
      "gabi@otro.com queda registrado como invitado externo, y sigue registrado aunque después canceles la vinculación o venza. Si Gabi ya tiene una cuenta de Google vinculada, vuelve a entrar con ella desde ahora.",
    );
  });
});

describe("menuEntriesOf", () => {
  it.each([
    ["una activa con cuenta", () => activeMember, ["deactivate", "requestOtherLink"]],
    ["una activa sin cuenta", () => activeNoAccount, ["deactivate", "requestLink"]],
    ["una con la vinculación vigente", () => pendingLink, ["deactivate", "cancelLink"]],
    [
      "una con la vinculación vencida",
      () => expiredLink,
      ["deactivate", "renewLink", "cancelLink"],
    ],
    ["una inactiva con cuenta", () => releasable, ["reactivate", "releaseEmail"]],
    [
      "una inactiva sin cuenta",
      () => inactiveReactivable,
      ["reactivate", "releaseEmail"],
    ],
    ["una liberada", () => released, []],
    ["una sin controles", () => inactiveNoAccount, []],
  ] as const)("§5.3 de E2b: %s", (_, row, entries) => {
    expect(menuEntriesOf(row())).toEqual(entries);
  });

  it("la fila propia del owner: solo la vinculación, sin estado", () => {
    expect(
      menuEntriesOf(
        memberOf({ role: "owner", isSelf: true, change: null, linkActions: ["request"] }),
      ),
    ).toEqual(["requestOtherLink"]);
  });

  it("el orden es el de §5.3 aunque `linkActions` llegue al revés", () => {
    expect(menuEntriesOf({ ...expiredLink, linkActions: ["cancel", "request"] })).toEqual<
      MenuEntry[]
    >(["deactivate", "renewLink", "cancelLink"]);
  });
});

describe("rowNoteOf", () => {
  it("§5.2 de E2b: vigente sin cuenta, falta su primer ingreso", () => {
    expect(rowNoteOf({ ...activeNoAccount, link: linkOf(false) }, formatDay)).toBe(
      "Vinculación pedida el 12/10/2026, vence el 19/10/2026: falta su primer ingreso con Google.",
    );
  });

  it("vigente con cuenta, la próxima cuenta nueva reemplaza a la actual", () => {
    expect(rowNoteOf(pendingLink, formatDay)).toBe(
      "Vinculación pedida el 12/10/2026, vence el 19/10/2026: la próxima cuenta de Google nueva con este correo reemplaza a la actual.",
    );
  });

  it.each([true, false])(
    "vencida, con cuenta o sin ella (`hasAccount: %s`)",
    (hasAccount) => {
      expect(rowNoteOf({ ...expiredLink, hasAccount }, formatDay)).toBe(
        "La vinculación pedida el 12/10/2026 venció el 19/10/2026.",
      );
    },
  );

  it.each([
    ["activa", () => activeNoAccount],
    ["inactiva", () => inactiveReactivable],
  ] as const)(
    "sin cuenta ni vinculación, %s: «Sin cuenta de Google vinculada.»",
    (_, row) => {
      expect(rowNoteOf(row(), formatDay)).toBe("Sin cuenta de Google vinculada.");
    },
  );

  it("con cuenta y sin vinculación, sin nota", () => {
    expect(rowNoteOf(activeMember, formatDay)).toBeNull();
    expect(rowNoteOf(releasable, formatDay)).toBeNull();
  });

  it("D-E2b-9: una liberada no tiene nota, aunque no tenga cuenta", () => {
    expect(rowNoteOf(released, formatDay)).toBeNull();
  });
});

describe("linkPendingOf", () => {
  it("solo con una vinculación vigente", () => {
    expect(linkPendingOf(pendingLink)).toBe(true);
    expect(linkPendingOf(expiredLink)).toBe(false);
    expect(linkPendingOf(activeMember)).toBe(false);
  });
});

describe("rowNotesOf", () => {
  it("ADR 0012: el día en la zona de quien mira y con su formato, solo de las filas con nota", () => {
    // 15:00 UTC es la madrugada siguiente en Tokio.
    const notes = rowNotesOf([activeMember, pendingLink, inactiveReactivable, released], {
      timezone: "Asia/Tokyo",
      weekStart: 1,
      formats: { time: "24h", date: "yyyy-MM-dd" },
    });

    expect(notes).toEqual({
      [pendingLink.membershipId]:
        "Vinculación pedida el 2026-10-13, vence el 2026-10-20: la próxima cuenta de Google nueva con este correo reemplaza a la actual.",
      [inactiveReactivable.membershipId]: "Sin cuenta de Google vinculada.",
    });
  });
});
