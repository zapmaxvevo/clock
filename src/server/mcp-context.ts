/**
 * La verificación del recurso MCP (ADR 0026, D-MCP-3): de un token a un actor,
 * en cada pedido, con la misma regla que una sesión. Y el consentimiento de
 * `/conectar` (D-MCP-15), que llama al plugin con la sesión del pedido.
 */

import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { isAPIError } from "better-auth/api";
import { verifyJwsAccessToken } from "better-auth/oauth2";
import { z } from "zod";

import { MCP_SCOPES } from "@/modules/mcp/schema";
import { auth } from "@/server/auth";
import { findSessionUser } from "@/server/auth-records";
import { env } from "@/server/env";
import { mcpIssuer, mcpResourceUrl } from "@/server/mcp-auth";
import { hasGrant } from "@/server/oauth-records";
import { can } from "@/server/permissions";
import { readUserContext, type SessionContext } from "@/server/user-context";

/** Lo que el token dice, ya verificado (D-MCP-3, pasos 1 a 4). */
export type McpGrant = {
  /** `sub`. */
  readonly userId: string;
  /** `azp`. */
  readonly clientId: string;
  readonly scopes: readonly string[];
  /** `exp`, en segundos. */
  readonly expiresAt: number;
};

/** El contexto de la sesión con el actor marcado con su cliente (D-MCP-12). */
export type McpContext = SessionContext;

export type McpContextRead =
  | {
      readonly kind: "unauthorized";
      readonly error: "invalid_request" | "invalid_token" | null;
    }
  | { readonly kind: "insufficient_scope" }
  | { readonly kind: "ready"; readonly context: McpContext; readonly grant: McpGrant };

const SCOPE_CHALLENGE = MCP_SCOPES.join(" ");

/** El alcance sin el cual un token no ve nada. */
const REQUIRED_SCOPE = "clock";

/**
 * La llave de la caché por instancia de las claves públicas de `jwks`, que
 * `verifyJwsAccessToken` guarda en un `WeakMap`: material público, no estado de
 * la aplicación. Una clave nueva la recarga al no encontrar el `kid`.
 */
const JWKS_CACHE_KEY = Object.freeze({});

const BEARER = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/;

const UNAUTHORIZED = { kind: "unauthorized", error: "invalid_token" } as const;

const claims = z.object({
  sub: z.string().min(1),
  azp: z.string().min(1),
  scope: z.string(),
  exp: z.number(),
});

/** D-MCP-3, paso 2: el token verificado en el proceso, o `null` si no pasa. */
async function verifiedClaims(token: string): Promise<z.infer<typeof claims> | null> {
  try {
    const payload = await verifyJwsAccessToken(token, {
      jwksFetch: () => auth.api.getJwks(),
      jwksCacheKey: JWKS_CACHE_KEY,
      verifyOptions: { issuer: mcpIssuer(), audience: mcpResourceUrl(), typ: "at+jwt" },
    });
    const parsed = claims.safeParse(payload);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * D-MCP-3, los siete pasos. El paso 2 es `verifyJwsAccessToken` con
 * `verifyOptions: { issuer: mcpIssuer(), audience: mcpResourceUrl(), typ: "at+jwt" }`.
 * No lanza por un token malo: lo dice el resultado. No mira `sid`: el token no
 * queda atado a la sesión web.
 */
export async function readMcpContext(request: Request): Promise<McpContextRead> {
  const header = request.headers.get("authorization");
  if (header === null) {
    return { kind: "unauthorized", error: null };
  }
  const token = BEARER.exec(header)?.[1];
  if (token === undefined) {
    return { kind: "unauthorized", error: "invalid_request" };
  }
  const verified = await verifiedClaims(token);
  if (verified === null) {
    return UNAUTHORIZED;
  }
  const scopes = verified.scope.split(" ").filter(Boolean);
  if (!scopes.includes(REQUIRED_SCOPE)) {
    return { kind: "insufficient_scope" };
  }
  // El corte de revocación: desconectar o desactivar borra el consentimiento.
  if (!(await hasGrant(verified.sub, verified.azp))) {
    return UNAUTHORIZED;
  }
  const user = await findSessionUser(verified.sub);
  if (user === undefined) {
    return UNAUTHORIZED;
  }
  const read = await readUserContext(user);
  if (read.kind !== "ready") {
    return UNAUTHORIZED;
  }
  const { actor } = read.context;
  // Más estricto que la pantalla: una membresía inactiva no ve nada.
  if (!can(actor, "mcp.connect", { kind: "workspace", workspaceId: actor.workspaceId })) {
    return UNAUTHORIZED;
  }
  return {
    kind: "ready",
    context: { ...read.context, actor: { ...actor, oauthClientId: verified.azp } },
    grant: {
      userId: verified.sub,
      clientId: verified.azp,
      scopes,
      expiresAt: verified.exp,
    },
  };
}

/** D-MCP-2: la dirección de los metadatos del recurso, con el camino del recurso. */
function resourceMetadataUrl(): string {
  return `${new URL(mcpResourceUrl()).origin}/.well-known/oauth-protected-resource/api/mcp`;
}

/**
 * 401 o 403 con `WWW-Authenticate: Bearer resource_metadata="<…>/.well-known/
 * oauth-protected-resource/api/mcp", scope="clock offline_access"[, error="…"]`.
 */
export function mcpAuthErrorResponse(
  read: Exclude<McpContextRead, { kind: "ready" }>,
): Response {
  const error = read.kind === "insufficient_scope" ? "insufficient_scope" : read.error;
  const challenge = [
    `Bearer resource_metadata="${resourceMetadataUrl()}"`,
    `scope="${SCOPE_CHALLENGE}"`,
    ...(error === null ? [] : [`error="${error}"`]),
  ].join(", ");
  return new Response(null, {
    status: read.kind === "insufficient_scope" ? 403 : 401,
    headers: { "WWW-Authenticate": challenge, "Cache-Control": "no-store" },
  });
}

const consentRedirect = z.object({ url: z.string().min(1) });

/**
 * D-MCP-15: `POST /oauth2/consent { accept, oauth_query }` con las cabeceras del
 * pedido más `accept: application/json`; devuelve el `url` de `{ redirect: true,
 * url }`, o `expired` si la consulta venció o no verifica.
 */
export async function submitConsent(
  requestHeaders: Headers,
  oauthQuery: string,
  accept: boolean,
): Promise<{ readonly redirectTo: string } | "expired"> {
  if (!(await verifyOAuthQueryParams(oauthQuery, env().BETTER_AUTH_SECRET))) {
    return "expired";
  }
  const headers = new Headers(requestHeaders);
  // Así el plugin responde `{ redirect: true, url }` en lugar de lanzar un `FOUND`.
  headers.set("accept", "application/json");
  const body = { accept, oauth_query: oauthQuery };
  try {
    const response: unknown = await auth.api.oauth2Consent({
      body,
      headers,
      // El `authorize` interno que emite el código exige el pedido.
      request: new Request(`${mcpIssuer()}/oauth2/consent`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
      asResponse: false,
    });
    return { redirectTo: consentRedirect.parse(response).url };
  } catch (error) {
    // La consulta pudo vencer entre la verificación y el gancho del plugin.
    if (isAPIError(error) && error.body?.error === "invalid_signature") {
      return "expired";
    }
    throw error;
  }
}
