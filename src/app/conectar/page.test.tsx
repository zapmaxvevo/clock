import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ConsentView } from "@/modules/mcp/schema";
import { stubServerEnv } from "@/test/env";
import { textOf } from "@/test/markup";

import ConnectPage from "./page";

const SESSION = { user: { id: "u-1" } };

const READY: ConsentView = {
  kind: "ready",
  oauthQuery: "client_id=cliente-de-prueba&sig=firma-de-prueba",
  clientName: "Asistente de prueba",
  returnsTo: "esta computadora",
  email: "persona@empresa.com",
  seesTeam: false,
};

// La sesión y la vista cargan la base y Better Auth; acá las dan los dobles.
const requireSession = vi.hoisted(() => vi.fn());
vi.mock("@/server/session", () => ({ requireSession }));
const getConsentView = vi.hoisted(() => vi.fn());
vi.mock("@/modules/mcp/service", () => ({ getConsentView }));
vi.mock("@/modules/mcp/actions", () => ({ decideConsent: vi.fn() }));

// Como el de Next, `notFound` corta el render.
const notFound = vi.hoisted(() =>
  vi.fn((): never => {
    throw new Error("notFound");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const query = { client_id: "cliente-de-prueba", sig: "firma-de-prueba" };

async function render(): Promise<string> {
  return renderToStaticMarkup(
    await ConnectPage({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("ConnectPage", () => {
  it("con el MCP apagado, corta con notFound antes de pedir la sesión (criterio 16)", async () => {
    stubServerEnv({ MCP_ENABLED: undefined });

    await expect(render()).rejects.toThrow("notFound");
    expect(notFound).toHaveBeenCalledOnce();
    expect(requireSession).not.toHaveBeenCalled();
    expect(getConsentView).not.toHaveBeenCalled();
  });

  it("con el MCP encendido, pide la sesión y la vista y dibuja la pantalla", async () => {
    stubServerEnv({ MCP_ENABLED: "true" });
    requireSession.mockResolvedValue(SESSION);
    getConsentView.mockResolvedValue(READY);

    const text = textOf(await render());

    expect(notFound).not.toHaveBeenCalled();
    expect(getConsentView).toHaveBeenCalledExactlyOnceWith(SESSION, query);
    expect(text).toContain("Conectar Asistente de prueba con Clock");
    expect(text).toContain("Vuelve a: esta computadora");
    expect(text).toContain("persona@empresa.com");
  });

  it("si la vista llega `disabled`, también corta con notFound", async () => {
    stubServerEnv({ MCP_ENABLED: "true" });
    requireSession.mockResolvedValue(SESSION);
    getConsentView.mockResolvedValue({ kind: "disabled" });

    await expect(render()).rejects.toThrow("notFound");
    expect(notFound).toHaveBeenCalledOnce();
  });
});
