import { authServerMetadataResponse } from "@/modules/mcp/handler";

export const dynamic = "force-dynamic";

/** D-MCP-2: los metadatos del servidor de autorización (RFC 8414). */
export async function GET(request: Request): Promise<Response> {
  return authServerMetadataResponse(request);
}
