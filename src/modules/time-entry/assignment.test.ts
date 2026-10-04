import { describe, expect, it } from "vitest";

import { pairToCheck, samePair } from "./assignment";

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

describe("samePair", () => {
  it("compara los dos valores, con los nulos y sin distinguir mayúsculas", () => {
    expect(samePair(empty, empty)).toBe(true);
    expect(
      samePair(
        { projectId: web, taskId: design },
        { projectId: web.toUpperCase(), taskId: design },
      ),
    ).toBe(true);
    expect(
      samePair({ projectId: web, taskId: design }, { projectId: web, taskId: null }),
    ).toBe(false);
    expect(samePair({ projectId: web, taskId: null }, empty)).toBe(false);
    expect(samePair(empty, { projectId: web, taskId: null })).toBe(false);
    expect(
      samePair({ projectId: web, taskId: null }, { projectId: app, taskId: null }),
    ).toBe(false);
  });
});
