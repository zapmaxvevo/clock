/**
 * Copia a `invitation` los correos de `EXTERNAL_INVITE_EMAILS`, una sola vez
 * (contrato de E1a, §4.6 y §6.3; ADR 0024, decisión 8). No es parte de la
 * aplicación.
 *
 *   DATABASE_URL=postgresql://… EXTERNAL_INVITE_EMAILS=… \
 *     [GOOGLE_WORKSPACE_DOMAINS=…] npm run invitations:from-env -- [--dry-run | --apply]
 *
 * Por omisión es `--dry-run`: lee en una transacción de solo lectura e imprime
 * el plan. `--apply` inserta en una transacción: `accepted` para el correo que
 * ya tiene membresía en el workspace más viejo, `pending` para el que no. Una
 * fila que ya existe no se toca, en ningún estado; correrlo dos veces escribe
 * la primera. Con `GOOGLE_WORKSPACE_DOMAINS`, señala los correos del dominio.
 *
 * No lee `.env`; la base sale solo de `DATABASE_URL`.
 */
import { parseEmailList } from "@/lib/email";

import { createDatabase, runInvitationsFromEnv } from "./run";

const USAGE = "Uso: npm run invitations:from-env -- [--dry-run | --apply]";

function parseApply(args: readonly string[]): boolean {
  const unknown = args.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length > 0 || args.length > 1) {
    throw new Error(USAGE);
  }
  return args[0] === "--apply";
}

async function main(): Promise<void> {
  const apply = parseApply(process.argv.slice(2));
  const connectionString = process.env.DATABASE_URL;
  if (connectionString === undefined || connectionString === "") {
    throw new Error("Falta DATABASE_URL.");
  }
  const { pool, db } = createDatabase(connectionString);
  try {
    await runInvitationsFromEnv(db, {
      emails: parseEmailList(process.env.EXTERNAL_INVITE_EMAILS ?? ""),
      domains: parseEmailList(process.env.GOOGLE_WORKSPACE_DOMAINS ?? ""),
      apply,
      print: (line) => process.stdout.write(`${line}\n`),
    });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
