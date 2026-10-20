import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { NameField } from "./name-field";

/** Doble escrito a mano: el marcado inicial no llama a la action. */
const save = () =>
  Promise.resolve({ ok: false, code: "unexpected", message: "doble" } as const);

function render(readOnly?: boolean): string {
  return renderToStaticMarkup(
    <NameField
      save={save}
      value="Estudio Norte"
      label="Nombre del workspace"
      maxLength={100}
      autoComplete="organization"
      failureTitle="No se pudo cambiar el nombre del workspace."
      unreachableMessage="No se pudo guardar."
      {...(readOnly === undefined ? {} : { readOnly })}
    />,
  );
}

/** El único `input` del campo. */
function inputOf(markup: string): string {
  return markup.match(/<input[^>]*>/)?.[0] ?? "";
}

describe("NameField", () => {
  it("el rótulo nombra al campo por su id", () => {
    const markup = render();
    const id = markup.match(
      /<label[^>]*for="([^"]+)"[^>]*>Nombre del workspace<\/label>/,
    )?.[1];

    expect(id).toBeDefined();
    expect(inputOf(markup)).toContain(`id="${id ?? ""}"`);
  });

  it("muestra el guardado, corta en `maxLength` y usa el `autoComplete` recibido", () => {
    const input = inputOf(render());

    expect(input).toContain('type="text"');
    expect(input).toContain('value="Estudio Norte"');
    expect(input).toMatch(/\smaxLength="100"/i);
    expect(input).toMatch(/\sautoComplete="organization"/i);
  });

  it("por omisión y con `readOnly` falso, se puede escribir", () => {
    expect(inputOf(render())).not.toMatch(/\sreadonly/i);
    expect(inputOf(render(false))).not.toMatch(/\sreadonly/i);
  });

  it("con `readOnly`, el valor se ve, readOnly y sin disabled", () => {
    const input = inputOf(render(true));

    expect(input).toContain('value="Estudio Norte"');
    expect(input).toMatch(/\sreadonly(=|\s|>)/i);
    expect(input).not.toMatch(/\s(aria-)?disabled(=|\s|>)/);
  });

  it("sin pedido, ningún aviso", () => {
    const markup = render();

    expect(markup).not.toContain("No se pudo cambiar el nombre del workspace.");
    expect(markup).not.toMatch(/role="(alert|status)"/);
  });
});
