import { protectedResourceMetadataResponse } from "@/modules/mcp/handler";

export const dynamic = "force-dynamic";

/** D-MCP-2: los metadatos del recurso protegido (RFC 9728). */
export function GET(): Response {
  return protectedResourceMetadataResponse();
}
