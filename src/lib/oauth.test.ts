import { describe, expect, it } from "vitest";

import {
  isAllowedRedirect,
  isLoopbackRedirect,
  isOAuthLoginQuery,
  oauthQueryOf,
} from "./oauth";

const ALLOWED = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
];

describe("isAllowedRedirect", () => {
  it.each(ALLOWED)("acepta %s, exacta", (uri) => {
    expect(isAllowedRedirect(uri, ALLOWED)).toBe(true);
  });

  it.each([
    ["con barra final", "https://claude.ai/api/mcp/auth_callback/"],
    ["con mayúsculas en el host", "https://CLAUDE.ai/api/mcp/auth_callback"],
    ["con mayúsculas en el camino", "https://claude.ai/api/MCP/auth_callback"],
    ["con otra consulta", "https://claude.ai/api/mcp/auth_callback?x=1"],
    ["por http", "http://claude.ai/api/mcp/auth_callback"],
    [
      "un subdominio que imita",
      "https://chatgpt.com.evil.example/connector_platform_oauth_redirect",
    ],
    ["otro camino del mismo host", "https://claude.ai/otra"],
    ["ajena", "https://evil.example/cb"],
  ])("rechaza una dirección %s", (_case, uri) => {
    expect(isAllowedRedirect(uri, ALLOWED)).toBe(false);
  });

  it.each([
    ["127.0.0.1 con puerto", "http://127.0.0.1:53682/callback"],
    ["127.0.0.1 sin puerto", "http://127.0.0.1/callback"],
    ["localhost con puerto", "http://localhost:3118/callback"],
    ["localhost sin puerto", "http://localhost/callback"],
    ["con otro camino y una consulta", "http://127.0.0.1:4000/callback/XuuuHAzz?x=1"],
  ])("acepta loopback, %s", (_case, uri) => {
    expect(isAllowedRedirect(uri, [])).toBe(true);
  });

  it.each([
    ["localhost con https", "https://localhost:3000/callback"],
    ["127.0.0.2", "http://127.0.0.2:3000/callback"],
    ["un host que empieza con localhost", "http://localhost.evil.example/callback"],
    ["credenciales que esconden el host", "http://localhost@evil.example/callback"],
    ["usuario delante de loopback", "http://evil@127.0.0.1/callback"],
    ["un fragmento", "http://127.0.0.1:4000/callback#x"],
    ["IPv6", "http://[::1]:4000/callback"],
    ["un esquema propio de una app nativa", "com.example.app:/oauth2redirect"],
    ["otro esquema propio con barras", "cursor://anysphere.cursor-mcp/oauth/callback"],
    ["algo que no es una dirección", "no es una url"],
  ])("rechaza %s", (_case, uri) => {
    expect(isAllowedRedirect(uri, ALLOWED)).toBe(false);
  });
});

describe("isLoopbackRedirect", () => {
  it("solo http a localhost o 127.0.0.1", () => {
    expect(isLoopbackRedirect("http://127.0.0.1:9/cb")).toBe(true);
    expect(isLoopbackRedirect("https://claude.ai/api/mcp/auth_callback")).toBe(false);
  });
});

describe("isOAuthLoginQuery", () => {
  it("con sig y client_id", () => {
    expect(isOAuthLoginQuery({ client_id: "abc", sig: "xyz", exp: "1" })).toBe(true);
  });

  it.each([
    ["sin parámetros", {}],
    ["solo error", { error: "sin_invitacion" }],
    ["sin sig", { client_id: "abc" }],
    ["sin client_id", { sig: "xyz" }],
    ["con sig vacío", { client_id: "abc", sig: "" }],
  ])("%s, no", (_case, params) => {
    expect(isOAuthLoginQuery(params)).toBe(false);
  });

  it("un parámetro repetido cuenta como presente", () => {
    expect(isOAuthLoginQuery({ client_id: ["a", "b"], sig: "xyz" })).toBe(true);
  });
});

describe("oauthQueryOf", () => {
  it("arma la consulta con cada parámetro, y los repetidos en su orden", () => {
    const query = oauthQueryOf({
      client_id: "abc",
      resource: ["https://a.example/api/mcp", "https://b.example/api/mcp"],
      scope: "clock offline_access",
      ignored: undefined,
    });

    const params = new URLSearchParams(query);
    expect(params.get("client_id")).toBe("abc");
    expect(params.getAll("resource")).toEqual([
      "https://a.example/api/mcp",
      "https://b.example/api/mcp",
    ]);
    expect(params.get("scope")).toBe("clock offline_access");
    expect(params.has("ignored")).toBe(false);
  });

  it("sin parámetros, vacía", () => {
    expect(oauthQueryOf({})).toBe("");
  });
});
