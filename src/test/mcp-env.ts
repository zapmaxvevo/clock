/**
 * Las variables que un test de integración del MCP pone antes de importar
 * `auth.ts`, que arma sus plugins y sus rutas cerradas al importarse. Sin
 * imports: se carga desde `vi.hoisted`, antes que cualquier otro módulo.
 */

/** El secreto de la sesión de prueba de los tests del MCP, de más de 32 caracteres. */
export const TEST_SESSION_SECRET = "secreto-de-la-sesion-de-prueba-del-mcp-32+";

/** La sesión de prueba habilitada y el MCP encendido. */
export const MCP_ON_ENV = {
  ALLOW_TEST_SESSION: "true",
  E2E_TEST_SESSION_SECRET: TEST_SESSION_SECRET,
  MCP_ENABLED: "true",
} as const;

/** La sesión de prueba habilitada y `MCP_ENABLED` sin declarar (D-MCP-14). */
export const MCP_OFF_ENV = {
  ALLOW_TEST_SESSION: "true",
  E2E_TEST_SESSION_SECRET: TEST_SESSION_SECRET,
  MCP_ENABLED: undefined,
} as const;

/** Lo que había en cada variable antes de `replaceEnv`. */
export type SavedEnv = Readonly<Record<string, string | undefined>>;

/** Pone las variables de `values` (`undefined` la borra) y devuelve las que había. */
export function replaceEnv(
  values: Readonly<Record<string, string | undefined>>,
): SavedEnv {
  const saved: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(values)) {
    saved[name] = process.env[name];
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  return saved;
}

/** Deja las variables como estaban antes de `replaceEnv`. */
export function restoreEnv(saved: SavedEnv): void {
  replaceEnv(saved);
}
