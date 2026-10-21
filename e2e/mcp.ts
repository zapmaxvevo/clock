/**
 * El cliente de prueba del servidor MCP (§7 y §9.3 del contrato del MCP). Hace
 * lo que hace un asistente de línea de comandos: descubre el servidor de
 * autorización desde el 401 del recurso, se registra solo, autoriza en el
 * navegador con PKCE y `resource`, canjea el código y llama a las
 * herramientas. Los pedidos del asistente salen de un `APIRequestContext` sin
 * cookies; solo la autorización pasa por la pestaña de la persona.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";

import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import { PERSON_NAME, TEST_SESSION_SECRET } from "./environment";

/** D-MCP-2: los dos alcances, los que pide el 401. */
export const MCP_SCOPE = "clock offline_access";

/** Intentos de un pedido que el limitador de Better Auth corta con 429. */
const RATE_LIMITED_ATTEMPTS = 5;

/** La versión del protocolo que manda el cliente; el SDK 1.32.0 la acepta. */
const PROTOCOL_VERSION = "2025-06-18";

/** Lo que el cliente sabe del servidor después de descubrirlo y registrarse. */
export type AssistantClient = {
  /** El recurso de los metadatos: la audiencia del token y la dirección de `/api/mcp`. */
  readonly resource: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly clientId: string;
  /** El `client_name` que declaró, el que muestran `/conectar` y `/perfil`. */
  readonly clientName: string;
  /** La de loopback que registró, como Claude Code (D-MCP-2). */
  readonly redirectUri: string;
};

/** Un pedido de autorización armado, con el verificador de PKCE que lo cierra. */
export type AuthorizationRequest = {
  readonly url: string;
  readonly state: string;
  readonly codeVerifier: string;
};

/** Lo que devuelve el canje del código. */
export type AssistantTokens = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly scope: string;
};

/** El resultado de `tools/call`, como lo lee el asistente. */
export type ToolResult = {
  readonly isError: boolean;
  readonly structuredContent: Record<string, unknown>;
};

/**
 * Repite un pedido mientras Better Auth lo limite. El limitador cuenta por IP
 * en un build de producción y todos los workers salen de la misma; no es lo
 * que el recorrido prueba, así que se espera lo que indica `X-Retry-After`.
 */
async function withRateLimitRetry(
  send: () => Promise<APIResponse>,
): Promise<APIResponse> {
  for (let attempt = 1; ; attempt += 1) {
    const response = await send();
    if (response.status() !== 429 || attempt === RATE_LIMITED_ATTEMPTS) {
      return response;
    }
    const seconds = Number(response.headers()["x-retry-after"] ?? "1");
    await new Promise((resolve) => setTimeout(resolve, Math.max(seconds, 1) * 1000));
  }
}

/** Un parámetro de `WWW-Authenticate: Bearer k="v", …`. */
function challengeParameter(challenge: string, name: string): string | undefined {
  return new RegExp(`${name}="([^"]*)"`).exec(challenge)?.[1];
}

/** El cuerpo JSON de una respuesta que tiene que ser 200. */
async function okJson(response: APIResponse): Promise<Record<string, unknown>> {
  expect(response.status(), await response.text()).toBe(200);
  return (await response.json()) as Record<string, unknown>;
}

function stringField(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") {
    throw new Error(`«${name}» no es un texto en ${JSON.stringify(body)}.`);
  }
  return value;
}

/**
 * D-MCP-2: lo que hace un cliente que solo conoce la dirección del recurso.
 * El 401 sin token apunta a los metadatos del recurso, que nombran al
 * servidor de autorización; sus metadatos, con el camino del emisor, dan los
 * tres endpoints.
 */
async function discover(request: APIRequestContext): Promise<
  Omit<AssistantClient, "clientId" | "clientName" | "redirectUri"> & {
    readonly registrationEndpoint: string;
  }
