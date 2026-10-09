import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { REPORT_WITHOUT_PROJECT, type ReportReadyState } from "@/modules/report/schema";

import { filterOptionsOf, type FilterKind } from "./filter-model";
import { FilterPanel } from "./filter-picker";

const C1 = "c1000000-0000-4000-8000-000000000000";
const C2 = "0c200000-0000-4000-8000-000000000000";
const P1 = "f1000000-0000-4000-8000-000000000000";
const P2 = "a2000000-0000-4000-8000-000000000000";
const P3 = "b3000000-0000-4000-8000-000000000000";

const catalog: ReportReadyState["filterOptions"] = {
  people: [
    { id: "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY", name: "Ana", inactive: false },
    { id: "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx", name: "Bruno", inactive: true },
    { id: "9e0b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d", name: "Carla", inactive: false },
  ],
  clients: [
    { id: C1, name: "Acme", archived: false },
    { id: C2, name: "Bosque", archived: true },
  ],
  projects: [
    {
      id: P1,
      name: "Diseño",
      color: "teal",
      client: { id: C1, name: "Acme" },
      archived: false,
    },
    { id: P2, name: "Interno", color: "red", client: null, archived: false },
    { id: P3, name: "Viejo", color: "green", client: null, archived: true },
  ],
};

type PanelOptions = {
  readonly chosen?: readonly string[];
  readonly query?: string;
  readonly error?: string | null;
};

function render(
  kind: FilterKind,
  { chosen = [], query = "", error = null }: PanelOptions = {},
): string {
  return renderToStaticMarkup(
    <FilterPanel
      kind={kind}
      options={filterOptionsOf(catalog, kind)}
      chosen={chosen}
      query={query}
      error={error}
      onQueryChange={() => undefined}
      onToggle={() => undefined}
      onApply={() => undefined}
    />,
  );
}

/** El contenido de un grupo por su nombre: el de `aria-label` o el texto que lo rotula. */
function group(markup: string, name: string): string | undefined {
  const labelled = new RegExp(`<div role="group" aria-label="${name}"[^>]*>`).exec(
    markup,
  );
  const heading = new RegExp(`<p id="([^"]+)"[^>]*>${name}</p>`).exec(markup);
  const opening =
    labelled ??
    (heading === null
      ? null
      : new RegExp(`<div role="group" aria-labelledby="${heading[1]}"[^>]*>`).exec(
          markup,
        ));
  if (opening === null) {
    return undefined;
  }
  // Los grupos no se anidan: cada uno termina antes del siguiente o de la alerta.
  const rest = markup.slice(opening.index + opening[0].length);
  const end = rest.search(/<div role="group"|<p role="alert"/);
  return end === -1 ? rest : rest.slice(0, end);
}

/** Cada casilla con su rótulo visible, si está tildada y el texto que la describe. */
function options(
  markup: string | undefined,
): { name: string; checked: boolean; detail: string | null }[] {
  return [
    ...(markup ?? "").matchAll(
      /<span[^>]*role="checkbox"([^>]*)>.*?<label[^>]*>(.*?)<\/label>/g,
    ),
  ].map(([whole, attributes, label]) => {
    const describedBy = /aria-describedby="([^"]+)"/.exec(attributes)?.[1];
    const detail =
      describedBy === undefined
        ? null
        : (new RegExp(`<span id="${describedBy}"[^>]*>(.*?)</span>`).exec(label)?.[1] ??
          "sin el texto");
    const name = label
      .replace(/<span id="[^"]*"[^>]*>.*?<\/span>/, "")
      .replace(/<[^>]+>/g, "");
    return { name, checked: /aria-checked="true"/.test(whole), detail };
  });
}

