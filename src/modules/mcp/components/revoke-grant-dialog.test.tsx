import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog } from "@/components/ui/dialog";
import { buttonsOf, textOf } from "@/test/markup";

import { RevokeGrantConfirmation } from "./revoke-grant-dialog";

function render(): string {
  return renderToStaticMarkup(
    <Dialog open>
      <RevokeGrantConfirmation name="Asistente de prueba" onConfirm={() => undefined} />
    </Dialog>,
  );
}

describe("RevokeGrantConfirmation", () => {
  it("§5.3: el título con el nombre y el texto de lo que pasa", () => {
    const markup = render();

    expect(markup).toMatch(/<h2[^>]*>¿Desconectar Asistente de prueba\?<\/h2>/);
    expect(textOf(markup)).toContain(
      "Va a dejar de poder ver y editar tus horas. Para volver a usarlo, conectalo de nuevo desde el asistente.",
    );
  });

  it("«Cancelar» y «Desconectar», este como acción destructiva", () => {
    const buttons = buttonsOf(render());

    expect(buttons.map(textOf)).toEqual(["Cancelar", "Desconectar"]);
    expect(buttons[0]).toContain('data-slot="dialog-close"');
    expect(buttons[1]).toContain("bg-destructive/10");
  });
});
