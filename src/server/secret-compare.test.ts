import { describe, expect, it } from "vitest";

import { bearerToken, secretEquals } from "./secret-compare";

describe("bearerToken", () => {
  it("extrae el token de una cabecera Bearer", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });

  it("devuelve null sin cabecera o con otro esquema", () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken("Basic abc123")).toBeNull();
    expect(bearerToken("abc123")).toBeNull();
  });
});

describe("secretEquals", () => {
  it("acepta el secreto exacto", () => {
    expect(secretEquals("un-secreto", "un-secreto")).toBe(true);
  });

  it("rechaza un secreto distinto, uno de otro largo y la ausencia", () => {
    expect(secretEquals("otro-secreto", "un-secreto")).toBe(false);
    expect(secretEquals("un-secret", "un-secreto")).toBe(false);
    expect(secretEquals("", "un-secreto")).toBe(false);
    expect(secretEquals(null, "un-secreto")).toBe(false);
  });

  it("rechaza un prefijo correcto, que es lo que buscaría un ataque de tiempo", () => {
    expect(secretEquals("un-secreto-y-mas", "un-secreto")).toBe(false);
  });
});