describe("FilterPanel (D-R4-8, §5.3)", () => {
  it("el buscador es de tipo búsqueda y se nombra por el filtro", () => {
    expect(render("projects")).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Buscar proyectos"/,
    );
    expect(render("clients")).toMatch(
      /<input[^>]*type="search"[^>]*aria-label="Buscar clientes"/,
    );
  });

  it("las vigentes en un grupo nombrado por el filtro, «Sin proyecto» primero, y las archivadas en «Archivados»", () => {
    const markup = render("projects");
    expect(options(group(markup, "Proyectos"))).toEqual([
      { name: "Sin proyecto", checked: false, detail: null },
      { name: "Diseño", checked: false, detail: "Acme" },
      { name: "Interno", checked: false, detail: null },
    ]);
    expect(options(group(markup, "Archivados"))).toEqual([
      { name: "Viejo", checked: false, detail: null },
    ]);
    expect(markup.indexOf(">Diseño<")).toBeLessThan(markup.indexOf(">Archivados<"));
  });

  it("los clientes archivados van aparte", () => {
    const markup = render("clients");
    expect(options(group(markup, "Clientes"))).toEqual([
      { name: "Acme", checked: false, detail: null },
    ]);
    expect(options(group(markup, "Archivados"))).toEqual([
      { name: "Bosque", checked: false, detail: null },
    ]);
  });

  it("las personas: las activas en «Personas» y las inactivas aparte, en «Inactivas» y tachadas (P-08)", () => {
    const markup = render("people", { chosen: ["Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx"] });
    expect(markup).toMatch(/<input[^>]*type="search"[^>]*aria-label="Buscar personas"/);
    expect(options(group(markup, "Personas"))).toEqual([
      { name: "Ana", checked: false, detail: null },
      { name: "Carla", checked: false, detail: null },
    ]);
    expect(options(group(markup, "Inactivas"))).toEqual([
      { name: "Bruno", checked: true, detail: null },
    ]);
    expect(markup).not.toContain(">Archivados<");
    expect(markup.match(/line-through/g)).toHaveLength(1);
    expect(markup).toMatch(/<span class="[^"]*line-through[^"]*">Bruno<\/span>/);
  });

  it("dos personas con el mismo nombre son dos casillas (RP-31)", () => {
    const markup = renderToStaticMarkup(
      <FilterPanel
        kind="people"
        options={filterOptionsOf(
          {
            ...catalog,
            people: [
              { id: "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY", name: "Ana", inactive: false },
              { id: "Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx", name: "Ana", inactive: false },
            ],
          },
          "people",
        )}
        chosen={["Zq8Wn2Rt6Yu0Io4Pa8Sd2Fg6Hj0Kl4Mx"]}
        query=""
        error={null}
        onQueryChange={() => undefined}
        onToggle={() => undefined}
        onApply={() => undefined}
      />,
    );
    expect(options(group(markup, "Personas"))).toEqual([
      { name: "Ana", checked: false, detail: null },
      { name: "Ana", checked: true, detail: null },
    ]);
  });

  it("los archivados no se tachan", () => {
    expect(render("projects")).not.toContain("line-through");
    expect(render("clients")).not.toContain("line-through");
  });

  it("el cliente de un proyecto va en gris y lo describe, fuera de su nombre", () => {
    expect(render("projects")).toMatch(
      /<span id="[^"]+" aria-hidden="true" class="[^"]*text-muted-foreground[^"]*">Acme<\/span>/,
    );
  });

  it("un proyecto lleva su punto de color; «Sin proyecto», en gris y sin punto", () => {
    const markup = render("projects");
    expect(markup.match(/background-color/g)).toHaveLength(3);
    expect(markup).toMatch(/<span class="[^"]*text-muted-foreground[^"]*">Sin proyecto</);
  });

  it("las casillas tildadas son las elegidas, también las que la búsqueda esconde", () => {
    const markup = render("projects", {
      chosen: [REPORT_WITHOUT_PROJECT, P3, P2],
      query: "viej",
    });
    expect(options(group(markup, "Proyectos"))).toEqual([
      { name: "Sin proyecto", checked: true, detail: null },
    ]);
    expect(options(group(markup, "Archivados"))).toEqual([
      { name: "Viejo", checked: true, detail: null },
    ]);
  });

  it("sin coincidencias, «Nada coincide con la búsqueda.» y «Sin proyecto» sigue", () => {
    const markup = render("projects", { query: "zeta" });
    expect(markup).toContain("Nada coincide con la búsqueda.");
    expect(options(group(markup, "Proyectos"))).toEqual([
      { name: "Sin proyecto", checked: false, detail: null },
    ]);
    expect(group(markup, "Archivados")).toBeUndefined();
  });

  it("sin coincidencias en clientes, ningún grupo y el mensaje", () => {
    const markup = render("clients", { query: "zeta" });
    expect(markup).toContain("Nada coincide con la búsqueda.");
    expect(markup).not.toContain('role="group"');
  });

  it("con el catálogo vacío, el mensaje solo con algo escrito", () => {
    const empty = (query: string) =>
      renderToStaticMarkup(
        <FilterPanel
          kind="projects"
          options={filterOptionsOf(
            { people: null, clients: [], projects: [] },
            "projects",
          )}
          chosen={[]}
          query={query}
          error={null}
          onQueryChange={() => undefined}
          onToggle={() => undefined}
          onApply={() => undefined}
        />,
      );
    expect(empty("")).not.toContain("Nada coincide");
    expect(empty("acme")).toContain("Nada coincide con la búsqueda.");
  });

  it("con coincidencias, sin el mensaje", () => {
    expect(render("projects", { query: "dise" })).not.toContain("Nada coincide");
    expect(render("clients", { query: "bosq" })).not.toContain("Nada coincide");
  });

  it("la región de alerta está montada vacía y muestra el mensaje del tope", () => {
    expect(render("projects")).toMatch(/<p role="alert"[^>]*><\/p>/);
    expect(render("projects", { error: "Elegí hasta 50." })).toMatch(
      /<p role="alert"[^>]*>Elegí hasta 50\.<\/p>/,
    );
  });

  it("«Aplicar» va después de la región de alerta", () => {
    const markup = render("clients");
    expect(markup).toMatch(/<p role="alert"[^>]*><\/p><button[^>]*>Aplicar<\/button>/);
  });
});
