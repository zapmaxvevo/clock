/**
 * Los errores de dominio que traducen las actions. Viven aparte de `action.ts`,
 * que importa la sesión: un service que la sesión carga —el de `workspace`—
 * puede extenderlos sin cerrar un ciclo de imports. `action.ts` los reexporta.
 */

/** Los códigos que puede devolver cualquier action. Un módulo los amplía. */
export type ActionErrorCode = "validation" | "not_found" | "forbidden" | "unexpected";

/** Una fila que impidió una operación en masa (ADR 0011). */
export type Rejection<Code extends string = ActionErrorCode> = {
  readonly id: string;
  readonly code: Code;
  readonly message: string;
};

/** Error de dominio de un módulo. La action lo traduce con su código y su mensaje. */
export class DomainError<Code extends string = ActionErrorCode> extends Error {
  constructor(
    readonly code: Code,
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** La operación en masa no se aplicó: lleva cada fila que la impidió (ADR 0011). */
export class RejectedError<
  Code extends string = ActionErrorCode,
> extends DomainError<"rejected"> {
  constructor(
    message: string,
    readonly rejections: readonly Rejection<Code>[],
  ) {
    super("rejected", message);
    this.name = "RejectedError";
  }
}
