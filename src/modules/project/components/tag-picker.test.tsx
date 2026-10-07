import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { TagRef, TrackingCatalog } from "@/modules/project/schema";

import { closingChange, TagPicker } from "./tag-picker";
import { TrackingCatalogProvider } from "./tracking-catalog";

const design: TagRef = { id: "t-design", name: "Diseño" };
const review: TagRef = { id: "t-review", name: "revisión" };
const urgent: TagRef = { id: "t-urgent", name: "Urgente" };

const catalog: TrackingCatalog = {
  canCreateProject: true,
  canCreateTag: true,
  groups: [],
  tags: [design, review, urgent],
};

type Options = {
  readonly variant?: "bar" | "row";
  readonly pending?: boolean;
  readonly readOnly?: boolean;
};

function render(value: readonly TagRef[], options: Options = {}): string {
  return renderToStaticMarkup(
    <TrackingCatalogProvider catalog={catalog}>
      <TagPicker
        value={value}
        onChange={() => undefined}
        variant={options.variant ?? "row"}
        label="Etiquetas de la entrada «Informe»"
        pending={options.pending}
        readOnly={options.readOnly}
      />
    </TrackingCatalogProvider>,
  );
}

/** El texto visible, sin etiquetas. */
function textOf(markup: string): string {
  return markup.replace(/<[^>]*>/g, "");
}

/** El elemento con rol `combobox`, con su apertura y su contenido. */
function comboboxOf(markup: string): string | null {
  return markup.match(/<button[^>]*role="combobox"[^>]*>.*?<\/button>/)?.[0] ?? null;
}

describe("TagPicker", () => {
  it("el disparador es un combobox que abre un diálogo, con el nombre que le pasan y las etiquetas", () => {
    const trigger = comboboxOf(render([design, urgent])) ?? "";

    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toContain(
      'aria-label="Etiquetas de la entrada «Informe»: Diseño, Urgente"',
    );
    expect(textOf(trigger)).toBe("Diseño, Urgente");
  });

  it("muestra las etiquetas en orden alfabético aunque lleguen en el orden de los clics (TT-12)", () => {
    const trigger = comboboxOf(render([urgent, review, design])) ?? "";

    expect(textOf(trigger)).toBe("Diseño, revisión, Urgente");
    expect(trigger).toContain(
      'aria-label="Etiquetas de la entrada «Informe»: Diseño, revisión, Urgente"',
    );
  });

  it("con etiquetas, el ícono va marcado", () => {
    expect(comboboxOf(render([design]))).toContain(
      'class="lucide lucide-tag text-primary"',
    );
  });

  it("sin etiquetas, la barra dice «Etiquetas» y la fila muestra solo el ícono en gris (H-6)", () => {
    const bar = comboboxOf(render([], { variant: "bar" })) ?? "";
    const row = comboboxOf(render([], { variant: "row" })) ?? "";

    expect(textOf(bar)).toBe("Etiquetas");
    expect(textOf(row)).toBe("");
    expect(row).toContain('class="lucide lucide-tag text-muted-foreground"');
    expect(row).toContain('aria-label="Etiquetas de la entrada «Informe»"');
  });

  it("con un cambio en vuelo queda inactivo con `aria-disabled` y sin `disabled`", () => {
    const trigger = comboboxOf(render([design], { pending: true })) ?? "";

    expect(trigger).toContain('aria-disabled="true"');
    expect(trigger).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(comboboxOf(render([design]))).not.toContain("aria-disabled=");
  });

  it("cerrado no dibuja el popup", () => {
    const markup = render([design]);

    expect(markup).not.toContain("Buscar etiqueta");
    expect(markup).not.toContain('role="option"');
  });

  it("con `readOnly` dibuja los nombres como texto, en orden alfabético y sin combobox (TT-92)", () => {
    const markup = render([urgent, design], { readOnly: true });

    expect(markup).not.toContain('role="combobox"');
    expect(markup).not.toContain("<button");
    expect(textOf(markup)).toBe("Etiquetas: Diseño, Urgente");
  });

  it("con `readOnly`, «Etiquetas: » solo para el lector de pantalla: a la vista, los nombres (F5)", () => {
    const markup = render([design], { readOnly: true });

    expect(markup).toContain('<span class="sr-only">Etiquetas: </span>Diseño');
  });

  it("con `readOnly` y sin etiquetas no dibuja nada (H-6)", () => {
    for (const variant of ["bar", "row"] as const) {
      expect(render([], { variant, readOnly: true })).toBe("");
    }
  });

  it("fuera del proveedor del catálogo lanza", () => {
    expect(() =>
      renderToStaticMarkup(
        <TagPicker
          value={[]}
          onChange={() => undefined}
          variant="bar"
          label="Etiquetas"
        />,
      ),
    ).toThrow("TrackingCatalogProvider");
  });
});

describe("closingChange (D-5)", () => {
  it("con otro conjunto avisa el borrador entero", () => {
    expect(closingChange([design], [design, urgent, review])).toEqual([
      design,
      urgent,
      review,
    ]);
    expect(closingChange([design, review], [review])).toEqual([review]);
    expect(closingChange([design], [])).toEqual([]);
  });

  it("con el mismo conjunto no avisa nada, aunque cambie el orden o las mayúsculas de los ids", () => {
    expect(closingChange([design, urgent], [design, urgent])).toBeNull();
    expect(closingChange([design, urgent], [urgent, design])).toBeNull();
    expect(closingChange([design], [{ ...design, id: "T-DESIGN" }])).toBeNull();
    expect(closingChange([], [])).toBeNull();
  });

  it("marcar y desmarcar la misma vuelve al conjunto de antes: no avisa", () => {
    const opened = [design];
    const marked = [...opened, urgent];
    const unmarked = marked.filter((tag) => tag !== urgent);

    expect(closingChange(opened, unmarked)).toBeNull();
  });
});