> {
  const unauthorized = await request.post("/api/mcp", {
    headers: mcpHeaders(),
    data: rpc("tools/list"),
  });
  expect(unauthorized.status()).toBe(401);
  const challenge = unauthorized.headers()["www-authenticate"] ?? "";
  const resourceMetadataUrl = challengeParameter(challenge, "resource_metadata");
  if (resourceMetadataUrl === undefined) {
    throw new Error(`El 401 de /api/mcp no trae resource_metadata: «${challenge}».`);
  }

  const resourceMetadata = await okJson(await request.get(resourceMetadataUrl));
  const servers = resourceMetadata.authorization_servers;
  if (!Array.isArray(servers) || typeof servers[0] !== "string") {
    throw new Error(`Los metadatos del recurso no nombran un servidor de autorización.`);
  }
  const issuer = new URL(servers[0]);
  const authorizationServer = await okJson(
    await request.get(
      `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`,
    ),
  );

  return {
    resource: stringField(resourceMetadata, "resource"),
    authorizationEndpoint: stringField(authorizationServer, "authorization_endpoint"),
    tokenEndpoint: stringField(authorizationServer, "token_endpoint"),
    registrationEndpoint: stringField(authorizationServer, "registration_endpoint"),
  };
}

/**
 * Descubre el servidor y registra un cliente con el cuerpo de Claude Code
 * (criterio 2): público, sin `application_type`, con una dirección de
 * loopback de un puerto cualquiera, que nadie escucha porque la prueba
 * intercepta la vuelta.
 */
export async function registerAssistant(
  request: APIRequestContext,
): Promise<AssistantClient> {
  const server = await discover(request);
  const clientName = `Claude Code (clock-e2e-${randomUUID().slice(0, 8)})`;
  const port = 49152 + Math.floor(Math.random() * 16000);
  const redirectUri = `http://127.0.0.1:${port}/callback`;

  const response = await withRateLimitRetry(() =>
    request.post(server.registrationEndpoint, {
      data: {
        client_name: clientName,
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    }),
  );
  expect(response.status(), await response.text()).toBe(201);
  const registered = (await response.json()) as Record<string, unknown>;

  return {
    resource: server.resource,
    authorizationEndpoint: server.authorizationEndpoint,
    tokenEndpoint: server.tokenEndpoint,
    clientId: stringField(registered, "client_id"),
    clientName,
    redirectUri,
  };
}

function base64Url(bytes: Buffer): string {
  return bytes.toString("base64url");
}

/** Un pedido de autorización con PKCE `S256`, `resource` y los alcances del 401. */
export function authorizationRequest(client: AssistantClient): AuthorizationRequest {
  const codeVerifier = base64Url(randomBytes(32));
  const state = base64Url(randomBytes(16));
  const url = new URL(client.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: MCP_SCOPE,
    state,
    code_challenge: base64Url(createHash("sha256").update(codeVerifier).digest()),
    code_challenge_method: "S256",
    resource: client.resource,
  }).toString();
  return { url: url.toString(), state, codeVerifier };
}

/**
 * Atiende en la pestaña la vuelta a la dirección de loopback, como el
 * servidor local que levanta el asistente. Después de esto, llegar a la
 * vuelta es un cambio de URL de la pestaña.
 */
export async function answerCallback(page: Page, client: AssistantClient): Promise<void> {
  const callback = new URL(client.redirectUri);
  await page.route(
    (url) => url.origin === callback.origin && url.pathname === callback.pathname,
    (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: "<!doctype html><title>Asistente</title><p>Listo.</p>",
      }),
  );
}

/** Espera la vuelta en la pestaña y devuelve sus parámetros. */
export async function callbackParams(
  page: Page,
  client: AssistantClient,
): Promise<URLSearchParams> {
  const callback = new URL(client.redirectUri);
  await page.waitForURL(
    (url) => url.origin === callback.origin && url.pathname === callback.pathname,
  );
  return new URL(page.url()).searchParams;
}

