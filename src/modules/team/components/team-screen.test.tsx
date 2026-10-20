import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { teamView, type TeamActions, type TeamFilter } from "@/modules/team/schema";
import type { InvitationActions, InvitationsView } from "@/modules/workspace/schema";
import type { TimeSettings } from "@/server/time";
import { bodyRows, buttonsOf, textOf } from "@/test/markup";

import { TEAM_HEADING_ID } from "./team-members-model";
import { TeamScreen } from "./team-screen";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }));

/** Doble escrito a mano: el marcado inicial no llama a las actions. */
const actions: TeamActions & InvitationActions = {
  changeRole: () => Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  changeStatus: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  setAccountLink: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  releaseEmail: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  inviteMembers: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  revokeInvitation: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
};

/** Quien mira, en Buenos Aires y con el día primero (PF-11, PF-12). */
const SETTINGS: TimeSettings = {
  timezone: "America/Argentina/Buenos_Aires",
  weekStart: 1,
  formats: { time: "24h", date: "dd/MM/yyyy" },
};

const noInvitations: InvitationsView = {
  kind: "ready",
  invitations: [],
  appUrl: "https://clock.empresa.com",
};

const withInvitations: InvitationsView = {
  kind: "ready",
  invitations: [
    {
      id: "6ebcd370-ef08-4cab-9a07-7d8e9fa0bc27",
      email: "carla@empresa.com",
      external: false,
    },
    {
      id: "7fcde481-f019-4dbc-8b18-8e9fa0b1cd38",
      email: "nico@otro.com",
      external: true,
    },
  ],
  appUrl: "https://clock.empresa.com",
};

