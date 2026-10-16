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
 * entorno no lo trae —contra el servidor local, también en CI— se genera uno
 * nuevo por corrida y se deja en `process.env`: los workers lo heredan al
 * nacer y la configuración se lo pasa al servidor, así las dos puntas
 * comparten un valor que no vive en ningún archivo.
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

/**
 * La cuenta del owner de la suite: la que el setup usa para crear el
 * workspace, y la única que quita el rol de admin (D-R8-5 de R8).
 */
export const OWNER_EMAIL = `owner@${TEST_EMAIL_DOMAIN}`;

/**
 * El nombre de la cuenta con que la sesión de prueba crea a cada persona. Lo
 * leen la sesión y la base de los e2e, que siembra personas con el mismo.
 */
export const PERSON_NAME = "Persona de prueba";

/** La base del servidor local cuando DATABASE_URL no viene del entorno. */
export const LOCAL_DATABASE_URL = "postgresql://clock:clock@localhost:5432/clock";

/**
 * Base que lee el servidor de los e2e, para lo que los tests escriben por
 * fuera de la interfaz. Contra el servidor local es la misma que la
 * configuración le pasa al `webServer`. Contra un preview no hay valor por
 * defecto que sirva: llega en E2E_DATABASE_URL, y sin ella la suite se corta
 * con el motivo en vez de escribir en una base que el preview no lee. Es una
 * función y no una constante porque la configuración importa este archivo y
 * no necesita la base.
 */
export function testDatabaseUrl(): string {
  if (process.env.E2E_BASE_URL === undefined) {
    return process.env.DATABASE_URL ?? LOCAL_DATABASE_URL;
  }
  const configured = process.env.E2E_DATABASE_URL;
  if (configured === undefined) {
    throw new Error(
      "Contra un preview, E2E_DATABASE_URL tiene que traer la cadena de conexión de la base de ese preview.",
    );
  }
  return configured;
}