/** La cabecera de un JWT, sin verificar la firma: la verifica el recurso. */
export function jwtHeader(token: string): Record<string, unknown> {
  const [header] = token.split(".");
  return JSON.parse(Buffer.from(header ?? "", "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

/** Canjea el código de la vuelta por los tokens, como un cliente público. */
export async function exchangeCode(
  request: APIRequestContext,
  client: AssistantClient,
  authorization: AuthorizationRequest,
  code: string,
): Promise<AssistantTokens> {
  const response = await withRateLimitRetry(() =>
    request.post(client.tokenEndpoint, {
      form: {
        grant_type: "authorization_code",
        code,
        redirect_uri: client.redirectUri,
        client_id: client.clientId,
        code_verifier: authorization.codeVerifier,
        resource: client.resource,
      },
    }),
  );
  const body = await okJson(response);
  return {
    accessToken: stringField(body, "access_token"),
    refreshToken: stringField(body, "refresh_token"),
    scope: stringField(body, "scope"),
  };
}

/**
 * Autoriza a `client` desde la pestaña de una persona con sesión: abre la
 * autorización, que con sesión y sin consentimiento previo lleva a
 * `/conectar`; ahí `consent` decide, y lo que vuelve a la dirección de
 * loopback son los parámetros de la vuelta.
 */
export async function authorizeInPage(
  page: Page,
  client: AssistantClient,
  authorization: AuthorizationRequest,
  consent: (page: Page) => Promise<void>,
): Promise<URLSearchParams> {
  await answerCallback(page, client);
  await page.goto(authorization.url);
  await expect(page).toHaveURL(/\/conectar\?/);
  await consent(page);
  return callbackParams(page, client);
}

/** El código de una vuelta aceptada, después de comprobar el `state` y el emisor. */
export function codeOf(
  params: URLSearchParams,
  authorization: AuthorizationRequest,
): string {
  expect(params.get("error")).toBeNull();
  expect(params.get("state")).toBe(authorization.state);
  expect(params.get("iss")).toMatch(/\/api\/auth$/);
  const code = params.get("code");
  if (code === null) {
    throw new Error(`La vuelta no trae código: ${params.toString()}.`);
  }
  return code;
}

/**
 * La consulta firmada de la dirección de `/login`, como la arma
 * `oauthProviderClient()` del navegador para mandarla en `oauth_query`: la
 * firma, la lista de parámetros firmados y cada uno de ellos.
 */
export function signedQueryOf(loginUrl: string): string {
  const params = new URL(loginUrl).searchParams;
  const signed = new Set(params.getAll("ba_param"));
  const kept = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    if (key === "sig" || key === "ba_param" || signed.has(key)) {
      kept.append(key, value);
    }
  }
  return kept.toString();
}

/**
 * D-MCP-4: la retoma sin Google. Entra con la sesión de prueba desde el
 * contexto de la pestaña, con `oauth_query` en el cuerpo; el gancho `after`
 * del plugin retoma la autorización y, como el pedido no es una navegación,
 * responde la dirección a la que sigue en vez de redirigir. La cookie queda
 * en el contexto, como con `signIn`.
 */
export async function signInResuming(
  page: Page,
  email: string,
  oauthQuery: string,
): Promise<string> {
  const response = await withRateLimitRetry(() =>
    page.context().request.post("/api/auth/test-session/sign-in", {
      headers: { "x-test-session": TEST_SESSION_SECRET },
      data: { email, name: PERSON_NAME, oauth_query: oauthQuery },
    }),
  );
  const body = await okJson(response);
  expect(body.redirect).toBe(true);
  return stringField(body, "url");
}

function rpc(method: string, params?: Record<string, unknown>): Record<string, unknown> {
  return { jsonrpc: "2.0", id: randomUUID(), method, ...(params ? { params } : {}) };
}

function mcpHeaders(accessToken?: string): Record<string, string> {
  return {
    accept: "application/json, text/event-stream",
    "content-type": "application/json",
    "mcp-protocol-version": PROTOCOL_VERSION,
    ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
  };
}

/** Un `tools/call` a `/api/mcp`, sin interpretar la respuesta. */
export async function postToolCall(
  request: APIRequestContext,
  client: AssistantClient,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<APIResponse> {
  return request.post(client.resource, {
    headers: mcpHeaders(accessToken),
    data: rpc("tools/call", { name, arguments: args }),
  });
}

/** Un `tools/call` que tiene que responder 200, con su resultado. */
export async function callTool(
  request: APIRequestContext,
  client: AssistantClient,
  accessToken: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const body = await okJson(await postToolCall(request, client, accessToken, name, args));
  const result = body.result as
    { isError?: boolean; structuredContent?: Record<string, unknown> } | undefined;
  if (result === undefined) {
    throw new Error(
      `tools/call ${name} respondió sin resultado: ${JSON.stringify(body)}.`,
    );
  }
  return {
    isError: result.isError ?? false,
    structuredContent: result.structuredContent ?? {},
  };
}

/**
 * D-MCP-3: un pedido con un token que ya no sirve responde 401 con
 * `invalid_token`, para que el asistente vuelva a autorizar.
 */
export async function expectTokenRejected(
  request: APIRequestContext,
  client: AssistantClient,
  accessToken: string,
): Promise<void> {
  const response = await postToolCall(request, client, accessToken, "get_context");
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toContain('error="invalid_token"');
}

/** §5.1: el destino de una dirección de loopback, en `/conectar` y en `/perfil`. */
export const LOOPBACK_DESTINATION = "esta computadora";

/** §5.1: el título de `/conectar`. */
export function connectHeading(page: Page, clientName: string): Locator {
  return page.getByRole("heading", {
    level: 1,
    name: `Conectar ${clientName} con Clock`,
    exact: true,
  });
}

/** §5.1: lo que el asistente va a poder hacer, con la cuenta de quien conecta. */
export function consentSummary(clientName: string, email: string): string {
  return `${clientName} va a poder ver, cargar, editar y borrar tus horas, y leer tus proyectos, tareas y etiquetas, con tu cuenta (${email}).`;
}

/** D-MCPE-8: la oración de `/conectar` para quien ve las horas de los demás. */
export const TEAM_CONSENT =
  "Como propietario o administrador, también va a poder ver las horas de las demás personas del workspace.";

/** D-MCPE-4: el `forbidden` de `summarize_hours` con el id de otra persona. */
export const OTHERS_FORBIDDEN =
  "Solo un propietario o un administrador ve las horas de otras personas.";

/** §5.1: adónde vuelve, del `redirect_uri` firmado. */
export function consentDestination(destination: string): string {
  return `Vuelve a: ${destination}`;
}

/** §5.1: los dos botones de `/conectar`. */
export function consentButton(page: Page, name: "Conectar" | "Cancelar"): Locator {
  return page.getByRole("button", { name, exact: true });
}

/** §5.3: el encabezado de la sección de `/perfil`, que también la nombra. */
export const ASSISTANTS_HEADING = "Asistentes conectados";

/** §5.3: la lista vacía. */
export const NO_ASSISTANTS = "No conectaste ningún asistente.";

export function assistantsSection(page: Page): Locator {
  return page.getByRole("region", { name: ASSISTANTS_HEADING, exact: true });
}

export function assistantsHeading(page: Page): Locator {
  return page.getByRole("heading", { level: 2, name: ASSISTANTS_HEADING, exact: true });
}

/** §5.3: la fila de un cliente, por su nombre. */
export function grantRow(page: Page, clientName: string): Locator {
  return assistantsSection(page).getByRole("listitem").filter({ hasText: clientName });
}

/** §5.3: la línea en gris de una fila, que empieza con el destino. */
export function grantDestination(destination: string): string {
  return `Vuelve a ${destination}`;
}

/** §5.3: «Desconectar» de una fila, con el nombre del asistente en el suyo. */
export function disconnectButton(page: Page, clientName: string): Locator {
  return assistantsSection(page).getByRole("button", {
    name: `Desconectar: ${clientName}`,
    exact: true,
  });
}

/** §5.3: la confirmación de desconectar. */
export function disconnectDialog(page: Page, clientName: string): Locator {
  return page.getByRole("dialog", { name: `¿Desconectar ${clientName}?`, exact: true });
}

/** §5.3: el texto de la confirmación. */
export const DISCONNECT_WARNING =
  "Va a dejar de poder ver y editar tus horas. Para volver a usarlo, conectalo de nuevo desde el asistente.";

/** §5.3: el aviso después de desconectar. */
export function disconnectedMessage(clientName: string): string {
  return `Desconectaste ${clientName}.`;
}

/**
 * Los avisos `status` de la sección con un texto. Hay dos regiones: la del
 * «Copiar», que está siempre, y la del resultado de desconectar.
 */
export function assistantsStatus(page: Page, text: string): Locator {
  return assistantsSection(page).getByRole("status").filter({ hasText: text });
}
