import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  randomInt,
  sign,
  type KeyObject,
} from "node:crypto";

import { symmetricDecrypt } from "better-auth/crypto";
import { desc } from "drizzle-orm";

import { handleMcpRequest } from "@/modules/mcp/handler";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { jwks } from "@/server/db/schema";
import { env } from "@/server/env";
import { mcpResourceUrl } from "@/server/mcp-auth";

import { TEST_SESSION_SECRET } from "./mcp-env";

/**
 * El cliente OAuth y MCP de los tests de integración (§9.2): registra, autoriza
 * con la sesión de prueba, consiente y canjea el código contra `auth.handler`, y
 * llama a `handleMcpRequest` con el token. Pide `ALLOW_TEST_SESSION=true` y
 * `E2E_TEST_SESSION_SECRET` antes de que se importe `auth.ts`: cada archivo los
 * pone con `vi.hoisted` y `replaceEnv` de `mcp-env.ts`.
 */

/** `<BETTER_AUTH_URL>`, sin barra final. */
export function appOrigin(): string {
  return env().BETTER_AUTH_URL.replace(/\/$/, "");
}

/** Los alcances que pide el 401 (D-MCP-2). */
export const MCP_SCOPE = "clock offline_access";

/**
 * Los cuerpos de registro de cada cliente (V-7). Los de claude.ai y ChatGPT son
 * los conocidos antes del preview; se reemplazan por los capturados en V-7.
 */
