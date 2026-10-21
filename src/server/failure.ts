import { z } from "zod";

import {
  DomainError,
  RejectedError,
  type ActionErrorCode,
  type Rejection,
} from "@/server/errors";
import { ForbiddenError } from "@/server/permissions";

/** Los textos de cada módulo para las causas que no traen mensaje propio. */
export type ActionMessages = {
  readonly forbidden: string;
  readonly unexpected: string;
};

/** Un error traducido: lo que responden una action y una herramienta del MCP. */
export type Failure<Code extends string> = {
  readonly code: Code | ActionErrorCode;
  readonly message: string;
  /** Solo con `rejected`: cada fila que impidió la operación en masa. */
  readonly rejections?: readonly Rejection<Code>[];
};

/**
 * D-MCP-9: la traducción de `handle`, para las actions y las herramientas. Un
 * error de dominio sale con su código y su texto; uno de permiso, con el texto
 * del módulo; uno de Zod, con su primer mensaje; cualquier otro, como
 * `unexpected`, y se registra.
 */
export function failureOf<Code extends string>(
  error: unknown,
  messages: ActionMessages,
): Failure<Code> {
  if (error instanceof DomainError) {
    const result = { code: error.code, message: error.message } as const;
    // `RejectedError` es un `DomainError`: sin reconocerlo acá, el rechazo
    // saldría sin la lista. Esta pregunta la resuelve antes de responder, que es
    // lo que pide el ADR 0011. Una rama propia, delante de esta, vería el código
    // `rejected` fuera de `Code` y obligaría a afirmar el tipo del resultado.
    return error instanceof RejectedError
      ? { ...result, rejections: error.rejections }
      : result;
  }
  if (error instanceof ForbiddenError) {
    return { code: "forbidden", message: messages.forbidden };
  }
  if (error instanceof z.ZodError) {
    const issue = error.issues.at(0);
    return { code: "validation", message: issue?.message ?? messages.unexpected };
  }
  console.error(error);
  return { code: "unexpected", message: messages.unexpected };
}
