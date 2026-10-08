import { describe, expect, it } from "vitest";

import type { TrackingCatalog } from "@/modules/project/schema";

import {
  NO_STORED_ROWS,
  prunedStoredRows,
  storedPairsOf,
  storedRowsFrom,
  storedRowsValue,
  withStoredRow,
  withoutStoredRow,
} from "./stored-rows";

const web = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const design = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const archived = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";

const catalog: TrackingCatalog = {
  canCreateProject: true,
  canCreateTag: true,
  tags: [],
  groups: [
    {
      client: null,
      projects: [
        {
          id: web,
          name: "Web",
          color: "teal",
          tasks: [{ id: design, name: "Diseño" }],
          billableByDefault: false,
        },
      ],
    },
  ],
};

const none = { projectId: null, taskId: null };
const webOnly = { projectId: web, taskId: null };
const webDesign = { projectId: web, taskId: design };

describe("storedRowsFrom", () => {
  it("lee lo que guardó `storedRowsValue`", () => {
    const rows = withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign);

    expect(storedRowsFrom(storedRowsValue(rows))).toEqual(rows);
  });

  it("sin nada guardado, no hay filas", () => {
    expect(storedRowsFrom(null)).toEqual(NO_STORED_ROWS);
  });

  it("una forma inválida se descarta entera, no a medias", () => {
    const mixed = JSON.stringify({
      version: 1,
      weeks: { "2026-09-28": [webOnly, { projectId: "no-es-un-id", taskId: null }] },
    });

    expect(storedRowsFrom(mixed)).toEqual(NO_STORED_ROWS);
    expect(storedRowsFrom("{")).toEqual(NO_STORED_ROWS);
    expect(storedRowsFrom(JSON.stringify({ version: 2, weeks: {} }))).toEqual(
      NO_STORED_ROWS,
    );
    expect(storedRowsFrom(JSON.stringify([webOnly]))).toEqual(NO_STORED_ROWS);
  });
});

describe("withStoredRow y withoutStoredRow", () => {
  it("agregar no repite el par, aunque cambien las mayúsculas", () => {
    const once = withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign);
    const twice = withStoredRow(once, "2026-09-28", {
      projectId: web.toUpperCase(),
      taskId: design.toUpperCase(),
    });

    expect(storedPairsOf(twice, "2026-09-28")).toEqual([webDesign]);
  });

  it("cada semana guarda lo suyo (P-16)", () => {
    const rows = withStoredRow(
      withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign),
      "2026-10-05",
      none,
    );

    expect(storedPairsOf(rows, "2026-09-28")).toEqual([webDesign]);
    expect(storedPairsOf(rows, "2026-10-05")).toEqual([none]);
    expect(storedPairsOf(rows, "2026-09-21")).toEqual([]);
  });

  it("agrega en el orden en que se eligen", () => {
    const rows = withStoredRow(
      withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign),
      "2026-09-28",
      none,
    );

    expect(storedPairsOf(rows, "2026-09-28")).toEqual([webDesign, none]);
  });

  it("quitar la fila la olvida solo en su semana, y la semana vacía sale del objeto", () => {
    const rows = withStoredRow(
      withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign),
      "2026-10-05",
      webDesign,
    );
    const removed = withoutStoredRow(rows, "2026-09-28", webDesign);

    expect(removed.weeks).toEqual({ "2026-10-05": [webDesign] });
  });

  it("«Sin proyecto» no es el proyecto sin tarea", () => {
    const rows = withStoredRow(
      withStoredRow(NO_STORED_ROWS, "2026-09-28", webOnly),
      "2026-09-28",
      none,
    );

    expect(
      storedPairsOf(withoutStoredRow(rows, "2026-09-28", none), "2026-09-28"),
    ).toEqual([webOnly]);
  });
});

describe("prunedStoredRows (TS-19, D13-7)", () => {
  const rows = withStoredRow(
    withStoredRow(
      withStoredRow(NO_STORED_ROWS, "2026-09-28", webDesign),
      "2026-09-28",
      none,
    ),
    "2026-10-05",
    webDesign,
  );

  it("olvida la fila que llegó del servidor con entradas, solo en esa semana", () => {
    const pruned = prunedStoredRows(rows, "2026-09-28", [webDesign], catalog);

    expect(storedPairsOf(pruned, "2026-09-28")).toEqual([none]);
    expect(storedPairsOf(pruned, "2026-10-05")).toEqual([webDesign]);
  });

  it("olvida el par que el catálogo ya no ofrece", () => {
    const withArchived = withStoredRow(rows, "2026-09-28", {
      projectId: archived,
      taskId: null,
    });
    const pruned = prunedStoredRows(withArchived, "2026-09-28", [], catalog);

    expect(storedPairsOf(pruned, "2026-09-28")).toEqual([webDesign, none]);
    expect(
      storedPairsOf(
        prunedStoredRows(rows, "2026-09-28", [], { ...catalog, groups: [] }),
        "2026-09-28",
      ),
    ).toEqual([none]);
  });

  it("sin nada que olvidar devuelve el mismo objeto", () => {
    expect(prunedStoredRows(rows, "2026-09-28", [webOnly], catalog)).toBe(rows);
  });
});