export const registrations = {
  /** Claude Code: sin `application_type`, loopback con puerto y cliente público. */
  claudeCode: (port: number = randomInt(20_000, 60_000)) => ({
    client_name: "Claude Code (clock)",
    redirect_uris: [`http://127.0.0.1:${port}/callback`],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
  claudeAi: () => ({
    client_name: "Claude",
    redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  }),
  /** Confidencial: el canje lleva el secreto en el cuerpo. */
  chatgpt: () => ({
    client_name: "ChatGPT",
    redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post",
  }),
} as const;

export type RegistrationBody = {
  readonly client_name?: string;
  readonly redirect_uris: readonly string[];
  readonly grant_types?: readonly string[];
  readonly response_types?: readonly string[];
  readonly token_endpoint_auth_method?: string;
  readonly application_type?: string;
  readonly scope?: string;
};

function authUrl(path: string): string {
  return `${appOrigin()}/api/auth${path}`;
}

/** Un `POST` JSON a `/api/auth`, sin `Origin`: así llega un cliente de servidor o de línea de comandos. */
export function authPostJson(
  path: string,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return auth.handler(
    new Request(authUrl(path), {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

/** Un `POST` de navegador a `/api/auth`: con la cookie y el `Origin` propio. */
export function browserPostJson(
  path: string,
  body: unknown,
  cookie: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return authPostJson(path, body, { cookie, origin: appOrigin(), ...headers });
}

/** Un `GET` a `/api/auth`, con la cookie si se pasa. */
export function authGet(
  path: string,
  cookie?: string,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return auth.handler(
    new Request(authUrl(path), {
      method: "GET",
      headers: cookie === undefined ? headers : { cookie, ...headers },
    }),
  );
}

/** Las cookies de `Set-Cookie`, como las manda el navegador en el pedido siguiente. */
export function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}

/**
 * `POST /test-session/sign-in` de `email`, con `oauth_query` en el cuerpo si se
 * pasa: así el gancho `after` del plugin retoma la autorización (D-MCP-4).
 */
export function testSessionSignIn(email: string, oauthQuery?: string): Promise<Response> {
  return authPostJson(
    "/test-session/sign-in",
    oauthQuery === undefined
      ? { email, name: "Persona de prueba" }
      : { email, name: "Persona de prueba", oauth_query: oauthQuery },
    { "x-test-session": TEST_SESSION_SECRET },
  );
}

/** Entra con la sesión de prueba; lanza si el gancho del ingreso la rechaza. */
export async function signInCookie(email: string): Promise<string> {
  const response = await testSessionSignIn(email);
  if (response.status !== 200) {
    throw new Error(
      `La sesión de prueba de ${email} respondió ${response.status}: ${await response.text()}`,
    );
  }
  return cookieOf(response);
}

/** Un cliente registrado, con lo que hace falta para autorizar y canjear. */
export type RegisteredClient = {
  readonly clientId: string;
  /** Solo los confidenciales. */
  readonly clientSecret: string | undefined;
  readonly redirectUri: string;
  readonly authMethod: string;
};

/** `POST /oauth2/register` sin sesión, como un asistente que se registra solo. */
export function registerClient(
  body: RegistrationBody,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return authPostJson("/oauth2/register", body, headers);
}

/** Registra `body` y lanza si no responde 201. */
export async function registeredClient(
  body: RegistrationBody,
): Promise<RegisteredClient> {
  const response = await registerClient(body);
  if (response.status !== 201) {
    throw new Error(`El registro respondió ${response.status}: ${await response.text()}`);
  }
  const created = (await response.json()) as {
    client_id: string;
    client_secret?: string;
    token_endpoint_auth_method?: string;
  };
  return {
    clientId: created.client_id,
    clientSecret: created.client_secret,
    redirectUri: body.redirect_uris[0],
    authMethod:
      created.token_endpoint_auth_method ?? body.token_endpoint_auth_method ?? "",
  };
}

/** Un par PKCE `S256`. */
export function pkcePair(): { readonly verifier: string; readonly challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Los parámetros de una autorización; los ausentes toman los del recorrido normal. */
export type AuthorizeParams = {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly challenge: string;
  readonly state?: string;
  readonly scope?: string;
  /** `null` no lo manda. */
  readonly resource?: string | null;
  readonly prompt?: string;
};

/** La consulta de `/oauth2/authorize`. */
export function authorizeQuery(params: AuthorizeParams): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    scope: params.scope ?? MCP_SCOPE,
    state: params.state ?? randomBytes(8).toString("hex"),
    code_challenge: params.challenge,
    code_challenge_method: "S256",
  });
  const resource = params.resource === undefined ? mcpResourceUrl() : params.resource;
  if (resource !== null) {
    query.set("resource", resource);
  }
  if (params.prompt !== undefined) {
    query.set("prompt", params.prompt);
  }
  return query.toString();
}

/** `GET /oauth2/authorize` como lo abre el navegador, con la cookie si hay sesión. */
export function authorize(params: AuthorizeParams, cookie?: string): Promise<Response> {
  return authGet(`/oauth2/authorize?${authorizeQuery(params)}`, cookie);
}

/** La dirección de `Location`, absoluta; lanza si no es una redirección. */
export function locationOf(response: Response): URL {
  const location = response.headers.get("location");
  if (location === null) {
    throw new Error(`Se esperaba una redirección y llegó ${response.status}.`);
  }
  return new URL(location, appOrigin());
}

/** La consulta firmada de una redirección a `/conectar` o a `/login`, sin el `?`. */
export function signedQueryOf(response: Response): string {
  return locationOf(response).search.slice(1);
}

/**
 * `POST /oauth2/consent { accept, oauth_query }` con la cookie y `accept:
 * application/json`, como la action de `/conectar` (D-MCP-15).
 */
export function consent(
  cookie: string,
  oauthQuery: string,
  accept: boolean,
): Promise<Response> {
  return browserPostJson("/oauth2/consent", { accept, oauth_query: oauthQuery }, cookie, {
    accept: "application/json",
  });
}

/** El `url` de `{ redirect: true, url }`; lanza con otra respuesta. */
export async function redirectUrlOf(response: Response): Promise<URL> {
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`Se esperaba { redirect, url } y llegó ${response.status}: ${text}`);
  }
  const body = JSON.parse(text) as { redirect?: boolean; url?: string };
  if (body.redirect !== true || typeof body.url !== "string") {
    throw new Error(`Se esperaba { redirect, url } y llegó ${text}`);
  }
  return new URL(body.url, appOrigin());
}

/** Un `POST` de formulario a `/oauth2/token`, sin cookie ni `Origin`. */
export function tokenRequest(form: Readonly<Record<string, string>>): Promise<Response> {
  return auth.handler(
    new Request(authUrl("/oauth2/token"), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
    }),
  );
}

/** Las credenciales del cliente en el cuerpo del canje, según su método. */
function clientCredentials(client: RegisteredClient): Record<string, string> {
  return client.clientSecret === undefined
    ? { client_id: client.clientId }
    : { client_id: client.clientId, client_secret: client.clientSecret };
}

