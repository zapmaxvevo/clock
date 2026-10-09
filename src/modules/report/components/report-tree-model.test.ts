import { describe, expect, it } from "vitest";

import type { ReportGroup } from "@/modules/report/schema";

import { groupKey, visibleRows } from "./report-tree-model";

const P1 = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const P2 = "2a3b4c5d-6e7f-4a8b-9c0d-1e2f3a4b5c6d";
const E1 = "6a7b8c9d-0e1f-4a2b-9c3d-5e6f7a8b9c0d";

function project(id: string, name: string, seconds: number, children: ReportGroup[]) {
  return {
    kind: "project",
    project: { id, name, color: "teal" },
    client: null,
    seconds,
    children,
  } satisfies ReportGroup;
}

function day(dayKey: string, seconds: number, children?: ReportGroup[]) {
  return {
    kind: "date",
    dayKey,
    label: dayKey,
    seconds,
    ...(children === undefined ? {} : { children }),
  } satisfies ReportGroup;
}

/** Proyecto → Fecha → Etiqueta: el martes está debajo de los dos proyectos. */
const groups: ReportGroup[] = [
  project(P1, "P1", 5_400, [
    day("2026-09-29", 3_600, [
      { kind: "tag", tag: { id: E1, name: "E1" }, seconds: 3_600 },
    ]),
    day("2026-10-01", 1_800, [{ kind: "tag", tag: null, seconds: 1_800 }]),
  ]),
  project(P2, "P2", 2_700, [
    day("2026-09-29", 2_700, [{ kind: "tag", tag: null, seconds: 2_700 }]),
  ]),
];

const p1 = `/${P1}`;
const p1Tuesday = `/${P1}/2026-09-29`;
const p2 = `/${P2}`;
const p2Tuesday = `/${P2}/2026-09-29`;

/** Las filas como `clave (nivel)`, con `+` si se puede abrir y `-` si está abierta. */
function shown(open: Iterable<string>): string[] {
  return visibleRows(groups, new Set(open)).map(
    ({ key, level, expandable, expanded }) =>
      `${key} (${level})${expandable ? (expanded ? " -" : " +") : ""}`,
  );
}

describe("visibleRows (D-R3-9)", () => {
  it("sin abiertos, solo el primer nivel, los dos con hijos", () => {
    expect(shown([])).toEqual([`${p1} (1) +`, `${p2} (1) +`]);
  });

  it("al abrir un grupo, sus hijos después de él y antes de su hermano", () => {
    expect(shown([p1])).toEqual([
      `${p1} (1) -`,
      `${p1Tuesday} (2) +`,
      `${p1}/2026-10-01 (2) +`,
      `${p2} (1) +`,
    ]);
  });

  it("un grupo abierto no muestra sus hijos si su padre está cerrado", () => {
    expect(shown([p2Tuesday])).toEqual([`${p1} (1) +`, `${p2} (1) +`]);
  });

  it("al cerrar un grupo se ocultan todos sus descendientes", () => {
    expect(shown([p1Tuesday])).toEqual([`${p1} (1) +`, `${p2} (1) +`]);
  });

  it("al reabrirlo, los hijos vuelven como estaban", () => {
    expect(shown([p1, p1Tuesday])).toEqual([
      `${p1} (1) -`,
      `${p1Tuesday} (2) -`,
      `${p1Tuesday}/${E1} (3)`,
      `${p1}/2026-10-01 (2) +`,
      `${p2} (1) +`,
    ]);
  });

  it("el mismo día debajo de dos proyectos tiene dos claves distintas", () => {
    const rows = visibleRows(groups, new Set([p1, p2]));
    const keys = rows.map(({ key }) => key);
    expect(keys).toContain(p1Tuesday);
    expect(keys).toContain(p2Tuesday);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("solo los grupos con `children` se pueden abrir, y una clave de una hoja no la abre", () => {
    const rows = visibleRows(
      groups,
      new Set([p1, p1Tuesday, `${p1Tuesday}/${E1}`, p2, p2Tuesday]),
    );
    expect(
      rows.map(({ group, expandable, expanded }) => [
        groupKey(group),
        expandable,
        expanded,
      ]),
    ).toEqual([
      [P1, true, true],
      ["2026-09-29", true, true],
      [E1, false, false],
      ["2026-10-01", true, false],
      [P2, true, true],
      ["2026-09-29", true, true],
      ["sin-etiqueta", false, false],
    ]);
  });

  it("un reporte de un nivel: una fila por grupo, ninguna para abrir", () => {
    const flat: ReportGroup[] = [
      { kind: "tag", tag: { id: E1, name: "E1" }, seconds: 60 },
      { kind: "tag", tag: null, seconds: 60 },
    ];
    expect(visibleRows(flat, new Set([`/${E1}`]))).toEqual([
      { key: `/${E1}`, level: 1, group: flat[0], expandable: false, expanded: false },
      {
        key: "/sin-etiqueta",
        level: 1,
        group: flat[1],
        expandable: false,
        expanded: false,
      },
    ]);
  });
});
