import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { buttonsOf, textOf } from "@/test/markup";

import { ReleaseEmailConfirmation } from "./release-email-dialog";

function render(): string {
  return renderToStaticMarkup(
    <Dialog open>
      <ReleaseEmailConfirmation
        name="Ana Pérez"
        email="ana@empresa.com"
        onConfirm={() => undefined}
      />
    </Dialog>,
  );
}

describe("ReleaseEmailConfirmation", () => {
  it("D-E2b-9: el título con el nombre y el texto con el correo, lo que queda y que no se deshace", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>¿Liberar el correo de Ana Pérez\?<\/h2>/);
    expect(textOf(markup)).toContain(
      "ana@empresa.com deja de ser de Ana Pérez y lo vas a poder invitar para otra persona. Ana Pérez queda inactiva, con sus horas, y no va a poder volver a entrar ni reactivarse. No se puede deshacer.",
    );
  });

  it("«Cancelar» y «Liberar el correo», este como acción destructiva", () => {
    const buttons = buttonsOf(render());

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Liberar el correo"]);
    expect(buttons[0]).toContain('data-slot="dialog-close"');
    expect(buttons[1]).toContain("bg-destructive/10");
  });
});