export type TokenResponse = {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly token_type: string;
  readonly scope: string;
  readonly expires_in: number;
};

/** Canjea `code`; lanza si el plugin no emite. */
export async function exchangeCode(
  client: RegisteredClient,
  code: string,
  verifier: string,
): Promise<TokenResponse> {
  const response = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: client.redirectUri,
    resource: mcpResourceUrl(),
    ...clientCredentials(client),
  });
  if (response.status !== 200) {
    throw new Error(`El canje respondió ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as TokenResponse;
}

/** `grant_type=refresh_token` con las credenciales del cliente. */
export function refreshRequest(
  client: RegisteredClient,
  refreshToken: string,
): Promise<Response> {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    ...clientCredentials(client),
  });
}

/** Una autorización completa: el cliente, la sesión y los tokens que emitió el plugin. */
export type TestGrant = {
  readonly client: RegisteredClient;
  readonly clientId: string;
  readonly cookie: string;
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly scope: string;
};

/**
 * D-MCP-15, §9.2: el recorrido entero de `email` contra `auth.handler`. Registra
 * `registration` (o reusa `client`), entra con la sesión de prueba (o usa
 * `cookie`), autoriza con PKCE, `resource` y los alcances del 401 —que redirige a
 * `/conectar` con la consulta firmada—, consiente con esa consulta y canjea el
 * código. La persona tiene que tener acceso.
 */
export async function issueTestGrant(
  email: string,
  options: {
    readonly registration?: RegistrationBody;
    readonly client?: RegisteredClient;
    readonly cookie?: string;
    readonly scope?: string;
  } = {},
): Promise<TestGrant> {
  const client =
    options.client ??
    (await registeredClient(options.registration ?? registrations.claudeCode()));
  const cookie = options.cookie ?? (await signInCookie(email));
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(8).toString("hex");

  const authorization = await authorize(
    {
      clientId: client.clientId,
      redirectUri: client.redirectUri,
      challenge,
      state,
      scope: options.scope,
    },
    cookie,
  );
  const callback = await callbackOf(authorization, cookie);
  const code = callback.searchParams.get("code");
  if (code === null || callback.searchParams.get("state") !== state) {
    throw new Error(`La autorización no volvió con el código: ${callback.toString()}`);
  }
  const tokens = await exchangeCode(client, code, verifier);
  if (tokens.refresh_token === undefined) {
    throw new Error("El plugin no emitió el refresh token.");
  }
  return {
    client,
    clientId: client.clientId,
    cookie,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    scope: tokens.scope,
  };
}

/**
 * La vuelta al cliente de una autorización: si el plugin mandó a `/conectar`,
 * consiente con la consulta firmada; si ya había consentimiento, sigue la
 * redirección directa con el código.
 */
async function callbackOf(authorization: Response, cookie: string): Promise<URL> {
  const target = locationOf(authorization);
  if (target.pathname !== "/conectar") {
    return target;
  }
  return redirectUrlOf(await consent(cookie, target.search.slice(1), true));
}

/**
 * `resumeWithTestSession`: la retoma de §9.2. Sin sesión, `/oauth2/authorize`
 * manda a `/login` con la consulta firmada; esto la manda como `oauth_query` en
 * el ingreso de prueba y devuelve la respuesta, que trae la de la retoma.
 */
export function resumeWithTestSession(
  email: string,
  oauthQuery: string,
): Promise<Response> {
  return testSessionSignIn(email, oauthQuery);
}

/** El cuerpo de un pedido JSON-RPC. */
export type JsonRpcRequest = {
  readonly jsonrpc: "2.0";
  readonly id?: number;
  readonly method: string;
  readonly params?: Record<string, unknown>;
};

export const rpc = {
  initialize: (id = 1): JsonRpcRequest => ({
    jsonrpc: "2.0",
    id,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "clock-tests", version: "1.0.0" },
    },
  }),
  toolsList: (id = 1): JsonRpcRequest => ({ jsonrpc: "2.0", id, method: "tools/list" }),
  toolsCall: (
    name: string,
    args: Record<string, unknown> = {},
    id = 1,
  ): JsonRpcRequest => ({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  }),
};

/** Las opciones de un pedido a `/api/mcp` además del token y el cuerpo. */
export type McpRequestInit = {
  readonly origin?: string;
  readonly headers?: Readonly<Record<string, string>>;
  /** El cuerpo crudo, en lugar de `JSON.stringify(body)`. */
  readonly rawBody?: string;
};

/** Un `POST /api/mcp` con `Authorization: Bearer <token>` si hay token. */
export function mcpRequest(
  token: string | null,
  body: JsonRpcRequest | null,
  init: McpRequestInit = {},
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...init.headers,
  };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  if (init.origin !== undefined) {
    headers.origin = init.origin;
  }
  return new Request(`${appOrigin()}/api/mcp`, {
    method: "POST",
    headers,
    body: init.rawBody ?? JSON.stringify(body),
  });
}

/** §9.2: llama a `handleMcpRequest` con un pedido armado. */
export function callMcp(
  token: string | null,
  body: JsonRpcRequest,
  init: McpRequestInit = {},
): Promise<Response> {
  return handleMcpRequest(mcpRequest(token, body, init));
}

/** El resultado de una herramienta, como lo devuelve el SDK. */
export type ToolResult = {
  readonly isError?: boolean;
  readonly content: readonly { readonly type: string; readonly text?: string }[];
  readonly structuredContent?: Record<string, unknown>;
};

/** `tools/call` de `name`; lanza si la respuesta no es un 200 con `result`. */
export async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const response = await callMcp(token, rpc.toolsCall(name, args));
  const text = await response.text();
  if (response.status !== 200) {
    throw new Error(`tools/call de ${name} respondió ${response.status}: ${text}`);
  }
  const body = JSON.parse(text) as { result?: ToolResult; error?: unknown };
  if (body.result === undefined) {
    throw new Error(`tools/call de ${name} respondió un error JSON-RPC: ${text}`);
  }
  return body.result;
}

/** La cabecera y el cuerpo de un JWT, sin verificar. */
export function decodeJwt(token: string): {
  readonly header: Record<string, unknown>;
  readonly payload: Record<string, unknown>;
} {
  const [header, payload] = token.split(".");
  return {
    header: JSON.parse(Buffer.from(header, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >,
    payload: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >,
  };
}

/** La clave privada más nueva de `jwks`, descifrada como lo hace el plugin `jwt`. */
async function serverSigningKey(): Promise<{
  readonly kid: string;
  readonly key: KeyObject;
}> {
  const [row] = await db.select().from(jwks).orderBy(desc(jwks.createdAt)).limit(1);
  if (row === undefined) {
    throw new Error("Sin claves en jwks: emití un token antes de firmar uno propio.");
  }
  const context = await auth.$context;
  const privateJwk = await symmetricDecrypt({
    key: context.secretConfig,
    data: JSON.parse(row.privateKey) as string,
  });
  return {
    kid: row.id,
    key: createPrivateKey({ key: JSON.parse(privateJwk) as never, format: "jwk" }),
  };
}

/**
 * Firma `token` otra vez con `header` y `payload` cambiados. `signer: "server"`
 * usa la clave de `jwks` (las mismas claves que el plugin); `"foreign"`, una
 * Ed25519 nueva con el mismo `kid`. EdDSA, el algoritmo por omisión de `jwt`.
 */
export async function resignToken(
  token: string,
  changes: {
    readonly header?: Record<string, unknown>;
    readonly payload?: Record<string, unknown>;
    readonly signer?: "server" | "foreign";
  } = {},
): Promise<string> {
  const decoded = decodeJwt(token);
  const server = await serverSigningKey();
  const key =
    changes.signer === "foreign" ? generateKeyPairSync("ed25519").privateKey : server.key;
  const header = { ...decoded.header, kid: server.kid, ...changes.header };
  const payload = { ...decoded.payload, ...changes.payload };
  const signingInput = [header, payload]
    .map((part) => Buffer.from(JSON.stringify(part)).toString("base64url"))
    .join(".");
  const signature = sign(null, Buffer.from(signingInput), key).toString("base64url");
  return `${signingInput}.${signature}`;
}

/** El mismo token con un carácter de la firma cambiado. */
export function tamperSignature(token: string): string {
  const head = token.slice(0, -2);
  const last = token.slice(-2, -1);
  return `${head}${last === "A" ? "B" : "A"}${token.slice(-1)}`;
}