/** Quien mira, solo en el equipo (EQ-93). */
const alone = teamView.parse({
  kind: "ready",
  linkTtlDays: 7,
  members: [
    {
      membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
      name: "Olga",
      email: "olga@empresa.com",
      role: "owner",
      isSelf: true,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
  ],
});

/**
 * Como la ve el owner, con los cinco roles, en un orden que no es el
 * alfabético: la vista ya viene ordenada.
 */
const ready = teamView.parse({
  kind: "ready",
  linkTtlDays: 7,
  members: [
    {
      membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
      name: "Olga",
      email: "olga@empresa.com",
      role: "owner",
      isSelf: true,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
      name: "Diego",
      email: "diego@empresa.com",
      role: "admin",
      isSelf: false,
      change: "demote",
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
      name: "Mara",
      email: "mara@empresa.com",
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
    },
    {
      membershipId: "3b8fa04d-bc75-4f7e-8d84-4a5c6b7d8e94",
      name: "Pablo",
      email: "pablo@empresa.com",
      role: "project_manager",
      isSelf: false,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "4c9ab15e-cd86-4a8f-9e95-5b6d7c8e9fa5",
      name: "Tina",
      email: "tina@empresa.com",
      role: "team_manager",
      isSelf: false,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
  ],
});

/** Como la ve un admin: ningún admin tiene control, tampoco el propio (D-R8-5). */
const readyForAdmin = teamView.parse({
  kind: "ready",
  linkTtlDays: 7,
  members: [
    {
      membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
      name: "Diego",
      email: "diego@empresa.com",
      role: "admin",
      isSelf: true,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "5dabc26f-de97-4b9a-8fa6-6c7e8d9fab16",
      name: "Elena",
      email: "elena@empresa.com",
      role: "admin",
      isSelf: false,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
      name: "Mara",
      email: "mara@empresa.com",
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
    },
  ],
});

function render(
  view: unknown,
  invitations: InvitationsView | null = noInvitations,
  filter: TeamFilter = "activas",
): string {
  return renderToStaticMarkup(
    <TeamScreen
      view={teamView.parse(view)}
      invitations={invitations}
      filter={filter}
      settings={SETTINGS}
      actions={actions}
    />,
  );
}

/**
 * Como la ve el owner con E2: quien mira, una activa y dos inactivas, una sin
 * cuenta, en el orden de `compareNames` sin mirar el estado.
 */
const withInactive = teamView.parse({
  kind: "ready",
  linkTtlDays: 7,
  members: [
    {
      membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
      name: "Olga",
      email: "olga@empresa.com",
      role: "owner",
      isSelf: true,
      change: null,
      status: "active",
      hasAccount: true,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "5dabc26f-de97-4b9a-8fa6-6c7e8d9fab16",
      name: "Elena",
      email: "elena@empresa.com",
      role: "member",
      isSelf: false,
      change: null,
      status: "inactive",
      hasAccount: false,
      statusChange: null,
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
    {
      membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
      name: "Mara",
      email: "mara@empresa.com",
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
    },
    {
      membershipId: "4c9ab15e-cd86-4a8f-9e95-5b6d7c8e9fa5",
      name: "Tina",
      email: "tina@empresa.com",
      role: "admin",
      isSelf: false,
      change: null,
      status: "inactive",
      hasAccount: true,
      statusChange: "reactivate",
      link: null,
      linkActions: [],
      registersExternal: false,
      canReleaseEmail: false,
    },
  ],
});

/** Los encabezados de fila del cuerpo, sin marcas. */
function rowNames(markup: string): string[] {
  return bodyRows(markup).map(([person]) => person ?? "");
}

/** Los botones fuera de la tabla con el texto «Invitar». */
function inviteButtons(markup: string): string[] {
  const outside =
    markup.slice(0, markup.indexOf("<table")) + markup.slice(markup.indexOf("</table>"));
  return buttonsOf(outside).filter((button) => textOf(button) === "Invitar");
}

/** La fila del cuerpo de la tabla cuyo encabezado empieza con `name`. */
function rowOf(markup: string, name: string): string {
  const rows = markup.match(/<tr[^>]*><th scope="row".*?<\/tr>/g) ?? [];
  return rows.find((row) => textOf(row).startsWith(name)) ?? "";
}

describe("TeamScreen", () => {
  it("sin permiso por el rol, el título y el párrafo, sin tabla", () => {
    const markup = render({ kind: "forbidden", reason: "role" });

    expect(markup).toMatch(/<h1[^>]*>Equipo<\/h1>/);
    expect(textOf(markup)).toContain("No tenés permiso para administrar el equipo.");
    expect(markup).not.toContain("<table");
    expect(markup).not.toContain("Tu acceso al workspace está desactivado.");
  });

  it("con la membresía desactivada, el aviso común con el cuerpo de la pantalla", () => {
    const markup = render({ kind: "forbidden", reason: "inactive" });
    const text = textOf(markup);

    expect(markup).toMatch(/<h1[^>]*>Equipo<\/h1>/);
    expect(text).toContain("Tu acceso al workspace está desactivado.");
    expect(text).toContain("No podés administrar el equipo.");
    expect(text).not.toContain("No tenés permiso para administrar el equipo.");
    expect(markup).not.toContain("<table");
  });

  it("el título recibe el foco por código: adonde va después de revocar", () => {
    expect(render(ready)).toMatch(
      new RegExp(`<h1 id="${TEAM_HEADING_ID}" tabindex="-1"`),
    );
  });

  it("lista: la tabla nombrada por el título, con la introducción y las tres columnas", () => {
    const markup = render(ready);

    expect(markup).toContain(`<h1 id="${TEAM_HEADING_ID}"`);
    expect(markup).toContain(`<table aria-labelledby="${TEAM_HEADING_ID}"`);
    expect(textOf(markup)).toContain(
      "Un administrador ve las horas de todas las personas en los reportes y puede hacer administradoras a otras personas. Solo el propietario quita el rol de administrador, y el suyo no se cambia. Solo el propietario desactiva, reactiva, vincula la cuenta o libera el correo de un administrador.",
    );
    const head = markup.slice(markup.indexOf("<thead"), markup.indexOf("</thead>"));
    expect(head.match(/<th scope="col"[^>]*>(.*?)<\/th>/g)?.map(textOf)).toEqual([
      "Persona",
      "Rol",
      "Acciones",
    ]);
  });

  it("las filas en el orden recibido, con «(vos)», el email, el rótulo del rol y el texto del botón", () => {
    expect(bodyRows(render(ready))).toEqual([
      ["Olga (vos)olga@empresa.com", "Propietario", ""],
      ["Diegodiego@empresa.com", "Administrador", "Quitar administrador"],
      ["Maramara@empresa.com", "Miembro", "Hacer administrador"],
      ["Pablopablo@empresa.com", "Responsable de proyectos", ""],
      ["Tinatina@empresa.com", "Responsable de equipo", ""],
    ]);
  });

  it("el nombre es el encabezado de su fila, y el email va aparte del nombre", () => {
    const row = rowOf(render(ready), "Mara");

    expect(row).toMatch(/<th scope="row"[^>]*>.*Mara.*<\/th>/);
    expect(row).toMatch(/>Mara<\/span>/);
    expect(row).toMatch(/>mara@empresa\.com<\/span>/);
  });

  it("el botón solo en las filas con `change`, nombrado con la acción y la persona", () => {
    const markup = render(ready);

    expect(buttonsOf(rowOf(markup, "Olga"))).toEqual([]);
    expect(buttonsOf(rowOf(markup, "Pablo"))).toEqual([]);
    expect(buttonsOf(rowOf(markup, "Tina"))).toEqual([]);

    const [promote] = buttonsOf(rowOf(markup, "Mara"));
    expect(promote).toContain('aria-label="Hacer administrador: Mara"');
    expect(textOf(promote ?? "")).toBe("Hacer administrador");

    const [demote] = buttonsOf(rowOf(markup, "Diego"));
    expect(demote).toContain('aria-label="Quitar administrador: Diego"');
    expect(textOf(demote ?? "")).toBe("Quitar administrador");

    expect(buttonsOf(markup.slice(markup.indexOf("<table")))).toHaveLength(2);
  });

  it("para un admin, ningún botón en las filas de admin, tampoco en la propia", () => {
    const markup = render(readyForAdmin);

    expect(bodyRows(markup)).toEqual([
      ["Diego (vos)diego@empresa.com", "Administrador", ""],
      ["Elenaelena@empresa.com", "Administrador", ""],
      ["Maramara@empresa.com", "Miembro", "Hacer administrador"],
    ]);
    expect(buttonsOf(rowOf(markup, "Diego"))).toEqual([]);
    expect(buttonsOf(rowOf(markup, "Elena"))).toEqual([]);
    expect(buttonsOf(markup.slice(markup.indexOf("<table")))).toHaveLength(1);
  });

  it("cada encabezado de fila recibe el foco por código, con su id", () => {
    const headers = render(ready).match(/<th scope="row"[^>]*>/g) ?? [];
    const members = ready.kind === "ready" ? ready.members : [];

    expect(headers).toHaveLength(members.length);
    headers.forEach((header, index) => {
      expect(header).toContain('tabindex="-1"');
      expect(header).toContain(`id="persona-${members[index]?.membershipId ?? ""}"`);
    });
  });

  it("«(vos)» solo en la fila de quien mira", () => {
    const markup = render(ready);

    expect(textOf(rowOf(markup, "Olga"))).toContain("(vos)");
    expect(textOf(markup).match(/\(vos\)/g)).toHaveLength(1);
  });

  it("sin pedido ni desenlace, ningún aviso ni botón inactivo", () => {
    const markup = render(ready);

    expect(markup).not.toMatch(/role="(alert|status)"/);
    expect(markup).not.toMatch(/\saria-disabled=/);
  });

  it("con la vista de invitaciones lista, «Invitar» después del título", () => {
    const markup = render(ready);
    const [invite] = inviteButtons(markup);

    expect(invite).toBeDefined();
    expect(markup.indexOf(invite ?? "")).toBeGreaterThan(markup.indexOf("</h1>"));
    expect(markup.indexOf(invite ?? "")).toBeLessThan(markup.indexOf("<table"));
  });

  it("sin `member.invite`, la tabla sin «Invitar» ni invitadas", () => {
    const markup = render(ready, { kind: "forbidden" });

    expect(inviteButtons(markup)).toEqual([]);
    expect(bodyRows(markup)).toHaveLength(5);
  });

  it("sin la vista de team, las invitaciones no se dibujan", () => {
    const markup = render({ kind: "forbidden", reason: "role" }, null);

    expect(inviteButtons(markup)).toEqual([]);
    expect(textOf(markup)).not.toContain("Todavía no invitaste a nadie.");
  });

  it("las invitadas al final, después de las personas, con sus marcas", () => {
    const rows = bodyRows(render(ready, withInvitations));

    expect(rows.slice(5)).toEqual([
      ["carla@empresa.comInvitada", "Miembro", "Revocar invitación"],
      ["nico@otro.comInvitadaExterna", "Miembro", "Revocar invitación"],
    ]);
  });

  it("EQ-93: con quien mira solo y sin invitadas, el vacío con un segundo «Invitar» debajo de la tabla", () => {
    const markup = render(alone);
    const empty = markup.indexOf("Todavía no invitaste a nadie.");

    expect(empty).toBeGreaterThan(markup.indexOf("</table>"));
    expect(inviteButtons(markup)).toHaveLength(2);
  });

  it("sin el vacío si hay una invitada o si hay otra persona", () => {
    expect(textOf(render(alone, withInvitations))).not.toContain(
      "Todavía no invitaste a nadie.",
    );
    expect(textOf(render(ready))).not.toContain("Todavía no invitaste a nadie.");
    expect(inviteButtons(render(ready))).toHaveLength(1);
  });

  it("§5.2: el selector «Estado» va debajo de la introducción y antes de la tabla", () => {
    const markup = render(withInactive);
    const label = markup.search(/<label[^>]*>Estado<\/label>/);

    expect(label).toBeGreaterThan(markup.indexOf("Solo el propietario desactiva"));
    expect(label).toBeLessThan(markup.indexOf("<table"));
  });

  it("D-E2-8: «Activas», por omisión, sin las inactivas y con las invitadas", () => {
    expect(rowNames(render(withInactive, withInvitations))).toEqual([
      "Olga (vos)olga@empresa.com",
      "Maramara@empresa.com",
      "carla@empresa.comInvitada",
      "nico@otro.comInvitadaExterna",
    ]);
  });

  it("D-E2-8: «Inactivas», solo las inactivas, sin invitadas", () => {
    expect(rowNames(render(withInactive, withInvitations, "inactivas"))).toEqual([
      "Elena (inactiva)elena@empresa.comSin cuenta de Google vinculada.",
      "Tina (inactiva)tina@empresa.com",
    ]);
  });

  it("D-E2-8: «Invitadas», solo las invitadas", () => {
    expect(rowNames(render(withInactive, withInvitations, "invitadas"))).toEqual([
      "carla@empresa.comInvitada",
      "nico@otro.comInvitadaExterna",
    ]);
  });

  it("D-E2-8: «Todas», las personas en el orden de la vista sin mirar el estado, y las invitadas", () => {
    expect(rowNames(render(withInactive, withInvitations, "todas"))).toEqual([
      "Olga (vos)olga@empresa.com",
      "Elena (inactiva)elena@empresa.comSin cuenta de Google vinculada.",
      "Maramara@empresa.com",
      "Tina (inactiva)tina@empresa.com",
      "carla@empresa.comInvitada",
      "nico@otro.comInvitadaExterna",
    ]);
  });

  it("el selector dice el filtro de la página", () => {
    expect(render(withInactive, noInvitations, "invitadas")).toMatch(
      /data-slot="select-value"[^>]*>Invitadas<\/span>/,
    );
  });

  it("EQ-94: «Inactivas» sin ninguna, el párrafo en lugar de la tabla", () => {
    const markup = render(ready, withInvitations, "inactivas");

    expect(markup).not.toContain("<table");
    expect(textOf(markup)).toContain("No hay personas inactivas.");
    expect(textOf(markup)).not.toContain("Todavía no invitaste a nadie.");
  });

  it("EQ-94: «Invitadas» sin ninguna, el párrafo en lugar de la tabla", () => {
    const markup = render(withInactive, noInvitations, "invitadas");

    expect(markup).not.toContain("<table");
    expect(textOf(markup)).toContain("No hay invitaciones pendientes.");
  });

  it("EQ-93 también con «Todas»", () => {
    expect(textOf(render(alone, noInvitations, "todas"))).toContain(
      "Todavía no invitaste a nadie.",
    );
  });

  it("EQ-93: una inactiva cuenta como otra persona, aunque «Activas» muestre solo a quien mira", () => {
    const onlyInactive = teamView.parse({
      kind: "ready",
      linkTtlDays: 7,
      members: [
        ...(alone.kind === "ready" ? alone.members : []),
        ...(withInactive.kind === "ready"
          ? withInactive.members.filter((member) => member.name === "Elena")
          : []),
      ],
    });
    const markup = render(onlyInactive);

    expect(rowNames(markup)).toEqual(["Olga (vos)olga@empresa.com"]);
    expect(textOf(markup)).not.toContain("Todavía no invitaste a nadie.");
  });

  it("sin la vista de team, sin selector", () => {
    expect(render({ kind: "forbidden", reason: "role" }, null)).not.toContain(
      ">Estado</label>",
    );
  });

  it("§5.2 de E2b: la nota de la fila, con el día y el formato de quien mira", () => {
    const linked = teamView.parse({
      kind: "ready",
      linkTtlDays: 7,
      members: [
        {
          membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
          name: "Olga",
          email: "olga@empresa.com",
          role: "owner",
          isSelf: true,
          change: null,
          status: "active",
          hasAccount: true,
          statusChange: null,
          // 01:30 UTC del 13 es la noche del 12 en Buenos Aires.
          link: {
            requestedAt: new Date("2026-10-13T01:30:00.000Z"),
            expiresAt: new Date("2026-10-20T01:30:00.000Z"),
            expired: false,
          },
          linkActions: ["cancel"],
          registersExternal: false,
          canReleaseEmail: false,
        },
      ],
    });

    expect(textOf(rowOf(render(linked), "Olga"))).toContain(
      "Vinculación pedida el 12/10/2026, vence el 19/10/2026: la próxima cuenta de Google nueva con este correo reemplaza a la actual.",
    );
  });
});
