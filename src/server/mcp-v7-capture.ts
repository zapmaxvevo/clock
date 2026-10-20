/**
 * TEMPORAL (§6.6, V-7): lo que mandan los clientes reales al preview, en una
 * línea `[mcp-v7]` por pedido. Nunca un código, un verificador, un secreto ni un
 * token. Se revierte antes del merge.
 */

const PREFIX = "[mcp-v7]";

const REDACTED_REGISTRATION_FIELDS = new Set([
  "client_secret",
  "registration_access_token",
  "software_statement",
]);

function emit(point: string, data: Record<string, unknown>): void {
  // eslint-disable-next-line no-console -- temporal, se revierte antes del merge
  console.info(PREFIX, JSON.stringify({ point, ...data }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asHeaders(headers: HeadersInit | undefined): Headers {
  return new Headers(headers ?? undefined);
}

function common(headers: Headers): Record<string, unknown> {
  return {
    origin: headers.get("origin"),
    userAgent: headers.get("user-agent"),
  };
}

/** El `client_id` de un `Authorization: Basic`, sin tocar el secreto. */
function basicClientId(authorization: string): string | null {
  try {
    const decoded = atob(authorization.slice("Basic ".length).trim());
    const separator = decoded.indexOf(":");
    return decodeURIComponent(separator === -1 ? decoded : decoded.slice(0, separator));
  } catch {
    return null;
  }
}

function tokenAuthMethod(
  authorization: string | null,
  body: Record<string, unknown>,
): string {
  if (authorization?.startsWith("Basic ")) {
    return "client_secret_basic";
  }
  if (body.client_assertion !== undefined) {
    return `client_assertion:${String(body.client_assertion_type)}`;
  }
  if (body.client_secret !== undefined) {
    return "client_secret_post";
  }
  return "none";
}

/** Desde `mcpAuthMiddleware`: registro, autorización e intercambio del token. */
export function captureAuthRequest(ctx: {
  path: string;
  headers?: HeadersInit | undefined;
  body?: unknown;
  query?: unknown;
}): void {
  try {
    const headers = asHeaders(ctx.headers);
    if (ctx.path === "/oauth2/register") {
      const body = Object.fromEntries(
        Object.entries(asRecord(ctx.body)).map(([key, value]) => [
          key,
          REDACTED_REGISTRATION_FIELDS.has(key) ? "[redacted]" : value,
        ]),
      );
      emit("register", { ...common(headers), body });
      return;
    }
    if (ctx.path === "/oauth2/authorize") {
      const query = asRecord(ctx.query);
      emit("authorize", {
        ...common(headers),
        queryKeys: Object.keys(query),
        client_id: query.client_id,
        redirect_uri: query.redirect_uri,
        response_type: query.response_type,
        scope: query.scope,
        resource: query.resource,
        code_challenge_method: query.code_challenge_method,
        codeChallengePresent: query.code_challenge !== undefined,
        prompt: query.prompt,
        statePresent: query.state !== undefined,
      });
      return;
    }
    if (ctx.path === "/oauth2/token") {
      const body = asRecord(ctx.body);
      const authorization = headers.get("authorization");
      emit("token", {
        ...common(headers),
        bodyKeys: Object.keys(body),
        grant_type: body.grant_type,
        resource: body.resource,
        scope: body.scope,
        client_id:
          body.client_id ??
          (authorization?.startsWith("Basic ") ? basicClientId(authorization) : null),
        authMethod: tokenAuthMethod(authorization, body),
      });
    }
  } catch (error) {
    console.error(PREFIX, error);
  }
}

function rpcSummary(message: unknown): Record<string, unknown> {
  const record = asRecord(message);
  const params = asRecord(record.params);
  return {
    method: record.method,
    tool: record.method === "tools/call" ? params.name : undefined,
  };
}

/** Desde `/api/mcp`: cada pedido al recurso, con el cuerpo leído de una copia. */
export async function captureMcpRequest(request: Request): Promise<void> {
  try {
    let rpc: unknown = null;
    if (request.method === "POST") {
      try {
        const body: unknown = await request.clone().json();
        rpc = Array.isArray(body) ? body.map(rpcSummary) : rpcSummary(body);
      } catch {
        rpc = "unparseable";
      }
    }
    emit("mcp", {
      ...common(request.headers),
      httpMethod: request.method,
      accept: request.headers.get("accept"),
      contentType: request.headers.get("content-type"),
      protocolVersion: request.headers.get("mcp-protocol-version"),
      sessionIdPresent: request.headers.has("mcp-session-id"),
      authorizationPresent: request.headers.has("authorization"),
      rpc,
    });
  } catch (error) {
    console.error(PREFIX, error);
  }
}
