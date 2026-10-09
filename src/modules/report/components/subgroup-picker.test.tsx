import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ReportGrouping } from "@/modules/report/schema";

import { SubgroupPanel } from "./subgroup-picker";

const range = { first: "2026-09-28", last: "2026-10-04" };
const base = "/reportes?desde=2026-09-28&hasta=2026-10-04";

function render(grouping: ReportGrouping, level: 1 | 2): string {
  return renderToStaticMarkup(
    <SubgroupPanel
      range={range}
      grouping={grouping}
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
  it("sin segundo nivel: «Ninguno» primero y elegido, y las cinco que no son el primero", () => {
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
});
