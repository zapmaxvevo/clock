import { describe, expect, it } from "vitest";

import { pairToCheck, tagsAfter, tagsToCheck } from "./assignment";

const web = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
const app = "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11";
const design = "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c";
const layout = "1e2d3c4b-5a69-4788-9a0b-c1d2e3f4a5b6";

const empty = { projectId: null, taskId: null };

describe("pairToCheck (criterio 10, §4.3)", () => {
  it("«Sin proyecto» no se valida, tenga lo que tenga la entrada (TT-10)", () => {
    expect(pairToCheck({ projectId: web, taskId: design }, empty)).toBeNull();
    expect(pairToCheck(empty, empty)).toBeNull();
  });

  it("el mismo proyecto y la misma tarea no se validan (TT-104, PR-65, PR-71)", () => {
    expect(
      pairToCheck({ projectId: web, taskId: design }, { projectId: web, taskId: design }),
    ).toBeNull();
    expect(
      pairToCheck({ projectId: web, taskId: null }, { projectId: web, taskId: null }),
    ).toBeNull();
  });

  it("el mismo proyecto sin la tarea no se valida", () => {
    expect(
      pairToCheck({ projectId: web, taskId: design }, { projectId: web, taskId: null }),
    ).toBeNull();
  });

  it("cualquier otro pedido se valida entero (PR-23, PR-71)", () => {
    expect(
      pairToCheck({ projectId: web, taskId: null }, { projectId: app, taskId: null }),
    ).toEqual({ projectId: app, taskId: null });
    expect(
      pairToCheck({ projectId: web, taskId: design }, { projectId: web, taskId: layout }),
    ).toEqual({ projectId: web, taskId: layout });
    expect(
      pairToCheck({ projectId: web, taskId: null }, { projectId: web, taskId: design }),
    ).toEqual({ projectId: web, taskId: design });
    expect(
      pairToCheck({ projectId: web, taskId: design }, { projectId: app, taskId: design }),
    ).toEqual({ projectId: app, taskId: design });
  });

  it("en un alta, todo par con proyecto se valida", () => {
    expect(pairToCheck(empty, { projectId: web, taskId: null })).toEqual({
      projectId: web,
      taskId: null,
    });
    expect(pairToCheck(empty, { projectId: web, taskId: design })).toEqual({
      projectId: web,
      taskId: design,
    });
  });

  it("un id que solo cambia las mayúsculas cuenta como el mismo", () => {
    expect(
      pairToCheck(
        { projectId: web, taskId: design },
        { projectId: web.toUpperCase(), taskId: design.toUpperCase() },
      ),
    ).toBeNull();
    expect(
      pairToCheck(
        { projectId: web, taskId: design },
        { projectId: web.toUpperCase(), taskId: null },
      ),
    ).toBeNull();
  });
});

describe("tagsToCheck (criterio 10 del 11b, §4.5)", () => {
  const archived = "2b3c4d5e-6f70-4182-93a4-b5c6d7e8f901";
  const active = "3c4d5e6f-7081-4293-a4b5-c6d7e8f90a12";
  const other = "4d5e6f70-8192-43a4-b5c6-d7e8f90a1b23";

  it("el mismo conjunto no valida nada, también en otro orden y con otras mayúsculas", () => {
    expect(tagsToCheck([archived, active], [active.toUpperCase(), archived])).toEqual([]);
  });

  it("quitar etiquetas, también una archivada, no valida nada", () => {
    expect(tagsToCheck([archived, active], [active])).toEqual([]);
    expect(tagsToCheck([archived, active], [])).toEqual([]);
  });

  it("agregar valida solo las nuevas", () => {
    expect(tagsToCheck([active], [active, other])).toEqual([other]);
  });

  it("conservar una archivada y agregar una activa valida solo la activa (PR-47)", () => {
    expect(tagsToCheck([archived], [archived, active])).toEqual([active]);
  });

  it("un alta valida todas", () => {
    expect(tagsToCheck([], [archived, active])).toEqual([archived, active]);
  });
});

describe("tagsAfter (criterio 2 del 12, §4.2)", () => {
  const archived = "2b3c4d5e-6f70-4182-93a4-b5c6d7e8f901";
  const active = "3c4d5e6f-7081-4293-a4b5-c6d7e8f90a12";
  const other = "4d5e6f70-8192-43a4-b5c6-d7e8f90a1b23";

  it("«add» suma las pedidas a las que tiene, sin repetir", () => {
    expect(tagsAfter([active], { mode: "add", ids: [active, other] })).toEqual([
      active,
      other,
    ]);
    expect(tagsAfter([], { mode: "add", ids: [other] })).toEqual([other]);
  });

  it("«add» no distingue mayúsculas: una pedida que la fila ya tiene no se repite", () => {
    expect(tagsAfter([active.toUpperCase()], { mode: "add", ids: [active] })).toEqual([
      active,
    ]);
    expect(tagsAfter([active], { mode: "add", ids: [active.toUpperCase()] })).toEqual([
      active,
    ]);
  });

  it("«add» conserva lo que la fila tiene aunque no esté en el catálogo (PR-47)", () => {
    expect(tagsAfter([archived], { mode: "add", ids: [active] })).toEqual([
      archived,
      active,
    ]);
  });

  it("«replace» deja exactamente las pedidas", () => {
    expect(tagsAfter([archived, active], { mode: "replace", ids: [other] })).toEqual([
      other,
    ]);
    expect(tagsAfter([archived], { mode: "replace", ids: [archived, active] })).toEqual([
      archived,
      active,
    ]);
  });

  it("«replace» sin ninguna deja la fila sin etiquetas (D12-3)", () => {
    expect(tagsAfter([archived, active], { mode: "replace", ids: [] })).toEqual([]);
  });
});
