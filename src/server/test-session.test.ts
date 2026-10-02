import { afterEach, describe, expect, it } from "vitest";

import { testSessionEnabled } from "./test-session";

const original = {
  secret: process.env.E2E_TEST_SESSION_SECRET,
  vercelEnv: process.env.VERCEL_ENV,
};

function setEnv(secret: string | undefined, vercelEnv: string | undefined): void {
  if (secret === undefined) {
    delete process.env.E2E_TEST_SESSION_SECRET;
  } else {
    process.env.E2E_TEST_SESSION_SECRET = secret;
  }
  if (vercelEnv === undefined) {
    delete process.env.VERCEL_ENV;
  } else {
    process.env.VERCEL_ENV = vercelEnv;
  }
}

afterEach(() => {
  setEnv(original.secret, original.vercelEnv);
});

describe("testSessionEnabled", () => {
  it("queda apagado en producción aunque el secreto esté cargado", () => {
    setEnv("un-secreto", "production");
    expect(testSessionEnabled()).toBe(false);
  });

  it("queda apagado sin secreto, incluso fuera de producción", () => {
    setEnv(undefined, "preview");
    expect(testSessionEnabled()).toBe(false);
    setEnv("", "preview");
    expect(testSessionEnabled()).toBe(false);
  });

  it("se enciende en preview con el secreto cargado", () => {
    setEnv("un-secreto", "preview");
    expect(testSessionEnabled()).toBe(true);
  });

  it("se enciende en local, donde no hay entorno de Vercel", () => {
    setEnv("un-secreto", undefined);
    expect(testSessionEnabled()).toBe(true);
  });
});
