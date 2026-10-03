import { constraintOf, hasCode, UNIQUE_VIOLATION } from "@/server/db/constraint-error";
import { ForbiddenError, type Action } from "@/server/permissions";

/** Lo que decide el gancho ante otro choque: un resultado, u otra vuelta. */
export type ConflictOutcome<Result> =
  { readonly kind: "resolved"; readonly result: Result } | { readonly kind: "retry" };

export type Creation<Row, Result> = {
  /** El id que eligió el cliente. */
  readonly id: string;
  /**
   * La fila propia con ese id, sin bloqueo y fuera de toda transacción. Qué es
   * «propia» lo decide el módulo.
   */
  readonly findOwn: (id: string) => Promise<Row | undefined>;
  /** La transacción del alta. Deja salir el error de la base tal cual. */
  readonly attempt: () => Promise<Result>;
  /** El resultado cuando la fila propia ya existe. */
  readonly replayed: (row: Row) => Result;
  /** Nombre de la clave primaria de la tabla. */
  readonly idConstraint: string;
  /**
   * La acción de permiso del alta. Solo da el texto interno del
   * `ForbiddenError` del id ajeno: `createOnce` no consulta permisos.
   */
  readonly action: Action;
  /**
   * Un `23505` sobre otra restricción, ya comprobado que la fila propia no
   * existe. Si el choque no es suyo, vuelve a lanzar el error. Sin gancho, el
   * error sale tal cual.
   */
  readonly onOtherConflict?: (error: unknown) => Promise<ConflictOutcome<Result>>;
};

const MAX_ROUNDS = 2;

/** Hasta dos vueltas; solo el gancho pide la segunda. Ver el ADR 0007. */
export async function createOnce<Row, Result>(
  creation: Creation<Row, Result>,
): Promise<Result> {
  let lastError: unknown;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const before = await creation.findOwn(creation.id);
    if (before !== undefined) {
      return creation.replayed(before);
    }
    try {
      return await creation.attempt();
    } catch (error) {
      if (!hasCode(error, UNIQUE_VIOLATION)) {
        throw error;
      }
      // Se relee antes de mirar la restricción: dos intentos del mismo pedido
      // pueden chocar con más de una a la vez y la base informa una sola.
      const after = await creation.findOwn(creation.id);
      if (after !== undefined) {
        return creation.replayed(after);
      }
      // La clave primaria es global: sin fila propia, el id es de otra fila y
      // repetir no cambia nada. Un choque sin nombre de restricción no se puede
      // atribuir a la clave primaria: va como otro choque.
      if (constraintOf(error, UNIQUE_VIOLATION) === creation.idConstraint) {
        throw new ForbiddenError(creation.action);
      }
      if (creation.onOtherConflict === undefined) {
        throw error;
      }
      const outcome = await creation.onOtherConflict(error);
      if (outcome.kind === "resolved") {
        return outcome.result;
      }
      lastError = error;
    }
  }
  throw lastError;
}
