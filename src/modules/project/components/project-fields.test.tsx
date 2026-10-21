import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { textOf } from "@/test/markup";

import { emptyProjectDraft, ProjectFields, type ProjectDraft } from "./project-fields";

const acme = { id: "c-acme", name: "Acme" };
const legacy = { id: "c-legacy", name: "Legado SA" };

function render(
  draft: ProjectDraft,
  mode: "create" | "update",
  archivedClient: { id: string; name: string } | null = null,
): string {
  return renderToStaticMarkup(
    <ProjectFields
      draft={draft}
      onChange={() => undefined}
      clients={[acme]}
      mode={mode}
      archivedClient={archivedClient}
    />,
  );
}

/** El grupo de los colores, con su apertura. */
function colorGroupOf(markup: string): string {
  return markup.match(/<div[^>]*role="radiogroup"[^>]*>/)?.[0] ?? "";
}

/** Lo que muestra el disparador del selector de cliente. */
function clientTriggerOf(markup: string): string {
  return textOf(markup.match(/<button[^>]*>.*?<\/button>/)?.[0] ?? "");
}

const saved: ProjectDraft = {
  name: "Web",
  clientId: "c-legacy",
  color: "teal",
  note: "Sitio",
  billableByDefault: true,
};

describe("ProjectFields", () => {
  it("en el alta, el color lleva la ayuda de PR-15 y nada elegido", () => {
    const markup = render(emptyProjectDraft("Nuevo"), "create");

    expect(markup).toContain("Si no elegís uno, se asigna automáticamente.");
    expect(colorGroupOf(markup)).toContain("aria-describedby=");
    expect(markup).not.toMatch(/role="radio"[^>]*aria-checked="true"/);
    expect(markup).toMatch(/<input[^>]*value="Nuevo"/);
    expect(clientTriggerOf(markup)).toBe("Sin cliente");
  });

  it("en la edición, sin la ayuda del color y con los valores guardados", () => {
    const markup = render({ ...saved, clientId: "c-acme" }, "update");

    expect(markup).not.toContain("Si no elegís uno, se asigna automáticamente.");
    expect(colorGroupOf(markup)).not.toContain("aria-describedby=");
    expect(markup).toMatch(
      /aria-label="Verde azulado"[^>]*aria-checked="true"|aria-checked="true"[^>]*aria-label="Verde azulado"/,
    );
    expect(markup).toMatch(/<input[^>]*value="Web"/);
    expect(markup).toContain(">Sitio</textarea>");
    expect(clientTriggerOf(markup)).toBe("Acme");
  });

  it("en la edición, el cliente archivado del proyecto aparece con «(archivado)» (D-P1-9)", () => {
    const markup = render(saved, "update", legacy);

    expect(clientTriggerOf(markup)).toBe("Legado SA (archivado)");
  });
});
