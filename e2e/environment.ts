/**
 * Valores que comparten la configuración de Playwright y los tests. El
 * servidor y la cabecera que mandan los tests tienen que llevar el mismo
 * secreto, y el dominio de los emails de prueba tiene que ser uno de los que
 * el acceso habilita: por eso se declaran en un solo lugar.
 */

/** Secreto del endpoint de sesión de prueba, que no existe en producción. */
export const TEST_SESSION_SECRET = process.env.E2E_TEST_SESSION_SECRET ?? "prueba-local";

/**
 * Dominio de los emails de prueba. Contra un preview con otro dominio
 * habilitado se pasa E2E_EMAIL_DOMAIN.
 */
export const TEST_EMAIL_DOMAIN = process.env.E2E_EMAIL_DOMAIN ?? "empresa.com";
