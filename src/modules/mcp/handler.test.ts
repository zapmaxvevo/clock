import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { stubServerEnv } from "@/test/env";

import { handleMcpRequest } from "./handler";
import { mcpMessages } from "./schema";

const readMcpContext = vi.hoisted(() => vi.fn<() => Promise<unknown>>());

// El recurso sin la base ni Better Auth: la lectura del token es la que falla.
vi.mock("@/server/auth", () => ({}));
vi.mock("@/server/mcp-auth", () => ({}));
vi.mock("@/server/mcp-context", () => ({ readMcpContext }));
vi.mock("./service", () => ({}));
vi.mock("./tools", () => ({}));

beforeEach(() => {
  stubServerEnv({ MCP_ENABLED: "true" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  readMcpContext.mockReset();
});

describe("handleMcpRequest (D-MCP-7)", () => {
  it("si leer el token falla, 500 JSON-RPC -32603 con unexpected, no-store y console.error", async () => {
    const failure = new Error("la base no responde");
    readMcpContext.mockRejectedValue(failure);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await handleMcpRequest(
      new Request("https://clock.example/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      jsonrpc: "2.0",
      error: { code: -32603, message: mcpMessages.unexpected },
      id: null,
    });
    expect(consoleError).toHaveBeenCalledWith(failure);
  });
});
