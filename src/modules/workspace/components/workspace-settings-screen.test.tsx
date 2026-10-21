import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type {
  WorkspaceSettingsActions,
  WorkspaceSettingsView,
} from "@/modules/workspace/schema";
import { textOf } from "@/test/markup";

import { WorkspaceSettingsScreen } from "./workspace-settings-screen";

/** Doble escrito a mano: el marcado inicial no llama a la action. */
const actions: WorkspaceSettingsActions = {
  updateWorkspaceName: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
  updateWorkspaceSetting: () =>
    Promise.resolve({ ok: false, code: "unexpected", message: "doble" }),
};

function render(view: WorkspaceSettingsView): string {
  return renderToStaticMarkup(<WorkspaceSettingsScreen view={view} actions={actions} />);
}

const ready: WorkspaceSettingsView = {
  kind: "ready",
  name: "Estudio Norte",
  durationFormat: "compact",
};

/** Las secciones de la pantalla, cada una con su apertura y su contenido. */
function sectionsOf(markup: string): string[] {
  return markup.match(/<section[^>]*>.*?<\/section>/g) ?? [];
}

describe("WorkspaceSettingsScreen", () => {
  it("lista: el título y una sola sección, «General», nombrada por su `<h2>`", () => {
    const markup = render(ready);
    const sections = sectionsOf(markup);

    expect(markup).toMatch(/<h1[^>]*>Configuración del workspace<\/h1>/);
    expect(sections).toHaveLength(1);
    expect(sections[0]).toMatch(/^<section aria-labelledby="workspace-settings-general"/);
    expect(sections[0]).toMatch(/<h2 id="workspace-settings-general"[^>]*>General<\/h2>/);
    expect(markup.match(/<h2/g)).toHaveLength(1);
  });

  it("lista: «General» tiene el campo «Nombre del workspace» con el guardado, que corta en 100", () => {
    const [general] = sectionsOf(render(ready));
    const id = general?.match(
      /<label[^>]*for="([^"]+)"[^>]*>Nombre del workspace<\/label>/,
    )?.[1];
    const inputs = general?.match(/<input[^>]*>/g) ?? [];

    expect(id).toBeDefined();
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toContain(`id="${id ?? ""}"`);
    expect(inputs[0]).toContain('value="Estudio Norte"');
    expect(inputs[0]).toMatch(/\smaxLength="100"/i);
    expect(inputs[0]).toMatch(/\sautoComplete="organization"/i);
    expect(inputs[0]).not.toMatch(/\sreadonly/i);
  });

  it("lista: sin aviso de permiso ni de membresía", () => {
    const text = textOf(render(ready));

    expect(text).not.toContain(
      "No tenés permiso para cambiar la configuración del workspace.",
    );
    expect(text).not.toContain("Tu acceso al workspace está desactivado.");
  });

  it("WS-50: sin permiso por el rol, el título y el párrafo, sin campo ni sección", () => {
    const markup = render({ kind: "forbidden", reason: "role" });
    const text = textOf(markup);

    expect(markup).toMatch(/<h1[^>]*>Configuración del workspace<\/h1>/);
    expect(text).toContain(
      "No tenés permiso para cambiar la configuración del workspace.",
    );
    expect(text).not.toContain("Tu acceso al workspace está desactivado.");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<section");
  });

  it("WS-51: con la membresía desactivada, el aviso común con el cuerpo de la pantalla, sin campo", () => {
    const markup = render({ kind: "forbidden", reason: "inactive" });
    const text = textOf(markup);

    expect(markup).toMatch(/<h1[^>]*>Configuración del workspace<\/h1>/);
    expect(text).toContain("Tu acceso al workspace está desactivado.");
    expect(text).toContain("No podés cambiar la configuración del workspace.");
    expect(text).not.toContain(
      "No tenés permiso para cambiar la configuración del workspace.",
    );
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<section");
  });
});
