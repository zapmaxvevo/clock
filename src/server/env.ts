import { z } from "zod";

import { parseEmailList } from "@/lib/email";

const csv = z.string().transform(parseEmailList);

const serverSchema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  /** Dominios de Google Workspace aceptados por el login, separados por coma. */
  GOOGLE_WORKSPACE_DOMAINS: csv.pipe(z.array(z.string().min(1)).min(1)),
  /** Emails externos al dominio habilitados para entrar, separados por coma. */
  EXTERNAL_INVITE_EMAILS: csv.default([]),
  /** Email del owner inicial del workspace. */
  WORKSPACE_OWNER_EMAIL: z.email(),
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.email().optional(),
  CRON_SECRET: z.string().min(16),
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),
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
