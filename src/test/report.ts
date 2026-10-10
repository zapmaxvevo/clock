import { createHash } from "node:crypto";

/**
 * Ayudantes de los tests de integración de `report` que comparten más de un
 * archivo.
 */

/**
 * D-R10-9: el `id` de un grupo de descripción que calcula la base, calculado
 * acá: los 32 primeros hexadecimales del SHA-256 del texto entero en UTF-8.
 */
export function descriptionIdOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 32);
}
