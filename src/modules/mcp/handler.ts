import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { auth } from "@/server/auth";
import { env } from "@/server/env";
import { protectedResourceMetadata } from "@/server/mcp-auth";
import {
  mcpAuthErrorResponse,
  readMcpContext,
  type McpContext,
} from "@/server/mcp-context";

import { mcpMessages } from "./schema";
import { consumeCall } from "./service";
import { registerTools } from "./tools";

/** D-MCP-13: el tope del cuerpo de un `POST`; el transporte responde 413. */
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const SERVER_INFO = { name: "clock", version: "1.0.0" } as const;

/** D-MCP-7: los metadatos son públicos y cambian solo con un despliegue. */
const METADATA_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
} as const;

function notFound(): Response {
  return new Response(null, { status: 404 });
}

/** Una respuesta JSON-RPC de error fuera de una herramienta, sin `id`. */
function jsonRpcError(
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { jsonrpc: "2.0", error: { code, message }, id: null },
    { status, headers: { "Cache-Control": "no-store", ...headers } },
  );
}

/**
 * D-MCP-7: un `Origin` que no es el propio ni uno de `MCP_ALLOWED_ORIGINS` es
 * DNS rebinding o un sitio ajeno. Sin `Origin`, como llegan los pedidos de
 * servidor a servidor, pasa.
 */
function isAllowedOrigin(origin: string | null): boolean {
  if (origin === null) {
    return true;
  }
  const config = env();
  const allowed = [config.BETTER_AUTH_URL, ...config.MCP_ALLOWED_ORIGINS].map(
    (url) => new URL(url).origin,
  );
  return allowed.includes(origin);
}

/** D-MCP-7: un servidor y un transporte por pedido; no queda nada en memoria. */
async function serve(request: Request, context: McpContext): Promise<Response> {
  const server = new McpServer(SERVER_INFO);
  registerTools(server, context);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
  });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

/** D-MCP-7: el `POST` de `/api/mcp`. */
export async function handleMcpRequest(request: Request): Promise<Response> {
  if (!env().MCP_ENABLED) {
    return notFound();
  }
  if (!isAllowedOrigin(request.headers.get("origin"))) {
    return new Response(null, { status: 403 });
  }
  try {
    const read = await readMcpContext(request);
    if (read.kind !== "ready") {
      return mcpAuthErrorResponse(read);
    }
    if (!(await consumeCall(read.context.actor.userId))) {
      return jsonRpcError(429, -32000, mcpMessages.rateLimited, { "Retry-After": "60" });
    }
    const response = await serve(request, read.context);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error(error);
    return jsonRpcError(500, -32603, mcpMessages.unexpected);
  }
}

/** D-MCP-7: `GET` y `DELETE`: 405 con `Allow: POST`, o 404 con el MCP apagado. */
export function mcpMethodNotAllowed(): Response {
  if (!env().MCP_ENABLED) {
    return notFound();
  }
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

/** D-MCP-2: los metadatos del recurso protegido (RFC 9728), o 404 con el MCP apagado. */
export function protectedResourceMetadataResponse(): Response {
  if (!env().MCP_ENABLED) {
    return notFound();
  }
  return Response.json(protectedResourceMetadata(), { headers: METADATA_HEADERS });
}

/** D-MCP-2: los metadatos del servidor de autorización (RFC 8414), o 404 con el MCP apagado. */
export async function authServerMetadataResponse(request: Request): Promise<Response> {
  if (!env().MCP_ENABLED) {
    return notFound();
  }
  return oauthProviderAuthServerMetadata(auth, { headers: METADATA_HEADERS })(request);
}
