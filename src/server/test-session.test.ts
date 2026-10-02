import { afterEach, describe, expect, it } from "vitest";

import { assertTestSessionNotInProduction, testSessionEnabled } from "./test-session";

const original = {
  secret: process.env.E2E_TEST_SESSION_SECRET,
  vercelEnv: process.env.VERCEL_ENV,
  allow: process.env.ALLOW_TEST_SESSION,
};

const validSecret = "un-secreto-de-al-menos-32-caracteres-xx";

function set(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

// `allow` es obligatorio a propósito: con un valor por defecto, pasarle
// `undefined` para borrar la variable aplicaría el default y el test mentiría.
function setEnv(
  secret: string | undefined,
  vercelEnv: string | undefined,
  allow: string | undefined,
): void {
  set("E2E_TEST_SESSION_SECRET", secret);
  set("VERCEL_ENV", vercelEnv);
  set("ALLOW_TEST_SESSION", allow);
}

afterEach(() => {
  setEnv(original.secret, original.vercelEnv, original.allow);
});

describe("testSessionEnabled", () => {
  it("queda apagado sin el opt-in explícito, aunque todo lo demás esté bien", () => {
    setEnv(validSecret, "preview", undefined);
    expect(testSessionEnabled()).toBe(false);
    setEnv(validSecret, undefined, undefined);
    expect(testSessionEnabled()).toBe(false);
  });

  it("queda apagado sin entorno de Vercel y sin opt-in: no falla abierto", () => {
    setEnv(validSecret, undefined, undefined);
    expect(testSessionEnabled()).toBe(false);
  });

  it("queda apagado en producción aunque el secreto y el opt-in estén cargados", () => {
    setEnv(validSecret, "production", "true");
    expect(testSessionEnabled()).toBe(false);
  });

  it("rechaza un secreto corto", () => {
    setEnv("corto", "preview", "true");
    expect(testSessionEnabled()).toBe(false);
  });

  it("queda apagado sin secreto, incluso fuera de producción", () => {
    setEnv(undefined, "preview", "true");
    expect(testSessionEnabled()).toBe(false);
    setEnv("", "preview", "true");
    expect(testSessionEnabled()).toBe(false);
  });

  it("se enciende en preview con el opt-in y el secreto cargados", () => {
    setEnv(validSecret, "preview", "true");
    expect(testSessionEnabled()).toBe(true);
  });

  it("se enciende en local, donde no hay entorno de Vercel", () => {
    setEnv(validSecret, undefined, "true");
    expect(testSessionEnabled()).toBe(true);
  });
});

describe("assertTestSessionNotInProduction", () => {
  it("rompe si el opt-in llega a producción", () => {
    setEnv(undefined, "production", "true");
    expect(() => assertTestSessionNotInProduction()).toThrow(/ALLOW_TEST_SESSION/);
  });

  it("rompe si el secreto llega a producción", () => {
    setEnv(validSecret, "production", undefined);
    expect(() => assertTestSessionNotInProduction()).toThrow(/E2E_TEST_SESSION_SECRET/);
  });

  it("no dice nada fuera de producción", () => {
    setEnv(validSecret, "preview", "true");
    expect(() => assertTestSessionNotInProduction()).not.toThrow();
  });

  it("no dice nada en producción cuando ninguna de las dos variables está", () => {
    setEnv(undefined, "production", undefined);
    expect(() => assertTestSessionNotInProduction()).not.toThrow();
  });
});
