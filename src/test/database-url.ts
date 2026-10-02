/** Base de pruebas. Se puede apuntar a otra con TEST_DATABASE_URL. */
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgresql://clock:clock@localhost:5432/clock_test";
