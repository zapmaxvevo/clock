import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { teamView, type TeamMember } from "@/modules/team/schema";
import type { PendingInvitation } from "@/modules/workspace/schema";
import { bodyRows, buttonsOf, textOf } from "@/test/markup";

import { TeamMembersView } from "./team-members";
import type { TeamFeedback } from "./team-members-model";

/** Como la ve el owner: un member con `promote` y un admin ajeno con `demote`. */
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
    },
    {
      membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
      name: "Bruno",
      email: "bruno@empresa.com",
      role: "admin",
      isSelf: false,
      change: "demote",
      status: "active",
      hasAccount: true,
      statusChange: null,
    },
  ],
});
const members: readonly TeamMember[] = view.kind === "ready" ? view.members : [];

/** Una invitada del dominio y una externa, en el orden del correo. */
const invitations: readonly PendingInvitation[] = [
  {
    id: "6ebcd370-ef08-4cab-9a07-7d8e9fa0bc27",
    email: "carla@empresa.com",
    external: false,
  },
  { id: "7fcde481-f019-4dbc-8b18-8e9fa0b1cd38", email: "nico@otro.com", external: true },
];

function render(
  pending: boolean,
  feedback: TeamFeedback | null,
  rows: readonly PendingInvitation[] = invitations,
  people: readonly TeamMember[] = members,
  empty: string | null = null,
): string {
  return renderToStaticMarkup(
    <TeamMembersView
      members={people}
      invitations={rows}
      pending={pending}
      feedback={feedback}
      empty={empty}
      onActivate={() => undefined}
      onChooseStatus={() => undefined}
      onRevoke={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

/**
 * Como la ve el owner con E2: una activa con los dos controles, una inactiva
 * con cuenta («Reactivar») y una inactiva sin cuenta, sin menú (D-E2-7).
 */
const statusView = teamView.parse({
  kind: "ready",
  members: [
    {
      membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
      name: "Dora",
      email: "dora@empresa.com",
      role: "member",
      isSelf: false,
      change: "promote",
      status: "active",
      hasAccount: true,
      statusChange: "deactivate",
    },
    {
      membershipId: "3b8fa04d-bc75-4f7e-8d84-4a5c6b7d8e94",
      name: "Ema",
      email: "ema@empresa.com",
      role: "admin",
      isSelf: false,
      change: null,
      status: "inactive",
      hasAccount: true,
      statusChange: "reactivate",
    },
    {
      membershipId: "4c9ab15e-cd86-4a8f-9e95-5b6d7c8e9fa5",
      name: "Fede",
      email: "fede@empresa.com",
      role: "member",
      isSelf: false,
      change: null,
      status: "inactive",
      hasAccount: false,
      statusChange: null,
    },
  ],
});
const statusMembers: readonly TeamMember[] =
  statusView.kind === "ready" ? statusView.members : [];

/** La fila del cuerpo de la tabla cuyo encabezado empieza con `name`. */
function rowOf(markup: string, name: string): string {
  const rows = markup.match(/<tr[^>]*><th scope="row".*?<\/tr>/g) ?? [];
  return rows.find((row) => textOf(row).startsWith(name)) ?? "";
}

describe("TeamMembersView", () => {
  it("sin pedido ni aviso, ningún botón inactivo y ningún aviso", () => {
    const markup = render(false, null);

    expect(buttonsOf(markup)).toHaveLength(4);
    expect(markup).not.toMatch(/\saria-disabled=/);
    expect(markup).not.toMatch(/role="(alert|status)"/);
  });

  it("con un pedido en curso, los botones de rol y de revocar con aria-disabled y ninguno con disabled", () => {
    const buttons = buttonsOf(render(true, null));

    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it("con un error que se reintenta, el aviso con el título, el cuerpo y «Reintentar»", () => {
    const markup = render(false, {
      tone: "error",
      title: "No se pudo cambiar el rol de Ana.",
      message: "Revisá la conexión y volvé a intentar.",
      retry: true,
    });
    const alert = markup.slice(0, markup.indexOf("<table"));

    expect(alert).toContain('role="alert"');
    expect(textOf(alert)).toContain("No se pudo cambiar el rol de Ana.");
    expect(textOf(alert)).toContain("Revisá la conexión y volvé a intentar.");
    expect(textOf(alert)).toContain("Reintentar");
  });

  it("con un error que no se reintenta, el aviso sin «Reintentar»", () => {
    const markup = render(false, {
      tone: "error",
      title: "No se pudo cambiar el rol de Ana.",
      message: "Esa persona ya no está en el equipo.",
      retry: false,
    });

    expect(markup).toContain('role="alert"');
    expect(textOf(markup)).toContain("Esa persona ya no está en el equipo.");
    expect(textOf(markup)).not.toContain("Reintentar");
  });

  it("con un cambio, un aviso de estado sin «Reintentar»", () => {
    const markup = render(false, {
      tone: "info",
      title: "Rol de Ana: Administrador.",
      retry: false,
    });

    expect(markup).toContain('role="status"');
    expect(markup).not.toContain('role="alert"');
    expect(textOf(markup)).toContain("Rol de Ana: Administrador.");
    expect(textOf(markup)).not.toContain("Reintentar");
  });

  it("las invitadas van después de las personas, con sus marcas, «Miembro» y «Revocar invitación»", () => {
    expect(bodyRows(render(false, null))).toEqual([
      ["Anaana@empresa.com", "Miembro", "Hacer administrador"],
      ["Brunobruno@empresa.com", "Administrador", "Quitar administrador"],
      ["carla@empresa.comInvitada", "Miembro", "Revocar invitación"],
      ["nico@otro.comInvitadaExterna", "Miembro", "Revocar invitación"],
    ]);
  });

  it("«Revocar invitación» nombra el correo y lleva el id al que vuelve el foco", () => {
    const markup = render(false, null);
    const revoke = buttonsOf(markup).filter(
      (button) => textOf(button) === "Revocar invitación",
    );

    expect(revoke).toHaveLength(2);
    expect(revoke[0]).toContain('aria-label="Revocar invitación: carla@empresa.com"');
    expect(revoke[0]).toContain(`id="revocar-${invitations[0]?.id ?? ""}"`);
    expect(revoke[1]).toContain('aria-label="Revocar invitación: nico@otro.com"');
  });

  it("el correo de la invitada es el encabezado de su fila", () => {
    const markup = render(false, null);

    expect(markup).toMatch(/<th scope="row"[^>]*>.*?nico@otro\.com.*?<\/th>/);
  });

  it("sin invitadas, solo las filas de las personas", () => {
    const markup = render(false, null, []);

    expect(bodyRows(markup)).toHaveLength(2);
    expect(textOf(markup)).not.toContain("Invitada");
  });

  it("con una revocación fallida, el aviso nombra el correo", () => {
    const markup = render(false, {
      tone: "error",
      title: "No se pudo revocar la invitación de nico@otro.com.",
      message: "Esa invitación ya no está pendiente.",
      retry: false,
    });

    expect(markup).toContain('role="alert"');
    expect(textOf(markup)).toContain(
      "No se pudo revocar la invitación de nico@otro.com.",
    );
    expect(textOf(markup)).toContain("Esa invitación ya no está pendiente.");
  });

  it("EQ-05: la inactiva, con el nombre tachado y «(inactiva)» después, sin tachar y en texto", () => {
    const row = rowOf(render(false, null, [], statusMembers), "Ema");

    expect(row).toMatch(
      /<span class="line-through">Ema<\/span><span class="[^"]*text-muted-foreground[^"]*"> \(inactiva\)<\/span>/,
    );
    expect(textOf(row)).toContain("Ema (inactiva)");
  });

  it("la activa, sin tachado ni «(inactiva)»", () => {
    const row = rowOf(render(false, null, [], statusMembers), "Dora");

    expect(row).not.toContain("line-through");
    expect(textOf(row)).not.toContain("(inactiva)");
  });

  it("D-E2-7: «Sin cuenta de Google vinculada.» solo debajo del correo de la inactiva sin cuenta", () => {
    const markup = render(false, null, [], statusMembers);

    expect(rowOf(markup, "Fede")).toMatch(
      /fede@empresa\.com<\/span><span class="text-muted-foreground">Sin cuenta de Google vinculada\.<\/span>/,
    );
    expect(textOf(markup).match(/Sin cuenta de Google vinculada\./g)).toHaveLength(1);
  });

  it("EQ-37: la inactiva muestra su rol sin botón", () => {
    expect(bodyRows(render(false, null, [], statusMembers))).toEqual([
      ["Doradora@empresa.com", "Miembro", "Hacer administrador"],
      ["Ema (inactiva)ema@empresa.com", "Administrador", ""],
      ["Fede (inactiva)fede@empresa.comSin cuenta de Google vinculada.", "Miembro", ""],
    ]);
  });

  it("D-E2-9: el menú solo con `statusChange`, a la derecha del botón de rol, nombrado con la persona", () => {
    const markup = render(false, null, [], statusMembers);

    const dora = buttonsOf(rowOf(markup, "Dora"));
    expect(dora).toHaveLength(2);
    expect(dora[0]).toContain('aria-label="Hacer administrador: Dora"');
    expect(dora[1]).toContain('aria-label="Acciones de Dora"');
    expect(dora[1]).toContain('aria-haspopup="menu"');

    const ema = buttonsOf(rowOf(markup, "Ema"));
    expect(ema).toHaveLength(1);
    expect(ema[0]).toContain('aria-label="Acciones de Ema"');

    expect(buttonsOf(rowOf(markup, "Fede"))).toEqual([]);
  });

  it("con un pedido en curso, los menús también con aria-disabled y ninguno con disabled", () => {
    const buttons = buttonsOf(render(true, null, invitations, statusMembers));

    // Dora: rol y menú; Ema: menú; dos «Revocar invitación».
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button).toContain('aria-disabled="true"');
      expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });

  it("con un cambio de estado, el aviso de estado con el nombre", () => {
    const markup = render(
      false,
      { tone: "info", title: "Desactivaste a Dora.", retry: false },
      [],
      statusMembers,
    );

    expect(markup).toContain('role="status"');
    expect(textOf(markup)).toContain("Desactivaste a Dora.");
  });

  it("EQ-94: el vacío va en lugar de la tabla, y el aviso sigue encima", () => {
    const markup = render(
      false,
      { tone: "info", title: "Invitación de nico@otro.com revocada.", retry: false },
      [],
      [],
      "No hay invitaciones pendientes.",
    );

    expect(markup).not.toContain("<table");
    expect(markup).toContain('role="status"');
    expect(markup.indexOf("Invitación de nico@otro.com revocada.")).toBeLessThan(
      markup.indexOf("No hay invitaciones pendientes."),
    );
    expect(markup).toMatch(/<p[^>]*>No hay invitaciones pendientes\.<\/p>/);
  });
});
