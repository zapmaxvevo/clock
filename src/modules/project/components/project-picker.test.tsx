import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Combobox } from "@/components/ui/combobox";
import type {
  ProjectActions,
  ProjectSelection,
  TrackingCatalog,
} from "@/modules/project/schema";
import { textOf as visibleText } from "@/test/markup";

import { pickerView } from "./picker-model";
import {
  pickerComboboxProps,
  PickerEmptyMessage,
  PickerOptions,
  ProjectPicker,
} from "./project-picker";
import { TrackingCatalogProvider } from "./tracking-catalog";

/** D-P1-13: el doble de la action del alta; el marcado inicial no la llama. */
const createProject: ProjectActions["createProject"] = () =>
  Promise.resolve({ ok: false, code: "unexpected", message: "doble" });

const catalog: TrackingCatalog = {
  canCreateProject: true,
  clients: [],
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
    <TrackingCatalogProvider catalog={catalog} createProject={createProject}>
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

/** El selector de la edición masiva: «Sin cambios» con `value` nulo. */
function renderWithPlaceholder(value: ProjectSelection | null): string {
  return renderToStaticMarkup(
    <TrackingCatalogProvider catalog={catalog} createProject={createProject}>
      <ProjectPicker
        value={value}
        placeholder="Sin cambios"
        onChange={() => undefined}
        variant="row"
        label="Proyecto"
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

  it("con `value` nulo dibuja el `placeholder` en gris con el ícono, sin punto ni «Sin proyecto»", () => {
    const trigger = comboboxOf(renderWithPlaceholder(null)) ?? "";

    expect(textOf(trigger)).toBe("Sin cambios");
    expect(trigger).toContain("lucide-folder");
    expect(trigger).toContain('<span class="text-muted-foreground">Sin cambios</span>');
    expect(trigger).not.toMatch(dot);
  });

  it("con `placeholder` y una selección, el disparador dibuja la de siempre", () => {
    const trigger = comboboxOf(renderWithPlaceholder(withTask)) ?? "";

    expect(trigger).toMatch(dot);
    expect(textOf(trigger)).toBe("Web: Diseño");
    expect(textOf(comboboxOf(renderWithPlaceholder(none)) ?? "")).toBe("Sin proyecto");
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

/**
 * La lista del popup, dentro de una raíz abierta con las mismas props que le
 * da el selector: el popup va en un portal, que el marcado estático no dibuja.
 */
function renderOptions(
  source: TrackingCatalog,
  value: ProjectSelection | null,
  search = "",
): string {
  const view = pickerView(source, search);
  return renderToStaticMarkup(
    <Combobox {...pickerComboboxProps(view, value)} open>
      <PickerOptions view={view} />
    </Combobox>,
  );
}

/** Las opciones de la lista, cada una con su apertura y su texto. */
function optionsOf(markup: string): { readonly tag: string; readonly text: string }[] {
  return [...markup.matchAll(/(<div[^>]*role="option"[^>]*>)(.*?)<\/div>/g)].map(
    ([, tag, content]) => ({ tag, text: visibleText(content) }),
  );
}

describe("ProjectPicker, «Crear proyecto» (TT-09, D-P1-10)", () => {
  it("con `canCreateProject`, «Crear proyecto» es la última opción, después de los proyectos", () => {
    const options = optionsOf(renderOptions(catalog, projectOnly));

    expect(options.map((option) => option.text)).toEqual([
      "Sin proyecto",
      "Web",
      "Diseño",
      "Crear proyecto",
    ]);
    expect(options.at(-1)?.tag).toContain('role="option"');
  });

  it("aparece también con una búsqueda sin coincidencias", () => {
    const options = optionsOf(renderOptions(catalog, projectOnly, "zzz"));

    expect(options.map((option) => option.text)).toEqual(["Crear proyecto"]);
  });

  it("sin `canCreateProject` no hay opción de crear", () => {
    const markup = renderOptions({ ...catalog, canCreateProject: false }, projectOnly);

    expect(markup).not.toContain("Crear proyecto");
    expect(optionsOf(markup).map((option) => option.text)).toEqual([
      "Sin proyecto",
      "Web",
      "Diseño",
    ]);
  });

  it("con «Sin proyecto» elegido, solo esa opción queda marcada; «Crear proyecto» nunca", () => {
    const options = optionsOf(renderOptions(catalog, none));
    const selected = options.filter((option) =>
      option.tag.includes('aria-selected="true"'),
    );

    expect(selected.map((option) => option.text)).toEqual(["Sin proyecto"]);
    expect(options.at(-1)?.tag).toContain('aria-selected="false"');
  });

  it("con el catálogo vacío ofrece «Sin proyecto» y «Crear proyecto» (TT-87, TS-88)", () => {
    const empty: TrackingCatalog = { ...catalog, groups: [] };

    expect(optionsOf(renderOptions(empty, none)).map((option) => option.text)).toEqual([
      "Sin proyecto",
      "Crear proyecto",
    ]);
  });

  it("el vacío de TT-87 dice «No hay proyectos todavía», sin «Ir a Proyectos»", () => {
    const markup = renderToStaticMarkup(
      <PickerEmptyMessage empty={{ kind: "noProjects" }} />,
    );

    expect(visibleText(markup)).toBe("No hay proyectos todavía");
    expect(markup).not.toContain("Ir a Proyectos");
    expect(markup).not.toContain("<a");
  });

  it("en solo lectura no hay opción de crear ni lista", () => {
    const markup = render(projectOnly, { readOnly: true });

    expect(markup).not.toContain("Crear proyecto");
    expect(markup).not.toContain('role="option"');
  });
});
