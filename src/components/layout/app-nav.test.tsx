import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AppNav } from "./app-nav";

// La ruta actual la da el router de Next, que fuera de la app no existe.
vi.mock("next/navigation", () => ({ usePathname: () => "/equipo" }));

/** El texto de cada enlace, en orden. */
function linksOf(markup: string): string[] {
  return [...markup.matchAll(/<a[^>]*>(.*?)<\/a>/g)].map(([, text]) => text);
}

describe("AppNav", () => {
  it("sin `showTeam`, no tiene «Equipo»", () => {
    const markup = renderToStaticMarkup(<AppNav showTeam={false} />);

    expect(linksOf(markup)).toEqual([
      "Inicio",
      "Calendario",
      "Planilla",
      "Reportes",
      "Proyectos",
    ]);
    expect(markup).not.toContain('href="/equipo"');
  });

  it("con `showTeam`, «Equipo» va después de «Proyectos» y marca la página actual", () => {
    const markup = renderToStaticMarkup(<AppNav showTeam />);

    expect(linksOf(markup)).toEqual([
      "Inicio",
      "Calendario",
      "Planilla",
      "Reportes",
      "Proyectos",
      "Equipo",
    ]);
    const current = markup.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/equipo"');
  });
});
