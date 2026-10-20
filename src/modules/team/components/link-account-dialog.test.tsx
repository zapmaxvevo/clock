import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { teamView, type TeamMember } from "@/modules/team/schema";
import { buttonsOf, textOf } from "@/test/markup";

import { LinkAccountConfirmation } from "./link-account-dialog";
import { linkConfirmationOf, type LinkRequest } from "./team-members-model";

/** Una fila de la vista, validada con el esquema de la vista. */
function memberOf(fields: Partial<TeamMember>): TeamMember {
  const view = teamView.parse({
    kind: "ready",
    linkTtlDays: 7,
    members: [
      {
        membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
        name: "Ana Pérez",
        email: "ana@empresa.com",
        role: "member",
        isSelf: false,
        change: null,
        status: "inactive",
        hasAccount: false,
        statusChange: "reactivate",
        link: null,
        linkActions: [],
        registersExternal: false,
        canReleaseEmail: true,
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

function render(request: LinkRequest): string {
  return renderToStaticMarkup(
    <Dialog open>
      <LinkAccountConfirmation
        confirmation={linkConfirmationOf(request, 7)}
        onConfirm={() => undefined}
      />
    </Dialog>,
  );
}

const firstBody =
  "En los próximos 7 días, la próxima cuenta de Google que entre con ana@empresa.com va a quedar vinculada a Ana Pérez, con su rol y sus horas. Hacelo solo si ese correo sigue siendo suyo.";

describe("LinkAccountConfirmation", () => {
  it("D-E2b-5: «Reactivar» sin cuenta, con el título de reactivar, el texto de la primera cuenta y «Reactivar»", () => {
    const markup = render({ member: memberOf({}), reactivate: true });

    expect(markup).toMatch(/<h2[^>]*>¿Reactivar a Ana Pérez\?<\/h2>/);
    expect(textOf(markup)).toContain(firstBody);
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Reactivar"]);
  });

  it("«Vincular una cuenta de Google» sin cuenta, con su título y «Vincular»", () => {
    const member = memberOf({
      status: "active",
      statusChange: "deactivate",
      linkActions: ["request"],
      canReleaseEmail: false,
    });
    const markup = render({ member, reactivate: false });

    expect(markup).toMatch(/<h2[^>]*>¿Vincular una cuenta de Google a Ana Pérez\?<\/h2>/);
    expect(textOf(markup)).toContain(firstBody);
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Vincular"]);
  });

  it("«Vincular otra cuenta de Google» con cuenta: reemplaza a la actual, que sigue entrando hasta entonces", () => {
    const member = memberOf({
      status: "active",
      hasAccount: true,
      statusChange: "deactivate",
      linkActions: ["request"],
      canReleaseEmail: false,
    });
    const markup = render({ member, reactivate: false });

    expect(markup).toMatch(
      /<h2[^>]*>¿Vincular otra cuenta de Google a Ana Pérez\?<\/h2>/,
    );
    expect(textOf(markup)).toContain(
      "En los próximos 7 días, la próxima cuenta de Google nueva que entre con ana@empresa.com va a reemplazar a la actual, con el rol y las horas de Ana Pérez. Hasta entonces, la cuenta actual sigue entrando. Hacelo solo si ese correo sigue siendo suyo.",
    );
    expect(buttonsOf(markup).map(textOf)).toEqual(["Cancelar", "Vincular"]);
  });

  it("sin `registersExternal`, sin el párrafo del externo", () => {
    expect(textOf(render({ member: memberOf({}), reactivate: true }))).not.toContain(
      "invitado externo",
    );
  });

  it("D-E2b-8: con `registersExternal`, el párrafo del externo después del texto, dentro de la descripción", () => {
    const member = memberOf({ email: "ana@otro.com", registersExternal: true });
    const markup = render({ member, reactivate: true });
    const external =
      "ana@otro.com queda registrado como invitado externo, y sigue registrado aunque después canceles la vinculación o venza. Si Ana Pérez ya tiene una cuenta de Google vinculada, vuelve a entrar con ella desde ahora.";

    expect(textOf(markup)).toContain(external);
    // Los dos párrafos, en una sola descripción: la que nombra el diálogo.
    expect(markup.match(/data-slot="dialog-description"/g)).toHaveLength(1);
    expect(markup).toMatch(
      /<div[^>]*data-slot="dialog-description"[^>]*><p>En los próximos 7 días.*?<\/p><p>ana@otro\.com queda registrado.*?<\/p><\/div>/,
    );
  });

  it("«Vincular» o «Reactivar» no es destructivo: el botón por omisión", () => {
    const [, confirm] = buttonsOf(render({ member: memberOf({}), reactivate: true }));

    expect(confirm).not.toContain("bg-destructive");
  });
});
