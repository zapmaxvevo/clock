import { afterEach, describe, expect, it, vi } from "vitest";

import { stubServerEnv as stub } from "@/test/env";

import { env } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("las variables del MCP (D-MCP-2, D-MCP-7, D-MCP-14)", () => {
  it("sin declarar, el MCP apagado y las listas por omisión", () => {
    stub({
      MCP_ENABLED: undefined,
      MCP_REDIRECT_URIS: undefined,
      MCP_ALLOWED_ORIGINS: undefined,
    });

    const config = env();

    expect(config.MCP_ENABLED).toBe(false);
    expect(config.MCP_REDIRECT_URIS).toEqual([
      "https://claude.ai/api/mcp/auth_callback",
      "https://chatgpt.com/connector_platform_oauth_redirect",
    ]);
    expect(config.MCP_ALLOWED_ORIGINS).toEqual([
      "https://claude.ai",
      "https://claude.com",
      "https://chatgpt.com",
    ]);
  });

  it("con valores, encendido y las listas separadas por coma, sin vacíos", () => {
    stub({
      MCP_ENABLED: "true",
      MCP_REDIRECT_URIS: " https://a.example/cb , ,https://b.example/cb",
      MCP_ALLOWED_ORIGINS: "https://a.example",
    });

    const config = env();

    expect(config.MCP_ENABLED).toBe(true);
    expect(config.MCP_REDIRECT_URIS).toEqual([
      "https://a.example/cb",
      "https://b.example/cb",
    ]);
    expect(config.MCP_ALLOWED_ORIGINS).toEqual(["https://a.example"]);
  });

  it("MCP_ENABLED en false lo apaga", () => {
    stub({ MCP_ENABLED: "false" });

    expect(env().MCP_ENABLED).toBe(false);
  });

  it.each([
    ["MCP_ENABLED con otro valor", { MCP_ENABLED: "1" }],
    ["una redirección que no es una dirección", { MCP_REDIRECT_URIS: "no-es-url" }],
    ["un origen que no es una dirección", { MCP_ALLOWED_ORIGINS: "claude.ai" }],
  ])("%s no arranca", (_case, values) => {
    stub(values);

    expect(() => env()).toThrow(/Variables de entorno inválidas/);
  });
});
