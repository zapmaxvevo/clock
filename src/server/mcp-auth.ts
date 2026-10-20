/**
 * La configuración del servidor de autorización de los asistentes (ADR 0026):
 * los plugins, las rutas cerradas, el gancho y las direcciones del recurso y
 * del emisor. No importa `auth.ts` ni `session.ts`: `auth.ts` la importa a ella,
 * y el gancho decide con `user-context.ts`. Las reglas puras de direcciones y
 * consultas viven en `src/lib/oauth.ts`, que `/login` importa sin la base.
 */

import { oauthProvider } from "@better-auth/oauth-provider";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { jwt } from "better-auth/plugins";
import { z } from "zod";

import { isAllowedRedirect } from "@/lib/oauth";
import { MCP_SCOPES } from "@/modules/mcp/schema";
import type { AccessDenialReason } from "@/server/access";
import { loginErrorUrl, sessionEntryError } from "@/server/entry";
import { env } from "@/server/env";
import { can } from "@/server/permissions";
import { captureAuthRequest } from "@/server/mcp-v7-capture";
import { readUserContext, type SessionUser } from "@/server/user-context";

function originOf(url: string): string {
  return new URL(url).origin;
}

/** D-MCP-2: `<BETTER_AUTH_URL>/api/mcp`, sin barra final. Audiencia y dirección para pegar. */
export function mcpResourceUrl(): string {
  return `${originOf(env().BETTER_AUTH_URL)}/api/mcp`;
}

/** D-MCP-2: `<BETTER_AUTH_URL>/api/auth`. */
export function mcpIssuer(): string {
  return `${originOf(env().BETTER_AUTH_URL)}/api/auth`;
}

/** D-MCP-2: el cuerpo de los metadatos del recurso protegido (RFC 9728). */
export function protectedResourceMetadata(): {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly scopes_supported: typeof MCP_SCOPES;
  readonly bearer_methods_supported: readonly ["header"];
} {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [mcpIssuer()],
    scopes_supported: MCP_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

const REGISTER_PATH = "/oauth2/register";
const AUTHORIZE_PATH = "/oauth2/authorize";
const CONSENT_PATH = "/oauth2/consent";

/**
 * D-MCP-1, D-MCP-14: `jwt` y `oauthProvider` con la tabla de §4.2. Siempre los
 * dos, con el MCP encendido o apagado: si dependieran de `MCP_ENABLED`, un
 * `auth:schema` sin la variable sacaría sus tablas del esquema.
 */
export function mcpAuthPlugins() {
  return [
    // Sin esto, cada `get-session` firma un JWT para la sesión web y lo manda en
    // `set-auth-jwt`.
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: "/login",
      consentPage: "/conectar",
      scopes: [...MCP_SCOPES],
      grantTypes: ["authorization_code", "refresh_token"],
      resources: [mcpResourceUrl()],
      clientRegistrationDefaultResources: [mcpResourceUrl()],
      clientRegistrationDefaultApplicationType: "infer",
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Las dos cosas: que el cliente haya registrado la dirección (`matched`, lo
      // que el plugin decidió) y que siga en la lista. Achicar la lista corta
      // también a los clientes ya registrados.
      validateRedirectUri: (uri, _registered, matched) =>
        matched && isAllowedRedirect(uri, env().MCP_REDIRECT_URIS),
      // No son decisiones de acceso de Clock: cierran los endpoints de
      // administración de clientes y recursos, que no se usan (D-MCP-2). `create`
      // queda para el registro dinámico, que pasa por `mcpAuthMiddleware`.
      clientPrivileges: ({ action }) => action === "create",
      resourcePrivileges: () => false,
      accessTokenExpiresIn: 60 * 60,
      refreshTokenExpiresIn: 60 * 60 * 24 * 30,
      refreshTokenReuseInterval: 30,
      rateLimit: { register: { window: 60, max: 5 } },
    }),
  ] as const;
}

/**
 * D-MCP-2: los endpoints del plugin y de `jwt` que no se usan, encendido o
 * apagado. Un endpoint de administración deja crear o editar un cliente con
 * cualquier destino sin pasar por el gancho del registro. Quedan abiertos
 * `authorize`, `token`, `register`, `consent` y `revoke`, y `/jwks`.
 */
