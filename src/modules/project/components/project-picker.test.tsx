import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ProjectSelection, TrackingCatalog } from "@/modules/project/schema";

import { ProjectPicker } from "./project-picker";
import { TrackingCatalogProvider } from "./tracking-catalog";

const catalog: TrackingCatalog = {
  canCreateProject: true,
  canCreateTag: true,
  tags: [],
  groups: [
    {
      client: null,
      projects: [
        {
          id: "p-web",
          name: "Web",
          color: "teal",
          tasks: [{ id: "t-design", name: "Diseño" }],
          billableByDefault: false,
        },
      ],
    },
  ],
};

const web = { id: "p-web", name: "Web", color: "teal" } as const;
const withTask: ProjectSelection = {
  project: web,
  task: { id: "t-design", name: "Diseño" },
};
const projectOnly: ProjectSelection = { project: web, task: null };
const none: ProjectSelection = { project: null, task: null };

type Options = {
  readonly variant?: "bar" | "row";
  readonly pending?: boolean;
  readonly readOnly?: boolean;
};

function render(value: ProjectSelection, options: Options = {}): string {
  return renderToStaticMarkup(
    <TrackingCatalogProvider catalog={catalog}>
      <ProjectPicker
        value={value}
        onChange={() => undefined}
        variant={options.variant ?? "row"}
        label="Proyecto de la entrada «Informe»"
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

const dot = /<span aria-hidden="true"[^>]*style="background-color:#0D9488"><\/span>/;

describe("ProjectPicker", () => {
  it("el disparador es un combobox con el nombre que le pasan y la selección a la vista", () => {
    const trigger = comboboxOf(render(withTask));

    expect(trigger).toContain('aria-label="Proyecto de la entrada «Informe»"');
    expect(trigger).toContain('aria-haspopup="dialog"');
    expect(trigger).toMatch(dot);
    expect(textOf(trigger ?? "")).toBe("Web: Diseño");
    expect(textOf(comboboxOf(render(projectOnly)) ?? "")).toBe("Web");
  });

  it("sin selección, la barra dice «Proyecto» y la fila «Sin proyecto», sin punto", () => {
    const bar = comboboxOf(render(none, { variant: "bar" })) ?? "";
    const row = comboboxOf(render(none, { variant: "row" })) ?? "";

    expect(textOf(bar)).toBe("Proyecto");
    expect(textOf(row)).toBe("Sin proyecto");
    expect(row).not.toMatch(dot);
  });

  it("con un cambio en vuelo queda inactivo con `aria-disabled` y sin `disabled`", () => {
    const trigger = comboboxOf(render(projectOnly, { pending: true })) ?? "";

    expect(trigger).toContain('aria-disabled="true"');
    expect(trigger).not.toMatch(/\sdisabled(=""|\s|>)/);
    expect(comboboxOf(render(projectOnly))).not.toContain("aria-disabled=");
  });

  it("con `readOnly` dibuja el proyecto y la tarea como texto, sin ningún combobox", () => {
    const markup = render(withTask, { readOnly: true });

    expect(markup).not.toContain('role="combobox"');
    expect(markup).not.toContain("<button");
    expect(markup).toMatch(dot);
    expect(textOf(markup)).toBe("Web: Diseño");
  });

  it("con `readOnly` y sin proyecto dice «Sin proyecto», también en la barra", () => {
    for (const variant of ["bar", "row"] as const) {
      const markup = render(none, { variant, readOnly: true });

      expect(markup).not.toContain('role="combobox"');
      expect(markup).not.toMatch(dot);
      expect(textOf(markup)).toBe("Sin proyecto");
    }
  });

  it("fuera del proveedor del catálogo lanza", () => {
    expect(() =>
      renderToStaticMarkup(
        <ProjectPicker
          value={none}
          onChange={() => undefined}
          variant="bar"
          label="Proyecto"
        />,
      ),
    ).toThrow("TrackingCatalogProvider");
  });
});
