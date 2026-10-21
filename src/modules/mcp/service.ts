import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";

import { isLoopbackRedirect, oauthQueryOf } from "@/lib/oauth";
import { DomainError } from "@/server/errors";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { mcpResourceUrl } from "@/server/mcp-auth";
import { submitConsent } from "@/server/mcp-context";
import { deleteGrant, findClientName, listGrantsOf } from "@/server/oauth-records";
import { assertCan, can, type Actor } from "@/server/permissions";
import { dayKey, formatDayKey } from "@/server/time";
import type { SessionContext } from "@/server/user-context";
import { ownProfileResource, type ProfileContext } from "@/modules/profile/service";

import { mcpRepository } from "./repository";
import {
  MCP_CALLS_PER_MINUTE,
  mcpMessages,
  mcpViewTexts,
  type ConsentRead,
  type DecideConsentInput,
  type DecideConsentResult,
  type GrantsView,
  type McpErrorCode,
  type RevokeGrantInput,
  type RevokeGrantResult,
} from "./schema";

/** Error de dominio del módulo. La action y la herramienta lo traducen con `failureOf`. */
export class McpError extends DomainError<McpErrorCode> {
  constructor(code: McpErrorCode, message: string) {
    super(code, message);
    this.name = "McpError";
  }
}

/** D-MCP-13: `true` si el pedido entra en el minuto. */
export async function consumeCall(userId: string): Promise<boolean> {
  return (await mcpRepository.consumeCall(userId)) <= MCP_CALLS_PER_MINUTE;
}

/**
 * Adónde vuelve un cliente, para la pantalla: el host de la redirección, o «esta
 * computadora» si es loopback. Lo que se puede creer del cliente es esto, no
 * el nombre que declara.
 */
function returnsToOf(redirectUri: string): string {
  if (isLoopbackRedirect(redirectUri)) {
    return mcpViewTexts.loopback;
  }
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

/** El nombre que declaró el cliente, o «Asistente sin nombre». */
function clientNameOf(name: string | null): string {
  const trimmed = name?.trim() ?? "";
  return trimmed === "" ? mcpViewTexts.unnamedClient : trimmed;
}

/** El recurso de `mcp.connect`: el workspace de quien pide. */
export function workspaceResource(actor: Actor) {
  return { kind: "workspace", workspaceId: actor.workspaceId } as const;
}

/** D-MCP-5, §5.3: las autorizaciones propias, una por cliente; `disabled` con el MCP apagado. */
export async function getGrantsView(context: ProfileContext): Promise<GrantsView> {
  if (!env().MCP_ENABLED) {
    return { kind: "disabled" };
  }
  const { actor, preferences } = context;
  const grants = await db.transaction((tx) => listGrantsOf(tx, actor.userId));
  return {
    kind: "ready",
    serverUrl: mcpResourceUrl(),
    grants: grants.map((grant) => ({
      clientId: grant.clientId,
      name: clientNameOf(grant.clientName),
      // El registro exige al menos una redirección.
      returnsTo: returnsToOf(grant.redirectUris.at(0) ?? ""),
      grantedOn: formatDayKey(
        dayKey(grant.grantedAt, preferences.timezone),
        preferences.dateFormat,
        true,
      ),
    })),
    canRevoke: can(actor, "mcp.grant.revoke", ownProfileResource(actor)),
  };
}

/** D-MCP-5: `mcp.grant.revoke`, después `deleteGrant` en una transacción. Idempotente. */
export async function revokeGrant(
  actor: Actor,
  input: RevokeGrantInput,
): Promise<RevokeGrantResult> {
  assertCan(actor, "mcp.grant.revoke", ownProfileResource(actor));
  await db.transaction((tx) => deleteGrant(tx, actor, input.clientId));
  return { clientId: input.clientId };
}

function firstOf(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : value?.at(0);
}

/**
 * D-MCP-15, §5.1: lo que muestra `/conectar`; `disabled` con el MCP apagado. Arma
 * la consulta con `oauthQueryOf`, la verifica con `verifyOAuthQueryParams` y su
 * `exp`, y saca el destino del `redirect_uri` firmado y el nombre de
 * `findClientName(client_id)`.
 */
export async function getConsentView(
  context: SessionContext,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<ConsentRead> {
  if (!env().MCP_ENABLED) {
    return { kind: "disabled" };
  }
  const oauthQuery = oauthQueryOf(searchParams);
  const clientId = firstOf(searchParams.client_id);
  const redirectUri = firstOf(searchParams.redirect_uri);
  if (
    clientId === undefined ||
    redirectUri === undefined ||
    !(await verifyOAuthQueryParams(oauthQuery, env().BETTER_AUTH_SECRET))
  ) {
    return { kind: "invalid" };
  }
  const client = await findClientName(clientId);
  if (client === undefined) {
    return { kind: "invalid" };
  }
  if (!can(context.actor, "mcp.connect", workspaceResource(context.actor))) {
    return { kind: "forbidden", oauthQuery };
  }
  return {
    kind: "ready",
    oauthQuery,
    clientName: clientNameOf(client.name),
    returnsTo: returnsToOf(redirectUri),
    email: context.user.email,
  };
}

/**
 * D-MCP-15: manda la decisión al plugin con la sesión del pedido y devuelve
 * adónde sigue el navegador. Una consulta vencida, que no verifica, o con el MCP
 * apagado responde `consent_expired`. Los permisos los decide la action.
 */
export async function decideConsent(
  requestHeaders: Headers,
  input: DecideConsentInput,
): Promise<DecideConsentResult> {
  const result = env().MCP_ENABLED
    ? await submitConsent(requestHeaders, input.oauthQuery, input.accept)
    : "expired";
  if (result === "expired") {
    throw new McpError("consent_expired", mcpMessages.consentExpired);
  }
  return result;
}
