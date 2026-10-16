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
    },
    {
      membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
      name: "Bruno",
      email: "bruno@empresa.com",
      role: "admin",
      isSelf: false,
      change: "demote",
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
): string {
  return renderToStaticMarkup(
    <TeamMembersView
      members={members}
      invitations={rows}
      pending={pending}
      feedback={feedback}
      onActivate={() => undefined}
      onRevoke={() => undefined}
      onRetry={() => undefined}
    />,
  );
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
});
