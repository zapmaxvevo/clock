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

/** La clave de la fila `index` con `open` abiertas, tal como la da `visibleRows`. */
function keyAt(open: Iterable<string>, index: number): string {
  const row = visibleRows(groups, new Set(open)).at(index);
  if (row === undefined) {
    throw new Error(`No hay fila ${index}.`);
  }
  return row.key;
}

const p1 = keyAt([], 0);
const p2 = keyAt([], 1);
const p1Tuesday = keyAt([p1], 1);
const p2Tuesday = keyAt([p2], 2);
const p1TuesdayTag = keyAt([p1, p1Tuesday], 2);

/** Las filas como `grupo (nivel)`, con `+` si se puede abrir y `-` si está abierta. */
function shown(open: Iterable<string>): string[] {
  return visibleRows(groups, new Set(open)).map(
    ({ group, level, expandable, expanded }) =>
      `${groupKey(group)} (${level})${expandable ? (expanded ? " -" : " +") : ""}`,
  );
}

describe("visibleRows (D-R3-9)", () => {
  it("sin abiertos, solo el primer nivel, los dos con hijos", () => {
    expect(shown([])).toEqual([`${P1} (1) +`, `${P2} (1) +`]);
  });

  it("al abrir un grupo, sus hijos después de él y antes de su hermano", () => {
    expect(shown([p1])).toEqual([
      `${P1} (1) -`,
      "2026-09-29 (2) +",
      "2026-10-01 (2) +",
      `${P2} (1) +`,
    ]);
  });

  it("un grupo abierto no muestra sus hijos si su padre está cerrado", () => {
    expect(shown([p2Tuesday])).toEqual([`${P1} (1) +`, `${P2} (1) +`]);
  });

  it("al cerrar un grupo se ocultan todos sus descendientes", () => {
    expect(shown([p1Tuesday])).toEqual([`${P1} (1) +`, `${P2} (1) +`]);
  });

  it("al reabrirlo, los hijos vuelven como estaban", () => {
    expect(shown([p1, p1Tuesday])).toEqual([
      `${P1} (1) -`,
      "2026-09-29 (2) -",
      `${E1} (3)`,
      "2026-10-01 (2) +",
      `${P2} (1) +`,
    ]);
  });

  it("el mismo día debajo de dos proyectos tiene dos claves distintas", () => {
    expect(p1Tuesday).not.toBe(p2Tuesday);
    const keys = visibleRows(groups, new Set([p1, p2])).map(({ key }) => key);
    expect(keys).toContain(p1Tuesday);
    expect(keys).toContain(p2Tuesday);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("solo los grupos con `children` se pueden abrir, y una clave de una hoja no la abre", () => {
    const rows = visibleRows(
      groups,
      new Set([p1, p1Tuesday, p1TuesdayTag, p2, p2Tuesday]),
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
    const keys = visibleRows(flat, new Set()).map(({ key }) => key);
    expect(new Set(keys).size).toBe(2);
    expect(
      visibleRows(flat, new Set(keys)).map(({ group, level, expandable, expanded }) => ({
        group,
        level,
        expandable,
        expanded,
      })),
    ).toEqual([
      { group: flat[0], level: 1, expandable: false, expanded: false },
      { group: flat[1], level: 1, expandable: false, expanded: false },
    ]);
  });
});
