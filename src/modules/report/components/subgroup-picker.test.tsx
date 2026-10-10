import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  NO_REPORT_FILTERS,
  type ReportFilters,
  type ReportGrouping,
} from "@/modules/report/schema";

import { SubgroupPanel } from "./subgroup-picker";

const range = { first: "2026-09-28", last: "2026-10-04" };
const base = "/reportes?desde=2026-09-28&hasta=2026-10-04";

function render(
  grouping: ReportGrouping,
  level: 1 | 2,
  filters: ReportFilters = NO_REPORT_FILTERS,
): string {
  return renderToStaticMarkup(
    <SubgroupPanel
      range={range}
      grouping={grouping}
      filters={filters}
      level={level}
      onChoose={() => undefined}
    />,
  );
}

/** El nombre de la lista y sus enlaces, en orden. */
function list(markup: string): {
  name: string | undefined;
  links: { label: string; href: string; current: string | null }[];
} {
  return {
    name: /<ul aria-label="([^"]*)"/.exec(markup)?.[1],
    links: [...markup.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(
      ([, attributes, label]) => ({
        label,
        href: (/href="([^"]*)"/.exec(attributes)?.[1] ?? "").replaceAll("&amp;", "&"),
        current: /aria-current="([^"]*)"/.exec(attributes)?.[1] ?? null,
      }),
    ),
  };
}

describe("SubgroupPanel (D-R3-8, §5.3)", () => {
  it("sin segundo nivel: «Ninguno» primero y elegido, y las ocho que no son el primero", () => {
    expect(list(render({ groupBy: "project", subgroups: [] }, 1))).toEqual({
      name: "Segundo nivel",
      links: [
        { label: "Ninguno", href: `${base}&agrupar=proyecto`, current: "true" },
        {
          label: "Persona",
          href: `${base}&agrupar=proyecto&subagrupar=persona`,
          current: null,
        },
        {
          label: "Cliente",
          href: `${base}&agrupar=proyecto&subagrupar=cliente`,
          current: null,
        },
        {
          label: "Tarea",
          href: `${base}&agrupar=proyecto&subagrupar=tarea`,
          current: null,
        },
        {
          label: "Etiqueta",
          href: `${base}&agrupar=proyecto&subagrupar=etiqueta`,
          current: null,
        },
        {
          label: "Fecha",
          href: `${base}&agrupar=proyecto&subagrupar=fecha`,
          current: null,
        },
        {
          label: "Semana",
          href: `${base}&agrupar=proyecto&subagrupar=semana`,
          current: null,
        },
        {
          label: "Mes",
          href: `${base}&agrupar=proyecto&subagrupar=mes`,
          current: null,
        },
        {
          label: "Descripción",
          href: `${base}&agrupar=proyecto&subagrupar=descripcion`,
          current: null,
        },
      ],
    });
  });

  it("con tres niveles, el segundo marca el suyo e intercambia con el tercero", () => {
    const { links } = list(render({ groupBy: "project", subgroups: ["date", "tag"] }, 1));
    expect(
      links.filter(({ current }) => current !== null).map(({ label }) => label),
    ).toEqual(["Fecha"]);
    expect(Object.fromEntries(links.map(({ label, href }) => [label, href]))).toEqual({
      Ninguno: `${base}&agrupar=proyecto`,
      Persona: `${base}&agrupar=proyecto&subagrupar=persona%2Cetiqueta`,
      Cliente: `${base}&agrupar=proyecto&subagrupar=cliente%2Cetiqueta`,
      Tarea: `${base}&agrupar=proyecto&subagrupar=tarea%2Cetiqueta`,
      Etiqueta: `${base}&agrupar=proyecto&subagrupar=etiqueta%2Cfecha`,
      Fecha: `${base}&agrupar=proyecto&subagrupar=fecha%2Cetiqueta`,
      Semana: `${base}&agrupar=proyecto&subagrupar=semana%2Cetiqueta`,
      Mes: `${base}&agrupar=proyecto&subagrupar=mes%2Cetiqueta`,
      Descripción: `${base}&agrupar=proyecto&subagrupar=descripcion%2Cetiqueta`,
    });
  });

  it("el tercer nivel, nombrado por su nivel, sin los dos de arriba", () => {
    expect(list(render({ groupBy: "project", subgroups: ["date"] }, 2))).toEqual({
      name: "Tercer nivel",
      links: [
        {
          label: "Ninguno",
          href: `${base}&agrupar=proyecto&subagrupar=fecha`,
          current: "true",
        },
        {
          label: "Persona",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Cpersona`,
          current: null,
        },
        {
          label: "Cliente",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Ccliente`,
          current: null,
        },
        {
          label: "Tarea",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Ctarea`,
          current: null,
        },
        {
          label: "Etiqueta",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Cetiqueta`,
          current: null,
        },
        {
          label: "Semana",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Csemana`,
          current: null,
        },
        {
          label: "Mes",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Cmes`,
          current: null,
        },
        {
          label: "Descripción",
          href: `${base}&agrupar=proyecto&subagrupar=fecha%2Cdescripcion`,
          current: null,
        },
      ],
    });
  });

  it("con tercer nivel elegido, solo él lleva aria-current", () => {
    const { links } = list(
      render({ groupBy: "person", subgroups: ["project", "task"] }, 2),
    );
    expect(links.filter(({ current }) => current !== null)).toEqual([
      {
        label: "Tarea",
        href: `${base}&agrupar=persona&subagrupar=proyecto%2Ctarea`,
        current: "true",
      },
    ]);
  });

  it("Mes → Semana: el tercer nivel ofrece la fecha, con los dos de arriba en la URL (D-R10-6)", () => {
    const { links } = list(render({ groupBy: "month", subgroups: ["week"] }, 2));
    expect(links.map(({ label }) => label)).toEqual([
      "Ninguno",
      "Persona",
      "Proyecto",
      "Cliente",
      "Tarea",
      "Etiqueta",
      "Fecha",
      "Descripción",
    ]);
    expect(links.find(({ label }) => label === "Fecha")?.href).toBe(
      `${base}&agrupar=mes&subagrupar=semana%2Cfecha`,
    );
  });

  it("cada enlace conserva los filtros (D-R4-10)", () => {
    const project = "a2000000-0000-4000-8000-000000000000";
    const client = "c1000000-0000-4000-8000-000000000000";
    // Un id de Better Auth, con mayúsculas.
    const person = "aB3dE5fG7hJ9kL1mN3pQ5rS7tU9vW1xY";
    const { links } = list(
      render({ groupBy: "project", subgroups: ["date"] }, 2, {
        people: [person],
        clients: [client],
        projects: [project],
        withoutProject: true,
      }),
    );
    const kept = `&personas=${person}&clientes=${client}&proyectos=${project}%2Csin-proyecto`;
    expect(links.map(({ href }) => href)).toEqual([
      `${base}&agrupar=proyecto&subagrupar=fecha${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Cpersona${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Ccliente${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Ctarea${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Cetiqueta${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Csemana${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Cmes${kept}`,
      `${base}&agrupar=proyecto&subagrupar=fecha%2Cdescripcion${kept}`,
    ]);
  });
});
