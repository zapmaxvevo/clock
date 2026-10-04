import { describe, expect, it } from "vitest";

import { sameId, samePair } from "./project-pair";

const web = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
const app = "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11";
const design = "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c";

const empty = { projectId: null, taskId: null };

describe("sameId", () => {
  it("no distingue mayúsculas y solo iguala un nulo con otro", () => {
    expect(sameId(web, web.toUpperCase())).toBe(true);
    expect(sameId(web, app)).toBe(false);
    expect(sameId(null, null)).toBe(true);
    expect(sameId(web, null)).toBe(false);
    expect(sameId(null, web)).toBe(false);
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
