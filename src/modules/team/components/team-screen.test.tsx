import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { teamView, type TeamActions } from "@/modules/team/schema";
import { bodyRows, buttonsOf, textOf } from "@/test/markup";

import { TEAM_HEADING_ID } from "./team-members-model";
import { TeamScreen } from "./team-screen";

/** Doble escrito a mano: el marcado inicial no llama a la action. */
const actions: TeamActions = {
  changeRole: () => Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
};

/** Las cinco filas posibles, en un orden que no es el alfabético: la vista ya viene ordenada. */
const ready = teamView.parse({
  kind: "ready",
  members: [
    {
      membershipId: "0e5c7d1a-8f42-4c4b-9a51-1d2f3e4a5b61",
      name: "Olga",
      email: "olga@empresa.com",
      role: "owner",
      isSelf: false,
      change: null,
    },
    {
      membershipId: "1f6d8e2b-9a53-4d5c-8b62-2e3a4f5b6c72",
      name: "Diego",
      email: "diego@empresa.com",
      role: "admin",
      isSelf: true,
      change: "demote",
    },
    {
      membershipId: "2a7e9f3c-ab64-4e6d-9c73-3f4b5a6c7d83",
      name: "Mara",
      email: "mara@empresa.com",
      role: "member",
      isSelf: false,
      change: "promote",
    },
    {
      membershipId: "3b8fa04d-bc75-4f7e-8d84-4a5c6b7d8e94",
      name: "Pablo",
      email: "pablo@empresa.com",
      role: "project_manager",
      isSelf: false,
      change: null,
    },
    {
      membershipId: "4c9ab15e-cd86-4a8f-9e95-5b6d7c8e9fa5",
      name: "Tina",
      email: "tina@empresa.com",
      role: "team_manager",
      isSelf: false,
      change: null,
    },
  ],
});

function render(view: unknown): string {
  return renderToStaticMarkup(
    <TeamScreen view={teamView.parse(view)} actions={actions} />,
  );
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

  it("lista: la tabla nombrada por el título, con la introducción y las tres columnas", () => {
    const markup = render(ready);

    expect(markup).toContain(`<h1 id="${TEAM_HEADING_ID}"`);
    expect(markup).toContain(`<table aria-labelledby="${TEAM_HEADING_ID}"`);
    expect(textOf(markup)).toContain(
      "Un administrador ve las horas de todas las personas en los reportes y cambia roles. El rol del propietario no se cambia.",
    );
    const head = markup.slice(markup.indexOf("<thead"), markup.indexOf("</thead>"));
    expect(head.match(/<th scope="col"[^>]*>(.*?)<\/th>/g)?.map(textOf)).toEqual([
      "Persona",
      "Rol",
      "Cambiar rol",
    ]);
  });

  it("las filas en el orden recibido, con «(vos)», el email, el rótulo del rol y el texto del botón", () => {
    expect(bodyRows(render(ready))).toEqual([
      ["Olgaolga@empresa.com", "Propietario", ""],
      ["Diego (vos)diego@empresa.com", "Administrador", "Quitar administrador"],
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

  it("«(vos)» solo en la fila de quien mira", () => {
    const markup = render(ready);

    expect(textOf(rowOf(markup, "Diego"))).toContain("(vos)");
    expect(textOf(markup).match(/\(vos\)/g)).toHaveLength(1);
  });

  it("sin pedido ni desenlace, ningún aviso ni botón inactivo", () => {
    const markup = render(ready);

    expect(markup).not.toMatch(/role="(alert|status)"/);
    expect(markup).not.toMatch(/\saria-disabled=/);
  });
});
