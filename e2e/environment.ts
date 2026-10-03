/**
 * Valores que comparten la configuración de Playwright y los tests. El
 * servidor y la cabecera que mandan los tests tienen que llevar el mismo
 * secreto, y el dominio de los emails de prueba tiene que ser uno de los que
 * el acceso habilita: por eso se declaran en un solo lugar.
 */

import { randomBytes } from "node:crypto";

/** Largo mínimo que `testSessionEnabled()` le exige al secreto. */
const SECRET_MIN_LENGTH = 32;

/**
 * Un secreto que habilita saltear la autenticación no puede tener un valor
 * por defecto en el repositorio: alcanza con que alguien lo copie al cargar
 * las variables de un preview para que ese preview quede abierto. Cuando el
 * entorno no lo trae —fuera de CI— se genera uno nuevo por corrida y se deja
 * en `process.env`: los workers lo heredan al nacer y la configuración se lo
 * pasa al servidor, así las dos puntas comparten un valor que no vive en
 * ningún archivo.
 */
function testSessionSecret(): string {
  const configured = process.env.E2E_TEST_SESSION_SECRET;
  if (configured === undefined) {
    const generated = randomBytes(32).toString("hex");
    process.env.E2E_TEST_SESSION_SECRET = generated;
    return generated;
  }
  // Más corto, el endpoint no se registra y la suite entera responde 404. El
  // error acá nombra el motivo en vez de dejarlo deducir.
  if (configured.length < SECRET_MIN_LENGTH) {
    throw new Error(
      `E2E_TEST_SESSION_SECRET tiene ${configured.length} caracteres y necesita ${SECRET_MIN_LENGTH}.`,
    );
  }
  return configured;
}

/** Secreto del endpoint de sesión de prueba, que no existe en producción. */
export const TEST_SESSION_SECRET = testSessionSecret();

/**
 * Dominio de los emails de prueba. Contra un preview con otro dominio
 * habilitado se pasa E2E_EMAIL_DOMAIN.
 */
export const TEST_EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? "empresa.com";
