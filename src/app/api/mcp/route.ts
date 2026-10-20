import { handleMcpRequest, mcpMethodNotAllowed } from "@/modules/mcp/handler";

export const dynamic = "force-dynamic";

/** D-MCP-7: el servidor MCP, sin estado. Fuera de `(app)`: autentica por token. */
export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export function GET(): Response {
  return mcpMethodNotAllowed();
}

export function DELETE(): Response {
  return mcpMethodNotAllowed();
}
