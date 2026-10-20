import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AppNav } from "./app-nav";

// La ruta actual la da el router de Next, que fuera de la app no existe.
const navigation = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));

/** El texto de cada enlace, en orden. */
function linksOf(markup: string): string[] {
  return [...markup.matchAll(/<a[^>]*>(.*?)<\/a>/g)].map(([, text]) => text);
}

/** Las aperturas de los enlaces marcados como la página actual. */
function currentOf(markup: string): string[] {
  return markup.match(/<a[^>]*aria-current="page"[^>]*>/g) ?? [];
}

const fixed = ["Inicio", "Calendario", "Planilla", "Reportes", "Proyectos"];

describe("AppNav", () => {
  beforeEach(() => {
    navigation.pathname = "/";
  });

  it("sin `showTeam` ni `showSettings`, solo los enlaces fijos", () => {
    const markup = renderToStaticMarkup(<AppNav showTeam={false} showSettings={false} />);

    expect(linksOf(markup)).toEqual(fixed);
    expect(markup).not.toContain('href="/equipo"');
    expect(markup).not.toContain('href="/configuracion"');
  });

  it("solo con `showTeam`, «Equipo» va después de «Proyectos», sin «Configuración»", () => {
    navigation.pathname = "/equipo";
    const markup = renderToStaticMarkup(<AppNav showTeam showSettings={false} />);

    expect(linksOf(markup)).toEqual([...fixed, "Equipo"]);
    expect(markup).not.toContain('href="/configuracion"');
    const current = currentOf(markup);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/equipo"');
  });

  it("solo con `showSettings`, «Configuración» va después de «Proyectos», sin «Equipo»", () => {
    navigation.pathname = "/configuracion";
    const markup = renderToStaticMarkup(<AppNav showTeam={false} showSettings />);

    expect(linksOf(markup)).toEqual([...fixed, "Configuración"]);
    expect(markup).not.toContain('href="/equipo"');
    const current = currentOf(markup);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/configuracion"');
  });

  it("con los dos, «Configuración» va al final, después de «Equipo», y se marca en `/configuracion`", () => {
    navigation.pathname = "/configuracion";
    const markup = renderToStaticMarkup(<AppNav showTeam showSettings />);

    expect(linksOf(markup)).toEqual([...fixed, "Equipo", "Configuración"]);
    const current = currentOf(markup);
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/configuracion"');
  });
});
