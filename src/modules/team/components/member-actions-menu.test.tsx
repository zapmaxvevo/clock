import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { teamView, type TeamMember } from "@/modules/team/schema";
import { buttonsOf, textOf } from "@/test/markup";

import { MemberActionsMenu } from "./member-actions-menu";

/** Una fila de la vista, validada con el esquema de la vista. */
function memberOf(): TeamMember {
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
        statusChange: "deactivate",
      },
    ],
  });
  const [member] = view.kind === "ready" ? view.members : [];
  if (member === undefined) {
    throw new Error("La vista de prueba tiene una fila.");
  }
  return member;
}

const member = memberOf();

function render(pending: boolean): string {
  return renderToStaticMarkup(
    <MemberActionsMenu
      member={member}
      action="deactivate"
      pending={pending}
      onChoose={() => undefined}
    />,
  );
}

describe("MemberActionsMenu", () => {
  it("un botón de menú nombrado con la persona, con el id al que vuelve el foco", () => {
    const [trigger, ...rest] = buttonsOf(render(false));

    expect(rest).toEqual([]);
    expect(trigger).toContain('aria-label="Acciones de Ana"');
    expect(trigger).toContain('aria-haspopup="menu"');
    expect(trigger).toContain(`id="acciones-${member.membershipId}"`);
    // Solo el ícono, que no se lee: el nombre es el `aria-label`.
    expect(textOf(trigger ?? "")).toBe("");
    expect(trigger).toMatch(/<svg[^>]*aria-hidden="true"/);
  });

  it("sin pedido, sin aria-disabled", () => {
    expect(render(false)).not.toMatch(/\saria-disabled=/);
  });

  it("con un pedido en curso, aria-disabled y nunca disabled: conserva el foco", () => {
    const [trigger] = buttonsOf(render(true));

    expect(trigger).toContain('aria-disabled="true"');
    expect(trigger).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});
