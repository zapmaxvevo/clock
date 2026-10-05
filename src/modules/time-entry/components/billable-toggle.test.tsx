import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BillableToggle } from "./billable-toggle";

type Options = {
  readonly pressed?: boolean;
  readonly pending?: boolean;
  readonly readOnly?: boolean;
  readonly showLabel?: boolean;
};

function render(options: Options = {}): string {
  return renderToStaticMarkup(
    <BillableToggle
      pressed={options.pressed ?? false}
      onPressedChange={() => undefined}
      label="Entrada «Informe» facturable"
      pending={options.pending}
      readOnly={options.readOnly}
      showLabel={options.showLabel}
    />,
  );
}

/** El elemento `button`, con sus atributos. */
function buttonOf(markup: string): string | null {
  return markup.match(/<button[^>]*>/)?.[0] ?? null;
}

describe("BillableToggle", () => {
  it("es un botón de alternancia con el nombre que recibe", () => {
    const button = buttonOf(render());

    expect(button).toContain('aria-label="Entrada «Informe» facturable"');
    expect(button).toContain('aria-pressed="false"');
  });

  it("facturable, está presionado", () => {
    expect(buttonOf(render({ pressed: true }))).toContain('aria-pressed="true"');
  });

  it("con el cambio en vuelo, inactivo sin `disabled`: el foco se queda", () => {
    const button = buttonOf(render({ pending: true })) ?? "";

    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it("sin nada en vuelo no lleva `aria-disabled`", () => {
    expect(buttonOf(render())).not.toContain('aria-disabled="');
  });

  it("con `showLabel`, el nombre también se ve", () => {
    const markup = render({ showLabel: true });

    expect(markup).toContain(">Entrada «Informe» facturable</span>");
  });

  it("en solo lectura y facturable, un ícono con nombre y sin control (TT-92)", () => {
    const markup = render({ readOnly: true, pressed: true });

    expect(buttonOf(markup)).toBeNull();
    expect(markup).toMatch(/<span role="img" aria-label="Facturable"/);
  });

  it("en solo lectura y no facturable, nada (H-6)", () => {
    expect(render({ readOnly: true, pressed: false })).toBe("");
  });
});
