import { describe, expect, it } from "vitest";

import { changedProjectFields, previousOf } from "./changes";
import type { ProjectSettings } from "./schema";

const id = "6f1c2a4e-3b5d-4e7f-8a9b-0c1d2e3f4a5b";
const acme = "0b5e8d5e-3c2f-4b7a-9f1a-2c3d4e5f6a7b";
const globex = "9a7c2b1e-4d3f-4e8a-8b6c-5d4e3f2a1b0c";

const stored: ProjectSettings = {
  id,
  name: "Web",
  clientId: acme,
  color: "teal",
  note: "Sitio",
  billableByDefault: false,
};

describe("changedProjectFields (D-P1-3)", () => {
  it("sin campos, no cambia nada", () => {
    expect(changedProjectFields(stored, { id })).toEqual({});
  });

  it("los mismos valores no cambian nada", () => {
    expect(
      changedProjectFields(stored, {
        id,
        name: "Web",
        clientId: acme,
        color: "teal",
        note: "Sitio",
        billableByDefault: false,
      }),
    ).toEqual({});
  });

  it("cada campo distinto cambia solo", () => {
    expect(changedProjectFields(stored, { id, name: "App" })).toEqual({ name: "App" });
    expect(changedProjectFields(stored, { id, clientId: globex })).toEqual({
      clientId: globex,
    });
    expect(changedProjectFields(stored, { id, color: "red" })).toEqual({ color: "red" });
    expect(changedProjectFields(stored, { id, note: "" })).toEqual({ note: "" });
    expect(changedProjectFields(stored, { id, billableByDefault: true })).toEqual({
      billableByDefault: true,
    });
  });

  it("el nombre con otra capitalización es un cambio", () => {
    expect(changedProjectFields(stored, { id, name: "WEB" })).toEqual({ name: "WEB" });
  });

  it("el cliente en mayúsculas es el mismo: la base no los distingue", () => {
    expect(changedProjectFields(stored, { id, clientId: acme.toUpperCase() })).toEqual(
      {},
    );
  });

  it("pasar a «Sin cliente» es un cambio, y quedarse sin cliente no", () => {
    expect(changedProjectFields(stored, { id, clientId: null })).toEqual({
      clientId: null,
    });
    expect(
      changedProjectFields({ ...stored, clientId: null }, { id, clientId: null }),
    ).toEqual({});
    expect(
      changedProjectFields({ ...stored, clientId: null }, { id, clientId: acme }),
    ).toEqual({ clientId: acme });
  });

  it("junta solo los campos que difieren", () => {
    expect(
      changedProjectFields(stored, {
        id,
        name: "Web",
        color: "red",
        note: "Sitio",
        billableByDefault: true,
      }),
    ).toEqual({ color: "red", billableByDefault: true });
  });
});

describe("previousOf (§4.5)", () => {
  it("trae el valor guardado de cada campo que cambia, y nada más", () => {
    expect(previousOf(stored, { name: "App", billableByDefault: true })).toEqual({
      name: "Web",
      billableByDefault: false,
    });
    expect(previousOf(stored, { clientId: null })).toEqual({ clientId: acme });
    expect(previousOf(stored, { color: "red", note: "" })).toEqual({
      color: "teal",
      note: "Sitio",
    });
  });

  it("el cliente anterior nulo también se nombra", () => {
    expect(previousOf({ ...stored, clientId: null }, { clientId: acme })).toEqual({
      clientId: null,
    });
  });
});
