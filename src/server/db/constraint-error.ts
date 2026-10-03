/** Postgres: violación de restricción única. */
export const UNIQUE_VIOLATION = "23505";
/** Postgres: violación de una restricción `check`. */
export const CHECK_VIOLATION = "23514";

type DriverError = { code?: unknown; constraint?: unknown; cause?: unknown };

/**
 * El error del driver con ese código, si está en la cadena. El driver expone
 * `code` y `constraint`; drizzle lo envuelve y lo deja en `cause`.
 */
function driverErrorWith(error: unknown, code: string): DriverError | null {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const candidate = current as DriverError;
    if (candidate.code === code) {
      return candidate;
    }
    current = candidate.cause;
  }
  return null;
}

/** Si el error tiene ese código, sepa o no el driver el nombre de la restricción. */
export function hasCode(error: unknown, code: string): boolean {
  return driverErrorWith(error, code) !== null;
}

/** La restricción que violó el error, si el error tiene ese código y la nombra. */
export function constraintOf(error: unknown, code: string): string | null {
  const constraint = driverErrorWith(error, code)?.constraint;
  return typeof constraint === "string" ? constraint : null;
}

export function hasConstraint(error: unknown, code: string, constraint: string): boolean {
  return constraintOf(error, code) === constraint;
}
