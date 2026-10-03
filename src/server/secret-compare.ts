import { timingSafeEqual } from "node:crypto";

/**
 * Compara dos secretos sin que el tiempo de la comparación revele cuántos
 * caracteres coincidieron. `timingSafeEqual` exige el mismo largo, así que la
 * diferencia de largo se resuelve antes y con un resultado fijo.
 */
export function secretEquals(given: string | null, expected: string): boolean {
  if (given === null) {
    return false;
  }
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Extrae el token de una cabecera `Authorization: Bearer <token>`. */
export function bearerToken(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  const prefix = "Bearer ";
  return header.startsWith(prefix) ? header.slice(prefix.length) : null;
}
