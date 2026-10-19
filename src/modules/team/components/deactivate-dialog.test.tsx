import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { buttonsOf, textOf } from "@/test/markup";

import { DeactivateConfirmation } from "./deactivate-dialog";

function render(): string {
  return renderToStaticMarkup(
    <Dialog open>
      <DeactivateConfirmation name="Ana Pérez" onConfirm={() => undefined} />
    </Dialog>,
  );
}

describe("DeactivateConfirmation", () => {
  it("EQ-46: el título con el nombre y el texto de lo que pasa", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>¿Desactivar a Ana Pérez\?<\/h2>/);
    expect(textOf(markup)).toContain(
      "No va a poder entrar. Si tiene un timer en curso, se detiene. Sus horas quedan.",
    );
  });

  it("«Cancelar» y «Desactivar», este como acción destructiva", () => {
    const buttons = buttonsOf(render());

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Desactivar"]);
    expect(buttons[0]).toContain('data-slot="dialog-close"');
    expect(buttons[1]).toContain("bg-destructive/10");
  });
});
