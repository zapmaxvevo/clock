import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { teamView, type TeamMember } from "@/modules/team/schema";
import { buttonsOf, textOf } from "@/test/markup";

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

function render(pending: boolean, feedback: TeamFeedback | null): string {
  return renderToStaticMarkup(
    <TeamMembersView
      members={members}
      pending={pending}
      feedback={feedback}
      onActivate={() => undefined}
      onRetry={() => undefined}
    />,
  );
}

describe("TeamMembersView", () => {
  it("sin pedido ni aviso, ningún botón inactivo y ningún aviso", () => {
    const markup = render(false, null);

    expect(buttonsOf(markup)).toHaveLength(2);
    expect(markup).not.toMatch(/\saria-disabled=/);
    expect(markup).not.toMatch(/role="(alert|status)"/);
  });

  it("con un pedido en curso, todos los botones con aria-disabled y ninguno con disabled", () => {
    const buttons = buttonsOf(render(true, null));

    expect(buttons).toHaveLength(2);
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
});
