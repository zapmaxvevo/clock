import { handleMcpRequest, mcpMethodNotAllowed } from "@/modules/mcp/handler";
import { captureMcpRequest } from "@/server/mcp-v7-capture";

export const dynamic = "force-dynamic";

/** D-MCP-7: el servidor MCP, sin estado. Fuera de `(app)`: autentica por token. */
export async function POST(request: Request): Promise<Response> {
  await captureMcpRequest(request);
  return handleMcpRequest(request);
}

export async function GET(request?: Request): Promise<Response> {
  if (request !== undefined) {
    await captureMcpRequest(request);
  }
  return mcpMethodNotAllowed();
}

export async function DELETE(request?: Request): Promise<Response> {
  if (request !== undefined) {
    await captureMcpRequest(request);
  }
  return mcpMethodNotAllowed();
}
