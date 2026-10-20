import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubServerEnv } from "@/test/env";

import { mcpAuthErrorResponse } from "./mcp-context";

// La respuesta no lee la base ni Better Auth.
vi.mock("@/server/auth", () => ({}));
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