const ALWAYS_DISABLED_PATHS = [
  "/oauth2/create-client",
  "/oauth2/get-client",
  "/oauth2/get-clients",
  "/oauth2/update-client",
  "/oauth2/delete-client",
  "/oauth2/client/rotate-secret",
  "/oauth2/client/rotate-keys",
  "/oauth2/public-client",
  "/oauth2/public-client-prelogin",
  "/oauth2/get-consent",
  "/oauth2/get-consents",
  "/oauth2/update-consent",
  "/oauth2/delete-consent",
  "/oauth2/userinfo",
  "/oauth2/end-session",
  "/oauth2/end-session/confirm",
  "/oauth2/introspect",
  "/oauth2/continue",
  "/admin/oauth2/create-client",
  "/admin/oauth2/update-client",
  "/admin/oauth2/resources",
  "/token",
];

/** D-MCP-14: lo que se cierra además con el MCP apagado. */
const MCP_ONLY_PATHS = [
  AUTHORIZE_PATH,
  "/oauth2/token",
  REGISTER_PATH,
  CONSENT_PATH,
  "/oauth2/revoke",
  "/jwks",
  "/.well-known/oauth-authorization-server",
  "/.well-known/openid-configuration",
];

/** D-MCP-2, D-MCP-14: la lista fija; con el MCP apagado, también las rutas OAuth, `/jwks` y sus `.well-known`. */
export function mcpDisabledPaths(): string[] {
  return env().MCP_ENABLED
    ? [...ALWAYS_DISABLED_PATHS]
    : [...ALWAYS_DISABLED_PATHS, ...MCP_ONLY_PATHS];
}

const registrationRedirects = z.object({
  redirect_uris: z.array(z.string()).min(1),
});

/** D-MCP-2: un registro con alguna redirección fuera de la lista no crea la fila. */
function assertRegistrationRedirects(body: unknown): void {
  const parsed = registrationRedirects.safeParse(body);
  const allowed = env().MCP_REDIRECT_URIS;
  if (
    parsed.success &&
    parsed.data.redirect_uris.every((uri) => isAllowedRedirect(uri, allowed))
  ) {
    return;
  }
  throw new APIError("BAD_REQUEST", {
    error: "invalid_redirect_uri",
    error_description: "Every redirect_uri must be on the server allowlist.",
  });
}

const withResource = z.object({
  resource: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
});

const accepted = z.object({ accept: z.literal(true) });

/** D-MCP-3, D-MCP-4: el motivo por el que la persona no autoriza, o `null` si puede. */
async function denialOf(user: SessionUser): Promise<AccessDenialReason | null> {
  const read = await readUserContext(user);
  if (read.kind !== "ready") {
    return read.kind === "denied" ? read.reason : "sin_invitacion";
  }
  const { actor } = read.context;
  const workspace = { kind: "workspace", workspaceId: actor.workspaceId } as const;
  return can(actor, "mcp.connect", workspace) ? null : "membresia_inactiva";
}

/**
 * El gancho `hooks.before`: sobre el registro, la lista de redirecciones (D-MCP-2);
 * sobre `/oauth2/authorize` y `/oauth2/consent`, `mcpAuthorizationGate` (D-MCP-4),
 * también en la retoma después del ingreso y en el `authorize` interno del
 * consentimiento. Sobre cualquier otro camino no hace nada.
 */
export const mcpAuthMiddleware = createAuthMiddleware(async (ctx) => {
  captureAuthRequest(ctx);
  if (ctx.path === REGISTER_PATH) {
    assertRegistrationRedirects(ctx.body);
    return;
  }
  if (ctx.path !== AUTHORIZE_PATH && ctx.path !== CONSENT_PATH) {
    return;
  }
  // D-MCP-4, `mcpAuthorizationGate`. El `resource` lo valida el plugin: acá
  // solo se exige que esté. Ningún rechazo redirige a un `redirect_uri`, que
  // todavía no se validó contra el registro del cliente.
  const isAuthorize = ctx.path === AUTHORIZE_PATH;
  // Cancelar no da nada: devuelve `access_denied` a la redirección firmada, y es
  // la única salida de quien perdió el acceso en `/conectar`.
  if (!isAuthorize && !accepted.safeParse(ctx.body).success) {
    return;
  }
  if (isAuthorize && !withResource.safeParse(ctx.query).success) {
    throw new APIError("BAD_REQUEST", {
      error: "invalid_request",
      error_description: "The resource parameter is required.",
    });
  }
  const session = await getSessionFromCtx(ctx);
  if (session === null) {
    return;
  }
  const denial = await denialOf(session.user);
  if (denial === null) {
    return;
  }
  if (isAuthorize) {
    throw new APIError("FOUND", undefined, { Location: loginErrorUrl(denial) });
  }
  throw sessionEntryError(denial);
});
