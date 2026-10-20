import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { teamView, type TeamMember } from "@/modules/team/schema";
import { buttonsOf, textOf } from "@/test/markup";

import { MemberActionsMenu, MemberActionsMenuItems } from "./member-actions-menu";
import type { MenuEntry } from "./team-members-model";

/** Una fila de la vista, validada con el esquema de la vista. */
function memberOf(): TeamMember {
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
        statusChange: "deactivate",
        link: null,
        linkActions: [],
        registersExternal: false,
        canReleaseEmail: false,
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
      entries={["deactivate", "requestOtherLink"]}
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

/** Las entradas del menú abierto, sin el portal. */
function renderItems(entries: readonly MenuEntry[], pending: boolean): string {
  return renderToStaticMarkup(
    <DropdownMenu open>
      <MemberActionsMenuItems
        member={member}
        entries={entries}
        pending={pending}
        onChoose={() => undefined}
      />
    </DropdownMenu>,
  );
}

/** Las entradas de `markup`, cada una con su apertura y su contenido. */
function itemsOf(markup: string): string[] {
  return markup.match(/<div[^>]*role="menuitem"[^>]*>.*?<\/div>/g) ?? [];
}

describe("MemberActionsMenuItems", () => {
  it("§5.3 de E2b: una entrada por cada una de `menuEntriesOf`, en ese orden y con su rótulo", () => {
    const items = itemsOf(
      renderItems(
        [
          "deactivate",
          "reactivate",
          "requestLink",
          "requestOtherLink",
          "renewLink",
          "cancelLink",
          "releaseEmail",
        ],
        false,
      ),
    );

    expect(items.map(textOf)).toEqual([
      "Desactivar",
      "Reactivar",
      "Vincular una cuenta de Google",
      "Vincular otra cuenta de Google",
      "Volver a pedir la vinculación",
      "Cancelar la vinculación",
      "Liberar el correo",
    ]);
  });

  it("sin pedido, ninguna entrada inactiva", () => {
    expect(renderItems(["reactivate", "releaseEmail"], false)).not.toMatch(
      /aria-disabled=/,
    );
  });

  it("con un pedido en curso, todas en aria-disabled y ninguna con disabled", () => {
    const items = itemsOf(renderItems(["reactivate", "releaseEmail"], true));

    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item).toContain('aria-disabled="true"');
      expect(item).not.toMatch(/\sdisabled(=|\s|>)/);
    }
  });
});
