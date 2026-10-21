import { z } from "zod";

import { parseDomainList } from "@/lib/email";

const csv = z.string().transform(parseDomainList);

/** Una lista de direcciones separadas por coma, sin vacíos. */
const urlList = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.url()));

const serverSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** Dominios de Google Workspace aceptados por el login, separados por coma. */
  GOOGLE_WORKSPACE_DOMAINS: csv.pipe(z.array(z.string().min(1)).min(1)),
  /** El correo que arranca el workspace en una base vacía y queda como su owner (D-E1b-3). */
  WORKSPACE_OWNER_EMAIL: z.email(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  CRON_SECRET: z.string().min(16),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
  /** D-MCP-14: el servidor MCP y la autorización de asistentes. Apagado por omisión. */
  MCP_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  /**
   * D-MCP-2: las redirecciones HTTPS que se aceptan al registrar y al autorizar,
   * exactas. Las de los conectores remotos de Anthropic y de OpenAI, según su
   * documentación (V-7). Loopback no va acá: lo acepta `isAllowedRedirect`.
   */
  MCP_REDIRECT_URIS: urlList.default([
    "https://claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com/connector_platform_oauth_redirect",
  ]),
  /** D-MCP-7: los `Origin` que acepta `/api/mcp` además del propio (V-7). */
  MCP_ALLOWED_ORIGINS: urlList.default([
    "https://claude.ai",
    "https://claude.com",
    "https://chatgpt.com",
  ]),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

/**
 * Lee y valida las variables de entorno del servidor. Lanza con el detalle de
 * lo que falta, para que el error aparezca al entrar a la operación y no como
 * un undefined más adelante.
 */
export function env(): ServerEnv {
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Variables de entorno inválidas. ${detail}`);
  }
  return parsed.data;
}

export function isProduction(): boolean {
  return env().NODE_ENV === "production";
}
