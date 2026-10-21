import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubServerEnv } from "@/test/env";

import { mcpAuthErrorResponse, readMcpContext } from "./mcp-context";

const getJwks = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

// La respuesta no lee la base, y de Better Auth solo se piden las claves.
vi.mock("@/server/auth", () => ({ auth: { api: { getJwks } } }));
vi.mock("@/server/auth-records", () => ({}));
vi.mock("@/server/oauth-records", () => ({}));
vi.mock("@/server/entry", () => ({}));
vi.mock("@/server/user-context", () => ({}));

const METADATA = "https://clock.example/.well-known/oauth-protected-resource/api/mcp";

beforeEach(() => {
  stubServerEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  getJwks.mockReset();
});

/** Un pedido a `/api/mcp` con `authorization`. */
function requestWith(authorization: string): Request {
  return new Request("https://clock.example/api/mcp", {
    method: "POST",
    headers: { authorization },
  });
}

/** Un JWS con una cabecera legible y una firma que no verifica con ninguna clave. */
const UNSIGNED_TOKEN = [
  Buffer.from(JSON.stringify({ alg: "EdDSA", kid: "k1", typ: "at+jwt" })).toString(
    "base64url",
  ),
  Buffer.from("{}").toString("base64url"),
  "firma",
].join(".");

describe("readMcpContext (D-MCP-3)", () => {
  it.each(["Bearer", "bearer", "BEARER"])(
    "el esquema %s se lee: un token que no es JWS da invalid_token",
    async (scheme) => {
      await expect(
        readMcpContext(requestWith(`${scheme} no-es-un-jws`)),
      ).resolves.toEqual({
        kind: "unauthorized",
        error: "invalid_token",
      });
      expect(getJwks).not.toHaveBeenCalled();
    },
  );

  it("otro esquema da invalid_request", async () => {
    await expect(readMcpContext(requestWith(`Basic ${UNSIGNED_TOKEN}`))).resolves.toEqual(
      {
        kind: "unauthorized",
        error: "invalid_request",
      },
    );
  });

  it("un token que no verifica con las claves da invalid_token", async () => {
    getJwks.mockResolvedValue({ keys: [] });

    await expect(
      readMcpContext(requestWith(`Bearer ${UNSIGNED_TOKEN}`)),
    ).resolves.toEqual({
      kind: "unauthorized",
      error: "invalid_token",
    });
  });

  it("una falla al leer las claves se relanza, no es un token inválido", async () => {
    const failure = new Error("la base no responde");
    getJwks.mockRejectedValue(failure);

    await expect(readMcpContext(requestWith(`Bearer ${UNSIGNED_TOKEN}`))).rejects.toBe(
      failure,
    );
  });
});

describe("mcpAuthErrorResponse (D-MCP-3)", () => {
  it("sin token, 401 con los metadatos y los dos alcances, sin error", () => {
    const response = mcpAuthErrorResponse({ kind: "unauthorized", error: null });

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${METADATA}", scope="clock offline_access"`,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["invalid_token", "invalid_request"] as const)(
    "con %s, 401 con el error",
    (error) => {
      const response = mcpAuthErrorResponse({ kind: "unauthorized", error });

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe(
        `Bearer resource_metadata="${METADATA}", scope="clock offline_access", error="${error}"`,
      );
    },
  );

  it("sin el alcance, 403 insufficient_scope que pide los dos", () => {
    const response = mcpAuthErrorResponse({ kind: "insufficient_scope" });

    expect(response.status).toBe(403);
    expect(response.headers.get("www-authenticate")).toBe(
      `Bearer resource_metadata="${METADATA}", scope="clock offline_access", error="insufficient_scope"`,
    );
  });
});
