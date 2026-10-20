"use server";

import { headers } from "next/headers";

import { handle, type ActionResult } from "@/server/action";
import { assertCan } from "@/server/permissions";

import * as service from "./service";
import {
  decideConsentInput,
  mcpMessages,
  revokeGrantInput,
  type DecideConsentInput,
  type DecideConsentResult,
  type McpErrorCode,
  type RevokeGrantInput,
  type RevokeGrantResult,
} from "./schema";

/** D-MCP-5: desconectar un asistente propio desde `/perfil`. */
export async function revokeGrant(
  input: RevokeGrantInput,
): Promise<ActionResult<RevokeGrantResult, McpErrorCode>> {
  return handle(
    async (session) => service.revokeGrant(session.actor, revokeGrantInput.parse(input)),
    {
      paths: ["/perfil"],
      messages: {
        forbidden: mcpMessages.grantForbidden,
        unexpected: mcpMessages.unexpectedRevoke,
      },
    },
  );
}

/**
 * D-MCP-15: «Conectar» o «Cancelar» en `/conectar`. Cancelar no consulta
 * permisos: devuelve al cliente con `access_denied`.
 */
export async function decideConsent(
  input: DecideConsentInput,
): Promise<ActionResult<DecideConsentResult, McpErrorCode>> {
  return handle(
    async (session) => {
      const values = decideConsentInput.parse(input);
      if (values.accept) {
        assertCan(session.actor, "mcp.connect", {
          kind: "workspace",
          workspaceId: session.actor.workspaceId,
        });
      }
      return service.decideConsent(await headers(), values);
    },
    {
      paths: [],
      messages: {
        forbidden: mcpMessages.consentForbidden,
        unexpected: mcpMessages.unexpectedConsent,
      },
    },
  );
}
