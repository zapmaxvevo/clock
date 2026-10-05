import { describe, expect, it } from "vitest";

import { billableFor, NEW_ENTRY_BILLABLE } from "./billable";

const web = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
const app = "6f1c1a52-3c55-4a43-9d0e-0d6b7d0f4d11";

const billableWeb = { id: web, billableByDefault: true };
const plainApp = { id: app, billableByDefault: false };
const billableApp = { id: app, billableByDefault: true };

describe("billableFor", () => {
  it("con «Sin proyecto» conserva el facturable, tenga o no proyecto", () => {
    expect(billableFor({ projectId: web, billable: true }, null)).toBe(true);
    expect(billableFor({ projectId: web, billable: false }, null)).toBe(false);
    expect(billableFor({ projectId: null, billable: true }, null)).toBe(true);
    expect(billableFor(NEW_ENTRY_BILLABLE, null)).toBe(false);
  });

  it("con el mismo proyecto conserva el facturable aunque difiera del por defecto", () => {
    expect(billableFor({ projectId: web, billable: false }, billableWeb)).toBe(false);
    expect(
      billableFor(
        { projectId: app, billable: true },
        { id: app, billableByDefault: false },
      ),
    ).toBe(true);
  });

  it("iguala un id que solo cambia las mayúsculas", () => {
    expect(
      billableFor(
        { projectId: web.toUpperCase(), billable: false },
        { id: web, billableByDefault: true },
      ),
    ).toBe(false);
    expect(
      billableFor(
        { projectId: web, billable: false },
        { ...billableWeb, id: web.toUpperCase() },
      ),
    ).toBe(false);
  });

  it("con otro proyecto impone su por defecto, en los dos sentidos", () => {
    expect(billableFor({ projectId: web, billable: true }, plainApp)).toBe(false);
    expect(billableFor({ projectId: web, billable: false }, billableApp)).toBe(true);
  });

  it("sin proyecto y con uno nuevo impone su por defecto", () => {
    expect(billableFor(NEW_ENTRY_BILLABLE, billableWeb)).toBe(true);
    expect(billableFor({ projectId: null, billable: true }, plainApp)).toBe(false);
  });
});
