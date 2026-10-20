import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubServerEnv } from "@/test/env";

import {
  mcpDisabledPaths,
  mcpIssuer,
  mcpResourceUrl,
  protectedResourceMetadata,
} from "./mcp-auth";

// El gancho decide con la base; estas funciones no la tocan.
vi.mock("@/server/entry", () => ({}));
vi.mock("@/server/user-context", () => ({}));

const OAUTH_PATHS = [
  "/oauth2/authorize",
  "/oauth2/token",
  "/oauth2/register",
  "/oauth2/consent",
  "/oauth2/revoke",
  "/jwks",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
];

beforeEach(() => {
  stubServerEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("las direcciones del recurso y del emisor (D-MCP-2)", () => {
  it("el recurso y el emisor salen del origen, sin barra final", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://clock.example/");

    expect(mcpResourceUrl()).toBe("https://clock.example/api/mcp");
    expect(mcpIssuer()).toBe("https://clock.example/api/auth");
  });

  it("los metadatos del recurso nombran el recurso, el emisor, los dos alcances y la cabecera", () => {
    expect(protectedResourceMetadata()).toEqual({
      resource: "https://clock.example/api/mcp",
      authorization_servers: ["https://clock.example/api/auth"],
      scopes_supported: ["clock", "offline_access"],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("mcpDisabledPaths (D-MCP-2, D-MCP-14)", () => {
  it("encendido, cierra la administración y deja abiertas las rutas OAuth y /jwks", () => {
    vi.stubEnv("MCP_ENABLED", "true");

    const paths = mcpDisabledPaths();

    expect(paths).toContain("/oauth2/client/rotate-keys");
    expect(paths).toContain("/oauth2/create-client");
    expect(paths).toContain("/admin/oauth2/create-client");
    expect(paths).toContain("/oauth2/introspect");
    expect(paths).toContain("/token");
    for (const path of OAUTH_PATHS) {
      expect([path, paths.includes(path)]).toEqual([path, false]);
    }
  });

  it("apagado, cierra además las rutas OAuth, /jwks y los metadatos bajo /api/auth", () => {
    vi.stubEnv("MCP_ENABLED", undefined);

    const paths = mcpDisabledPaths();

    expect(paths).toContain("/oauth2/client/rotate-keys");
    for (const path of OAUTH_PATHS) {
      expect([path, paths.includes(path)]).toEqual([path, true]);
    }
  });
});
